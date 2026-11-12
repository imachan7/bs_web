// 効果による召喚・配置で、置くコアの数（Lv）を選ばせる。選ぶのは支払いの時点（場に出す前。2026-11-11 ユーザー決定）
import type { CardData, EffectAction, GameState, PlayerId } from "../type"
import { coreRemovalAllowed } from "./coreGate"
import { suspend } from "./GameState"
import { normalReserveOf, soulCoreOnInstance } from "./soulCore"
import { summonVoidToll } from "../../../shared/rules/summonToll"

// 支払い元はリザーブ（ソウルコアを除く）とフィールドの全コア（reserveOnly＝リザーブだけ。「リザーブから使用することで」）。味方を0個にして消滅させる払い方も含める（通常の召喚と同じ）。
// ボイドの通行料（BS22-012）はリザーブから払うので、合計から引き、リザーブが足りなければ候補なし
export function summonCoreOptions(state: GameState, pid: PlayerId, card: CardData, cost: number, reserveOnly = false): { level: number; cores: number }[] {
    const player = state.players[pid]
    const toll = summonVoidToll(state, card)
    if (normalReserveOf(player) < toll) return []
    let total = normalReserveOf(player) - toll
    if (!reserveOnly) for (const inst of [...player.field.nexuses, ...player.field.spirits]) {
        const own = inst.cores - (soulCoreOnInstance(player, inst.instanceId) ? 1 : 0)
        total += Math.min(own, coreRemovalAllowed(state, { ownerPid: pid, target: inst, amount: own, cause: "cost", actorPid: pid }))
    }
    // 置く数は Lv の境目に限らない。効果による召喚はアタックステップでも起き、後からコアを動かせないため（2026-11-12 ユーザー指摘）
    const levels = [...card.levels].sort((a, b) => a.cores - b.cores)
    const min = levels[0]?.cores ?? 0
    const options: { level: number; cores: number }[] = []
    for (let n = min; cost + n <= total; n++) {
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
        effectCostPay: { pid, need: cost, sourceCardId: card.cardId, keep: first.cores, keepByOption: options.map((o) => o.cores), ...(toll > 0 ? { tollKeep: toll } : {}), ...(surcharge ? { surcharge: true as const } : {}), ...(reserveOnly ? { reserveOnly: true as const } : {}) },
    })
    return true
}
