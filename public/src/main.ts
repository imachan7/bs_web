// サーバー通信、ユーザー操作の受付、状態購読
import type { CardData, GameAction, GameView, PlayerId } from "../../server/src/type"
import { master, render, setCardDb, showToast, showWaiting, hideWaiting, type UiState } from "./renderer"
import { attachCardArt, installSecretCardArt, preloadCardArt } from "./cardArt"
import { onPayStageClick, openBravePay, openEffectSummonPay, openEffectSummonScreen, installPayStages } from "./ui/payStages"
import { exReductionEffectiveCount, exReductionPickedIndices, exReductionSymbolsFor, payingCardId, payingIsCostOnly, payingRemaining } from "./ui/paying"
import { setupEffectTooltip } from "./ui/tooltip"
import { AWAKEN_FROM_RESERVE, canAwakenFromReserve, minLevelCores } from "../../shared/rules"
import { braveCombineCandidates, braveExchangeTargets } from "../../shared/summon"
import { DECK_STORAGE_KEY, CUSTOM_DECK_PREFIX, customDecks, deckRecipes, setDeckRecipes, rebuildDeckSelects, rememberDeckSelection, rememberLobbyInputs, loadChangelog } from "./ui/lobby"
import { loadPayMode, savePayMode, payModeLabel, payModeHint, submitPaying, changeAltPay, startChoicePaying, assignPayCore } from "./ui/payInput"
import { waitForOpponent, type DeckChoice, type WaitExtra } from "./matchWait"
import { assetUrl } from "./assetUrl"
import { installCardDock } from "./ui/cardDock"
import { installStatusMenu } from "./ui/statusMenu"
import { installSpiritLayout } from "./ui/spiritLayout"
import { confirmExtraCost, sendCoreRemove, sendSoulCoreRemove, tryPlay, onBurstSetClick, onHandAbilityClick, onHandBurstEffectClick, onHandClick, startMagic, tryResolveChoice, onMySpiritClick, sendAttack, onOppSpiritClick } from "./ui/play"
import { randomId } from "../../shared/randomId"

// socket.io クライアントは /socket.io/socket.io.js から読み込まれる
interface SocketLike {
    readonly connected: boolean
    emit: (event: string, payload?: unknown) => void
    on: (event: string, handler: (payload: any) => void) => void
    off: (event: string, handler?: (payload: any) => void) => void
    connect: () => void
}


// 端末ごとの合言葉。接続が切れても、これが同じなら対戦中の席に戻れる（server/src/roomManager.ts の resume）
function loadPlayerRef(): string {
    try {
        const saved = localStorage.getItem("bs_player_ref")
        if (saved) return saved
        const created = randomId()
        localStorage.setItem("bs_player_ref", created)
        return created
    } catch {
        return randomId() // 保存できない環境では、このページを開いている間だけ有効
    }
}

// 「サーバー上に決着前の対局がある」の目印。ページを読み直したときに席へ戻るかどうかを決める
const IN_MATCH_KEY = "bs_in_match"
function setInMatch(on: boolean): void {
    try {
        if (on) localStorage.setItem(IN_MATCH_KEY, "1")
        else localStorage.removeItem(IN_MATCH_KEY)
    } catch {
        // 保存できなくても、ページを開いている間の再接続は動く（inMatch を見る）
    }
}
let inMatch = (() => {
    try {
        return localStorage.getItem(IN_MATCH_KEY) === "1"
    } catch {
        return false
    }
})()

declare const io: (opts?: { autoConnect?: boolean; auth?: Record<string, string> }) => SocketLike

// ページ読み込み時には接続しない（Cloud Run は min-instances=0 のため、ロビーを開いただけの
// 訪問者にも常時接続させるとコストが伸びる。docs/ops/PERF_PLAN.md §5）。
// 実際に対戦操作をするボタンを押したときだけ connectAndRun() 経由で接続する
const socket = io({ autoConnect: false, auth: { playerRef: loadPlayerRef() } })

// 対戦していない接続はサーバーが15分で切る（課金対策。server/src/index.ts の「放置接続の切断」）。
// サーバーから切られたときだけ socket.io は自動で再接続しないので、次の操作かタブ復帰で繋ぎ直す。
// 切断中の emit は socket.io が溜めて再接続後に送るので、押したボタンはそのまま効く
socket.on("disconnect", (reason: string) => {
    if (inMatch && reason !== "io server disconnect") showToast("接続が切れました。再接続しています…")
    if (reason !== "io server disconnect") return
    const events = ["pointerdown", "keydown", "visibilitychange"] as const
    const reconnect = () => {
        if (document.visibilityState !== "visible") return
        for (const ev of events) document.removeEventListener(ev, reconnect, true)
        socket.connect()
    }
    for (const ev of events) document.addEventListener(ev, reconnect, true)
})

// 未接続ならボタンを「接続中…」表示にして無効化し、繋がってから action() を実行する。
// Cloud Run が min-instances=0 でコールドスタートする間、ボタンが押せる（＝何も起きていないように
// 見える）のを防ぐ。一定時間で繋がらない場合・接続エラーの場合はボタンを元に戻してトーストで知らせる
const CONNECT_TIMEOUT_MS = 10_000

function connectAndRun(button: HTMLElement, action: () => void): void {
    if (socket.connected) {
        action()
        return
    }
    const btn = button as HTMLButtonElement
    if (btn.disabled) return // 二重クリック防止
    const original = btn.textContent
    btn.disabled = true
    btn.textContent = "接続中…"

    const cleanup = () => {
        clearTimeout(timer)
        socket.off("connect", onConnect)
        socket.off("connect_error", onError)
        btn.disabled = false
        btn.textContent = original
    }
    const onConnect = () => {
        cleanup()
        action()
    }
    const onError = () => {
        cleanup()
        showToast("サーバーに接続できませんでした。もう一度お試しください")
    }
    const timer = setTimeout(onError, CONNECT_TIMEOUT_MS)

    socket.on("connect", onConnect)
    socket.on("connect_error", onError)
    socket.connect()
}


export let view: GameView | null = null
export const ui: UiState = { payMode: loadPayMode(), targeting: null, awakenTarget: null, paying: null, directedAttack: null, battleSwapSummon: null, braveSummonSelect: null, altSummonSelect: null, combineBrave: null, exReductionSelect: null, soulCoreOnlySelect: null, magicTimingSelect: null, magicTiming: null, soulSwapSelect: null, stepper: null, burstResetConfirm: null }
let activeTrashTab: "mine" | "opp" = "mine"
let activeTegamotoTab: "mine" | "opp" = "mine"
let lastErrorText: string = ""
// joined の種別を区別する（"room" = 合言葉ルーム、"random" / "ai" = 即対戦）
let joinMode: "room" | "random" | "ai" = "room"

// AI戦はブラウザの中の Worker（public/src/aiWorker/worker.ts）が相手をする。サーバーへは接続しない
// （接続を張っている間ずっと Cloud Run の課金が続くため。docs/ops/DEPLOY_CLOUDRUN.md §5）
let aiWorker: Worker | null = null
// 対戦の進行を受けるハンドラ。サーバー（socket）と Worker が同じイベント名で送ってくる
const gameHandlers: Record<string, (payload: any) => void> = {}
function onGame(event: string, handler: (payload: any) => void): void {
    socket.on(event, handler)
    gameHandlers[event] = handler
}

