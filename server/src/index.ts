// サーバー起動、Socket.io初期化、接続イベントの入口
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
