// 対象の候補に待機中のカードが混ざらないようにする検査。
// server/src/logic の field.spirits.filter( / field.nexuses.filter( を直書きしているのに、
// 同じ行に canBeTargeted も targetableSpirits/Nexuses も無い箇所は、数える・条件を見る・コスト支払いなど「候補ではない」と
// 判断したものだけを scripts/raw-candidates-allowlist.json（ファイル:関数名 → 理由）に載せる。
// 候補を列挙する新しいコードは targeting.ts の targetableSpirits/targetableNexuses を使うこと
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = join(__dirname, "..", "server", "src", "logic")
const ALLOW = join(__dirname, "raw-candidates-allowlist.json")
const PAT = /field\.(spirits|nexuses)\.filter\(/

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n)
        return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []
    })
}

function enclosing(lines: string[], i: number): string {
    for (let j = i; j >= 0; j--) {
        const line = lines[j] ?? ""
        const m = line.match(/^(?:export )?(?:async )?function (\w+)/) ?? line.match(/^(?:export )?const (\w+)\b/)
        if (m?.[1]) return m[1]
    }
    return "<top>"
}

const found = new Map<string, number>()
for (const f of walk(ROOT)) {
    const lines = readFileSync(f, "utf8").split("\n")
    lines.forEach((l, i) => {
        if (!PAT.test(l) || /canBeTargeted|targetable(Spirits|Nexuses)/.test(l)) return
        const key = `${relative(ROOT, f)}:${enclosing(lines, i)}`
        found.set(key, (found.get(key) ?? 0) + 1)
    })
}

if (process.argv.includes("--print")) {
    console.log(JSON.stringify(Object.fromEntries([...found.keys()].sort().map((k) => [k, ""])), null, 4))
    process.exit(0)
}

const allow: Record<string, string> = JSON.parse(readFileSync(ALLOW, "utf8"))
const unlisted = [...found.keys()].filter((k) => !(k in allow))
const stale = Object.keys(allow).filter((k) => !found.has(k))
if (unlisted.length > 0) {
    console.error("対象の候補に待機中のカードが混ざる恐れ（targetableSpirits/Nexuses を使うか、候補でない理由を allowlist に書く）:")
    for (const k of unlisted) console.error(`  ${k}`)
}
if (stale.length > 0) {
    console.error("allowlist に残っているが該当する直書きが無い（消す）:")
    for (const k of stale) console.error(`  ${k}`)
}
if (unlisted.length > 0 || stale.length > 0) process.exit(1)
console.log(`validate:candidates OK（直書き ${found.size} 関数、すべて allowlist 済み）`)
