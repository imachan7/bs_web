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
// 旧は、バーストをセットせず、発動確認には（意味がなくても）従来どおり答える（段階1の手の集合）
export const OLD_POLICY: AiPolicy = {
    pick: (view, me, moves) =>
        pickBestMove(
            view,
            me,
            moves.filter((m) => m.action.type !== "setBurst").map(({ futile: _f, ...m }) => m),
        ),
}

// 旧方針に、先読みで確かな改善が出た手だけを上書きさせる（対象の手の種類は LOOKAHEAD_KINDS）
export const LOOKAHEAD_POLICY: AiPolicy = { pick: pickBestMove, pickState: lookaheadPick }

// バーストをセットし、意味のない発動は断る。全体の新旧対戦では差が出ない（構築済み 4800局 50.8%）が、ライフ2で守りのバーストを持つ局面では
// 勝率が旧の約2倍（19.8% 対 9.8%）になったので既定にする（2026-11-20）
export const BURST_POLICY: AiPolicy = { pick: pickBestMove }

// 本番の既定
export const DEFAULT_POLICY: AiPolicy = BURST_POLICY
