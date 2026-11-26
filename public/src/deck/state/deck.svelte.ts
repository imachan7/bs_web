// 編集中のデッキ。cardId→枚数。制限の規則は旧 deck.ts と同じ
import type { CardData } from "../../../../server/src/type"
import { SvelteMap } from "svelte/reactivity"
import { DECK_MIN_SIZE } from "../../../../data/constants"
import { cardStore } from "./cards.svelte"
import { showToast } from "./toast.svelte"
import { deckCopyLimit, MAX_COPIES } from "../../../../shared/deckLimit"


export const deck = $state({ name: "" })
export const deckCards = new SvelteMap<string, number>()

const byId = $derived(new Map(cardStore.cards.map((c) => [c.cardId, c])))
// 同名の別 cardId は、サーバーと同じく一番厳しい上限を採る
const limitByName = $derived.by(() => {
    const m = new Map<string, number>()
    for (const c of cardStore.cards) m.set(c.name, Math.min(m.get(c.name) ?? Infinity, deckCopyLimit(c)))
    return m
})

export function cardOf(cardId: string): CardData | undefined {
    return byId.get(cardId)
}

export function deckTotal(): number {
    let total = 0
    for (const count of deckCards.values()) total += count
    return total
}

// 同名カードのデッキ内合計枚数（cardId が違っても同名なら合算する）
export function nameCount(name: string): number {
    let sum = 0
    for (const [id, count] of deckCards) {
        if (byId.get(id)?.name === name) sum += count
    }
    return sum
}

export function nameLimit(name: string): number {
    return limitByName.get(name) ?? MAX_COPIES
}

// 追加できない理由（できるなら null）。トーストと＋ボタンの無効化で共有する
export function addBlockReason(card: CardData): string | null {
    if (card.limited) return `${card.name} は禁止カードのためデッキに入れられません`
    if (nameCount(card.name) >= nameLimit(card.name)) return `同名カードは${nameLimit(card.name)}枚までです（${card.name}）`
    return null
}

export function addCard(card: CardData): void {
    const blocked = addBlockReason(card)
    if (blocked !== null) {
        showToast(blocked)
        return
    }
    deckCards.set(card.cardId, (deckCards.get(card.cardId) ?? 0) + 1)
}

export function removeCard(cardId: string): void {
    const count = deckCards.get(cardId) ?? 0
    if (count <= 1) deckCards.delete(cardId)
    else deckCards.set(cardId, count - 1)
}

// デッキ全体の制約検証。問題がなければ空配列
export function validateDeck(): string[] {
    const errors: string[] = []
    let total = 0
    const byName = new Map<string, number>()
    for (const [cardId, count] of deckCards) {
        const card = byId.get(cardId)
        if (!card) {
            errors.push(`存在しないカードID: ${cardId}`)
            continue
        }
        total += count
        byName.set(card.name, (byName.get(card.name) ?? 0) + count)
        if (card.limited) errors.push(`禁止カードが含まれています: ${card.name}`)
    }
    for (const [name, count] of byName) {
        const limit = nameLimit(name)
        if (count > limit) errors.push(`同名カードが${limit}枚を超えています: ${name}（${count}枚）`)
    }
    if (total < DECK_MIN_SIZE) errors.push(`デッキは${DECK_MIN_SIZE}枚以上必要です（現在${total}枚）`)
    return errors
}

// デッキ内容を丸ごと差し替える（読込・インポート・構築済みの共通の出口）
export function replaceDeck(cards: Record<string, number>, name: string): void {
    deckCards.clear()
    for (const [id, count] of Object.entries(cards)) deckCards.set(id, count)
    deck.name = name
}
