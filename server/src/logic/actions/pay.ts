// 「〜することで〜する」の汎用の器（COST_MODEL.md §1）。cost・thenとも書いてある数どおりに
// 解決できるときだけ発揮する。判定を通すのはこのファイルだけの責務で、実際の解決は
// 各typeの既存ハンドラへ resolveInOrder 経由でそのまま委譲する（sequenceと同じ frame の作り方）。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, CardType, Color, EffectAction, GameState, PlayerId, ResolvedTargetFilter } from "../../type"
import { findInstanceAnywhere, getCard, log, opponentOf, resolveInOrder } from "../GameState"
import { revertDestroyGroupUsage, revertOncePerTurn } from "../triggers"
import { canExhaustNexus } from "../EffectModules"
import { kyoshuLimitOf, kyoshuUsedOf } from "../keywords/kyoshu"
import { canDiscardHand, cantReduceOpponentLife, effectiveBp, hasGlobalConstraint, isEndStepLocked, lifeImmuneThisTurn, matchesFamilyFilter, matchesTarget, ownLifeImmuneToOpponentSpiritEffects } from "../../../../shared/rules"
import { discardSelfChooseEligible } from "./drawDiscard"
import { destroyCandidateCountForPay, destroyNexusCandidateCountForPay, nexusHasCoresForPay } from "./destroy"
import { returnToDeckTopCandidateCountForPay, returnToHandCandidateCountForPay } from "./bounce"
import { coreRemoveAchievableCountForPay } from "./cores"
import { removeCoresAchievableCountForPay } from "./removeCores"
import { availableFromSource, placeCoresPoolCandidates } from "./placeCores"
import { refreshOneOwnCandidates } from "./exhaustRefresh"
import { summonFromHandFreeCandidateMatches, summonFromTrashFreeCandidateMatches } from "../summon"
import { recoverSpiritFromTrashCandidateOk, recoverMagicFromTrashCandidateOk } from "./trashRecover"
import { findSpiritAny, millCapBonusFor, voidCorePlacementBlocked } from "../EffectModules"
import { pickAnySideCandidates, pickBpBuffTarget, pickEnemyByBp, pickEnemyCandidates, bpBuffTargetPasses, requestActivationConfirm } from "../targeting"
import { countedAmount } from "../counted"
import { normalizeFilter, SELF_REQUIRED } from "./filter"
import { newRecordScope, withMovedProbe } from "../record"
import { matchesPick } from "./revealAction"

// 判定表に載っている type だけが pay の cost/then に書ける（scripts/validate-cards.ts が突き合わせる）
export const PAYABLE_TYPES = [
    "discardSelfChoose", "draw", "discardOpponent", "setBurstFromHand", "timedEffect",
    "destroy", "returnToHand", "returnToDeckTop", "destroyNexus", "coreRemove", "removeCores", "refreshSelf", "nexusCoresToTrash",
    "exhaust", "mill", "discardBurst", "discardHandAll",
    "bpBuff", "refreshOne", "placeCores", "summonFromHandFree", "summonFromTrashFree",
    "recoverSpiritFromTrash", "recoverMagicFromTrash", "destroyByBpBudget", "destroyBlockerAfterBattle",
    "lifeCrush", "levelOverrideOpponentNexuses", "colorlessSelfThisBattle", "protectLifeByCostThisTurn",
    "negateLifeDamageFromTarget", "toTegamoto", "lendSelfThisTurn", "returnToDeckBottom",
    "peekOpponentHand", "sequence", "simultaneous", "destroySelf", "treatAsUnblocked",
] as const

type Checker = (state: GameState, owner: PlayerId, self: CardInstance | null, action: EffectAction, srcColors: Color[] | undefined, srcType: CardType | undefined, eventTarget?: string) => boolean

