// サーバー／クライアント共有のブロック可否判定。
//
// サーバー（RuleValidator.validateBlock）は「バトルが発生しているか」「優先権があるか」など
// 進行状態の前提を先に検証してからこの関数を呼び、クライアント（renderer）は
// ブロック可能ハイライトの判定に同じ関数を使う。
// エラー理由の文字列を返し、ブロック可能なら null を返す（サーバーはその文字列をそのまま拒否理由に使う）。
import type { CardInstance, PlayerId } from "../server/src/type"
import type { Board } from "./board"
import { COLOR_LABELS } from "../data/constants"
import { card } from "./cardDb"
import {
    activeConstraints,
    currentLevel,
    effectiveBp,
    instHasColor,
    KEYWORDS,
    spiritHasKeyword,
} from "./rules"

export function canBlock(
    board: Board,
    blockerPid: PlayerId,
    blockerInst: CardInstance,
    attackerPid: PlayerId,
    attackerInst: CardInstance | undefined,
): string | null {
    // ブロッカー側の制約（cantBlock / cantBlockLowerBp）。
    // バーストファイアで無効化されている場合はこれらのチェックをスキップする
    const blockerConstraints = activeConstraints(board, blockerPid, blockerInst)
    if (!blockerInst.blockConstraintNegatedThisTurn) {
        if (blockerConstraints.some((c) => c.type === "cantBlock")) {
            return "このスピリットはブロックできません"
        }
        if (
            attackerInst &&
            blockerConstraints.some((c) => c.type === "cantBlockLowerBp") &&
            effectiveBp(board, attackerPid, attackerInst) < effectiveBp(board, blockerPid, blockerInst)
        ) {
            return "BPの低いスピリットはブロックできません"
        }
    }

    // アタッカー側の制約（unblockableBy）。
    // レッドウォール使用中は、ブロック側がこのターン「ブロックされない」効果を無視できる
    if (attackerInst && !board.ignoreUnblockableThisTurn.includes(blockerPid)) {
        const blockerCard = card(blockerInst.cardId)
        for (const c of activeConstraints(board, attackerPid, attackerInst)) {
            if (c.type !== "unblockableBy") continue
            if (c.colorFilter !== undefined && instHasColor(blockerInst, c.colorFilter)) {
                return `このスピリットは${COLOR_LABELS[c.colorFilter]}のスピリットにブロックされません`
            }
            if (
                c.keywordFilter !== undefined &&
                spiritHasKeyword(board, blockerPid, blockerInst, c.keywordFilter)
            ) {
                return `このスピリットは【${KEYWORDS[c.keywordFilter].label}】を持つスピリットにブロックされません`
            }
            if (c.maxCores !== undefined && blockerInst.cores <= c.maxCores) {
                return `このスピリットはコア${c.maxCores}個以下のスピリットにブロックされません`
            }
            if (
                c.levelFilter !== undefined &&
                c.levelFilter.includes(currentLevel(blockerInst).level)
            ) {
                return `このスピリットはLv${c.levelFilter.join("/")}のスピリットにブロックされません`
            }
            if (c.costNot !== undefined && blockerCard.cost !== c.costNot) {
                return `このスピリットはコスト${c.costNot}以外のスピリットにブロックされません`
            }
        }
    }
    return null
}
