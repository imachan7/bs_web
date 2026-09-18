// 色別に実装した弾を1ファイル（data/cards/<弾>.json）へ結合する。使い方: npx tsx scripts/merge-set.ts BS15
//
// **なぜ分けているか**: 色ごとのバッチで実装するとき、同じ JSON を複数のエージェントが
// 同時に書くと壊れる。そこで各バッチは data/cards/<弾>-<色>.json に自分のぶんだけ書く。
// loadAllCards() は data/cards 配下の .json をすべて読むので、この状態でも検証コマンドは通る。
// 全色が揃ったらこのスクリプトで1つにまとめ、色別ファイルは消す
// （デッキビルダーのプール表示順が data/cards の並びに依存しているため、
//  最終形は Wiki の掲載順＝data/staging/<弾>.json の並びに揃える）。
import * as fs from "node:fs"
import * as path from "node:path"
import type { CardData } from "../server/src/type"

const set = process.argv[2]
if (!set) {
    console.log("使い方: npx tsx scripts/merge-set.ts BS15")
    process.exit(1)
}
const CARDS = path.resolve(__dirname, "../data/cards")
const STAGING = path.resolve(__dirname, "../data/staging")
const COLORS = ["red", "purple", "green", "white", "yellow", "blue"]

const order = (JSON.parse(fs.readFileSync(path.join(STAGING, `${set}.json`), "utf-8")) as CardData[]).map(
    (c) => c.cardId,
)

const byId = new Map<string, CardData>()
const missing: string[] = []
const fragments: string[] = []
for (const color of COLORS) {
    const p = path.join(CARDS, `${set}-${color}.json`)
    if (!fs.existsSync(p)) {
        missing.push(color)
        continue
    }
    fragments.push(p)
    for (const c of JSON.parse(fs.readFileSync(p, "utf-8")) as CardData[]) byId.set(c.cardId, c)
}
if (missing.length > 0) {
    console.log(`⚠️ 未着手の色: ${missing.join(" / ")}。全色そろってから実行すること`)
    process.exit(1)
}

// 他の弾のファイルに既にある cardId は取り込まない（重複すると loadAllCards が2枚返す。BS14 の SD06-007）
const existing = new Set<string>()
for (const f of fs.readdirSync(CARDS)) {
    if (!f.endsWith(".json") || f.startsWith(`${set}-`) || f === `${set}.json`) continue
    for (const c of JSON.parse(fs.readFileSync(path.join(CARDS, f), "utf-8")) as CardData[]) existing.add(c.cardId)
}
const merged = order.filter((id) => !existing.has(id) && byId.has(id)).map((id) => byId.get(id)!)
const unknown = [...byId.keys()].filter((id) => !order.includes(id))
if (unknown.length > 0) console.log(`⚠️ staging に無い cardId: ${unknown.join(", ")}`)
const notImplemented = order.filter((id) => !existing.has(id) && !byId.has(id))
if (notImplemented.length > 0) console.log(`⚠️ 色別ファイルに無い cardId: ${notImplemented.join(", ")}`)

fs.writeFileSync(path.join(CARDS, `${set}.json`), `${JSON.stringify(merged, null, 1)}\n`, "utf-8")
for (const p of fragments) fs.unlinkSync(p)
console.log(`${merged.length}枚を data/cards/${set}.json に結合し、色別ファイル${fragments.length}件を削除しました`)
