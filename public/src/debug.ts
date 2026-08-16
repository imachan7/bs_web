import type { CardData, Color, Keyword, Phase } from "../../server/src/type"
import { COLOR_LABELS } from "../../data/constants"

// ---- 定数・グローバル状態 ----
const $ = (id: string) => document.getElementById(id)!

let db: CardData[] = []
const cardMap = new Map<string, CardData>()

function master(cardId: string): CardData {
    const card = cardMap.get(cardId)
    if (!card) throw new Error(`Unknown card: ${cardId}`)
    return card
}

let board = {
    roomId: "room1",
    turn: 1,
    turnPlayer: "p1" as "p1" | "p2",
    phase: "main" as Phase,
    players: {
        p1: {
            life: 5,
            reserve: 4,
            trashCores: 0,
            field: { spirits: [] as any[], nexuses: [] as any[] },
            hand: [] as string[],
            deck: [] as string[],
            trashCards: [] as string[],
        },
        p2: {
            life: 5,
            reserve: 4,
            trashCores: 0,
            field: { spirits: [] as any[], nexuses: [] as any[] },
            hand: [] as string[],
            deck: [] as string[],
            trashCards: [] as string[],
        }
    }
}

// ---- UI 更新 ----
function showToast(msg: string) {
    const toast = $("toast")
    toast.textContent = msg
    toast.classList.remove("hidden")
    toast.classList.add("show")
    setTimeout(() => {
        toast.classList.remove("show")
        setTimeout(() => toast.classList.add("hidden"), 300)
    }, 3000)
}

function renderBoard() {
    $("cfg-room").setAttribute("value", board.roomId)
    $("cfg-turn").setAttribute("value", String(board.turn))
    ;($("cfg-turn-player") as HTMLSelectElement).value = board.turnPlayer
    ;($("cfg-phase") as HTMLSelectElement).value = board.phase

    for (const p of ["p1", "p2"] as const) {
        const player = board.players[p]
        ;($(`${p}-life`) as HTMLInputElement).value = String(player.life)
        ;($(`${p}-reserve`) as HTMLInputElement).value = String(player.reserve)
        ;($(`${p}-trashcores`) as HTMLInputElement).value = String(player.trashCores)

        renderCardList(`${p}-hand`, player.hand, (idx) => { player.hand.splice(idx, 1); renderBoard() })
        renderCardList(`${p}-deck`, player.deck, (idx) => { player.deck.splice(idx, 1); renderBoard() })
        renderCardList(`${p}-trash`, player.trashCards, (idx) => { player.trashCards.splice(idx, 1); renderBoard() })
        
        renderFieldList(`${p}-field`, player.field.spirits, player.field.nexuses, p)
    }
}

function renderCardList(containerId: string, cardIds: string[], onRemove: (idx: number) => void) {
    const container = $(containerId)
    container.innerHTML = ""
    cardIds.forEach((cardId, idx) => {
        const m = master(cardId)
        const el = document.createElement("div")
        el.className = "card"
        el.style.backgroundColor = `var(--c-${m.colors[0]})`
        el.innerHTML = `<div class="name">${m.name}</div><button class="delete-btn">×</button>`
        el.querySelector(".delete-btn")!.addEventListener("click", () => onRemove(idx))
        container.appendChild(el)
    })
}

function renderFieldList(containerId: string, spirits: any[], nexuses: any[], p: "p1" | "p2") {
    const container = $(containerId)
    container.innerHTML = ""
    const renderInst = (inst: any, type: "spirits" | "nexuses", idx: number) => {
        const m = master(inst.cardId)
        const el = document.createElement("div")
        el.className = "card" + (inst.isRested ? " rested" : "")
        el.style.backgroundColor = `var(--c-${m.colors[0]})`
        el.innerHTML = `
            <div class="name">${m.name}</div>
            <div class="controls">
                <button class="core-minus">-</button>
                <span>${inst.cores ?? 1}</span>
                <button class="core-plus">+</button>
            </div>
            <button class="toggle-rest">疲労</button>
            <button class="delete-btn">×</button>
        `
        el.querySelector(".core-minus")!.addEventListener("click", () => {
            inst.cores = Math.max(0, (inst.cores ?? 1) - 1)
            renderBoard()
        })
        el.querySelector(".core-plus")!.addEventListener("click", () => {
            inst.cores = (inst.cores ?? 1) + 1
            renderBoard()
        })
        el.querySelector(".toggle-rest")!.addEventListener("click", () => {
            inst.isRested = !inst.isRested
            renderBoard()
        })
        el.querySelector(".delete-btn")!.addEventListener("click", () => {
            board.players[p].field[type].splice(idx, 1)
            renderBoard()
        })
        container.appendChild(el)
    }
    nexuses.forEach((inst, idx) => renderInst(inst, "nexuses", idx))
    spirits.forEach((inst, idx) => renderInst(inst, "spirits", idx))
}

