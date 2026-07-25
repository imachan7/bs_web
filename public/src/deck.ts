// デッキビルダーページのロジック
// カードプールの表示・フィルタ、デッキ編集、制約検証、保存・書き出しを担当する
import type { CardData, CardType, Color, Keyword } from "../../server/src/type"
import { COLOR_LABELS, DECK_SIZE } from "../../data/constants"
import { KEYWORDS } from "../../shared/rules"

// ---- 定数 ----

const MAX_COPIES = 3 // 同名カードの上限枚数
const STORAGE_KEY = "bsweb:decks"
const MAX_COST = 8 // 第一弾の最大コスト（コストカーブ表示用）

const TYPE_LABELS: Record<CardType, string> = {
    spirit: "スピリット",
    nexus: "ネクサス",
    magic: "マジック",
}

// フィルタ用のコスト帯（チップの data-cost と同じ並び）
const COST_BANDS: ReadonlyArray<{ min: number; max: number }> = [
    { min: 0, max: 2 },
    { min: 3, max: 4 },
    { min: 5, max: 6 },
    { min: 7, max: Infinity },
]

const SERIES_LABELS: Record<string, string> = {
    "BS01": "第一弾",
    "BS02": "激翔",
    "BS03": "覇闘",
    "BS04": "龍帝",
    "BS05": "皇騎",
}

// ---- 状態 ----

let cards: CardData[] = []
let db = new Map<string, CardData>()

// デッキ内容（cardId -> 枚数）
let deck = new Map<string, number>()

// フィルタ状態（空 = 全て表示）
const filterColors = new Set<Color>()
const filterTypes = new Set<CardType>()
const filterCosts = new Set<number>() // COST_BANDS のインデックス
const filterSeries = new Set<string>()
const filterKeywords = new Set<Keyword>()
let filterFamily = ""
let searchText = ""

// 詳細パネルに固定表示するカード（クリックで選択）
let selectedCardId: string | null = null

// 保存済みデッキ（localStorage の内容）
interface SavedDeck {
    name: string
    cards: Record<string, number>
    updatedAt: string
}

// ---- ユーティリティ ----

function $(id: string): HTMLElement {
    const el = document.getElementById(id)
    if (!el) throw new Error(`要素が見つかりません: #${id}`)
    return el
}

function master(cardId: string): CardData {
    const card = db.get(cardId)
    if (!card) throw new Error(`カードが見つかりません: ${cardId}`)
    return card
}

// スピリットの最高レベルBP（ネクサス・マジックは null）
function maxBp(card: CardData): number | null {
    if (card.type !== "spirit" || card.levels.length === 0) return null
    return Math.max(...card.levels.map((lv) => lv.bp))
}

function deckTotal(): number {
    let total = 0
    for (const count of deck.values()) total += count
    return total
}

// 同名カードのデッキ内合計枚数（cardId が違っても同名なら合算する）
function nameCount(name: string): number {
    let sum = 0
    for (const [id, count] of deck) {
        if (master(id).name === name) sum += count
    }
    return sum
}

function nameLimit(name: string): number {
    const card = Array.from(db.values()).find(c => c.name === name)
    return card?.limitCount ?? MAX_COPIES
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(message: string): void {
    const toast = $("toast")
    toast.textContent = message
    toast.classList.remove("hidden")
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2500)
}

// ---- カードプール面 ----

function passesFilter(card: CardData): boolean {
    if (filterColors.size > 0 && !card.colors.some((c) => filterColors.has(c))) return false
    if (filterTypes.size > 0 && !filterTypes.has(card.type)) return false
    if (filterCosts.size > 0) {
        let hit = false
        for (const idx of filterCosts) {
            const band = COST_BANDS[idx]
            if (band && card.cost >= band.min && card.cost <= band.max) {
                hit = true
            }
        }
        if (!hit) return false
    }
    if (filterSeries.size > 0 && !filterSeries.has(card.cardId.substring(0, 4))) return false
    if (filterKeywords.size > 0) {
        let hasKw = false
        for (const kw of filterKeywords) {
            if (card.effects.some(e => e.kind === "keyword" && e.keyword === kw)) {
                hasKw = true
                break
            }
        }
        if (!hasKw) return false
    }
    if (filterFamily !== "" && !card.family.includes(filterFamily)) return false
    if (searchText !== "" && !card.name.includes(searchText)) return false
    return true
}

