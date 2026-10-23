// 強制ブロック：相手（アタッカー側）のスピリットを疲労させ、そのスピリットでブロックさせる（BS18-082）。
// 宣言そのものはブロック前のフラッシュが閉じてから（forcedBlock.ts の resolveForcedBlock）
import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, log } from "../GameState"
import { recordTargets } from "../record"
import {
    askPayToNegateIfNeeded,
    exhaustSpirit,
    findSpiritAny,
    pickEnemyByBp,
    pickEnemyCandidates,
    resistanceAgainst,
    tryInteractiveTargetChoice,
} from "../EffectModules"
import { matchesTarget } from "../../../../shared/rules"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"

const exhaustAndForceBlockHandler: ActionHandler<"exhaustAndForceBlock"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const battle = state.battle
    if (!battle || state.turnPlayer !== opp || battle.blockerInstanceId) {
        log(state, `${sourceName}：ブロック前の相手のアタック中ではないため、効果がなかった。`)
        return
    }
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) {
        log(state, `${sourceName}：BP参照元がいなかった。`)
        return
    }
    // 疲労状態でも選べる（疲労は起きないがブロックは強制される）。アタッカー自身は「アタックしていない」で除外
    const matches = (s: { instanceId: string }): boolean =>
        s.instanceId !== battle.attackerInstanceId && matchesTarget(state, opp, s as never, filter, self?.instanceId)
    let target = targetInstanceId !== undefined ? findSpiritAny(state, targetInstanceId) : null
    if (targetInstanceId === undefined) {
        const candidates = pickEnemyCandidates(state, opp, Infinity, matches, srcColors, srcType, "exhaust")
        if (tryInteractiveTargetChoice(state, owner, self, `${sourceName}：疲労させてブロックさせる相手のスピリットを選んでください`, candidates, action, null)) return
        const picked = pickEnemyByBp(state, opp, Infinity, matches, srcColors, srcType, "exhaust")
        target = picked ? { pid: opp, inst: picked } : null
    }
    if (!target || target.pid !== opp || !matches(target.inst)) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    const attempt = attemptOf(ctx, "exhaust", "targeted")
    if (askPayToNegateIfNeeded(state, target.pid, target.inst, attempt, action, self, sourceName)) return
    const resisted = resistanceAgainst(state, target.pid, target.inst, attempt)
    if (resisted) {
        log(state, `${getCard(target.inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
        return
    }
    const name = getCard(target.inst.cardId).name
    if (!target.inst.isRested) exhaustSpirit(state, target.pid, target.inst, undefined, owner, srcType, self?.instanceId)
    battle.forcedBlockerInstanceId = target.inst.instanceId
    recordTargets(state, [target.inst.instanceId])
    log(state, `${sourceName}：${name}は疲労し、このあとのブロックを宣言する。`)
}

const handlers = { exhaustAndForceBlock: exhaustAndForceBlockHandler } satisfies Partial<ActionRegistry>

export default handlers
