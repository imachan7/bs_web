import type { GameState, PlayerId } from "../../type"
import { currentLevel, getCard } from "../GameState"
import { effectActiveAtLevel } from "../../../../shared/rules"

// 持ち主のフィールドに kyoshuOnBlock（BS07蹴撃の戦場跡Lv2）が有効な発生源があるか。
// hasFunsaiOnBlock と同型だが、phase 指定（相手のアタックステップ限定）を持つ
export function hasKyoshuOnBlock(state: GameState, ownerPid: PlayerId): boolean {
    const player = state.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "kyoshuOnBlock") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            return true
        }
    }
    return false
}
