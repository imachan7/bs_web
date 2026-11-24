<script lang="ts">
    import type { Snippet } from "svelte"
    import { SvelteSet } from "svelte/reactivity"
    import type { Keyword } from "../../../../server/src/type"
    import { KEYWORDS } from "../../../../shared/rules"
    import { cardStore, type NoteStatus } from "../state/cards.svelte"
    import {
        COST_CHIP_MAX, filters, filterColors, filterTypes, filterCosts, filterFlags,
        filterSeries, filterKeywords, filterFamilies, filterNotes,
    } from "../state/filters.svelte"
    import { MERGED_SERIES_LABELS, seriesGroupOf, seriesLabel } from "../logic/series"
    import { FAMILY_GROUPS, familyColors } from "../logic/families"
    import FoldPicker, { type PickerGroup } from "./FoldPicker.svelte"

    let { count, children }: { count: number; children?: Snippet } = $props()

    // 詳しい条件のウィンドウ。中の操作は下書き（draft*）で、「適用」で初めて filters.svelte.ts へ反映する
    let open = $state(false)
    let pos = $state({ top: 0, left: 0 })
    let anchor: HTMLButtonElement
    const draftFlags = new SvelteSet<string>()
    const draftNotes = new SvelteSet<NoteStatus>()
    const draftSeries = new SvelteSet<string>()
    const draftKeywords = new SvelteSet<string>()
    const draftFamilies = new SvelteSet<string>()
    let draftHas = $state(true)
    let draftMention = $state(false)
    const PAIRS = [
        [filterFlags, draftFlags], [filterNotes, draftNotes], [filterSeries, draftSeries],
        [filterKeywords, draftKeywords], [filterFamilies, draftFamilies],
    ] as [SvelteSet<string>, SvelteSet<string>][]
    const detailCount = $derived(filterFlags.size + filterNotes.size + filterSeries.size + filterKeywords.size + filterFamilies.size)

    function openPanel() {
        for (const [real, draft] of PAIRS) {
            draft.clear()
            for (const v of real) draft.add(v)
        }
        draftHas = filters.familyHas
        draftMention = filters.familyMention
        const r = anchor.getBoundingClientRect()
        pos = { top: r.bottom + 6, left: Math.max(8, Math.min(r.right - 520, window.innerWidth - 528)) }
        open = true
    }
    function apply() {
        for (const [real, draft] of PAIRS) {
            real.clear()
            for (const v of draft) real.add(v)
        }
        filters.familyHas = draftHas
        filters.familyMention = draftMention
        open = false
    }
    function clearDraft() {
        for (const [, draft] of PAIRS) draft.clear()
        draftHas = true
        draftMention = false
    }

    const COLORS = [["red", "赤"], ["purple", "紫"], ["green", "緑"], ["white", "白"], ["yellow", "黄"], ["blue", "青"]] as const
    const TYPES = [["spirit", "スピリット"], ["nexus", "ネクサス"], ["magic", "マジック"], ["brave", "ブレイヴ"]] as const
    const COSTS = Array.from({ length: COST_CHIP_MAX + 1 }, (_, i) => i)
    const FLAGS = [["burst", "バーストあり"], ["flash", "フラッシュマジック"]] as const
    const NOTES = [["unimplemented", "未実装"], ["partial", "一部未実装"], ["simplified", "簡略化"]] as const

    function flip<T>(set: SvelteSet<T>, v: T) {
        if (set.has(v)) set.delete(v)
        else set.add(v)
    }

    // 選択肢は読み込み後に1回だけ作る
    const options = $derived.by(() => {
        const series = new Set<string>()
        const keywords = new Set<string>()
        const families = new Set<string>()
        for (const card of cardStore.cards) {
            series.add(seriesGroupOf(card.cardId))
            for (const e of card.effects) if (e.kind === "keyword") keywords.add(e.keyword)
            for (const f of card.family) families.add(f)
        }
        for (const set of cardStore.mentionedFamilies.values()) for (const f of set) families.add(f)
        const sItem = (v: string) => ({ value: v, text: MERGED_SERIES_LABELS[v] ?? (seriesLabel(v) === "" ? v : `${v} ${seriesLabel(v)}`) })
        const all = Array.from(series).sort()
        const seriesGroups: PickerGroup[] = [
            { heading: "ブースター", items: all.filter((v) => v.startsWith("BS") && !v.startsWith("BSC")).map(sItem) },
            { heading: "スターター", items: all.filter((v) => v.startsWith("SD")).map(sItem) },
            { heading: "コレクション", items: all.filter((v) => v.startsWith("BSC")).map(sItem) },
            { heading: "プロモ・その他", items: all.filter((v) => !v.startsWith("BS") && !v.startsWith("SD")).map(sItem) },
        ]
        const keywordGroups: PickerGroup[] = [
            { heading: null, items: Array.from(keywords).sort().map((kw) => ({ value: kw, text: KEYWORDS[kw as Keyword]?.label ?? kw })) },
        ]
        const color = familyColors(cardStore.cards, families)
        const familyGroups: PickerGroup[] = FAMILY_GROUPS.map(([key, label]) => ({
            heading: label,
            items: Array.from(families)
                .filter((f) => color.get(f) === key)
                .sort((a, b) => a.localeCompare(b, "ja"))
                .map((f) => ({ value: f, text: f, cls: key === "multi" ? undefined : `chip-${key}` })),
        }))
        return { seriesGroups, keywordGroups, familyGroups }
    })

    function reset() {
        for (const s of [filterColors, filterTypes, filterCosts, filterFlags, filterSeries, filterKeywords, filterFamilies, filterNotes]) s.clear()
        filters.familyHas = true
        filters.familyMention = false
        filters.search = ""
        filters.sort = "id"
    }
