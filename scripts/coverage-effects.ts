// 効果エントリの実行時カバレッジ計測（npm run coverage:effects）
//
// 目的: **「実装されているが誰も通っていない経路」を実測で洗い出す**（HANDOFF_DESIGN.md §4.3）。
// 【激突】と turnStartResumeStep は、どちらも「実装済みなのにテストが一度も通っていない」形で
// 実バグを抱えていた。静的な棚卸し（cards.json を grep して機構の使用カードを探す）では
// **「カードは smoke に登場するのに、その効果エントリだけ一度も発火していない」**層が見えない。
// 例: Lv3 効果しか持たない行が、テストが Lv1 でしか召喚しないため無言で未検証のまま——という形。
// 実績: この計測で returnSelfToHand（実行実績0）を発見し、part71 §C で塞いだ。
//
// 仕組み:
//   1. HEAD の使い捨て worktree を作る（**共有ツリーには一切触らない**。実装担当と同じツリーを
//      共有しているため。未コミットの作業中変更は計測対象に入らない＝再現可能な基準になる）
//   2. その中だけに計測コードを差し込む（下記の PATCH 一覧）
//   3. smoke を1回走らせ、記録を cards.json 側の全エントリと突き合わせる
//   4. worktree を消す
//
// 差し込みは「1箇所だけ一致すること」を必ず検査する。エンジンの形が変わって差し込みに失敗したら
// **黙って全緑にならず、その場で落ちる**（計測そのものが no-op になる事故を防ぐ）。
//
// 記録は「一度でも通ったか」だけを見るので、**Set に入れて重複を捨てる**（hasKeyword のような
// 高頻度の経路を1件ずつ書き出すと計測が重くなるため）。書き出しはプロセス終了時に1回。
import { execFileSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const REPO = path.resolve(__dirname, "..")

// action を持つ（＝resolveAction を通る）効果 kind
const ACTION_BEARING_KINDS = new Set([
    "triggered",
    "magic",
    "step",
    "fieldEvent",
    "battleWon",
    "activated",
])

// 継続効果のうち**この計測が対応済み**の kind（走査側に計測点を入れたもの）。
//   aura           → effectiveBp（全37件が aura.type:"bp" なのでこれで網羅できる）
//   constraint     → activeConstraints
//   keyword        → hasKeyword（静的キーワード判定）
//   reviveOnDestroy→ tryReviveOnDestroy（実際に復活が確定した時点）
// これ以外の継続 kind（keywordGrant / costMod / globalConstraint / levelAs / reductionGrant …）は
// 走査点がそれぞれ別なので未対応。**測れていないものを「カバー済み」と誤読しないよう、
// 集計から明示的に外して「未計測」として件数だけ出す**
const MEASURED_CONTINUOUS_KINDS = new Set(["aura", "constraint", "keyword", "reviveOnDestroy"])

type Measurability = "action" | "continuous" | "unmeasured"

interface EffectEntry {
    cardId: string
    cardName: string
    eid: string
    kind: string
    measurability: Measurability
    actionTypes: string[]
}

function collectActionTypes(node: unknown, out: string[]): void {
    if (Array.isArray(node)) {
        for (const v of node) collectActionTypes(v, out)
        return
    }
    if (node === null || typeof node !== "object") return
    const obj = node as Record<string, unknown>
    if (typeof obj["type"] === "string") out.push(obj["type"])
    for (const v of Object.values(obj)) collectActionTypes(v, out)
}

function loadEntries(): EffectEntry[] {
    const cards = JSON.parse(
        fs.readFileSync(path.join(REPO, "data/cards.json"), "utf-8"),
    ) as { cardId: string; name: string; effects?: { id?: string; kind?: string }[] }[]
    const entries: EffectEntry[] = []
    for (const c of cards) {
        const effects = c.effects ?? []
        for (let i = 0; i < effects.length; i++) {
            const e = effects[i]
            if (!e || !e.kind) continue
            const measurability: Measurability = ACTION_BEARING_KINDS.has(e.kind)
                ? "action"
                : MEASURED_CONTINUOUS_KINDS.has(e.kind)
                  ? "continuous"
                  : "unmeasured"
            const types: string[] = []
            collectActionTypes(e, types)
            entries.push({
                cardId: c.cardId,
                cardName: c.name,
                eid: e.id ?? `${c.cardId}#${i}`,
                kind: e.kind,
                measurability,
                actionTypes: [...new Set(types)],
            })
        }
    }
    return entries
}

function patch(file: string, needle: string, replacement: string): void {
    const body = fs.readFileSync(file, "utf-8")
    const hits = body.split(needle).length - 1
    if (hits !== 1) {
        throw new Error(
            `計測コードの差し込み先が1箇所に定まりません（${hits}箇所）: ${path.basename(file)}\n` +
                `対象: ${needle.slice(0, 100)}…\n` +
                `エンジンの形が変わった可能性があります。scripts/coverage-effects.ts を追随させてください。`,
        )
    }
    fs.writeFileSync(file, body.replace(needle, replacement))
}

// server 側（GameState / EffectModules）とは別に、shared/ 用の記録器を用意する。
// shared/ は node:fs や server/ に依存しない設計なので、計測用の依存を持ち込まず
// **この worktree の中だけで**自前の記録器を定義し、別ファイルへ書き出す
function instrumentShared(tree: string, out: string): void {
    const f = path.join(tree, "shared/rules.ts")
    const header = `// [計測] 継続効果の適用を記録する（coverage-effects.ts が差し込む。共有ツリーには存在しない）
const __covSet2 = new Set<string>()
const __covRec2 = (line: string): void => { __covSet2.add(line) }
process.on("exit", () => {
    try { require("fs").writeFileSync(${JSON.stringify(out + ".shared")}, [...__covSet2].join("\\n")) } catch { /* 計測失敗は無視 */ }
})
const __covEid = (e: unknown): string =>
    String((e as Record<string, unknown> | null)?.["__eid"] ?? "?")

`
    fs.writeFileSync(f, header + fs.readFileSync(f, "utf-8"))

    // aura: effectiveBp が実際に加算する時点（全フィルタ通過後）
    patch(
        f,
        `                total += auraAmount(board, pid, effect.aura)`,
        `                __covRec2("cont\\t" + __covEid(effect))
                total += auraAmount(board, pid, effect.aura)`,
    )
    // constraint: activeConstraints が自身の制約として採用する時点
    patch(
        f,
        `        .map((e) => (e as { constraint: ConstraintDef }).constraint)`,
        `        .map((e) => { __covRec2("cont\\t" + __covEid(e)); return (e as { constraint: ConstraintDef }).constraint })`,
    )
    // keyword: 静的キーワード判定が true を返す時点
    patch(
        f,
        `    return card(cardId).effects.some((e) => e.kind === "keyword" && e.keyword === keyword)`,
        `    return card(cardId).effects.some((e) => {
        if (e.kind !== "keyword" || e.keyword !== keyword) return false
        __covRec2("cont\\t" + __covEid(e))
        return true
    })`,
    )
}

function main(): void {
    const entries = loadEntries()
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "bsweb-cov-"))
    const tree = path.join(work, "tree")
    const outFile = path.join(work, "records.txt")

    try {
        execFileSync("git", ["worktree", "add", "--detach", tree, "HEAD"], {
            cwd: REPO,
            stdio: "pipe",
        })
        fs.symlinkSync(path.join(REPO, "node_modules"), path.join(tree, "node_modules"))

        // (1) カードマスタ読み込み直後に、各効果エントリと配下の action へ由来 id を刻む。
        //     継続効果はエントリ自身に、action を持つ効果は配下の action オブジェクトにも刻む
        patch(
            path.join(tree, "server/src/logic/GameState.ts"),
            `export function getCard(cardId: string): CardData {`,
            `// [計測] 効果エントリとその配下の action オブジェクトに由来 id を刻む
const __covTag = (node: unknown, eid: string): void => {
    if (Array.isArray(node)) { for (const v of node) __covTag(v, eid); return }
    if (node === null || typeof node !== "object") return
    const obj = node as Record<string, unknown>
    obj["__eid"] = eid
    for (const v of Object.values(obj)) __covTag(v, eid)
}
for (const [cardId, card] of CARD_DB) {
    const effects = (card.effects ?? []) as { id?: string }[]
    for (let i = 0; i < effects.length; i++) __covTag(effects[i], effects[i]?.id ?? cardId + "#" + i)
}

export function getCard(cardId: string): CardData {`,
        )

        // (2) 記録器（重複は Set で捨て、プロセス終了時に1回だけ書き出す）
        patch(
            path.join(tree, "server/src/logic/GameState.ts"),
            `let instanceSeq = 0`,
            `let instanceSeq = 0
// [計測] 実行された効果エントリと、場に出たカードを記録する
const __covOut = process.env["COV_OUT"]
const __covSet = new Set<string>()
export const __covRecord = (line: string): void => { __covSet.add(line) }
process.on("exit", () => {
    if (__covOut !== undefined) {
        try { fs.writeFileSync(__covOut, [...__covSet].join("\\n")) } catch { /* 計測失敗は無視 */ }
    }
})`,
        )

        // (3) resolveAction: どの効果エントリ由来の action かを記録する
        patch(
            path.join(tree, "server/src/logic/EffectModules.ts"),
            `    const handler = ACTION_HANDLERS[action.type] as (c: ActionCtx, a: EffectAction) => void`,
            `    // [計測] この action がどの効果エントリ由来か
    __covRecord("act\\t" + String((action as unknown as Record<string, unknown>)["__eid"] ?? "?") + "\\t" + action.type)
    const handler = ACTION_HANDLERS[action.type] as (c: ActionCtx, a: EffectAction) => void`,
        )

        // (4) reviveOnDestroy: 実際に復活が確定した時点。
        //     **経路は2つある**（inst 自身が持つ reviveOnDestroy と、フィールドの他カード由来）。
        //     インデントで区別して両方に入れる（片方だけだと「復活したのに未計測」が出る）
        for (const indent of ["        ", "            "]) {
            patch(
                path.join(tree, "server/src/logic/EffectModules.ts"),
                `${indent}const name = getCard(inst.cardId).name\n${indent}applyRevived(effect.revived)`,
                `${indent}const name = getCard(inst.cardId).name\n` +
                    `${indent}__covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))\n` +
                    `${indent}applyRevived(effect.revived)`,
            )
        }

        // (5) EffectModules 側で __covRecord を使うための import 追記
        patch(
            path.join(tree, "server/src/logic/EffectModules.ts"),
            `    minLevelCores,`,
            `    minLevelCores,\n    __covRecord,`,
        )

        // (6) createInstance 本体の先頭に「場に出たカード」の記録を挿す
        //     （引数リストが複数行なので、関数名の後の "):" 以降の最初の "{" を本体開始とみなす）
        const gsPath = path.join(tree, "server/src/logic/GameState.ts")
        const gs = fs.readFileSync(gsPath, "utf-8")
        const ciIdx = gs.indexOf("export function createInstance(")
        if (ciIdx < 0) throw new Error("createInstance が見つかりません（計測コードを追随させてください）")
        const bodyStart = gs.indexOf("{", gs.indexOf("):", ciIdx))
        if (bodyStart < 0) throw new Error("createInstance の本体開始位置を特定できません")
        fs.writeFileSync(
            gsPath,
            gs.slice(0, bodyStart + 1) + `\n    __covRecord("inst\\t" + cardId)` + gs.slice(bodyStart + 1),
        )

        // (7) 継続効果（aura / constraint / keyword）は shared/ 側に計測点を入れる
        instrumentShared(tree, outFile)

        execFileSync("npx", ["tsx", "scripts/smoke.ts", "--quiet"], {
            cwd: tree,
            env: { ...process.env, COV_OUT: outFile },
            stdio: "pipe",
        })

        const firedEids = new Set<string>()
        const firedTypes = new Set<string>()
        // カードデータ由来（id が刻まれている）で実行された action.type。
        // テストが手で組んだ action（id なし）だけで動いている型は、
        // 「機構は通っているがカードのデータ経由では一度も通っていない」＝データ側が未検証
        const firedTypesFromCards = new Set<string>()
        const directOnlyTypes = new Set<string>()
        const instantiated = new Set<string>()

        const readRecords = (file: string): string[] =>
            fs.existsSync(file) ? fs.readFileSync(file, "utf-8").split("\n") : []
        for (const line of [...readRecords(outFile), ...readRecords(outFile + ".shared")]) {
            const [tag, a, b] = line.split("\t")
            if (tag === "act") {
                if (a === "?" || a === undefined) {
                    if (b !== undefined) directOnlyTypes.add(b)
                } else {
                    firedEids.add(a)
                    if (b !== undefined) firedTypesFromCards.add(b)
                }
                if (b !== undefined) firedTypes.add(b)
            } else if (tag === "cont" && a !== undefined && a !== "?") {
                firedEids.add(a)
            } else if (tag === "inst" && a !== undefined) {
                instantiated.add(a)
            }
        }
        if (firedEids.size === 0) {
            throw new Error("記録が空です。計測コードの差し込みが効いていません（no-op 事故）")
        }

        report(entries, firedEids, firedTypes, firedTypesFromCards, instantiated, directOnlyTypes)
    } finally {
        try {
            execFileSync("git", ["worktree", "remove", "--force", tree], { cwd: REPO, stdio: "pipe" })
        } catch {
            /* 後片付けの失敗は本題ではない */
        }
        fs.rmSync(work, { recursive: true, force: true })
    }
}

