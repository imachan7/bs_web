// 召喚の余分（転召の祭壇など）の支払い待ちから、払い済みとして無償召喚を再開する内部専用アクション
import type { ActionHandler, ActionRegistry } from "./types"
import { summonFreeFromHandIndex, summonFreeFromTrashIndex } from "../summon"
import { applyFushiSummon, applySpiritMillFreeSummon } from "../revive"

const summonFreeIndexInternalHandler: ActionHandler<"summonFreeIndexInternal"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    // 同じ召喚の余分は払い済み。batch の「払い済み」の印を立てて、召喚側が二重に請求しないようにする
    state.summonSurchargePaid = owner
    const opts = {
        surchargeBatch: true as const,
        ...(action.skipOnSummon ? { skipOnSummon: true as const } : {}),
        ...(action.summonedBy !== undefined ? { summonedBy: action.summonedBy } : {}),
    }
    if (action.zone === "hand") {
        summonFreeFromHandIndex(state, owner, sourceName, action.index, action.skipTensho, {
            ...opts,
            ...(action.braveTargetInstanceId !== undefined ? { braveTargetInstanceId: action.braveTargetInstanceId } : {}),
        })
    } else {
        summonFreeFromTrashIndex(state, owner, sourceName, action.index, {
            ...opts,
            ...(action.destroyAtBattleEnd ? { destroyAtBattleEnd: true as const } : {}),
        })
    }
}

const trashSummonPaidInternalHandler: ActionHandler<"trashSummonPaidInternal"> = (ctx, action) => {
    const info = { pid: ctx.owner, cardId: action.cardId, trashIndex: action.trashIndex }
    if (action.via === "mill") applySpiritMillFreeSummon(ctx.state, info, true)
    else applyFushiSummon(ctx.state, { ...info, ...(action.freeNexusInstanceId !== undefined ? { freeNexusInstanceId: action.freeNexusInstanceId } : {}) }, action.via === "fushiFree" ? true : undefined, true)
}

const handlers = {
    summonFreeIndexInternal: summonFreeIndexInternalHandler,
    trashSummonPaidInternal: trashSummonPaidInternalHandler,
} satisfies Partial<ActionRegistry>

export default handlers
