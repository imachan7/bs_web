// 【バースト】のセットと発動
import { requestActivationConfirm } from "../targeting"
import { resolveAction } from "../EffectModules"
import type { EffectAction, EffectDef, GameState, PlayerId } from "../../type"
import { fieldInstanceIdsOf, getCard, log } from "../GameState"
import { fireFieldEventTriggers, notifyHandGained } from "../triggers"
import { effectiveCost, magicEffectiveColors } from "../../../../shared/cost"

// バーストのセット共通処理（docs/design/BURST.md）。既にセット済みなら旧カードを先にトラッシュへ送る。
// 手札からの取り出し・ターン1回制限の消費は呼び出し側（GameEngine.doSetBurst / setBurstFromHandハンドラ）が行う
// （setBurstFromHandはターン1回制限を受けないため、ここでは触らない）
export function placeBurst(state: GameState, pid: PlayerId, cardId: string): void {
    const player = state.players[pid]
    if (player.burst !== null) {
        const oldName = getCard(player.burst).name
        player.trashCards.push(player.burst)
        // トラッシュは公開ゾーンなので、この時点でカード名を出しても非公開情報は漏れない
        log(state, `${player.name}は既にセットしていたバースト（${oldName}）をトラッシュに置いた。`)
    }
    player.burst = cardId
    player.burstSet = true
    // ⚠️ バーストは非公開ゾーンなので、セットした時点ではカード名をログに出さない（相手にも自分の
    // 画面にも同じログが配信されるため。GameState.viewFor は log を両者に同じ内容で配る）
    log(state, `${player.name}はバーストをセットした。`)
    fireFieldEventTriggers(state, pid, "ownBurstSet")
}

// バースト発動の後処理（docs/design/BURST.md）。summonBurstCardFree はアクション自身が場へ出すので
// バーストエリアを空にするだけ、それ以外（マジック相当）は解決後にトラッシュへ送る。
// 続けて thenPay（「その後コストを支払うことで、このカードのメイン/フラッシュ効果を発揮する」）を確認する。
// **resolveMagicは経由しない**（マジックバーストは「バースト発動」であって「マジックの使用」ではないため。
// state.magicUsedThisTurn / ownMagicUsed・opponentMagicUsedの誤発火を避ける）
export function finishBurstActivation(
    state: GameState,
    pid: PlayerId,
    cardId: string,
    actionType: EffectAction["type"],
    thenPay: "main" | "flash" | undefined,
    opts?: { toHand?: true }, // returnSelfToHandAfter（docs/design/BURST.md）：既定の行き先（トラッシュ）を上書きして手札へ戻す（BS14-X02）
): void {
    const player = state.players[pid]
    // sequence／if の中で召喚した場合は、summonBurstCardFree がバーストエリアを空にしているので下の分岐に入らない
    if (actionType !== "summonBurstCardFree") {
        if (player.burst === cardId) {
            player.burst = null
            player.burstSet = false
        }
        if (opts?.toHand) {
            player.hand.push(cardId)
            log(state, `${player.name}の${getCard(cardId).name}はバーストとして発動し、手札に戻った。`)
            notifyHandGained(state, pid, 1)
        } else {
            player.trashCards.push(cardId)
            log(state, `${player.name}の${getCard(cardId).name}はバーストとして発動し、トラッシュに置かれた。`)
        }
    } else if (player.burst === cardId) {
        // 通常はハンドラ自身（summonBurstCardFree）が空にしているはずだが、
        // 不発（コア不足等）だった場合に備えて念のため空にしておく
        player.burst = null
        player.burstSet = false
    }
    tryBurstThenPay(state, pid, cardId, thenPay)
}

function tryBurstThenPay(
    state: GameState,
    pid: PlayerId,
    cardId: string,
    thenPay: "main" | "flash" | undefined,
): void {
    if (thenPay === undefined) return
    if (state.winner) return
    const card = getCard(cardId)
    const entry = card.effects.find((e): e is Extract<EffectDef, { kind: "magic" }> => e.kind === "magic" && e.timing === thenPay)
    if (!entry) return
    const cost = effectiveCost(state, pid, card)
    const player = state.players[pid]
    // 「コストを支払えるときだけ発揮できる」＝COST_MODEL.md §1。払えないなら確認自体を出さずスキップ
    if (player.reserve < cost) return
    if (state.interactiveTargets) {
        requestActivationConfirm(
            state,
            pid,
            `${card.name}：コスト${cost}を支払って効果を発揮しますか？`,
            entry.action,
            null,
        )
        if (state.pendingChoice) state.pendingChoice.burstThenPay = { pid, cost, cardId }
        return
    }
    player.reserve -= cost
    log(state, `${player.name}は${card.name}のコスト${cost}を支払った。`)
    // 色は magicEffectiveColors を通す（BS15-015吸血令嬢エサルフリーダ Lv1-3。BS15_PLAN.md §7.3）
    resolveAction(state, pid, null, entry.action, undefined, magicEffectiveColors(state, pid, card), "magic", undefined, undefined, cardId)
}

// バーストの解決がすべて終わった後（ownBurstActivated）。**発動開始時点で場にいた発生源にだけ発火させる**
// （before＝発動開始時点のフィールドのinstanceId集合。summonBurstCardFreeで新しく場に出た個体には
// 発火しない。2026-09-11 ユーザー確認）
export function fireOwnBurstActivated(
    state: GameState,
    pid: PlayerId,
    before: Set<string>,
    cardId: string,
): void {
    if (state.winner) return
    const after = fieldInstanceIdsOf(state, pid)
    const excludeInstanceIds = [...after].filter((id) => !before.has(id))
    fireFieldEventTriggers(
        state,
        pid,
        "ownBurstActivated",
        undefined,
        undefined,
        undefined,
        undefined,
        { burstCost: getCard(cardId).cost },
        undefined,
        undefined,
        excludeInstanceIds,
    )
}
