// 対戦前の画面：デッキの一覧（組み込み・自作）とお知らせ
import { DECK_MIN_SIZE } from "../../../data/constants"
import { byId } from "../main"

export const DECK_STORAGE_KEY = "bsweb:decks"

export const CUSTOM_DECK_PREFIX = "custom:"

// デッキビルダー（deck.ts）と同じ保存フォーマット
export interface SavedDeck {
    name: string
    cards: Record<string, number>
    updatedAt: string
}

// デッキ名 → カードリスト（cardId -> 枚数）。ページ表示時に読み込む
export const customDecks = new Map<string, Record<string, number>>()

export function loadSavedDecks(): SavedDeck[] {
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

// おまかせデッキ。カードプールに合わせてサーバーが決めるので起動時に取得する
export let deckRecipes: Record<string, { label: string; cards: Record<string, number> }> = {}
export function setDeckRecipes(r: typeof deckRecipes): void {
    deckRecipes = r
}

export const ALL_DECK_SELECT_IDS = ["deck-select", "ai-my-deck-select", "ai-opp-deck-select"]
// 「スタートデッキを表示」の切り替えを置くデッキ欄。AI のデッキはスタートデッキを選ぶことが多いので常に出す（2026-11-12 ユーザー決定）
const STARTER_TOGGLE_SELECT_IDS = ["deck-select", "ai-my-deck-select"]
const SHOW_STARTERS_KEY = "bsweb:showStarterDecks"
const lastDeckKey = (selectId: string) => `bsweb:lastDeck:${selectId}`

// localStorage は使えないことがある（プライベートウィンドウなど）。読めなければ既定値
function readStore(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}
function writeStore(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch {
        // 覚えられないだけで動作には影響しない
    }
}

export function showStarterDecks(): boolean {
    return readStore(SHOW_STARTERS_KEY) !== "0"
}

// デッキ欄を作り直す：オリジナル（自作）を先頭、スタートデッキを後ろに見出しで分け、最後に使ったデッキを選んだ状態にする
export function rebuildDeckSelects(): void {
    const saved = loadSavedDecks()
    customDecks.clear()
    for (const d of saved) customDecks.set(d.name, d.cards)
    const usable = saved.some((d) => Object.values(d.cards).reduce((a, b) => a + b, 0) >= DECK_MIN_SIZE)
    for (const id of ALL_DECK_SELECT_IDS) {
        // 使えるオリジナルが無いときは、切り替えに関係なくスタートデッキを出す（空の選択欄にしない）
        const withStarters = !STARTER_TOGGLE_SELECT_IDS.includes(id) || showStarterDecks() || !usable
        buildDeckSelect(id, saved, withStarters)
    }
}

function buildDeckSelect(selectId: string, saved: SavedDeck[], withStarters: boolean): void {
    const select = byId(selectId) as HTMLSelectElement
    const want = select.value || readStore(lastDeckKey(selectId))
    select.replaceChildren()
    if (saved.length > 0) {
        const group = document.createElement("optgroup")
        group.label = "オリジナル"
        for (const d of saved) {
            const total = Object.values(d.cards).reduce((a, b) => a + b, 0)
            const option = document.createElement("option")
            option.value = `${CUSTOM_DECK_PREFIX}${d.name}`
            option.textContent = total >= DECK_MIN_SIZE ? `${d.name}（${total}枚）` : `${d.name}（${total}枚のため使用不可）`
            option.disabled = total < DECK_MIN_SIZE
            group.appendChild(option)
        }
        select.appendChild(group)
    }
    if (withStarters) {
        const group = document.createElement("optgroup")
        group.label = "スタートデッキ"
        // キー（sd01_blazing・sd03c 等）の順＝商品番号の順に並べる
        for (const [key, recipe] of Object.entries(deckRecipes).sort(([a], [b]) => a.localeCompare(b))) {
            const option = document.createElement("option")
            option.value = key
            option.textContent = recipe.label
            group.appendChild(option)
        }
        select.appendChild(group)
    }
    const match = Array.from(select.options).find((o) => o.value === want && !o.disabled)
    if (match) select.value = match.value
    else select.value = Array.from(select.options).find((o) => !o.disabled)?.value ?? ""
}

// 名前とルームIDを覚える（ブラウザによっては読み直しで入力欄が戻らず、ルームIDが既定の room1 に戻ったため。2026-11-13 ユーザー報告：スマホ）
export function rememberLobbyInputs(): void {
    for (const id of ["name-input", "room-input"]) {
        const input = byId(id) as HTMLInputElement
        const saved = readStore(`bsweb:lobby:${id}`)
        if (saved !== null && saved !== "") input.value = saved
        input.addEventListener("input", () => writeStore(`bsweb:lobby:${id}`, input.value.trim()))
    }
}

// 選んだデッキを覚える（対戦後はページを読み直してロビーへ戻るため、覚えておかないと先頭に戻る）
export function rememberDeckSelection(): void {
    for (const id of ALL_DECK_SELECT_IDS) {
        byId(id).addEventListener("change", (e) => writeStore(lastDeckKey(id), (e.target as HTMLSelectElement).value))
    }
    for (const box of document.querySelectorAll<HTMLInputElement>("input[data-show-starters]")) {
        box.checked = showStarterDecks()
        box.addEventListener("change", () => {
            writeStore(SHOW_STARTERS_KEY, box.checked ? "1" : "0")
            for (const other of document.querySelectorAll<HTMLInputElement>("input[data-show-starters]")) other.checked = box.checked
            rebuildDeckSelects()
        })
    }
}

export interface ChangelogEntry {
    date: string    // "2026-08-09"（--date=short）
    message: string // "[release:fix] ○○を直した"（プレフィックス込みの生メッセージ）
    hash: string    // "9170e7c"（短縮ハッシュ）
}

// コミットメッセージからカテゴリと表示テキストを抽出する
// 例: "[release:fix] ○○を修正" → { category: "fix", text: "○○を修正" }
//     "[release] ○○を追加"     → { category: "update", text: "○○を追加" }
export const CATEGORY_MAP: Record<string, { label: string; cssClass: string }> = {
    fix:    { label: "バグ修正",  cssClass: "badge fix" },
    ui:     { label: "UI改善",    cssClass: "badge update" },
    new:    { label: "機能追加",  cssClass: "badge new" },
    info:   { label: "お知らせ",  cssClass: "badge info" },
    update: { label: "更新",      cssClass: "badge update" },
}

export function parseReleaseMessage(message: string): { category: string; text: string } {
    // [release:カテゴリ] テキスト
    const match = message.match(/^\[release(?::(\w+))?\]\s*(.*)$/)
    if (!match) return { category: "update", text: message }
    const category = match[1] ?? "update"
    const text = match[2] ?? ""
    return { category, text }
}

export function loadChangelog(): void {
    const container = document.getElementById("announcement-list")
    if (!container) return

    fetch("/api/changelog")
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json() as Promise<ChangelogEntry[]>
        })
        .then(entries => {
            container.textContent = ""

            if (entries.length === 0) {
                const empty = document.createElement("div")
                empty.className = "announcement-loading"
                empty.textContent = "更新情報はありません"
                container.appendChild(empty)
                return
            }

            for (const entry of entries) {
                const item = document.createElement("div")
                item.className = "announcement-item"

                const meta = document.createElement("div")
                meta.className = "announcement-meta"

                const dateEl = document.createElement("span")
                dateEl.className = "date"
                dateEl.textContent = entry.date.replace(/-/g, ".")
                meta.appendChild(dateEl)

                const parsed = parseReleaseMessage(entry.message)
                const catInfo = CATEGORY_MAP[parsed.category] ?? CATEGORY_MAP.update!

                const badge = document.createElement("span")
                badge.className = catInfo.cssClass
                badge.textContent = catInfo.label
                meta.appendChild(badge)

                item.appendChild(meta)

                const text = document.createElement("p")
                text.className = "announcement-text"
                text.textContent = parsed.text
                item.appendChild(text)

                container.appendChild(item)
            }
        })
        .catch(() => {
            if (!container) return
            container.textContent = ""
            const err = document.createElement("div")
            err.className = "announcement-loading"
            err.textContent = "更新情報の取得に失敗しました"
            container.appendChild(err)
        })
}
