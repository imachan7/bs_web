// BS14 の色別フラグメント（data/staging/BS14-<色>.json）を結合して data/cards/BS14.json を作る。
//
// **なぜ分けているか**: 121種を色ごとのバッチで実装するとき、同じ JSON を複数のエージェントが
// 同時に書くと壊れるため、各バッチは自分の色ぶんの配列だけを staging に書く。
// 結合順は staging/BS14.json の並び（＝Wiki の掲載順）に合わせる。デッキビルダーのプール表示順が
// data/cards の並びに依存しているため（data/loadCards.ts）。
import * as fs from "node:fs"
import * as path from "node:path"
import type { CardData } from "../server/src/type"

const STAGING = path.resolve(__dirname, "../data/staging")
const COLORS = ["red", "purple", "green", "white", "yellow", "blue"]

const order = (JSON.parse(fs.readFileSync(path.join(STAGING, "BS14.json"), "utf-8")) as CardData[])
    .map((c) => c.cardId)

const byId = new Map<string, CardData>()
const missing: string[] = []
for (const color of COLORS) {
    const p = path.join(STAGING, `BS14-${color}.json`)
    if (!fs.existsSync(p)) {
        missing.push(color)
        continue
    }
    for (const c of JSON.parse(fs.readFileSync(p, "utf-8")) as CardData[]) byId.set(c.cardId, c)
}
if (missing.length > 0) {
    console.log(`⚠️ 未着手の色: ${missing.join(" / ")}（そのぶんは結合に含まれない）`)
}

// SD06-007 は SD06.json に既にあるので取り込まない（重複すると loadAllCards が2枚返す）
const merged = order.filter((id) => id !== "SD06-007" && byId.has(id)).map((id) => byId.get(id)!)
const out = path.resolve(__dirname, "../data/cards/BS14.json")
fs.writeFileSync(out, `${JSON.stringify(merged, null, 1)}\n`, "utf-8")
console.log(`${merged.length}枚を ${path.relative(process.cwd(), out)} に書き出しました`)
