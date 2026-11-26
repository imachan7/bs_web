// カードと注記の読み込み。読み込み後は変わらないので、$state は読み込み完了の合図（loaded）だけに使う
import type { CardData } from "../../../../server/src/type"
import { isTokenCard } from "../../../../shared/cardDb"
import { assetUrl } from "../../assetUrl"
import { buildMentionedFamilies } from "../logic/families"

export type NoteStatus = "unimplemented" | "partial" | "simplified"
export interface CardNote {
    status: NoteStatus
    note: string
}

export const cardStore = $state<{
    loaded: boolean
    error: string
    cards: CardData[]
    notes: Record<string, CardNote>
    mentionedFamilies: Map<string, Set<string>>
}>({ loaded: false, error: "", cards: [], notes: {}, mentionedFamilies: new Map() })

export async function loadCards(): Promise<void> {
    // card-notes.json と /api/cards は互いに依存しないので並列に取得する。注記は無くても動く
    const notesPromise = fetch("/data/card-notes.json")
        .then(async (res) => {
            if (res.ok) cardStore.notes = ((await res.json()).notes ?? {}) as Record<string, CardNote>
        })
        .catch((e) => console.warn("card-notes.json の取得に失敗", e))
    // ?staging は取り込み途中のカード（data/staging）を出す確認用
    const useStaging = new URLSearchParams(location.search).has("staging")
    const cardsPromise = fetch(useStaging ? "/api/staging-cards" : assetUrl("/api/cards"))
    try {
        const [, res] = await Promise.all([notesPromise, cardsPromise])
        if (!res.ok) throw new Error(String(res.status))
        // トークンはデッキに入れられないので出さない
        const cards = ((await res.json()) as CardData[]).filter((c) => !isTokenCard(c.cardId))
        cards.sort((a, b) => a.cardId.localeCompare(b.cardId))
        cardStore.mentionedFamilies = buildMentionedFamilies(cards)
        cardStore.cards = cards
        cardStore.loaded = true
    } catch (e) {
        console.error(e)
        cardStore.error = "カードデータの取得に失敗しました"
    }
}