const CHECKERS: Partial<Record<EffectAction["type"], Checker>> = {
    discardSelfChoose: (state, owner, _self, action) => {
        if (action.type !== "discardSelfChoose") return false
        if (!canDiscardHand(state, owner)) return false
        const count = state.players[owner].hand.filter((cardId) => discardSelfChooseEligible(cardId, action)).length
        return action.count === "any" || count >= action.count
    },
    draw: (state, owner, self, action, _srcColors, srcType) => {
        if (action.type !== "draw") return false
        const count =
            action.countCounter !== undefined
                ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
                : action.count
        return state.players[owner].deck.length >= count
    },
    discardOpponent: (state, owner, _self, action) => {
        if (action.type !== "discardOpponent") return false
        const targetPid = action.forcedTargetPid ?? opponentOf(owner)
        const target = state.players[targetPid]
        const count = action.cardTypeFilter
            ? target.hand.filter((cardId) => getCard(cardId).type === action.cardTypeFilter).length
            : target.hand.length
        return count >= action.count
    },
    toTegamoto: (state, owner, _self, action) => {
        if (action.type !== "toTegamoto") return false
        return action.count === "any" || state.players[owner].hand.filter((id) => matchesPick(id, action.pick)).length >= action.count
    },
    lendSelfThisTurn: () => true,
    // peekOpponentHand：相手の手札が1枚以上あるか
    peekOpponentHand: (state, owner) => state.players[opponentOf(owner)].hand.length >= 1,
    // sequence：中身のアクションすべてが成立するときだけ成立（一般則どおり「書いてある数どおり」全部）
    sequence: (state, owner, self, action, srcColors, srcType, eventTarget) => {
        if (action.type !== "sequence") return false
        return action.actions.every((a) => canPayResolve(state, owner, self, a, srcColors, srcType, eventTarget))
    },
    // simultaneous：中の全部が成立するとき。自分自身を壊す組では、同じ個体を相手方の destroy の候補に数えない
    simultaneous: (state, owner, self, action, srcColors, srcType, eventTarget) => {
        if (action.type !== "simultaneous") return false
        const withSelf = action.actions.some((a) => a.type === "destroySelf")
        return action.actions.every((a) => {
            if (withSelf && a.type === "destroy" && a.side === "own" && a.count !== "any" && self) {
                const filter = { ...(a.filter ?? {}) } as unknown as ResolvedTargetFilter
                const n = state.players[owner].field.spirits.filter((s) => s.instanceId !== self.instanceId && matchesTarget(state, owner, s, filter, self.instanceId)).length
                return n >= a.count
            }
            return canPayResolve(state, owner, self, a, srcColors, srcType, eventTarget)
        })
    },
    destroySelf: (state, owner, self) => self !== null && state.players[owner].field.spirits.some((s) => s.instanceId === self.instanceId),
    setBurstFromHand: (state, owner) => {
        return state.players[owner].hand.some((cardId) => getCard(cardId).effects.some((e) => e.kind === "burst"))
    },
    // 自分自身に置くものは自分が場にいること。プレイヤーに掛ける制約（playerRule）は対象を要らないので常に成立
    // target 未指定（相手のスピリットを1体指定する書き方）は、filter に合う相手のスピリットが1体以上いること
    timedEffect: (state, owner, self, action) => {
        if (action.type !== "timedEffect") return false
        if (action.target === "self") return self !== null
        if (action.content.every((c) => c.type === "playerRule")) return true
        const filter = { ...(action.filter ?? {}) } as unknown as ResolvedTargetFilter
        const pids = action.side === "own" ? [owner] : action.side === "both" ? [owner, opponentOf(owner)] : [opponentOf(owner)]
        return pids.some((pid) => state.players[pid].field.spirits.some((s) => matchesTarget(state, pid, s, filter, self?.instanceId)))
    },
    destroy: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "destroy") return false
        return action.count === "any" || destroyCandidateCountForPay(state, owner, self?.instanceId, action, srcColors, srcType) >= action.count
    },
    returnToHand: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "returnToHand") return false
        if (action.costBudget !== undefined) return true
        if (action.target === "self") return self !== null && state.players[owner].field.spirits.some((s) => s.instanceId === self.instanceId)
        if (action.target === "selfBrave") return self !== null && (self.braveRefs?.length ?? 0) >= 1
        return returnToHandCandidateCountForPay(state, owner, self?.instanceId, action, srcColors, srcType) >= action.count
    },
    returnToDeckTop: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "returnToDeckTop" && action.type !== "returnToDeckBottom") return false
        return returnToDeckTopCandidateCountForPay(state, owner, self?.instanceId, action, srcColors, srcType) >= (action.count ?? 1)
    },
    returnToDeckBottom: (...args) => CHECKERS.returnToDeckTop!(...args),
    destroyNexus: (state, owner, _self, action, _srcColors, srcType) => {
        if (action.type !== "destroyNexus") return false
        return action.count === "any" || destroyNexusCandidateCountForPay(state, owner, action, srcType) >= action.count
    },
    coreRemove: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "coreRemove") return false
        const achievable = coreRemoveAchievableCountForPay(state, owner, self?.instanceId, action, srcColors, srcType)
        if (action.all) return achievable >= 1
        return achievable >= action.count
    },
    // removeCores.ts の removeCoresAchievableCountForPay に判定を委譲（候補の集め方は本ハンドラと共用）
    removeCores: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "removeCores") return false
        if (action.count === "any") return true
        const achievable = removeCoresAchievableCountForPay(state, owner, self, action, srcColors, srcType)
        if (typeof action.count !== "number") return achievable >= 1
        const need = action.countCounter !== undefined ? countedAmount(state, owner, self, action.count, action.countCounter, srcType) : action.count
        return achievable >= need
    },
    refreshSelf: (_state, _owner, self) => self !== null && self.isRested,
    treatAsUnblocked: (state) => (state.battle?.blockerInstanceId ?? null) !== null,
    nexusCoresToTrash: (state, owner, _self, action, _srcColors, srcType) => {
        if (action.type !== "nexusCoresToTrash") return false
        return nexusHasCoresForPay(state, owner, action, srcType)
    },
    // exhaust：target:"self"（発生源自身が回復状態か）／side:"own"（自分の場に条件に合う回復状態の個体がcount体以上いるか）
    exhaust: (state, owner, self, action) => {
        if (action.type !== "exhaust") return false
        if (action.target === "self") return self !== null && !self.isRested
        if (action.nexusOnly) {
            return canExhaustNexus(state, owner) && state.players[owner].field.nexuses.filter((n) => !n.isRested).length >= action.count
        }
        if (action.side === "own") {
            const filter = (action.filter ?? {}) as unknown as ResolvedTargetFilter
            const count = state.players[owner].field.spirits.filter(
                (s) => !s.isRested && matchesTarget(state, owner, s, filter, self?.instanceId),
            ).length
            return count >= action.count
        }
        return false // 既存の書き方（相手を疲労）はpayのcostに使う想定が無いため今回は判定を足さない
    },
    // mill：side（既定opponent）側のデッキがcount枚（countCounterがあれば数えた値）以上あるか
    mill: (state, owner, self, action, _srcColors, srcType) => {
        if (action.type !== "mill") return false
        const count =
            action.countCounter !== undefined
                ? countedAmount(
                      state, owner, self, action.count ?? 1, action.countCounter, srcType,
                      action.countMax !== undefined ? action.countMax + millCapBonusFor(state, owner) : undefined,
                  )
                : action.count
        const targetPid = action.side === "own" ? owner : opponentOf(owner)
        return state.players[targetPid].deck.length >= count
    },
    // discardBurst：side（既定opponent）側にバーストがセットされているか
    discardBurst: (state, owner, _self, action) => {
        if (action.type !== "discardBurst") return false
        const pid = action.side === "own" ? owner : opponentOf(owner)
        return state.players[pid].burst !== null
    },
    // discardHandAll：手札が1枚以上あるか（COST_MODEL §1。081。0枚なら不発）
    discardHandAll: (state, owner) => state.players[owner].hand.length >= 1 && canDiscardHand(state, owner),
    // bpBuff：anySide指定時は両陣営から、それ以外はfilterに合う自分のスピリットから1体以上
    // （buff.ts の bpBuffHandler と同じ pickAnySideCandidates／pickBpBuffTarget を使う）
    bpBuff: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "bpBuff") return false
        // excludeSelf は判定専用（支払い後の解決時には発生源は既に場にいないため）。BS14-X03 の
        // 「自分を戻したあとに BP+ できる他のスピリットがいる」を、支払い前の判定で見るためのもの
        if (action.filter?.excludeSelf && !action.anySide) {
            return state.players[owner].field.spirits.some(
                (s) =>
                    s.instanceId !== self?.instanceId &&
                    bpBuffTargetPasses(
                        state, owner, s,
                        action.filter?.minSymbols, action.filter?.keyword, action.filter?.nameContains,
                        action.filter?.attackingOnly, action.filter?.family, action.filter?.combined, action.filter?.vanilla,
                    ),
            )
        }
        if (action.anySide) {
            const passes = (s: CardInstance) =>
                bpBuffTargetPasses(
                    state, owner, s,
                    action.filter?.minSymbols, action.filter?.keyword, action.filter?.nameContains,
                    action.filter?.attackingOnly, action.filter?.family, action.filter?.combined, action.filter?.vanilla,
                )
            return pickAnySideCandidates(state, owner, passes, srcColors, srcType).length >= 1
        }
        return pickBpBuffTarget(
            state, owner, undefined,
            action.filter?.minSymbols, action.filter?.keyword, action.filter?.nameContains,
            action.filter?.attackingOnly, action.filter?.family, action.filter?.combined, action.filter?.vanilla,
        ) !== null
    },
    // refreshOne：条件に合う疲労状態の自分のスピリットが1体以上（exhaustRefresh.ts の既定経路のみ。
    // eventTargetOnly／all／anySide を pay の then に書くケースは想定しない）
    refreshOne: (state, owner, self, action, _srcColors, _srcType, eventTarget) => {
        if (action.type !== "refreshOne") return false
        if (action.eventTargetOnly) {
            return eventTarget !== undefined && state.players[owner].field.spirits.some((s) => s.instanceId === eventTarget && s.isRested)
        }
        if (action.all) return false
        const ctx = { state, owner, self, targetInstanceId: undefined } as ActionCtx
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) return false
        return refreshOneOwnCandidates(state, owner, self, filter).length >= 1
    },
    // placeCores：置き先（target self/one/all）があり、止める効果（voidCorePlacementBlocked・
    // ライフ専用ガード）に当たらず、取り元（reserve/trash/self/field）にcount個以上あるか
    placeCores: (state, owner, self, action) => {
        if (action.type !== "placeCores") return false
        const guardedTo = action.to === "spirit" || action.to === "nexus" || action.to === "reserve"
        if (action.from === "void" && guardedTo && voidCorePlacementBlocked(state)) return false
        if (action.to === "life") {
            if (isEndStepLocked(state, "lifeChargeFromVoidOrReserve")) return false
            if (action.from === "void" && hasGlobalConstraint(state, "noVoidToLife")) return false
        }
        if (action.to === "spirit" || action.to === "nexus") {
            if (action.target === "self") {
                if (!self) return false
                const onField = [...state.players[owner].field.spirits, ...state.players[owner].field.nexuses].includes(self)
                if (!onField) return false
            } else {
                const ctx = { state, owner, self, targetInstanceId: undefined } as ActionCtx
                const candidates = placeCoresPoolCandidates(ctx, action)
                if (candidates === SELF_REQUIRED || candidates.length === 0) return false
            }
        }
        if (action.from === "reserve" || action.from === "trash" || action.from === "self" || action.from === "field") {
            if (typeof action.count === "number" && availableFromSource(state, owner, action.from, self) < action.count) return false
        }
        return true
    },
    // summonFromHandFree：条件に合い実際に召喚できる（payCost指定時は支払い可否も含む）手札のスピリットが1枚以上
    summonFromHandFree: (state, owner, self, action) => {
        if (action.type !== "summonFromHandFree") return false
        return state.players[owner].hand.some((id) => summonFromHandFreeCandidateMatches(state, owner, self, action, id))
    },
    // summonFromTrashFree：同上のトラッシュ版
    summonFromTrashFree: (state, owner, _self, action) => {
        if (action.type !== "summonFromTrashFree") return false
        return state.players[owner].trashCards.some((id) => summonFromTrashFreeCandidateMatches(state, owner, action, id))
    },
    // recoverSpiritFromTrash／recoverMagicFromTrash：条件に合うカードがトラッシュに1枚以上
    // （count/countCounter/all を持つが、pay の then では「書いてある数どおり」の一般則に合わせて数える）
    recoverSpiritFromTrash: (state, owner, self, action, _srcColors, srcType) => {
        if (action.type !== "recoverSpiritFromTrash") return false
        if (hasGlobalConstraint(state, "noTrashRecovery")) return false
        const found = state.players[owner].trashCards.filter((id) => recoverSpiritFromTrashCandidateOk(action, id)).length
        if (action.all) return found >= 1
        const count =
            action.countCounter !== undefined
                ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
                : action.count
        return found >= count
    },
    recoverMagicFromTrash: (state, owner, _self, action) => {
        if (action.type !== "recoverMagicFromTrash") return false
        if (hasGlobalConstraint(state, "noTrashRecovery")) return false
        return state.players[owner].trashCards.some((id) => recoverMagicFromTrashCandidateOk(action, id))
    },
    // destroyByBpBudget：予算（budget／budgetFromSelfBp／budgetFromFamilyBpSum）以下の相手のスピリットが1体以上
    destroyByBpBudget: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "destroyByBpBudget") return false
        const opp = opponentOf(owner)
        const budget = action.budgetFromSelfBp && self
            ? effectiveBp(state, owner, self)
            : action.budgetFromFamilyBpSum !== undefined
                ? state.players[owner].field.spirits
                    .filter((s) => matchesFamilyFilter(state, owner, s, action.budgetFromFamilyBpSum!))
                    .reduce((sum, s) => sum + effectiveBp(state, owner, s), 0)
                : (action.budget ?? 0)
        if (budget <= 0) return false
        return pickEnemyCandidates(state, opp, Infinity, (s) => effectiveBp(state, opp, s) <= budget, srcColors, srcType).length >= 1
    },
    // destroyBlockerAfterBattle：バトル中でブロックしたスピリットが場にいる（ハンドラの前提と揃える）
    destroyBlockerAfterBattle: (state, owner, self, action) => {
        if (action.type !== "destroyBlockerAfterBattle") return false
        if (!self) return false
        const battle = state.battle
        const blockerId = battle?.blockerInstanceId ?? undefined
        if (!battle || blockerId === undefined) return false
        const found = findSpiritAny(state, blockerId)
        if (!found || found.pid === owner) return false
        return true
    },
    // lifeCrush：相手のライフがcount以上（止める効果＝lifeImmuneThisTurn・cantReduceOpponentLife・
    // ownLifeImmuneToOpponentSpiritEffectsに当たらないこと）
    lifeCrush: (state, owner, self, action, _srcColors, srcType) => {
        if (action.type !== "lifeCrush") return false
        const opp = opponentOf(owner)
        if (lifeImmuneThisTurn(state, opp)) return false
        if (cantReduceOpponentLife(state, owner)) return false
        if (srcType === "spirit" && ownLifeImmuneToOpponentSpiritEffects(state, opp)) return false
        const count =
            action.countCounter !== undefined
                ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
                : action.count
        return count > 0 && state.players[opp].life >= count
    },
    // levelOverrideOpponentNexuses：対象の相手ネクサスが1つ以上
    levelOverrideOpponentNexuses: (state, owner, _self, action) => {
        if (action.type !== "levelOverrideOpponentNexuses") return false
        return state.players[opponentOf(owner)].field.nexuses.length >= 1
    },
    // colorlessSelfThisBattle：印を置く相手（自分自身）が場にいる
    colorlessSelfThisBattle: (_state, _owner, self, action) => {
        if (action.type !== "colorlessSelfThisBattle") return false
        return self !== null
    },
    // negateLifeDamageFromTarget：印を置く相手（対象未指定なら pickEnemyByBp の自動選択と同じ候補）が存在する
    negateLifeDamageFromTarget: (state, owner, _self, action, srcColors, srcType) => {
        if (action.type !== "negateLifeDamageFromTarget") return false
        return pickEnemyByBp(state, opponentOf(owner), Infinity, undefined, srcColors, srcType) !== null
    },
}

