<script lang="ts">
    import PinIcon from "./PinIcon.svelte"
    import type { CardData } from "../../../../server/src/type"
    import { CARD_TYPE_LABELS } from "../../../../data/constants"
    import { cardArt } from "../actions/cardArt"
    import { maxBp, braveBpGain } from "../logic/cardInfo"
    import { cardStore } from "../state/cards.svelte"
    import { addBlockReason, deckCards } from "../state/deck.svelte"
    import { selection, toggleSelection } from "../state/selection.svelte"
    import { detail, hoverCard, leaveCard, pressPoolCard, selectDetail } from "../state/detail.svelte"
    import { showTip, hideTip } from "../state/hoverTip.svelte"
    import AdjustButtons from "./AdjustButtons.svelte"

    let { card, size, area }: { card: CardData; size: "lg" | "md"; area: "pool" | "deck" } = $props()

    const count = $derived(deckCards.get(card.cardId) ?? 0)
    // プールだけグレーにする。デッキ欄は入っているカードなので常に通常表示
    const maxed = $derived(area === "pool" && addBlockReason(card) !== null)
    const pinned = $derived(detail.pinned && detail.cardId === card.cardId)
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
    function press(): void {
        if (area === "pool") {
            pressPoolCard(card.cardId)
            return
        }
        selectDetail(card.cardId)
        toggleSelection(`${area}:${card.cardId}`)
    }
</script>

<div
    class="tile"
    class:maxed
    class:pinned
    role="button"
    tabindex="0"
    onpointerenter={(e) => {
        hoverCard(e, card.cardId)
        showTip(e, card.cardId)
    }}
    onpointerleave={() => {
        leaveCard()
        hideTip()
    }}
    onclick={(e) => {
        e.stopPropagation()
        press()
    }}
    onkeydown={(e) => e.key === "Enter" && press()}
    style:--c-main="var(--c-{card.colors[0]})"
    style:--c-sub="var(--c-{card.colors[card.colors.length > 1 ? 1 : 0]})"
    use:cardArt={{ cardId: card.cardId, name: card.name, size }}
>
    <span class="cost">{card.cost}</span>
    <div class="name">{card.name}</div>
    <div class="sub">{sub}</div>
    {#if note}<span class="note {note.status}">{NOTE_LABELS[note.status]}</span>{/if}
    {#if card.limited}<span class="limited">禁止</span>{/if}
    {#if pinned}<span class="pinmark" title="詳細に固定中"><PinIcon /></span>{/if}
    {#if count > 0}<span class="count">×{count}</span>{/if}
    <!-- プールは − ＋ を常に出す（入れる操作が主なので。2026-11-24 ユーザー）。デッキ欄は小さく絵が隠れるので押したときだけ -->
    {#if area === "pool"}<div class="ctl always"><AdjustButtons {card} /></div>
    {:else if open}<div class="ctl"><AdjustButtons {card} detailBtn /></div>{/if}
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
    .note, .limited, .count, .ctl, .pinmark { z-index: 1; }
    .tile.pinned { outline: 2px solid #ffd23e; outline-offset: -2px; }
    .pinmark { position: absolute; bottom: 6px; left: 4px; width: 20px; height: 20px; border-radius: 50%; background: #ffd23e; color: #111; display: flex; align-items: center; justify-content: center; }
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
    /* 灰色にするのは絵だけ（タイルごとにかけると − ＋ まで灰色になる） */
    .tile.maxed > :global(.card-art) { filter: grayscale(1) brightness(0.55); }
    .tile.maxed:not(:global(.has-art)) { background: #3a3d44; }
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
    /* 常に出す方は帯を敷かず右下に寄せる（効果文の上に帯を重ねない） */
    .ctl.always { left: auto; padding: 4px; background: none; }
    .ctl.always :global(.adjust) { gap: 3px; }
    .ctl.always :global(button) { width: 22px; height: 22px; font-size: 14px; border-radius: 50%; }
    .note.unimplemented { background: #d44a4a; }
    .note.partial { background: #d48a4a; }
    .note.simplified { background: #d4c44a; color: #333; }
</style>
