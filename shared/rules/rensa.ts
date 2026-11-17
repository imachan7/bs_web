// 【連鎖】の条件無視（SD11-X02【合体時】）。合体中のブレイヴが rensaIgnoreCondition を持てば、ホストの【連鎖】のシンボル条件を満たした扱い。サーバーとクライアントが同じ判定を使う
import type { CardInstance, PlayerId } from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { noteCoverage } from "../coverage"
import { entryActive } from "./effectStop"
import { bravesOf, currentLevel } from "./level"

// 【連鎖】の条件無視（SD11-X02【合体時】「このスピリットの【連鎖】は、条件を無視して発揮する」）。
// 合体中のブレイヴが kind:"rensaIgnoreCondition" を持つとき、ホスト（inst）の【連鎖】のシンボル条件を満たした扱いにする。
// 判定は if（サーバー）と、keyword:"rensa" を持つ常在・付与エントリの condition（共有層）の両方がこの1か所を通る
export function rensaIgnoresCondition(board: Board, pid: PlayerId, inst: CardInstance): boolean {
    for (const brave of bravesOf(board.players[pid], inst)) {
        const level = currentLevel(brave).level
        for (const effect of card(brave.cardId).effects) {
            if (effect.kind !== "rensaIgnoreCondition") continue
            if (!entryActive(board, pid, brave, effect, level)) continue
            noteCoverage(effect, "rensaIgnoreCondition")
            return true
        }
    }
    return false
}
