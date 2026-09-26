// 【転召】のコアの置き先・中断からの再開・代わりの支払いの選択
import type { ActionHandler, ActionRegistry } from "./types"
import { findNexus, findSpirit, log } from "../GameState"
import {
    dumpAllCoresTensho,
    tenshoAfterTargetTrigger,
    tenshoDumpAndDestroy,
    TENSHO_SUBSTITUTE_REST,
    TENSHO_SUBSTITUTE_HAND,
    applyTenshoSubstitute,
    applyTenshoSubstituteCrossSource,
} from "../EffectModules"


const tenshoCoreDumpHandler: ActionHandler<"tenshoCoreDump"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 【転召】のpendingChoice再開専用：targetInstanceIdで指定された自分のスピリットの
        // 上のコアすべてをdestへ（cards.jsonには書かない。resolveTenshoからのみ発行される）
        if (targetInstanceId === undefined) return
        const target = state.players[owner].field.spirits.find(
            (s) => s.instanceId === targetInstanceId,
        )
        if (!target) {
            log(state, "【転召】：対象がいなかった。")
            return
        }
        dumpAllCoresTensho(state, owner, target, action.dest)
        return
}

const tenshoResumeHandler: ActionHandler<"tenshoResume"> = (ctx, action) => {
    const { state, owner, self } = ctx
        // 【転召】の途中で誘発が選択待ちを立てたときの再開専用（cards.jsonには書かない）。
        // self には転召の対象になった自分のスピリットが渡る。
        // 対象が既に場を離れていたら（誘発の解決中に除去された等）残りの処理は行わない
        if (!self) return
        if (action.stage === "afterTargetTrigger") {
            tenshoAfterTargetTrigger(state, owner, self, action.dest, action.skipSubstitute === true)
            return
        }
        tenshoDumpAndDestroy(state, owner, self, action.dest)
        return
}

const tenshoSubstituteChoiceHandler: ActionHandler<"tenshoSubstituteChoice"> = (ctx, action) => {
    const { state, owner, self, chosenOption } = ctx
        // 【転召】置換（BS05の竜使い）の任意発動のpendingChoice再開専用（cards.jsonには書かない）。
        // selfには転召の対象になった自分のスピリットが渡る
        if (!self) return
        if (chosenOption === TENSHO_SUBSTITUTE_REST && action.exhaustInstanceId !== undefined) {
            const sourceInst = findSpirit(state.players[owner], action.exhaustInstanceId) ?? findNexus(state.players[owner], action.exhaustInstanceId)
            if (sourceInst) {
                applyTenshoSubstituteCrossSource(state, owner, self, sourceInst)
                return
            }
        }
        if (chosenOption === TENSHO_SUBSTITUTE_REST || chosenOption === TENSHO_SUBSTITUTE_HAND) {
            applyTenshoSubstitute(state, owner, self, chosenOption === TENSHO_SUBSTITUTE_HAND)
            return
        }
        // 「置換しない」側：置換を飛ばして通常のコア移動を行う（再度の確認を出さない）
        dumpAllCoresTensho(state, owner, self, action.dest, true)
        return
}

const handlers = {
    tenshoCoreDump: tenshoCoreDumpHandler,
    tenshoResume: tenshoResumeHandler,
    tenshoSubstituteChoice: tenshoSubstituteChoiceHandler,
} satisfies Partial<ActionRegistry>

export default handlers
