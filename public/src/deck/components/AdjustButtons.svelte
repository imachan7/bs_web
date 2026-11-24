<script lang="ts">
    import type { CardData } from "../../../../server/src/type"
    import { addBlockReason, addCard, deckCards, removeCard } from "../state/deck.svelte"

    import { detail } from "../state/detail.svelte"

    // detailBtn: スマホで詳細を画面いっぱいに開くボタン（PC は詳細カラムがあるので出さない）
    let { card, detailBtn = false }: { card: CardData; detailBtn?: boolean } = $props()
    const count = $derived(deckCards.get(card.cardId) ?? 0)
    const blocked = $derived(addBlockReason(card))
</script>

<!-- 親のタップ（開閉）と、外側タップで閉じる処理に伝えない -->
<span class="adjust" role="group" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <button type="button" disabled={count === 0} onclick={() => removeCard(card.cardId)} aria-label="1枚減らす">−</button>
    <button type="button" disabled={blocked !== null} title={blocked ?? ""} onclick={() => addCard(card)} aria-label="1枚増やす">＋</button>
    {#if detailBtn}<button type="button" class="detail" onclick={() => { detail.cardId = card.cardId; detail.mobile = true }}>詳細</button>{/if}
</span>

<style>
    .adjust { display: inline-flex; gap: 6px; }
    button { width: 34px; height: 34px; padding: 0; font-size: 18px; line-height: 1; text-shadow: none; }
    button.detail { width: auto; padding: 0 10px; font-size: 13px; }
    @media (min-width: 900px) { button.detail { display: none; } }
    button:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
