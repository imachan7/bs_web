// デッキの統計。多色カードは旧 renderStats と同じく、色の組み合わせ（赤/白）を1区分として数える
import type { CardData, CardType, Color, SymbolMark } from "../../../../server/src/type"

export interface DeckEntry {
    card: CardData
    count: number
}

export interface DeckStats {
    total: number
    kinds: number
    avgCost: number
    byCost: number[] // 0〜7 は常に、それより重いカードがあればそのコストまで
    byColor: { colors: Color[]; count: number }[]
    byType: { type: CardType; count: number }[]
    families: { name: string; count: number }[] // 上位5
    symbols: Partial<Record<SymbolMark, number>> // 場に出たときのシンボル供給
    reduction: Partial<Record<SymbolMark, number>>
}

export function computeDeckStats(entries: DeckEntry[]): DeckStats {
    let total = 0
    let costSum = 0
    let maxCost = 7
    for (const { card, count } of entries) maxCost = Math.max(maxCost, card.cost)
    const byCost = new Array<number>(maxCost + 1).fill(0)
    const byColor = new Map<string, { colors: Color[]; count: number }>()
    const byType = new Map<CardType, number>()
    const fam = new Map<string, number>()
    const symbols: Partial<Record<SymbolMark, number>> = {}
    const reduction: Partial<Record<SymbolMark, number>> = {}
    for (const { card, count } of entries) {
        total += count
        costSum += card.cost * count
        byCost[card.cost] = (byCost[card.cost] ?? 0) + count
        const key = card.colors.join("/")
        const e = byColor.get(key)
        byColor.set(key, { colors: card.colors, count: (e?.count ?? 0) + count })
        byType.set(card.type, (byType.get(card.type) ?? 0) + count)
        for (const f of card.family) fam.set(f, (fam.get(f) ?? 0) + count)
        for (const c of card.symbol) symbols[c] = (symbols[c] ?? 0) + count
        for (const c of card.reduction) reduction[c] = (reduction[c] ?? 0) + count
    }
    return {
        total,
        kinds: entries.length,
        avgCost: total === 0 ? 0 : costSum / total,
        byCost,
        byColor: [...byColor.values()].sort((a, b) => b.count - a.count),
        byType: [...byType].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
        families: [...fam].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
        symbols,
        reduction,
    }
}
