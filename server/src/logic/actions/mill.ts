import type { ActionHandler, ActionRegistry } from "./types"
import type { GameState, PlayerId } from "../../type"
import { getCard, log, opponentOf } from "../GameState"
import { summonFreeFromTrashIndex, countEffectCounter, millCapBonusFor, millDeck, notifyHandGained, requestCardChoice } from "../EffectModules"
import { resolveMagicEffects } from "../triggers"
import { COLOR_LABELS } from "../../../../data/constants"
import { countedAmount } from "../counted"

// 相手のデッキを上から1枚破棄し、**破棄したカード**に応じて続けて解決する
// （BS11-045 MCギンガー／BS11-071 柱岩の海上都市Lv2／BS11-060 雷神砲カノン・アームズ）
const millOpponentThenReactHandler: ActionHandler<"millOpponentThenReact"> = (ctx, action) => {
    const { state, owner, opp, sourceName, srcColors, srcType } = ctx
    const top = state.players[opp].deck[0]
    if (top === undefined) {
        log(state, `${sourceName}：相手のデッキが0枚のため発動しなかった。`)
        return
    }
    if (millDeck(state, opp, 1, owner, srcType ? { sourceType: srcType } : undefined) === 0) {
        log(state, `${sourceName}：デッキを破棄できなかった。`)
        return
    }
    const milled = getCard(top)
    log(state, `${sourceName}：破棄したのは${milled.name}。`)
    if (action.react === "destroyOneSameCost") {
        ctx.resolve(
            { type: "destroy", count: 1, filter: { cost: { min: milled.cost, max: milled.cost } } },
            { sourceColors: srcColors, sourceType: srcType },
        )
        return
    }
    if (action.react === "exhaustOneIfMaxCost") {
        if (action.maxCost === undefined || milled.cost > action.maxCost) {
            log(state, `${sourceName}：破棄したカードのコストが条件に合わなかった。`)
            return
        }
        ctx.resolve({ type: "exhaust", count: 1 }, { sourceColors: srcColors, sourceType: srcType })
        return
    }
    // banHandColorThisBattle：このバトルの間、相手は破棄したカードと同じ色の手札を使えない
    const color = milled.colors[0]
    if (!state.battle || color === undefined) return
    state.battle.handColorBannedFor = { pid: opp, color }
    log(state, `${sourceName}：このバトルの間、${state.players[opp].name}は${COLOR_LABELS[color]}の手札のカードを使えない。`)
}

// BS14-111エクスキューションデストロイ：相手のデッキを上から1枚破棄し、その種別で分岐する
const millThenDestroyByCardTypeHandler: ActionHandler<"millThenDestroyByCardType"> = (ctx) => {
    const { state, owner, opp, sourceName, srcColors, srcType } = ctx
    const top = state.players[opp].deck[0]
    if (top === undefined) {
        log(state, `${sourceName}：相手のデッキが0枚のため発動しなかった。`)
        return
    }
    if (millDeck(state, opp, 1, owner, srcType ? { sourceType: srcType } : undefined) === 0) {
        log(state, `${sourceName}：デッキを破棄できなかった。`)
        return
    }
    const milled = getCard(top)
    log(state, `${sourceName}：破棄したのは${milled.name}。`)
    if (milled.type === "spirit" || milled.type === "brave") {
        ctx.resolve({ type: "destroy", count: 1, chooserIsTarget: true }, { sourceColors: srcColors, sourceType: srcType })
        return
    }
    if (milled.type === "nexus" || milled.type === "magic") {
        ctx.resolve({ type: "destroyNexus", count: 1, chooserIsTarget: true }, { sourceColors: srcColors, sourceType: srcType })
        return
    }
}