type AiCrash = { message: string; stack: string; turn?: number; phase?: string; logTail: string[] }
// Worker の中で起きた例外と AI の手詰まりを、利用者の操作なしでバグ報告として送る（サーバーは AI戦の中身を見ていないので、送らないと誰にも届かない）。
// 同じ対戦で例外が続いても送るのは1回（サーバーの受け口は1分5件までで、手動の報告の枠を潰さないため）
let aiCrashReported = false
function reportAiCrash(crash: AiCrash): void {
    if (aiCrashReported) return
    aiCrashReported = true
    const detail = [crash.stack || crash.message, "", "--- 直前のログ ---", ...crash.logTail].join("\n")
    fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            category: "対戦（ルール・効果）",
            summary: `AI戦の異常（自動送信）: ${crash.message}`.slice(0, 100),
            // 受け口の上限は4000文字。例外の内容を先頭に置き、あふれるのはログの古い側ではなく末尾になるが、原因の行は残る
            detail: detail.slice(0, 4000),
            clientContext: { phase: crash.phase, turn: crash.turn, uiMode: "ai-local", lastError: crash.message },
        }),
    }).catch(() => {})
}

// Worker を起動して AI戦を始める。起動できないブラウザでは、従来どおりサーバーの AI と対戦する
function startLocalAi(button: HTMLElement, payload: unknown): void {
    const btn = button as HTMLButtonElement
    if (btn.disabled) return
    const original = btn.textContent
    btn.disabled = true
    btn.textContent = "準備中…"
    const restore = () => {
        btn.disabled = false
        btn.textContent = original
    }
    let worker: Worker
    const fallback = () => {
        if (view) return showToast("AI戦でエラーが起きました。ロビーに戻ってやり直してください")
        worker?.terminate()
        aiWorker = null
        restore()
        connectAndRun(btn, () => socket.emit("startAi", payload))
    }
    try {
        // Worker もカードデータを取るので、版つきの URL を渡す（本体と同じ URL ならブラウザのキャッシュから読める）
        const workerUrl = new URL(assetUrl("/dist/aiWorker.js"), location.href)
        workerUrl.searchParams.set("cards", assetUrl("/api/cards"))
        worker = new Worker(workerUrl)
    } catch {
        return fallback()
    }
    worker.onerror = fallback
    worker.onmessage = (e: MessageEvent<{ event: string; payload?: unknown }>) => {
        if (e.data.event === "crash") return reportAiCrash(e.data.payload as AiCrash)
        if (e.data.event !== "state") restore() // joined か、デッキ不正などの errorMessage
        gameHandlers[e.data.event]?.(e.data.payload)
    }
    aiWorker = worker
    aiCrashReported = false
    worker.postMessage({ event: "startAi", payload })
    // 対戦開始の件数の記録（失敗しても対戦には関係ない）
    fetch("/api/ai-start", { method: "POST" }).catch(() => {})
}

export function send(action: GameAction): void {
    if (!confirmExtraCost(action)) return
    if (aiWorker) aiWorker.postMessage({ event: "action", payload: action })
    else socket.emit("action", action)
}

function renderTrashPanel(view: GameView, tab: "mine" | "opp"): void {
    const trashContent = document.getElementById("trash-content")
    if (!trashContent) return
    trashContent.innerHTML = ""
    
    const pid = tab === "mine" ? view.you : opponentOf(view.you)
    const trash = view.players[pid].trashCards || []
    
    const groupedTrash = new Map<string, number>()
    trash.forEach(cardId => {
        groupedTrash.set(cardId, (groupedTrash.get(cardId) || 0) + 1)
    })
    
    groupedTrash.forEach((count, cardId) => {
        const m = master(cardId)
        const el = document.createElement("div")
        el.className = "card"
        el.style.setProperty("--c-main", `var(--c-${m.colors[0]})`)
        el.style.setProperty("--c-sub", `var(--c-${m.colors[m.colors.length > 1 ? 1 : 0]})`)
        const name = document.createElement("div")
        name.className = "name"
        name.textContent = m.name
        name.style.fontSize = "10px"
        name.style.whiteSpace = "nowrap"
        name.style.overflow = "hidden"
        name.style.textOverflow = "ellipsis"
        el.appendChild(name)
        
        if (count > 1) {
            const badge = document.createElement("div")
            badge.className = "count-badge"
            badge.textContent = `x${count}`
            el.appendChild(badge)
        }
        
        attachCardArt(el, cardId, m.name)
        el.dataset.cardId = cardId // enable tooltip
        trashContent.appendChild(el)
    })
}

function renderTegamotoPanel(view: GameView, tab: "mine" | "opp"): void {
    const tegamotoContent = document.getElementById("tegamoto-content")
    if (!tegamotoContent) return
    tegamotoContent.innerHTML = ""
    
    const pid = tab === "mine" ? view.you : opponentOf(view.you)
    const tegamoto = view.players[pid].tegamoto || []
    
    tegamoto.forEach((cardId, index) => {
        const m = master(cardId)
        const el = document.createElement("div")
        el.className = "card"
        el.style.setProperty("--c-main", `var(--c-${m.colors[0]})`)
        el.style.setProperty("--c-sub", `var(--c-${m.colors[m.colors.length > 1 ? 1 : 0]})`)
        
        const name = document.createElement("div")
        name.className = "name"
        name.textContent = m.name
        name.style.fontSize = "10px"
        name.style.whiteSpace = "nowrap"
        name.style.overflow = "hidden"
        name.style.textOverflow = "ellipsis"
        el.appendChild(name)
        
        el.dataset.cardId = cardId // enable tooltip
        el.dataset.tegamotoIndex = String(index)
        if (tab === "mine" && (m.type === "magic" || m.type === "spirit" || m.type === "brave")) {
            el.classList.add("clickable")
        }
        tegamotoContent.appendChild(el)
    })
}

export function rerender(): void {
    if (view) {
        render(view, ui)
        renderTrashPanel(view, activeTrashTab)
        renderTegamotoPanel(view, activeTegamotoTab)
    }
}

// ---- サーバーからのイベント ----

onGame("joined", () => {
    if (joinMode === "room") {
        showWaiting()
    }
})

socket.on("joinCancelled", () => {
    hideWaiting()
    // 相手が現れなかったルームから席を外した直後なら、同じ条件で待ち直す
    if (arrival?.expired) {
        const { retry } = arrival
        arrival = null
        showToast("相手が来なかったので、待ち直します")
        retry()
    }
})

// ---- 相手待ち（ランダムマッチ・合言葉ルーム） ----
// 待っている間は接続を張らず、数秒おきに問い合わせる（public/src/matchWait.ts）。相手が決まってから socket をつないでルームへ入る

// 待ちをやめる関数。待っていなければ null
let stopWaiting: (() => void) | null = null
// 相手が決まって入ったルームで、相手の到着を待っている間の控え。
// 相手が roomId を受け取る前にタブを閉じていると自分だけがルームに残るので、来なければ席を外して待ち直す
let arrival: { timer: ReturnType<typeof setTimeout>; join: () => void; retry: () => void; expired: boolean } | null = null
const ARRIVAL_TIMEOUT_MS = 15_000

// waiting が null なら待っていない表示に戻す
function showRandomWait(waiting: number | null): void {
    byId("random-match-btn").classList.toggle("hidden", waiting !== null)
    byId("random-match-status").classList.toggle("hidden", waiting === null)
    if (waiting !== null) byId("random-match-count").textContent = String(waiting)
}
// 自分が作って待っている公開ルームの pool（一覧で自分の部屋に［入る］を出さないため）
let myPubPool: string | null = null
function showPubWait(waiting: number | null): void {
    byId("pub-room-btn").classList.toggle("hidden", waiting !== null)
    byId("pub-room-status").classList.toggle("hidden", waiting === null)
    if (waiting === null) myPubPool = null
}
function showRoomWait(waiting: number | null): void {
    if (waiting === null) hideWaiting()
    else showWaiting()
}

