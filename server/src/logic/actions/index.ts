// 分割されたアクションハンドラを合成する。
// ActionRegistry（全 EffectAction.type を網羅）として型注釈することで、
// **ハンドラの書き漏れがコンパイル時に検出される**（旧 switch の網羅性チェックの代替）
import type { ActionRegistry } from "./types"
import { magicMirrorRepeatHandler } from "../magic/resolve"
import battleFlow from "./battleFlow"
import bounce from "./bounce"
import buff from "./buff"
import control from "./control"
import cores from "./cores"
import destroy from "./destroy"
import drawDiscard from "./drawDiscard"
import exhaustRefresh from "./exhaustRefresh"
import grant from "./grant"
import mill from "./mill"
import reveal from "./reveal"
import tegamoto from "./tegamoto"
import trashRecover from "./trashRecover"

const ACTION_HANDLERS: ActionRegistry = {
    ...battleFlow,
    ...bounce,
    ...buff,
    ...control,
    ...cores,
    ...destroy,
    ...drawDiscard,
    ...exhaustRefresh,
    ...grant,
    magicMirrorRepeat: magicMirrorRepeatHandler,
    ...mill,
    ...reveal,
    ...tegamoto,
    ...trashRecover,
}

export default ACTION_HANDLERS
