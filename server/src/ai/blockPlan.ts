// ブロックするかライフで受けるか（2026-11-20 ユーザーの指示）。アタックしているスピリットのシンボル数だけライフが減るとして、
// 受けてもこのターンの残りのアタック（まだ回復状態の相手の個体）を、残る自分のブロッカーで止められるだけ止めて生き残れるかで決める
import type { GameView, PlayerId } from "../type"
import { effectiveBp } from "../../../shared/rules"
import { instanceSymbolCount } from "../../../shared/rules/symbols"
import type { AiMove } from "./legalMoves"
import { planPick, restAfterTop, type PlanOptions } from "./attackPlan"

const other = (pid: PlayerId): PlayerId => (pid === "p1" ? "p2" : "p1")

// ponytail: 相手の手札・バースト・【激突】などの効果、ブロッカーが勝てるかは残りの打点の計算に入れない
export function blockPick(view: GameView, me: PlayerId, moves: AiMove[], opts: PlanOptions = { desperate: true }): AiMove | null {
    const pick = planPick(view, me, moves, opts)
    const battle = view.battle
    if (!battle || view.turnPlayer === me || (pick?.action.type !== "block" && pick?.action.type !== "takeLife")) return pick
    const opp = other(me)
    const attacker = view.players[opp].field.spirits.find((s) => s.instanceId === battle.attackerInstanceId)
    const takeLife = moves.find((m) => m.action.type === "takeLife")
    const blocks = moves.filter((m) => m.action.type === "block")
    if (!attacker || !takeLife || blocks.length === 0) return pick
    const life = view.players[me].life
    const rest = view.players[opp].field.spirits.filter((s) => !s.isRested && s.instanceId !== attacker.instanceId).map(instanceSymbolCount)
    const idle = view.players[me].field.spirits.filter((s) => !s.isRested).length
    const attackerBp = effectiveBp(view, opp, attacker)
    const bpOf = (m: AiMove) => {
        const id = (m.action as { instanceId: string }).instanceId
        return effectiveBp(view, me, view.players[me].field.spirits.find((s) => s.instanceId === id)!)
    }
    const winning = blocks.filter((m) => bpOf(m) > attackerBp).sort((a, b) => bpOf(a) - bpOf(b))
    if (winning.length > 0) return winning[0]!
    // ライフで受けても、残りのアタックを idle 体で止めてなおライフが残るか
    // ライフで受けても、残りのアタックを idle 体で止めてなおライフが残るなら受けて資源にする。
    // 1つ余分に残るときだけ受ける形は 2400局 48.1%（46.1〜50.1）で悪かった（2026-11-20）
    if (life - instanceSymbolCount(attacker) > restAfterTop(rest, idle)) return takeLife
    return [...blocks].sort((a, b) => bpOf(a) - bpOf(b))[0]!
}
