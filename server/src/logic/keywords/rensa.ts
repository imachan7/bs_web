// 【連鎖】の条件無視（SD11-X02【合体時】「このスピリットの【連鎖】は、条件を無視して発揮する」）。
// 合体中のブレイヴが kind:"rensaIgnoreCondition" を持つとき、ホストの【連鎖】の条件
// （if cond:{count:{ownColorSymbols}}）を成立扱いにする。合体解除で効かなくなる
import { entryActive } from "../../../../shared/rules/effectStop"
import { noteCoverage } from "../../../../shared/coverage"
import { bravesOf, currentLevel } from "../../../../shared/rules"
import type { CardInstance, GameState, PlayerId } from "../../type"
import { getCard } from "../GameState"

export function rensaConditionIgnored(state: GameState, pid: PlayerId, self: CardInstance): boolean {
    for (const brave of bravesOf(state.players[pid], self)) {
        const level = currentLevel(brave).level
        for (const effect of getCard(brave.cardId).effects) {
            if (effect.kind !== "rensaIgnoreCondition") continue
            if (!entryActive(state, pid, brave, effect, level)) continue
            noteCoverage(effect, "rensaIgnoreCondition")
            return true
        }
    }
    return false
}
