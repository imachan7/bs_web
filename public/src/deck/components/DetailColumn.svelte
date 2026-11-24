<script lang="ts">
    import PinIcon from "./PinIcon.svelte"
    import { cardImageUrl } from "../../cardArt"
    import { cardStore } from "../state/cards.svelte"
    import CardText from "./CardText.svelte"
    import { deckCards } from "../state/deck.svelte"
    import { detail, unpinDetail } from "../state/detail.svelte"
    import AdjustButtons from "./AdjustButtons.svelte"

    // mobile: 画面いっぱいの欄として出す（絵は軽い md、閉じる × つき）
    let { mobile = false }: { mobile?: boolean } = $props()

    const card = $derived(cardStore.cards.find((c) => c.cardId === detail.cardId))
    const art = $derived(card ? cardImageUrl(card.cardId, mobile ? "md" : "lg") : null)
    let artFailed = $state("")
</script>

<div class="col" class:mobile>
    {#if mobile}<button type="button" class="close" aria-label="閉じる" onclick={() => (detail.mobile = false)}>×</button>{/if}
    {#if !card}
        <p class="hint">カードにマウスを載せると詳しく表示します</p>
    {:else}
        {#if detail.pinned && !mobile}
            <div class="pin"><span><PinIcon /> 固定中</span><button type="button" onclick={unpinDetail}>固定を外す</button></div>
        {/if}
        {#key card.cardId}
            {#if art && artFailed !== art}
                <img class="art" src={art} alt={card.name} onerror={() => (artFailed = art)} />
            {/if}
        {/key}
        <CardText {card} />
        <div class="adjust">
            <AdjustButtons {card} />
            <span class="n">採用 {deckCards.get(card.cardId) ?? 0} 枚</span>
        </div>
    {/if}
</div>

<style>
    .col { height: 100%; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
    .col > :global(*) { flex-shrink: 0; }
    .col.mobile { padding-top: 44px; background: #1a1d2b; position: relative; }
    .close { position: absolute; top: 6px; right: 8px; width: 36px; height: 36px; font-size: 20px; padding: 0; }
    .hint { color: #889; font-size: 13px; }
    .pin { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: #8fa8ff; }
    .pin button { font-size: 12px; padding: 2px 8px; }
    .art { width: 100%; max-width: 260px; align-self: center; height: auto; aspect-ratio: 675 / 985; border-radius: 8px; background: #0003; }
    .adjust { display: flex; align-items: center; gap: 10px; }
    .n { color: #8fa8ff; font-weight: bold; }
</style>
