// ランダムマッチの計測ログ（統合ロビー設計メモ Phase 0）。
//
// **なぜ測るのか**: マッチングの流動性（成立率・待機時間）は、これまで実測が無く
// 推測でしか議論できなかった。待機列に入った／成立した／諦めて離れた、の3点だけを
// 記録し、scripts/match-stats.ts で集計する。以後のロビー改善（シーク掲示板など）の
// 要否と効果はこの数字で判断する。
//
// **出し方は accessLog.ts と揃える**: stdout へタブ区切り1行で出し、保存先は
// ホスティング側（Cloud Logging / docker ログ）に任せる。行頭タグ `#MATCH` が
// 集計側の目印。個人の追跡はしない（訪問者は accessLog と同じ日替わりハッシュで、
// 日をまたぐ名寄せはできない）。
import { visitorId } from "./accessLog"

export const MATCH_TAG = "#MATCH"

// 待機をやめた理由。`matched` と合わせて「待機がどう終わったか」の内訳になる
export type MatchLeftReason =
    | "toggle" // ランダムマッチボタンの2回押し（取り消しトグル）
    | "cancel" // 画面の「待機をやめる」
    | "to_room" // 合言葉ルームへ移った
    | "to_ai" // AI戦へ移った
    | "disconnect" // 切断（タブを閉じた等）

function emit(
    headers: Record<string, unknown>,
    remoteAddress: string | undefined,
    event: string,
    detail: string,
): void {
    const clean = detail.replace(/[\t\r\n]/g, " ").slice(0, 200)
    console.log(
        `${MATCH_TAG}\t${new Date().toISOString()}\t${event}\t${visitorId(headers, remoteAddress)}\t${clean}`,
    )
}

// 待機列に入った。queue は参加直後の待機人数
export function logMatchQueued(
    headers: Record<string, unknown>,
    remoteAddress: string | undefined,
    queueSize: number,
): void {
    emit(headers, remoteAddress, "queued", `queue=${queueSize}`)
}

// マッチが成立した（成立したプレイヤー1人につき1行）。waitMs は並んでから成立までの時間
export function logMatchMatched(
    headers: Record<string, unknown>,
    remoteAddress: string | undefined,
    waitMs: number,
): void {
    emit(headers, remoteAddress, "matched", `wait_ms=${Math.max(0, Math.round(waitMs))}`)
}

// 成立せずに待機をやめた。waitMs は並んでから離れるまでの時間
export function logMatchLeft(
    headers: Record<string, unknown>,
    remoteAddress: string | undefined,
    reason: MatchLeftReason,
    waitMs: number,
): void {
    emit(
        headers,
        remoteAddress,
        "left",
        `reason=${reason} wait_ms=${Math.max(0, Math.round(waitMs))}`,
    )
}
