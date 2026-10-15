// オープン統合の器 reveal（docs/design/REVEAL_UNIFY.md §4）。
// reveal.ts（旧17 type の置き場）は増やさず、こちらに新設する。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardPick, EffectAction, PlayerId, PlayerState } from "../../type"
import { createInstance, currentLevel, getCard, log, minLevelCores, pushResumeFrames } from "../GameState"
import { payCost, fireSummonSequence, fireSummonTrigger, notifyHandGained, requestCardChoice, requestChoice, resolveTensho } from "../EffectModules"
import { notifyNexusDeployed, resolveMagicEffects } from "../triggers"
import { cardHasTeam, isVanillaCard } from "../../../../shared/rules/level"
import { hasKeyword, instHasColor, countSymbols, summonByEffectBlocked } from "../../../../shared/rules"
import { effectiveCost } from "../../../../shared/cost"
import { activateBurstCard } from "../keywords/burst"
import { recordMoved } from "../record"

type RevealDest = NonNullable<Extract<EffectAction, { type: "revealApplyOne" }>["dest"]>

export // バーストエリアのカードを外して返す（オープンしたら元のバーストではなくなる）
function takeOwnBurst(player: PlayerState): string[] {
    const cardId = player.burst
    if (cardId === null) return []
    player.burst = null
    player.burstSet = false
    return [cardId]
}

// costOverride＝待機状態に入ったときのコスト（記録があるとき。if の cond.last）
// selfCardId＝発生源のカード（differentNameFromSelf の比較相手）
export function matchesPick(id: string, pick: CardPick | undefined, costOverride?: number, selfCardId?: string): boolean {
    if (!pick) return true
    const card = getCard(id)
    if (pick.differentNameFromSelf === true && selfCardId !== undefined && card.name === getCard(selfCardId).name) return false
    if (pick.nameExcludes !== undefined && card.name === pick.nameExcludes) return false
    if (pick.name !== undefined && card.name !== pick.name) return false
    if (pick.cardType !== undefined) {
        const wanted = Array.isArray(pick.cardType) ? pick.cardType : [pick.cardType]
        if (!wanted.includes(card.type)) return false
    }
    if (pick.family !== undefined) {
        const wanted = Array.isArray(pick.family) ? pick.family : [pick.family]
        if (!wanted.some((f) => card.family.includes(f))) return false
    }
    if (pick.familyAll !== undefined && !pick.familyAll.every((f) => card.family.includes(f))) return false
    if (pick.color !== undefined && !(Array.isArray(pick.color) ? pick.color : [pick.color]).some((c) => card.colors.includes(c))) return false
    if (pick.anyOf !== undefined && !pick.anyOf.some((p) => matchesPick(id, p, costOverride, selfCardId))) return false
    if (pick.noBurst === true && card.effects.some((e) => e.kind === "burst")) return false
    if (pick.hasWhileCombined === true && !card.effects.some((e) => "whileCombined" in e && e.whileCombined === true)) return false
    if (pick.hasTrigger !== undefined && !card.effects.some((e) => e.kind === "triggered" && e.trigger === pick.hasTrigger)) return false
    if (pick.keyword !== undefined && !hasKeyword(id, pick.keyword)) return false
    if (pick.hasEx === true && card.symbolEx !== true) return false
    if (pick.nameIncludes !== undefined && !card.name.includes(pick.nameIncludes)) return false
    if (pick.team !== undefined && !cardHasTeam(card, pick.team)) return false
    if (pick.cost !== undefined) {
        const cost = costOverride ?? card.cost
        if (typeof pick.cost === "number") {
            if (cost !== pick.cost) return false
        } else {
            if (pick.cost.min !== undefined && cost < pick.cost.min) return false
            if (pick.cost.max !== undefined && cost > pick.cost.max) return false
        }
    }
    if (pick.costIn !== undefined && !pick.costIn.includes(costOverride ?? card.cost)) return false
    if (pick.vanilla === true && !isVanillaCard(card)) return false
    if (pick.keisho === true && !card.effects.some((e) => e.kind === "exTrashReduction")) return false
    if (pick.hasBurst === true && !card.effects.some((e) => e.kind === "burst")) return false
    if (pick.burstEvent !== undefined && !card.effects.some((e) => e.kind === "burst" && e.event === pick.burstEvent)) return false
    return true
}

