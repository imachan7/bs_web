// ライフを減らすアクション（ライフを増やすのは placeCores の to:"life"）
import { recordLifeLost } from "../record"
import type { ActionHandler, ActionRegistry } from "./types"
import { log } from "../GameState"
import { fireTrigger } from "../triggers"
import { fireFieldEventTriggers } from "../fieldEventTriggers"

// BS15-X01刀の覇王ムサシード・アシュライガーLv3：相手のライフのコアをcount個、相手のリザーブへ置く
// （相手のライフがcountに満たなければあるだけ移す。0枚なら不発）
const opponentLifeToReserveHandler: ActionHandler<"opponentLifeToReserve"> = (ctx, action) => {
    const { state, opp, sourceName } = ctx
    const target = state.players[opp]
    const moved = Math.min(action.count, target.life)
    if (moved <= 0) {
        log(state, `${sourceName}：${target.name}のライフが無いため発動しなかった。`)
        return
    }
    target.life -= moved
    recordLifeLost(state, opp, moved)
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
