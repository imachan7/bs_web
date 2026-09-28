import type { ActionHandler, ActionRegistry } from "./types"
import { log } from "../GameState"

// 相手の手札1枚を「内容を見ないで選び」その内容だけを見る。
// **どの1枚を選ぶかはランダム**（SEMANTICS_AUDIT.md §3.14。見る側が並び順から内容を推測できないため）
const peekOpponentHandHandler: ActionHandler<"peekOpponentHand"> = (ctx) => {
    const { state, owner, opp, sourceName } = ctx
    const player = state.players[owner]
    const target = state.players[opp]
    if (target.hand.length === 0) {
        log(state, `${sourceName}：${target.name}の手札がなく、発動しなかった。`)
        return
    }
    const peeked = target.hand[Math.floor(Math.random() * target.hand.length)]!
    if (!player.peekedOpponentCardIds) player.peekedOpponentCardIds = []
    player.peekedOpponentCardIds.push(peeked)
    // ログには**カード名を出さない**（両者が読むため。見た本人は PlayerView から知る）
    log(state, `${player.name}は${target.name}の手札1枚の内容を見た。`)
}

const handlers = {
    peekOpponentHand: peekOpponentHandHandler,
} satisfies Partial<ActionRegistry>

export default handlers
