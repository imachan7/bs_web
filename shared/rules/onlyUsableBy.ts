// CardData.onlyUsableBy（「このカードは「〇〇」しか使えない」）。使うことに当たる入口はすべてここで止める。
import type { Board } from "../board"
import { card } from "../cardDb"
import type { PlayerId } from "../../server/src/type"

// 名前の照らし合わせは空白（半角・全角）を無視する（ユーザー決定 2026-11-19。「馬神 弾」と「馬神弾」を同じにする）
const squash = (s: string) => s.replace(/[\s　]/g, "")

export function onlyUsableDenial(board: Board, pid: PlayerId, cardId: string): string | null {
    const names = card(cardId).onlyUsableBy
    if (names === undefined || names.length === 0) return null
    const me = squash(board.players[pid].name)
    if (names.some((n) => squash(n) === me)) return null
    return `このカードは${names[0]}しか使えません`
}
