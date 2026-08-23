// サーバーを起動した状態で、2クライアントの接続〜対戦操作を通しで確認する
// 使い方: PORT=3100 tsx server/src/index.ts を起動してから PORT=3100 tsx scripts/e2e.ts
import { io, type Socket } from "socket.io-client"
import type { GameAction, GameView, PlayerId } from "../server/src/type"
import { DECK_RECIPES } from "../data/constants"

import { loadAllCards } from "../data/loadCards"

const PORT = Number(process.env.PORT ?? 3000)
const URL = `http://localhost:${PORT}`

// 盤面差し替えの検証に置くスピリット。**実データから決定的に選ぶ**
// （cardId の直書きは過去にIDが全面的にズレた事故があるため。CLAUDE.md「重要な罠」）
const SAMPLE_SPIRIT = (
    loadAllCards() as unknown as { cardId: string; type?: string; effects?: unknown[] }[]
).find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!.cardId

// AI戦の検証に使うデッキ。**コスト1以下のスピリットだけ**で40枚を組む。
//
// ⚠️ ここを既存のレシピ（purple 等）に戻さないこと。紫デッキは「ターン2のリザーブ4個で
// 軽減なしでも出せるスピリット」が15枚しかなく、**手札5枚に1枚も来ない確率が8%**ある。
// その8%を引くとAIは召喚もアタックもできず、「AIが盤面を作っている」の検証が
// AIの不具合ではなく手札事故で落ちる（2026-08-23 に CI が実際にこれで落ちた）。
//
// カードは実データから決定的に選ぶ（cardId の直書きは過去にIDがズレた事故があるため）。
// デッキ検証を通すために、同名3枚まで・合計40枚ちょうど・禁止カードなしを満たす
function buildLowCostAiDeck(): Record<string, number> {
    const all = loadAllCards() as unknown as {
        cardId: string
        name: string
        type?: string
        cost: number
        limited?: boolean
    }[]
    const seenNames = new Set<string>()
    const pool = all
        .filter((c) => c.type === "spirit" && c.cost <= 1 && c.limited !== true)
        .sort((a, b) => a.cardId.localeCompare(b.cardId))
        // 同名カードは1種類に絞る（枚数制限は cardId ではなく**名前**で合算されるため）
        .filter((c) => {
            if (seenNames.has(c.name)) return false
            seenNames.add(c.name)
            return true
        })
    const deck: Record<string, number> = {}
    let total = 0
    for (const card of pool) {
        if (total >= 40) break
        const count = Math.min(3, 40 - total)
        deck[card.cardId] = count
        total += count
    }
    if (total !== 40) {
        throw new Error(`AI検証用デッキを40枚組めません（コスト1以下のスピリットが${pool.length}種類）`)
    }
    return deck
}

const AI_TEST_DECK = buildLowCostAiDeck()

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

// join を送らずに接続だけする。ランダムマッチ・AI戦は join とは別の入口を使うため、
// 「接続してから好きなイベントを送り、返ってくるイベントを待つ」形が要る
interface OpenClient {
    socket: Socket
    nextState: (timeoutMs?: number) => Promise<GameView>
    once: <T>(event: string, timeoutMs?: number) => Promise<T>
}

