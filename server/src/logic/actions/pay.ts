// 「〜することで〜する」の汎用の器（COST_MODEL.md §1）。cost・thenとも書いてある数どおりに
// 解決できるときだけ発揮する。判定を通すのはこのファイルだけの責務で、実際の解決は
// 各typeの既存ハンドラへ resolveInOrder 経由でそのまま委譲する（sequenceと同じ frame の作り方）。
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, CardType, Color, EffectAction, GameState, PlayerId, ResolvedTargetFilter } from "../../type"
import { getCard, log, opponentOf, resolveInOrder } from "../GameState"
import { canDiscardHand, matchesTarget } from "../../../../shared/rules"
import { discardSelfChooseEligible } from "./drawDiscard"
import { destroyCandidateCountForPay, destroyNexusCandidateCountForPay, nexusHasCoresForPay } from "./destroy"
import { returnToDeckTopCandidateCountForPay, returnToHandCandidateCountForPay } from "./bounce"
import { coreRemoveAchievableCountForPay } from "./cores"
import { removeCoresAchievableCountForPay } from "./removeCores"
import { millCapBonusFor } from "../EffectModules"
import { countedAmount } from "../counted"

// 判定表に載っている type だけが pay の cost/then に書ける（scripts/validate-cards.ts が突き合わせる）
export const PAYABLE_TYPES = [
    "discardSelfChoose", "draw", "discardOpponent", "setBurstFromHand", "timedEffect",
    "destroy", "returnToHand", "returnToDeckTop", "destroyNexus", "coreRemove", "removeCores", "refreshSelf", "nexusCoresToTrash",
    "exhaust", "mill", "discardBurst",
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