function renderPool(): void {
    const grid = $("pool-grid")
    grid.textContent = ""
    const visible = cards.filter(passesFilter)

    for (const card of visible) {
        const el = document.createElement("div")
        el.className = `pool-card color-${card.colors[0]}`
        if (card.limited) el.classList.add("limited")

        // コストバッジ
        const costBadge = document.createElement("span")
        costBadge.className = "cost-badge"
        costBadge.textContent = String(card.cost)
        el.appendChild(costBadge)

        const name = document.createElement("div")
        name.className = "name"
        name.textContent = card.name
        el.appendChild(name)

        const info = document.createElement("div")
        info.className = "info"

        if (card.symbol && card.symbol.length > 0) {
            card.symbol.forEach(symColor => {
                const sym = document.createElement("span")
                sym.className = `sym-icon bg-${symColor}`
                info.appendChild(sym)
            })
        }

        const txt = document.createElement("span")
        const bp = maxBp(card)
        const parts = [TYPE_LABELS[card.type]]
        if (bp !== null) parts.push(`BP${bp}`)
        if (card.rarity !== "") parts.push(card.rarity)
        txt.textContent = parts.join(" / ")
        info.appendChild(txt)

        el.appendChild(info)

        // 禁止カードの目印
        if (card.limited) {
            const mark = document.createElement("span")
            mark.className = "limited-mark"
            mark.textContent = "禁止"
            el.appendChild(mark)
        }

        // デッキ投入済み枚数バッジ
        const inDeck = deck.get(card.cardId) ?? 0
        if (inDeck > 0) {
            const badge = document.createElement("span")
            badge.className = "count-badge"
            badge.textContent = `×${inDeck}`
            el.appendChild(badge)
        }

        // ＋ボタン（カード本体クリックでも追加）
        if (!card.limited) {
            const addBtn = document.createElement("button")
            addBtn.className = "add-btn"
            addBtn.textContent = "＋"
            addBtn.title = "デッキに追加"
            addBtn.addEventListener("click", (e) => {
                e.stopPropagation()
                addCard(card.cardId)
            })
            el.appendChild(addBtn)
        }

        el.addEventListener("mouseenter", () => {
            if (selectedCardId === null) renderDetail(card)
        })
        el.addEventListener("click", () => {
            selectedCardId = card.cardId
            renderDetail(card)
            addCard(card.cardId)
        })

        grid.appendChild(el)
    }

    $("pool-count").textContent = `${visible.length} / ${cards.length} 枚を表示中`
}

// カード詳細（効果テキスト全文）の表示
function renderDetail(card: CardData): void {
    const panel = $("detail-panel")
    panel.textContent = ""

    const titleArea = document.createElement("div")
    titleArea.style.display = "flex"
    titleArea.style.alignItems = "center"
    titleArea.style.gap = "8px"
    
    const title = document.createElement("div")
    title.className = "detail-title"
    title.textContent = `${card.name}（${card.cardId}）`
    title.style.margin = "0"
    titleArea.appendChild(title)

    if (card.symbol && card.symbol.length > 0) {
        const syms = document.createElement("div")
        syms.style.display = "flex"
        syms.style.gap = "2px"
        card.symbol.forEach(symColor => {
            const sym = document.createElement("span")
            sym.className = `sym-icon bg-${symColor}`
            syms.appendChild(sym)
        })
        titleArea.appendChild(syms)
    }

    panel.appendChild(titleArea)

    const meta = document.createElement("div")
    meta.className = "detail-meta"
    const bp = maxBp(card)
    const parts = [
        `${card.colors.map((c) => COLOR_LABELS[c]).join("・")} / ${TYPE_LABELS[card.type]} / コスト${card.cost}（軽減${card.reduction.length}）`,
    ]
    if (card.family.length > 0) parts.push(`系統: ${card.family.join("・")}`)
    if (card.type === "spirit") {
        const levels = card.levels
            .map((lv) => `Lv${lv.level}(コア${lv.cores}) BP${lv.bp}`)
            .join(" / ")
        parts.push(levels)
    } else if (bp !== null) {
        parts.push(`BP${bp}`)
    }
    if (card.rarity !== "") parts.push(`レアリティ: ${card.rarity}`)
    if (card.limited) parts.push("【禁止カード】デッキに入れられません")
    meta.textContent = parts.join("　")
    panel.appendChild(meta)

    const effect = document.createElement("div")
    effect.className = "detail-effect"
    effect.textContent = card.effect !== "" ? card.effect : "（効果なし）"
    panel.appendChild(effect)
}