// 待ちをやめる。相手が決まってルームで到着を待っている最中なら、席も外す
function cancelWaiting(): void {
    if (arrival) {
        clearTimeout(arrival.timer)
        const { join } = arrival
        arrival = null
        join()
    }
    stopWaiting?.()
    stopWaiting = null
    showRandomWait(null)
    showPubWait(null)
    hideWaiting()
    void refreshLobby()
}

// デッキの選択肢の値（構築済みのレシピ名か、カスタムデッキの印つきの名前）から、入っているカードの cardId
function deckCardIdsOf(value: string): string[] {
    const cards = value.startsWith(CUSTOM_DECK_PREFIX) ? customDecks.get(value.slice(CUSTOM_DECK_PREFIX.length)) : deckRecipes[value]?.cards
    return Object.keys(cards ?? {})
}

function selectedDeck(): DeckChoice | null {
    const deck = (byId("deck-select") as HTMLSelectElement).value
    if (!deck.startsWith(CUSTOM_DECK_PREFIX)) return { deck }
    // カスタムデッキ: カードリスト（cardId -> 枚数）を付けて送信する
    const deckName = deck.slice(CUSTOM_DECK_PREFIX.length)
    const deckCards = customDecks.get(deckName)
    if (!deckCards) {
        showToast(`カスタムデッキが見つかりません: ${deckName}`)
        return null
    }
    return { deckCards }
}

function startWaiting(mode: "room" | "random", pool: string, button: HTMLElement, showWait: (waiting: number | null) => void, extra: WaitExtra = {}): void {
    const name = (byId("name-input") as HTMLInputElement).value.trim() || "プレイヤー"
    const deck = selectedDeck()
    if (!deck) return
    preloadCardArt(deckCardIdsOf((byId("deck-select") as HTMLSelectElement).value))
    cancelWaiting()
    joinMode = mode
    showWait(1)
    let listed = false
    stopWaiting = waitForOpponent(pool, deck, {
        // 並んだ直後に一覧を取り直す（自分の公開ルームが出た・ランダムの人数が増えたのをすぐ見せる）
        onWaiting: (waiting) => {
            if (!listed) {
                listed = true
                void refreshLobby()
            }
            showWait(waiting)
        },
        onFailed: (message) => {
            stopWaiting = null
            showWait(null)
            showToast(message)
        },
        onGone: () => {
            stopWaiting = null
            showWait(null)
            showToast("その部屋はもう埋まりました")
            void refreshLobby()
        },
        onMatched: (roomId) => {
            stopWaiting = null
            showWait(null)
            showToast("対戦相手が見つかりました")
            // 盤面を作るデバッグの入口（/api/debug/setup）が要る実際のルームID。入力したルーム名は待ち合わせの名前で、IDとは別（docs/guide/DEBUG_SETUPS.md）
            ;(window as unknown as { ROOM?: string }).ROOM = roomId
            // 同じ内容の join をもう一度送ると、サーバーは参加の取り消しとして扱う
            const join = () => socket.emit("join", { roomId, name, ...deck })
            const retry = () => startWaiting(mode, pool, button, showWait, extra)
            const timer = setTimeout(() => {
                if (!arrival) return
                if (!socket.connected) {
                    arrival = null
                    return retry()
                }
                arrival.expired = true
                join()
            }, ARRIVAL_TIMEOUT_MS)
            arrival = { timer, join, retry, expired: false }
            connectAndRun(button, join)
        },
    }, extra)
}

// ---- いまのロビー（待ち人数・対戦中の卓・公開ルームの一覧）。socket は使わず3秒おきに取る ----
// 待ちの問い合わせ（matchWait.ts）と同じ間隔。閉じた部屋が一覧に残って見える時間をこれ以下にするため
const LOBBY_POLL_MS = 3_000
type LobbyInfo = { random: number; playing: number; rooms: { pool: string; name: string; since: number }[] }
let lobbyInfo: LobbyInfo | null = null
let lobbyTimer: ReturnType<typeof setInterval> | undefined

function renderLobby(): void {
    if (!lobbyInfo) return
    byId("lobby-counts").textContent = `ランダムマッチ待ち ${lobbyInfo.random}人・対戦中 ${lobbyInfo.playing}卓`
    const ul = byId("lobby-rooms")
    ul.replaceChildren()
    if (lobbyInfo.rooms.length === 0) {
        const li = document.createElement("li")
        li.textContent = "公開ルームはありません"
        ul.append(li)
    }
    for (const r of lobbyInfo.rooms) {
        const li = document.createElement("li")
        const name = document.createElement("span")
        name.className = "lobby-room-name"
        // 名前は利用者の入力なので textContent で入れる
        name.textContent = `${r.name}（待ち ${Math.max(0, Math.floor((Date.now() - r.since) / 60_000))}分）`
        li.append(name)
        if (r.pool !== myPubPool) {
            const btn = document.createElement("button")
            btn.textContent = "入る"
            btn.addEventListener("click", () => startWaiting("random", r.pool, btn, showPubWait, { joinOnly: true }))
            li.append(btn)
        }
        ul.append(li)
    }
}

async function refreshLobby(): Promise<void> {
    try {
        lobbyInfo = (await (await fetch("/api/lobby")).json()) as LobbyInfo
        renderLobby()
    } catch {
        // 次の回に任せる（表示は前の値のまま）
    }
}

function syncLobbyPolling(): void {
    const active = document.visibilityState === "visible" && !byId("lobby").classList.contains("hidden")
    if (active && lobbyTimer === undefined) {
        void refreshLobby()
        lobbyTimer = setInterval(() => {
            if (byId("lobby").classList.contains("hidden")) return syncLobbyPolling()
            void refreshLobby()
        }, LOBBY_POLL_MS)
    } else if (!active && lobbyTimer !== undefined) {
        clearInterval(lobbyTimer)
        lobbyTimer = undefined
    }
}

onGame("state", (v: GameView) => {
    view = v
    ui.targeting = null // 状態が変わったら対象選択はリセット
    ui.awakenTarget = null // 覚醒モードもリセット（続けて移す場合は再度バッジをクリック）
    ui.paying = null // 支払いモードもリセット
    ui.directedAttack = null // 指定アタックの対象選択モードもリセット
    ui.exReductionSelect = null // 《継召》の除外カード選択もリセット
    ui.soulCoreOnlySelect = null // 《ソウルマジック》の選択もリセット
    ui.magicTimingSelect = null
    ui.magicTiming = null
    ui.soulSwapSelect = null // [ソウルコア]の交換モードもリセット
    ui.braveSummonSelect = null // ブレイヴの召喚方法選択もリセット
    ui.altSummonSelect = null // 代替召喚の方法選択もリセット
    ui.battleSwapSummon = null // 入れ替え召喚の対象選択もリセット
    // 効果による召喚・配置は、置く数の選択も含めて手札からの召喚と同じ2段の支払い画面で開く
    openEffectSummonScreen(v)
    rerender()
    // 支払い「自動」なら、効果のコストを[ソウルコア]以外のリザーブだけで払えるときは聞かずに払う（「手動」なら毎回支払い元を選ぶ）
    const costPay = v.pendingChoice?.pid === v.you ? v.pendingChoice.effectCostPay : undefined
    const me = v.players[v.you]
    // 置くコアの数（Lv）を選ぶ待ち（keepByOption）は選ぶのが目的なので、2つ以上あれば自動では送らない
    const pcOptions = v.pendingChoice?.options ?? []
    const choosingLv = costPay?.keepByOption !== undefined && pcOptions.length >= 2
    if (costPay && !choosingLv && ui.payMode === "auto" && me.reserve - (me.soulCore?.zone === "reserve" ? 1 : 0) >= costPay.need + (costPay.keep ?? 0)) {
        send({ type: "resolveChoice", option: costPay.keepByOption !== undefined ? pcOptions[0] ?? "支払う" : "支払う" })
    }
})

