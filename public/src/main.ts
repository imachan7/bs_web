// サーバー通信、ユーザー操作の受付、状態購読
import type { CardData, GameAction, GameView, PlayerId } from "../../server/src/type"
import { master, render, setCardDb, showToast, showWaiting, hideWaiting, type UiState } from "./renderer"
import { exReductionEffectiveCount, exReductionPickedIndices, exReductionSymbolsFor, payingCardId, payingIsCostOnly, payingRemaining } from "./ui/paying"
import { setupEffectTooltip } from "./ui/tooltip"
import { AWAKEN_FROM_RESERVE, canAwakenFromReserve, minLevelCores } from "../../shared/rules"
import { braveCombineCandidates } from "../../shared/summon"
import { DECK_STORAGE_KEY, CUSTOM_DECK_PREFIX, customDecks, deckRecipes, setDeckRecipes, populateAllBuiltinDecks, populateAllCustomDecks, loadChangelog } from "./ui/lobby"
import { loadPayMode, savePayMode, payModeLabel, payModeHint, submitPaying, changeAltPay, startChoicePaying, assignPayCore } from "./ui/payInput"
import { confirmExtraCost, sendCoreRemove, sendSoulCoreRemove, tryPlay, onBurstSetClick, onHandAbilityClick, onHandClick, tryResolveChoice, onMySpiritClick, sendAttack, onOppSpiritClick } from "./ui/play"

// socket.io クライアントは /socket.io/socket.io.js から読み込まれる
interface SocketLike {
    readonly connected: boolean
    emit: (event: string, payload?: unknown) => void
    on: (event: string, handler: (payload: any) => void) => void
    off: (event: string, handler?: (payload: any) => void) => void
    connect: () => void
}

declare const io: (opts?: { autoConnect?: boolean }) => SocketLike

// ページ読み込み時には接続しない（Cloud Run は min-instances=0 のため、ロビーを開いただけの
// 訪問者にも常時接続させるとコストが伸びる。docs/ops/PERF_PLAN.md §5）。
// 実際に対戦操作をするボタンを押したときだけ connectAndRun() 経由で接続する
const socket = io({ autoConnect: false })