// ---- デッキ面 ----

function addCard(cardId: string): void {
    const card = master(cardId)
    if (card.limited) {
        showToast(`${card.name} は禁止カードのためデッキに入れられません`)
        return
    }
    if (deckTotal() >= DECK_SIZE) {
        showToast(`デッキは${DECK_SIZE}枚までです`)
        return
    }
    if (nameCount(card.name) >= nameLimit(card.name)) {
        showToast(`同名カードは${nameLimit(card.name)}枚までです（${card.name}）`)
        return
    }
    deck.set(cardId, (deck.get(cardId) ?? 0) + 1)
    renderAll()
}

function removeCard(cardId: string): void {
    const count = deck.get(cardId) ?? 0
    if (count <= 1) {
        deck.delete(cardId)
    } else {
        deck.set(cardId, count - 1)
    }
    renderAll()
}

// デッキ全体の制約検証。問題がなければ空配列を返す
function validateDeck(target: Map<string, number>): string[] {
    const errors: string[] = []
    let total = 0
    const byName = new Map<string, number>()
    for (const [cardId, count] of target) {
        const card = db.get(cardId)
        if (!card) {
            errors.push(`存在しないカードID: ${cardId}`)
            continue
        }
        total += count
        byName.set(card.name, (byName.get(card.name) ?? 0) + count)
        if (card.limited) {
            errors.push(`禁止カードが含まれています: ${card.name}`)
        }
    }
    for (const [name, count] of byName) {
        const limit = nameLimit(name)
        if (count > limit) {
            errors.push(`同名カードが${limit}枚を超えています: ${name}（${count}枚）`)
        }
    }
    if (total !== DECK_SIZE) {
        errors.push(`デッキはちょうど${DECK_SIZE}枚必要です（現在${total}枚）`)
    }
    return errors
}

function renderDeck(): void {
    const total = deckTotal()
    const counter = $("deck-count")
    counter.textContent = `${total} / ${DECK_SIZE}`
    counter.className = total === DECK_SIZE ? "valid" : "invalid"

    // 検証結果の表示
    const validation = $("deck-validation")
    validation.textContent = ""
    const errors = validateDeck(deck)
    if (errors.length === 0) {
        const ok = document.createElement("div")
        ok.className = "validation-ok"
        ok.textContent = "有効なデッキです（40枚ちょうど）"
        validation.appendChild(ok)
    } else {
        for (const message of errors) {
            const row = document.createElement("div")
            row.className = "validation-error"
            row.textContent = message
            validation.appendChild(row)
        }
    }

    // デッキ内容（コスト順 → cardId 順）
    const list = $("deck-list")
    list.textContent = ""
    const entries = [...deck.entries()].sort((a, b) => {
        const ca = master(a[0])
        const cb = master(b[0])
        return ca.cost - cb.cost || a[0].localeCompare(b[0])
    })

    if (entries.length === 0) {
        const empty = document.createElement("p")
        empty.className = "deck-empty"
        empty.textContent = "左のカード一覧からクリックで追加してください"
        list.appendChild(empty)
        return
    }

    for (const [cardId, count] of entries) {
        const card = master(cardId)
        const row = document.createElement("div")
        row.className = `deck-row color-${card.colors[0]}`

        const cost = document.createElement("span")
        cost.className = "row-cost"
        cost.textContent = String(card.cost)
        row.appendChild(cost)

        const name = document.createElement("span")
        name.className = "row-name"
        name.textContent = card.name
        row.appendChild(name)

        const type = document.createElement("span")
        type.className = "row-type"
        type.textContent = TYPE_LABELS[card.type]
        row.appendChild(type)

        const countEl = document.createElement("span")
        countEl.className = "row-count"
        countEl.textContent = `×${count}`
        row.appendChild(countEl)

        const minus = document.createElement("button")
        minus.className = "row-minus"
        minus.textContent = "−"
        minus.title = "1枚減らす"
        minus.addEventListener("click", (e) => {
            e.stopPropagation()
            removeCard(cardId)
        })
        row.appendChild(minus)

        // 行クリックで詳細表示
        row.addEventListener("click", () => {
            selectedCardId = cardId
            renderDetail(card)
        })

        list.appendChild(row)
    }
}