onGame("errorMessage", (message: string) => {
    lastErrorText = message
    showToast(message)
})

// 運営からのお知らせ（null で消える）
socket.on("notice", (message: string | null) => {
    const el = document.getElementById("notice-banner")
    if (!el) return
    el.textContent = message ?? ""
    el.classList.toggle("hidden", message === null)
})

socket.on("opponentLeft", () => {
    showToast("相手の接続が切れました（しばらくは相手が戻れます）")
})

socket.on("opponentBack", () => {
    showToast("相手が戻りました")
})

// ---- 席に戻る ----
// サーバー上の対局（socket 経由の state）が決着前のあいだだけ目印を立て、繋がるたびに席へ戻してもらう
socket.on("state", (v: GameView) => {
    if (arrival) clearTimeout(arrival.timer)
    arrival = null
    inMatch = !v.winner
    setInMatch(inMatch)
})
socket.on("connect", () => {
    if (inMatch) socket.emit("resume")
})
socket.on("resumeFailed", () => {
    const wasPlaying = view !== null
    inMatch = false
    setInMatch(false)
    if (wasPlaying) showToast("対戦が終了していたため、戻れませんでした")
})

// ---- 手札クリック ----

// ---- フィールドクリック ----

export function opponentOf(pid: PlayerId): PlayerId {
    return pid === "p1" ? "p2" : "p1"
}

// ---- カスタムデッキ（デッキビルダーの localStorage 保存分） ----


window.addEventListener("storage", (e) => {
    if (e.key === DECK_STORAGE_KEY) {
        rebuildDeckSelects()
    }
})

// ---- DOM イベント登録 ----

export function byId(id: string): HTMLElement {
    const el = document.getElementById(id)
    if (!el) throw new Error(`要素が見つかりません: #${id}`)
    return el
}

// 場のカードの操作ボタン（コアの −／＋・覚醒・合体・分離・交換・起動・[ソウルコア]の交換と支払い）を押したときの処理。押したのがボタンでなければ false。
// スマホでは同じボタンを場のカードでなく下の欄（ui/cardDock.ts）に出すので、場とネクサスの欄と下の欄の3か所から呼ぶ
function cardButtonAction(t: HTMLElement): boolean {
    // [ソウルコア]の1:1交換バッジ（§1.4）が先（カードクリックと区別する）
    const soulSwapBtn = t.closest<HTMLElement>("[data-soulswap]")
    if (soulSwapBtn) {
        ui.soulSwapSelect = { fromInstanceId: String(soulSwapBtn.dataset.soulswap) }
        ui.targeting = null
        ui.paying = null
        rerender()
        return true
    }
    // 覚醒バッジが先（カードクリックと区別する）
    const awakenBtn = t.closest<HTMLElement>("[data-awaken]")
    if (awakenBtn) {
        ui.awakenTarget = String(awakenBtn.dataset.awaken)
        ui.targeting = null // 覚醒モード開始時はマジックの対象選択を解除
        ui.paying = null
        rerender()
        return true
    }
    // 合体バッジ（BRAVE.md §6.4）：クリックで合体先の選択モードへ入る
    const combineBtn = t.closest<HTMLElement>("[data-combine]")
    if (combineBtn) {
        if (!view) return true
        const braveInstanceId = String(combineBtn.dataset.combine)
        const brave = view.players[view.you].field.spirits.find((sp) => sp.instanceId === braveInstanceId)
        if (brave) {
            ui.combineBrave = {
                braveInstanceId,
                candidateIds: braveCombineCandidates(view, view.you, brave.cardId),
            }
            ui.targeting = null
            ui.awakenTarget = null
            ui.paying = null
            rerender()
        }
        return true
    }
    // 交換バッジ（§6.4.1）：合体先の選択モードを交換として使う
    const exchangeBtn = t.closest<HTMLElement>("[data-exchange]")
    if (exchangeBtn) {
        if (!view) return true
        const braveInstanceId = String(exchangeBtn.dataset.exchange)
        ui.combineBrave = { braveInstanceId, candidateIds: braveExchangeTargets(view, view.you, braveInstanceId), exchange: true }
        ui.targeting = null
        ui.awakenTarget = null
        ui.paying = null
        rerender()
        return true
    }
    // 分離バッジ（§6.4）：リザーブで払えるならそのまま送り、足りなければ支払いモードへ入る
    const detachBtn = t.closest<HTMLElement>("[data-detach]")
    if (detachBtn) {
        if (!view) return true
        const braveInstanceId = String(detachBtn.dataset.detach)
        const brave = view.players[view.you].field.combinedBraves.find((b) => b.instanceId === braveInstanceId)
        if (!brave) return true
        const need = minLevelCores(master(brave.cardId))
        if (ui.payMode === "auto" && view.players[view.you].reserve - (view.players[view.you].soulCore?.zone === "reserve" ? 1 : 0) >= need) {
            send({ type: "detachBrave", braveInstanceId })
        } else {
            openBravePay(view, { forDetachBraveInstanceId: braveInstanceId })
            rerender()
        }
        return true
    }
    // 起動能力バッジ（覚醒と同様、カードクリックより先に判定）
    const activateBtn = t.closest<HTMLElement>("[data-activate]")
    if (activateBtn) {
        send({
            type: "activateAbility",
            instanceId: String(activateBtn.dataset.activate),
            effectId: String(activateBtn.dataset.effect),
        })
        return true
    }
    // コア移動ボタンが先（カードクリックと区別する）
    const coreBtn = t.closest<HTMLElement>("[data-core]")
    if (coreBtn) {
        const direction = String(coreBtn.dataset.core)
        const instanceId = String(coreBtn.dataset.instanceId)
        if (direction === "add-soul") {
            send({ type: "moveCore", instanceId, direction: "add", soulCore: true })
        } else if (direction === "remove-soul") {
            sendSoulCoreRemove(instanceId)
        } else if (direction === "add") {
            send({ type: "moveCore", instanceId, direction })
        } else if (direction === "remove") {
            sendCoreRemove(instanceId)
        } else if (direction.startsWith("set-")) {
            const targetCores = parseInt(direction.split("-")[1] || "0", 10)
            const currentCores = parseInt(coreBtn.dataset.currentCores || "0", 10)
            if (targetCores > currentCores) {
                // 案B-inside: 不足ぶんは通常コアで置き、足りなければリザーブの[ソウルコア]を1個引く（2026-10-06）
                const soulInReserve = view?.players[view.you].soulCore?.zone === "reserve"
                const normalReserve = (view?.players[view.you].reserve ?? 0) - (soulInReserve ? 1 : 0)
                const need = targetCores - currentCores
                const normalAdds = Math.min(need, normalReserve)
                for (let i = 0; i < normalAdds; i++) {
                    send({ type: "moveCore", instanceId, direction: "add" })
                }
                if (need - normalAdds === 1 && soulInReserve) {
                    send({ type: "moveCore", instanceId, direction: "add", soulCore: true })
                }
            } else if (currentCores > targetCores) {
                for (let i = 0; i < currentCores - targetCores; i++) {
                    send({ type: "moveCore", instanceId, direction: "remove" })
                }
            }
        }
        return true
    }
    // 支払いモード中: 対象カードの[ソウルコア]の使い方を選ぶボタン（2026-10-06）。
    // クリックで 使わない→コスト→維持コア→使わない のサイクル
    const soulPayBtn = t.closest<HTMLElement>("[data-soulpay]")
    if (soulPayBtn) {
        if (!ui.paying || !view) return true
        const id = String(soulPayBtn.dataset.soulpay)
        const payingId = payingCardId(view, ui.paying)
        const placesCores =
            !payingIsCostOnly(ui.paying) &&
            ui.paying.braveTargetInstanceId === undefined &&
            payingId !== undefined &&
            master(payingId).type !== "magic"
        if (ui.paying.soulPayInstanceId !== id) {
            // 必要数が既に満たされているときは[ソウルコア]を足すと超過するため選ばせない
            if (payingRemaining(view, ui.paying) <= 0) {
                showToast("必要数に達しているため[ソウルコア]は使えません")
                return true
            }
            ui.paying.soulPayInstanceId = id
            ui.paying.soulPayMode = "cost"
        } else if (ui.paying.soulPayMode === "cost") {
            ui.paying.soulPayMode = placesCores ? "maintain" : undefined
            if (!placesCores) ui.paying.soulPayInstanceId = undefined
        } else {
            ui.paying.soulPayInstanceId = undefined
            ui.paying.soulPayMode = undefined
        }
        if (ui.payMode === "auto" && ui.paying.step === undefined && payingRemaining(view, ui.paying) === 0) {
            submitPaying()
        } else {
            rerender()
        }
        return true
    }
    return false
}

