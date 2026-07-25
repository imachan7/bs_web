// サーバー通信、ユーザー操作の受付、状態購読
import type { CardData, GameAction, GameView, PaySource, PlayerId } from "../../server/src/type"
import {
    canDirectAttack,
    effectiveCost,
    hasKeyword,
    magicTargetSide,
    master,
    matchesDirectedAttackFilter,
    render,
    setCardDb,
    setupEffectTooltip,
    showToast,
    showWaiting,
    type UiState,
} from "./renderer"

// socket.io クライアントは /socket.io/socket.io.js から読み込まれる
interface SocketLike {
    emit: (event: string, payload?: unknown) => void
    on: (event: string, handler: (payload: any) => void) => void
}

declare const io: () => SocketLike

const socket = io()

let view: GameView | null = null
const ui: UiState = { targeting: null, awakenTarget: null, paying: null, directedAttack: null, summonLevelSelect: null }
let activeTrashTab: "mine" | "opp" = "mine"
let activeTegamotoTab: "mine" | "opp" = "mine"

function send(action: GameAction): void {
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
        el.className = `card color-${m.colors[0]}`
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
        el.className = `card color-${m.colors[0]}`
        
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

function rerender(): void {
    if (view) {
        render(view, ui)
        renderTrashPanel(view, activeTrashTab)
        renderTegamotoPanel(view, activeTegamotoTab)
    }
}

// カード種別に応じたアクションを送信する（paySources/targetInstanceId/levelは値がある場合のみキーを含める）
function sendPlay(
    cardType: CardData["type"],
    handIndex: number,
    targetInstanceId?: string,
    paySources?: PaySource[],
    level?: number,
): void {
    if (cardType === "spirit") {
        send({ type: "summon", handIndex, ...(paySources ? { paySources } : {}), ...(level !== undefined ? { level } : {}) })
    } else if (cardType === "nexus") {
        send({ type: "setNexus", handIndex, ...(paySources ? { paySources } : {}), ...(level !== undefined ? { level } : {}) })
    } else {
        send({
            type: "castMagic",
            handIndex,
            ...(targetInstanceId ? { targetInstanceId } : {}),
            ...(paySources ? { paySources } : {}),
        })
    }
}

// 軽減後コスト（+維持コア）がリザーブで足りるなら即送信、足りなければ支払いモードを開始する
function tryPlay(handIndex: number, card: CardData, targetInstanceId: string | undefined, level?: number): void {
    if (!view) return
    const cost = effectiveCost(view, view.you, card)
    
    if (level === undefined && (card.type === "spirit" || card.type === "nexus")) {
        const reserve = view.players[view.you].reserve
        // Check affordable levels (cost + level.cores <= reserve)
        const affordableLevels = card.levels.filter(l => reserve >= cost + l.cores)
        
        // If they can afford Lv2 or higher, show level selection
        if (affordableLevels.length > 1) {
            const cardId = view.players[view.you].hand?.[handIndex]
            if (!cardId) return
            ui.targeting = null
            ui.awakenTarget = null
            ui.paying = null
            ui.directedAttack = null
            ui.summonLevelSelect = { handIndex, cardId, ...(targetInstanceId ? { targetInstanceId } : {}) }
            rerender()
            return
        }
        
        // If they can't even afford Lv1 from reserve, affordableLevels.length is 0. 
        // We just fall through and it will enter paying mode for Lv1.
        // If they can afford exactly Lv1, it falls through and sends instantly.
    }
    
    const targetLevel = level || 1
    const lv = card.levels.find((l) => l.level === targetLevel)
    const maintain = card.type === "magic" ? 0 : (lv ? lv.cores : 0)
    const reserve = view.players[view.you].reserve
    
    if (reserve >= cost + maintain) {
        sendPlay(card.type, handIndex, targetInstanceId, undefined, level)
        return
    }
    // コアが足りない → 支払いモードを開始（他のモードは排他的に解除する）
    ui.targeting = null
    ui.awakenTarget = null
    ui.summonLevelSelect = null
    ui.paying = { handIndex, ...(targetInstanceId ? { targetInstanceId } : {}), assigned: {}, ...(level !== undefined ? { level } : {}) }
    rerender()
}

// ---- サーバーからのイベント ----

socket.on("joined", () => {
    showWaiting()
})

socket.on("state", (v: GameView) => {
    view = v
    ui.targeting = null // 状態が変わったら対象選択はリセット
    ui.awakenTarget = null // 覚醒モードもリセット（続けて移す場合は再度バッジをクリック）
    ui.paying = null // 支払いモードもリセット
    ui.directedAttack = null // 指定アタックの対象選択モードもリセット
    ui.summonLevelSelect = null // レベル選択もリセット
    rerender()
})

socket.on("errorMessage", (message: string) => {
    showToast(message)
})

socket.on("opponentLeft", () => {
    showToast("相手が退出しました")
})

// ---- 手札クリック ----

// pendingChoiceが自分宛かつkind:"card"・cardZone:"hand"、クリックしたhandIndexが候補内なら
// resolveChoice を送信する。送信したら true を返す（呼び出し側はそこで処理を打ち切る）
function tryResolveCardChoice(handIndex: number): boolean {
    if (!view || !view.pendingChoice) return false
    if (view.pendingChoice.pid !== view.you) return false
    if (view.pendingChoice.kind !== "card" || view.pendingChoice.cardZone !== "hand") return false
    if (!(view.pendingChoice.cardIndices ?? []).includes(handIndex)) return false
    send({ type: "resolveChoice", cardIndex: handIndex })
    return true
}

function onHandClick(handIndex: number): void {
    if (!view) return
    // 選択待ち中は通常の手札操作（召喚等）をすべて抑止する。自分宛のkind:"card"・cardZone:"hand"
    // なら選択を送信し、それ以外（相手宛や別kind）は何もしない
    if (view.pendingChoice) {
        tryResolveCardChoice(handIndex)
        return
    }
    if (ui.awakenTarget !== null) return // 覚醒モード中は手札操作を抑止
    if (ui.paying !== null) return // 支払いモード中は新規手札操作を抑止
    if (ui.directedAttack !== null) return // 指定アタックの対象選択モード中は手札操作を抑止
    const hand = view.players[view.you].hand
    const cardId = hand?.[handIndex]
    if (cardId === undefined) return
    const card: CardData = master(cardId)

    const myTurn = view.turnPlayer === view.you
    const myMainFree = myTurn && view.phase === "main" && !view.battle
    // フラッシュ中で自分が優先権を持つとき（攻撃側・防御側どちらでも使用可）
    const inFlash =
        !!view.battle && view.isFlashTiming && view.priorityPlayer === view.you

    if (myMainFree) {
        if (card.type === "spirit") {
            tryPlay(handIndex, card, undefined)
            return
        }
        if (card.type === "nexus") {
            tryPlay(handIndex, card, undefined)
            return
        }
    }

    // 神速召喚：静的に持つか、grantKeywordToHandCardで一時付与された手札スピリット
    if (card.type === "spirit" && inFlash) {
        const tempSoku = (view.players[view.you].tempHandKeywordGrants ?? []).some(
            (g) => g.cardId === cardId && g.keyword === "soku",
        )
        if (hasKeyword(cardId, "soku") || tempSoku) {
            tryPlay(handIndex, card, undefined)
            return
        }
    }

    if (card.type === "magic" && (myMainFree || (inFlash && card.flash))) {
        // メイン効果がなければフラッシュ効果を使う（doCastMagic と同じ判定）
        const hasMain = card.effects.some(
            (e) => e.kind === "magic" && e.timing === "main",
        )
        const timing: "main" | "flash" =
            inFlash || !hasMain ? "flash" : "main"
        const side = magicTargetSide(card, timing)
        if (side) {
            ui.targeting = { handIndex, side }
            rerender()
        } else {
            tryPlay(handIndex, card, undefined)
        }
    }
}

// ---- フィールドクリック ----

// pendingChoiceが自分宛かつクリックしたinstanceIdが候補内なら resolveChoice を送信する。
// 送信したら true を返す（呼び出し側はそこで処理を打ち切る）
function tryResolveChoice(instanceId: string): boolean {
    if (!view || !view.pendingChoice) return false
    if (view.pendingChoice.pid !== view.you) return false
    if (!view.pendingChoice.candidates.includes(instanceId)) return false
    send({ type: "resolveChoice", instanceId })
    return true
}

function onMySpiritClick(instanceId: string): void {
    if (!view) return
    if (tryResolveChoice(instanceId)) return

    // 指定アタックの対象選択モード中：自分のスピリットのクリックは無視する
    // （対象は相手スピリット。プレイヤーへアタックは専用ボタン、キャンセルは対象選択をやめるボタン）
    if (ui.directedAttack !== null) return

    // 支払いモード中：クリックしたスピリットに1個割り当てる
    if (ui.paying !== null) {
        assignPayCore(instanceId)
        return
    }

    // 覚醒モード中：クリックしたスピリットからコアを1個移す（移動先の再クリックでキャンセル）
    if (ui.awakenTarget !== null) {
        if (instanceId === ui.awakenTarget) {
            ui.awakenTarget = null
            rerender()
            return
        }
        send({
            type: "awaken",
            instanceId: ui.awakenTarget,
            fromInstanceId: instanceId,
            count: 1,
        })
        ui.awakenTarget = null
        return
    }

    if (ui.targeting?.side === "self") {
        const handIndex = ui.targeting.handIndex
        const cardId = view.players[view.you].hand?.[handIndex]
        ui.targeting = null
        if (cardId !== undefined) {
            tryPlay(handIndex, master(cardId), instanceId)
        }
        return
    }

    const myTurn = view.turnPlayer === view.you
    const isDefender = !!view.battle && !myTurn
    // 防御側の応答が可能なのは、優先権を持つ間かフラッシュ終了後
    const canDefend =
        isDefender && (!view.isFlashTiming || view.priorityPlayer === view.you)

    if (canDefend && !view.battle?.blockerInstanceId) {
        send({ type: "block", instanceId })
        return
    }

    if (myTurn && view.phase === "attack" && !view.battle) {
        const inst = view.players[view.you].field.spirits.find(
            (s) => s.instanceId === instanceId,
        )
        const filter = inst ? canDirectAttack(view, view.you, inst) : null
        const oppSpirits = view.players[opponentOf(view.you)].field.spirits
        const hasValidTarget =
            filter !== null && oppSpirits.some((s) => matchesDirectedAttackFilter(filter, s))
        if (filter !== null && hasValidTarget) {
            // 指定アタック可能で、条件に合う相手がいる：対象選択モードを開始する
            ui.directedAttack = { attackerInstanceId: instanceId, filter }
            rerender()
            return
        }
        send({ type: "attack", instanceId })
    }
}

function opponentOf(pid: PlayerId): PlayerId {
    return pid === "p1" ? "p2" : "p1"
}

// 支払いモード中、指定スピリットにコアを1個割り当てる。合計が必要数に達したら自動送信する。
function assignPayCore(instanceId: string): void {
    if (!view || !ui.paying) return
    const pay = ui.paying
    const player = view.players[view.you]
    const inst =
        player.field.spirits.find((s) => s.instanceId === instanceId) ??
        player.field.nexuses.find((n) => n.instanceId === instanceId)
    if (!inst) return
    const cardId = player.hand?.[pay.handIndex]
    if (cardId === undefined) {
        ui.paying = null
        rerender()
        return
    }
    const card = master(cardId)
    const cost = effectiveCost(view, view.you, card)
    const targetLevel = pay.level || 1
    const lv = card.levels.find((l) => l.level === targetLevel)
    const maintain = card.type === "magic" ? 0 : (lv ? lv.cores : 0)
    const assignedTotal = Object.values(pay.assigned).reduce((a, b) => a + b, 0)
    const already = pay.assigned[instanceId] ?? 0
    if (assignedTotal >= cost) return // コスト上限に到達済み（過払い防止）
    if (already >= inst.cores) return // このスピリットのコアを使い切った
    pay.assigned[instanceId] = already + 1
    const newTotal = assignedTotal + 1
    const need = cost + maintain
    if (player.reserve + newTotal >= need) {
        // 必要数に達したので送信する
        const paySources: PaySource[] = Object.entries(pay.assigned).map(
            ([id, count]) => ({ instanceId: id, count }),
        )
        sendPlay(card.type, pay.handIndex, pay.targetInstanceId, paySources, pay.level)
        ui.paying = null
        return
    }
    rerender()
}

function onOppSpiritClick(instanceId: string): void {
    if (!view) return
    if (tryResolveChoice(instanceId)) return
    if (ui.paying !== null) return // v1はスピリット上のコアのみ対応、自分のスピリットのみが支払い元
    if (ui.awakenTarget !== null) return // 覚醒モード中は相手側の操作を抑止
    // 指定アタックの対象選択モード中：フィルタに合う相手スピリットをクリックしたら指定アタックを送信する
    if (ui.directedAttack !== null) {
        const filter = ui.directedAttack.filter
        const target = view.players[opponentOf(view.you)].field.spirits.find(
            (s) => s.instanceId === instanceId,
        )
        if (target && matchesDirectedAttackFilter(filter, target)) {
            send({
                type: "attack",
                instanceId: ui.directedAttack.attackerInstanceId,
                targetSpiritInstanceId: instanceId,
            })
            ui.directedAttack = null
        }
        return
    }
    if (ui.targeting?.side === "opponent") {
        const handIndex = ui.targeting.handIndex
        const cardId = view.players[view.you].hand?.[handIndex]
        ui.targeting = null
        if (cardId !== undefined) {
            tryPlay(handIndex, master(cardId), instanceId)
        }
    }
}

// ---- カスタムデッキ（デッキビルダーの localStorage 保存分） ----

const DECK_STORAGE_KEY = "bsweb:decks"
const CUSTOM_DECK_PREFIX = "custom:"

// デッキビルダー（deck.ts）と同じ保存フォーマット
interface SavedDeck {
    name: string
    cards: Record<string, number>
    updatedAt: string
}

// デッキ名 → カードリスト（cardId -> 枚数）。ページ表示時に読み込む
const customDecks = new Map<string, Record<string, number>>()

function loadSavedDecks(): SavedDeck[] {
    try {
        const raw = localStorage.getItem(DECK_STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter(
            (d): d is SavedDeck =>
                typeof d === "object" &&
                d !== null &&
                typeof d.name === "string" &&
                typeof d.cards === "object" &&
                d.cards !== null,
        )
    } catch {
        return []
    }
}

// deck-select に保存済みデッキを「カスタム: <デッキ名>」として追加する（4色プリセットの後ろ）
function populateCustomDecks(): void {
    const select = byId("deck-select") as HTMLSelectElement
    // 既存のカスタムデッキをクリア
    const options = Array.from(select.options)
    for (const opt of options) {
        if (opt.value.startsWith(CUSTOM_DECK_PREFIX)) {
            select.removeChild(opt)
        }
    }
    customDecks.clear()

    for (const saved of loadSavedDecks()) {
        customDecks.set(saved.name, saved.cards)
        let total = 0
        for (const count of Object.values(saved.cards)) total += count

        const option = document.createElement("option")
        option.value = `${CUSTOM_DECK_PREFIX}${saved.name}`
        if (total === 40) {
            option.textContent = `カスタム: ${saved.name}`
        } else {
            const reason = total < 40 ? "40枚未満" : "40枚超過"
            option.textContent = `カスタム: ${saved.name}（${reason}のため使用不可）`
            option.disabled = true
        }
        select.appendChild(option)
    }
}

window.addEventListener("storage", (e) => {
    if (e.key === DECK_STORAGE_KEY) {
        populateCustomDecks()
    }
})

// ---- DOM イベント登録 ----

function byId(id: string): HTMLElement {
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

async function init(): Promise<void> {
    const cards = (await (await fetch("/data/cards.json")).json()) as CardData[]
    setCardDb(cards)
    populateCustomDecks()
    setupEffectTooltip()

    byId("join-btn").addEventListener("click", () => {
        const name =
            (byId("name-input") as HTMLInputElement).value.trim() || "プレイヤー"
        const roomId =
            (byId("room-input") as HTMLInputElement).value.trim() || "room1"
        const deck = (byId("deck-select") as HTMLSelectElement).value
        if (deck.startsWith(CUSTOM_DECK_PREFIX)) {
            // カスタムデッキ: カードリスト（cardId -> 枚数）を付けて送信する
            const deckName = deck.slice(CUSTOM_DECK_PREFIX.length)
            const deckCards = customDecks.get(deckName)
            if (!deckCards) {
                showToast(`カスタムデッキが見つかりません: ${deckName}`)
                return
            }
            socket.emit("join", { roomId, name, deckCards })
        } else {
            socket.emit("join", { roomId, name, deck })
        }
    })

    byId("hand").addEventListener("click", (e) => {
        const el = closestData(e, "data-hand-index")
        if (el) onHandClick(Number(el.dataset.handIndex))
    })

    byId("my-spirits").addEventListener("click", (e) => {
        // 覚醒バッジが先（カードクリックと区別する）
        const awakenBtn = closestData(e, "data-awaken")
        if (awakenBtn) {
            ui.awakenTarget = String(awakenBtn.dataset.awaken)
            ui.targeting = null // 覚醒モード開始時はマジックの対象選択を解除
            ui.paying = null
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
            send({
                type: "moveCore",
                instanceId: String(coreBtn.dataset.instanceId),
                direction: coreBtn.dataset.core === "add" ? "add" : "remove",
            })
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
        const el = closestData(e, "data-instance-id")
        if (!el) return
        const instanceId = String(el.dataset.instanceId)
        if (tryResolveChoice(instanceId)) return
        if (ui.paying !== null) {
            assignPayCore(instanceId)
            return
        }
    })
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
    byId("btn-attack-player").addEventListener("click", () => {
        if (!ui.directedAttack) return
        send({ type: "attack", instanceId: ui.directedAttack.attackerInstanceId })
        ui.directedAttack = null
    })
    byId("btn-cancel-target").addEventListener("click", () => {
        ui.targeting = null
        ui.awakenTarget = null
        ui.paying = null
        ui.directedAttack = null
        ui.summonLevelSelect = null
        rerender()
    })
    byId("btn-skip-choice").addEventListener("click", () => {
        send({ type: "resolveChoice" })
    })
    byId("choice-options").addEventListener("click", (e) => {
        const optionEl = closestData(e, "data-option")
        if (optionEl) {
            send({ type: "resolveChoice", option: String(optionEl.dataset.option) })
            return
        }
        const cardEl = closestData(e, "data-card-index")
        if (cardEl) {
            send({ type: "resolveChoice", cardIndex: Number(cardEl.dataset.cardIndex) })
            return
        }
        const levelEl = closestData(e, "data-summon-level")
        if (levelEl && ui.summonLevelSelect) {
            const level = Number(levelEl.dataset.summonLevel)
            const { handIndex, cardId, targetInstanceId } = ui.summonLevelSelect
            ui.summonLevelSelect = null
            tryPlay(handIndex, master(cardId), targetInstanceId, level)
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
