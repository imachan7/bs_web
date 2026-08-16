// 分割されたアクションハンドラを合成する。
// ActionRegistry（全 EffectAction.type を網羅）として型注釈することで、
// **ハンドラの書き漏れがコンパイル時に検出される**（旧 switch の網羅性チェックの代替）
import type { ActionRegistry } from "./types"
import battleFlow from "./battleFlow"
import buff from "./buff"
import control from "./control"
import cores from "./cores"
import destroy from "./destroy"
import exhaustRefresh from "./exhaustRefresh"
import grant from "./grant"
import handDeck from "./handDeck"

const ACTION_HANDLERS: ActionRegistry = {
    ...battleFlow,
    ...buff,
    ...control,
    ...cores,
    ...destroy,
    ...exhaustRefresh,
    ...grant,
    ...handDeck,
}

export default ACTION_HANDLERS