// ---- 統計表示 ----

function renderStats(): void {
    // コストカーブ（コスト別枚数の簡易バー）
    const curve = $("cost-curve")
    curve.textContent = ""
    const byCost = new Array<number>(MAX_COST + 1).fill(0)
    for (const [cardId, count] of deck) {
        const cost = Math.min(master(cardId).cost, MAX_COST)
        byCost[cost] = (byCost[cost] ?? 0) + count
    }
    const peak = Math.max(1, ...byCost)
    byCost.forEach((count, cost) => {
        const row = document.createElement("div")
        row.className = "curve-row"

        const label = document.createElement("span")
        label.className = "curve-label"
        label.textContent = cost === MAX_COST ? `${MAX_COST}+` : String(cost)
        row.appendChild(label)

        const track = document.createElement("div")
        track.className = "curve-track"
        const bar = document.createElement("div")
        bar.className = "curve-bar"
        bar.style.width = `${(count / peak) * 100}%`
        track.appendChild(bar)
        row.appendChild(track)

        const value = document.createElement("span")
        value.className = "curve-value"
        value.textContent = String(count)
        row.appendChild(value)

        curve.appendChild(row)
    })

    // 色内訳・タイプ内訳
    const byColor = new Map<string, { colors: Color[]; count: number }>()
    const byType = new Map<CardType, number>()
    for (const [cardId, count] of deck) {
        const card = master(cardId)
        const colorKey = card.colors.join("/")
        const entry = byColor.get(colorKey)
        byColor.set(colorKey, { colors: card.colors, count: (entry?.count ?? 0) + count })
        byType.set(card.type, (byType.get(card.type) ?? 0) + count)
    }

    const colorStats = $("color-stats")
    colorStats.textContent = ""
    for (const [, { colors, count }] of byColor) {
        const row = document.createElement("div")
        row.className = "stat-row"
        // 多色カードは色の数だけドットを並べる
        for (const color of colors) {
            const dot = document.createElement("span")
            dot.className = `stat-dot dot-${color}`
            row.appendChild(dot)
        }
        const text = document.createElement("span")
        text.textContent = `${colors.map((c) => COLOR_LABELS[c]).join("・")}: ${count}枚`
        row.appendChild(text)
        colorStats.appendChild(row)
    }
    if (byColor.size === 0) colorStats.textContent = "－"

    const typeStats = $("type-stats")
    typeStats.textContent = ""
    for (const [type, count] of byType) {
        const row = document.createElement("div")
        row.className = "stat-row"
        row.textContent = `${TYPE_LABELS[type]}: ${count}枚`
        typeStats.appendChild(row)
    }
    if (byType.size === 0) typeStats.textContent = "－"
}

// ---- localStorage 保存 ----

function loadSavedDecks(): SavedDeck[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
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

function persistSavedDecks(decks: SavedDeck[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks))
}

