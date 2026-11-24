<script lang="ts">
    import { DECK_MIN_SIZE } from "../../../../data/constants"
    import { deckTotal } from "../state/deck.svelte"

    let { onopen }: { onopen: () => void } = $props()
    const total = $derived(deckTotal())
</script>

<!-- 高さ固定。デッキの量では伸びない -->
<div class="bar">
    <span class="n" class:ok={total >= DECK_MIN_SIZE}>{total} / {DECK_MIN_SIZE}</span>
    <progress max={DECK_MIN_SIZE} value={Math.min(total, DECK_MIN_SIZE)}></progress>
    <button type="button" onclick={onopen}>デッキを見る</button>
</div>

<style>
    .bar { height: 48px; flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 0 10px; background: #20243a; border-top: 1px solid #333; }
    .n { font-weight: bold; color: #e8a0a0; white-space: nowrap; }
    .n.ok { color: #6fd68a; }
    progress { flex: 1; min-width: 0; height: 8px; }
</style>
