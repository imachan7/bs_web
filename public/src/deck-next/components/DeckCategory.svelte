<script lang="ts">
    import type { CardData, CardType } from "../../../../server/src/type"
    import { CARD_TYPE_LABELS } from "../../../../data/constants"
    import { artEpoch } from "../state/artEpoch.svelte"
    import PoolTile from "./PoolTile.svelte"

    let { type, cards, total }: { type: CardType; cards: CardData[]; total: number } = $props()
    // デッキ欄は狭いので絵は常に md
</script>

<section>
    <h3>{CARD_TYPE_LABELS[type]}　{total}枚</h3>
    <div class="grid">
        {#key artEpoch.n}
            {#each cards as card (card.cardId)}
                <PoolTile {card} size="md" area="deck" />
            {/each}
        {/key}
    </div>
</section>

<style>
    section { flex-shrink: 0; }
    h3 { margin: 0 0 6px; font-size: 13px; color: #aab; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); grid-auto-rows: max-content; gap: 6px; }
</style>
