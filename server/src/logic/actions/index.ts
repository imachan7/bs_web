// 分割されたアクションハンドラを合成する。
// 移設が完了したら型注釈を Partial<ActionRegistry> から ActionRegistry に変えることで、
// 全 EffectAction.type の網羅性がコンパイル時に検証される（旧 switch の網羅性チェックの代替）
import type { ActionRegistry } from "./types"
import buff from "./buff"

const ACTION_HANDLERS: Partial<ActionRegistry> = {
    ...buff,
}

export default ACTION_HANDLERS
