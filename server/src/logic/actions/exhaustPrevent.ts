// 内部専用 exhaustPayDecide：kind:"exhaustPreventByPay" の確認への答えを受けて、払って防ぐか疲労させる
import type { ActionHandler, ActionRegistry } from "./types"
import { EXHAUST_PAY_LABEL, findExhaustPrevention, payExhaustPreventCost, preventExhaustByPay } from "../state/exhaustPrevent"
import { exhaustSpirit } from "../state/exhaust"
import { findSpiritAny } from "../EffectModules"

const exhaustPayDecideHandler: ActionHandler<"exhaustPayDecide"> = (ctx, action) => {
    const { state } = ctx
    const found = findSpiritAny(state, action.targetInstanceId)
    if (!found) return
    const cause = { causePid: action.causePid, causeType: action.causeType, bofuSourcePid: action.bofuSourcePid, bofuSourceInstanceId: action.bofuSourceInstanceId }
    if (action.ask) {
        // 再開スタックから確認を出す番。聞いている間に条件が崩れていれば（払えない等）そのまま疲労させる
        if (!preventExhaustByPay(state, found.pid, found.inst, cause, false)) exhaustSpirit(state, found.pid, found.inst, cause.bofuSourcePid, cause.causePid, cause.causeType, cause.bofuSourceInstanceId, true)
        return
    }
    if (ctx.chosenOption === EXHAUST_PAY_LABEL) {
        const p = findExhaustPrevention(state, found.pid, found.inst, cause)
        if (p !== null) {
            payExhaustPreventCost(state, found.pid, p.source, p.effect, found.inst)
            return
        }
    }
    exhaustSpirit(state, found.pid, found.inst, cause.bofuSourcePid, cause.causePid, cause.causeType, cause.bofuSourceInstanceId, true)
}

export default { exhaustPayDecide: exhaustPayDecideHandler } satisfies Partial<ActionRegistry>
