// 【蹴撃】の判定
import { entryActive } from "../../../../shared/rules/effectStop"
import { noteCoverage } from "../../../../shared/coverage"
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
            if (!entryActive(state, ownerPid, source, effect, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            noteCoverage(effect, "kyoshuOnBlock")
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

// 【強襲】のコストを自分の疲労で払える回復状態の発生源（kind:"kyoshuSelfExhaustGrant"）。
// phaseTurn の turn は発生源の持ち主から見る（P055 は両者のアタックステップで有効）
export function kyoshuSelfExhaustSources(state: GameState, ownerPid: PlayerId): CardInstance[] {
    const out: CardInstance[] = []
    for (const source of state.players[ownerPid].field.spirits) {
        if (source.isRested) continue
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "kyoshuSelfExhaustGrant") continue
            if (!entryActive(state, ownerPid, source, effect, level)) continue
            const pt = effect.phaseTurn
            if (pt && (state.phase !== pt.phase || (pt.turn !== "both" && (pt.turn === "own") !== (state.turnPlayer === ownerPid)))) continue
            noteCoverage(effect, "kyoshuSelfExhaustGrant")
            out.push(source)
            break
        }
    }
    return out
}
