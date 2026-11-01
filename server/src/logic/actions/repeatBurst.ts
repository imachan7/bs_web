// 直前に発動した自分のバースト効果をもう1度発揮する（P072。Q17811〜Q17813）
import type { EffectAction, EffectDef, GameState, PlayerId } from "../../type"
import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, log } from "../GameState"
import { magicEffectiveColors } from "../../../../shared/cost"
import { markPayConfirmed } from "./pay"

// 発動した本人でなければ（相手のバースト発動後に反応する書き方になったときのため）繰り返さない
export function lastBurstAction(state: GameState, owner: PlayerId): { cardId: string; action: EffectAction } | null {
    const last = state.lastBurstActivated
    if (!last || last.pid !== owner) return null
    const entry = getCard(last.cardId).effects.find((e): e is Extract<EffectDef, { kind: "burst" }> => e.kind === "burst")
    return entry ? { cardId: last.cardId, action: entry.action } : null
}

const repeatBurstEffectHandler: ActionHandler<"repeatBurstEffect"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    const last = lastBurstAction(state, owner)
    if (!last) {
        log(state, `${sourceName}：もう1度発揮するバースト効果がなかった。`)
        return
    }
    const card = getCard(last.cardId)
    log(state, `${card.name}のバースト効果をもう1度発揮する。`)
    // バーストの発生源として解く（self なし・カードの色と種別）。すでに場にいるスピリットの召喚時効果は出ない
    ctx.resolve(markPayConfirmed(last.action), { self: null, sourceColors: magicEffectiveColors(state, owner, card), sourceType: card.type })
}

const handlers = {
    repeatBurstEffect: repeatBurstEffectHandler,
} satisfies Partial<ActionRegistry>

export default handlers
