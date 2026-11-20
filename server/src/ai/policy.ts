// 手の選び方の差し替え口。段階2の新旧比較（ai:bench --vs-old）で使う。
import type { GameView, PlayerId } from "../type"
import type { AiMove } from "./legalMoves"
import { pickBestMove } from "./evaluate"

export type AiPolicy = { pick(view: GameView, me: PlayerId, moves: AiMove[]): AiMove | null }

// 段階1完了時点の選び方。段階2で点を変えても、これは pickBestMove を呼び続ける（新しい点は別関数に足す）
export const OLD_POLICY: AiPolicy = { pick: pickBestMove }

// 本番の既定。段階2の新しい選び方が採用されたらここを差し替える
export const DEFAULT_POLICY: AiPolicy = OLD_POLICY
