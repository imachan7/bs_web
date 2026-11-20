// 手の選び方の差し替え口。段階2の新旧比較（ai:bench --vs-old）で使う。
import type { GameState, GameView, PlayerId } from "../type"
import type { AiMove } from "./legalMoves"
import { pickBestMove } from "./evaluate"
import { lookaheadPick } from "./lookahead"

// pickState は先読み用（GameState を要る）。手を返したらそれを使い、null なら pick に任せる。
// pick の入力は GameView のまま（評価に GameState を渡さない原則）
export type AiPolicy = {
    pick(view: GameView, me: PlayerId, moves: AiMove[]): AiMove | null
    pickState?(state: GameState, me: PlayerId, moves: AiMove[]): AiMove | null
}

// 段階1完了時点の選び方。段階2で点を変えても、これは pickBestMove を呼び続ける（新しい点は別関数に足す）
export const OLD_POLICY: AiPolicy = { pick: pickBestMove }

// 旧方針に、先読みで確かな改善が出た手だけを上書きさせる（対象の手の種類は LOOKAHEAD_KINDS）
export const LOOKAHEAD_POLICY: AiPolicy = { pick: pickBestMove, pickState: lookaheadPick }

// 本番の既定。先読みを選択待ちだけに使った新旧対戦は勝率の区間が50%を跨いだ（2026-11-20）ので、種類を足して測るまで旧のまま
export const DEFAULT_POLICY: AiPolicy = OLD_POLICY
