<script lang="ts">
    import { loadCards } from "./state/cards.svelte"
    import { selection } from "./state/selection.svelte"
    import Pool from "./components/Pool.svelte"
    import DeckPane from "./components/DeckPane.svelte"
    import MobileBar from "./components/MobileBar.svelte"
    import Toast from "./components/Toast.svelte"

    loadCards()
    // スマホでだけ意味を持つ。PC ではどちらの値でも3カラムが全部出る
    let showDeck = $state(false)
</script>

<!-- タイルの外をタップしたら − ＋ を閉じる（タイル側は伝播を止めている） -->
<svelte:window onclick={() => (selection.key = "")} />

<div class="layout" class:show-deck={showDeck}>
    <div class="pool">
        <div class="poolbody"><Pool /></div>
        <div class="mbar"><MobileBar onopen={() => (showDeck = true)} /></div>
    </div>
    <aside class="detail"></aside>
    <aside class="deck"><DeckPane onclose={() => (showDeck = false)} /></aside>
</div>
<Toast />

<style>
    .layout {
        display: grid;
        grid-template-columns: 1fr 290px 420px;
        max-width: 1760px;
        height: 100vh;
        margin: 0 auto;
    }
    .pool { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
    .poolbody { flex: 1; min-height: 0; }
    .mbar { display: none; }
    .detail, .deck { min-height: 0; overflow: hidden; border-left: 1px solid #333; }
    @media (max-width: 899px) {
        .layout { display: block; height: 100dvh; }
        .pool, .deck { height: 100dvh; }
        .mbar { display: block; }
        .detail { display: none; }
        .layout:not(.show-deck) .deck { display: none; }
        .layout.show-deck .pool { display: none; }
        .deck { border-left: none; }
    }
</style>