// 対戦していない接続はサーバーが15分で切る（課金対策。server/src/index.ts の「放置接続の切断」）。
// サーバーから切られたときだけ socket.io は自動で再接続しないので、次の操作かタブ復帰で繋ぎ直す。
// 切断中の emit は socket.io が溜めて再接続後に送るので、押したボタンはそのまま効く
socket.on("disconnect", (reason: string) => {
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
export const ui: UiState = { payMode: loadPayMode(), targeting: null, awakenTarget: null, paying: null, directedAttack: null, summonLevelSelect: null, battleSwapSummon: null, braveSummonSelect: null, altSummonSelect: null, combineBrave: null, exReductionSelect: null, soulCoreOnlySelect: null, soulSwapSelect: null, stepper: null, burstResetConfirm: null }
let activeTrashTab: "mine" | "opp" = "mine"
let activeTegamotoTab: "mine" | "opp" = "mine"
let lastErrorText: string = ""
// joined の種別を区別する（"room" = 合言葉ルーム、"random" / "ai" = 即対戦）
let joinMode: "room" | "random" | "ai" = "room"

export function send(action: GameAction): void {
    if (!confirmExtraCost(action)) return
    socket.emit("action", action)
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
        if (tab === "mine" && m.type === "magic") {
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

socket.on("joined", () => {
    if (joinMode === "room") {
        showWaiting()
    }
})

socket.on("joinCancelled", () => {
    hideWaiting()
})

// ---- ランダムマッチのイベント ----

socket.on("matchQueued", (payload: { waiting: number }) => {
    // ボタンを隠して待機状態を表示する
    const btn = document.getElementById("random-match-btn")
    const status = document.getElementById("random-match-status")
    const count = document.getElementById("random-match-count")
    if (btn) btn.classList.add("hidden")
    if (status) status.classList.remove("hidden")
    if (count) count.textContent = String(payload.waiting)
})

socket.on("matchWaiting", (payload: { waiting: number }) => {
    const count = document.getElementById("random-match-count")
    if (count) count.textContent = String(payload.waiting)
})

socket.on("matchCancelled", () => {
    const btn = document.getElementById("random-match-btn")
    const status = document.getElementById("random-match-status")
    if (btn) btn.classList.remove("hidden")
    if (status) status.classList.add("hidden")
})

socket.on("matchFound", () => {
    showToast("対戦相手が見つかりました")
    const btn = document.getElementById("random-match-btn")
    const status = document.getElementById("random-match-status")
    if (btn) btn.classList.remove("hidden")
    if (status) status.classList.add("hidden")
})

socket.on("state", (v: GameView) => {
    view = v
    ui.targeting = null // 状態が変わったら対象選択はリセット
    ui.awakenTarget = null // 覚醒モードもリセット（続けて移す場合は再度バッジをクリック）
    ui.paying = null // 支払いモードもリセット
    ui.directedAttack = null // 指定アタックの対象選択モードもリセット
    ui.summonLevelSelect = null // レベル選択もリセット
    ui.exReductionSelect = null // 《継召》の除外カード選択もリセット
    ui.soulCoreOnlySelect = null // 《ソウルマジック》の選択もリセット
    ui.soulSwapSelect = null // [ソウルコア]の交換モードもリセット
    ui.braveSummonSelect = null // ブレイヴの召喚方法選択もリセット
    ui.altSummonSelect = null // 代替召喚の方法選択もリセット
    ui.battleSwapSummon = null // 入れ替え召喚の対象選択もリセット
    rerender()
    // 支払い「自動」なら、効果のコストを[ソウルコア]以外のリザーブだけで払えるときは聞かずに払う（「手動」なら毎回支払い元を選ぶ）
    const costPay = v.pendingChoice?.pid === v.you ? v.pendingChoice.effectCostPay : undefined
    const me = v.players[v.you]
    if (costPay && ui.payMode === "auto" && me.reserve - (me.soulCore?.zone === "reserve" ? 1 : 0) >= costPay.need + (costPay.keep ?? 0)) {
        send({ type: "resolveChoice", option: "支払う" })
    }
})

socket.on("errorMessage", (message: string) => {
    lastErrorText = message
    showToast(message)
})

socket.on("opponentLeft", () => {
    showToast("相手が退出しました")
})

// ---- 手札クリック ----

// ---- フィールドクリック ----

export function opponentOf(pid: PlayerId): PlayerId {
    return pid === "p1" ? "p2" : "p1"
}

// ---- カスタムデッキ（デッキビルダーの localStorage 保存分） ----


window.addEventListener("storage", (e) => {
    if (e.key === DECK_STORAGE_KEY) {
        populateAllCustomDecks()
    }
})

// ---- DOM イベント登録 ----

export function byId(id: string): HTMLElement {
    const el = document.getElementById(id)
    if (!el) throw new Error(`要素が見つかりません: #${id}`)
    return el
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
    const cards = (await (await fetch("/api/cards")).json()) as CardData[]
    setCardDb(cards)
    setDeckRecipes(await (await fetch("/api/deck-recipes")).json())
    populateAllBuiltinDecks()
    populateAllCustomDecks()
    setupEffectTooltip()

    // お知らせ（Gitコミット履歴）を非同期で取得・表示
    loadChangelog()

    byId("join-btn").addEventListener("click", () => {
        const name =
            (byId("name-input") as HTMLInputElement).value.trim() || "プレイヤー"
        const roomId =
            (byId("room-input") as HTMLInputElement).value.trim() || "room1"
        const deck = (byId("deck-select") as HTMLSelectElement).value
        joinMode = "room"
        let emitJoin: () => void
        if (deck.startsWith(CUSTOM_DECK_PREFIX)) {
            // カスタムデッキ: カードリスト（cardId -> 枚数）を付けて送信する
            const deckName = deck.slice(CUSTOM_DECK_PREFIX.length)
            const deckCards = customDecks.get(deckName)
            if (!deckCards) {
                showToast(`カスタムデッキが見つかりません: ${deckName}`)
                return
            }
            emitJoin = () => socket.emit("join", { roomId, name, deckCards })
        } else {
            emitJoin = () => socket.emit("join", { roomId, name, deck })
        }
        connectAndRun(byId("join-btn"), emitJoin)
    })

    // ---- ランダムマッチ ----
    byId("random-match-btn").addEventListener("click", () => {
        const name =
            (byId("name-input") as HTMLInputElement).value.trim() || "プレイヤー"
        const deck = (byId("deck-select") as HTMLSelectElement).value
        joinMode = "random"
        let emitRandomMatch: () => void
        if (deck.startsWith(CUSTOM_DECK_PREFIX)) {
            const deckName = deck.slice(CUSTOM_DECK_PREFIX.length)
            const deckCards = customDecks.get(deckName)
            if (!deckCards) {
                showToast(`カスタムデッキが見つかりません: ${deckName}`)
                return
            }
            emitRandomMatch = () => socket.emit("randomMatch", { name, deckCards })
        } else {
            emitRandomMatch = () => socket.emit("randomMatch", { name, deck })
        }
        connectAndRun(byId("random-match-btn"), emitRandomMatch)
    })

    byId("random-match-cancel").addEventListener("click", () => {
        socket.emit("cancelRandomMatch")
    })

    // ---- AI対戦 ----
    byId("start-ai-btn").addEventListener("click", () => {
        const name =
            (byId("name-input") as HTMLInputElement).value.trim() || "プレイヤー"
        const myDeck = (byId("ai-my-deck-select") as HTMLSelectElement).value
        const oppDeck = (byId("ai-opp-deck-select") as HTMLSelectElement).value

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

        joinMode = "ai"
        connectAndRun(byId("start-ai-btn"), () => socket.emit("startAi", payload))
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
        // [ソウルコア]の1:1交換バッジ（§1.4）が先（カードクリックと区別する）
        const soulSwapBtn = closestData(e, "data-soulswap")
        if (soulSwapBtn) {
            ui.soulSwapSelect = { fromInstanceId: String(soulSwapBtn.dataset.soulswap) }
            ui.targeting = null
            ui.paying = null
            rerender()
            return
        }
        // 覚醒バッジが先（カードクリックと区別する）
        const awakenBtn = closestData(e, "data-awaken")
        if (awakenBtn) {
            ui.awakenTarget = String(awakenBtn.dataset.awaken)
            ui.targeting = null // 覚醒モード開始時はマジックの対象選択を解除
            ui.paying = null
            rerender()
            return
        }
        // 合体バッジ（BRAVE.md §6.4）：クリックで合体先の選択モードへ入る
        const combineBtn = closestData(e, "data-combine")
        if (combineBtn) {
            if (!view) return
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
            return
        }
        // 分離バッジ（§6.4）：リザーブで払えるならそのまま送り、足りなければ支払いモードへ入る
        const detachBtn = closestData(e, "data-detach")
        if (detachBtn) {
            if (!view) return
            const braveInstanceId = String(detachBtn.dataset.detach)
            const brave = view.players[view.you].field.combinedBraves.find((b) => b.instanceId === braveInstanceId)
            if (!brave) return
            const need = minLevelCores(master(brave.cardId))
            if (ui.payMode === "auto" && view.players[view.you].reserve - (view.players[view.you].soulCore?.zone === "reserve" ? 1 : 0) >= need) {
                send({ type: "detachBrave", braveInstanceId })
            } else {
                ui.targeting = null
                ui.awakenTarget = null
                ui.combineBrave = null
                ui.paying = { handIndex: -1, forDetachBraveInstanceId: braveInstanceId, assigned: {}, discardHandIndices: [], millPay: 0, shinsokuAssistInstanceIds: [] }
                rerender()
            }
            return
        }
        // 合体先の選択中：候補のスピリットをクリックすると合体する
        if (ui.combineBrave !== null) {
            const card = closestData(e, "data-instance-id")
            const hostInstanceId = card ? String(card.dataset.instanceId) : ""
            if (ui.combineBrave.candidateIds.includes(hostInstanceId)) {
                send({ type: "combineBrave", braveInstanceId: ui.combineBrave.braveInstanceId, hostInstanceId })
            }
            ui.combineBrave = null
            rerender()
            return
        }
        // 起動能力バッジ（覚醒と同様、カードクリックより先に判定）
        const activateBtn = closestData(e, "data-activate")
        if (activateBtn) {
            send({
                type: "activateAbility",
                instanceId: String(activateBtn.dataset.activate),
                effectId: String(activateBtn.dataset.effect),
            })
            return
        }
        // コア移動ボタンが先（カードクリックと区別する）
        const coreBtn = closestData(e, "data-core")
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
            return
        }
        // 支払いモード中: 対象カードの[ソウルコア]の使い方を選ぶボタン（2026-10-06）。
        // クリックで 使わない→コスト→維持コア→使わない のサイクル
        const soulPayBtn = closestData(e, "data-soulpay")
        if (soulPayBtn) {
            if (!ui.paying || !view) return
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
                    return
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
            if (ui.payMode === "auto" && payingRemaining(view, ui.paying) === 0) {
                submitPaying()
            } else {
                rerender()
            }
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
        // [ソウルコア]の1:1交換バッジ（§1.4）が先（カードクリックと区別する）
        const soulSwapBtn = closestData(e, "data-soulswap")
        if (soulSwapBtn) {
            ui.soulSwapSelect = { fromInstanceId: String(soulSwapBtn.dataset.soulswap) }
            ui.paying = null
            rerender()
            return
        }
        // コア移動ボタンが先（カードクリックと区別する）。ネクサスもコアでレベルを上げ下げできる
        const coreBtn = closestData(e, "data-core")
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
            return
        }
        // 支払いモード中: 対象カードの[ソウルコア]の使い方を選ぶボタン（2026-10-06）。
        // クリックで 使わない→コスト→維持コア→使わない のサイクル
        const soulPayBtn = closestData(e, "data-soulpay")
        if (soulPayBtn) {
            if (!ui.paying || !view) return
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
                    return
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
            if (ui.payMode === "auto" && payingRemaining(view, ui.paying) === 0) {
                submitPaying()
            } else {
                rerender()
            }
            return
        }
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
    byId("btn-cancel-target").addEventListener("click", () => {
        ui.targeting = null
        ui.awakenTarget = null
        ui.paying = null
        ui.directedAttack = null
        ui.summonLevelSelect = null
        ui.battleSwapSummon = null
        ui.braveSummonSelect = null
        ui.altSummonSelect = null
        ui.exReductionSelect = null
        ui.soulCoreOnlySelect = null
        ui.soulSwapSelect = null
        ui.burstResetConfirm = null
        rerender()
    })
    byId("btn-skip-choice").addEventListener("click", () => {
        ui.stepper = null
        send({ type: "resolveChoice" })
    })
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
            const meisai = pc?.meisaiPay ? { cardId: pc.meisaiPay.targetCardId, need: pc.meisaiPay.need, effectCost: false } : pc?.effectCostPay ? { cardId: pc.effectCostPay.sourceCardId, need: pc.effectCostPay.need + (pc.effectCostPay.keep ?? 0), effectCost: true } : undefined
            if (meisai && view) {
                const me = view.players[view.you]
                const soulSelectable = me.soulCore !== null && me.soulCore.zone !== "trash"
                if (!soulSelectable && ui.payMode === "auto" && me.reserve >= meisai.need) {
                    send({ type: "resolveChoice", option })
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
            if (keep) {
                ui.targeting = null
                ui.awakenTarget = null
                ui.combineBrave = null
                ui.paying = {
                    handIndex: -1,
                    forBraveKeep: { option, cardId: keep.cardId, need: keep.need },
                    assigned: {},
                    discardHandIndices: [],
                    millPay: 0,
                    shinsokuAssistInstanceIds: [],
                }
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
        const soulOnlyEl = closestData(e, "data-soulonly")
        if (soulOnlyEl && ui.soulCoreOnlySelect) {
            const { handIndex, cardId, targetInstanceId } = ui.soulCoreOnlySelect
            ui.soulCoreOnlySelect = null
            if (soulOnlyEl.dataset.soulonly === "yes") {
                send({ type: "castMagic", handIndex, ...(targetInstanceId ? { targetInstanceId } : {}), useSoulCoreOnly: true })
            } else {
                // 「通常どおり」を選んだ済み（再入しない）。継召を持つカードならここから選択モードへ入る
                tryPlay(handIndex, master(cardId), targetInstanceId, undefined, undefined, undefined, undefined, undefined, true)
            }
            return
        }
        const exAskEl = closestData(e, "data-ex-ask")
        if (exAskEl && ui.exReductionSelect) {
            if (exAskEl.dataset.exAsk === "yes") {
                ui.exReductionSelect.phase = "select"
                rerender()
            } else {
                const { handIndex, cardId, targetInstanceId } = ui.exReductionSelect
                ui.exReductionSelect = null
                // 空配列＝「使わない」を選んだ済み（選択モードへ再入しない）
                tryPlay(handIndex, master(cardId), targetInstanceId, undefined, undefined, undefined, undefined, [])
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
            const { handIndex, cardId, targetInstanceId, groups } = ui.exReductionSelect
            const picked = exReductionPickedIndices(groups)
            ui.exReductionSelect = null
            // 空配列＝「使わない」を選んだ済み（選択モードへ再入しない）
            tryPlay(handIndex, master(cardId), targetInstanceId, undefined, undefined, undefined, undefined, picked.length > 0 ? picked : [])
            return
        }
        const levelEl = closestData(e, "data-summon-level")
        if (levelEl && ui.summonLevelSelect) {
            const level = Number(levelEl.dataset.summonLevel)
            const { handIndex, cardId, targetInstanceId, altSummonNexusInstanceIds, exReductionTrashIndices } = ui.summonLevelSelect
            ui.summonLevelSelect = null
            tryPlay(handIndex, master(cardId), targetInstanceId, level, undefined, undefined, altSummonNexusInstanceIds, exReductionTrashIndices)
            return
        }
        // 《真界放》のwaiver配置ボタン（[ソウルコア]1個のみでLv2。2026-10-07）
        const waiverEl = closestData(e, "data-soul-waiver")
        if (waiverEl && ui.summonLevelSelect) {
            const { handIndex, cardId, targetInstanceId, altSummonNexusInstanceIds, exReductionTrashIndices } = ui.summonLevelSelect
            ui.summonLevelSelect = null
            tryPlay(handIndex, master(cardId), targetInstanceId, undefined, undefined, undefined, altSummonNexusInstanceIds, exReductionTrashIndices, undefined, true)
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
                           : ui.summonLevelSelect ? "summonLevelSelect" 
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
    
    // 手元からのマジック使用
    byId("tegamoto-content").addEventListener("click", (e) => {
        if (activeTegamotoTab !== "mine") return
        const cardEl = closestData(e, "data-tegamoto-index")
        if (cardEl) {
            const index = Number(cardEl.dataset.tegamotoIndex)
            send({ type: "castMagic", handIndex: index, fromTegamoto: true })
            byId("tegamoto-panel").classList.add("hidden")
        }
    })
}

void init()
