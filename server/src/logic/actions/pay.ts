// 「〜することで〜する」の汎用の器（COST_MODEL.md §1）。cost・thenとも書いてある数どおりに
// 解決できるときだけ発揮する。判定を通すのはこのファイルだけの責務で、実際の解決は
// 各typeの既存ハンドラへ resolveInOrder 経由でそのまま委譲する（sequenceと同じ frame の作り方）。
import type { ActionHandler, ActionRegistry } from "./types"
import type { EffectAction, GameState, PlayerId } from "../../type"
import { getCard, log, opponentOf, resolveInOrder } from "../GameState"
import { canDiscardHand } from "../../../../shared/rules"
import { discardSelfChooseEligible } from "./drawDiscard"

// 判定表に載っている type だけが pay の cost/then に書ける（scripts/validate-cards.ts が突き合わせる）
export const PAYABLE_TYPES = ["discardSelfChoose", "draw", "discardOpponent", "setBurstFromHand", "selfBuff"] as const

type Checker = (state: GameState, owner: PlayerId, self: ActionCheckSelf, action: EffectAction) => boolean
// selfBuff の判定にだけ self（CardInstance | null）が要る。pay.ts の外へは出さない内部型
type ActionCheckSelf = { instanceId: string } | null

const CHECKERS: Partial<Record<EffectAction["type"], Checker>> = {
    discardSelfChoose: (state, owner, _self, action) => {
        if (action.type !== "discardSelfChoose") return false
        if (!canDiscardHand(state, owner)) return false
        const count = state.players[owner].hand.filter((cardId) => discardSelfChooseEligible(cardId, action)).length
        return count >= action.count
    },
    draw: (state, owner, _self, action) => {
        if (action.type !== "draw") return false
        return state.players[owner].deck.length >= action.count
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
    selfBuff: (_state, _owner, self) => self !== null,
}

// 判定表に無い type、または判定に落ちた場合は false
export const canPayResolve = (state: GameState, owner: PlayerId, self: ActionCheckSelf, action: EffectAction): boolean => {
    const checker = CHECKERS[action.type]
    if (!checker) return false
    return checker(state, owner, self, action)
}

const payHandler: ActionHandler<"pay"> = (ctx, action) => {
    const { state, owner, self, srcColors, srcType, sourceName } = ctx
    const selfRef = self ? { instanceId: self.instanceId } : null
    if (!canPayResolve(state, owner, selfRef, action.cost) || !canPayResolve(state, owner, selfRef, action.then)) {
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
