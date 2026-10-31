// 効果エントリの実行時カバレッジ計測（npm run coverage:effects）
//
// 目的: **「実装されているが誰も通っていない経路」を実測で洗い出す**。
// 【激突】と turnStartResumeStep は、どちらも「実装済みなのにテストが一度も通っていない」形で
// 実バグを抱えていた。静的な棚卸しでは**「カードは smoke に登場するのに、その効果エントリだけ
// 一度も発火していない」**層が見えない（例: Lv3 効果しか持たない行を、テストが Lv1 でしか召喚しない）。
// 実績: この計測で returnSelfToHand（実行実績0）を発見し、part71 §C で塞いだ。
//
// 仕組み: エンジンの「効果が効いた所」に shared/coverage.ts の noteCoverage 等が1行ずつ書いてある。
// COV_OUT を付けて smoke を流すと、server/src/logic/coverageRecorder.ts が記録先を差して書き出す。
// **作業ツリーをそのまま測る**（未コミットの変更も入る。2026-10-16 ユーザー了承。
// 以前は HEAD の worktree へ正規表現でコードを差し込んでいて、エンジンの整形で壊れていた）
import { execFileSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { loadAllCards } from "../data/loadCards"

const REPO = path.resolve(__dirname, "..")

// action を持つ（＝resolveAction を通り、noteAction が由来を記録する）効果 kind
const ACTION_BEARING_KINDS = new Set([
    "triggered",
    "magic",
    "step",
    "fieldEvent",
    "battleWon",
    "activated",
    // 付与された誘発効果の action に付与元の __eid が刻まれるので、noteAction がそのまま拾う
    "effectGrant",
])

// 計測点のある継続効果の kind。エンジンのソースに書かれた noteCoverage(…, "kind") の集合
export function measuredKinds(): Set<string> {
    const kinds = new Set<string>()
    const walk = (dir: string): void => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, ent.name)
            if (ent.isDirectory()) walk(full)
            else if (ent.name.endsWith(".ts") && full !== path.join(REPO, "shared/coverage.ts")) {
                const text = fs.readFileSync(full, "utf-8")
                for (const m of text.matchAll(/\bnote(?:Coverage|GrantedFrom)\(.*, "(\w+)"\)/g)) kinds.add(m[1]!)
                if (/\bnoteKeyword\(/.test(text)) kinds.add("keyword")
            }
        }
    }
    walk(path.join(REPO, "server/src"))
    walk(path.join(REPO, "shared"))
    return kinds
}

const MEASURED_KINDS = measuredKinds()

// カードデータにあるのに計測点が1つも無い kind（smoke の part160 が 0 件であることを確かめる）
export function unmeasuredKinds(): string[] {
    return [...new Set(loadEntries().filter((e) => e.measurability === "unmeasured").map((e) => e.kind))].sort()
}

type Measurability = "action" | "continuous" | "unmeasured"

interface EffectEntry {
    cardId: string
    cardName: string
    eid: string
    kind: string
    measurability: Measurability
    actionTypes: string[]
}

// EffectAction の type 一覧。timedEffect.content の要素（bp・keyword・mustAttack 等の TimedContent）や
// playerRule の中身も `type` を持つが、resolveAction を通らないので action としては数えない
// （数えると「一度も実行されていない action.type」に常に載る誤検出になる）
const ACTION_TYPES: Set<string> = new Set(
    [...fs.readFileSync(path.join(REPO, "server/src/types/effectAction.ts"), "utf-8").matchAll(/\btype: "([a-zA-Z0-9_]+)"/g)].map(
        (m) => m[1]!,
    ),
)

function collectActionTypes(node: unknown, out: string[]): void {
    if (Array.isArray(node)) {
        for (const v of node) collectActionTypes(v, out)
        return
    }
    if (node === null || typeof node !== "object") return
    const obj = node as Record<string, unknown>
    if (typeof obj["type"] === "string" && ACTION_TYPES.has(obj["type"])) out.push(obj["type"])
    for (const v of Object.values(obj)) collectActionTypes(v, out)
}

function loadEntries(): EffectEntry[] {
    const cards = loadAllCards() as unknown as {
        cardId: string
        name: string
        effects?: { id?: string; kind?: string }[]
    }[]
    const entries: EffectEntry[] = []
    for (const c of cards) {
        const effects = c.effects ?? []
        for (let i = 0; i < effects.length; i++) {
            const e = effects[i]
            if (!e || !e.kind) continue
            const measurability: Measurability = ACTION_BEARING_KINDS.has(e.kind)
                ? "action"
                : MEASURED_KINDS.has(e.kind)
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

function main(): void {
    const entries = loadEntries()
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "bsweb-cov-"))
    const outFile = path.join(work, "records.txt")

    try {
        execFileSync("npx", ["tsx", "scripts/smoke.ts", "--quiet"], {
            cwd: REPO,
            env: { ...process.env, COV_OUT: outFile },
            stdio: "pipe",
        })
        if (!fs.existsSync(outFile)) throw new Error("記録ファイルが出ていません（coverageRecorder が記録先を差せていない）")

        const firedEids = new Set<string>()
        const firedTypes = new Set<string>()
        // カードデータ由来（id が刻まれている）で実行された action.type。
        // テストが手で組んだ action（id なし）だけで動いている型は、
        // 「機構は通っているがカードのデータ経由では一度も通っていない」＝データ側が未検証
        const firedTypesFromCards = new Set<string>()
        const directOnlyTypes = new Set<string>()
        const instantiated = new Set<string>()
        const badKinds: string[] = []
        const tags = new Set<string>()
        for (const line of fs.readFileSync(outFile, "utf-8").split("\n")) {
            const [tag, a, b] = line.split("\t")
            if (tag !== undefined) tags.add(tag)
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
            } else if (tag === "bad") {
                badKinds.push(`noteCoverage に "${a}" と書いてあるが、渡された効果の kind は "${b}"`)
            }
        }
        if (badKinds.length > 0) throw new Error("計測点の kind が食い違っています:\n" + badKinds.join("\n"))
        // 系統が1つでも欠けていたら、その計測点が丸ごと no-op になっている
        // （一部だけ生きていると「実行実績0」の山として現れ、実装漏れの誤報になる。2026-08-08 に実際に発生）
        for (const t of ["act", "cont", "inst"]) {
            if (!tags.has(t)) throw new Error(`記録に ${t} が1件もありません（計測点が効いていない）`)
        }

        report(entries, firedEids, firedTypes, firedTypesFromCards, instantiated, directOnlyTypes)
    } finally {
        fs.rmSync(work, { recursive: true, force: true })
    }
}

