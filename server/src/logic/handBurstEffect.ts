// 手札のマジックのバースト効果を発揮する操作（kind:"handBurstEffectGrant"）
import { effectiveCost, magicEffectiveColors } from "../../../shared/cost"
import { handBurstEffectDenial, noteHandBurstEffectUsed } from "../../../shared/handBurstEffect"
import type { EffectAction, EffectDef, GameState, PaySource, PlayerId } from "../type"
import { getCard, log } from "./GameState"
import { markPayConfirmed } from "./actions/pay"
import { burstConditionMet, burstEffectBlocked, continueBurstActivation } from "./keywords/burst"
import { fieldInstanceIdsOf } from "./GameState"
import { payCost, resolveAction } from "./EffectModules"
import { validatePaySources } from "./RuleValidator"

type BurstEntry = Extract<EffectDef, { kind: "burst" }>

// 発動でも使用でもないので、効果税（on:"burst"）・usedMagicCardIds・【光芒】の回収・ownBurstActivated は通らない。
// 簡略化：kind:"burst" エントリが複数あるカードは先頭の1つを使う（現状そのようなマジックは無い）
export function doUseHandBurstEffect(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    paySources?: PaySource[],
    paySoulCoreFromReserve?: boolean,
): string | null {
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    const denial = handBurstEffectDenial(state, pid, cardId)
    if (denial || cardId === undefined) return denial
    const card = getCard(cardId)
    const cost = effectiveCost(state, pid, card)
    const payError = validatePaySources(state, pid, cost, paySources, paySoulCoreFromReserve)
    if (payError) return payError
    const entry = card.effects.find((e): e is BurstEntry => e.kind === "burst")
    if (!entry) return "バースト効果を持つマジックカードではありません"
    noteHandBurstEffectUsed(state, pid)

    payCost(state, pid, cost, paySources, 0, paySoulCoreFromReserve)
    player.hand.splice(handIndex, 1)
    player.trashCards.push(cardId)
    log(state, `${player.name}は手札の${card.name}のバースト効果を発揮した。（コスト${cost}）`)

    const blocked = burstEffectBlocked(state, pid, cardId)
    const action: EffectAction = burstConditionMet(state, pid, entry.condition) && !blocked ? markPayConfirmed(entry.action) : { type: "noop" }
    // バースト事象の値は無い（バースト条件を見ないため）。前の発動の値を読ませない
    delete state.burstEventCost
    delete state.burstEventColors
    delete state.burstEventLifeDamagerId
    state.resolvingBurstPid = pid
    resolveAction(state, pid, null, action, undefined, magicEffectiveColors(state, pid, card), card.type, undefined, undefined, cardId)
    delete state.resolvingBurstPid
    continueBurstActivation(state, {
        kind: "burstFinish",
        stage: "finish",
        pid,
        cardId,
        actionType: action.type,
        handUse: true,
        ...(entry.thenPay !== undefined && !blocked ? { thenPay: entry.thenPay } : {}),
        before: [...fieldInstanceIdsOf(state, pid)],
    })
    return null
}