</script>

<div class="filters">
    <div class="row">
        <input type="search" placeholder="名前・効果文で検索" bind:value={filters.search} />
        <div class="item">
            <span class="label">色</span>
            <div class="chips">
                {#each COLORS as [c, text] (c)}
                    <button type="button" class="chip chip-{c}" class:active={filterColors.has(c)} onclick={() => flip(filterColors, c)}>{text}</button>
                {/each}
            </div>
        </div>
        <div class="item">
            <span class="label">タイプ</span>
            <div class="chips">
                {#each TYPES as [t, text] (t)}
                    <button type="button" class="chip" class:active={filterTypes.has(t)} onclick={() => flip(filterTypes, t)}>{text}</button>
                {/each}
            </div>
        </div>
        <div class="item">
            <span class="label">コスト</span>
            <div class="chips">
                {#each COSTS as n (n)}
                    <button type="button" class="chip" class:active={filterCosts.has(n)} onclick={() => flip(filterCosts, n)}>{n === COST_CHIP_MAX ? `${n}以上` : n}</button>
                {/each}
            </div>
        </div>
    </div>
    <div class="row tools">
        <select bind:value={filters.sort} aria-label="並び順">
            <option value="id">ID順</option>
            <option value="cost-asc">コスト昇順</option>
            <option value="cost-desc">コスト降順</option>
        </select>
        {@render children?.()}
        <button type="button" class="ghost" onclick={reset}>条件クリア</button>
        <span class="count">{count} / {cardStore.cards.length} 枚を表示中</span>
        <button type="button" class="detailbtn" class:used={detailCount > 0} aria-expanded={open} bind:this={anchor} onclick={() => (open ? (open = false) : openPanel())}>
            絞り込み{detailCount > 0 ? `（${detailCount}）` : ""}
        </button>
    </div>
</div>

{#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={() => (open = false)}></div>
    <div class="win" role="dialog" aria-label="絞り込み" style:--top="{pos.top}px" style:--left="{pos.left}px">
        <div class="winhead"><b>詳しい絞り込み</b><button type="button" class="ghost" aria-label="閉じる" onclick={() => (open = false)}>×</button></div>
        <div class="winbody">
            <section class="sec">
                <h3>特徴</h3>
                <div class="chips">
                    {#each FLAGS as [f, text] (f)}
                        <button type="button" class="chip" class:active={draftFlags.has(f)} onclick={() => flip(draftFlags, f)}>{text}</button>
                    {/each}
                </div>
            </section>
            <section class="sec">
                <h3>注意</h3>
                <div class="chips">
                    {#each NOTES as [n, text] (n)}
                        <button type="button" class="chip" class:active={draftNotes.has(n)} onclick={() => flip(draftNotes, n)}>{text}</button>
                    {/each}
                </div>
            </section>
            <FoldPicker label="弾" selected={draftSeries} groups={options.seriesGroups} />
            <FoldPicker label="キーワード" selected={draftKeywords} groups={options.keywordGroups} />
            <FoldPicker label="系統" selected={draftFamilies} groups={options.familyGroups}>
                {#snippet extra()}
                    <div class="chips">
                        <button type="button" class="chip" class:active={draftHas} onclick={() => (draftHas = !draftHas)}>系統を持つ</button>
                        <button type="button" class="chip" class:active={draftMention} onclick={() => (draftMention = !draftMention)}>効果で扱う</button>
                    </div>
                {/snippet}
            </FoldPicker>
        </div>
        <div class="winfoot">
            <button type="button" class="ghost" onclick={clearDraft}>クリア</button>
            <span class="sp"></span>
            <button type="button" class="ghost" onclick={() => (open = false)}>キャンセル</button>
            <button type="button" class="apply" onclick={apply}>適用</button>
        </div>
    </div>
{/if}

<style>
    .filters { display: flex; flex-direction: column; gap: 8px; padding: 8px 10px; background: #242838; border-radius: 10px; flex-shrink: 0; }
    .rows { display: flex; flex-direction: column; gap: 6px; }
    .row { display: flex; align-items: center; gap: 6px 20px; flex-wrap: wrap; }
    .item { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; min-width: 0; }
    .label { flex: none; white-space: nowrap; font-size: 12px; color: #b8bdd4; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip { background: #2c3044; color: #cdd2e8; border: 1px solid #555; padding: 4px 10px; font-size: 12px; }
    .chip:hover { background: #3a4059; }
    .chip.active { background: #4a6cd4; border-color: #7fa0ff; color: #fff; }
    .chip.active.chip-red { background: #a43a32; border-color: #d4564a; }
    .chip.active.chip-purple { background: #6e34a0; border-color: #9a4ad4; }
    .chip.active.chip-green { background: #2f7a3a; border-color: #4ad45e; }
    .chip.active.chip-white { background: #8a8fa8; border-color: #d8dcef; color: #1a1d2b; }
    .chip.active.chip-yellow { background: #b09a2a; border-color: #e8cf4a; color: #1a1d2b; }
    .chip.active.chip-blue { background: #2f4aa0; border-color: #4a6cd4; }
    .row input { flex: 1 1 160px; min-width: 0; }
    .ghost { background: transparent; border: 1px solid #555; color: #cdd2e8; }
    .ghost:hover { background: #2c3044; }
    .count { margin-left: auto; white-space: nowrap; font-size: 12px; color: #b8bdd4; }
    .detailbtn { background: #2c3044; border: 1px solid #7fa0ff; color: #cdd2e8; }
    .detailbtn.used { background: #4a6cd4; color: #fff; }
    .backdrop { position: fixed; inset: 0; z-index: 20; }
    .win { position: fixed; z-index: 21; top: var(--top); left: var(--left); width: 520px; max-height: min(70vh, calc(100vh - var(--top) - 8px)); display: flex; flex-direction: column; background: #1f2230; border: 1px solid #555; border-radius: 10px; box-shadow: 0 8px 28px #000a; }
    .winhead { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #3a3d44; }
    .winbody { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
    .winbody > :global(.sec:first-child) { border-top: 0; }
    .sec { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid #3a3d44; }
    h3 { margin: 0; font-size: 13px; color: #e8e8f0; }
    .winfoot { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-top: 1px solid #3a3d44; }
    .sp { flex: 1; }
    .apply { background: #4a6cd4; border: 1px solid #7fa0ff; color: #fff; padding: 4px 18px; }
    @media (max-width: 899px) {
        .win { inset: 0; width: auto; max-height: none; border-radius: 0; border: 0; }
        .row { gap: 8px 14px; }
    }
</style>