function open(name: string): OpenClient {
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
    socket.on("errorMessage", (msg: string) => console.log(`  （${name}: エラー → ${msg}）`))
    return {
        socket,
        nextState: (timeoutMs = 8000) =>
            new Promise<GameView>((resolve, reject) => {
                const queued = stateQueue.shift()
                if (queued) {
                    resolve(queued)
                    return
                }
                const timer = setTimeout(() => reject(new Error(`${name}: state が届きませんでした`)), timeoutMs)
                waiter = (v) => {
                    clearTimeout(timer)
                    resolve(v)
                }
            }),
        once: <T,>(event: string, timeoutMs = 8000) =>
            new Promise<T>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`${name}: ${event} が届きませんでした`)), timeoutMs)
                socket.once(event, (payload: T) => {
                    clearTimeout(timer)
                    resolve(payload)
                })
            }),
    }
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

    console.log("=== 「対戦ルームに入る」を2回押したときの取り消し ===")
    // 同じ socket が2回 join すると、以前は同じ人が p1 と p2 の両方に座り、
    // 自分対自分で操作できない状態になっていた（2026-08-13 利用者報告）。
    // 2回目は参加の取り消しになり、席が空く
    {
        const dup = await connect("二度押し太郎", { roomId: "e2e-dup", deck: "red" })
        assert(dup.playerId === "p1", "1回目でp1に座る")
        const cancelled = await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("joinCancelled が届きませんでした")), 3000)
            dup.socket.on("joinCancelled", (payload: { roomId: string }) => {
                clearTimeout(timer)
                resolve(payload.roomId)
            })
            dup.socket.on("state", () => {
                clearTimeout(timer)
                reject(new Error("2回目の参加でゲームが始まってしまいました（自分対自分）"))
            })
            dup.socket.emit("join", { roomId: "e2e-dup", name: "二度押し太郎", deck: "red" })
        })
        assert(cancelled === "e2e-dup", "2回目の参加は取り消される（ゲームは始まらない）")

        // 取り消した後は、別の人がその席に座れる
        const other = await connect("あとから花子", { roomId: "e2e-dup", deck: "purple" })
        assert(other.playerId === "p1", "空いた席（p1）に別の人が入れる")
        other.socket.disconnect()
        dup.socket.disconnect()
    }

    // ── デバッグ用の盤面差し替え（ローカル実行時だけ有効な機能）────────────────
    // 「盤面と手札を用意して実際に動かして確かめる」ための入口。対戦画面は既存のまま使う
    console.log("=== デバッグ用の盤面差し替え ===")
    {
        const enabled = (await (await fetch(`${URL}/api/debug/enabled`)).json()) as { enabled?: boolean }
        assert(enabled.enabled === true, "ローカル実行ではデバッグ機能が有効になる")

        const roomId = "e2e-debug"
        const d1 = await connect("盤面太郎", { roomId, deck: "red" })
        const d2 = await connect("盤面次郎", { roomId, deck: "blue" })
        await d1.nextState() // 対戦開始の配信

        const board = {
            turn: 5,
            turnPlayer: "p1",
            phase: "main",
            players: {
                p1: { life: 3, reserve: 8, hand: [], field: { spirits: [{ cardId: SAMPLE_SPIRIT, cores: 2 }] } },
                p2: { life: 4, field: { spirits: [{ cardId: SAMPLE_SPIRIT, cores: 1, isRested: true }] } },
            },
        }
        const res = await fetch(`${URL}/api/debug/setup`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roomId, board }),
        })
        assert(res.status === 200, `盤面の差し替えが成功する（実際: ${res.status}）`)

        const v = await d1.nextState()
        assert(v.turn === 5 && v.phase === "main", "ターン・フェーズが指定どおりになる")
        assert(v.players.p1.life === 3 && v.players.p2.life === 4, "両者のライフが指定どおりになる")
        assert(v.players.p1.field.spirits.length === 1, "自分の場が指定どおりになる")
        assert(v.players.p2.field.spirits[0]?.isRested === true, "相手の疲労状態も指定できる")

        // 打ち間違いを黙って通さない（盤面が静かに欠けるのを防ぐ）
        const bad = await fetch(`${URL}/api/debug/setup`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roomId, board: { players: { p1: { hand: ["ZZZ-999"] } } } }),
        })
        assert(bad.status === 400, "存在しないカードIDは拒否される")

        const noRoom = await fetch(`${URL}/api/debug/setup`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roomId: "e2e-nosuch", board: {} }),
        })
        assert(noRoom.status === 404, "存在しないルームは拒否される")

        d1.socket.disconnect()
        d2.socket.disconnect()
    }

    // ── ランダムマッチ（合言葉を決めずに、待っている2人を突き合わせる）────────────
    console.log("=== ランダムマッチ ===")
    {
        const a = open("待ち子")
        a.socket.emit("randomMatch", { name: "待ち子", deck: "red" })
        const queued = await a.once<{ waiting: number }>("matchQueued")
        assert(queued.waiting === 1, "1人目は待機列に並ぶ（待ち人数1）")

        const b = open("来た郎")
        // マッチは2人目の送信と同時に成立するので、待ち受けを**送信前に**登録しておく
        const aFound = a.once<{ roomId: string }>("matchFound")
        const bFound = b.once<{ roomId: string }>("matchFound")
        b.socket.emit("randomMatch", { name: "来た郎", deck: "blue" })
        const [fa, fb] = await Promise.all([aFound, bFound])
        assert(fa.roomId === fb.roomId, "2人が同じルームでマッチする")
        assert(fa.roomId.startsWith("match-"), `ルームIDは自動生成される（${fa.roomId}）`)

        const [va, vb] = await Promise.all([a.nextState(), b.nextState()])
        assert(va.you === "p1" && vb.you === "p2", "先に待っていた側がp1に座る")
        assert(va.phase === "main" && va.turn === 1, "マッチ成立でそのまま対戦が始まる")
        assert(va.players.p2.name === "来た郎", "相手の名前が届く")
        a.socket.disconnect()
        b.socket.disconnect()
    }

    console.log("=== ランダムマッチの取り消し ===")
    {
        const c = open("やめ子")
        c.socket.emit("randomMatch", { name: "やめ子", deck: "green" })
        await c.once("matchQueued")
        const cancelled = c.once("matchCancelled")
        c.socket.emit("cancelRandomMatch")
        await cancelled
        assert(true, "待機を取り消せる")

        // 取り消した人は列に残らない：次に並んだ人は「待ち人数1」になる（マッチしてしまわない）
        const d = open("次の人")
        d.socket.emit("randomMatch", { name: "次の人", deck: "white" })
        const q = await d.once<{ waiting: number }>("matchQueued")
        assert(q.waiting === 1, "取り消した人は列に残らない")
        c.socket.disconnect()
        d.socket.disconnect()
    }

    console.log("=== 待機中に別の入口へ移ったら待機は取り消される ===")
    {
        // ランダムマッチで待ちながら合言葉ルームにも座れてしまうと、後からマッチが成立したときに
        // 同じ socket が2つのルームに座り、action がどちらの対戦に届くか分からなくなる
        const e = open("しびれ切れ子")
        e.socket.emit("randomMatch", { name: "しびれ切れ子", deck: "red" })
        await e.once("matchQueued")
        const cancelledByJoin = e.once("matchCancelled")
        e.socket.emit("join", { roomId: "e2e-queue-then-join", name: "しびれ切れ子", deck: "red" })
        const joined = await e.once<{ playerId: PlayerId }>("joined")
        await cancelledByJoin
        assert(joined.playerId === "p1", "待機中でも合言葉ルームには座れる")
        assert(true, "合言葉ルームに座った時点で待機は取り消される")

        // 待機列が空になっているので、次に並んだ人は「待ち人数1」になる（幽霊が残っていない）
        const f = open("次の人")
        f.socket.emit("randomMatch", { name: "次の人", deck: "blue" })
        const q = await f.once<{ waiting: number }>("matchQueued")
        assert(q.waiting === 1, "合言葉ルームへ移った人は待機列に残らない")
        e.socket.disconnect()
        f.socket.disconnect()
    }

    // ── AI戦（相手を待たずに1人で始める。AI はサーバー側で指す）────────────────
    console.log("=== AI戦 ===")
    {
        const c = open("ひとり太郎")
        // AI には低コスト確定のデッキを渡す（手札事故でテストが落ちないように。AI_TEST_DECK の注記を参照）
        c.socket.emit("startAi", {
            name: "ひとり太郎",
            deck: "red",
            aiDeckCards: AI_TEST_DECK,
            aiName: "AI紫",
        })
        const joined = await c.once<{ playerId: PlayerId; roomId: string }>("joined")
        assert(joined.playerId === "p1", "AI戦では自分がp1に座る")
        assert(joined.roomId.startsWith("ai-"), `AI戦のルームIDは ai- で始まる（${joined.roomId}）`)

        const v = await c.nextState()
        assert(v.phase === "main" && v.turnPlayer === "p1", "相手を待たずにそのまま対戦が始まる")
        assert(v.players.p2.name === "AI紫", "指定した名前でAIが座る")

        // ターンを渡すと AI が指し始める。AI はアタックまでしてくるので、
        // こちら側も応答しないと止まる（フラッシュはパス、アタックはライフで受ける）。
        // 同じ局面へ二重に送らないよう、局面の署名を見て1回だけ応答する
        c.socket.emit("action", { type: "endTurn" })
        let view = await c.nextState()
        let guard = 0
        let lastSignature = ""
        let attackedByAi = false
        while (!(view.turnPlayer === "p1" && view.turn >= 3 && !view.battle) && guard < 400) {
            guard++
            const signature = [
                view.turn,
                view.phase,
                view.isFlashTiming,
                view.battle?.attackerInstanceId ?? "-",
                view.battle?.blockerInstanceId ?? "-",
                view.pendingChoice?.prompt ?? "-",
            ].join("/")
            if (signature !== lastSignature) {
                lastSignature = signature
                if (view.pendingChoice?.pid === "p1") {
                    // 選択待ちは候補の先頭を選ぶ（選べなければスキップ）
                    const first = view.pendingChoice.candidates[0]
                    c.socket.emit(
                        "action",
                        first ? { type: "resolveChoice", instanceId: first } : { type: "resolveChoice" },
                    )
                } else if (view.battle) {
                    attackedByAi = true
                    if (view.isFlashTiming && view.priorityPlayer === "p1") {
                        c.socket.emit("action", { type: "pass" })
                    } else if (!view.battle.blockerInstanceId) {
                        c.socket.emit("action", { type: "takeLife" })
                    }
                }
            }
            view = await c.nextState()
        }
        assert(view.turnPlayer === "p1" && view.turn >= 3, `AIが指し終えて自分の手番に戻る（ターン${view.turn}）`)
        assert(
            view.players.p2.field.spirits.length > 0,
            `AIが実際に盤面を作っている（AIのスピリット${view.players.p2.field.spirits.length}体）`,
        )
        assert(attackedByAi, "AIがアタックを仕掛けてくる")
        assert(view.players.p1.hand !== null && view.players.p2.hand === null, "AIの手札は見えない")
        c.socket.disconnect()
    }

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
