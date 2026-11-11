// 効果による召喚・配置で、置くコアの数（Lv）を選ばせる。選ぶのは支払いの時点（場に出す前。2026-11-11 ユーザー決定）
import type { CardData, EffectAction, GameState, PlayerId } from "../type"
import { coreRemovalAllowed } from "./coreGate"
import { suspend } from "./GameState"
import { normalReserveOf, soulCoreOnInstance } from "./soulCore"
import { summonVoidToll } from "../../../shared/rules/summonToll"

// 支払い元はリザーブ（ソウルコアを除く）とフィールドの全コア。味方を0個にして消滅させる払い方も含める（通常の召喚と同じ）。
// ボイドの通行料（BS22-012）はリザーブから払うので、合計から引き、リザーブが足りなければ候補なし
export function summonCoreOptions(state: GameState, pid: PlayerId, card: CardData, cost: number): { level: number; cores: number }[] {
    const player = state.players[pid]
    const toll = summonVoidToll(state, card)
    if (normalReserveOf(player) < toll) return []
    let total = normalReserveOf(player) - toll
    for (const inst of [...player.field.nexuses, ...player.field.spirits]) {
        const own = inst.cores - (soulCoreOnInstance(player, inst.instanceId) ? 1 : 0)
        total += Math.min(own, coreRemovalAllowed(state, { ownerPid: pid, target: inst, amount: own, cause: "cost", actorPid: pid }))
    }
    return card.levels.filter((l) => cost + l.cores <= total).map((l) => ({ level: l.level, cores: l.cores }))
}

// Lv が2つ以上選べる、またはリザーブだけでは足りないとき、支払い待ち（effectCostPay）を立てて true。
// 答えを受けた choice.ts が、選ばれた Lv のコア数を resume の placeCores に入れて再開する。非対話は立てない（維持コアだけ置く）
export function askSummonCores(state: GameState, pid: PlayerId, card: CardData, cost: number, resume: EffectAction, surcharge = false): boolean {
    if (!state.interactiveTargets) return false
    const options = summonCoreOptions(state, pid, card, cost)
    const first = options[0]
    if (first === undefined) return false
    const toll = summonVoidToll(state, card)
    if (options.length < 2 && normalReserveOf(state.players[pid]) >= cost + first.cores + toll) return false
    suspend(state, {
        pid,
        kind: "option",
        candidates: [],
        prompt: `${card.name}：置くコアの数（Lv）を選んでください`,
        options: options.map((o) => `Lv${o.level}（コア${o.cores}個）`),
        optional: false,
        action: resume,
        selfInstanceId: null,
        effectCostPay: { pid, need: cost, sourceCardId: card.cardId, keep: first.cores, keepByOption: options.map((o) => o.cores), ...(toll > 0 ? { tollKeep: toll } : {}), ...(surcharge ? { surcharge: true as const } : {}) },
    })
    return true
}
