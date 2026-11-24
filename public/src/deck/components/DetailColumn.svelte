<script lang="ts">
    import PinIcon from "./PinIcon.svelte"
    import { cardImageUrl } from "../../cardArt"
    import { cardStore } from "../state/cards.svelte"
    import CardText from "./CardText.svelte"
    import { deckCards } from "../state/deck.svelte"
    import { detail, unpinDetail } from "../state/detail.svelte"
    import AdjustButtons from "./AdjustButtons.svelte"

    // mobile: 画面いっぱいの欄として出す。絵はスマホでも lg（押したときの1枚だけなので重くない。2026-11-24 ユーザー）
    let { mobile = false }: { mobile?: boolean } = $props()

    const card = $derived(cardStore.cards.find((c) => c.cardId === detail.cardId))
    const art = $derived(card ? cardImageUrl(card.cardId, "lg") : null)
    let artFailed = $state("")
</script>

<!-- スマホは片手で閉じられるよう、× を右上に置かず、下の「閉じる」とボタン以外のタップで閉じる（2026-11-24 ユーザー） -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="col" class:mobile onclick={(e) => {
    if (mobile && !(e.target as HTMLElement).closest("button")) detail.mobile = false
}}>
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
    {#if mobile}<button type="button" class="closebar" onclick={() => (detail.mobile = false)}>閉じる</button>{/if}
</div>

<style>
    .col { height: 100%; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
    .col > :global(*) { flex-shrink: 0; }
    .col.mobile { background: #1a1d2b; position: relative; }
    .closebar { position: sticky; bottom: 0; margin-top: auto; width: 100%; height: 52px; font-size: 16px; font-weight: bold; border-radius: 10px; box-shadow: 0 -4px 12px #000a; }
    .col.mobile .adjust :global(button) { width: 44px; height: 44px; font-size: 22px; }
    .hint { color: #889; font-size: 13px; }
    .pin { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: #8fa8ff; }
    .pin button { font-size: 12px; padding: 2px 8px; }
    .art { width: 100%; max-width: 260px; align-self: center; height: auto; aspect-ratio: 675 / 985; border-radius: 8px; background: #0003; }
    .adjust { display: flex; align-items: center; gap: 10px; }
    .n { color: #8fa8ff; font-weight: bold; }
</style>
