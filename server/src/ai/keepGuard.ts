// 無駄撃ちのマジックを候補から落とす（2026-11-20）。(1) アタックステップ・バトルを終わらせる守りのマジックを自分のターンに撃たない。
// 既定同士 400局で、ウィンドウォールを自分のメインステップで 23回（相手のアタック中は 15回）、絶甲氷盾を 6回（同 7回）撃っていた。
// メインステップで他に打つ手が無いと、タグが unknown のマジックの点 25 がアタックステップへ（20）より上になるため。(2) wastedSpell（spellFilter.ts）
import type { GameView, PlayerId } from "../type"
import { getCard } from "../logic/GameState"
import type { AiMove } from "./legalMoves"
import { anyNode } from "./moveTags"
import { blockPick } from "./blockPlan"
import type { PlanOptions } from "./attackPlan"
import { wastedSpell } from "./spellFilter"

const STOPS = new Set(["endAttackStepAfterBattle", "endAttackStep", "endBattle"])
export const isStopFlash = (cardId: string): boolean =>
    getCard(cardId).type === "magic" && getCard(cardId).effects.some((e) => e.kind === "magic" && e.timing === "flash" && anyNode((e as { action: unknown }).action, (x) => STOPS.has(x.type)))

// 相手のアタック・ブロックにだけ働く「このターンの間」の効果（2026-11-22 ユーザー確認：自分のターンに相手の効果でライフを守る場面より、相手のターンに残す方が多い）。
// 1つでも自分のターンに働く部分があるマジック（フェーズチェンジの連鎖の召喚など）は含めない
const GUARD_RULES = new Set(["lifeGuard", "ignoreUnblockableForPid"])
function guardLeaf(x: Record<string, any>, cardId: string): boolean {
    if (x.type === "designate") return true
    if (x.type === "lendSelfThisTurn") {
        const lent = getCard(cardId).effects.filter((e) => (e as { lentOnly?: boolean }).lentOnly) as Record<string, any>[]
        return lent.length > 0 && lent.every((e) => e.kind === "jugekiOnBlockReplace" || (e.kind === "effectGrant" && e.granted?.trigger === "onBlock") || (e.kind === "fieldEvent" && e.event === "ownLifeDamaged"))
    }
    if (x.type !== "timedEffect" || x.duration === "battle") return false
    return (x.content as Record<string, any>[]).every((c) =>
        c.type === "canBlockWhileRested" || (c.type === "mustAttack" && x.side !== "own") || (c.type === "playerRule" && GUARD_RULES.has(c.rule?.type)) || (c.type === "immune" && x.filter?.blocking))
}
function leaves(a: Record<string, any>, out: Record<string, any>[]): void {
    if (a.type === "sequence") for (const s of a.actions) leaves(s, out)
    else if (a.type === "if") { leaves(a.then, out); if (a.else) leaves(a.else, out) }
    else out.push(a)
}
export const isGuardFlash = (cardId: string): boolean => {
    const fl = getCard(cardId).effects.filter((e) => e.kind === "magic" && e.timing === "flash")
    if (getCard(cardId).type !== "magic" || fl.length === 0) return false
    const ls: Record<string, any>[] = []
    for (const e of fl) leaves((e as { action: Record<string, any> }).action, ls)
    return ls.some((x) => x.type !== "designate") && ls.every((x) => guardLeaf(x, cardId))
}

export function keepGuardPick(view: GameView, me: PlayerId, moves: AiMove[], opts?: PlanOptions): AiMove | null {
    const hand = view.players[me].hand ?? []
    const mine = view.turnPlayer === me
    const kept = moves.filter((m) => m.action.type !== "castMagic" || !(wastedSpell(view, me, m) || (mine && (isStopFlash(hand[m.action.handIndex]!) || isGuardFlash(hand[m.action.handIndex]!)))))
    return blockPick(view, me, kept.length > 0 ? kept : moves, opts)
}