function closestData(
    e: Event,
    attr: string,
): HTMLElement | null {
    return (e.target as HTMLElement).closest<HTMLElement>(`[${attr}]`)
}

// ---- お知らせ（Gitコミット履歴から自動取得） ----

async function init(): Promise<void> {
    // カードデータは弾ごとに分割されているため、結合済みを返すサーバーのAPIから取る
    const cards = (await (await fetch(assetUrl("/api/cards"))).json()) as CardData[]
    setCardDb(cards)
    setDeckRecipes(await (await fetch("/api/deck-recipes")).json())
    // ページを読み直した・タブを開き直したときは、こちらから繋いで席に戻る（盤面を描くのにカードデータが要るので、読み終えてから）
    if (inMatch) socket.connect()
    rebuildDeckSelects()
    rememberDeckSelection()
    rememberLobbyInputs()
    setupEffectTooltip()

    // お知らせ（Gitコミット履歴）を非同期で取得・表示
    loadChangelog()
    installSecretCardArt(showToast)
    installDisplaySettings()
    installCardDock(cardButtonAction)
    installPayStages({ view: () => view, ui, rerender, submitPaying })
    installStatusMenu()
    installSpiritLayout()

    byId("join-btn").addEventListener("click", () => {
        // 2回目の「対戦ルームに入る」は参加の取り消し
        if (joinMode === "room" && (arrival || stopWaiting)) return cancelWaiting()
        const roomId = (byId("room-input") as HTMLInputElement).value.trim() || "room1"
        startWaiting("room", `room:${roomId}`, byId("join-btn"), showRoomWait)
    })

    // ---- ランダムマッチ ----
    byId("random-match-btn").addEventListener("click", () => {
        startWaiting("random", "random", byId("random-match-btn"), showRandomWait)
    })

    byId("random-match-cancel").addEventListener("click", cancelWaiting)

    // ---- 公開ルーム ----
    byId("pub-room-btn").addEventListener("click", () => {
        const pool = `pub:${randomId()}`
        const name = (byId("name-input") as HTMLInputElement).value.trim() || "プレイヤー"
        startWaiting("random", pool, byId("pub-room-btn"), showPubWait, { host: { name } })
        myPubPool = pool
        renderLobby()
    })
    byId("pub-room-cancel").addEventListener("click", cancelWaiting)
    document.addEventListener("visibilitychange", syncLobbyPolling)
    syncLobbyPolling()

    // ---- AI対戦 ----
    byId("start-ai-btn").addEventListener("click", () => {
        const name =
            (byId("name-input") as HTMLInputElement).value.trim() || "プレイヤー"
        const myDeck = (byId("deck-select") as HTMLSelectElement).value
        const oppDeck = (byId("ai-opp-deck-select") as HTMLSelectElement).value
        preloadCardArt([...deckCardIdsOf(myDeck), ...deckCardIdsOf(oppDeck)])

        // AI対戦のペイロードを組み立てる
        const payload: Record<string, unknown> = { name }

        // 自分のデッキ
        if (myDeck.startsWith(CUSTOM_DECK_PREFIX)) {
            const deckName = myDeck.slice(CUSTOM_DECK_PREFIX.length)
            const deckCards = customDecks.get(deckName)
            if (!deckCards) {
                showToast(`カスタムデッキが見つかりません: ${deckName}`)
                return
            }
            payload.deckCards = deckCards
        } else {
            payload.deck = myDeck
        }

        // AIのデッキ
        if (oppDeck.startsWith(CUSTOM_DECK_PREFIX)) {
            const deckName = oppDeck.slice(CUSTOM_DECK_PREFIX.length)
            const deckCards = customDecks.get(deckName)
            if (!deckCards) {
                showToast(`カスタムデッキが見つかりません: ${deckName}`)
                return
            }
            payload.aiDeckCards = deckCards
        } else {
            payload.aiDeck = oppDeck
        }

        // AIの表示名をデッキ名から生成する
        let oppLabel = "AI"
        if (oppDeck.startsWith(CUSTOM_DECK_PREFIX)) {
            oppLabel = `AI（${oppDeck.slice(CUSTOM_DECK_PREFIX.length)}）`
        } else {
            const recipeLabel = deckRecipes[oppDeck]?.label
            const colorMatch = recipeLabel?.match(/^(.+?)デッキ/)
            if (colorMatch) {
                oppLabel = `AI（${colorMatch[1]}）`
            }
        }
        payload.aiName = oppLabel

        cancelWaiting() // 相手を待っている最中に AI戦を選んだら、待ちは取り消す
        joinMode = "ai"
        startLocalAi(byId("start-ai-btn"), payload)
    })

    byId("btn-return-lobby").addEventListener("click", () => {
        location.reload() // ページリロードで初期状態（ロビー）へ戻る
    })

    byId("hand").addEventListener("click", (e) => {
        // バーストセット・手札から使う効果のバッジが先（カード本体のクリックと区別する）
        const burstBtn = closestData(e, "data-burst-set")
        if (burstBtn) {
            onBurstSetClick(Number(burstBtn.dataset.burstSet))
            return
        }
        const abilityBtn = closestData(e, "data-hand-ability")
        if (abilityBtn) {
            onHandAbilityClick(Number(abilityBtn.dataset.handAbility), String(abilityBtn.dataset.handAbilityEffectId))
            return
        }
        const burstEffectBtn = closestData(e, "data-hand-burst-effect")
        if (burstEffectBtn) {
            onHandBurstEffectClick(Number(burstEffectBtn.dataset.handBurstEffect))
            return
        }
        const el = closestData(e, "data-hand-index")
        if (el) onHandClick(Number(el.dataset.handIndex))
    })

    // 覚醒モード中に自分のリザーブをクリックしたら、リザーブからコアを移す
    // （ディノゾールLv2が【覚醒】を「自分のスピリット上か自分のリザーブから」に書き換えている場合のみ有効）
    byId("my-info").addEventListener("click", (e) => {
        if (ui.awakenTarget === null) return
        if (!closestData(e, "data-reserve")) return
        if (!view) return
        const awakenInst = view.players[view.you].field.spirits.find((s) => s.instanceId === ui.awakenTarget)
        if (!canAwakenFromReserve(view, view.you, awakenInst)) return
        send({
            type: "awaken",
            instanceId: ui.awakenTarget,
            fromInstanceId: AWAKEN_FROM_RESERVE,
            count: 1,
        })
        ui.awakenTarget = null
    })

    byId("my-spirits").addEventListener("click", (e) => {
        if (cardButtonAction(e.target as HTMLElement)) return
        // 合体先の選択中：候補のスピリットをクリックすると合体する
        if (ui.combineBrave !== null) {
            const card = closestData(e, "data-instance-id")
            const hostInstanceId = card ? String(card.dataset.instanceId) : ""
            if (ui.combineBrave.candidateIds.includes(hostInstanceId)) {
                send(ui.combineBrave.exchange
                    ? { type: "exchangeBrave", braveInstanceId: ui.combineBrave.braveInstanceId, toInstanceId: hostInstanceId }
                    : { type: "combineBrave", braveInstanceId: ui.combineBrave.braveInstanceId, hostInstanceId })
            }
            ui.combineBrave = null
            rerender()
            return
        }
        const el = closestData(e, "data-instance-id")
        if (el) onMySpiritClick(String(el.dataset.instanceId))
    })

    byId("opp-spirits").addEventListener("click", (e) => {
        const el = closestData(e, "data-instance-id")
        if (el) onOppSpiritClick(String(el.dataset.instanceId))
    })

    // ネクサスは通常操作の対象外だが、pendingChoiceの候補になる場合と支払いモード中はコア割り当て対象になる
    byId("my-nexuses").addEventListener("click", (e) => {
        if (cardButtonAction(e.target as HTMLElement)) return
        const el = closestData(e, "data-instance-id")
        if (!el) return
        const instanceId = String(el.dataset.instanceId)
        if (tryResolveChoice(instanceId)) return
        if (ui.paying !== null) {
            assignPayCore(instanceId)
            return
        }
        // [ソウルコア]の1:1交換モード中: クリックしたネクサスと交換する（通常コア1個以上必要）
        if (ui.soulSwapSelect !== null && view) {
            const from = ui.soulSwapSelect.fromInstanceId
            const target = view.players[view.you].field.nexuses.find((n) => n.instanceId === instanceId)
            if (target && target.cores >= 1) {
                ui.soulSwapSelect = null
                send({ type: "swapSoulCore", fromInstanceId: from, toInstanceId: instanceId })
            }
            return
        }
    })
    // リザーブ／トラッシュのコアが選択待ちの候補になっているとき（removeCores で取り先を1個ずつ選ぶ）にクリックで選ぶ
    for (const infoId of ["opp-info", "my-info"]) {
        byId(infoId).addEventListener("click", (e) => {
            const zone = closestData(e, "data-corezone")
            if (!zone) return
            tryResolveChoice(String(zone.dataset.corezone))
        })
    }

    byId("opp-nexuses").addEventListener("click", (e) => {
        const el = closestData(e, "data-instance-id")
        if (el) tryResolveChoice(String(el.dataset.instanceId))
    })

    byId("btn-attack-phase").addEventListener("click", () =>
        send({ type: "nextPhase" }),
    )
    byId("btn-end-turn").addEventListener("click", () =>
        send({ type: "endTurn" }),
    )
    byId("btn-take-life").addEventListener("click", () =>
        send({ type: "takeLife" }),
    )
    byId("btn-pass").addEventListener("click", () => send({ type: "pass" }))
    // 降参は押し間違えると対戦が終わってしまうため、必ず確認をはさむ
    byId("btn-surrender").addEventListener("click", () => {
        if (!window.confirm("本当に降参しますか？\n相手の勝利になります。")) return
        send({ type: "surrender" })
    })
    const payModeBtn = byId("btn-pay-mode")
    payModeBtn.textContent = payModeLabel(ui.payMode)
    payModeBtn.title = payModeHint(ui.payMode)
    payModeBtn.addEventListener("click", () => {
        ui.payMode = ui.payMode === "auto" ? "manual" : "auto"
        savePayMode(ui.payMode)
        payModeBtn.textContent = payModeLabel(ui.payMode)
        payModeBtn.title = payModeHint(ui.payMode)
        if (view) rerender()
    })
    byId("chk-pay-to-negate").addEventListener("change", (e) => {
        const checked = (e.target as HTMLInputElement).checked
        send({ type: "setPayToNegate", enabled: checked })
    })
    byId("btn-attack-player").addEventListener("click", () => {
        if (!ui.directedAttack) return
        sendAttack(ui.directedAttack.attackerInstanceId)
        ui.directedAttack = null
    })
    byId("btn-confirm-pay").addEventListener("click", () => {
        submitPaying()
        rerender()
    })
    // 代替コストの操作（手札破棄の減量＝dec／デッキ破棄の切り替え＝toggle）。
    // ボタンは支払いバナー内に描画される
    byId("targeting-info").addEventListener("click", (e) => {
        const btn = closestData(e, "data-altpay")
        if (!btn) return
        changeAltPay(String(btn.dataset.altpay) === "dec" ? -1 : 1)
    })
    // リザーブの[ソウルコア]の使い方（使わない/コスト支払い/維持コア。2026-10-06 3択化）
    byId("targeting-info").addEventListener("click", (e) => {
        const btn = closestData(e, "data-souluse")
        if (!btn || !ui.paying) return
        const mode = String(btn.dataset.souluse)
        ui.paying.useSoulCore = mode === "cost"
        ui.paying.placeSoulCore = mode === "maintain"
        rerender()
    })
    byId("targeting-info").addEventListener("click", (e) => {
        if (!closestData(e, "data-payreset") || !ui.paying) return
        ui.paying.assigned = {}
        rerender()
    })
    // kind:"payAssistByExhaust"（BS16-021）：疲労させて肩代わりする候補のオン/オフ切り替え
    byId("targeting-info").addEventListener("click", (e) => {
        const btn = closestData(e, "data-shinsokuassist")
        if (!btn || !ui.paying) return
        const id = String(btn.dataset.shinsokuassist)
        const list = (ui.paying.shinsokuAssistInstanceIds ??= [])
        const at = list.indexOf(id)
        if (at !== -1) list.splice(at, 1)
        else list.push(id)
        rerender()
    })
    // kind:"summonPayOff"：破壊して払ったものとして扱う個体の選択（1つだけ。もう一度押すと外す）
    byId("targeting-info").addEventListener("click", (e) => {
        const btn = closestData(e, "data-payoff")
        if (!btn || !ui.paying) return
        const id = String(btn.dataset.payoff)
        if (ui.paying.payOffInstanceId === id) delete ui.paying.payOffInstanceId
        else ui.paying.payOffInstanceId = id
        rerender()
    })
    byId("btn-cancel-target").addEventListener("click", () => {
        ui.targeting = null
        ui.awakenTarget = null
        ui.paying = null
        ui.directedAttack = null
        ui.battleSwapSummon = null
        ui.braveSummonSelect = null
        ui.altSummonSelect = null
        ui.exReductionSelect = null
        ui.soulCoreOnlySelect = null
        ui.magicTimingSelect = null
        ui.magicTiming = null
        ui.soulSwapSelect = null
        ui.burstResetConfirm = null
        rerender()
    })
    byId("btn-skip-choice").addEventListener("click", () => {
        ui.stepper = null
        send({ type: "resolveChoice" })
    })
    byId("choice-options").addEventListener("click", onPayStageClick)
    byId("choice-options").addEventListener("click", (e) => {
        // バーストの再セット確認（ui.burstResetConfirm）。サーバーへのpendingChoiceではなく
        // クライアント側だけの確認状態なので、他のdata-optionより先に判定する
        const burstConfirmEl = closestData(e, "data-burst-confirm")
        if (burstConfirmEl && ui.burstResetConfirm) {
            const { handIndex } = ui.burstResetConfirm
            const answer = burstConfirmEl.dataset.burstConfirm
            ui.burstResetConfirm = null
            if (answer === "yes") send({ type: "setBurst", handIndex })
            rerender()
            return
        }
        // 増減式の選択（PendingChoice.stepper）の −／＋。表示を1つ動かして描き直すだけで、
        // サーバーへ送るのは「決定」を押したとき（data-option）だけ
        const stepEl = closestData(e, "data-stepper")
        if (stepEl) {
            const max = (view?.pendingChoice?.options ?? []).length - 1
            const next = (ui.stepper ?? 0) + (stepEl.dataset.stepper === "+" ? 1 : -1)
            ui.stepper = Math.max(0, Math.min(max, next))
            rerender()
            return
        }
        const optionEl = closestData(e, "data-option")
        if (optionEl) {
            ui.stepper = null
            const option = String(optionEl.dataset.option)
            // 「ブレイヴを残す」（BRAVE.md §6.3）は、置くコアをフィールドからも選べるので支払いモードへ入る。
            // そのまま確定すればリザーブから払われる
            // 【迷彩】・効果のコスト。リザーブだけで払えて[ソウルコア]の選択も無いなら、そのまま送る（サーバーが自動で払う）
            const pc = view?.pendingChoice
            const meisai = pc?.meisaiPay ? { cardId: pc.meisaiPay.targetCardId, need: pc.meisaiPay.need, effectCost: false } : pc?.effectCostPay ? { cardId: pc.effectCostPay.sourceCardId, need: pc.effectCostPay.need + (pc.effectCostPay.keepByOption?.[(pc.options ?? []).indexOf(option)] ?? pc.effectCostPay.keep ?? 0), effectCost: true } : undefined
            if (meisai && view) {
                const me = view.players[view.you]
                const soulSelectable = me.soulCore !== null && me.soulCore.zone !== "trash"
                // 効果による召喚・配置（置く数の選択つき）は、[ソウルコア]以外のリザーブだけで払えるなら送り、足りなければ選んだ置く数のまま2段の画面で開く
                const summonPlace = pc?.effectCostPay?.keepByOption !== undefined
                const reservePool = me.reserve - (me.soulCore?.zone === "reserve" ? 1 : 0)
                if (pc?.effectCostPay?.reserveOnly || (summonPlace ? ui.payMode === "auto" && reservePool >= meisai.need : !soulSelectable && ui.payMode === "auto" && me.reserve >= meisai.need)) {
                    send({ type: "resolveChoice", option })
                    return
                }
                if (summonPlace) {
                    openEffectSummonPay(view, Math.max(0, (pc?.options ?? []).indexOf(option)))
                    rerender()
                    return
                }
                ui.targeting = null
                ui.awakenTarget = null
                ui.combineBrave = null
                ui.paying = { handIndex: -1, forMeisai: { option, cardId: meisai.cardId, need: meisai.need, ...(meisai.effectCost ? { effectCost: true as const } : {}) }, assigned: {}, discardHandIndices: [], millPay: 0, shinsokuAssistInstanceIds: [] }
                rerender()
                return
            }
            const keep = view?.pendingChoice?.braveKeep
            if (keep && view) {
                openBravePay(view, { forBraveKeep: { option, cardId: keep.cardId, need: keep.need } })
                rerender()
                return
            }
            send({ type: "resolveChoice", option })
            return
        }
        const cardEl = closestData(e, "data-card-index")
        if (cardEl) {
            const cardIndex = Number(cardEl.dataset.cardIndex)
            // トラッシュから召喚・使用する効果でリザーブが足りないときは、
            // 通常の召喚と同じ支払いモードへ入ってフィールドのコアを割り当ててもらう
            if (startChoicePaying(cardIndex)) return
            send({ type: "resolveChoice", cardIndex })
            return
        }
        const altEl = closestData(e, "data-alt-summon")
        if (altEl && ui.altSummonSelect) {
            const choice = altEl.dataset.altSummon
            const { handIndex, cardId } = ui.altSummonSelect
            ui.altSummonSelect = null
            // "normal"＝通常どおりコストを払う。それ以外はデッキの下に戻すネクサスの instanceId
            tryPlay(handIndex, master(cardId), undefined, undefined, undefined, undefined,
                choice === "normal" ? undefined : [choice!])
            return
        }
        const braveEl = closestData(e, "data-brave-summon")
        if (braveEl && ui.braveSummonSelect) {
            const choice = braveEl.dataset.braveSummon
            const { handIndex, cardId } = ui.braveSummonSelect
            ui.braveSummonSelect = null
            // "single"＝スピリット状態で単体召喚（通常の召喚フロー）。
            // それ以外は合体先スピリットの instanceId＝ダイレクトブレイヴ
            tryPlay(handIndex, master(cardId), undefined, undefined, undefined,
                choice === "single" ? undefined : choice)
            return
        }
        const timingEl = closestData(e, "data-magictiming")
        if (timingEl && ui.magicTimingSelect) {
            const { handIndex, cardId } = ui.magicTimingSelect
            ui.magicTimingSelect = null
            startMagic(handIndex, master(cardId), timingEl.dataset.magictiming === "flash" ? "flash" : "main", true)
            return
        }
        const soulOnlyEl = closestData(e, "data-soulonly")
        if (soulOnlyEl && ui.soulCoreOnlySelect) {
            const { handIndex, fromTegamoto, cardId, targetInstanceId } = ui.soulCoreOnlySelect
            ui.soulCoreOnlySelect = null
            if (soulOnlyEl.dataset.soulonly === "yes") {
                send({ type: "castMagic", handIndex, ...(fromTegamoto ? { fromTegamoto } : {}), ...(targetInstanceId ? { targetInstanceId } : {}), ...(ui.magicTiming ? { timing: ui.magicTiming } : {}), useSoulCoreOnly: true })
            } else {
                // 「通常どおり」を選んだ済み（再入しない）。継召を持つカードならここから選択モードへ入る
                tryPlay(handIndex, master(cardId), targetInstanceId, undefined, undefined, undefined, undefined, undefined, true, undefined, fromTegamoto)
            }
            return
        }
        const exAskEl = closestData(e, "data-ex-ask")
        if (exAskEl && ui.exReductionSelect) {
            if (exAskEl.dataset.exAsk === "yes") {
                ui.exReductionSelect.phase = "select"
                rerender()
            } else {
                const { handIndex, fromTegamoto, cardId, targetInstanceId } = ui.exReductionSelect
                ui.exReductionSelect = null
                // 空配列＝「使わない」を選んだ済み（選択モードへ再入しない）
                tryPlay(handIndex, master(cardId), targetInstanceId, undefined, undefined, undefined, undefined, [], undefined, undefined, fromTegamoto)
            }
            return
        }
        const exGroupEl = closestData(e, "data-ex-group")
        if (exGroupEl && ui.exReductionSelect && view) {
            const sel = ui.exReductionSelect
            const group = sel.groups[Number(exGroupEl.dataset.exGroup)]
            if (group) {
                // 1枚増やしても軽減が増えない（軽減シンボル数の上限超え）なら0枚に戻す。
                // 軽減に効かない枚は対象外のため、上限に達したら次のクリックで選択解除になる
                const card = master(sel.cardId)
                const othersPicked = exReductionPickedIndices(sel.groups.filter((g) => g !== group))
                const current = exReductionEffectiveCount(
                    card,
                    exReductionSymbolsFor(view, [...othersPicked, ...group.indices.slice(0, group.count)]),
                )
                const trial = exReductionEffectiveCount(
                    card,
                    exReductionSymbolsFor(view, [...othersPicked, ...group.indices.slice(0, group.count + 1)]),
                )
                group.count = trial > current ? group.count + 1 : 0
            }
            rerender()
            return
        }
        const exConfirmEl = closestData(e, "data-ex-confirm")
        if (exConfirmEl && ui.exReductionSelect) {
            const { handIndex, fromTegamoto, cardId, targetInstanceId, groups } = ui.exReductionSelect
            const picked = exReductionPickedIndices(groups)
            ui.exReductionSelect = null
            // 空配列＝「使わない」を選んだ済み（選択モードへ再入しない）
            tryPlay(handIndex, master(cardId), targetInstanceId, undefined, undefined, undefined, undefined, picked.length > 0 ? picked : [], undefined, undefined, fromTegamoto)
            return
        }
    })
    
    byId("btn-toggle-log").addEventListener("click", () => {
        const panel = byId("log-panel")
        panel.classList.toggle("hidden")
    })
    byId("btn-close-log").addEventListener("click", () => {
        byId("log-panel").classList.add("hidden")
    })
    
    byId("btn-bug-report").addEventListener("click", () => {
        // 現在のゲームコンテキストをlocalStorageに保存してバグ報告画面へ渡す
        if (view) {
            const uiMode = ui.targeting ? "targeting" 
                           : ui.awakenTarget ? "awakenTarget" 
                           : ui.paying ? "paying" 
                           : ui.directedAttack ? "directedAttack" 
                           : ui.exReductionSelect ? "exReductionSelect" 
                           : "normal"
            const clientContext = {
                phase: view.phase,
                turn: view.turn,
                uiMode: uiMode,
                lastError: lastErrorText
            }
            const bugReportData = {
                gameId: view.gameId,
                you: view.you,
                clientContext
            }
            localStorage.setItem("bs_bug_report_context", JSON.stringify(bugReportData))
        }
        window.open("/bugreport.html", "_blank")
    })
    
    byId("btn-toggle-trash").addEventListener("click", () => {
        byId("trash-panel").classList.toggle("hidden")
        rerender()
    })
    // PC のマットのトラッシュの枠から、その側のタブで開く
    for (const [id, tab] of [["mat-trash-self", "mine"], ["mat-trash-opp", "opp"]] as const) {
        byId(id).addEventListener("click", (e) => {
            // コア選択の候補として押したときは、中身を開かず選択を優先する
            if ((e.target as HTMLElement).closest("[data-corezone]")) return
            activeTrashTab = tab
            byId("tab-my-trash").classList.toggle("active", tab === "mine")
            byId("tab-opp-trash").classList.toggle("active", tab === "opp")
            byId("trash-panel").classList.remove("hidden")
            rerender()
        })
    }
    byId("btn-close-trash").addEventListener("click", () => {
        byId("trash-panel").classList.add("hidden")
    })
    byId("tab-my-trash").addEventListener("click", () => {
        activeTrashTab = "mine"
        byId("tab-my-trash").classList.add("active")
        byId("tab-opp-trash").classList.remove("active")
        rerender()
    })
    byId("tab-opp-trash").addEventListener("click", () => {
        activeTrashTab = "opp"
        byId("tab-opp-trash").classList.add("active")
        byId("tab-my-trash").classList.remove("active")
        rerender()
    })

    // 手元 UI
    byId("btn-my-tegamoto").addEventListener("click", () => {
        activeTegamotoTab = "mine"
        byId("tab-my-tegamoto").classList.add("active")
        byId("tab-opp-tegamoto").classList.remove("active")
        byId("tegamoto-panel").classList.remove("hidden")
        rerender()
    })
    byId("btn-opp-tegamoto").addEventListener("click", () => {
        activeTegamotoTab = "opp"
        byId("tab-opp-tegamoto").classList.add("active")
        byId("tab-my-tegamoto").classList.remove("active")
        byId("tegamoto-panel").classList.remove("hidden")
        rerender()
    })
    // スマホの「手元 N」の欄（ui/mat.ts）。開く処理は上の2つのボタンのまま
    byId("mat-tegamoto-self").addEventListener("click", () => byId("btn-my-tegamoto").click())
    byId("mat-tegamoto-opp").addEventListener("click", () => byId("btn-opp-tegamoto").click())
    byId("btn-close-tegamoto").addEventListener("click", () => {
        byId("tegamoto-panel").classList.add("hidden")
    })
    byId("tab-my-tegamoto").addEventListener("click", () => {
        activeTegamotoTab = "mine"
        byId("tab-my-tegamoto").classList.add("active")
        byId("tab-opp-tegamoto").classList.remove("active")
        rerender()
    })
    byId("tab-opp-tegamoto").addEventListener("click", () => {
        activeTegamotoTab = "opp"
        byId("tab-opp-tegamoto").classList.add("active")
        byId("tab-my-tegamoto").classList.remove("active")
        rerender()
    })
    
    // 手元からのマジック使用・スピリット/ブレイヴの召喚
    byId("tegamoto-content").addEventListener("click", (e) => {
        if (activeTegamotoTab !== "mine") return
        const cardEl = closestData(e, "data-tegamoto-index")
        if (cardEl) {
            const index = Number(cardEl.dataset.tegamotoIndex)
            // 手札と同じ支払いの流れ（フィールドのコアからの支払い・レベル選択）を通す（#512）
            tryPlay(index, master(cardEl.dataset.cardId ?? ""), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true)
            byId("tegamoto-panel").classList.add("hidden")
        }
    })
}

