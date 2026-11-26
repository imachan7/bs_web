// インポートした JSON の検証。致命的な問題があれば読み込まずエラー一覧を返す（旧 deck.ts の validateImport と同じ規則）
import type { CardData } from "../../../../server/src/type"
import { DECK_MIN_SIZE } from "../../../../data/constants"

export interface ImportResult {
    errors: string[]
    warnings: string[]
    name: string
    cards: Record<string, number>
}

export function validateImport(
    data: unknown,
    cardOf: (cardId: string) => CardData | undefined,
    nameLimit: (name: string) => number,
): ImportResult {
    const errors: string[] = []
    const warnings: string[] = []
    let name = "インポートしたデッキ"
    const result: Record<string, number> = {}

    if (typeof data !== "object" || data === null) {
        errors.push("JSONのルートがオブジェクトではありません")
        return { errors, warnings, name, cards: result }
    }
    const obj = data as Record<string, unknown>
    if (typeof obj.name === "string" && obj.name.trim() !== "") name = obj.name.trim()
    if (typeof obj.cards !== "object" || obj.cards === null) {
        errors.push("cards プロパティ（cardId → 枚数）がありません")
        return { errors, warnings, name, cards: result }
    }

    const byName = new Map<string, number>()
    let total = 0
    for (const [cardId, rawCount] of Object.entries(obj.cards as Record<string, unknown>)) {
        if (typeof rawCount !== "number" || !Number.isInteger(rawCount) || rawCount < 1) {
            errors.push(`枚数が不正です: ${cardId} → ${String(rawCount)}`)
            continue
        }
        const card = cardOf(cardId)
        if (!card) {
            errors.push(`存在しないカードID: ${cardId}`)
            continue
        }
        if (card.limited) {
            errors.push(`禁止カードは入れられません: ${card.name}（${cardId}）`)
            continue
        }
        result[cardId] = rawCount
        total += rawCount
        byName.set(card.name, (byName.get(card.name) ?? 0) + rawCount)
    }
    for (const [cardName, count] of byName) {
        const limit = nameLimit(cardName)
        if (count > limit) errors.push(`同名カードが${limit}枚を超えています: ${cardName}（${count}枚）`)
    }
    if (errors.length === 0 && total < DECK_MIN_SIZE) {
        warnings.push(`合計が${DECK_MIN_SIZE}枚未満です（${total}枚）。編集を続けてください`)
    }
    return { errors, warnings, name, cards: result }
}
