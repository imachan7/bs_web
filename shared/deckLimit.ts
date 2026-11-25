// 同名カードをデッキに入れられる枚数。サーバーのデッキ検証とデッキビルダーで同じものを使う（ビルダーだけ「何枚でも」を見落としていた。#708）
import type { CardData } from "../server/src/type"
import { noteCoverage } from "./coverage"

export const MAX_COPIES = 3

export function deckCopyLimit(card: CardData): number {
    const anyCopies = card.effects.some((e) => {
        if (e.kind !== "deckRule" || e.rule !== "anyCopies") return false
        noteCoverage(e, "deckRule")
        return true
    })
    if (anyCopies) return Infinity
    return card.limitCount !== undefined ? Math.min(MAX_COPIES, card.limitCount) : MAX_COPIES
}
