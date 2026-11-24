// 絞り込みと並び順。S1 で UI があるのは検索と並び順だけ。ほかの状態と判定は旧 deck.ts の passesFilter と同じ（UI は S3）
import type { CardData, CardType, Color } from "../../../../server/src/type"
import { SvelteSet } from "svelte/reactivity"
import { seriesGroupOf } from "../logic/series"
import { cardStore, type NoteStatus } from "./cards.svelte"

export const COST_CHIP_MAX = 8 // コストのチップは 0〜7 と「8以上」
export type SortOrder = "id" | "cost-asc" | "cost-desc"

export const filters = $state({
    search: "",
    sort: "id" as SortOrder,
    familyHas: true, // 両方外れたときも「持つ」として扱う
    familyMention: false,
})
export const filterColors = new SvelteSet<Color>()
export const filterTypes = new SvelteSet<CardType>()
export const filterCosts = new SvelteSet<number>() // COST_CHIP_MAX は「それ以上」
export const filterFlags = new SvelteSet<string>() // "burst" | "flash"（選んだものすべてを満たす）
export const filterSeries = new SvelteSet<string>()
export const filterKeywords = new SvelteSet<string>()
export const filterFamilies = new SvelteSet<string>()
export const filterNotes = new SvelteSet<NoteStatus>()

export function passesFilter(card: CardData): boolean {
    if (filterColors.size > 0 && !card.colors.some((c) => filterColors.has(c))) return false
    if (filterTypes.size > 0 && !filterTypes.has(card.type)) return false
    if (filterCosts.size > 0) {
        const hit = card.cost >= COST_CHIP_MAX ? filterCosts.has(COST_CHIP_MAX) : filterCosts.has(card.cost)
        if (!hit) return false
    }
    if (filterFlags.has("burst") && !card.effects.some((e) => e.kind === "burst")) return false
    if (filterFlags.has("flash") && card.flash !== true) return false
    if (filterSeries.size > 0 && !filterSeries.has(seriesGroupOf(card.cardId))) return false
    if (filterKeywords.size > 0 && !card.effects.some((e) => e.kind === "keyword" && filterKeywords.has(e.keyword))) return false
    if (filterFamilies.size > 0) {
        const useHas = filters.familyHas || !filters.familyMention
        const mentioned = cardStore.mentionedFamilies.get(card.cardId)
        let hit = false
        for (const f of filterFamilies) {
            if ((useHas && card.family.includes(f)) || (filters.familyMention && mentioned?.has(f))) hit = true
        }
        if (!hit) return false
    }
    if (filters.search !== "" && !card.name.includes(filters.search) && !(card.effect ?? "").includes(filters.search)) return false
    if (filterNotes.size > 0) {
        const note = cardStore.notes[card.cardId]
        if (!note || !filterNotes.has(note.status)) return false
    }
    return true
}

// 絞り込んで並べたカード。cardStore.cards は cardId 順なので、ID順はそのまま
export function visibleCards(): CardData[] {
    const list = cardStore.cards.filter(passesFilter)
    if (filters.sort === "cost-asc") list.sort((a, b) => a.cost - b.cost || a.cardId.localeCompare(b.cardId))
    else if (filters.sort === "cost-desc") list.sort((a, b) => b.cost - a.cost || a.cardId.localeCompare(b.cardId))
    return list
}
