// 撃っても相手に当たらない・自分も同じだけ失うマジックを候補から落とす（2026-11-20）。pruneMoves（moveTags.ts）は「相手の場が空」しか見ない。
// 既定同士 400局で、相手の場に BP2000 以下がいないのにツインフレイムを撃つ・1ターン目に自分の1体だけが壊れるデッドリィバランスを撃つ、などが 167回あった
import type { EffectAction, GameView, PlayerId, ResolvedTargetFilter } from "../type"
import { getCard } from "../logic/GameState"
import { matchesTarget } from "../../../shared/rules/targetFilter"
import type { AiMove } from "./legalMoves"

const other = (pid: PlayerId): PlayerId => (pid === "p1" ? "p2" : "p1")
function leaves(a: EffectAction, out: Record<string, any>[]): void {
    const x = a as Record<string, any>
    if (x.type === "sequence") for (const s of x.actions) leaves(s, out)
    else if (x.type === "if") { leaves(x.then, out); if (x.else) leaves(x.else, out) }
    else if (x.type === "chooseActionMode") for (const m of x.modes) for (const s of m.actions) leaves(s, out)
    else out.push(x)
}
const mutual = (x: Record<string, any>) => x.type === "mutualDestroyChoice" || (x.type === "destroy" && x.side === "both")
const plainDestroy = (x: Record<string, any>) =>
    x.type === "destroy" && !x.side && !x.anySide && !x.target && !x.nexus && !x.asCost && !JSON.stringify(x.filter ?? {}).includes("self")

export function wastedSpell(view: GameView, me: PlayerId, move: AiMove): boolean {
    if (move.action.type !== "castMagic") return false
    const cardId = view.players[me].hand?.[move.action.handIndex]
    if (!cardId) return false
    const effects = getCard(cardId).effects.filter((e) => e.kind === "magic")
    if (effects.length === 0) return false
    const opp = other(me)
    const mySpirits = view.players[me].field.spirits.length
    const theirSpirits = view.players[opp].field.spirits
    return effects.every((e) => {
        const ls: Record<string, any>[] = []
        leaves((e as { action: EffectAction }).action, ls)
        const head = ls[0]
        if (!head) return false
        if (mutual(head)) return mySpirits > 0 || theirSpirits.length === 0
        if (plainDestroy(head)) return !theirSpirits.some((s) => matchesTarget(view, opp, s, head.filter as ResolvedTargetFilter | undefined))
        return false
    })
}
