// 旧「選ぶ＋送る」の type（toHand／toDeck／recover*／summonFromTrashFree／castMagicFromTrashByColor／
// deployNexusFromTrashByFieldCores／reveal）を moveCards（と revealOpen）へ書き換える一回限りの移行。
// 読み替えはエンジンと同じ関数を使う。書式を崩さないよう、変わった効果のテキストだけを差し替える。
//   npx tsx scripts/migrate-move-cards.ts [--write] <dir>...
import * as fs from "node:fs"
import * as path from "node:path"
import type { CardData } from "../server/src/type"
import { migrateMoves } from "../server/src/logic/actions/legacyMoves"

const write = process.argv.includes("--write")
const dirs = process.argv.slice(2).filter((a) => !a.startsWith("--"))

// 文字列リテラルの中を飛ばして、start の "{" に対応する "}" の位置を返す
function matchBrace(t: string, start: number): number {
    let depth = 0
    for (let i = start; i < t.length; i++) {
        const ch = t[i]
        if (ch === '"') {
            for (i++; t[i] !== '"'; i++) if (t[i] === "\\") i++
            continue
        }
        if (ch === "{") depth++
        else if (ch === "}" && --depth === 0) return i
    }
    throw new Error("対応する } が無い")
}

let total = 0
const failed: string[] = []
for (const dir of dirs) {
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        const p = path.join(dir, f)
        let text = fs.readFileSync(p, "utf8")
        const cards = JSON.parse(text) as CardData[]
        let changed = 0
        for (const c of cards) {
            for (let k = 0; k < c.effects.length; k++) {
                const e = c.effects[k]!
                const next = migrateMoves(e)
                if (JSON.stringify(next) === JSON.stringify(e)) continue
                const hits = [...text.matchAll(new RegExp(`"id":\\s*"${e.id}"`, "g"))]
                const at = hits[0]?.index
                const open = at === undefined ? -1 : text.lastIndexOf("{", at)
                if (hits.length !== 1 || at === undefined || text.slice(open + 1, at).trim() !== "") {
                    failed.push(`${p} ${e.id}`)
                    continue
                }
                const close = matchBrace(text, open)
                const indent = /[ \t]*$/.exec(text.slice(0, open).split("\n").pop()!)![0]
                const body = JSON.stringify(next, null, 1).split("\n").join("\n" + indent)
                text = text.slice(0, open) + body + text.slice(close + 1)
                c.effects[k] = next
                changed++
            }
        }
        if (changed === 0) continue
        // 差し替えたテキストが意図どおりのデータになっているか
        if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(cards)) throw new Error(`${p}: 差し替え後のデータが一致しない`)
        total += changed
        console.log(`${p}: ${changed}件`)
        if (write) fs.writeFileSync(p, text)
    }
}
console.log(`合計 ${total}件${write ? "（書き込み済み）" : "（--write で書き込む）"}`)
if (failed.length > 0) console.log(`差し替えられなかった効果（id が見つからない・重複）:\n  ${failed.join("\n  ")}`)
