// バースト条件を無視したバースト発動（BS18-016 セット中 / BS18-X05 公開中）
import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, log } from "../GameState"
import { requestActivationConfirm } from "../targeting"
import { activateBurstCard } from "../keywords/burst"
import { matchesPick } from "./revealAction"

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
    if (cardId === null || !getCard(cardId).effects.some((e) => e.kind === "burst") || !matchesPick(cardId, action.filter)) {
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
