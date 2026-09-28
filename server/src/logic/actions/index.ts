// 分割されたアクションハンドラを合成する。
// ActionRegistry（全 EffectAction.type を網羅）として型注釈することで、
// **ハンドラの書き漏れがコンパイル時に検出される**（旧 switch の網羅性チェックの代替）
import type { ActionRegistry } from "./types"
import { magicMirrorRepeatHandler } from "../magic/resolve"
import battleFlow from "./battleFlow"
import bounce from "./bounce"
import buff from "./buff"
import control from "./control"
import coreGain from "./coreGain"
import cores from "./cores"
import destroy from "./destroy"
import drawDiscard from "./drawDiscard"
import exhaustRefresh from "./exhaustRefresh"
import grant from "./grant"
import life from "./life"
import mill from "./mill"
import pay from "./pay"
import peekHand from "./peekHand"
import placeCores from "./placeCores"
import removeCores from "./removeCores"
import reveal from "./reveal"
import revealAction from "./revealAction"
import tegamoto from "./tegamoto"
import tensho from "./tensho"
import timedEffect from "./timedEffect"
import trashRecover from "./trashRecover"
import toDeck from "./toDeck"
import toHand from "./toHand"
import declare from "./declare"
import fireEffect from "./fireEffect"

const ACTION_HANDLERS: ActionRegistry = {
    ...battleFlow,
    ...bounce,
    ...buff,
    ...control,
    ...coreGain,
    ...cores,
    ...destroy,
    ...drawDiscard,
    ...exhaustRefresh,
    ...grant,
    ...life,
    magicMirrorRepeat: magicMirrorRepeatHandler,
    ...mill,
    ...pay,
    ...peekHand,
    ...placeCores,
    ...removeCores,
    ...reveal,
    ...revealAction,
    ...tegamoto,
    ...tensho,
    ...timedEffect,
    ...trashRecover,
    ...toDeck,
    ...toHand,
    ...declare,
    ...fireEffect,
}

export default ACTION_HANDLERS
