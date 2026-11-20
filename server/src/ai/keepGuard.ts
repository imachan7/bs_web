// アタックステップ・バトルを終わらせる守りのマジックを、自分のターンに撃たない。既定同士 400局で、ウィンドウォールを自分のメインステップで 23回
// （相手のアタック中は 15回）、絶甲氷盾を 6回（同 7回）撃っていた。【連鎖】の疲労などが除去として点を持つため（2026-11-20 の計測）
import type { GameView, PlayerId } from "../type"
import { getCard } from "../logic/GameState"
import type { AiMove } from "./legalMoves"
import { anyNode } from "./moveTags"
import { blockPick } from "./blockPlan"

const STOPS = new Set(["endAttackStepAfterBattle", "endAttackStep", "endBattle"])
export const isStopFlash = (cardId: string): boolean =>
    getCard(cardId).type === "magic" && getCard(cardId).effects.some((e) => e.kind === "magic" && e.timing === "flash" && anyNode((e as { action: unknown }).action, (x) => STOPS.has(x.type)))

export function keepGuardPick(view: GameView, me: PlayerId, moves: AiMove[]): AiMove | null {
    if (view.turnPlayer !== me) return blockPick(view, me, moves)
    const hand = view.players[me].hand ?? []
    const kept = moves.filter((m) => m.action.type !== "castMagic" || !isStopFlash(hand[m.action.handIndex]!))
    return blockPick(view, me, kept.length > 0 ? kept : moves)
}
