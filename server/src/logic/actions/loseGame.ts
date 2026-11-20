// 効果で敗北させる（loseGame）のハンドラ。勝敗は lifeGate.ts の settleLifeZero と同じく state.winner で決める
import type { ActionHandler, ActionRegistry } from "./types"
import { log, opponentOf } from "../GameState"

const loseGameHandler: ActionHandler<"loseGame"> = (ctx, action) => {
    const { state, owner, opp } = ctx
    if (state.winner) return
    const loser = action.side === "opponent" ? opp : owner
    const winner = opponentOf(loser)
    state.winner = winner
    log(state, `${state.players[winner].name}の勝利！`)
}

const handlers = {
    loseGame: loseGameHandler,
} satisfies Partial<ActionRegistry>

export default handlers
