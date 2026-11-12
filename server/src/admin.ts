// 運営用の口：サーバーの状態を見る・対戦中の人へ更新のお知らせを出す（2026-11-12 ユーザー要望）。
// 鍵（環境変数 ADMIN_KEY）を x-admin-key ヘッダーで渡したときだけ応答し、それ以外は 404（口があることも見せない）。
// 鍵を URL に載せないのはアクセスログに残るため（/api/bug-reports は ?key= の旧方式）。
// デプロイ前の待機（.github/workflows/ci.yml）と `npm run status`（scripts/status.ts）が使う
import { timingSafeEqual } from "node:crypto"
import express, { type Express, type Request } from "express"
import type { Server } from "socket.io"
import type { MatchQueue, Room, RoomManager } from "./roomManager"

// 最後の操作からこれ以上経った対局は、放置とみなしてデプロイを待たない
const ABANDONED_MS = 10 * 60 * 1000

let notice: string | null = null

function authorized(req: Request): boolean {
    // 鍵ファイル（openssl の出力）から Secret Manager へ入れると末尾の改行も入る。送る側（scripts/status.ts）は除いて送るので、こちらも除いて比べる
    const key = process.env.ADMIN_KEY?.trim()
    const given = req.get("x-admin-key")
    if (!key || !given) return false
    const a = Buffer.from(key)
    const b = Buffer.from(given)
    return a.length === b.length && timingSafeEqual(a, b)
}

export interface RoomStatus {
    room: string
    kind: "ai" | "match" | "named"
    state: "waiting" | "playing" | "finished"
    turn: number | null
    humans: number // 接続中の人間の数
    idleMin: number // 最後の操作から何分経ったか
    blocking: boolean // デプロイを待つべき対局か（決着前・人間が接続中・放置でない）
}

function roomStatus(room: Room, now: number): RoomStatus {
    const humans = (["p1", "p2"] as const).filter((pid) => room.players[pid]?.connected === true && room.players[pid]?.isAi !== true).length
    const state = !room.game ? "waiting" : room.game.winner ? "finished" : "playing"
    const idleMs = now - (room.lastActivityAt ?? now)
    return {
        room: room.roomId,
        kind: room.ai ? "ai" : room.roomId.startsWith("match-") ? "match" : "named",
        state,
        turn: room.game?.turn ?? null,
        humans,
        idleMin: Math.floor(idleMs / 60000),
        blocking: state === "playing" && humans > 0 && idleMs < ABANDONED_MS,
    }
}

export function registerAdmin(app: Express, io: Server, rooms: RoomManager, queue: MatchQueue): void {
    // 新しく繋いだ人にも、出ているお知らせを見せる
    io.on("connection", (socket) => {
        if (notice !== null) socket.emit("notice", notice)
    })

    app.get("/api/admin/status", (req, res) => {
        if (!authorized(req)) {
            res.status(404).end()
            return
        }
        const now = Date.now()
        const list = rooms.list().map((r) => roomStatus(r, now))
        res.json({
            revision: process.env.K_REVISION ?? "local",
            uptimeMin: Math.floor(process.uptime() / 60),
            sockets: io.sockets.sockets.size,
            queue: queue.size,
            notice,
            blocking: list.filter((r) => r.blocking).length,
            rooms: list,
        })
    })

    // { message: string } で出す、{ message: null } で消す
    app.post("/api/admin/notice", express.json({ limit: "4kb" }), (req, res) => {
        if (!authorized(req)) {
            res.status(404).end()
            return
        }
        const message: unknown = req.body?.message
        if (message !== null && (typeof message !== "string" || message.length === 0 || message.length > 200)) {
            res.status(400).json({ ok: false, error: "message は200文字以内の文字列か null" })
            return
        }
        notice = message
        io.emit("notice", notice)
        res.json({ ok: true, notice })
    })
}
