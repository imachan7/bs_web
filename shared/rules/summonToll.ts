// globalConstraint "summonPayToll"（BS22-012 骸魔インプ）：召喚する側が、リザーブのコアをボイドへ置く通行料。
// 払えるかの判定と実際の支払い（リザーブから引くだけ。トラッシュには数えない）は召喚の各経路が行う。
import { noteCoverage } from "../coverage"
import type { CardData, PlayerId } from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { currentLevel, effectSources } from "./level"
import { entryActive } from "./effectStop"

// Q4338：コストは印刷のコストで見る。発生源の陣営は問わず、召喚する側のリザーブから払う
export function summonVoidToll(board: Board, cardData: CardData): number {
    if (cardData.type !== "spirit") return 0
    let total = 0
    for (const ownerPid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, ownerPid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "summonPayToll") continue
                if (!entryActive(board, ownerPid, source, effect, level)) continue
                if (effect.phase !== undefined && board.phase !== effect.phase) continue
                if (!effect.constraint.costIn.includes(cardData.cost)) continue
                noteCoverage(effect, "globalConstraint")
                total += effect.constraint.count
            }
        }
    }
    return total
}
