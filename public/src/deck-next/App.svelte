<script lang="ts">
    import { loadCards } from "./state/cards.svelte"
    import Pool from "./components/Pool.svelte"

    loadCards()
</script>

<div class="layout">
    <div class="pool"><Pool /></div>
    <aside class="detail"></aside>
    <aside class="deck"></aside>
</div>

<style>
    .layout {
        display: grid;
        grid-template-columns: 1fr 290px 420px;
        max-width: 1760px;
        height: 100vh;
        margin: 0 auto;
    }
    .pool, .detail, .deck { min-height: 0; overflow: hidden; }
    .detail, .deck { border-left: 1px solid #333; }
    /* デッキ欄への切替バーは S2。それまでスマホはプールだけ */
    @media (max-width: 899px) {
        .layout { display: block; }
        .pool { height: 100vh; }
        .detail, .deck { display: none; }
    }
</style>