const millThenDestroySameCostHandler: ActionHandler<"millThenDestroySameCost"> = (ctx) => {
    const { state, owner, sourceName, srcColors, srcType } = ctx
    const player = state.players[owner]
    const top = player.deck[0]
    if (top === undefined) {
        log(state, `${sourceName}：自分のデッキが0枚のため発動しなかった。`)
        return
    }
    const milled = millDeck(state, owner, 1, owner)
    if (milled === 0) {
        log(state, `${sourceName}：デッキを破棄できなかった。`)
        return
    }
    const cost = getCard(top).cost
    log(state, `${sourceName}：破棄したのは${getCard(top).name}（コスト${String(cost)}）。`)
    ctx.resolve({ type: "destroy", count: 1, all: true, filter: { cost: { min: cost, max: cost } } }, {
        sourceColors: srcColors,
        sourceType: srcType,
    })
}

const millHandler: ActionHandler<"mill"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 【粉砕】：相手（side:"own"指定時は自分）のデッキ上からcount枚をトラッシュへ送る
        // countMax にはマキシマムブレイク（kind:"millCapBonus"）の加算が乗る
        const count =
            action.countCounter !== undefined
                ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType,
                      action.countMax !== undefined ? action.countMax + millCapBonusFor(state, owner) : undefined)
                : action.count
        if (action.countCounter !== undefined && count === 0) {
            state.lastMoved = []
            log(state, `${sourceName}：カウントが0のため粉砕しなかった。`)
            return
        }
        const targetPid = action.side === "own" ? owner : opponentOf(owner)
        const beforeLen = state.players[targetPid].trashCards.length
        const actual = millDeck(state, targetPid, count, owner, srcType ? { sourceType: srcType } : undefined)
        state.lastMoved = state.players[targetPid].trashCards.slice(beforeLen, beforeLen + actual)
        // 続く destroyIfLastMillHadBurst などが読む（BS15-X06鉄の覇王サイゴード・ゴレム）
        state.lastMillHadBurst =
            actual > 0 &&
            state.players[targetPid].trashCards
                .slice(beforeLen, beforeLen + actual)
                .some((cardId) => getCard(cardId).effects.some((e) => e.kind === "burst"))
        return
}

// BS14-X05神獣鳥アン・ズール：自分のデッキを上から1枚破棄し、それが指定系統を持つスピリットカードだったときだけ自身を回復させる
const millSelfTopThenRefreshSelfIfFamilyHandler: ActionHandler<"millSelfTopThenRefreshSelfIfFamily"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
    const player = state.players[owner]
    const cardId = player.deck.shift()
    if (cardId === undefined) {
        log(state, `${sourceName}：デッキが尽きているため破棄できなかった。`)
        return
    }
    player.trashCards.push(cardId)
    const card = getCard(cardId)
    log(state, `${player.name}はデッキを上から1枚（${card.name}）破棄した。`)
    const wanted = Array.isArray(action.familyFilter) ? action.familyFilter : [action.familyFilter]
    if (card.type === "spirit" && wanted.some((f) => card.family.includes(f)) && self) {
        ctx.resolve({ type: "refreshSelf" })
    }
}

const millUntilCostSpiritSummonFreeHandler: ActionHandler<"millUntilCostSpiritSummonFree"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    let found: string | undefined
    let milled = 0
    for (let i = 0; i < action.maxCount; i++) {
        const cardId = player.deck.shift()
        if (cardId === undefined) break
        player.trashCards.push(cardId)
        milled++
        const candidate = getCard(cardId)
        if (candidate.type === "spirit" && action.costs.includes(candidate.cost)) {
            found = cardId
            break
        }
    }
    log(state, `${sourceName}：デッキを上から${milled}枚破棄した。`)
    if (found === undefined) {
        log(state, `${sourceName}：対象のスピリットカードが出なかった。`)
        return
    }
    const idx = player.trashCards.lastIndexOf(found)
    if (idx === -1) return
    summonFreeFromTrashIndex(state, owner, sourceName, idx, action.skipOnSummon ? { skipOnSummon: true } : undefined)
}

