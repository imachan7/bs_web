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

export function keepGuardPick(view: GameView, me: PlayerId, moves: AiMove[], opts?: PlanOptions): AiMove | null {
    const hand = view.players[me].hand ?? []
    const mine = view.turnPlayer === me
    const kept = moves.filter((m) => m.action.type !== "castMagic" || !(wastedSpell(view, me, m) || (mine && isStopFlash(hand[m.action.handIndex]!))))
    return blockPick(view, me, kept.length > 0 ? kept : moves, opts)
}