// 未実行のエントリの基準（npm run coverage:check / coverage:update）。
// データの移行で、全カードを発火させるテストが場面を組めずに黙って飛ばすと、smoke は全緑のまま発火が減る（2026-10-31 に28件）。
// 基準より増えた未実行だけを落とす。part190 は手札をシャッフルするので、1件だけの増減はまず再実行する
const BASELINE = path.join(REPO, "data", "coverage-baseline.json")
function checkBaseline(notFired: string[]): void {
    const now = [...new Set(notFired)].sort()
    if (process.argv.includes("--update")) {
        fs.writeFileSync(BASELINE, JSON.stringify(now, null, 2) + "\n")
        console.log(`\n基準を更新しました（未実行 ${now.length}件）: ${path.relative(REPO, BASELINE)}`)
        return
    }
    if (!process.argv.includes("--check")) return
    const base = new Set<string>(JSON.parse(fs.readFileSync(BASELINE, "utf8")))
    const added = now.filter((e) => !base.has(e))
    const gone = [...base].filter((e) => !now.includes(e))
    if (gone.length > 0) console.log(`\n基準より減った未実行 ${gone.length}件（npm run coverage:update で縮める）: ${gone.join(" ")}`)
    if (added.length > 0) {
        console.log(`\n❌ 基準より増えた未実行 ${added.length}件: ${added.join(" ")}`)
        process.exitCode = 1
    } else console.log(`\n✅ 未実行は基準の範囲内（${now.length}件）`)
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
    // 未計測＝計測点が無いので「発火したか分からない」層。
    // 2026-07-30 時点では0件だったが、その後に追加された kind には計測点が付いていない。
    // **数だけでは何が見えていないのか分からない**ので kind 別に出す（2026-08-24）
    console.log(`  継続効果（未計測の kind）: ${unmeasured.length}件 ※ 計測点が無く、発火したか分からない層`)
    if (unmeasured.length > 0) {
        const kinds = new Map<string, string[]>()
        for (const e of unmeasured) {
            const list = kinds.get(e.kind) ?? []
            if (list.length < 2) list.push(`${e.cardId} ${e.cardName}`)
            kinds.set(e.kind, list)
        }
        const sorted = [...kinds.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        console.log(`    （${sorted.length}種）計測点を足せば、この層も「書いたが一度も発火していない」を検出できる:`)
        for (const [kind, sample] of sorted) {
            console.log(`      ${kind.padEnd(34)} 例: ${sample.join(" / ")}`)
        }
    }

    // 未適用の内訳（kind 別）。どの層が薄いのかを一目で見るため
    const byKind = (list: EffectEntry[]): string => {
        const c = new Map<string, number>()
        for (const e of list) c.set(e.kind, (c.get(e.kind) ?? 0) + 1)
        return [...c.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => `${k}=${n}`)
            .join(" / ")
    }
    console.log(`  未実行の内訳: ${byKind([...notFiredAction, ...notFiredCont])}`)
    checkBaseline([...notFiredAction, ...notFiredCont].map((e) => e.eid))

    // ★ 最重要: 場に出ている（＝テストに登場する）のに、その効果だけ発火していないもの。
    // 「カードごと未登場」は単に未テストなだけだが、こちらは**通っているつもりで通っていない**形。
    // kind ごとにまとめて出す（全件を並べると読めないため、各 kind 先頭8件まで。--all で全件）
    const showAll = process.argv.includes("--all")
    const silent = [...notFiredAction, ...notFiredCont].filter((e) => instantiated.has(e.cardId))
    console.log(`\n★ 場に出ているのに一度も適用されていない効果: ${silent.length}件（${byKind(silent)}）`)
    const kinds = [...new Set(silent.map((e) => e.kind))]
    for (const kind of kinds) {
        const list = silent.filter((e) => e.kind === kind)
        console.log(`  [${kind}] ${list.length}件`)
        for (const e of showAll ? list : list.slice(0, 8)) {
            const detail = e.actionTypes.length > 0 ? ` → ${e.actionTypes.join(", ")}` : ""
            console.log(`    ${e.cardId} ${e.cardName} ${e.eid}${detail}`)
        }
        if (!showAll && list.length > 8) console.log(`    …ほか${list.length - 8}件（全件は --all）`)
    }

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

// 直接実行されたときだけ計測を走らせる（unmeasuredKinds を import する smoke 側で main() が動かないように）
if (require.main === module) main()