void init()

// 表示の設定（上の「⚙ 表示」で開く）。<html> の data 属性で CSS を切り替え、その端末に覚える
// brave：合体したブレイヴを art＝イラストだけ／full＝カード全体。frame：スピリットの色の縁 on／off
function installDisplaySettings(): void {
    // hand・menuside はスマホだけで使う（片手で操作する手に合わせる。2026-11-25 ユーザー案）
    const settings = { brave: { key: "bs.braveStyle", values: ["art", "full"] }, frame: { key: "bs.frameStyle", values: ["on", "off"] }, hand: { key: "bs.handStyle", values: ["center", "left", "right"] }, menuside: { key: "bs.menuSide", values: ["right", "left"] } } as const
    const apply = (name: keyof typeof settings, value: string) => {
        document.documentElement.dataset[name] = value
        const radio = document.querySelector<HTMLInputElement>(`input[name="${name}-style"][value="${value}"]`)
        if (radio) radio.checked = true
    }
    for (const name of Object.keys(settings) as (keyof typeof settings)[]) {
        const { key, values } = settings[name]
        let saved: string | null = null
        try {
            saved = localStorage.getItem(key)
        } catch {
            // 保存できない環境では毎回既定から始める
        }
        apply(name, saved !== null && (values as readonly string[]).includes(saved) ? saved : values[0])
        for (const radio of document.querySelectorAll<HTMLInputElement>(`input[name="${name}-style"]`)) {
            radio.addEventListener("change", () => {
                apply(name, radio.value)
                try {
                    localStorage.setItem(key, radio.value)
                } catch {
                    // 保存できなくても、この画面では切り替わる
                }
            })
        }
    }
    const btn = byId("btn-display-settings")
    const panel = byId("display-settings")
    btn.addEventListener("click", () => {
        const open = panel.classList.toggle("hidden") === false
        btn.setAttribute("aria-expanded", String(open))
    })
    document.addEventListener("click", (e) => {
        if (panel.classList.contains("hidden") || (e.target as HTMLElement).closest(".display-settings-wrap")) return
        panel.classList.add("hidden")
        btn.setAttribute("aria-expanded", "false")
    })
}