// dest の失敗（型不一致・維持コア不足・召喚禁止）時の行き先。orHand指定時のみ手札、それ以外はトラッシュ
function failDest(ctx: ActionCtx, orHand: boolean | undefined, cardId: string): void {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    if (orHand) {
        player.hand.push(cardId)
        notifyHandGained(state, owner, 1)
        log(state, `${sourceName}：${getCard(cardId).name}を手札に加えた。`)
    } else {
        player.trashCards.push(cardId)
    }
}

// 選ばれた1枚（すでに元のゾーンから除いてある）を dest へ送る
function applyPicked(ctx: ActionCtx, action: Extract<EffectAction, { type: "revealApplyOne" }>): void {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const cardId = action.cardId
    const card = getCard(cardId)
    // 「召喚/配置できる」：ネクサスは配置、それ以外は召喚
    const dest: RevealDest = action.dest === "summonOrPlace" ? (card.type === "nexus" ? "placeNexus" : "summon") : (action.dest ?? "hand")
    switch (dest) {
        case "hand":
            player.hand.push(cardId)
            notifyHandGained(state, owner, 1)
            log(state, `${player.name}は${sourceName}の効果で、${card.name}を手札に加えた。`)
            return
        case "trash":
            player.trashCards.push(cardId)
            log(state, `${player.name}は${sourceName}の効果で、${card.name}を破棄した。`)
            return
        case "deckBottom":
            state.players[action.srcPid].deck.push(cardId)
            log(state, `${sourceName}：${card.name}をデッキの下に戻した。`)
            return
        case "activateBurst":
            activateBurstCard(state, owner, cardId)
            return
        case "tegamoto":
            player.tegamoto.push(cardId)
            log(state, `${player.name}は${sourceName}の効果で、${card.name}を手元に置いた。`)
            return
        case "placeNexus": {
            if (card.type !== "nexus") {
                player.trashCards.push(cardId)
                return
            }
            const maintain = minLevelCores(card)
            const cost = action.pay === "cost" ? effectiveCost(state, owner, card) : 0
            if (player.reserve < maintain + cost) {
                log(state, `${sourceName}：リザーブが足りず${card.name}を配置できなかった。`)
                player.trashCards.push(cardId)
                return
            }
            payCost(state, owner, cost, undefined, maintain)
            player.reserve -= maintain
            const inst = createInstance(cardId, state.turn, maintain)
            player.field.nexuses.push(inst)
            log(state, `${player.name}は${sourceName}の効果で、${card.name}を${action.pay === "cost" ? `コスト${cost}を支払って` : "コストを支払わずに"}配置した。`)
            notifyNexusDeployed(state, owner)
            return
        }
        case "cast": {
            if (card.type !== "magic") {
                failDest(ctx, action.orHand, cardId)
                return
            }
            log(state, `${sourceName}：${card.name}のフラッシュ効果をコストを支払わずに使用した。`)
            state.keishoExcludedCardIds = []
            resolveMagicEffects(state, owner, cardId, "flash", undefined)
            return
        }
        case "summon": {
            // ブレイヴはスピリット状態で召喚する（旧 revealTopSummonFreeOrHand と同じ）
            if (card.type !== "spirit" && card.type !== "brave") {
                failDest(ctx, action.orHand, cardId)
                return
            }
            if (summonByEffectBlocked(state)) {
                log(state, `${sourceName}：効果による召喚が禁じられているため発動しなかった。`)
                failDest(ctx, action.orHand, cardId)
                return
            }
            const maintain = minLevelCores(card)
            const cost = action.pay === "cost" ? effectiveCost(state, owner, card) : 0
            if (player.reserve < maintain + cost) {
                log(state, `${sourceName}：リザーブが足りず${card.name}を召喚できなかった。`)
                failDest(ctx, action.orHand, cardId)
                return
            }
            payCost(state, owner, cost, undefined, maintain)
            player.reserve -= maintain
            const inst = createInstance(cardId, state.turn, maintain)
            if (action.returnToDeckBottomAtEndStep) inst.returnToDeckBottomAtEndStep = true
            if (action.destroyAtBattleEnd) inst.destroyAtBattleEnd = true
            player.field.spirits.push(inst)
            log(state, `${player.name}は${sourceName}の効果で、${card.name}を${action.pay === "cost" ? `コスト${cost}を支払って` : "コストを支払わずに"}召喚した。`)
            if (action.tensho === undefined) {
                if (!state.winner) resolveTensho(state, owner, inst)
                if (state.pendingChoice) {
                    pushResumeFrames(state, [
                        {
                            kind: "action",
                            selfInstanceId: inst.instanceId,
                            actorPid: owner,
                            action: { type: "revealFinishSummon", ...(action.noSummonEffects ? { noSummonEffects: true as const } : {}) },
                        },
                    ])
                    return
                }
                if (action.noSummonEffects) {
                    log(state, `${sourceName}：『召喚時』効果は発揮されない。`)
                    return
                }
                if (!state.winner) fireSummonSequence(state, owner, inst)
                return
            }
            if (action.noSummonEffects) {
                log(state, `${sourceName}：『召喚時』効果は発揮されない。`)
                return
            }
            // asIfDone：【転召】を発揮したものとして扱うため resolveTensho は呼ばない。
            // 召喚時効果は fireSummonTrigger のみ（fieldEvent ownSpiritSummoned は起こさない。旧revealAndSummonKeywordの挙動を踏襲）
            if (action.tensho === "asIfDone") {
                if (!state.winner) fireSummonTrigger(state, owner, inst)
                return
            }
            // none：転召させない。効果は通常どおり
            if (!state.winner) fireSummonSequence(state, owner, inst)
            return
        }
    }
}

