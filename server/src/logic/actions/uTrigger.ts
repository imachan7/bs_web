// 【Uトリガー】の action ハンドラ登録（手順は logic/uTrigger.ts）
import type { ActionHandler, ActionRegistry } from "./types"
import { resolveUTrigger } from "../uTrigger"

const uTriggerHandler: ActionHandler<"uTrigger"> = (ctx, action) => resolveUTrigger(ctx, action)

const handlers = {
    uTrigger: uTriggerHandler,
} satisfies Partial<ActionRegistry>

export default handlers
