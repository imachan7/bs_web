// levelCostMod（BS09-017・BS15-X02・BS15-015）が、これから出すカードの置くコアに足す数。
// 場の個体への加算は continuous.ts（levelCostBonusContinuous）が行うので、召喚・配置で置く数もここで同じ判定に揃える
// （揃えないと、置いた瞬間に維持コアが足りず消滅する。2026-11-24 ユーザー報告）
import type { CardData, PlayerId } from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { currentLevel, effectSources } from "./level"
import { entryActive } from "./effectStop"
import { minLevelCores } from "./activation"

export function summonLevelCostBonus(board: Board, pid: PlayerId, cardData: CardData): number {
    // ブレイヴ単体は field.spirits に載るのでスピリット扱い
    const nexus = cardData.type === "nexus"
    if (cardData.type !== "spirit" && cardData.type !== "brave" && !nexus) return 0
    let sum = 0
    for (const owner of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, owner)) {
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "levelCostMod") continue
                if (!entryActive(board, owner, source, effect, currentLevel(source).level)) continue
                const hitsPid = effect.target === "opponentNexusesAll" ? owner !== pid && nexus : effect.target === "opponentAll" ? owner !== pid && !nexus : owner === pid && !nexus
                if (hitsPid) sum += effect.amount
            }
        }
    }
    return sum
}

// これから場に出すカード（召喚・配置・入れ替え・【不死】・トークンなど）の置くコアの最小。
// 場にいる個体は instMinLevelCores を使う
export function summonMinCores(board: Board, pid: PlayerId, cardData: CardData): number {
    return minLevelCores(cardData) + summonLevelCostBonus(board, pid, cardData)
}
