// サーバーを起動した状態で、2クライアントの接続〜対戦操作を通しで確認する
// 使い方: PORT=3100 tsx server/src/index.ts を起動してから PORT=3100 tsx scripts/e2e.ts
import { io, type Socket } from "socket.io-client"
import type { GameAction, GameView, PlayerId } from "../server/src/type"
import { DECK_RECIPES } from "../data/constants"

const PORT = Number(process.env.PORT ?? 3000)
const URL = `http://localhost:${PORT}`

// join に渡す任意ペイロード（deck / deckCards のどちらかを指定する）
interface JoinOptions {
    roomId?: string
    deck?: string
    deckCards?: Record<string, number>
}

function connect(name: string, options: JoinOptions): Promise<{
    socket: Socket
    playerId: PlayerId
    nextState: () => Promise<GameView>
}> {
    return new Promise((resolve, reject) => {
        const socket = io(URL, { transports: ["websocket"] })
        const stateQueue: GameView[] = []
        let waiter: ((v: GameView) => void) | null = null

        socket.on("state", (v: GameView) => {
            if (waiter) {
                const w = waiter
                waiter = null
                w(v)
            } else {
                stateQueue.push(v)
            }
        })
        socket.on("errorMessage", (msg: string) =>
            console.log(`  （${name}: エラー → ${msg}）`),
        )
        socket.on("connect_error", reject)

        socket.on("joined", (payload: { playerId: PlayerId }) => {
            resolve({
                socket,
                playerId: payload.playerId,
                nextState: () =>
                    new Promise<GameView>((res) => {
                        const queued = stateQueue.shift()
                        if (queued) res(queued)
                        else waiter = res
                    }),
            })
        })

        socket.emit("join", { roomId: "e2e-room", name, ...options })
    })
}

// join がサーバー検証で拒否されることを期待する（errorMessage を待つ）
function expectJoinError(name: string, options: JoinOptions): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = io(URL, { transports: ["websocket"] })
        socket.on("errorMessage", (msg: string) => {
            console.log(`  （${name}: エラー → ${msg}）`)
            socket.disconnect()
            resolve(msg)
        })
        socket.on("joined", () => {
            socket.disconnect()
            reject(new Error(`${name}: 不正なデッキで参加できてしまいました`))
        })
        socket.on("connect_error", reject)
        socket.emit("join", { roomId: "e2e-room", name, ...options })
    })
}

let failed = 0
function assert(cond: boolean, label: string): void {
    if (cond) console.log(`  ✅ ${label}`)
    else {
        failed++
        console.error(`  ❌ ${label}`)
    }
}

async function main(): Promise<void> {
    console.log("=== 接続とゲーム開始 ===")
    const c1 = await connect("アキラ", { deck: "red" })
    const c2 = await connect("ユウキ", { deck: "purple" })
    assert(c1.playerId === "p1", "1人目はp1")
    assert(c2.playerId === "p2", "2人目はp2")

    const [v1, v2] = await Promise.all([c1.nextState(), c2.nextState()])
    assert(v1.you === "p1" && v2.you === "p2", "それぞれの視点が届く")
    assert(v1.phase === "main", "ゲームがメインステップで開始")
    assert(v1.players.p1.hand !== null, "p1は自分の手札が見える")
    assert(v1.players.p2.hand === null, "p1から相手の手札は見えない")

    console.log("=== アクション送信 ===")
    const act = (c: typeof c1, action: GameAction) =>
        c.socket.emit("action", action)

    act(c1, { type: "endTurn" })
    const [v1b, v2b] = await Promise.all([c1.nextState(), c2.nextState()])
    assert(v1b.turnPlayer === "p2", "p1がターン終了しp2のターンになる")
    assert(v2b.players.p2.handCount === 5, "p2はドローして手札5枚")

    act(c2, { type: "endTurn" })
    const [v1c] = await Promise.all([c1.nextState(), c2.nextState()])
    assert(v1c.turnPlayer === "p1" && v1c.turn === 3, "ターン3でp1に戻る")

    c1.socket.disconnect()
    c2.socket.disconnect()

    console.log("=== カスタムデッキでの参加 ===")
    // DECK_RECIPES.red 相当の40枚を deckCards（cardId -> 枚数）として送信する
    // （cardId は constants.ts の定義を流用。smoke で cards.json との一致を検証済み）
    const customCards: Record<string, number> = { ...DECK_RECIPES.red!.cards }
    const d1 = await connect("カスタム太郎", {
        roomId: "e2e-custom",
        deckCards: customCards,
    })
    const d2 = await connect("プリセット花子", {
        roomId: "e2e-custom",
        deck: "purple",
    })
    assert(d1.playerId === "p1" && d2.playerId === "p2", "カスタムデッキで参加できる")

    const [w1] = await Promise.all([d1.nextState(), d2.nextState()])
    assert(w1.phase === "main", "カスタムデッキでゲームが開始する")
    assert(
        w1.players.p1.deckCount + w1.players.p1.handCount === 40,
        `p1のデッキ+手札が40枚（デッキ${w1.players.p1.deckCount}+手札${w1.players.p1.handCount}）`,
    )
    // 初期手札4枚 + 先攻1ターン目のドローステップ1枚 = 5枚。
    // 「先攻1ターン目はコアステップなし・ドローあり」への修正（94b4099）以降はこれが正
    assert(w1.players.p1.handCount === 5, "p1の初期手札は5枚（初期4＋ドローステップ1）")

    d1.socket.disconnect()
    d2.socket.disconnect()

    console.log("=== 不正なカスタムデッキの拒否 ===")
    // 39枚（1枚不足）
    const short: Record<string, number> = { ...customCards, "BS01-114": 2 }
    const e1 = await expectJoinError("39枚デッキ", { roomId: "e2e-invalid1", deckCards: short })
    assert(e1.includes("40枚"), "39枚のデッキは拒否される")

    // 同名4枚（ゴラドンを4枚、別カードを2枚に減らして合計は40のまま）
    const over: Record<string, number> = { ...customCards, "BS01-001": 4, "BS01-114": 2 }
    const e2 = await expectJoinError("同名4枚デッキ", { roomId: "e2e-invalid2", deckCards: over })
    assert(e2.includes("同名"), "同名4枚のデッキは拒否される")

    // 禁止カード入り（冥犬ケルル・ベロス BS02-063 を3枚入れ、合計は40のまま）
    const banned: Record<string, number> = { ...customCards, "BS02-063": 3 }
    delete banned["BS01-116"]
    const e3 = await expectJoinError("禁止カード入りデッキ", {
        roomId: "e2e-invalid3",
        deckCards: banned,
    })
    assert(e3.includes("禁止"), "禁止カード入りのデッキは拒否される")

    console.log("")
    if (failed > 0) {
        console.error(`${failed}件の失敗があります`)
        process.exit(1)
    }
    console.log("E2Eチェックに合格しました 🎉")
    process.exit(0)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
