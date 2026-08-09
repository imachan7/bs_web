// サーバー起動、Socket.io初期化、接続イベントの入口
import * as fs from "node:fs"
import * as http from "node:http"
import * as path from "node:path"
import express from "express"
import { Server, type Socket } from "socket.io"
import type { CardInstance, DeckSpec, GameAction, PlayerId } from "./type"
import { RoomManager, type Room } from "./roomManager"
import { ALL_CARDS, createGame, getCard, rawLevel, validateDeckCards, viewFor } from "./logic/GameState"
import { runTurnStart } from "./logic/PhaseManager"
import { handleAction } from "./logic/GameEngine"
import { DECK_RECIPES } from "../../data/constants"
import { accessLogMiddleware, logSocketJoin } from "./accessLog"

const PORT = Number(process.env.PORT ?? 3000)

const app = express()
// アクセスログは express.static より前（static は該当ファイルを返した時点で後段へ進まない）
app.use(accessLogMiddleware)
app.use(express.static(path.resolve(__dirname, "../../public")))
app.use("/data", express.static(path.resolve(__dirname, "../../data")))

const server = http.createServer(app)
const io = new Server(server)
const roomManager = new RoomManager()

// Azure App Service 等のヘルスチェック用エンドポイント
app.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: roomManager.roomCount })
})

// カードマスターデータ。実体は弾ごとに分割されている（data/cards/BS0N.json）が、
// クライアントには結合済みの1配列を1リクエストで返す。
// ALL_CARDS は起動時に一度だけ読むので、ここでのI/Oは発生しない
app.get("/api/cards", (_req, res) => {
    res.json(ALL_CARDS)
})
// 旧パスの互換維持。分割前は /data の静的配信で cards.json をそのまま返していたので、
// 古いクライアント（キャッシュ済みのJS）や外部ツールが404にならないよう同じ内容を返す。
// data/cards.json は既に存在せず、上の express.static は next() で素通りするのでここへ届く
app.get("/data/cards.json", (_req, res) => {
    res.json(ALL_CARDS)
})

// ---- お知らせ ----
// トップ画面の「お知らせ」欄が読む。実体は data/announcements.json。
//
// **かつては git log のコミットメッセージ（[release] 始まり）から作っていたが、JSONへ移した**（2026-08-09）。
// 理由は3つ:
//   1. 文面を直すのに履歴の書き換えが要る（実際に誤記を1件直せなかった）
//   2. .git が無い環境（Azureのデプロイ成果物）では常に空になる＝本番で機能しない
//   3. 開発者向けのコミット履歴と、対戦者が読む文面は目的が別
//
// クライアントとのレスポンス契約は据え置き（{date, message, hash}[]）。message は
// "[release:fix] …" の形に組み立てて返し、プレフィックスの解釈・除去は従来どおり
// クライアントの parseReleaseMessage が行う。hash はJSON由来では空文字。
const ANNOUNCEMENTS_FILE = path.resolve(__dirname, "../../data/announcements.json")
const ANNOUNCEMENT_LIMIT = 50
const ANNOUNCEMENT_CACHE_MS = 60 * 1000
const ANNOUNCEMENT_CATEGORIES = ["fix", "ui", "new", "info", "update"]
let announcementCache: { at: number; mtimeMs: number; entries: { date: string; message: string; hash: string }[] } | null = null

function readAnnouncements(): { date: string; message: string; hash: string }[] {
    let mtimeMs = 0
    try {
        mtimeMs = fs.statSync(ANNOUNCEMENTS_FILE).mtimeMs
    } catch {
        // ファイルが無い＝お知らせなし（画面には「更新情報はありません」が出る）
        return []
    }
    // 更新時刻が変わっていれば即座に読み直す（編集がすぐ画面へ反映されるように）
    if (
        announcementCache &&
        announcementCache.mtimeMs === mtimeMs &&
        Date.now() - announcementCache.at < ANNOUNCEMENT_CACHE_MS
    ) {
        return announcementCache.entries
    }
    let entries: { date: string; message: string; hash: string }[] = []
    try {
        const raw = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_FILE, "utf-8")) as {
            entries?: { date?: unknown; category?: unknown; text?: unknown }[]
        }
        entries = (raw.entries ?? [])
            .filter((e) => typeof e.date === "string" && typeof e.text === "string" && e.text !== "")
            .map((e) => {
                const category = typeof e.category === "string" && ANNOUNCEMENT_CATEGORIES.includes(e.category)
                    ? e.category
                    : "update"
                return { date: String(e.date), message: `[release:${category}] ${String(e.text)}`, hash: "" }
            })
            // 新しい順。日付が同じものはファイルの並び順を保つ（安定ソート）
            .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
            .slice(0, ANNOUNCEMENT_LIMIT)
    } catch (e) {
        // 壊れたJSONで画面を落とさない。サーバーログにだけ残す
        console.error("data/announcements.json の読み込みに失敗しました:", e)
        entries = []
    }
    announcementCache = { at: Date.now(), mtimeMs, entries }
    return entries
}

