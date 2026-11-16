// バースト条件を無視したバースト発動（BS18-016 セット中 / BS18-X05 公開中）
import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, log } from "../GameState"
import { requestActivationConfirm } from "../targeting"
import { activateBurstCard } from "../keywords/burst"
import { matchesPick } from "./revealAction"
import { lastMovedOf } from "../record"
import type { CardPick, GameState } from "../../type"

// 直前に動いたカード（lastMoved の先頭）との関係を具体値に解く。maxCostAsLast＝そのコスト以下、sameColorAsLast＝その色を1色でも共有。
// 記録が空なら対象なし（null）。destroy の maxCostAsLast と同じく、ハンドラの入りで1回だけ解く
function pickAgainstLast(state: GameState, filter: CardPick | undefined): CardPick | null | undefined {
    if (filter?.maxCostAsLast !== true && filter?.sameColorAsLast !== true) return filter
    const first = lastMovedOf(state)[0]
    if (first === undefined) return null
    const { maxCostAsLast, sameColorAsLast, ...rest } = filter
    const last = getCard(first)
    return {
        ...rest,
        ...(maxCostAsLast ? { cost: { ...(typeof rest.cost === "object" ? rest.cost : {}), max: last.cost } } : {}),
        ...(sameColorAsLast ? { color: last.colors } : {}),
    }
}

const activateBurstIgnoringConditionHandler: ActionHandler<"activateBurstIgnoringCondition"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
    if (action.from === "revealed") {
        ctx.resolve(
            {
                type: "moveCards",
                from: "revealed",
                count: 1,
                dest: "activateBurst",
                ignoreBurstCondition: true,
                ...(action.optional ? { optional: true as const } : {}),
                pick: { ...action.filter, hasBurst: true },
            },
            { sourceColors: ctx.srcColors, sourceType: ctx.srcType },
        )
        return
    }
    const cardId = state.players[owner].burst
    const pick = pickAgainstLast(state, action.filter)
    if (cardId === null || !getCard(cardId).effects.some((e) => e.kind === "burst") || pick === null || !matchesPick(cardId, pick)) {
        log(state, `${sourceName}：発動できるバーストがなかった。`)
        return
    }
    if (action.optional && !action.confirmed && state.interactiveTargets) {
        requestActivationConfirm(state, owner, `${sourceName}：${getCard(cardId).name}のバーストを、バースト条件を無視して発動しますか？`, { ...action, confirmed: true }, self)
        return
    }
    if (!activateBurstCard(state, owner, cardId, true)) log(state, `${sourceName}：${getCard(cardId).name}は発動を禁じられているため発動できなかった。`)
}

const handlers = {
    activateBurstIgnoringCondition: activateBurstIgnoringConditionHandler,
} satisfies Partial<ActionRegistry>

export default handlers