function saveCurrentDeck(): void {
    const nameInput = $("deck-name-input") as HTMLInputElement
    const name = nameInput.value.trim()
    if (name === "") {
        showToast("デッキ名を入力してください")
        return
    }
    if (deck.size === 0) {
        showToast("デッキが空です")
        return
    }
    const decks = loadSavedDecks()
    const entry: SavedDeck = {
        name,
        cards: Object.fromEntries(deck),
        updatedAt: new Date().toISOString(),
    }
    const index = decks.findIndex((d) => d.name === name)
    if (index >= 0) {
        decks[index] = entry
        showToast(`「${name}」を上書き保存しました`)
    } else {
        decks.push(entry)
        showToast(`「${name}」を保存しました`)
    }
    persistSavedDecks(decks)
    renderSavedDecks()
}

function loadDeckByName(name: string): void {
    const saved = loadSavedDecks().find((d) => d.name === name)
    if (!saved) {
        showToast(`デッキが見つかりません: ${name}`)
        return
    }
    applyDeck(saved.cards, saved.name)
    showToast(`「${name}」を読み込みました`)
}

function deleteDeckByName(name: string): void {
    const decks = loadSavedDecks().filter((d) => d.name !== name)
    persistSavedDecks(decks)
    renderSavedDecks()
    showToast(`「${name}」を削除しました`)
}

function renderSavedDecks(): void {
    const container = $("saved-decks")
    container.textContent = ""
    const decks = loadSavedDecks()
    if (decks.length === 0) {
        const empty = document.createElement("p")
        empty.className = "saved-empty"
        empty.textContent = "保存済みデッキはありません"
        container.appendChild(empty)
        return
    }
    for (const saved of decks) {
        const row = document.createElement("div")
        row.className = "saved-row"

        const info = document.createElement("span")
        info.className = "saved-info"
        let total = 0
        for (const count of Object.values(saved.cards)) total += count
        const date = saved.updatedAt
            ? new Date(saved.updatedAt).toLocaleString("ja-JP")
            : ""

        info.textContent = `${saved.name} `

        const badge = document.createElement("span")
        badge.className = `saved-badge ${total === 40 ? "valid" : "invalid"}`
        badge.textContent = `${total}/40`
        info.appendChild(badge)
        
        info.appendChild(document.createTextNode(` ${date}`))
        row.appendChild(info)

        const loadBtn = document.createElement("button")
        loadBtn.textContent = "読込"
        loadBtn.addEventListener("click", () => loadDeckByName(saved.name))
        row.appendChild(loadBtn)

        const dupBtn = document.createElement("button")
        dupBtn.textContent = "複製"
        dupBtn.addEventListener("click", () => {
            const newName = `${saved.name}のコピー`
            const newDeck = { name: newName, cards: { ...saved.cards }, updatedAt: new Date().toISOString() }
            const currentDecks = loadSavedDecks()
            const filtered = currentDecks.filter(d => d.name !== newName)
            filtered.push(newDeck)
            persistSavedDecks(filtered)
            renderSavedDecks()
            showToast(`「${newName}」として複製しました`)
        })
        row.appendChild(dupBtn)

        const renameBtn = document.createElement("button")
        renameBtn.textContent = "名前"
        renameBtn.addEventListener("click", () => {
            const newName = prompt("新しいデッキ名を入力してください", saved.name)?.trim()
            if (!newName || newName === saved.name) return
            const currentDecks = loadSavedDecks()
            if (currentDecks.some(d => d.name === newName)) {
                showToast("同名のデッキが既に存在します")
                return
            }
            const target = currentDecks.find(d => d.name === saved.name)
            if (target) {
                target.name = newName
                persistSavedDecks(currentDecks)
                renderSavedDecks()
                showToast("名前を変更しました")
            }
        })
        row.appendChild(renameBtn)

        const deleteBtn = document.createElement("button")
        deleteBtn.className = "danger"
        deleteBtn.textContent = "削除"
        deleteBtn.addEventListener("click", () => {
            if (confirm(`「${saved.name}」を削除しますか？`)) {
                deleteDeckByName(saved.name)
            }
        })
        row.appendChild(deleteBtn)

        container.appendChild(row)
    }
}

