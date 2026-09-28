// ライフを減らすアクション（ライフを増やすのは placeCores の to:"life"）
import type { ActionHandler, ActionRegistry } from "./types"
import { log } from "../GameState"

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
    target.reserve += moved
    log(state, `${sourceName}：${target.name}のライフのコア${moved}個をリザーブに置いた。`)
}

const handlers = {
    opponentLifeToReserve: opponentLifeToReserveHandler,
} satisfies Partial<ActionRegistry>

export default handlers
