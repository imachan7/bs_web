// 「〜することで〜する」の汎用の器（COST_MODEL.md §1）。cost・thenとも書いてある数どおりに
// 解決できるときだけ発揮する。判定を通すのはこのファイルだけの責務で、実際の解決は
// 各typeの既存ハンドラへ resolveInOrder 経由でそのまま委譲する（sequenceと同じ frame の作り方）。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, CardType, Color, EffectAction, GameState, PlayerId, ResolvedTargetFilter } from "../../type"
import { getCard, log, opponentOf, resolveInOrder } from "../GameState"
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
import { pickAnySideCandidates, pickBpBuffTarget, pickEnemyByBp, pickEnemyCandidates, bpBuffTargetPasses } from "../targeting"
import { countedAmount } from "../counted"
import { normalizeFilter, SELF_REQUIRED } from "./filter"

// 判定表に載っている type だけが pay の cost/then に書ける（scripts/validate-cards.ts が突き合わせる）
export const PAYABLE_TYPES = [
    "discardSelfChoose", "draw", "discardOpponent", "setBurstFromHand", "timedEffect",
    "destroy", "returnToHand", "returnToDeckTop", "destroyNexus", "coreRemove", "removeCores", "refreshSelf", "nexusCoresToTrash",
    "exhaust", "mill", "discardBurst",
    "bpBuff", "refreshOne", "placeCores", "summonFromHandFree", "summonFromTrashFree",
    "recoverSpiritFromTrash", "recoverMagicFromTrash", "destroyByBpBudget", "destroyBlockerAfterBattle",
    "lifeCrush", "levelOverrideOpponentNexuses", "colorlessSelfThisBattle", "protectLifeByCostThisTurn",
    "negateLifeDamageFromTarget",
] as const

type Checker = (state: GameState, owner: PlayerId, self: CardInstance | null, action: EffectAction, srcColors: Color[] | undefined, srcType: CardType | undefined) => boolean

const CHECKERS: Partial<Record<EffectAction["type"], Checker>> = {
    discardSelfChoose: (state, owner, _self, action) => {
        if (action.type !== "discardSelfChoose") return false
        if (!canDiscardHand(state, owner)) return false
        const count = state.players[owner].hand.filter((cardId) => discardSelfChooseEligible(cardId, action)).length
        return count >= action.count
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
    setBurstFromHand: (state, owner) => {
        return state.players[owner].hand.some((cardId) => getCard(cardId).effects.some((e) => e.kind === "burst"))
    },
    // いまは「このスピリットをBP+」（target:"self"）だけを後半に置ける。他の形を置くなら判定を足す
    timedEffect: (_state, _owner, self, action) => action.type === "timedEffect" && action.target === "self" && self !== null,
    destroy: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "destroy") return false
        return destroyCandidateCountForPay(state, owner, self?.instanceId, action, srcColors, srcType) >= action.count
    },
    returnToHand: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "returnToHand") return false
        return returnToHandCandidateCountForPay(state, owner, self?.instanceId, action, srcColors, srcType) >= action.count
    },
    returnToDeckTop: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "returnToDeckTop") return false
        return returnToDeckTopCandidateCountForPay(state, owner, self?.instanceId, action, srcColors, srcType) >= (action.count ?? 1)
    },
    destroyNexus: (state, owner, _self, action, _srcColors, srcType) => {
        if (action.type !== "destroyNexus") return false
        return destroyNexusCandidateCountForPay(state, owner, action, srcType) >= action.count
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
        const achievable = removeCoresAchievableCountForPay(state, owner, self, action, srcColors, srcType)
        if (typeof action.count !== "number") return achievable >= 1
        return achievable >= action.count
    },
    refreshSelf: (_state, _owner, self) => self !== null && self.isRested,
    nexusCoresToTrash: (state, owner, _self, action, _srcColors, srcType) => {
        if (action.type !== "nexusCoresToTrash") return false
        return nexusHasCoresForPay(state, owner, action, srcType)
    },
    // exhaust：target:"self"（発生源自身が回復状態か）／side:"own"（自分の場に条件に合う回復状態の個体がcount体以上いるか）
    exhaust: (state, owner, self, action) => {
        if (action.type !== "exhaust") return false
        if (action.target === "self") return self !== null && !self.isRested
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
    // bpBuff：anySide指定時は両陣営から、それ以外はfilterに合う自分のスピリットから1体以上
    // （buff.ts の bpBuffHandler と同じ pickAnySideCandidates／pickBpBuffTarget を使う）
    bpBuff: (state, owner, _self, action, srcColors, srcType) => {
        if (action.type !== "bpBuff") return false
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
    refreshOne: (state, owner, self, action) => {
        if (action.type !== "refreshOne") return false
        if (action.eventTargetOnly || action.all) return false
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
        if (self.cores < action.costSelfCoresToTrash) return false
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
    // protectLifeByCostThisTurn：対象を要求しない（playerRuleを記録するだけ）ので常に成立
    protectLifeByCostThisTurn: (_state, _owner, _self, action) => action.type === "protectLifeByCostThisTurn",
    // negateLifeDamageFromTarget：印を置く相手（対象未指定なら pickEnemyByBp の自動選択と同じ候補）が存在する
    negateLifeDamageFromTarget: (state, owner, _self, action, srcColors, srcType) => {
        if (action.type !== "negateLifeDamageFromTarget") return false
        return pickEnemyByBp(state, opponentOf(owner), Infinity, undefined, srcColors, srcType) !== null
    },
}

// 判定表に無い type、または判定に落ちた場合は false
export const canPayResolve = (
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    action: EffectAction,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
): boolean => {
    const checker = CHECKERS[action.type]
    if (!checker) return false
    return checker(state, owner, self, action, srcColors, srcType)
}

const payHandler: ActionHandler<"pay"> = (ctx, action) => {
    const { state, owner, self, srcColors, srcType, sourceName } = ctx
    if (!canPayResolve(state, owner, self, action.cost, srcColors, srcType) || !canPayResolve(state, owner, self, action.then, srcColors, srcType)) {
        log(state, `${sourceName}：条件を満たさないため発動しなかった。`)
        return
    }
    resolveInOrder(state, [action.cost, action.then], {
        resolve: (a) => ctx.resolve(a, { sourceColors: srcColors, sourceType: srcType }),
        frame: (a) => ({
            kind: "action" as const,
            selfInstanceId: self ? self.instanceId : null,
            action: a,
            actorPid: owner,
            ...(srcColors !== undefined ? { sourceColors: srcColors } : {}),
            ...(srcType !== undefined ? { sourceType: srcType } : {}),
        }),
    })
}

const handlers = {
    pay: payHandler,
} satisfies Partial<ActionRegistry>

export default handlers
