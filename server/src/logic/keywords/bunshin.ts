// 【分身：N】（BS22。batspi Q782〜Q793）。個体は仮のカード BUNSHIN_CARD_ID で、元のカードは bunshinOf に持つ。
// BUNSHIN_CARD_ID を `-T\d+` 形にしてあるのは、デッキビルダーと deckPolicy からトークン同様に外すため。
// 場を離れるときの扱いはトークンと違う（破壊後バーストは発動でき、元のカードが表向きでトラッシュへ行く）ので、
// removal.ts は isTokenCard でなく leavesNothingBehind / bunshinOf で分けている
import type { ActionHandler, ActionRegistry } from "../actions/types"
import type { CardInstance } from "../../type"
import { createInstance, log } from "../GameState"
import { requestChoice } from "../EffectModules"
import { isTokenCard } from "../../../../shared/cardDb"

export const BUNSHIN_CARD_ID = "BS22-T001"

// 場を離れたとき手札・デッキ・トラッシュのどこにも自分自身を残さない個体（トークン。分身は元のカードを別に残す）
export function leavesNothingBehind(inst: CardInstance): boolean {
    return isTokenCard(inst.cardId) && inst.bunshinOf === undefined
}

// 召喚ではないので召喚時効果・召喚制限は関わらない（Q789）。
// 枚数は 0〜N を出す側が選び、コアは1体ずつ1個以上（後ろの個体にも1個ずつ残せる範囲）をリザーブから置く（2026-11-07 ユーザー確認）
const bunshinHandler: ActionHandler<"bunshin"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenOption } = ctx
    const player = state.players[owner]
    let left = action.left
    let cores = chosenOption
    if (left === undefined) {
        const cap = Math.min(action.max, player.deck.length, player.reserve)
        if (cap <= 0) {
            log(state, `${sourceName}：【分身】で置けるカードがなかった。`)
            return
        }
        if (chosenOption === undefined && state.interactiveTargets) {
            requestChoice(state, owner, `${sourceName}：【分身】で置く枚数を選んでください（最大${cap}枚）`, [], false, action, self, "option", Array.from({ length: cap + 1 }, (_, i) => String(i)), undefined, true)
            return
        }
        left = chosenOption !== undefined ? Math.max(0, Math.min(cap, Number(chosenOption) || 0)) : cap
        cores = undefined
    }
    let placed = 0
    while (left > 0 && player.deck.length > 0 && player.reserve > 0) {
        const maxHere = player.reserve - (left - 1)
        if (maxHere < 1) break
        let n = 1
        if (cores !== undefined) n = Math.max(1, Math.min(maxHere, Number(cores) || 1))
        else if (maxHere > 1 && state.interactiveTargets) {
            requestChoice(state, owner, `${sourceName}：分身スピリットに置くコアの数を選んでください`, [], false, { ...action, left }, self, "option", Array.from({ length: maxHere }, (_, i) => String(i + 1)), undefined, true)
            return
        }
        cores = undefined
        const original = player.deck.shift()!
        player.reserve -= n
        const inst = createInstance(BUNSHIN_CARD_ID, state.turn, n)
        inst.bunshinOf = original
        player.field.spirits.push(inst)
        left--
        placed++
    }
    if (placed > 0) log(state, `${sourceName}：${player.name}は【分身】で山札の上から${placed}枚を分身スピリットにした。`)
}

const handlers = { bunshin: bunshinHandler } satisfies Partial<ActionRegistry>

export default handlers
