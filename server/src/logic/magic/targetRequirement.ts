// マジックは、使うタイミングの効果に対象を取る部分しかなく、その対象が1つもいなければ使用できない
// （2026-10-22 ユーザー確認。対象を取らない部分が同じタイミングにあれば使えて、可能な限り解決する）
import type { CardData, CardInstance, EffectAction, GameState, PlayerId } from "../../type"
import { getCard, opponentOf } from "../GameState"
import { canPayResolve } from "../actions/pay"
import { pickEnemyCandidates } from "../targeting"
import { matchesTarget } from "../../../../shared/rules"

// 候補の有無を「1体ぶん払えるか」で見られる type。疲労・回復・コアを置くは下の countsAnyState で見る
// （「払えるか」は回復状態・置けるコアの数まで見るが、対象としては状態を問わず選べるため）
const ONE_TARGET_TYPES = new Set<EffectAction["type"]>([
    "destroy", "returnToHand", "returnToDeckTop", "returnToDeckBottom", "coreRemove", "heavyExhaust", "timedEffect",
])

// true＝対象を取る効果で候補が0、false＝候補がいる、null＝対象を取らない（または判定できない）部分がある
function targetMissing(state: GameState, pid: PlayerId, action: EffectAction, card: CardData): boolean | null {
    if (action.type === "sequence" || action.type === "simultaneous") {
        // 「そのスピリット」（直前に BP を上げた個体）を受ける後半は、前半が対象を取れないなら後半も何も起きないので前半の結果に従う
        const dependsOnPrev = (a: EffectAction): boolean =>
            (a.type === "timedEffect" && a.target === "lastBuffed") || (a.type === "pay" && a.then.type === "timedEffect" && a.then.target === "lastBuffed")
        const results: (boolean | null)[] = []
        action.actions.forEach((a, i) => results.push(i > 0 && dependsOnPrev(a) ? results[i - 1]! : targetMissing(state, pid, a, card)))
        if (results.some((r) => r === null)) return null
        return results.every((r) => r === true)
    }
    if (action.type === "declare") {
        if (!action.from) return null
        const side = action.fromSide === "opponent" ? opponentOf(pid) : pid
        const zone = action.from === "nexuses" ? state.players[side].field.nexuses : state.players[side].field.spirits
        if (action.minSameName === undefined) return zone.length === 0
        const names = zone.map((i) => getCard(i.cardId).name)
        return !names.some((n) => names.filter((m) => m === n).length >= action.minSameName!)
    }
    if (action.type === "exhaustAndForceBlock") {
        // 疲労済みも選べる。アタッカー自身は「アタックしていない」で除外（actions/forcedBlock.ts と同じ候補）
        const opp = opponentOf(pid)
        const attacker = state.battle?.attackerInstanceId
        const matches = (s: CardInstance) => s.instanceId !== attacker && matchesTarget(state, opp, s, (action.filter ?? {}) as never)
        return pickEnemyCandidates(state, opp, Infinity, matches, card.colors, "magic", "exhaust").length === 0
    }
    if (action.type === "removeCores") {
        // 相手のスピリット1体を選ぶ形だけ。コア数は問わない（1個しか無い相手にも使え、何も起きない）
        if (action.side !== undefined && action.side !== "opponent") return null
        if ((action.target ?? "one") !== "one" || (action.targets ?? 1) !== 1 || action.targetsCounter !== undefined) return null
        if (action.from !== undefined && !(action.from.length === 1 && action.from[0] === "spirit")) return null
        const opp = opponentOf(pid)
        const filter = (action.filter ?? {}) as never
        return pickEnemyCandidates(state, opp, Infinity, (s) => matchesTarget(state, opp, s, filter), card.colors, "magic", "other").length === 0
    }
    if (action.type === "exhaust" || action.type === "refreshOne" || action.type === "placeCores") return anyStateMissing(state, pid, action, card)
    if (!ONE_TARGET_TYPES.has(action.type)) return null
    const a = action as EffectAction & { all?: true; target?: string; costBudget?: unknown; countCounter?: unknown; filter?: { lastTarget?: unknown } }
    if ((a as { nexus?: string }).nexus === "only" && action.type !== "destroy" || a.all || a.target === "self" || a.target === "selfBrave" || a.costBudget !== undefined || a.countCounter !== undefined) return null
    // 「その〜」（前の効果の対象）は前の部分が対象を取れなければ何もしない
    if (a.filter?.lastTarget) return true
    if (action.type === "timedEffect" && action.content.every((c) => c.type === "playerRule")) return null
    const one = "count" in action && typeof action.count === "number" ? ({ ...action, count: 1 } as EffectAction) : action
    return !canPayResolve(state, pid, null, one, card.colors, "magic")
}

// 疲労済みのスピリットも「疲労させる」の対象に選べる（回復も同じ。コアを置くは置くコアの数を問わない）（2026-10-22 ユーザー確認）
function anyStateMissing(state: GameState, pid: PlayerId, action: Extract<EffectAction, { type: "exhaust" | "refreshOne" | "placeCores" }>, card: CardData): boolean | null {
    const opp = opponentOf(pid)
    let pids: PlayerId[]
    if (action.type === "exhaust") {
        if (action.all || action.target === "self" || action.nexus || action.nexusOnly || action.countCounter !== undefined || action.countFromBofu) return null
        pids = action.anySide ? [pid, opp] : action.side === "own" ? [pid] : [opp]
    } else if (action.type === "refreshOne") {
        if (action.all || action.eventTargetOnly || action.countCounter !== undefined) return null
        pids = action.anySide ? [pid, opp] : [pid]
    } else {
        if (action.to !== "spirit" || (action.target ?? "one") !== "one" || action.anyField || (action.targets ?? 1) !== 1 || action.targetsCounter !== undefined) return null
        pids = [pid]
    }
    const filter = (action.filter ?? {}) as never
    const matches = (side: PlayerId) => (s: CardInstance) => matchesTarget(state, side, s, filter)
    const found = pids.some((side) =>
        side === pid
            ? state.players[side].field.spirits.some(matches(side))
            : pickEnemyCandidates(state, side, Infinity, matches(side), card.colors, "magic", action.type === "exhaust" ? "exhaust" : "other").length > 0,
    )
    return !found
}

export function magicTargetMissing(state: GameState, pid: PlayerId, card: CardData, timing: "main" | "flash"): boolean {
    const entries = card.effects.filter((e) => e.kind === "magic" && e.timing === timing)
    if (entries.length === 0) return false
    return entries.every((e) => e.kind === "magic" && targetMissing(state, pid, e.action, card) === true)
}