const millUntilFamilyToHandHandler: ActionHandler<"millUntilFamilyToHand"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const wanted = Array.isArray(action.family) ? action.family : [action.family]
    let found: string | undefined
    let milled = 0
    for (let i = 0; i < action.maxCount; i++) {
        const cardId = player.deck.shift()
        if (cardId === undefined) break
        player.trashCards.push(cardId)
        milled++
        const candidate = getCard(cardId)
        if (candidate.type === "spirit" && wanted.some((f) => candidate.family.includes(f))) {
            found = cardId
            break
        }
    }
    log(state, `${sourceName}：デッキを上から${milled}枚破棄した。`)
    if (found === undefined) {
        log(state, `${sourceName}：対象のスピリットカードが出なかった。`)
        return
    }
    const idx = player.trashCards.lastIndexOf(found)
    if (idx === -1) return
    player.trashCards.splice(idx, 1)
    player.hand.push(found)
    log(state, `${player.name}は${sourceName}の効果で${getCard(found).name}を手札に戻した。`)
    notifyHandGained(state, owner, 1)
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

// バースト専用：millと同じ計算で相手のデッキを破棄し、破棄した中に【バースト】効果を持つカードが
// あれば続けて自身をコストを支払わずに召喚する（BS15-X06鉄の覇王サイゴード・ゴレム）
const millPerThenSummonSelfIfBurstMilledHandler: ActionHandler<"millPerThenSummonSelfIfBurstMilled"> = (ctx, action) => {
    const { state, owner, self, srcType, sourceName } = ctx
    const raw = countEffectCounter(state, owner, self, action.counter, srcType)
    const count = raw * (action.multiplier ?? 1)
    if (count === 0) {
        log(state, `${sourceName}：カウントが0のため破棄しなかった。`)
        return
    }
    const targetPid = opponentOf(owner)
    const beforeLen = state.players[targetPid].trashCards.length
    const actual = millDeck(state, targetPid, count, owner, srcType ? { sourceType: srcType } : undefined)
    state.lastMillHadBurst =
        actual > 0 &&
        state.players[targetPid].trashCards
            .slice(beforeLen, beforeLen + actual)
            .some((cardId) => getCard(cardId).effects.some((e) => e.kind === "burst"))
    if (!state.lastMillHadBurst) {
        log(state, `${sourceName}：バースト効果を持つカードは破棄されなかった。`)
        return
    }
    ctx.resolve({ type: "summonBurstCardFree" })
}

// P071サイゴード・アームズ【合体時】：相手のデッキを上からcount枚破棄し、破棄した中に【バースト】効果を
// 持つカードが1枚でもあればボイドからコア1個をこのスピリット上に置く（合体中はselfがホストなのでホストに置かれる）
const millThenCoreIfBurstHandler: ActionHandler<"millThenCoreIfBurst"> = (ctx, action) => {
    const { state, owner, srcType } = ctx
    const targetPid = opponentOf(owner)
    const beforeLen = state.players[targetPid].trashCards.length
    const actual = millDeck(state, targetPid, action.count, owner, srcType ? { sourceType: srcType } : undefined)
    state.lastMillHadBurst =
        actual > 0 &&
        state.players[targetPid].trashCards
            .slice(beforeLen, beforeLen + actual)
            .some((cardId) => getCard(cardId).effects.some((e) => e.kind === "burst"))
    if (!state.lastMillHadBurst) return
    ctx.resolve({ type: "voidCoreToSelf", count: 1 })
}

const handlers = {
    millSelfTopThenRefreshSelfIfFamily: millSelfTopThenRefreshSelfIfFamilyHandler,
    millOpponentThenReact: millOpponentThenReactHandler,
    millThenDestroyByCardType: millThenDestroyByCardTypeHandler,
    millThenDestroySameCost: millThenDestroySameCostHandler,
    mill: millHandler,
    millUntilCostSpiritSummonFree: millUntilCostSpiritSummonFreeHandler,
    millUntilFamilyToHand: millUntilFamilyToHandHandler,
    millUntilMagicCastFree: millUntilMagicCastFreeHandler,
    millPerThenSummonSelfIfBurstMilled: millPerThenSummonSelfIfBurstMilledHandler,
    millThenCoreIfBurst: millThenCoreIfBurstHandler,
} satisfies Partial<ActionRegistry>

export default handlers
