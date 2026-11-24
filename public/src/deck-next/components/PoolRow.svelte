<script lang="ts">
    import type { CardData } from "../../../../server/src/type"
    import { CARD_TYPE_LABELS } from "../../../../data/constants"
    import { maxBp } from "../logic/cardInfo"
    import { cardStore } from "../state/cards.svelte"

    let { card }: { card: CardData } = $props()
    const NOTE_LABELS = { unimplemented: "未実装", partial: "一部未実装", simplified: "簡略化" }
    const note = $derived(cardStore.notes[card.cardId])
    const bp = $derived(maxBp(card))
</script>

<div class="row" title={card.name} style:--c-main="var(--c-{card.colors[0]})">
    <span class="cost">{card.cost}</span>
    <span class="name">{card.name}</span>
    {#if note}<span class="note {note.status}">{NOTE_LABELS[note.status]}</span>{/if}
    <span class="type">{CARD_TYPE_LABELS[card.type]}</span>
    <span class="bp">{bp === null ? "" : `BP${bp}`}</span>
</div>

<style>
    .row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        border-left: 4px solid var(--c-main);
        background: #232738;
        border-radius: 4px;
        font-size: 13px;
    }
    .cost { width: 20px; text-align: center; font-weight: bold; }
    .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .type { color: #aab; font-size: 12px; }
    .bp { width: 64px; text-align: right; }
    .note { padding: 1px 5px; border-radius: 4px; font-size: 10px; }
    .note.unimplemented { background: #d44a4a; }
    .note.partial { background: #d48a4a; }
    .note.simplified { background: #d4c44a; color: #333; }
</style>
