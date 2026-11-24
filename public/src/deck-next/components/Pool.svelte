<script lang="ts">
    import { cardStore } from "../state/cards.svelte"
    import { filters, visibleCards } from "../state/filters.svelte"
    import PoolTile from "./PoolTile.svelte"
    import PoolRow from "./PoolRow.svelte"

    const PAGE = 200 // 全カードを一度に描かない
    // 一覧の絵は、広い画面では高画質（lg）、狭い画面では軽い md（通信量を増やさない。2026-11-24 ユーザー方針）
    const artSize: "lg" | "md" = matchMedia("(min-width: 900px)").matches ? "lg" : "md"

    let mode: "grid" | "list" = $state("grid")
    let limit = $state(PAGE)
    const visible = $derived(visibleCards())
    // 絞り込み・並び順が変わったら先頭の1ページに戻す
    $effect(() => {
        void visible
        limit = PAGE
    })
    const shown = $derived(visible.slice(0, limit))
</script>

<section class="pool">
    <div class="bar">
        <input type="search" placeholder="名前・効果文で検索" bind:value={filters.search} />
        <select bind:value={filters.sort} aria-label="並び順">
            <option value="id">ID順</option>
            <option value="cost-asc">コスト昇順</option>
            <option value="cost-desc">コスト降順</option>
        </select>
        <button type="button" onclick={() => (mode = mode === "grid" ? "list" : "grid")}>
            {mode === "grid" ? "リスト表示" : "グリッド表示"}
        </button>
        <span class="count">{visible.length} / {cardStore.cards.length} 枚を表示中</span>
    </div>

    {#if cardStore.error}
        <p>{cardStore.error}</p>
    {:else if !cardStore.loaded}
        <p>読み込み中</p>
    {:else}
        <div class="body {mode}">
            {#each shown as card (card.cardId)}
                {#if mode === "grid"}
                    <PoolTile {card} size={artSize} />
                {:else}
                    <PoolRow {card} />
                {/if}
            {/each}
            {#if visible.length > limit}
                <button type="button" class="more" onclick={() => (limit += PAGE)}>
                    もっと見る（残り{visible.length - limit}件）
                </button>
            {/if}
        </div>
    {/if}
</section>

<style>
    .pool { display: flex; flex-direction: column; min-height: 0; height: 100%; }
    .bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px; }
    .bar input { flex: 1; min-width: 140px; }
    .count { font-size: 12px; color: #aab; }
    .body { overflow-y: auto; padding: 8px; flex: 1; }
    /* タイルが overflow: hidden なので、行の高さを中身に固定しないと枠の高さに合わせて行が潰れ、タイルが重なる */
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); grid-auto-rows: max-content; gap: 8px; align-content: start; }
    .list { display: flex; flex-direction: column; gap: 3px; }
    .more { grid-column: 1 / -1; padding: 10px; }
</style>
