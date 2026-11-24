<script lang="ts">
    import { saved, saveCurrentDeck, loadSaved, deleteSaved, duplicateSaved, renameSaved } from "../state/savedDecks.svelte"
    import { deckCards, replaceDeck } from "../state/deck.svelte"
    import { recipes, loadRecipes } from "../state/recipes.svelte"
    import { DECK_MIN_SIZE } from "../../../../data/constants"

    loadRecipes()

    function clear() {
        if (deckCards.size === 0) return
        if (confirm("編集中のデッキを空にしますか？")) deckCards.clear()
    }

    function loadRecipe(e: Event) {
        const select = e.currentTarget as HTMLSelectElement
        const recipe = recipes.list.find((r) => r.key === select.value)
        select.value = ""
        if (!recipe) return
        if (deckCards.size > 0 && !confirm("編集中のデッキを破棄して構築済みデッキを読み込みますか？")) return
        replaceDeck(recipe.cards, recipe.label.replace(/（構築済み\d+枚）$/, ""))
    }

    function total(cards: Record<string, number>): number {
        return Object.values(cards).reduce((s, n) => s + n, 0)
    }
</script>

<section>
    <h2>保存・読み込み</h2>
    <div class="row">
        <button type="button" onclick={saveCurrentDeck}>ブラウザに保存</button>
        <button type="button" onclick={clear}>デッキを空にする</button>
    </div>
    <div class="list">
        {#each saved.list as d (d.name)}
            {@const n = total(d.cards)}
            <div class="saved">
                <span class="info">
                    {d.name}
                    <span class="badge" class:valid={n >= DECK_MIN_SIZE}>{n}枚</span>
                    {d.updatedAt ? new Date(d.updatedAt).toLocaleString("ja-JP") : ""}
                </span>
                <button type="button" onclick={() => loadSaved(d.name)}>読込</button>
                <button type="button" onclick={() => duplicateSaved(d)}>複製</button>
                <button
                    type="button"
                    onclick={() => renameSaved(d.name, prompt("新しいデッキ名を入力してください", d.name)?.trim() ?? "")}>名前</button>
                <button type="button" class="danger" onclick={() => confirm(`「${d.name}」を削除しますか？`) && deleteSaved(d.name)}>削除</button>
            </div>
        {:else}
            <p class="empty">保存済みデッキはありません</p>
        {/each}
    </div>
    {#if recipes.list.length > 0}
        <div class="row">
            <span class="label">構築済み</span>
            <select value="" onchange={loadRecipe} aria-label="構築済みデッキ">
                <option value="">選んで読み込む</option>
                {#each recipes.list as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
            </select>
        </div>
    {/if}
</section>

<style>
    section { flex-shrink: 0; }
    h2 { margin: 4px 0; font-size: 14px; color: #ffd968; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
    .row select { flex: 1; min-width: 0; }
    .label { font-size: 12px; color: #b8bdd4; }
    .list { background: #14161f; border-radius: 8px; padding: 6px; margin-bottom: 6px; max-height: 140px; overflow-y: auto; }
    .saved { display: flex; align-items: center; gap: 6px; padding: 3px 4px; font-size: 12px; }
    .info { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .saved button { padding: 3px 8px; font-size: 11px; }
    .danger { background: #d44a4a; }
    .danger:hover { background: #e05d5d; }
    .badge { padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: bold; margin: 0 4px; background: #ffd968; color: #1a1d2b; }
    .badge.valid { background: #2f7a3a; color: #fff; }
    .empty { margin: 8px; font-size: 12px; color: #6a7090; }
</style>
