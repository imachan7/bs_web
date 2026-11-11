// 召喚の余分（転召の祭壇など）の支払い待ちから、払い済みとして無償召喚を再開する内部専用アクション
import type { ActionHandler, ActionRegistry } from "./types"
import { summonFreeFromHandIndex, summonFreeFromTrashIndex } from "../summon"
import { applyFushiSummon, applySpiritMillFreeSummon } from "../revive"
import { finishResshinsokuSummon } from "../GameEngine"
import { summonSurcharge } from "../../../../shared/cost"
import { getCard } from "../GameState"

const summonFreeIndexInternalHandler: ActionHandler<"summonFreeIndexInternal"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    // 同じ召喚の余分は払い済み。batch の「払い済み」の印を立てて、召喚側が二重に請求しないようにする
    // 余分の無い召喚（置くコアの選択だけを挟んだ再開）では印を立てない。同じ効果の次の1体の余分が無料になってしまう
    const zoneCard = action.zone === "hand" ? state.players[owner].hand[action.index] : state.players[owner].trashCards[action.index]
    if (zoneCard !== undefined && summonSurcharge(state, owner, getCard(zoneCard)) > 0) state.summonSurchargePaid = owner
    const opts = {
        surchargeBatch: true as const,
        ...(action.payCost ? { payCost: true as const } : {}),
        ...(action.costPaid ? { costPaid: true as const } : {}),
        ...(action.placeCores !== undefined ? { placeCores: action.placeCores } : {}),
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
    if (action.via === "mill") applySpiritMillFreeSummon(ctx.state, info, true, action.placeCores)
    else applyFushiSummon(ctx.state, { ...info, ...(action.freeNexusInstanceId !== undefined ? { freeNexusInstanceId: action.freeNexusInstanceId } : {}) }, action.via === "fushiFree" ? true : undefined, true, action.placeCores)
}

const resshinsokuFinishInternalHandler: ActionHandler<"resshinsokuFinishInternal"> = (ctx, action) => {
    finishResshinsokuSummon(ctx.state, ctx.owner, { handIndex: action.handIndex, cardId: action.cardId, remaining: 0, selfCores: action.selfCores }, true)
}

const handlers = {
    resshinsokuFinishInternal: resshinsokuFinishInternalHandler,
    summonFreeIndexInternal: summonFreeIndexInternalHandler,
    trashSummonPaidInternal: trashSummonPaidInternalHandler,
} satisfies Partial<ActionRegistry>

export default handlers
