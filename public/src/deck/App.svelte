<script lang="ts">
    import { cardStore, loadCards } from "./state/cards.svelte"
    import { selection } from "./state/selection.svelte"
    import Pool from "./components/Pool.svelte"
    import DeckPane from "./components/DeckPane.svelte"
    import MobileBar from "./components/MobileBar.svelte"
    import DetailColumn from "./components/DetailColumn.svelte"
    import { detail } from "./state/detail.svelte"
    import Toast from "./components/Toast.svelte"

    loadCards()
    // 収録範囲の表示。手で書くと弾を足すたびにずれるのでカードデータから出す
    $effect(() => {
        const note = document.getElementById("topbar-note")
        if (!note || !cardStore.loaded) return
        const sets = cardStore.cards.map((c) => c.cardId.split("-")[0] ?? "").filter((s) => s.startsWith("BS")).sort()
        const first = sets[0]
        const last = sets[sets.length - 1]
        note.textContent = first && last ? `${first}〜${last}（全${cardStore.cards.length}枚）` : `全${cardStore.cards.length}枚`
    })
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
    <aside class="detail"><DetailColumn /></aside>
    <aside class="deck"><DeckPane onclose={() => (showDeck = false)} /></aside>
</div>
{#if detail.mobile}<div class="full"><DetailColumn mobile /></div>{/if}
<Toast />

<style>
    .layout {
        display: grid;
        grid-template-columns: 1fr 290px 420px;
        max-width: 1760px;
        height: 100%;
        margin: 0 auto;
    }
    .pool { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
    .poolbody { flex: 1; min-height: 0; }
    .mbar { display: none; }
    .detail, .deck { min-height: 0; overflow: hidden; border-left: 1px solid #333; }
    .full { display: none; }
    @media (max-width: 899px) {
        .full { display: block; position: fixed; inset: 0; z-index: 10; }
        .layout { display: block; }
        .pool, .deck { height: 100%; }
        .mbar { display: block; }
        .detail { display: none; }
        .layout:not(.show-deck) .deck { display: none; }
        .layout.show-deck .pool { display: none; }
        .deck { border-left: none; }
    }
</style>