// cost が「好きなだけ」のとき払える最大数（それ以外は undefined）
const anyCapacity = (state: GameState, owner: PlayerId, self: CardInstance | null, cost: EffectAction): number | undefined => {
    if (cost.type === "discardSelfChoose" && cost.count === "any") {
        return canDiscardHand(state, owner) ? state.players[owner].hand.filter((id) => discardSelfChooseEligible(id, cost)).length : 0
    }
    if (cost.type === "removeCores" && cost.count === "any") {
        return removeCoresAchievableCountForPay(state, owner, self, cost, undefined, undefined)
    }
    if (cost.type === "toTegamoto" && cost.count === "any") {
        return Math.min(state.players[owner].hand.filter((id) => matchesPick(id, cost.pick)).length, cost.upTo ?? Infinity)
    }
    return undefined
}

// 判定表に無い type、または判定に落ちた場合は false
export const canPayResolve = (
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    action: EffectAction,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
    eventTarget?: string,
): boolean => {
    const checker = CHECKERS[action.type]
    if (!checker) return false
    return checker(state, owner, self, action, srcColors, srcType, eventTarget)
}

// 成立しなかった cost／then の種類ごとの理由（不発ログ用。表に無い type は汎用文）。revive.ts・burst.ts からも使う
const UNPAYABLE_REASONS: Partial<Record<EffectAction["type"], string>> = {
    discardSelfChoose: "手札に破棄できるカードがない",
    toTegamoto: "手札に手元へ置けるカードがない",
    discardHandAll: "手札に破棄できるカードがない",
    draw: "ドローできるデッキの枚数がない",
    mill: "デッキの枚数が足りない",
    discardOpponent: "相手の手札が足りない",
    discardBurst: "破棄できるバーストがセットされていない",
    setBurstFromHand: "手札にセットできるバーストがない",
    peekOpponentHand: "相手の手札がない",
    timedEffect: "指定する相手のスピリットがいない",
    destroy: "破壊するスピリットがいない",
    simultaneous: "破壊するスピリットがいない",
    destroySelf: "破壊するスピリットがいない",
    destroyByBpBudget: "破壊できる相手のスピリットがいない",
    destroyNexus: "破壊するネクサスがない",
    destroyBlockerAfterBattle: "破壊できるブロックしたスピリットがいない",
    returnToHand: "手札に戻すスピリットがいない",
    returnToDeckTop: "デッキに戻すカードがない",
    returnToDeckBottom: "デッキに戻すカードがない",
    coreRemove: "取り除けるコアが足りない",
    removeCores: "置けるコアが足りない",
    nexusCoresToTrash: "ネクサスにトラッシュへ送れるコアがない",
    placeCores: "置けるコアが足りない",
    refreshSelf: "回復させる対象がいない",
    refreshOne: "回復させる対象がいない",
    bpBuff: "BP+する対象がいない",
    summonFromHandFree: "手札に召喚できるカードがない",
    summonFromTrashFree: "トラッシュに召喚できるカードがない",
    recoverSpiritFromTrash: "トラッシュに回収できるカードがない",
    recoverMagicFromTrash: "トラッシュに回収できるカードがない",
    lifeCrush: "相手のライフを減らせない",
    treatAsUnblocked: "ブロックしたスピリットがいない",
}

