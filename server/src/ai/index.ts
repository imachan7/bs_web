// AI プレイヤーの意思決定。
//
// 作りは「合法手を列挙し（legalMoves.ts）、1手だけ評価して最善を選ぶ（evaluate.ts）」。
// 先読みはしない。強さより**止まらないこと**を優先していて、盤面がどう転んでも
// 必ず何かしらの手（最後は endTurn / pass / 選択のスキップ）が候補に残るようにしてある。
import type { GameState, PlayerId } from "../type"
import { viewFor } from "../logic/GameState"
import { enumerateLegalMoves, type AiMove } from "./legalMoves"
import { pickBestMove } from "./evaluate"

export type { AiMove } from "./legalMoves"

// アクションを一意の文字列にする。ランナーが「サーバーに弾かれた手」を覚えて避けるのに使う
export function moveKey(move: AiMove): string {
    return JSON.stringify(move.action)
}

// AI が次に打つ手を決める。null は「今は AI の手番ではない」（相手の入力待ち）。
// exclude には、直前に弾かれて再試行したくない手のキーを渡す
export function decideAiAction(
    state: GameState,
    pid: PlayerId,
    exclude: ReadonlySet<string> = new Set(),
): AiMove | null {
    const moves = enumerateLegalMoves(state, pid).filter((m) => !exclude.has(moveKey(m)))
    if (moves.length === 0) return null
    // 評価に渡すのは AI 自身の視点（相手の手札を持たない GameView）。evaluate.ts の冒頭を参照
    return pickBestMove(viewFor(state, pid), pid, moves)
}