// デッキ内容を丸ごと差し替える（読込・インポート・プリセット共通）
function applyDeck(cardCounts: Record<string, number>, name: string): void {
    deck = new Map(Object.entries(cardCounts))
    const nameInput = $("deck-name-input") as HTMLInputElement
    nameInput.value = name
    renderAll()
}

// ---- JSON 書き出し・読み込み ----

function exportDeck(): void {
    if (deck.size === 0) {
        showToast("デッキが空です")
        return
    }
    const nameInput = $("deck-name-input") as HTMLInputElement
    const name = nameInput.value.trim() || "無題のデッキ"
    const data = { name, cards: Object.fromEntries(deck) }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${name}.json`
    anchor.click()
    URL.revokeObjectURL(url)
}

// インポートしたJSONの検証。致命的な問題があれば読み込まずエラー一覧を返す
function validateImport(data: unknown): {
    errors: string[]
    warnings: string[]
    name: string
    cards: Record<string, number>
} {
    const errors: string[] = []
    const warnings: string[] = []
    let name = "インポートしたデッキ"
    const result: Record<string, number> = {}

    if (typeof data !== "object" || data === null) {
        errors.push("JSONのルートがオブジェクトではありません")
        return { errors, warnings, name, cards: result }
    }
    const obj = data as Record<string, unknown>
    if (typeof obj.name === "string" && obj.name.trim() !== "") {
        name = obj.name.trim()
    }
    if (typeof obj.cards !== "object" || obj.cards === null) {
        errors.push("cards プロパティ（cardId → 枚数）がありません")
        return { errors, warnings, name, cards: result }
    }

    const byName = new Map<string, number>()
    let total = 0
    for (const [cardId, rawCount] of Object.entries(
        obj.cards as Record<string, unknown>,
    )) {
        if (typeof rawCount !== "number" || !Number.isInteger(rawCount) || rawCount < 1) {
            errors.push(`枚数が不正です: ${cardId} → ${String(rawCount)}`)
            continue
        }
        const card = db.get(cardId)
        if (!card) {
            errors.push(`存在しないカードID: ${cardId}`)
            continue
        }
        if (card.limited) {
            errors.push(`禁止カードは入れられません: ${card.name}（${cardId}）`)
            continue
        }
        result[cardId] = rawCount
        total += rawCount
        byName.set(card.name, (byName.get(card.name) ?? 0) + rawCount)
    }
    for (const [cardName, count] of byName) {
        const limit = nameLimit(cardName)
        if (count > limit) {
            errors.push(`同名カードが${limit}枚を超えています: ${cardName}（${count}枚）`)
            continue
        }
    }
    if (errors.length === 0 && total !== DECK_SIZE) {
        warnings.push(`合計が${DECK_SIZE}枚ではありません（${total}枚）。編集を続けてください`)
    }
    return { errors, warnings, name, cards: result }
}

function importDeckFile(file: File): void {
    const reader = new FileReader()
    reader.onload = () => {
        const resultEl = $("import-result")
        resultEl.textContent = ""
        resultEl.classList.add("hidden")

        let parsed: unknown
        try {
            parsed = JSON.parse(String(reader.result))
        } catch {
            resultEl.classList.remove("hidden")
            resultEl.textContent = "読み込み失敗: JSONとして解析できませんでした"
            return
        }

        const { errors, warnings, name, cards: importedCards } =
            validateImport(parsed)
        if (errors.length > 0) {
            resultEl.classList.remove("hidden")
            const head = document.createElement("div")
            head.className = "import-error-head"
            head.textContent = "読み込みを中止しました。以下の問題があります:"
            resultEl.appendChild(head)
            for (const message of errors) {
                const row = document.createElement("div")
                row.className = "validation-error"
                row.textContent = message
                resultEl.appendChild(row)
            }
            return
        }

        applyDeck(importedCards, name)
        if (warnings.length > 0) {
            resultEl.classList.remove("hidden")
            for (const message of warnings) {
                const row = document.createElement("div")
                row.className = "validation-warning"
                row.textContent = message
                resultEl.appendChild(row)
            }
        }
        showToast(`「${name}」をインポートしました`)
    }
    reader.readAsText(file)
}

// ---- プリセット生成 ----

// data/constants.ts の DECK_RECIPES と同じ構成方針で自動生成する:
// その色の低コスト順に スピリット9種×3 + ネクサス2種（3+1）+ マジック3種×3 = 40枚
function buildPreset(color: Color): Record<string, number> | null {
    // 単色サンプルなので多色カードは対象外にする（colors.length === 1 の判定）
    const pool = cards.filter((c) => c.colors.length === 1 && c.colors[0] === color && !c.limited)
    const byCost = (a: CardData, b: CardData) =>
        a.cost - b.cost || a.cardId.localeCompare(b.cardId)
    const spirits = pool
        .filter((c) => c.type === "spirit")
        .sort(byCost)
        .slice(0, 9)
    const nexuses = pool
        .filter((c) => c.type === "nexus")
        .sort(byCost)
        .slice(0, 2)
    const magics = pool
        .filter((c) => c.type === "magic")
        .sort(byCost)
        .slice(0, 3)
    if (spirits.length < 9 || nexuses.length < 2 || magics.length < 3) {
        return null
    }
    const result: Record<string, number> = {}
    for (const card of spirits) result[card.cardId] = 3
    nexuses.forEach((card, index) => {
        result[card.cardId] = index === 0 ? 3 : 1
    })
    for (const card of magics) result[card.cardId] = 3
    return result
}

function applyPreset(color: Color): void {
    const preset = buildPreset(color)
    if (!preset) {
        showToast(`${COLOR_LABELS[color]}のプリセットを構成できませんでした`)
        return
    }
    applyDeck(preset, `${COLOR_LABELS[color]}単色サンプル`)
    showToast(`${COLOR_LABELS[color]}単色サンプル（40枚）を読み込みました`)
}

// ---- イベント登録 ----

function setupFilterChips(): void {
    const availableSeries = new Set<string>()
    const availableKeywords = new Set<Keyword>()
    const availableFamilies = new Set<string>()

    for (const card of cards) {
        availableSeries.add(card.cardId.substring(0, 4))
        for (const effect of card.effects) {
            if (effect.kind === "keyword") {
                availableKeywords.add(effect.keyword)
            }
        }
        for (const fam of card.family) {
            availableFamilies.add(fam)
        }
    }

    const seriesContainer = $("filter-series")
    const sortedSeries = Array.from(availableSeries).sort()
    for (const s of sortedSeries) {
        const btn = document.createElement("button")
        btn.className = "chip"
        btn.dataset.series = s
        btn.textContent = SERIES_LABELS[s] ? `${s} ${SERIES_LABELS[s]}` : s
        btn.addEventListener("click", () => {
            if (filterSeries.has(s)) {
                filterSeries.delete(s)
                btn.classList.remove("active")
            } else {
                filterSeries.add(s)
                btn.classList.add("active")
            }
            renderPool()
        })
        seriesContainer.appendChild(btn)
    }

    const kwContainer = $("filter-keywords")
    const sortedKw = Array.from(availableKeywords).sort()
    for (const kw of sortedKw) {
        const btn = document.createElement("button")
        btn.className = "chip"
        btn.dataset.keyword = kw
        btn.textContent = KEYWORDS[kw]?.label ?? kw
        btn.addEventListener("click", () => {
            if (filterKeywords.has(kw)) {
                filterKeywords.delete(kw)
                btn.classList.remove("active")
            } else {
                filterKeywords.add(kw)
                btn.classList.add("active")
            }
            renderPool()
        })
        kwContainer.appendChild(btn)
    }

    const familySelect = $("filter-family") as HTMLSelectElement
    const sortedFamilies = Array.from(availableFamilies).sort((a, b) => a.localeCompare(b, "ja"))
    for (const fam of sortedFamilies) {
        const option = document.createElement("option")
        option.value = fam
        option.textContent = fam
        familySelect.appendChild(option)
    }
    familySelect.addEventListener("change", () => {
        filterFamily = familySelect.value
        renderPool()
    })

    for (const btn of $("filter-colors").querySelectorAll<HTMLButtonElement>(".chip")) {
        btn.addEventListener("click", () => {
            const color = btn.dataset.color as Color
            if (filterColors.has(color)) {
                filterColors.delete(color)
                btn.classList.remove("active")
            } else {
                filterColors.add(color)
                btn.classList.add("active")
            }
            renderPool()
        })
    }
    for (const btn of $("filter-types").querySelectorAll<HTMLButtonElement>(".chip")) {
        btn.addEventListener("click", () => {
            const type = btn.dataset.type as CardType
            if (filterTypes.has(type)) {
                filterTypes.delete(type)
                btn.classList.remove("active")
            } else {
                filterTypes.add(type)
                btn.classList.add("active")
            }
            renderPool()
        })
    }
    for (const btn of $("filter-costs").querySelectorAll<HTMLButtonElement>(".chip")) {
        btn.addEventListener("click", () => {
            const index = Number(btn.dataset.cost)
            if (filterCosts.has(index)) {
                filterCosts.delete(index)
                btn.classList.remove("active")
            } else {
                filterCosts.add(index)
                btn.classList.add("active")
            }
            renderPool()
        })
    }

    const search = $("search-input") as HTMLInputElement
    search.addEventListener("input", () => {
        searchText = search.value.trim()
        renderPool()
    })

    $("filter-reset").addEventListener("click", () => {
        filterColors.clear()
        filterTypes.clear()
        filterCosts.clear()
        filterSeries.clear()
        filterKeywords.clear()
        filterFamily = ""
        const familySelect = $("filter-family") as HTMLSelectElement
        familySelect.value = ""
        searchText = ""
        search.value = ""
        for (const btn of document.querySelectorAll("#filters .chip")) {
            btn.classList.remove("active")
        }
        renderPool()
    })
}

function setupDeckIo(): void {
    $("btn-save").addEventListener("click", saveCurrentDeck)
    $("btn-clear").addEventListener("click", () => {
        if (deck.size === 0) return
        if (confirm("編集中のデッキを空にしますか？")) {
            deck = new Map()
            renderAll()
        }
    })
    $("btn-export").addEventListener("click", exportDeck)

    const fileInput = $("import-file") as HTMLInputElement
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0]
        if (file) importDeckFile(file)
        fileInput.value = "" // 同じファイルを再選択できるようにリセット
    })

    for (const btn of document.querySelectorAll<HTMLButtonElement>(".preset-btn")) {
        btn.addEventListener("click", () => {
            const color = btn.dataset.preset as Color
            if (deck.size > 0 && !confirm("編集中のデッキを破棄してプリセットを読み込みますか？")) {
                return
            }
            applyPreset(color)
        })
    }

    // プール外クリックで詳細の固定選択を解除（ホバー表示に戻す）
    $("pool-grid").addEventListener("mouseleave", () => {
        selectedCardId = null
    })
}

// ---- 描画まとめ・起動 ----

function renderAll(): void {
    renderPool()
    renderDeck()
    renderStats()
}

async function init(): Promise<void> {
    const res = await fetch("/data/cards.json")
    if (!res.ok) {
        showToast("カードデータの取得に失敗しました")
        return
    }
    cards = (await res.json()) as CardData[]
    cards.sort((a, b) => a.cardId.localeCompare(b.cardId))
    db = new Map(cards.map((c) => [c.cardId, c]))

    setupFilterChips()
    setupDeckIo()
    renderSavedDecks()
    renderAll()
}

init().catch((err) => {
    console.error(err)
    showToast("初期化に失敗しました")
})
