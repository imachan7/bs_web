// アクセスログ。標準出力へ1行ずつ書き出すだけの薄い層で、保存先はホスティング側に任せる。
//
// **なぜ stdout なのか**: 本番は Azure App Service の Linux プランで動いており、
// Azure の「Web サーバーのログ記録」（httpLogs.fileSystem）は Windows プラン専用で、
// Linux では有効にしても http/RawLogs が一切生成されない（2026-08-09 に実地で確認）。
// 一方 stdout は docker ログとして LogFiles/*_docker.log に残り、
// `az webapp log download` で丸ごと回収できる。集計は scripts/access-stats.ts が行う。
//
// **個人情報**: IPアドレスはそのまま残さず、日替わりソルト付きハッシュの先頭8文字だけを記録する。
// 「その日に何人が来たか」を数えるには足りる一方、日をまたぐと同じ人でも別IDになるため、
// 継続利用者の追跡はできない（意図的にそうしている）。
import { createHash } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

// 集計側が grep で拾う目印。docker ログには起動ログや例外も混ざるため、
// 行頭のタグで確実に切り分ける
export const ACCESS_TAG = "#ACCESS"

// 静的アセットは記録しない（1ページ表示で数十行に膨らみ、訪問数が読めなくなる）
const STATIC_EXT = /\.(js|css|map|png|jpe?g|gif|svg|ico|woff2?|ttf)$/i

// Always On の死活監視。5分おきに来るので、混ぜるとアクセス数がこれで埋まる
function isKeepAlive(userAgent: string, urlPath: string): boolean {
    return userAgent.includes("AlwaysOn") || urlPath === "/health"
}

function hashIp(ip: string): string {
    const day = new Date().toISOString().slice(0, 10)
    return createHash("sha256").update(`bs_web:${day}:${ip}`).digest("hex").slice(0, 8)
}

// プロキシ（App Service のフロントエンド）越しなので、実クライアントは x-forwarded-for の先頭
function clientIp(headers: Record<string, unknown>, fallback: string | undefined): string {
    const forwarded = String(headers["x-forwarded-for"] ?? "")
    const first = forwarded.split(",")[0]?.trim()
    return first || fallback || "-"
}

// タブ区切り1行。値にタブ・改行が混ざると集計が壊れるので落としておく
function emit(kind: string, visitor: string, detail: string): void {
    const clean = detail.replace(/[\t\r\n]/g, " ").slice(0, 200)
    console.log(`${ACCESS_TAG}\t${new Date().toISOString()}\t${kind}\t${visitor}\t${clean}`)
}

// Express ミドルウェア。**express.static より前に登録すること**
// （static は該当ファイルが見つかった時点で応答を返し、後段のミドルウェアへ進まない）
export function accessLogMiddleware(req: Request, res: Response, next: NextFunction): void {
    const urlPath = req.path
    const userAgent = String(req.headers["user-agent"] ?? "")
    if (!isKeepAlive(userAgent, urlPath) && !STATIC_EXT.test(urlPath)) {
        const visitor = hashIp(clientIp(req.headers as Record<string, unknown>, req.socket.remoteAddress))
        // ページ（拡張子なし＝HTMLを返す経路）と API を分けておくと、
        // 「訪問数」と「通信量」を混同せずに数えられる
        const kind = urlPath.startsWith("/api/") || urlPath.startsWith("/data/") ? "api" : "page"
        emit(kind, visitor, `${req.method} ${urlPath}`)
    }
    next()
}

// Socket.IO 側。HTTPのページビューは「開いただけ」を含むので、
// 実際に対戦へ入った数はこちらで別に数える
export function logSocketJoin(
    headers: Record<string, unknown>,
    remoteAddress: string | undefined,
    roomId: string,
): void {
    emit("join", hashIp(clientIp(headers, remoteAddress)), roomId)
}
