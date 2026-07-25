// サーバー起動、Socket.io初期化、接続イベントの入口
import * as fs from "node:fs"
import * as http from "node:http"
import * as path from "node:path"
import express from "express"
import { Server, type Socket } from "socket.io"
import type { DeckSpec, GameAction, PlayerId } from "./type"
import { RoomManager, type Room } from "./roomManager"
import { createGame, validateDeckCards, viewFor } from "./logic/GameState"
import { runTurnStart } from "./logic/PhaseManager"
import { handleAction } from "./logic/GameEngine"
import { DECK_RECIPES } from "../../data/constants"

const PORT = Number(process.env.PORT ?? 3000)

const app = express()
app.use(express.static(path.resolve(__dirname, "../../public")))
app.use("/data", express.static(path.resolve(__dirname, "../../data")))

const server = http.createServer(app)
const io = new Server(server)
const roomManager = new RoomManager()

// Azure App Service 等のヘルスチェック用エンドポイント
app.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: roomManager.roomCount })
})

// ---- バグ報告フォーム ----
// 保存先はデプロイの上書きで消えないよう環境変数で外に逃がせる（Azureでは BUG_REPORT_DIR=/home/bugreports を設定）
const BUG_REPORT_DIR = process.env.BUG_REPORT_DIR || path.resolve(__dirname, "../../data")
const BUG_REPORT_FILE = path.join(BUG_REPORT_DIR, "bug-reports.jsonl")
const BUG_CATEGORIES = ["対戦（ルール・効果）", "対戦（画面・操作）", "デッキビルダー", "その他"]

// 素朴なレート制限（IPごとに1分5件まで）
const bugReportHits = new Map<string, number[]>()
function bugReportAllowed(ip: string): boolean {
    const now = Date.now()
    const hits = (bugReportHits.get(ip) ?? []).filter((t) => now - t < 60_000)
    if (hits.length >= 5) return false
    hits.push(now)
    bugReportHits.set(ip, hits)
    return true
}

app.post("/api/bug-report", express.json({ limit: "32kb" }), (req, res) => {
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown").split(",")[0] ?? "unknown"
    if (!bugReportAllowed(ip)) {
        res.status(429).json({ ok: false, error: "送信が多すぎます。しばらく待ってから再送してください" })
        return
    }
    const body = req.body ?? {}
    const category = String(body.category ?? "")
    const summary = String(body.summary ?? "").trim()
    const detail = String(body.detail ?? "").trim()
    const contact = String(body.contact ?? "").trim()
    if (!BUG_CATEGORIES.includes(category)) {
        res.status(400).json({ ok: false, error: "カテゴリが不正です" })
        return
    }
    if (summary.length === 0 || summary.length > 100) {
        res.status(400).json({ ok: false, error: "概要は1〜100文字で入力してください" })
        return
    }
    if (detail.length === 0 || detail.length > 4000) {
        res.status(400).json({ ok: false, error: "詳細は1〜4000文字で入力してください" })
        return
    }
    if (contact.length > 200) {
        res.status(400).json({ ok: false, error: "連絡先が長すぎます" })
        return
    }
    const entry = {
        ts: new Date().toISOString(),
        category,
        summary,
        detail,
        contact: contact || undefined,
        ua: String(req.headers["user-agent"] ?? "").slice(0, 300),
    }
    try {
        fs.mkdirSync(BUG_REPORT_DIR, { recursive: true })
        fs.appendFileSync(BUG_REPORT_FILE, JSON.stringify(entry) + "\n")
    } catch (e) {
        console.error("バグ報告の保存に失敗:", e)
        res.status(500).json({ ok: false, error: "保存に失敗しました。時間をおいて再送してください" })
        return
    }
    console.log(`バグ報告を受信: [${category}] ${summary}`)
    res.json({ ok: true })
})

// 報告の閲覧（管理用。環境変数 BUG_REPORT_KEY を設定し ?key= で一致したときのみ）
app.get("/api/bug-reports", (req, res) => {
    const key = process.env.BUG_REPORT_KEY
    if (!key || req.query.key !== key) {
        res.status(404).end()
        return
    }
    let lines: string[] = []
    try {
        lines = fs.readFileSync(BUG_REPORT_FILE, "utf-8").trim().split("\n").filter((l) => l !== "")
    } catch {
        // ファイル未作成＝報告0件
    }
    res.json({ ok: true, count: lines.length, reports: lines.map((l) => JSON.parse(l)) })
})

// 両プレイヤーへそれぞれの視点の状態を送信する
function broadcastState(room: Room): void {
    if (!room.game) return
    for (const pid of ["p1", "p2"] as const) {
        const player = room.players[pid]
        if (player?.connected) {
            io.to(player.socketId).emit("state", viewFor(room.game, pid))
        }
    }
}

io.on("connection", (socket: Socket) => {
    socket.on(
        "join",
        (payload: {
            roomId?: string
            name?: string
            deck?: string
            deckCards?: Record<string, number>
        }) => {
            const roomId = String(payload.roomId || "room1")
            const name = String(payload.name || "プレイヤー")

            // deckCards（カスタムデッキ）が指定されていれば deck キーより優先する
            let deckSpec: DeckSpec
            if (
                payload.deckCards !== undefined &&
                payload.deckCards !== null &&
                typeof payload.deckCards === "object" &&
                !Array.isArray(payload.deckCards)
            ) {
                const deckError = validateDeckCards(payload.deckCards)
                if (deckError) {
                    socket.emit("errorMessage", `デッキが不正です: ${deckError}`)
                    return
                }
                deckSpec = payload.deckCards
            } else {
                const deck = String(payload.deck || "red")
                if (!DECK_RECIPES[deck]) {
                    socket.emit("errorMessage", "不明なデッキです")
                    return
                }
                deckSpec = deck
            }

            const result = roomManager.join(roomId, socket.id, name, deckSpec)
            if ("error" in result) {
                socket.emit("errorMessage", result.error)
                return
            }

            const { room, playerId } = result
            socket.join(roomId)
            socket.emit("joined", { playerId, roomId })

            // 2人そろったらゲーム開始
            const p1 = room.players.p1
            const p2 = room.players.p2
            if (p1 && p2 && !room.game) {
                room.game = createGame(
                    room.roomId,
                    { p1: p1.name, p2: p2.name },
                    { p1: p1.deck, p2: p2.deck },
                )
                // 実対戦は誘発効果の対象をプレイヤーに選ばせる（smokeは既定falseのまま自動選択）
                room.game.interactiveTargets = true
                runTurnStart(room.game)
                broadcastState(room)
            }
        },
    )

    socket.on("action", (action: GameAction) => {
        const found = roomManager.findBySocket(socket.id)
        if (!found || !found.room.game) {
            socket.emit("errorMessage", "ゲームが開始されていません")
            return
        }
        const error = handleAction(found.room.game, found.playerId, action)
        if (error) {
            socket.emit("errorMessage", error)
        } else {
            broadcastState(found.room)
        }
    })

    socket.on("disconnect", () => {
        const found = roomManager.leave(socket.id)
        if (found) {
            const other: PlayerId = found.playerId === "p1" ? "p2" : "p1"
            const otherPlayer = found.room.players[other]
            if (otherPlayer?.connected) {
                io.to(otherPlayer.socketId).emit("opponentLeft")
            }
        }
    })
})

server.listen(PORT, () => {
    console.log(`bs_web server: http://localhost:${PORT}`)
})