// パスは歴史的に /api/changelog のまま（クライアントが参照しているため変えない）
app.get("/api/changelog", (_req, res) => {
    res.json(readAnnouncements())
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

// クライアントから送られた画面状況（任意）。長さを切り詰めて保存する
function sanitizeClientContext(raw: unknown): Record<string, unknown> | undefined {
    if (!raw || typeof raw !== "object") return undefined
    const c = raw as Record<string, unknown>
    const out: Record<string, unknown> = {}
    if (typeof c.phase === "string") out.phase = c.phase.slice(0, 32)
    if (typeof c.turn === "number" && Number.isFinite(c.turn)) out.turn = c.turn
    if (typeof c.uiMode === "string") out.uiMode = c.uiMode.slice(0, 32)
    if (typeof c.lastError === "string" && c.lastError !== "") out.lastError = c.lastError.slice(0, 300)
    return Object.keys(out).length > 0 ? out : undefined
}

// スピリット／ネクサス1体を1行の文字列にする（"BS01-001 花丸ガンダーラ Lv2 コア3 疲労"）
function describeInstance(inst: CardInstance): string {
    let name = inst.cardId
    try {
        name = `${inst.cardId} ${getCard(inst.cardId).name}`
    } catch {
        // 未知の cardId（データ差し替え中など）は ID のみ
    }
    const parts = [name, `Lv${rawLevel(inst)}`, `コア${inst.cores}`]
    if (inst.isRested) parts.push("疲労")
    if (inst.tempBpBuff !== 0) parts.push(`BP${inst.tempBpBuff > 0 ? "+" : ""}${inst.tempBpBuff}`)
    return parts.join(" ")
}

// cardId 配列を「ID 名前」の配列にする（手札・トラッシュ・手元）
function describeCards(cardIds: string[]): string[] {
    return cardIds.map((cardId) => {
        try {
            return `${cardId} ${getCard(cardId).name}`
        } catch {
            return cardId
        }
    })
}

// gameId から進行中の対戦を引いて、バグ調査に使う盤面サマリとログ末尾を作る。
// 相手の手札・デッキも含める（サーバー内のみに保存する調査用データで、配信はしない）
function buildGameAttachment(gameId: string): Record<string, unknown> | null {
    const room = roomManager.findByGameId(gameId)
    const state = room?.game
    if (!state) return null
    const players: Record<string, unknown> = {}
    for (const pid of ["p1", "p2"] as const) {
        const p = state.players[pid]
        players[pid] = {
            name: p.name,
            life: p.life,
            reserve: p.reserve,
            trashCores: p.trashCores,
            deckCount: p.deck.length,
            hand: describeCards(p.hand),
            spirits: p.field.spirits.map(describeInstance),
            nexuses: p.field.nexuses.map(describeInstance),
            tegamoto: describeCards(p.tegamoto),
            trashCards: describeCards(p.trashCards.slice(-20)), // 全部は多すぎるので直近20枚
        }
    }
    return {
        gameId: state.gameId,
        roomId: room.roomId,
        turn: state.turn,
        turnPlayer: state.turnPlayer,
        phase: state.phase,
        priorityPlayer: state.priorityPlayer,
        isFlashTiming: state.isFlashTiming,
        battle: state.battle,
        pendingChoice: state.pendingChoice,
        turnConstraints: state.turnConstraints,
        winner: state.winner,
        players,
        logTail: state.log.slice(-200), // 全文ではなく末尾200行（jsonl 1行が肥大しすぎないように）
    }
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
    // 対戦中からの報告（任意）。gameId が一致する対戦が生きていればサーバー側でログと盤面を添付する。
    // 一致しない・すでに解散済みの場合は attachedGame を付けずに受理する（報告自体は失敗させない）
    const gameId = String(body.gameId ?? "").slice(0, 100)
    const you = body.you === "p1" || body.you === "p2" ? (body.you as PlayerId) : undefined
    const clientContext = sanitizeClientContext(body.clientContext)
    const attachedGame = gameId !== "" ? buildGameAttachment(gameId) : null

    const entry = {
        ts: new Date().toISOString(),
        category,
        summary,
        detail,
        contact: contact || undefined,
        ua: String(req.headers["user-agent"] ?? "").slice(0, 300),
        gameId: gameId || undefined,
        you,
        clientContext,
        attachedGame: attachedGame ?? undefined,
        attachError: gameId !== "" && !attachedGame ? "該当する対戦が見つかりませんでした（終了済み・再起動後など）" : undefined,
    }
    try {
        fs.mkdirSync(BUG_REPORT_DIR, { recursive: true })
        fs.appendFileSync(BUG_REPORT_FILE, JSON.stringify(entry) + "\n")
    } catch (e) {
        console.error("バグ報告の保存に失敗:", e)
        res.status(500).json({ ok: false, error: "保存に失敗しました。時間をおいて再送してください" })
        return
    }
    console.log(`バグ報告を受信: [${category}] ${summary}${attachedGame ? "（対戦ログ添付あり）" : ""}`)
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
            logSocketJoin(
                socket.handshake.headers as Record<string, unknown>,
                socket.handshake.address,
                roomId,
            )

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
