// smoke パート61（data/cards.json のスキーマ検証）
//
// cards.json は fs で読み込むため tsc の型検査対象外で、データとコードの不整合が
// 実行時まで発覚しない。特に未登録の action.type は resolveAction が
// `handler is not a function` で**対戦中にクラッシュする**。
//
// 検証本体は scripts/validate-cards.ts にあり、有効な action.type / keyword を
// ACTION_HANDLERS / KEYWORDS から実行時に取得するため、型やハンドラを足しても
// 検証側の更新は要らない。ここから呼ぶことで CI（npm run smoke:quiet）に自動で載る。
import * as fs from "node:fs"
import * as path from "node:path"
import { assert } from "./helpers"
import { validateCards } from "../validate-cards"
import type { CardData } from "../../server/src/type"

console.log("=== data/cards.json のスキーマ検証 ===")
{
    const cardsPath = path.resolve(__dirname, "../../data/cards.json")
    const cards = JSON.parse(fs.readFileSync(cardsPath, "utf-8")) as CardData[]
    assert(cards.length > 0, `cards.json が読み込める（${cards.length}枚）`)

    const issues = validateCards(cards)
    if (issues.length > 0) {
        // 失敗時は原因が一目で分かるよう、先頭20件を出す
        for (const i of issues.slice(0, 20)) console.log(`    [${i.cardId}] ${i.message}`)
        if (issues.length > 20) console.log(`    ...ほか${issues.length - 20}件`)
    }
    assert(issues.length === 0, `cards.json に不整合がない（検出 ${issues.length}件）`)
}
