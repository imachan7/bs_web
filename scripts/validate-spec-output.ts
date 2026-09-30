// 効果文→期待値レコードの出力を機械検査する（docs/design/EFFECT_SPEC_RULES.md）。
// 使い方: npx tsx scripts/validate-spec-output.ts <出力.json>... [--input <入力.json>]
import { readFileSync } from "node:fs"

type Vocab = Record<string, string[]>
const vocab = JSON.parse(readFileSync("data/spec/vocab.json", "utf8")) as Vocab

const args = process.argv.slice(2)
const inputIdx = args.indexOf("--input")
const inputPath = inputIdx >= 0 ? args[inputIdx + 1] : undefined
const files = args.filter((a, i) => a !== "--input" && i !== inputIdx + 1)

const problems: string[] = []
const bad = (where: string, msg: string): void => {
    problems.push(`${where}: ${msg}`)
}
const inList = (list: string[], v: unknown): boolean => typeof v === "string" && list.includes(v)

let clauseCount = 0
let unclassifiedCount = 0
for (const file of files) {
    let data: unknown
    try {
        data = JSON.parse(readFileSync(file, "utf8"))
    } catch (e) {
        bad(file, `JSON として読めない（${(e as Error).message.slice(0, 60)}）`)
        continue
    }
    if (!Array.isArray(data)) {
        bad(file, "最上位が配列でない")
        continue
    }
    if (inputPath) {
        const want = (JSON.parse(readFileSync(inputPath, "utf8")) as { id: string }[]).map((c) => c.id)
        const got = (data as { id: string }[]).map((c) => c.id)
        for (const id of want) if (!got.includes(id)) bad(file, `${id} が出力に無い`)
        for (const id of got) if (!want.includes(id)) bad(file, `${id} は入力に無い`)
    }
    for (const card of data as { id?: string; clauses?: any[] }[]) {
        if (!card.id || !Array.isArray(card.clauses) || card.clauses.length === 0) {
            bad(file, `${card.id ?? "?"}: id か clauses が無い`)
            continue
        }
        card.clauses.forEach((c, i) => {
            const where = `${card.id} 節${i + 1}`
            clauseCount++
            const un = c.unclassified
            if (un !== null && typeof un !== "string") bad(where, "unclassified が null でも文字列でもない")
            if (typeof un === "string" && un.length > 0) unclassifiedCount++
            const flagged = typeof un === "string" && un.length > 0
            if (typeof c.text !== "string" || c.text === "") bad(where, "text が無い")
            const t = c.trigger ?? {}
            if (!inList(vocab.triggerKinds!, t.kind)) bad(where, `trigger.kind が一覧外: ${t.kind}`)
            // 未分類として逃がした節は、値が一覧外でもよい（理由が書かれているため）
            if (t.event != null && !inList(vocab.events!, t.event) && !flagged) bad(where, `trigger.event が一覧外: ${t.event}`)
            if (t.subject != null && !inList(vocab.subjects!, t.subject)) bad(where, `trigger.subject が一覧外: ${t.subject}`)
            if (c.actor != null && !inList(vocab.actors!, c.actor)) bad(where, `actor が一覧外: ${c.actor}`)
            if (!inList(vocab.ops!, c.op) && !flagged) bad(where, `op が一覧外: ${c.op}`)
            if (!inList(vocab.links!, c.link)) bad(where, `link が一覧外: ${c.link}`)
            const ref = c.target?.ref
            if (!inList(vocab.targetRefs!, ref)) bad(where, `target.ref が一覧外: ${ref}`)
            if (vocab.opsWithoutTarget!.includes(c.op) && ref !== "none") bad(where, `op=${c.op} は対象を取らない（target.ref は none）: ${ref}`)
            if (t.kind === "field" && t.event == null) bad(where, "kind=field なのに event が無い")
            if (typeof c.optional !== "boolean") bad(where, "optional が真偽値でない")
        })
    }
}
console.log(`検査: ${files.length}ファイル / ${clauseCount}節 / 未分類 ${unclassifiedCount}節（${clauseCount ? Math.round((unclassifiedCount / clauseCount) * 100) : 0}%）`)
for (const p of problems) console.log(`❌ ${p}`)
console.log(problems.length === 0 ? "問題は見つかりませんでした ✅" : `${problems.length}件の問題`)
process.exit(problems.length === 0 ? 0 : 1)
