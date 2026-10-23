// kind:"exhaustPreventByPay"（BS18-014）：疲労する1体ごとに、持ち主がコストを払って疲労を防ぐ
import { entryActive } from "../../../../shared/rules/effectStop"
import type { CardInstance, ResolvedTargetFilter, CardType, EffectDef, GameState, PlayerId } from "../../type"
import { currentLevel, getCard, log, pushResumeFrames, suspend } from "../GameState"
import { canPayResolve } from "../actions/pay"
import { resolveAction } from "../EffectModules"
import { noteCoverage } from "../../../../shared/coverage"
import { effectSources, matchesTarget } from "../../../../shared/rules"

export const EXHAUST_PAY_LABEL = "支払う"

type PreventEffect = Extract<EffectDef, { kind: "exhaustPreventByPay" }>

export interface ExhaustCause {
    causePid: PlayerId
    causeType: CardType
    bofuSourcePid?: PlayerId | undefined
    bofuSourceInstanceId?: string | undefined
}

function findPrevention(state: GameState, ownerPid: PlayerId, inst: CardInstance, cause: ExhaustCause): { source: CardInstance; effect: PreventEffect } | null {
    // 自分自身の操作・内部処理（causePid 省略）と自分の効果は対象外。「相手の〜の効果によって」
    if (cause.causePid === ownerPid) return null
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "exhaustPreventByPay") continue
            if (!entryActive(state, ownerPid, source, effect, level)) continue
            if (!effect.bySourceTypes.includes(cause.causeType)) continue
            if (!matchesTarget(state, ownerPid, inst, effect.filter as unknown as ResolvedTargetFilter, source.instanceId)) continue
            if (!canPayResolve(state, ownerPid, source, effect.cost, undefined, getCard(source.cardId).type)) continue
            return { source, effect }
        }
    }
    return null
}

function payCost(state: GameState, ownerPid: PlayerId, source: CardInstance, effect: PreventEffect, inst: CardInstance): void {
    resolveAction(state, ownerPid, source, effect.cost, undefined, undefined, getCard(source.cardId).type)
    noteCoverage(effect, "exhaustPreventByPay")
    log(state, `${getCard(source.cardId).name}：コストを支払い、${getCard(inst.cardId).name}は疲労しなかった。`)
}

// true＝この疲労は呼び出し元では進めない（防いだ、または答えが出るまで保留した）。
// 保留中の疲労は、答えが「払わない」ならハンドラが exhaustSpirit(skipPrevention) で行う
export function preventExhaustByPay(state: GameState, ownerPid: PlayerId, inst: CardInstance, cause: ExhaustCause, ask = true): boolean {
    const found = findPrevention(state, ownerPid, inst, cause)
    if (found === null) return false
    const { source, effect } = found
    if (!state.interactiveTargets) {
        payCost(state, ownerPid, source, effect, inst)
        return true
    }
    const decide = {
        type: "exhaustPayDecide" as const,
        targetInstanceId: inst.instanceId,
        sourceInstanceId: source.instanceId,
        effectId: effect.id,
        ...cause,
    }
    // 別の選択待ちの最中なら、それが済んだあとに確認が出るよう再開スタックへ積む
    if (ask && state.pendingChoice) {
        pushResumeFrames(state, [{ kind: "action", selfInstanceId: source.instanceId, action: { ...decide, ask: true }, actorPid: ownerPid }])
        return true
    }
    suspend(state, {
        pid: ownerPid,
        kind: "option",
        prompt: `${getCard(source.cardId).name}：コストを支払って、${getCard(inst.cardId).name}を疲労させないようにしますか？`,
        candidates: [],
        options: [EXHAUST_PAY_LABEL, "支払わない"],
        optional: false,
        action: decide,
        selfInstanceId: source.instanceId,
    })
    return true
}

export { payCost as payExhaustPreventCost, findPrevention as findExhaustPrevention }
