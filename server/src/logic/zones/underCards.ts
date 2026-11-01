// スピリットの下に裏向きで置いたカード（BS19-X02）の共通処理。置く・破棄するアクションのハンドラは actions/underCards.ts
import type { CardInstance, GameState, PlayerId } from "../../type"
import { getCard, log } from "../GameState"

// 下のカードを持ち主のトラッシュへ破棄する。場を離れるとき（全枚）とコスト支払い（count 枚）の共用。
// 末尾から破棄する。返り値は実際に破棄した枚数
export function trashUnderCards(state: GameState, ownerPid: PlayerId, inst: CardInstance, count?: number): number {
    const ids = inst.underCards
    if (!ids || ids.length === 0) return 0
    const n = Math.min(count ?? ids.length, ids.length)
    const trashed = ids.splice(ids.length - n, n)
    state.players[ownerPid].trashCards.push(...trashed)
    log(state, `${getCard(inst.cardId).name}の下のカード${n}枚を${state.players[ownerPid].name}は破棄した。`)
    if (ids.length === 0) delete inst.underCards
    return n
}
