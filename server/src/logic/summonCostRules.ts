// 概念: 手札からの召喚コストを「このターン1枚だけ」変える期間つき効果の使い切り（BS23-003・084）。コストの計算側は shared/cost.ts・shared/rules/activation.ts
import { noteCoverage } from "../../../shared/coverage"
import type { CardData, GameState, PlayerId, PlayerRuleDef } from "../type"
import { getCard } from "./GameState"

function consumeRule(state: GameState, pid: PlayerId, match: (rule: PlayerRuleDef) => boolean): void {
    const at = state.timedEffects.findIndex((r) => r.target.kind === "player" && r.target.pid === pid && r.content.some((c) => c.type === "playerRule" && match(c.rule)))
    if (at !== -1) state.timedEffects.splice(at, 1)
}

// 召喚の宣言で対象が決まる（Q4458）ので、該当するカードを召喚した時点で使い切る
export function consumeSummonCostSetOnce(state: GameState, pid: PlayerId, card: CardData): void {
    consumeRule(state, pid, (r) => r.type === "summonCostSetOnceForPid" && r.cardType === card.type && card.name.includes(r.nameContains))
}

// ネクサスを疲労させて払ったら、その1枚で使い切る（Q25255）
export function consumeSummonPayByNexusExhaust(state: GameState, pid: PlayerId): void {
    consumeRule(state, pid, (r) => r.type === "summonPayByNexusExhaustForPid")
}

// summonExtraDiscard：破棄する手札のインデックス（召喚するカード自身・コストの手札破棄で使うカードは除く）。
// indices 省略時は条件に合う手札の末尾から自動で選ぶ（UI で選ばせるまでの簡略化。AI・手元からの召喚が通る）
export function summonExtraDiscardPlan(state: GameState, pid: PlayerId, handIndex: number, card: CardData, indices?: number[], costDiscardIndices?: number[]): { error: string } | { indices: number[] } {
    const extra = card.effects.find((e) => e.kind === "summonExtraDiscard")
    if (extra === undefined || extra.kind !== "summonExtraDiscard") return { indices: [] }
    const hand = state.players[pid].hand
    const ok = (i: number) => i !== handIndex && hand[i] !== undefined && (extra.cardType === undefined || getCard(hand[i]!).type === extra.cardType) && !(costDiscardIndices ?? []).includes(i)
    const picked = indices ?? hand.map((_, i) => i).filter(ok).slice(-extra.count)
    if (picked.length !== extra.count || new Set(picked).size !== picked.length || !picked.every(ok)) {
        return { error: `手札の${extra.cardType === "spirit" ? "スピリット" : ""}カード${extra.count}枚を破棄しなければ召喚できません` }
    }
    return { indices: picked }
}

export function noteSummonExtraDiscard(card: CardData): void {
    noteCoverage(card.effects.find((e) => e.kind === "summonExtraDiscard"), "summonExtraDiscard")
}