function summarize(label: string, entries: EffectEntry[], firedEids: Set<string>): EffectEntry[] {
    const notFired = entries.filter((e) => !firedEids.has(e.eid))
    const fired = entries.length - notFired.length
    const pct = entries.length === 0 ? "-" : ((fired / entries.length) * 100).toFixed(1)
    console.log(`${label}: ${entries.length}件中 ${fired}件が実行済み（${pct}%）／未実行 ${notFired.length}件`)
    return notFired
}

function report(
    entries: EffectEntry[],
    firedEids: Set<string>,
    firedTypes: Set<string>,
    firedTypesFromCards: Set<string>,
    instantiated: Set<string>,
    directOnlyTypes: Set<string>,
): void {
    const actionEntries = entries.filter((e) => e.measurability === "action")
    const contEntries = entries.filter((e) => e.measurability === "continuous")
    const unmeasured = entries.filter((e) => e.measurability === "unmeasured")

    console.log(`効果エントリ 総数 ${entries.length}件`)
    const notFiredAction = summarize("  action を持つ効果", actionEntries, firedEids)
    const notFiredCont = summarize("  継続効果（計測対応済み）", contEntries, firedEids)
    console.log(
        `  継続効果（未計測の kind）: ${unmeasured.length}件 ` +
            `※ keywordGrant / costMod / globalConstraint / levelAs 等。走査点が別なので**測れていない**`,
    )

    // ★ 最重要: 場に出ている（＝テストに登場する）のに、その効果だけ発火していないもの。
    // 「カードごと未登場」は単に未テストなだけだが、こちらは**通っているつもりで通っていない**形
    const silent = [...notFiredAction, ...notFiredCont].filter((e) => instantiated.has(e.cardId))
    console.log(`\n★ 場に出ているのに一度も適用されていない効果: ${silent.length}件`)
    for (const e of silent.slice(0, 40)) {
        const detail = e.actionTypes.length > 0 ? ` → ${e.actionTypes.join(", ")}` : ""
        console.log(`  ${e.cardId} ${e.cardName} [${e.kind}] ${e.eid}${detail}`)
    }
    if (silent.length > 40) console.log(`  …ほか${silent.length - 40}件`)

    // action.type 単位の機構カバレッジ。2段階で見る:
    //   (a) 一度も実行されていない＝機構そのものが未検証（【激突】と同型。最優先）
    //   (b) テストが手で組んだ action でしか実行されていない＝**カードデータ経由が未検証**
    //       （effects の書き方の誤り——レベル指定漏れ・フィルタの取り違え——はここでしか出ない）
    const allTypes = new Set<string>()
    for (const e of actionEntries) for (const t of e.actionTypes) allTypes.add(t)
    const usersOf = (t: string): string[] =>
        actionEntries.filter((e) => e.actionTypes.includes(t)).map((e) => e.cardId)
    const deadTypes = [...allTypes].filter((t) => !firedTypes.has(t)).sort()
    const onlyDirect = [...allTypes].filter((t) => firedTypes.has(t) && !firedTypesFromCards.has(t)).sort()

    console.log(`\n(a) 一度も実行されていない action.type: ${deadTypes.length}種`)
    for (const t of deadTypes) {
        const u = usersOf(t)
        console.log(`  ${t}（使用: ${u.slice(0, 4).join(", ")}${u.length > 4 ? " ほか" : ""}）`)
    }
    console.log(
        `\n(b) テストが手で組んだ action でしか実行されていない（カードデータ経由が未検証）: ${onlyDirect.length}種`,
    )
    for (const t of onlyDirect) {
        const u = usersOf(t)
        console.log(`  ${t}（使用: ${u.slice(0, 4).join(", ")}${u.length > 4 ? " ほか" : ""}）`)
    }
    if (directOnlyTypes.size > 0) {
        console.log(
            `\n（参考）テストが手で組んだ action の種類数: ${directOnlyTypes.size}種` +
                `——カードに載っていない action をテストが直接叩いた分`,
        )
    }
}

main()
