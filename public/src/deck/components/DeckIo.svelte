<script lang="ts">
    import { cardOf, deck, deckCards, nameLimit, replaceDeck } from "../state/deck.svelte"
    import { showToast } from "../state/toast.svelte"
    import { validateImport } from "../logic/deckImport"

    let errors = $state<string[]>([])
    let warnings = $state<string[]>([])
    let failure = $state("")

    function exportDeck() {
        if (deckCards.size === 0) return showToast("デッキが空です")
        const name = deck.name.trim() || "無題のデッキ"
        const blob = new Blob([JSON.stringify({ name, cards: Object.fromEntries(deckCards) }, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${name}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    async function importFile(e: Event) {
        const input = e.currentTarget as HTMLInputElement
        const file = input.files?.[0]
        input.value = "" // 同じファイルを再選択できるようにする
        errors = []
        warnings = []
        failure = ""
        if (!file) return
        let parsed: unknown
        try {
            parsed = JSON.parse(await file.text())
        } catch {
            failure = "読み込み失敗: JSONとして解析できませんでした"
            return
        }
        const r = validateImport(parsed, cardOf, nameLimit)
        if (r.errors.length > 0) {
            errors = r.errors
            return
        }
        replaceDeck(r.cards, r.name)
        warnings = r.warnings
        showToast(`「${r.name}」をインポートしました`)
    }
</script>

<section>
    <h2>書き出し・読み込み</h2>
    <div class="row">
        <button type="button" onclick={exportDeck}>JSONを書き出す</button>
        <label class="btn">JSONを読み込む<input type="file" accept=".json,application/json" onchange={importFile} /></label>
    </div>
    {#if failure || errors.length > 0 || warnings.length > 0}
        <div class="result">
            {#if failure}<div class="error">{failure}</div>{/if}
            {#if errors.length > 0}
                <div class="error head">読み込みを中止しました。以下の問題があります:</div>
                {#each errors as m}<div class="error">{m}</div>{/each}
            {/if}
            {#each warnings as m}<div class="warning">{m}</div>{/each}
        </div>
    {/if}
</section>

<style>
    section { flex-shrink: 0; }
    h2 { margin: 4px 0; font-size: 14px; color: #ffd968; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
    .btn { padding: 6px 12px; border-radius: 6px; background: #4a6cd4; color: #fff; cursor: pointer; font-size: 13px; }
    .btn:hover { background: #5d7de0; }
    .btn input { display: none; }
    .result { font-size: 12px; background: #14161f; border-radius: 8px; padding: 8px; margin-bottom: 6px; }
    .error { color: #ff8888; }
    .head { font-weight: bold; margin-bottom: 4px; }
    .warning { color: #ffd968; }
</style>
