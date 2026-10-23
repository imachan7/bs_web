// 【地鳴：N】の「指定された枚数」（カードに書かれた N と、効果で増えるぶん）
import { entryActive } from "../../../../shared/rules/effectStop"
import type { GameState, PlayerId } from "../../type"
import { getCard } from "../GameState"
import { currentLevel, effectSources } from "../../../../shared/rules"

// カードに書かれた【地鳴：N】の N（持たなければ 0）
export function chimeiBase(cardId: string): number {
    for (const e of getCard(cardId).effects) {
        if (e.kind !== "triggered" || e.keyword !== "chimei" || e.action.type !== "mill") continue
        const c = e.action.countCounter
        if (typeof c === "object" && c !== null && "minus" in c && typeof c.minus[0] === "object" && "const" in c.minus[0]) return c.minus[0].const
    }
    return 0
}

// 【地鳴：N】の N に足す枚数（kind:"chimeiBonus"）
export function chimeiBonus(state: GameState, owner: PlayerId): number {
    let total = 0
    for (const src of effectSources(state, owner)) {
        const level = currentLevel(src).level
        for (const e of getCard(src.cardId).effects) {
            if (e.kind !== "chimeiBonus" || !entryActive(state, owner, src, e, level)) continue
            if (e.phaseTurn && (state.phase !== e.phaseTurn.phase || (e.phaseTurn.turn === "own") !== (state.turnPlayer === owner))) continue
            total += e.amount
        }
    }
    return total
}
