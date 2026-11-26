// ブラウザ保存のデッキ。キーと形はロビー（ui/lobby.ts）と旧デッキ画面が読むので変えない
import { deck, deckCards, replaceDeck } from "./deck.svelte"
import { showToast } from "./toast.svelte"

// ui/lobby.ts の DECK_STORAGE_KEY と同じ値。lobby.ts は main.ts を巻き込むので import しない
const DECK_STORAGE_KEY = "bsweb:decks"

export interface SavedDeck {
    name: string
    cards: Record<string, number>
    updatedAt: string
}

function read(): SavedDeck[] {
    try {
        const raw = localStorage.getItem(DECK_STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter(
            (d): d is SavedDeck =>
                typeof d === "object" && d !== null && typeof d.name === "string" && typeof d.cards === "object" && d.cards !== null,
        )
    } catch {
        return []
    }
}

export const saved = $state<{ list: SavedDeck[] }>({ list: read() })

// 別タブで保存した分を巻き込まないよう、操作のたびに読み直してから書く
function update(change: (decks: SavedDeck[]) => void): void {
    const decks = read()
    change(decks)
    localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(decks))
    saved.list = decks
}

export function saveCurrentDeck(): void {
    const name = deck.name.trim()
    if (name === "") return showToast("デッキ名を入力してください")
    if (deckCards.size === 0) return showToast("デッキが空です")
    const entry: SavedDeck = { name, cards: Object.fromEntries(deckCards), updatedAt: new Date().toISOString() }
    let overwritten = false
    update((decks) => {
        const index = decks.findIndex((d) => d.name === name)
        overwritten = index >= 0
        if (overwritten) decks[index] = entry
        else decks.push(entry)
    })
    showToast(overwritten ? `「${name}」を上書き保存しました` : `「${name}」を保存しました`)
}

export function loadSaved(name: string): void {
    const found = read().find((d) => d.name === name)
    if (!found) return showToast(`デッキが見つかりません: ${name}`)
    replaceDeck(found.cards, found.name)
    showToast(`「${name}」を読み込みました`)
}

export function deleteSaved(name: string): void {
    update((decks) => {
        const i = decks.findIndex((d) => d.name === name)
        if (i >= 0) decks.splice(i, 1)
    })
    showToast(`「${name}」を削除しました`)
}

export function duplicateSaved(source: SavedDeck): void {
    const name = `${source.name}のコピー`
    update((decks) => {
        const rest = decks.filter((d) => d.name !== name)
        rest.push({ name, cards: { ...source.cards }, updatedAt: new Date().toISOString() })
        decks.splice(0, decks.length, ...rest)
    })
    showToast(`「${name}」として複製しました`)
}

export function renameSaved(oldName: string, newName: string): void {
    if (!newName || newName === oldName) return
    if (read().some((d) => d.name === newName)) return showToast("同名のデッキが既に存在します")
    update((decks) => {
        const target = decks.find((d) => d.name === oldName)
        if (target) target.name = newName
    })
    // 編集中のデッキなら名前欄も追従させる（古い名前のまま保存すると別のデッキができてしまう）
    if (deck.name.trim() === oldName) deck.name = newName
    showToast("名前を変更しました")
}
