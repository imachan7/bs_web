<script lang="ts">
    import type { CardData, CardType } from "../../../../server/src/type"
    import { DECK_MIN_SIZE } from "../../../../data/constants"
    import { computeDeckStats, type DeckEntry } from "../logic/deckStats"
    import { cardOf, deck, deckCards, deckTotal, validateDeck } from "../state/deck.svelte"
    import DeckCategory from "./DeckCategory.svelte"
    import DeckStats from "./DeckStats.svelte"
    import SavedDecks from "./SavedDecks.svelte"
    import DeckIo from "./DeckIo.svelte"

    let { onclose }: { onclose: () => void } = $props()

    const ORDER: CardType[] = ["spirit", "brave", "nexus", "magic"]
    const entries = $derived.by(() => {
        const list: DeckEntry[] = []
        for (const [id, count] of deckCards) {
            const card = cardOf(id)
            if (card) list.push({ card, count })
        }
        return list
    })
    const stats = $derived(computeDeckStats(entries))
    const total = $derived(deckTotal())
    const errors = $derived(validateDeck())
    // 種類ごとに、コスト順（同コストは cardId 順）
    const groups = $derived(
        ORDER.map((type) => {
            const list = entries.filter((e) => e.card.type === type)
            const cards: CardData[] = list.map((e) => e.card).sort((a, b) => a.cost - b.cost || a.cardId.localeCompare(b.cardId))
            return { type, cards, total: list.reduce((s, e) => s + e.count, 0) }
        }).filter((g) => g.cards.length > 0),
    )
</script>

<div class="deckpane">
    <div class="head">
        <button type="button" class="close" onclick={onclose}>× 閉じる</button>
        <input type="text" placeholder="デッキ名" bind:value={deck.name} />
        <span class="total" class:ok={total >= DECK_MIN_SIZE}>{total} / {DECK_MIN_SIZE}以上</span>
    </div>
    <div class="progress"><div style:width="{Math.min(100, (total / DECK_MIN_SIZE) * 100)}%"></div></div>
    {#if errors.length === 0}
        <p class="valid">有効なデッキです</p>
    {:else}
        <ul class="errors">
            {#each errors as e}<li>{e}</li>{/each}
        </ul>
    {/if}
    <DeckStats {stats}>
        {#each groups as g (g.type)}
            <DeckCategory type={g.type} cards={g.cards} total={g.total} />
        {/each}
    </DeckStats>
    <SavedDecks />
    <DeckIo />
</div>

<style>
    .deckpane { height: 100%; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 10px; }
    .head { flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
    .head input { flex: 1; min-width: 0; }
    .progress { flex-shrink: 0; height: 6px; background: #33363d; border-radius: 99px; overflow: hidden; }
    .progress div { height: 100%; background: #ffd23e; transition: width 0.15s; }
    .close { display: none; }
    .total { font-weight: bold; white-space: nowrap; color: #e8a0a0; }
    .total.ok { color: #6fd68a; }
    .valid { flex-shrink: 0; margin: 0; font-size: 12px; color: #6fd68a; }
    .errors { flex-shrink: 0; margin: 0; padding-left: 18px; font-size: 12px; color: #e8a0a0; }
    @media (max-width: 899px) {
        .close { display: block; }
    }
</style>
