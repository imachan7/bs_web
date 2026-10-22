// マジックは、使うタイミングの効果に対象を取る部分しかなく、その対象が1つもいなければ使用できない
// （2026-10-22 ユーザー確認。対象を取らない部分が同じタイミングにあれば使えて、可能な限り解決する）
import type { CardData, EffectAction, GameState, PlayerId } from "../../type"
import { getCard, opponentOf } from "../GameState"
import { canPayResolve } from "../actions/pay"

// 候補の有無を「1体ぶん払えるか」で見られる type。疲労（回復状態しか数えない）・コアを置く／移す（コアの数を見る）は
// 「払えるか」と「対象がいるか」がずれるので入れていない
const ONE_TARGET_TYPES = new Set<EffectAction["type"]>([
    "destroy", "returnToHand", "returnToDeckTop", "returnToDeckBottom", "destroyNexus", "coreRemove", "bpBuff", "heavyExhaust", "timedEffect",
])

// true＝対象を取る効果で候補が0、false＝候補がいる、null＝対象を取らない（または判定できない）部分がある
function targetMissing(state: GameState, pid: PlayerId, action: EffectAction, card: CardData): boolean | null {
    if (action.type === "sequence" || action.type === "simultaneous") {
        const results = action.actions.map((a) => targetMissing(state, pid, a, card))
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
    if (!ONE_TARGET_TYPES.has(action.type)) return null
    const a = action as EffectAction & { all?: true; target?: string; costBudget?: unknown; countCounter?: unknown; filter?: { lastTarget?: unknown } }
    if (a.all || a.target === "self" || a.target === "selfBrave" || a.costBudget !== undefined || a.countCounter !== undefined) return null
    // 「その〜」（前の効果の対象）は前の部分が対象を取れなければ何もしない
    if (a.filter?.lastTarget) return true
    if (action.type === "timedEffect" && action.content.every((c) => c.type === "playerRule")) return null
    const one = "count" in action && typeof action.count === "number" ? ({ ...action, count: 1 } as EffectAction) : action
    return !canPayResolve(state, pid, null, one, card.colors, "magic")
}

export function magicTargetMissing(state: GameState, pid: PlayerId, card: CardData, timing: "main" | "flash"): boolean {
    const entries = card.effects.filter((e) => e.kind === "magic" && e.timing === timing)
    if (entries.length === 0) return false
    return entries.every((e) => e.kind === "magic" && targetMissing(state, pid, e.action, card) === true)
}