const revealApplyOneHandler: ActionHandler<"revealApplyOne"> = (ctx, action) => {
    applyPicked(ctx, action)
}

const revealFinishSummonHandler: ActionHandler<"revealFinishSummon"> = (ctx, action) => {
    const { state, owner, self } = ctx
    if (!self || state.winner) return
    if (action.noSummonEffects) return
    fireSummonSequence(state, owner, self)
}

const revealRestHandler: ActionHandler<"revealRest"> = (ctx, action) => {
    const { state, owner, sourceName, self, chosenCardIndex, chosenOption } = ctx
    const destPlayer = state.players[action.destPid]
    let rest = action.rest ?? "deckBottom"
    // 「デッキの上か下に戻す」：上下は残り全体でまとめて1回選ぶ。非対話（自動解決）は下
    if (rest === "deckTopOrBottom") {
        if ((state.revealedCards?.cardIds.length ?? 0) === 0) {
            delete state.revealedCards
            return
        }
        if (chosenOption === undefined && state.interactiveTargets) {
            requestChoice(state, owner, `${sourceName}：残りをデッキの上と下のどちらに戻しますか`, [], false, action, self, "option", ["デッキの上", "デッキの下"])
            return
        }
        rest = chosenOption === "デッキの上" ? "deckTop" : "deckBottom"
    }
    if (rest === "trash" || rest === "hand") {
        const zone = state.revealedCards
        const ids = zone ? zone.cardIds : []
        if (ids.length > 0) {
            if (rest === "trash") {
                destPlayer.trashCards.push(...ids)
                log(state, `${destPlayer.name}は残り${ids.length}枚をトラッシュに置いた。`)
            } else {
                destPlayer.hand.push(...ids)
                notifyHandGained(state, action.destPid, ids.length)
                log(state, `${destPlayer.name}は残り${ids.length}枚を手札に加えた。`)
            }
        }
        if (zone) delete state.revealedCards
        return
    }
    // deckTop／deckBottom：戻す順番を1枚ずつ選ばせる（使用者(ctx.owner)が選ぶ。公開したのが相手のデッキでも同じ）
    const toTop = rest === "deckTop"
    const placed = action.placed ?? 0
    const pool = action.pool ? [...action.pool] : [...(state.revealedCards?.cardIds ?? [])]
    // 選択待ちの間は表示のために公開中へ戻しているので、再開時も必ず消す（残すとエンジンの後始末が同じカードをもう一度戻す）
    delete state.revealedCards
    let nextPlaced = placed
    if (chosenCardIndex !== undefined) {
        const id = pool[chosenCardIndex]
        if (id !== undefined) {
            pool.splice(chosenCardIndex, 1)
            if (toTop) {
                destPlayer.deck.splice(placed, 0, id)
                nextPlaced = placed + 1
            } else {
                destPlayer.deck.push(id)
            }
            log(state, `${destPlayer.name}は${getCard(id).name}をデッキの${toTop ? "上" : "下"}に戻した。`)
        }
    }
    if (pool.length === 0) return
    if (state.interactiveTargets && pool.length >= 2) {
        state.revealedCards = { pid: action.destPid, cardIds: pool }
        requestCardChoice(
            state,
            owner,
            `${sourceName}：${destPlayer.name}のデッキの${toTop ? "上" : "下"}に戻す順番（残り${pool.length}枚。先に選んだカードが${toTop ? "上" : "下寄り"}）`,
            "reveal",
            pool.map((_, i) => i),
            false,
            { type: "revealRest", destPid: action.destPid, rest, pool, placed: nextPlaced },
            self,
        )
        return
    }
    if (toTop) destPlayer.deck.splice(nextPlaced, 0, ...pool)
    else destPlayer.deck.push(...pool)
}

