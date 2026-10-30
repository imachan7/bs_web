// 戻すの問い合わせ：「手札に戻らない」を1か所に集める（EFFECT_GATE.md §4 の 5f）
//
// 「〜されない」は対象に取られることを防がない（10-30 の一般則）ので、戻す入口（markBounce）がここを聞く。
// 「手札に戻らない」はデッキへ戻すことを止めない。誰の効果かは解決中の効果の記録（currentEffectSource）で見る
import { entryActive } from "../../../shared/rules/effectStop"
import { effectSources, hasBounceImmunity } from "../../../shared/rules"
import type { CardInstance, GameState, PlayerId } from "../type"
import { currentLevel, getCard } from "./GameState"

export type BounceTo = "hand" | "deckTop" | "deckBottom" | "burst"

export function bounceDenial(state: GameState, ownerPid: PlayerId, target: CardInstance, to: BounceTo): string | null {
    if (to !== "hand") return null
    if (allSpiritsCantBounceActive(state)) return "スピリットは手札に戻らない"
    const src = state.currentEffectSource
    if (src && src.pid !== ownerPid && hasBounceImmunity(state, ownerPid, target, src.type)) return "相手の効果では手札に戻らない"
    return null
}

// 金狐角。発生源の持ち主基準の phase/turn を見るので hasGlobalConstraint ではなく専用に走査する
export function allSpiritsCantBounceActive(state: GameState): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, pid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "allSpiritsCantBounce") continue
                if (!entryActive(state, pid, source, effect, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                return true
            }
        }
    }
    return false
}
