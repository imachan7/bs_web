import type { CardInstance, GameState, PlayerId } from "../../type"
import { currentLevel, getCard } from "../GameState"
import { bravesOf, effectActiveAtLevel } from "../../../../shared/rules"
import { continuousKeywordGrantCount } from "../EffectModules"

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

// 【強襲：N】の上限回数。合体しているブレイヴ側にだけ書かれている場合（BS10バズーカ・アームズ）と、
// 継続付与（keywordGrant）の両方を見て大きい方を採る。持たなければ 0
export function kyoshuLimitOf(state: GameState, owner: PlayerId, self: CardInstance): number {
    let staticLimit = 0
    for (const src of [self, ...bravesOf(state.players[owner], self)]) {
        const srcLevel = currentLevel(src).level
        const entry = getCard(src.cardId).effects.find(
            (e) => e.kind === "keyword" && e.keyword === "kyoshu" && effectActiveAtLevel(e.levels, srcLevel),
        )
        if (entry && entry.kind === "keyword") staticLimit = Math.max(staticLimit, entry.count ?? 1)
    }
    return Math.max(staticLimit, continuousKeywordGrantCount(state, owner, self, "kyoshu"))
}

export function kyoshuUsedOf(state: GameState, self: CardInstance): number {
    return self.kyoshuUsed?.turn === state.turn ? self.kyoshuUsed.count : 0
}
