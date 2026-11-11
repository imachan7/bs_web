// バーストの「その後コストを支払うことで、このカードのメイン/フラッシュ効果を発揮する」（thenPay）の支払い。
// コストはリザーブだけでなくスピリットのコアからも払える（2026-11-11 の報告：リザーブだけを見ていて、相手のターンに払えなかった）
import type { EffectAction, GameState, PlayerId } from "../type"
import { getCard, log } from "./GameState"
import { autoPayPlan, payCost, resolveAction } from "./EffectModules"
import { askCostPay } from "./summonSurcharge"
import { markPayConfirmed } from "./actions/pay"
import { magicEffectiveColors } from "../../../shared/cost"

export function canPayBurstThenPay(state: GameState, pid: PlayerId, cost: number): boolean {
    return autoPayPlan(state, pid, cost, true) !== null
}

// 払えるときだけ払って action を解決する。対話ではどのコアから払うかを聞く（effectCostPay）
export function payBurstThenPay(state: GameState, pid: PlayerId, cardId: string, cost: number, action: EffectAction): void {
    const card = getCard(cardId)
    const plan = autoPayPlan(state, pid, cost, true)
    if (plan === null) {
        log(state, `${card.name}：コストを支払えないため発揮しなかった。`)
        return
    }
    const colors = magicEffectiveColors(state, pid, card)
    const run = markPayConfirmed(action)
    if (askCostPay(state, pid, cost, 0, `${card.name}：コスト${String(cost)}を支払ってください`, cardId, run)) {
        state.pendingChoice!.effectSource = { type: "magic", colors }
        return
    }
    payCost(state, pid, cost, plan.paySources, 0, plan.soulFromReserve)
    log(state, `${state.players[pid].name}は${card.name}のコスト${String(cost)}を支払った。`)
    resolveAction(state, pid, null, run, undefined, colors, "magic", undefined, undefined, cardId)
}
