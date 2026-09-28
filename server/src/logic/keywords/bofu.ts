import type { GameState, PlayerId } from "../../type"
import { currentLevel, getCard } from "../GameState"
import { effectActiveAtLevel, effectSources, isVirtualSource } from "../../../../shared/rules"

export { bofuCountFor } from "../../../../shared/rules"

// 持ち主のフィールドに bofuOnBlock（BS07大風車の丘Lv2）が有効な発生源があるか。
// hasKyoshuOnBlock と同型で、こちらは phase に加えて turn 条件も持つ
export function hasBofuOnBlock(state: GameState, ownerPid: PlayerId): boolean {
    const player = state.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "bofuOnBlock") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
            return true
        }
    }
    return false
}

// 持ち主のフィールドに bofuChooserSelf（BS07ワールウィンド）が有効な発生源があるか。
// あるとき、【暴風】の疲労対象は「疲労させられる側」ではなく持ち主自身が選ぶ
export function hasBofuChooserSelf(state: GameState, ownerPid: PlayerId): boolean {
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "bofuChooserSelf") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // phase（BS09-060緑翼の大樹Lv2＝『お互いのアタックステップ』）。
            // データには書いてあったのに型と実装が読んでおらず、メインステップでも効いていた（2026-08-24 修正）
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            return true
        }
    }
    return false
}
