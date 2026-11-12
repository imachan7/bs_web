// 効果による召喚・配置で、置くコアの数（Lv）を選ばせる。選ぶのは支払いの時点（場に出す前。2026-11-11 ユーザー決定）
import type { CardData, EffectAction, GameState, PaySource, PlayerId } from "../type"
import { autoPayPlan } from "./EffectModules"
import { suspend } from "./GameState"
import { normalReserveOf } from "./soulCore"
import { summonVoidToll } from "../../../shared/rules/summonToll"

// 効果による召喚の「払えるか」と「おまかせの払い方」は、すべてこれを通す（選択肢・召喚できるかの判定・自動の支払いの基準を揃える。#437 R9-2）。
// 維持コアを残して払えればその払い方、払えなければ味方を0個にして消滅させる払い方（通常の召喚と同じ）。
// 以前は選択肢が消滅払いを数え、自動の支払いは数えなかったため、出した選択肢を自動では払えず止まった
export function summonPayPlan(state: GameState, pid: PlayerId, need: number, reserveOnly = false): { paySources: PaySource[]; soulFromReserve: boolean } | null {
    if (reserveOnly) return normalReserveOf(state.players[pid]) >= need ? { paySources: [], soulFromReserve: false } : null
    return autoPayPlan(state, pid, need, true) ?? autoPayPlan(state, pid, need)
}

// 置けるコアの数の選択肢。ボイドの通行料（BS22-012）はリザーブから払うので、リザーブが足りなければ候補なし
export function summonCoreOptions(state: GameState, pid: PlayerId, card: CardData, cost: number, reserveOnly = false): { level: number; cores: number }[] {
    const toll = summonVoidToll(state, card)
    if (normalReserveOf(state.players[pid]) < toll) return []
    // 置く数は Lv の境目に限らない。効果による召喚はアタックステップでも起き、後からコアを動かせないため（2026-11-12 ユーザー指摘）
    const levels = [...card.levels].sort((a, b) => a.cores - b.cores)
    const min = levels[0]?.cores ?? 0
    const options: { level: number; cores: number }[] = []
    for (let n = min; summonPayPlan(state, pid, cost + n + toll, reserveOnly) !== null; n++) {
        options.push({ level: levels.filter((l) => l.cores <= n).at(-1)!.level, cores: n })
    }
    return options
}

export function summonCoreLabel(o: { level: number; cores: number }): string {
    return `コア${o.cores}個（Lv${o.level}）`
}

// Lv が2つ以上選べる、またはリザーブだけでは足りないとき、支払い待ち（effectCostPay）を立てて true。
// 答えを受けた choice.ts が、選ばれた Lv のコア数を resume の placeCores に入れて再開する。非対話は立てない（維持コアだけ置く）
export function askSummonCores(state: GameState, pid: PlayerId, card: CardData, cost: number, resume: EffectAction, surcharge = false, reserveOnly = false): boolean {
    if (!state.interactiveTargets) return false
    const options = summonCoreOptions(state, pid, card, cost, reserveOnly)
    const first = options[0]
    if (first === undefined) return false
    const toll = summonVoidToll(state, card)
    if (options.length < 2 && normalReserveOf(state.players[pid]) >= cost + first.cores + toll) return false
    suspend(state, {
        pid,
        kind: "option",
        candidates: [],
        prompt: `${card.name}：置くコアの数を選んでください`,
        options: options.map(summonCoreLabel),
        stepper: true,
        optional: false,
        action: resume,
        // 再開後も「この効果で召喚された」を判定できるよう、発生源を引き継ぐ
        selfInstanceId: state.currentEffectSource?.pid === pid ? state.currentEffectSource.instanceId ?? null : null,
        effectCostPay: { pid, need: cost, sourceCardId: card.cardId, keep: first.cores, keepByOption: options.map((o) => o.cores), suggestByOption: options.map((o) => summonPayPlan(state, pid, cost + o.cores + toll, reserveOnly)!.paySources), ...(toll > 0 ? { tollKeep: toll } : {}), ...(surcharge ? { surcharge: true as const } : {}), ...(reserveOnly ? { reserveOnly: true as const } : {}) },
    })
    return true
}