// オープンするだけ（選ぶ・残りを送るのは moveCards from:"revealed"）
const revealOpenHandler: ActionHandler<"revealOpen"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName } = ctx
    const from = action.from ?? "ownDeck"
    const srcPid: PlayerId = from === "opponentDeck" ? opp : owner
    const srcPlayer = state.players[srcPid]
    const countPer = action.countPer
    const count = action.countFromSelfLevel && self
        ? currentLevel(self).level
        : countPer
          ? "ownColorTotal" in countPer
              ? [...state.players[owner].field.spirits, ...state.players[owner].field.nexuses].filter((s) => instHasColor(s, countPer.ownColorTotal)).length
              : "keishoExcluded" in countPer
                ? state.keishoExcludedCardIds?.length ?? 0
                : "ownSymbols" in countPer
                ? countSymbols(state.players[owner], [countPer.ownSymbols])
                : state.players[owner].field.nexuses.length
          : action.count ?? 0
    const revealed = from === "burst" ? takeOwnBurst(srcPlayer) : srcPlayer.deck.splice(0, count)
    recordMoved(state, [...revealed])
    if (revealed.length === 0) {
        log(state, from === "burst" ? `${sourceName}：バーストをセットしていなかった。` : `${sourceName}：デッキにカードがないため公開できなかった。`)
        return
    }
    log(state, `${srcPlayer.name}は${from === "burst" ? "バースト" : `デッキ上${revealed.length}枚`}（${revealed.map((id) => getCard(id).name).join("、")}）を公開した。`)
    state.revealedCards = { pid: srcPid, cardIds: revealed }
    if (action.destroySelfIf && revealed.some((id) => matchesPick(id, action.destroySelfIf, undefined, ctx.sourceCardId))) ctx.resolve({ type: "destroySelf" })
}

const handlers = {
    revealOpen: revealOpenHandler,
    revealApplyOne: revealApplyOneHandler,
    revealRest: revealRestHandler,
    revealFinishSummon: revealFinishSummonHandler,
} satisfies Partial<ActionRegistry>

export default handlers
