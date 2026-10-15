// 【呪撃】の判定
import type { GameState, PlayerId } from "../../type"
import { currentLevel, getCard } from "../GameState"
import { effectActiveAtLevel, effectSources, isVirtualSource } from "../../../../shared/rules"
import type { CardInstance } from "../../type"
import { log } from "../GameState"
import { notifySpiritCoresRemovedByOpponent } from "../triggers"

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

// 魔影街Lv1（kind:"jugekiCoreToVoid"）：アタッカー側のフィールドに発生源がある間、
// 【呪撃】で破壊される相手スピリット上のコアを指定個数ボイドへ置く。
// GameEngine の呪撃解決が destroySpirit の**直前**に呼ぶ（破壊後だとコアは持ち主のリザーブへ
// 移っており「そのスピリット上のコア」を取れないため）。ボイド行きなのでリザーブには戻らない
export function applyJugekiCoreToVoid(
    state: GameState,
    attackerPid: PlayerId,
    victimPid: PlayerId,
    victim: CardInstance,
): void {
    for (const source of effectSources(state, attackerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "jugekiCoreToVoid") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            const removed = Math.min(effect.count, victim.cores)
            if (removed === 0) continue
            victim.cores -= removed
            log(
                state,
                `${getCard(source.cardId).name}：【呪撃】で破壊される${getCard(victim.cardId).name}のコア${removed}個をボイドに置いた。`,
            )
            notifySpiritCoresRemovedByOpponent(state, victimPid, 1, removed)
        }
    }
}
