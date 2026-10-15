// デッキ破棄（mill）アクションのハンドラ
import type { ActionHandler, ActionRegistry } from "./types"
import { matchesPick } from "./revealAction"
import type { CardInstance, EffectCounter, GameState, PlayerId } from "../../type"
import { getCard, log, opponentOf } from "../GameState"
import { summonFreeFromTrashIndex, countEffectCounter, millCapBonusFor, millDeck, notifyHandGained, requestCardChoice } from "../EffectModules"
import { resolveMagicEffects, fireFieldEventTriggers } from "../triggers"
import { countedAmount } from "../counted"
import { currentRecordScope, recordMoved } from "../record"
import { chimeiBonus } from "../keywords/chimei"

const millHandler: ActionHandler<"mill"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 【地鳴】の破棄（キーワードの定型文が chimei:true を付ける）。ほかの効果が【地鳴】の枚数を参照して破棄しても【地鳴】の破棄ではない
        const chimei = action.chimei === true
        const bonus = chimei ? chimeiBonus(state, owner) : 0
        const counter = bonus > 0 && typeof action.countCounter === "object" && "minus" in action.countCounter && typeof action.countCounter.minus[0] === "object" && "const" in action.countCounter.minus[0]
            ? { minus: [{ const: action.countCounter.minus[0].const + bonus }, action.countCounter.minus[1]] as [EffectCounter, EffectCounter] }
            : action.countCounter
        // 【粉砕】：相手（side:"own"指定時は自分）のデッキ上からcount枚をトラッシュへ送る
        // countMax にはマキシマムブレイク（kind:"millCapBonus"）の加算が乗る
        const count =
            counter !== undefined
                ? countedAmount(state, owner, self, action.count ?? 1, counter, srcType,
                      action.countMax !== undefined ? action.countMax + millCapBonusFor(state, owner) : undefined)
                : action.count
        if (action.countCounter !== undefined && count === 0) {
            recordMoved(state, [])
            log(state, `${sourceName}：カウントが0のため粉砕しなかった。`)
            return
        }
        const targetPid = action.side === "own" ? owner : opponentOf(owner)
        const scope = currentRecordScope(state)
        const beforeLen = state.players[targetPid].trashCards.length
        const until = action.until
        const actual = millDeck(state, targetPid, count, owner, srcType ? { sourceType: srcType } : undefined, until ? { until: (id) => matchesPick(id, until) } : undefined)
        recordMoved(state, state.players[targetPid].trashCards.slice(beforeLen, beforeLen + actual), scope)
        if (chimei && actual > 0 && self) fireFieldEventTriggers(state, owner, "ownChimeiMilled", { pid: owner, inst: self }, undefined, undefined, actual)
        return
}



// BS10-X05：手札の指定種別カード1枚を破棄することで（任意コスト。selfBuffByHandDiscardと同型）、
// デッキを上からmaxCount枚を上限に、マジックカードが出るまでトラッシュへ破棄し、
// 出たらそのマジックカードのフラッシュ効果をコストを支払わずに即時発揮する。
// マジックはトラッシュに残したまま効果だけを発揮する（resolveMagicを通さない＝コスト・無効化・
// 使用時誘発を挟まない。resolveMilledFromDeckのマジック分岐と同じ考え方）
function runMillUntilMagicCastFree(state: GameState, owner: PlayerId, sourceName: string, action: { maxCount?: number }): void {
    const player = state.players[owner]
    let found: string | undefined
    let milled = 0
    // maxCount 省略時は上限なし（デッキが尽きれば shift が undefined を返して止まる）
    for (let i = 0; action.maxCount === undefined || i < action.maxCount; i++) {
        const cardId = player.deck.shift()
        if (cardId === undefined) break
        player.trashCards.push(cardId)
        milled++
        if (getCard(cardId).type === "magic") {
            found = cardId
            break
        }
    }
    log(state, `${sourceName}：デッキを上から${milled}枚破棄した。`)
    if (found === undefined) {
        log(state, `${sourceName}：マジックカードが出なかった。`)
        return
    }
    log(state, `${sourceName}：${getCard(found).name}のフラッシュ効果をコストを支払わずに発揮した。`)
    state.keishoExcludedCardIds = []
    resolveMagicEffects(state, owner, found, "flash", undefined)
}

const CARD_TYPE_LABELS: Record<"spirit" | "nexus" | "magic", string> = {
    spirit: "スピリット",
    nexus: "ネクサス",
    magic: "マジック",
}

const millUntilMagicCastFreeHandler: ActionHandler<"millUntilMagicCastFree"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    const typeLabel = CARD_TYPE_LABELS[action.discardCardType]
    if (chosenCardIndex !== undefined) {
        const cardId = player.hand[chosenCardIndex]
        if (cardId === undefined) {
            log(state, `${sourceName}：破棄する手札がなかった。`)
            return
        }
        player.hand.splice(chosenCardIndex, 1)
        player.trashCards.push(cardId)
        log(state, `${player.name}は手札の${typeLabel}カード「${getCard(cardId).name}」を破棄した。`)
        runMillUntilMagicCastFree(state, owner, sourceName, action)
        return
    }
    const indices = player.hand.map((_, i) => i).filter((i) => getCard(player.hand[i]!).type === action.discardCardType)
    if (indices.length === 0) {
        log(state, `${sourceName}：手札に${typeLabel}カードがなかった。`)
        return
    }
    if (state.interactiveTargets) {
        requestCardChoice(
            state,
            owner,
            `${sourceName}：${typeLabel}カード1枚を破棄して発動できます（任意）`,
            "hand",
            indices,
            true,
            action,
            self,
        )
        return
    }
    const idx = indices[indices.length - 1]!
    const cardId = player.hand[idx]!
    player.hand.splice(idx, 1)
    player.trashCards.push(cardId)
    log(state, `${player.name}は手札の${typeLabel}カード「${getCard(cardId).name}」を破棄した。`)
    runMillUntilMagicCastFree(state, owner, sourceName, action)
}

const handlers = {
    mill: millHandler,
    millUntilMagicCastFree: millUntilMagicCastFreeHandler,
} satisfies Partial<ActionRegistry>

export default handlers
