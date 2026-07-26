// 効果エントリの実行時カバレッジ計測（npm run coverage:effects）
//
// 目的: **「実装されているが誰も通っていない経路」を実測で洗い出す**（HANDOFF_DESIGN.md §4.3）。
// 【激突】と turnStartResumeStep は、どちらも「実装済みなのにテストが一度も通っていない」形で
// 実バグを抱えていた。静的な棚卸し（cards.json を grep して機構の使用カードを探す）では
// **「カードは smoke に登場するのに、その効果エントリだけ一度も発火していない」**層が見えない。
// 例: Lv3 効果しか持たない行が、テストが Lv1 でしか召喚しないため無言で未検証のまま——という形。
//
// 仕組み:
//   1. HEAD の使い捨て worktree を作る（**共有ツリーには一切触らない**。実装担当と同じツリーを
//      共有しているため。未コミットの作業中変更は計測対象に入らない＝再現可能な基準になる）
//   2. その中だけで2箇所に計測コードを差し込む
//        - GameState.ts: カードマスタ読み込み直後に、各効果エントリ配下の action へ由来 id を刻む
//        - EffectModules.ts: resolveAction の実行直前に、その id を追記する
//      （createInstance にも刻んで「場に出たカード」を別に記録する）
//   3. smoke を1回走らせ、記録を cards.json 側の全エントリと突き合わせる
//   4. worktree を消す
//
// 差し込みは「1箇所だけ一致すること」を必ず検査する。エンジンの形が変わって差し込みに失敗したら
// **黙って全緑にならず、その場で落ちる**（計測そのものが no-op になる事故を防ぐ）。
import { execFileSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const REPO = path.resolve(__dirname, "..")

// action を持つ（＝resolveAction を通る）効果 kind。継続効果（aura / constraint / keywordGrant /
// costMod / globalConstraint 等）は走査側から読まれるだけで resolveAction を通らないため、
// この方式では測れない。対象外として明示的に除外する
const ACTION_BEARING_KINDS = new Set([
    "triggered",
    "magic",
    "step",
    "fieldEvent",
    "battleWon",
    "activated",
])

interface EffectEntry {
    cardId: string
    cardName: string
    eid: string
    kind: string
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

// cards.json から「resolveAction を通りうる効果エントリ」の一覧を作る
function loadEntries(): EffectEntry[] {
    const cards = JSON.parse(
        fs.readFileSync(path.join(REPO, "data/cards.json"), "utf-8"),
    ) as { cardId: string; name: string; effects?: { id?: string; kind?: string }[] }[]
    const entries: EffectEntry[] = []
    for (const c of cards) {
        const effects = c.effects ?? []
        for (let i = 0; i < effects.length; i++) {
            const e = effects[i]
            if (!e || !e.kind || !ACTION_BEARING_KINDS.has(e.kind)) continue
            const types: string[] = []
            collectActionTypes(e, types)
            entries.push({
                cardId: c.cardId,
                cardName: c.name,
                eid: e.id ?? `${c.cardId}#${i}`,
                kind: e.kind,
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
                `対象: ${needle.slice(0, 80)}…\n` +
                `エンジンの形が変わった可能性があります。scripts/coverage-effects.ts を追随させてください。`,
        )
    }
    fs.writeFileSync(file, body.replace(needle, replacement))
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

        // (1) カードマスタ読み込み直後に、各効果エントリ配下の action へ由来 id を刻む
        patch(
            path.join(tree, "server/src/logic/GameState.ts"),
            `export function getCard(cardId: string): CardData {`,
            `// [計測] 効果エントリ配下のすべての action オブジェクトに由来 id を刻む
const __covTag = (node: unknown, eid: string): void => {
    if (Array.isArray(node)) { for (const v of node) __covTag(v, eid); return }
    if (node === null || typeof node !== "object") return
    const obj = node as Record<string, unknown>
    if (typeof obj["type"] === "string") obj["__eid"] = eid
    for (const v of Object.values(obj)) __covTag(v, eid)
}
for (const [cardId, card] of CARD_DB) {
    const effects = (card.effects ?? []) as { id?: string }[]
    for (let i = 0; i < effects.length; i++) __covTag(effects[i], effects[i]?.id ?? cardId + "#" + i)
}

export function getCard(cardId: string): CardData {`,
        )

        // (2) 場に出たカードを記録する（「登場したのに発火していない」を切り分けるため）
        patch(
            path.join(tree, "server/src/logic/GameState.ts"),
            `let instanceSeq = 0`,
            `let instanceSeq = 0
// [計測] createInstance で場に出たカードIDを記録する
const __covOut = process.env["COV_OUT"]
export const __covRecord = (line: string): void => {
    if (__covOut !== undefined) { try { fs.appendFileSync(__covOut, line + "\\n") } catch { /* 計測失敗は無視 */ } }
}`,
        )
        // (3) resolveAction の実行直前に、刻んだ id を追記する
        patch(
            path.join(tree, "server/src/logic/EffectModules.ts"),
            `    const handler = ACTION_HANDLERS[action.type] as (c: ActionCtx, a: EffectAction) => void`,
            `    // [計測] この action がどの効果エントリ由来かを記録する
    __covRecord("act\\t" + String((action as unknown as Record<string, unknown>)["__eid"] ?? "?") + "\\t" + action.type)
    const handler = ACTION_HANDLERS[action.type] as (c: ActionCtx, a: EffectAction) => void`,
        )
        // createInstance 本体の先頭に「場に出たカード」の記録を挿す
        // （引数リストが複数行なので、関数名の後の "):" 以降の最初の "{" を本体開始とみなす）
        const gsPath = path.join(tree, "server/src/logic/GameState.ts")
        const gs = fs.readFileSync(gsPath, "utf-8")
        const ciIdx = gs.indexOf("export function createInstance(")
        if (ciIdx < 0) throw new Error("createInstance が見つかりません（計測コードを追随させてください）")
        const bodyStart = gs.indexOf("{", gs.indexOf("):", ciIdx))
        if (bodyStart < 0) throw new Error("createInstance の本体開始位置を特定できません")
        fs.writeFileSync(
            gsPath,
            gs.slice(0, bodyStart + 1) +
                `\n    __covRecord("inst\\t" + cardId)` +
                gs.slice(bodyStart + 1),
        )
        // EffectModules 側で __covRecord を使うための import 追記
        patch(
            path.join(tree, "server/src/logic/EffectModules.ts"),
            `    minLevelCores,`,
            `    minLevelCores,\n    __covRecord,`,
        )

        execFileSync("npx", ["tsx", "scripts/smoke.ts", "--quiet"], {
            cwd: tree,
            env: { ...process.env, COV_OUT: outFile },
            stdio: "pipe",
        })

        const firedEids = new Set<string>()
        const firedTypes = new Set<string>()
        const instantiated = new Set<string>()
        let unknownEid = 0
        for (const line of fs.readFileSync(outFile, "utf-8").split("\n")) {
            const [tag, a, b] = line.split("\t")
            if (tag === "act") {
                if (a === "?" || a === undefined) unknownEid++
                else firedEids.add(a)
                if (b !== undefined) firedTypes.add(b)
            } else if (tag === "inst" && a !== undefined) {
                instantiated.add(a)
            }
        }
        if (firedEids.size === 0) {
            throw new Error("記録が空です。計測コードの差し込みが効いていません（no-op 事故）")
        }

        report(entries, firedEids, firedTypes, instantiated, unknownEid)
    } finally {
        try {
            execFileSync("git", ["worktree", "remove", "--force", tree], { cwd: REPO, stdio: "pipe" })
        } catch {
            /* 後片付けの失敗は本題ではない */
        }
        fs.rmSync(work, { recursive: true, force: true })
    }
}

function report(
    entries: EffectEntry[],
    firedEids: Set<string>,
    firedTypes: Set<string>,
    instantiated: Set<string>,
    unknownEid: number,
): void {
    const fired = entries.filter((e) => firedEids.has(e.eid))
    const notFired = entries.filter((e) => !firedEids.has(e.eid))
    const pct = ((fired.length / entries.length) * 100).toFixed(1)

    console.log(`効果エントリ（action を持つ kind のみ）: ${entries.length}件`)
    console.log(`  smoke で実行された: ${fired.length}件（${pct}%）`)
    console.log(`  一度も実行されていない: ${notFired.length}件`)
    if (unknownEid > 0) {
        console.log(`  ※ 由来 id を特定できなかった実行: ${unknownEid}件（テストが直接組んだ action）`)
    }

    // ★ 最重要: 場に出ている（＝テストに登場する）のに、その効果だけ発火していないもの。
    // 「カードごと未登場」は単に未テストなだけだが、こちらは**通っているつもりで通っていない**形
    const silent = notFired.filter((e) => instantiated.has(e.cardId))
    console.log(`\n★ 場に出ているのに一度も発火していない効果: ${silent.length}件`)
    for (const e of silent.slice(0, 40)) {
        console.log(`  ${e.cardId} ${e.cardName} [${e.kind}] ${e.eid} → ${e.actionTypes.join(", ")}`)
    }
    if (silent.length > 40) console.log(`  …ほか${silent.length - 40}件`)

    // action.type 単位で一度も実行されていない機構（静的棚卸しの実測版）
    const allTypes = new Set<string>()
    for (const e of entries) for (const t of e.actionTypes) allTypes.add(t)
    const deadTypes = [...allTypes].filter((t) => !firedTypes.has(t)).sort()
    console.log(`\n一度も実行されていない action.type: ${deadTypes.length}種`)
    for (const t of deadTypes) {
        const users = entries.filter((e) => e.actionTypes.includes(t)).map((e) => e.cardId)
        console.log(`  ${t}（使用: ${users.slice(0, 4).join(", ")}${users.length > 4 ? " ほか" : ""}）`)
    }

    console.log(
        `\n※ 継続効果（aura / constraint / keywordGrant / costMod / globalConstraint 等）は` +
            `resolveAction を通らないため、この計測の対象外です。`,
    )
}

main()
