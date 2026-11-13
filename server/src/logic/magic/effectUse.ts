// 効果で使うマジック（トラッシュから「手札にあるときと同様に」・オープンしたカードを「即時に」）の使用手続き。
// 手札から使うときと同じく「使用」で、使用の制限・無効化・使用時の誘発・使用回数の記録が掛かる。
// タイミングの制限（メインステップか・フラッシュの窓）は効果が決めるので掛けない（RULES_BATSPI_WIKI §6。Q20060・Q2592。2026-11-14 ユーザー確認。#510・#511）
import type { CardData, GameState, PaySource, PlayerId } from "../../type"
import { getCard } from "../GameState"
import { hasMagicRestriction } from "../../../../shared/cost"
import { magicUseRestriction } from "../RuleValidator"
import { recordMagicUse } from "../record"
import { beginMagicUse, finishMagicUseOrDefer } from "./inUse"
import { resolveMagic } from "./cast"

export function effectMagicUseDenial(state: GameState, pid: PlayerId, card: CardData, timing: "main" | "flash", paySources?: PaySource[]): string | null {
    const restricted = magicUseRestriction(state, pid, card, timing, paySources)
    if (restricted) return restricted
    if (timing === "flash" && (hasMagicRestriction(state, pid, "noFlashAll") || hasMagicRestriction(state, pid, "noFlashOpponent"))) {
        return "マジックカードのフラッシュ効果を使用できません"
    }
    return null
}

// 使用を確定して解決する。カードは呼び出し側がゾーンから抜き、コストも払い済み
export function useMagicByEffect(state: GameState, pid: PlayerId, cardId: string, timing: "main" | "flash", paidCost: boolean): void {
    beginMagicUse(state, pid, cardId)
    recordMagicUse(state, pid, getCard(cardId), timing)
    // マジックミラー用の記録（解決中に書き換わっていれば＝使ったカード自身がマジックミラーなら上書きしない）
    const before = state.lastMagicCast
    state.keishoExcludedCardIds = []
    resolveMagic(state, pid, cardId, timing, undefined, paidCost)
    if (state.lastMagicCast === before) state.lastMagicCast = { pid, cardId, timing }
    finishMagicUseOrDefer(state)
}
