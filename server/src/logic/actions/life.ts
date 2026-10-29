// ライフを減らすアクション（ライフを増やすのは placeCores の to:"life"）
import { lifeLossAllowed, recordLifeLoss } from "../lifeGate"
import type { ActionHandler, ActionRegistry } from "./types"
import { log } from "../GameState"
import { fireTrigger } from "../triggers"
import { fireFieldEventTriggers } from "../fieldEventTriggers"

// BS15-X01刀の覇王ムサシード・アシュライガーLv3：相手のライフのコアをcount個、相手のリザーブへ置く
// （相手のライフがcountに満たなければあるだけ移す。0枚なら不発）
const opponentLifeToReserveHandler: ActionHandler<"opponentLifeToReserve"> = (ctx, action) => {
    const { state, opp, sourceName } = ctx
    const target = state.players[opp]
    const moved = lifeLossAllowed(state, { pid: opp, amount: Math.min(action.count, target.life), cause: "effect", actorPid: ctx.owner, sourceType: ctx.srcType, sourceInstance: ctx.self ?? undefined })
    if (moved <= 0) {
        log(state, `${sourceName}：${target.name}のライフが無いため発動しなかった。`)
        return
    }
    target.life -= moved
    recordLifeLoss(state, opp, moved, ctx.self)
    target.reserve += moved
    log(state, `${sourceName}：${target.name}のライフのコア${moved}個をリザーブに置いた。`)
    fireFieldEventTriggers(state, opp, "ownLifeLost")
    if (ctx.srcType === "spirit" && ctx.self) fireFieldEventTriggers(state, ctx.owner, "ownSpiritReducedLife", { pid: ctx.owner, inst: ctx.self })
    if (ctx.srcType === "spirit" && ctx.self && !state.winner) fireTrigger(state, ctx.owner, ctx.self, "onLifeReduced")
}

const handlers = {
    opponentLifeToReserve: opponentLifeToReserveHandler,
} satisfies Partial<ActionRegistry>

export default handlers
