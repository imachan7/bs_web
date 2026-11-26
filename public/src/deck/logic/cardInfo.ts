// カード1枚から導く表示用の値
import type { CardData, BraveCondition } from "../../../../server/src/type"

// スピリット状態の最高レベルBP（ネクサス・マジックは null）。ブレイヴもスピリット状態のBPを表示する
export function maxBp(card: CardData): number | null {
    if ((card.type !== "spirit" && card.type !== "brave") || card.levels.length === 0) return null
    return Math.max(...card.levels.map((lv) => lv.bp))
}

// 合体条件の表示文言（例: "系統：「神星」" "コスト3以上" "「○○」" "効果の記述を持たないスピリット"）
export function braveConditionText(condition: BraveCondition): string {
    const terms = Array.isArray(condition) ? condition : [condition]
    return terms
        .map((term) => {
            if (term.family !== undefined) return `系統：「${term.family}」`
            if (term.minCost !== undefined) return `コスト${term.minCost}以上`
            if (term.cardName !== undefined) return `「${term.cardName}」`
            if (term.vanilla) return "効果の記述を持たないスピリット"
            return ""
        })
        .filter((t) => t !== "")
        .join(" / ")
}

// 合体時に加算されるBP（braveLevels の最高値。cores は常に0なので levels は1件想定）
export function braveBpGain(card: CardData): number | null {
    if (card.type !== "brave" || !card.braveLevels || card.braveLevels.length === 0) return null
    return Math.max(...card.braveLevels.map((lv) => lv.bp))
}
