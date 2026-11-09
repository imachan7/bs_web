// 概念: バーストの発動コスト（globalConstraint "burstActivationCost"）。発動宣言時に払う。払えなければ発動できず、セットしたまま残る
import { effectiveCost } from "../../../shared/cost"
import { burstActivationCostActive } from "../../../shared/rules/constraints"
import type { GameState, PlayerId } from "../type"
import { autoPayPlan, payCost } from "./EffectModules"
import { getCard, log } from "./GameState"

export function burstActivationFee(state: GameState, holderPid: PlayerId, cardId: string): number {
    return burstActivationCostActive(state, holderPid) ? effectiveCost(state, holderPid, getCard(cardId)) : 0
}

export function burstFeeUnpayable(state: GameState, holderPid: PlayerId, cardId: string): boolean {
    const fee = burstActivationFee(state, holderPid, cardId)
    return fee > 0 && autoPayPlan(state, holderPid, fee, true) === null
}

// ponytail: 支払い元は自動（リザーブ→ネクサス→コアの多いスピリット）。支払い元を選ばせるなら askCostPay（summonSurcharge.ts）へ載せ替える
export function payBurstActivationFee(state: GameState, holderPid: PlayerId, cardId: string): void {
    const fee = burstActivationFee(state, holderPid, cardId)
    if (fee <= 0) return
    const plan = autoPayPlan(state, holderPid, fee, true)
    if (plan === null) return
    payCost(state, holderPid, fee, plan.paySources, 0, plan.soulFromReserve)
    log(state, `${state.players[holderPid].name}は${getCard(cardId).name}の発動のためコスト${fee}を支払った。`)
}
