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

// deck-select に保存済みデッキを「カスタム: <デッキ名>」として追加する（4色プリセットの後ろ）
// おまかせデッキ。カードプールに合わせてサーバーが決めるので起動時に取得する
export let deckRecipes: Record<string, { label: string; cards: Record<string, number> }> = {}
export function setDeckRecipes(r: typeof deckRecipes): void {
    deckRecipes = r
}

export function populateBuiltinDecks(selectId = "deck-select"): void {
    const select = byId(selectId) as HTMLSelectElement
    for (const [key, recipe] of Object.entries(deckRecipes)) {
        const option = document.createElement("option")
        option.value = key
        option.textContent = recipe.label
        select.appendChild(option)
    }
}

export function populateCustomDecks(selectId = "deck-select"): void {
    const select = byId(selectId) as HTMLSelectElement
    // 既存のカスタムデッキをクリア
    const options = Array.from(select.options)
    for (const opt of options) {
        if (opt.value.startsWith(CUSTOM_DECK_PREFIX)) {
            select.removeChild(opt)
        }
    }
    if (selectId === "deck-select") {
        customDecks.clear()
    }

    for (const saved of loadSavedDecks()) {
        if (selectId === "deck-select") {
            customDecks.set(saved.name, saved.cards)
        }
        let total = 0
        for (const count of Object.values(saved.cards)) total += count

        const option = document.createElement("option")
        option.value = `${CUSTOM_DECK_PREFIX}${saved.name}`
        if (total >= DECK_MIN_SIZE) {
            option.textContent = `カスタム: ${saved.name}（${total}枚）`
        } else {
            option.textContent = `カスタム: ${saved.name}（${total}枚のため使用不可）`
            option.disabled = true
        }
        select.appendChild(option)
    }
}

// ロビー・AI対戦用の全デッキセレクトを一括で構築する
export const ALL_DECK_SELECT_IDS = ["deck-select", "ai-my-deck-select", "ai-opp-deck-select"]

export function populateAllBuiltinDecks(): void {
    for (const id of ALL_DECK_SELECT_IDS) populateBuiltinDecks(id)
}

export function populateAllCustomDecks(): void {
    for (const id of ALL_DECK_SELECT_IDS) populateCustomDecks(id)
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
