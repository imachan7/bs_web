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

// 本番の既定。場のコアの支払い・Lv1 召喚・バーストが入った後は、アタックの先読みを足しても先読みなしと差が出なかった
// （構築済み 2400局で 50.9%、48.9〜52.9。2026-11-20）ので、計算の軽い先読みなしにする。先読みは LOOKAHEAD_POLICY に残す
export const DEFAULT_POLICY: AiPolicy = BURST_POLICY

// ai:bench --vs-old の新側（試す案）。基準（旧側）は既定で BURST_POLICY に固定してある（2026-11-20 ユーザーと合意）。
// 基準を動かさないため、案の変更は pickBestMove・enumerateLegalMoves を書き換えず、この方針の中で手を足し引きする
export const CANDIDATE_POLICY: AiPolicy = BURST_POLICY