// ---- イベントバインディング ----
$("btn-submit").addEventListener("click", async () => {
    board.roomId = ($("cfg-room") as HTMLInputElement).value
    board.turn = parseInt(($("cfg-turn") as HTMLInputElement).value) || 1
    board.turnPlayer = ($("cfg-turn-player") as HTMLSelectElement).value as any
    board.phase = ($("cfg-phase") as HTMLSelectElement).value as any

    for (const p of ["p1", "p2"] as const) {
        board.players[p].life = parseInt(($(`${p}-life`) as HTMLInputElement).value) || 0
        board.players[p].reserve = parseInt(($(`${p}-reserve`) as HTMLInputElement).value) || 0
        board.players[p].trashCores = parseInt(($(`${p}-trashcores`) as HTMLInputElement).value) || 0
    }

    try {
        const res = await fetch("/api/debug/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId: board.roomId, board })
        })
        const data = await res.json()
        if (data.ok) {
            showToast("盤面を反映しました")
        } else {
            showToast(`エラー: ${data.error}`)
        }
    } catch (e: any) {
        showToast(`通信エラー: ${e.message}`)
    }
})

// カードプール描画は一旦簡易実装
function renderPool() {
    const grid = $("pool-grid")
    grid.innerHTML = ""
    const query = ($("search-input") as HTMLInputElement).value.toLowerCase()
    db.filter(c => c.name.toLowerCase().includes(query) || c.cardId.toLowerCase().includes(query)).slice(0, 50).forEach(card => {
        const el = document.createElement("div")
        el.className = "pool-card"
        el.style.border = `2px solid var(--c-${card.colors[0]})`
        el.textContent = `${card.cardId} ${card.name}`
        el.addEventListener("click", () => {
            const target = prompt("追加先 (1: P1手札, 2: P1場, 3: P2手札, 4: P2場)", "2")
            if (target === "1") board.players.p1.hand.push(card.cardId)
            else if (target === "2") {
                if (card.type === "spirit") board.players.p1.field.spirits.push({ cardId: card.cardId, cores: 1, isRested: false })
                if (card.type === "nexus") board.players.p1.field.nexuses.push({ cardId: card.cardId, cores: 1, isRested: false })
            } else if (target === "3") board.players.p2.hand.push(card.cardId)
            else if (target === "4") {
                if (card.type === "spirit") board.players.p2.field.spirits.push({ cardId: card.cardId, cores: 1, isRested: false })
                if (card.type === "nexus") board.players.p2.field.nexuses.push({ cardId: card.cardId, cores: 1, isRested: false })
            }
            renderBoard()
        })
        grid.appendChild(el)
    })
}

$("search-input").addEventListener("input", renderPool)
$("filter-reset").addEventListener("click", () => {
    ($("search-input") as HTMLInputElement).value = ""
    renderPool()
})

async function init() {
    const res = await fetch("/api/debug/enabled")
    const { enabled } = await res.json()
    if (!enabled) {
        document.body.innerHTML = "<h1>403 Forbidden (Debug mode is disabled)</h1>"
        return
    }

    const cards = (await (await fetch("/api/cards")).json()) as CardData[]
    db = cards
    cards.forEach(c => cardMap.set(c.cardId, c))
    
    renderPool()
    renderBoard()
}

init()

// ---- 保存・書き出し ----
$("btn-export").addEventListener("click", () => {
    const data = JSON.stringify(board, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `board_debug_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
})

$("import-file").addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result))
            if (parsed.roomId && parsed.players) {
                board = parsed
                renderBoard()
                showToast("盤面を読み込みました")
            } else {
                showToast("無効な盤面データです")
            }
        } catch {
            showToast("JSONのパースに失敗しました")
        }
        ;(e.target as HTMLInputElement).value = ""
    }
    reader.readAsText(file)
})