// 成立しない最初の cost／then の理由を「〜ため」に続く形で返す。全部成立するなら null
export function unpayableReason(
    state: GameState, owner: PlayerId, self: CardInstance | null, action: EffectAction,
    srcColors: Color[] | undefined, srcType: CardType | undefined, eventTarget?: string,
): string | null {
    if (canPayResolve(state, owner, self, action, srcColors, srcType, eventTarget)) return null
    if (action.type === "sequence" || (action.type === "simultaneous" && !action.actions.some((a) => a.type === "destroySelf"))) {
        for (const a of action.actions) {
            const r = unpayableReason(state, owner, self, a, srcColors, srcType, eventTarget)
            if (r !== null) return r
        }
    }
    if (action.type === "exhaust") {
        if (action.target === "self") return "このスピリットが疲労している"
        return action.nexusOnly ? "疲労させられる自分のネクサスがない" : "疲労させられる自分のスピリットがいない"
    }
    return UNPAYABLE_REASONS[action.type] ?? "条件を満たさない"
}

export const unpayableLine = (sourceName: string, reason: string): string => `${sourceName}：${reason}ため発動しなかった。`

// 任意（optional）の誘発が出す「発動しますか？」の前に呼ぶ。最上位が pay で成立しないなら、確認を出さずに理由つきで不発にして true を返す
// （2026-10-02 ユーザー確認）。イベント対象を then に使う書き方は対象がここでは分からないので、cost だけを見る
export function skipUnpayablePay(state: GameState, owner: PlayerId, self: CardInstance | null, action: EffectAction, sourceName: string): boolean {
    if (action.type !== "pay" || action.confirmed) return false
    const thenNeedsEventTarget = JSON.stringify(action.then).includes('"eventTargetOnly"')
    const reason = unpayableReason(state, owner, self, action.cost, undefined, undefined)
        ?? (thenNeedsEventTarget || anyCapacity(state, owner, self, action.cost) !== undefined ? null : unpayableReason(state, owner, self, action.then, undefined, undefined))
    if (reason === null) return false
    log(state, unpayableLine(sourceName, reason))
    state.effectFizzled = true
    if (action.onceRevert) {
        const src = findInstanceAnywhere(state, action.onceRevert.instanceId)
        if (src) revertOncePerTurn(state, src, action.onceRevert.effectId)
        revertDestroyGroupUsage(state, action.onceRevert.instanceId, action.onceRevert.effectId)
    }
    return true
}

