<script lang="ts">
    import { cardStore } from "../state/cards.svelte"
    import { tip, hideTip } from "../state/hoverTip.svelte"
    import CardText from "./CardText.svelte"

    const W = 320
    const card = $derived(tip.cardId ? cardStore.cards.find((c) => c.cardId === tip.cardId) : undefined)
    let h = $state(0)

    // 右に置けるなら右、はみ出すなら左、それも無理なら一覧の左端。上端はカードに揃え、下にはみ出させない
    const pos = $derived.by(() => {
        let left = tip.right + 8
        if (left + W > window.innerWidth - 8) left = tip.left - W - 8
        if (left < 8) left = Math.max(8, Math.min(tip.listLeft, window.innerWidth - W - 8))
        const top = Math.max(8, Math.min(tip.top, window.innerHeight - 8 - h))
        return { left, top }
    })

    // scroll は伝播しないので capture で受ける。スクロールで下のカードが入れ替わっても pointerleave は飛ばない
    $effect(() => {
        window.addEventListener("scroll", hideTip, { capture: true, passive: true })
        return () => window.removeEventListener("scroll", hideTip, { capture: true })
    })
</script>

{#if card}
    <div class="tip" style:left="{pos.left}px" style:top="{pos.top}px" bind:clientHeight={h}>
        <CardText {card} />
    </div>
{/if}

<style>
    .tip { position: fixed; z-index: 30; width: 320px; max-height: calc(100vh - 16px); overflow: hidden; box-sizing: border-box; padding: 10px; background: #1f2230; border: 1px solid #555; border-radius: 8px; box-shadow: 0 8px 28px #000a; pointer-events: none; }
</style>
