// デッキ破棄（mill）アクションのハンドラ
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import { matchesPick } from "./revealAction"
import type { CardType, EffectAction, EffectCounter, GameState, PlayerId } from "../../type"
import { getCard, log, opponentOf } from "../GameState"
import { millCapBonusFor, millDeck, requestCardChoice } from "../EffectModules"
import { resolveMagicEffects } from "../triggers"
import { fireFieldEventTriggers } from "../fieldEventTriggers"
import { canDiscardHand, hasGlobalConstraint } from "../../../../shared/rules"
import { countedAmount } from "../counted"
import { currentRecordScope, recordMoved } from "../record"
import { chimeiBonus } from "../keywords/chimei"
import { kyokaBonus } from "../keywords/kyoka"
import { hasDeckMillTax, withDeckMillTax } from "../effectTax"

export type DeckDiscard = Extract<EffectAction, { type: "discard"; from: "deck" }>

// 【強化】（青）：相手へのデッキ破棄効果の枚数+n枚。1枚以上破棄するときだけ（Q766）、
// 上限（countMax）のある破棄は上限を超えない（Q764）。ハンドラと pay 判定の両方から使う
export function deckDiscardKyokaCount(state: GameState, owner: PlayerId, action: DeckDiscard, count: number): number {
    if (action.side !== "opponent" || count < 1) return count
    const kyoka = kyokaBonus(state, owner, "deckMill")
    if (kyoka === 0) return count
    return action.countMax !== undefined ? Math.min(count + kyoka, action.countMax + millCapBonusFor(state, owner)) : count + kyoka
}

export function discardFromDeck(ctx: ActionCtx, action: DeckDiscard): void {
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
        // デッキ破棄への税（effectTax on:"deckMill"）：破棄する側が払えなければ破棄ごと不発。再入印が無いときだけ包む
        if (action.side === "opponent" && action.deckMillTaxed !== true && hasDeckMillTax(state, owner)) {
            ctx.resolve(withDeckMillTax(state, owner, state.players[opponentOf(owner)].name, { ...action, deckMillTaxed: true }))
            return
        }
        const targetPid = action.side === "own" ? owner : opponentOf(owner)
        const scope = currentRecordScope(state)
        const beforeLen = state.players[targetPid].trashCards.length
        const until = action.until
        const actual = millDeck(state, targetPid, deckDiscardKyokaCount(state, owner, action, count), owner, srcType ? { sourceType: srcType } : undefined, until ? { until: (id) => matchesPick(id, until) } : undefined)
        recordMoved(state, state.players[targetPid].trashCards.slice(beforeLen, beforeLen + actual), scope)
        if (chimei && actual > 0 && self) fireFieldEventTriggers(state, owner, "ownChimeiMilled", { pid: owner, inst: self }, undefined, undefined, actual)
        return
}



// BS10-X05：手札の指定種別カード1枚を破棄することで（任意コスト。selfBuffByHandDiscardと同型）、
// デッキを上からmaxCount枚を上限に、マジックカードが出るまでトラッシュへ破棄し、
// 出たらそのマジックカードのフラッシュ効果をコストを支払わずに即時発揮する。
// マジックはトラッシュに残したまま効果だけを発揮する（resolveMagicを通さない＝コスト・無効化・
// 使用時誘発を挟まない。resolveMilledFromDeckのマジック分岐と同じ考え方）
function runMillUntilMagicCastFree(state: GameState, owner: PlayerId, sourceName: string, action: { maxCount?: number }, sourceType?: CardType): void {
    const player = state.players[owner]
    const before = player.trashCards.length
    // maxCount 省略時は上限なし（デッキが尽きるまで）
    const milled = millDeck(state, owner, action.maxCount ?? player.deck.length, owner, sourceType !== undefined ? { sourceType } : undefined, { until: (cardId) => getCard(cardId).type === "magic" })
    const last = milled > 0 ? player.trashCards[before + milled - 1] : undefined
    const found = last !== undefined && getCard(last).type === "magic" ? last : undefined
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
    if (!canDiscardHand(state, owner)) {
        log(state, `${sourceName}：手札を破棄できないため、発揮されなかった。`)
        return
    }
    if (chosenCardIndex !== undefined) {
        const cardId = player.hand[chosenCardIndex]
        if (cardId === undefined) {
            log(state, `${sourceName}：破棄する手札がなかった。`)
            return
        }
        player.hand.splice(chosenCardIndex, 1)
        player.trashCards.push(cardId)
        log(state, `${player.name}は手札の${typeLabel}カード「${getCard(cardId).name}」を破棄した。`)
        runMillUntilMagicCastFree(state, owner, sourceName, action, ctx.srcType)
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
    runMillUntilMagicCastFree(state, owner, sourceName, action, ctx.srcType)
}

const handlers = {
    millUntilMagicCastFree: millUntilMagicCastFreeHandler,
} satisfies Partial<ActionRegistry>

export default handlers
