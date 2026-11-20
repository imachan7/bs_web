// 手の選び方の差し替え口。段階2の新旧比較（ai:bench --vs-old）で使う。
import type { GameState, GameView, PlayerId } from "../type"
import type { AiMove } from "./legalMoves"
import { pickBestMove } from "./evaluate"
import { lookaheadPick } from "./lookahead"
import { planPick } from "./attackPlan"
import { blockPick } from "./blockPlan"

// pickState は先読み用（GameState を要る）。手を返したらそれを使い、null なら pick に任せる。
// pick の入力は GameView のまま（評価に GameState を渡さない原則）
export type AiPolicy = {
    pick(view: GameView, me: PlayerId, moves: AiMove[]): AiMove | null
    pickState?(state: GameState, me: PlayerId, moves: AiMove[]): AiMove | null
}

// 段階1完了時点の選び方。段階2で点を変えても、これは pickBestMove を呼び続ける（新しい点は別関数に足す）
// 旧は、バーストをセットせず、発動確認には（意味がなくても）従来どおり答える。リザーブだけで払う手だけを使う（場のコアを払う手と最低レベルの追加候補は落とす。段階1の手の集合）
export const OLD_POLICY: AiPolicy = {
    pick: (view, me, moves) =>
        pickBestMove(
            view,
            me,
            moves.filter((m) => m.action.type !== "setBurst" && !m.added).map(({ futile: _f, ...m }) => m),
        ),
}

// 旧方針に、先読みで確かな改善が出た手だけを上書きさせる（対象の手の種類は LOOKAHEAD_KINDS）
export const LOOKAHEAD_POLICY: AiPolicy = { pick: pickBestMove, pickState: lookaheadPick }

// バーストをセットし、意味のない発動は断る。場のコアも消滅させない範囲で支払いに使う。ライフ2の局面で旧の約2倍（2026-11-20）
export const BURST_POLICY: AiPolicy = { pick: pickBestMove }

// アタックの計画（attackPlan.ts）：取り切れる盤面だけ全員で行き、それ以外は BP で勝てて守り手が残る個体だけで行く。
// 基準 BURST_POLICY に構築済み 1200局 54.5〜57.9%、色デッキ 525局 57.9%（53.6〜62.2）（2026-11-20）
export const PLAN_POLICY: AiPolicy = { pick: planPick }

// ブロックかライフかを、アタッカーのシンボル数と残りのアタックで決める（blockPlan.ts）＋守っても負けるなら全員で行く。
// PLAN_POLICY に構築済み 4800局 50.8%（49.4〜52.2）・2400局 52.1%、色デッキ 52.0%。勝率の差は小さいが、受けると負けるのにライフで受ける手が消える（2026-11-20 ユーザー指示で採用）
export const BLOCK_POLICY: AiPolicy = { pick: blockPick }

// 本番の既定。ai:bench --vs-old の旧側（基準）もこれ（BS_AI_OLD=stage1 で段階1の OLD_POLICY）
export const DEFAULT_POLICY: AiPolicy = BLOCK_POLICY

// ai:bench --vs-old の新側（試す案）。基準を動かさないため、案は既存の pick 関数を書き換えず、新しい関数で手を足し引きしてここに差す
export const CANDIDATE_POLICY: AiPolicy = BLOCK_POLICY
