import type { GameState, PlayerId } from "../../type"
import { currentLevel, getCard } from "../GameState"
import { effectActiveAtLevel, effectSources, isVirtualSource } from "../../../../shared/rules"

// 持ち主のスピリットの【呪撃】が『ブロック時』へ差し替えられているか（BS06カウンターカース）。
// hasFunsaiOnBlock と違い**追加ではなく差し替え**なので、これが true の側はアタック時に呪撃を発揮しない。
// effectSources() でこのターンだけの仮想発生源（マジックが貸した継続効果）も含める
export function hasJugekiOnBlockReplace(state: GameState, ownerPid: PlayerId): boolean {
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "jugekiOnBlockReplace") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (effectActiveAtLevel(effect.levels, level)) return true
        }
    }
    return false
}
