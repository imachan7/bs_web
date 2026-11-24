<script lang="ts">
    import type { CardData } from "../../../../server/src/type"
    import { CARD_TYPE_LABELS } from "../../../../data/constants"
    import { cardArt } from "../actions/cardArt"
    import { maxBp, braveBpGain } from "../logic/cardInfo"
    import { cardStore } from "../state/cards.svelte"
    import { addBlockReason, deckCards } from "../state/deck.svelte"
    import { selection, toggleSelection } from "../state/selection.svelte"
    import AdjustButtons from "./AdjustButtons.svelte"

    let { card, size, area }: { card: CardData; size: "lg" | "md"; area: "pool" | "deck" } = $props()

    const count = $derived(deckCards.get(card.cardId) ?? 0)
    // プールだけグレーにする。デッキ欄は入っているカードなので常に通常表示
    const maxed = $derived(area === "pool" && addBlockReason(card) !== null)
    const open = $derived(selection.key === `${area}:${card.cardId}`)

    const NOTE_LABELS = { unimplemented: "未実装", partial: "一部未実装", simplified: "簡略化" }
    const note = $derived(cardStore.notes[card.cardId])
    // 絵が読めたときは絵に入っているので、このテキストは絵が無いときだけ出る
    const sub = $derived.by(() => {
        const parts: string[] = card.type === "spirit" ? [] : [CARD_TYPE_LABELS[card.type]]
        const bp = maxBp(card)
        if (bp !== null) parts.push(`BP${bp}`)
        const gain = braveBpGain(card)
        if (gain !== null) parts.push(`合体+${gain}`)
        return parts.join(" / ")
    })
</script>

<div
    class="tile"
    class:maxed
    role="button"
    tabindex="0"
    onclick={(e) => {
        e.stopPropagation()
        toggleSelection(`${area}:${card.cardId}`)
    }}
    onkeydown={(e) => e.key === "Enter" && toggleSelection(`${area}:${card.cardId}`)}
    style:--c-main="var(--c-{card.colors[0]})"
    style:--c-sub="var(--c-{card.colors[card.colors.length > 1 ? 1 : 0]})"
    use:cardArt={{ cardId: card.cardId, name: card.name, size }}
>
    <span class="cost">{card.cost}</span>
    <div class="name">{card.name}</div>
    <div class="sub">{sub}</div>
    {#if note}<span class="note {note.status}">{NOTE_LABELS[note.status]}</span>{/if}
    {#if card.limited}<span class="limited">禁止</span>{/if}
    {#if count > 0}<span class="count">×{count}</span>{/if}
    {#if open}<div class="ctl"><AdjustButtons {card} /></div>{/if}
</div>

<style>
    .tile {
        position: relative;
        aspect-ratio: 675 / 985;
        border-radius: 8px;
        overflow: hidden;
        background: linear-gradient(160deg, var(--c-main), var(--c-sub));
        color: #fff;
        padding: 6px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        gap: 2px;
        font-size: 11px;
        text-shadow: 0 1px 2px #000;
    }
    .tile > :global(.card-art) {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0; /* display:none だと lazy の画像が読み込まれず has-art が付かない */
        pointer-events: none;
    }
    .tile:global(.has-art) > :global(.card-art) { opacity: 1; }
    /* attachCardArt は絵をタイルの最後に足すので、何もしないとバッジと − ＋ が絵の下に隠れる */
    .note, .limited, .count, .ctl { z-index: 1; }
    .tile:global(.has-art) .cost,
    .tile:global(.has-art) .name,
    .tile:global(.has-art) .sub { display: none; }
    .cost {
        position: absolute;
        top: 4px;
        left: 4px;
        min-width: 20px;
        height: 20px;
        border-radius: 10px;
        background: #000a;
        text-align: center;
        line-height: 20px;
        font-weight: bold;
    }
    .name { font-weight: bold; }
    .note, .limited {
        position: absolute;
        right: 3px;
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 10px;
        text-shadow: none;
    }
    .note { top: 24px; }
    .limited { bottom: 3px; background: #000c; }
    .tile.maxed { filter: grayscale(1) brightness(0.55); }
    .count {
        position: absolute;
        top: 3px;
        right: 3px;
        padding: 1px 6px;
        border-radius: 8px;
        background: #4a6cd4;
        font-size: 12px;
        font-weight: bold;
        text-shadow: none;
    }
    /* 絵が出ていても読めるよう半透明の帯に載せる */
    .ctl { position: absolute; left: 0; right: 0; bottom: 0; padding: 6px; display: flex; justify-content: center; background: #000b; }
    .note.unimplemented { background: #d44a4a; }
    .note.partial { background: #d48a4a; }
    .note.simplified { background: #d4c44a; color: #333; }
</style>
