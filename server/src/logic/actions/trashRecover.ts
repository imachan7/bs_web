// デッキ破棄からトラッシュ回収・召喚へつなぐアクションのハンドラ
import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, log, requestTrashReturn, returnTrashCardToHand } from "../GameState"
import { summonFreeFromTrashIndex, payCost, notifyHandGained, requestCardChoice, resolveMagic } from "../EffectModules"
import { cardHasColor, isTrashCardProtected, timedMagicLocked } from "../../../../shared/rules"
import { effectiveCost } from "../../../../shared/cost"
import { lastMovedOf, recordMagicUsed } from "../record"
import { matchesPick } from "./revealAction"

// BS08冥将アマイモン：自分のデッキを上から、指定系統を持つスピリットカードが出るまで（上限maxCount枚）破棄し、
// 出ればそのカード1枚を手札に戻す。デッキ切れ・上限到達まで出なければ手札には戻らない
// デッキを上から、指定コストのスピリットカードが出るまで破棄し（上限あり）、
// 出たらトラッシュからコストを支払わずに召喚する（BS11-038 天星馬ペガシーダ）
// kind:"trashSummonOnNameSummoned" の確認に「召喚する」と答えたときの解決（内部専用）
const summonFreeFromTrashIndexInternalHandler: ActionHandler<"summonFreeFromTrashIndexInternal"> = (ctx, action) => {
    const { state, owner } = ctx
    const cardId = state.players[owner].trashCards[action.trashIndex]
    if (cardId === undefined) return
    summonFreeFromTrashIndex(state, owner, getCard(cardId).name, action.trashIndex)
}

// 「手札に戻せる」の確認（ask）に「戻す」と答えたとき／再開スタックから確認を出すときの解決（内部専用）
const trashReturnToHandInternalHandler: ActionHandler<"trashReturnToHandInternal"> = (ctx, action) => {
    const { state, owner } = ctx
    if (action.ask) requestTrashReturn(state, owner, action.cardId, action.onceEffectId)
    else returnTrashCardToHand(state, owner, action.cardId, action.onceEffectId)
}

// 「その後、トラッシュにあるそのカードを〜」：直前に動いたカードのうち pick に合う最後の1枚。
// 誘発などでトラッシュを離れていたら何もしない（2026-09-27 ユーザー確認）
const takeLastHandler: ActionHandler<"takeLast"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const cardId = [...lastMovedOf(state)].reverse().find((id) => matchesPick(id, action.pick))
    const idx = cardId === undefined ? -1 : player.trashCards.lastIndexOf(cardId)
    if (cardId === undefined || idx === -1) {
        log(state, `${sourceName}：対象のカードがトラッシュになかった。`)
        return
    }
    if (action.to === "summon") {
        summonFreeFromTrashIndex(state, owner, sourceName, idx, action.skipOnSummon ? { skipOnSummon: true } : undefined)
        return
    }
    player.trashCards.splice(idx, 1)
    player.hand.push(cardId)
    log(state, `${player.name}は${sourceName}の効果で${getCard(cardId).name}を手札に戻した。`)
    notifyHandGained(state, owner, 1)
}

const handlers = {
    takeLast: takeLastHandler,
    summonFreeFromTrashIndexInternal: summonFreeFromTrashIndexInternalHandler,
    trashReturnToHandInternal: trashReturnToHandInternalHandler,
} satisfies Partial<ActionRegistry>

export default handlers
