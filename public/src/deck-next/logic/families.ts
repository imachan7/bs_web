// 系統の集計。絞り込みのたびに正規表現を回さないよう、読み込み時に1回だけ作って使う
import type { CardData } from "../../../../server/src/type"

export const FAMILY_GROUPS: ReadonlyArray<[string, string]> = [
    ["red", "赤"], ["purple", "紫"], ["green", "緑"], ["white", "白"], ["yellow", "黄"], ["blue", "青"], ["multi", "多色"],
]

// 系統を持つカードの色のうち最多の色が7割以上ならその色、そうでなければ多色。持つカードが無い系統も多色
export function familyColors(cards: CardData[], all: Set<string>): Map<string, string> {
    const tally = new Map<string, Map<string, number>>()
    for (const card of cards) {
        for (const fam of card.family) {
            const t = tally.get(fam) ?? new Map<string, number>()
            for (const c of card.colors) t.set(c, (t.get(c) ?? 0) + 1)
            tally.set(fam, t)
        }
    }
    const result = new Map<string, string>()
    for (const fam of all) {
        const t = tally.get(fam)
        let best = "multi"
        if (t) {
            const total = Array.from(t.values()).reduce((a, b) => a + b, 0)
            const [color, n] = Array.from(t.entries()).sort((a, b) => b[1] - a[1])[0] ?? ["multi", 0]
            if (n / total >= 0.7) best = color
        }
        result.set(fam, best)
    }
    return result
}

// 効果文の「系統：「X」「X・Y」」から拾った系統（cardId -> 系統の集合）
export function buildMentionedFamilies(cards: CardData[]): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>()
    for (const card of cards) {
        const set = new Set<string>()
        for (const m of (card.effect ?? "").matchAll(/系統：((?:「[^」]+」\/?)+)/g)) {
            for (const g of (m[1] ?? "").matchAll(/「([^」]+)」/g)) {
                for (const f of (g[1] ?? "").split("・")) set.add(f)
            }
        }
        result.set(card.cardId, set)
    }
    return result
}