// 木の中の pay すべてに内部欄を付けた写しを返す（元は変えない）。
// confirmed：発動の確認（マジック使用・起動・バースト・任意効果）を済ませた経路から入る action に掛け、二重に聞かないようにする（COST_MODEL.md §10）
// onceRevert：確認を断った／押したが不発のとき「ターンに1回」の消費を戻す先（2026-10-01 ユーザー確認）。消費した側（誘発の解決）が付ける
export function markPays(action: EffectAction, fields: { confirmed?: true; onceRevert?: { instanceId: string; effectId: string } }): EffectAction {
    const walk = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(walk)
        if (v !== null && typeof v === "object") {
            const out: Record<string, unknown> = {}
            for (const [k, x] of Object.entries(v)) out[k] = walk(x)
            if (out.type === "pay") Object.assign(out, fields)
            return out
        }
        return v
    }
    return walk(action) as EffectAction
}

export function markPayConfirmed(action: EffectAction): EffectAction {
    return markPays(action, { confirmed: true })
}

const payHandler: ActionHandler<"pay"> = (ctx, action) => {
    const { state, owner, self, srcColors, srcType, sourceName } = ctx
    // 「そのスピリット」＝イベント対象は then にだけ渡す（cost は自分の場から払うもの）。確認で止まると ctx から落ちるので行動に持たせる
    const eventTargetId = action.eventTargetId ?? ctx.targetInstanceId
    const fizzle = (message: string): void => {
        log(state, message)
        state.effectFizzled = true
        // 確認を挟んで再開した後の不発は、誘発側の effectFizzled の巻き戻しが既に通り過ぎているのでここで戻す
        if (action.onceRevert) {
            const src = findInstanceAnywhere(state, action.onceRevert.instanceId)
            if (src) revertOncePerTurn(state, src, action.onceRevert.effectId)
            revertDestroyGroupUsage(state, action.onceRevert.instanceId, action.onceRevert.effectId)
        }
    }
    // 【強襲】：回数切れは確認も出さず何も起きない。払えない場合は一般則（下の judge）で確認の前に不発にする
    let kyoshuUsed = 0
    if (action.limitByKeyword === "kyoshu") {
        const limit = self ? kyoshuLimitOf(state, owner, self) : 0
        kyoshuUsed = self ? kyoshuUsedOf(state, self) : 0
        if (!self || kyoshuUsed >= limit) {
            log(state, `${sourceName}：【強襲】を発動できる状態でないため何もしなかった。`)
            return
        }
    }
    let cost = action.cost
    const capacity = anyCapacity(state, owner, self, cost)
    const thenOk = (): boolean => canPayResolve(state, owner, self, action.then, srcColors, srcType, eventTargetId)
    // 成立するか（好きなだけ払う cost は then を解決しきれる最大数まで）。不成立なら理由を返す
    const judge = (): { cost: EffectAction; reason: string | null } => {
        let c = action.cost
        const costReason = unpayableReason(state, owner, self, c, srcColors, srcType)
        if (costReason !== null) return { cost: c, reason: costReason }
        if (capacity !== undefined) {
            // 好きなだけ払う：then を解決しきれる最大数までしか選べない（2026-09-27 ユーザー確認）
            let max = capacity
            while (max >= 0 && !withMovedProbe(max, thenOk)) max--
            if (max < 0) return { cost: c, reason: unpayableReason(state, owner, self, action.then, srcColors, srcType, eventTargetId) ?? "条件を満たさない" }
            c = { ...c, anyMax: max } as EffectAction
            return { cost: c, reason: null }
        }
        return { cost: c, reason: unpayableReason(state, owner, self, action.then, srcColors, srcType, eventTargetId) }
    }
    // 聞く前に成立しないなら確認を出さずに不発（2026-10-02 ユーザー確認。COST_MODEL §10 の「払えなくても確認は出る」を改訂）。
    // confirmed は発動の確認を済ませた経路なので、ここでは不発にしても確認の後の不発として扱う
    if (state.interactiveTargets && !action.confirmed) {
        const pre = judge()
        if (pre.reason !== null) {
            fizzle(unpayableLine(sourceName, pre.reason))
            return
        }
        const resume = eventTargetId !== undefined ? { ...action, eventTargetId } : action
        requestActivationConfirm(state, owner, `${sourceName}：コストを支払って効果を発揮しますか？`, resume, self, action.onceRevert)
        return
    }
    const verdict = judge()
    if (verdict.reason !== null) {
        fizzle(unpayableLine(sourceName, verdict.reason))
        return
    }
    cost = verdict.cost
    if (action.limitByKeyword === "kyoshu" && self) self.kyoshuUsed = { turn: state.turn, count: kyoshuUsed + 1 }
    const scope = newRecordScope()
    resolveInOrder(state, [cost, action.then], {
        resolve: (a) => {
            state.recordScope = scope
            const target = a === action.then ? eventTargetId : undefined
            ctx.resolve(a, { sourceColors: srcColors, sourceType: srcType, ...(target !== undefined ? { targetInstanceId: target } : {}) })
        },
        frame: (a) => ({
            kind: "action" as const,
            selfInstanceId: self ? self.instanceId : null,
            action: a,
            actorPid: owner,
            recordScope: scope,
            ...(a === action.then && eventTargetId !== undefined ? { targetInstanceId: eventTargetId } : {}),
            ...(srcColors !== undefined ? { sourceColors: srcColors } : {}),
            ...(srcType !== undefined ? { sourceType: srcType } : {}),
        }),
    })
}

const handlers = {
    pay: payHandler,
} satisfies Partial<ActionRegistry>

export default handlers
