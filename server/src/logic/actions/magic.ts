import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, log } from "../GameState"
import { resolveMagic } from "../EffectModules"

// このフラッシュタイミングで相手が直前に使用したマジックの効果を、自分が使用したものとして
// もう一度だけ発揮する（BS08マジックミラー）。[マジックミラー]自身は対象にできない
const magicMirrorRepeatHandler: ActionHandler<"magicMirrorRepeat"> = (ctx, _action) => {
    const { state, owner, sourceName } = ctx
        const last = state.lastMagicCast
        if (!last || last.pid === owner) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        const lastCard = getCard(last.cardId)
        if (lastCard.name === "マジックミラー") {
            log(state, `${sourceName}：[マジックミラー]自身は対象にできない。`)
            return
        }
        log(state, `${sourceName}：${lastCard.name}の効果をもう一度発揮する。`)
        state.lastMagicCast = {
            pid: owner,
            cardId: last.cardId,
            timing: last.timing,
            ...(last.targetInstanceId !== undefined ? { targetInstanceId: last.targetInstanceId } : {}),
        }
        // 使用者は「コストを支払って」いない＝BS11-X05のpaidCostOnlyから連鎖しない
        resolveMagic(state, owner, last.cardId, last.timing, last.targetInstanceId, false)
}

const handlers = {
    magicMirrorRepeat: magicMirrorRepeatHandler,
} satisfies Partial<ActionRegistry>

export default handlers
