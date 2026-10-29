// 召喚を止める禁止の問い合わせ。召喚の制限は効果文に「通常の召喚」と書かれていなければ、効果による召喚にも効く
// （2026-10-29 ユーザー確認。docs/design/EFFECT_GATE.md §4 PR 2a）。新しい禁止はここへ足す
import { noteCoverage } from "../../../shared/coverage"
import { effectSources, isVanillaCard, timedPlayerRules } from "../../../shared/rules"
import { entryActive } from "../../../shared/rules/effectStop"
import { braveCombineCandidates } from "../../../shared/summon"
import type { GameState, PlayerId } from "../type"
import { currentLevel, getCard, opponentOf } from "./GameState"

export interface SummonAttempt {
    pid: PlayerId
    cardId: string
    from: "hand" | "trash" | "burst" | "deck" | "revealed"
    cause: "normal" | "effect"
    flash?: true
    braveTargetInstanceId?: string | undefined // ダイレクトブレイヴは体数が増えない
    viaBurstAction?: true // summon{from:"burst"} はバースト効果そのものなので resolvingBurstPid を見ない
    mayCombine?: true // 合体先をまだ決めていない段階（候補判定・バーストの自動合体）。ブレイヴは合体先があれば体数が増えずに出られる
}

function globalConstraintsOf(state: GameState, pid: PlayerId, type: string, withBraves = false) {
    const out: { effect: any; inst: ReturnType<typeof effectSources>[number] }[] = []
    const owners = state.players[pid].field
    const insts = withBraves ? effectSources(state, pid) : [...owners.spirits, ...owners.nexuses]
    for (const inst of insts) {
        const level = currentLevel(inst).level
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "globalConstraint" || effect.constraint.type !== type) continue
            if (!entryActive(state, pid, inst, effect, level)) continue
            out.push({ effect, inst })
        }
    }
    return out
}

export function summonDenial(state: GameState, a: SummonAttempt): string | null {
    const card = getCard(a.cardId)
    const both: PlayerId[] = ["p1", "p2"]

    if (a.cause === "effect") {
        // BS12-072：効果による召喚が両陣営で禁じられている間
        for (const p of both) {
            for (const { effect } of globalConstraintsOf(state, p, "noSummonByEffect", true)) {
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                return "効果による召喚が禁じられています"
            }
        }
    }

    // BS16-058サテライド・バード（ブレイヴは対象外）
    if (card.type === "spirit" && (a.viaBurstAction || state.resolvingBurstPid !== undefined) && timedPlayerRules(state, a.pid).some((c) => c.type === "noBurstSpiritSummonForPid")) {
        return "このターンの間バースト効果でスピリットを召喚できません"
    }

    // 旋風渦巻く渓谷（両陣営の発生源のうち最も厳しい値）
    const combinesDirectly = a.braveTargetInstanceId !== undefined || (a.mayCombine === true && card.type === "brave" && braveCombineCandidates(state, a.pid, a.cardId).length > 0)
    if (state.phase === "main" && !combinesDirectly) {
        let cap: number | null = null
        for (const p of both) {
            for (const { effect } of globalConstraintsOf(state, p, "maxSpiritsOnField")) {
                noteCoverage(effect, "globalConstraint")
                cap = cap === null ? effect.constraint.max : Math.min(cap, effect.constraint.max)
            }
        }
        if (cap !== null && state.players[a.pid].field.spirits.length >= cap) return `効果により、スピリットは${cap}体までしか召喚できません`
    }

    // 発生源の持ち主から見た相手（召喚する側）への制限。数えるのはこのターンに出た体数（通常・効果を合算）
    const mine = state.players[a.pid].field.spirits
    const opp = opponentOf(a.pid)
    for (const { effect } of globalConstraintsOf(state, opp, "summonLimitByCostForOpponent")) {
        const { maxCost, limit } = effect.constraint
        if (card.cost > maxCost) continue
        if (mine.filter((s) => s.summonedTurn === state.turn && getCard(s.cardId).cost <= maxCost).length >= limit) {
            return `効果により、コスト${maxCost}以下のスピリットはこのターンあと召喚できません`
        }
    }
    if (a.from === "hand") {
        for (const { effect } of globalConstraintsOf(state, opp, "summonLimitByEffectForOpponent")) {
            if (isVanillaCard(card)) continue
            if (mine.filter((s) => s.summonedTurn === state.turn && !isVanillaCard(getCard(s.cardId))).length >= effect.constraint.limit) {
                return "効果により、効果の記述を持つスピリットはこのターンあと召喚できません"
            }
        }
    }
    return null
}
