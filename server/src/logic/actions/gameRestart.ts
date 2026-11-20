// ゲームの再開始（restartGame）のハンドラ。処理本体は logic/gameRestart.ts
import type { ActionHandler, ActionRegistry } from "./types"
import { restartGame } from "../gameRestart"

const restartGameHandler: ActionHandler<"restartGame"> = (ctx) => {
    if ((ctx.state.gameRestartCount ?? 0) > 0) return
    restartGame(ctx.state)
}

const handlers = {
    restartGame: restartGameHandler,
} satisfies Partial<ActionRegistry>

export default handlers
