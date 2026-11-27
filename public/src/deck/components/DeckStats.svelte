<script lang="ts">
    import type { Snippet } from "svelte"
    import type { CardType, Color } from "../../../../server/src/type"
    import { CARD_TYPE_LABELS, COLOR_LABELS } from "../../../../data/constants"
    import type { DeckStats } from "../logic/deckStats"

    // children: コスト・色・タイプの下（系統トップ5の上）に差し込む種類別のカード一覧
    let { stats, children }: { stats: DeckStats; children?: Snippet } = $props()
    let detail = $state(false)

    const peak = $derived(Math.max(1, ...stats.byCost))
    const COLORS: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
    const TYPE_BG: Record<CardType, string> = { spirit: "#4a6cd4", brave: "#d4824a", nexus: "#4ab08a", magic: "#a86ad4", ultimate: "#d4b04a" }

    const colorBg = (colors: Color[]) =>
        colors.length === 1 ? `var(--c-${colors[0]})` : `linear-gradient(90deg, ${colors.map((c) => `var(--c-${c})`).join(", ")})`
    const pct = (n: number) => (stats.total === 0 ? 0 : Math.round((n / stats.total) * 100))
</script>

{#snippet bar(segs: { label: string; count: number; bg: string }[])}
    <div class="stack">
        {#each segs as s}<span style:flex={s.count} style:background={s.bg}></span>{/each}
    </div>
    <ul class="legend">
        {#each segs as s}
            <li><i style:background={s.bg}></i>{s.label} {s.count}枚（{pct(s.count)}%）</li>
        {/each}
    </ul>
{/snippet}

<div class="stats">
    <div class="chips">
        <span class="chip">種類 <b>{stats.kinds}</b></span>
        <span class="chip">平均コスト <b>{stats.avgCost.toFixed(1)}</b></span>
    </div>

    <h4>コストカーブ</h4>
    <div class="curve">
        {#each stats.byCost as n}
            <div class="col">
                <div class="bar" class:peak={n > 0 && n === peak} style:height="{n === 0 ? 0 : Math.max((n / peak) * 100, 3)}%">{#if n > 0}<span>{n}</span>{/if}</div>
            </div>
        {/each}
    </div>
    <div class="labels">{#each stats.byCost as _, cost}<div>{cost}</div>{/each}</div>

    {#if stats.total > 0}
        <h4>色の内訳</h4>
        {@render bar(stats.byColor.map((c) => ({ label: c.colors.map((x) => COLOR_LABELS[x]).join("・"), count: c.count, bg: colorBg(c.colors) })))}
        <h4>タイプ内訳</h4>
        {@render bar(stats.byType.map((t) => ({ label: CARD_TYPE_LABELS[t.type], count: t.count, bg: TYPE_BG[t.type] })))}
    {/if}
</div>

{@render children?.()}

<div class="stats">
    {#if stats.total > 0}
        <h4>系統トップ5</h4>
        <div class="chips">
            {#each stats.families as f}<span class="chip">{f.name} <b>{f.count}</b></span>{/each}
        </div>
    {/if}

    <button type="button" class="toggle" onclick={() => (detail = !detail)}>詳細（シンボル供給・軽減） {detail ? "△" : "▽"}</button>
    {#if detail}
        <h4>シンボル供給（軽減に使える色）</h4>
        <div class="syms">
            {#each COLORS as c}{#if stats.symbols[c]}<span class="chip"><i style:background="var(--c-{c})"></i>{COLOR_LABELS[c]} {stats.symbols[c]}</span>{/if}{/each}
            {#if stats.symbols.ultimate}<span class="chip"><i style:background="#888"></i>極 {stats.symbols.ultimate}</span>{/if}
            {#if COLORS.every((c) => !stats.symbols[c]) && !stats.symbols.ultimate}<span class="none">－</span>{/if}
        </div>
        <h4>軽減シンボル</h4>
        <div class="syms">
            {#each COLORS as c}{#if stats.reduction[c]}<span class="chip"><i style:background="var(--c-{c})"></i>{COLOR_LABELS[c]} {stats.reduction[c]}</span>{/if}{/each}
            {#if stats.reduction.ultimate}<span class="chip"><i style:background="#888"></i>極 {stats.reduction.ultimate}</span>{/if}
            {#if COLORS.every((c) => !stats.reduction[c]) && !stats.reduction.ultimate}<span class="none">軽減なし</span>{/if}
        </div>
    {/if}
</div>

<style>
    /* 縦に並べる欄は縮めない（flex の子が潰れて重なる不具合の再発防止） */
    .stats { flex-shrink: 0; }
    h4 { margin: 10px 0 6px; font-size: 12px; color: #aaa; font-weight: normal; }
    .chips, .syms { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 5px 9px; border-radius: 8px; background: #26282e; border: 1px solid #3a3d44; font-size: 11px; color: #bbb; }
    .chip b { font-size: 13px; color: #fff; }
    .none { font-size: 12px; color: #888; }
    i { display: inline-block; width: 10px; height: 10px; border-radius: 99px; flex-shrink: 0; }
    .curve { display: flex; align-items: flex-end; gap: 3px; height: 64px; padding-top: 16px; box-sizing: content-box; }
    .col { flex: 1; height: 100%; display: flex; align-items: flex-end; background: #232529; border-radius: 4px; min-width: 0; }
    .bar { width: 100%; background: linear-gradient(180deg, #6ea8ff, #3e7bdb); border-radius: 4px 4px 0 0; position: relative; }
    .bar.peak { background: linear-gradient(180deg, #ffe066, #ffd23e); }
    .bar span { position: absolute; top: -16px; left: 0; right: 0; text-align: center; font-size: 10px; font-weight: bold; color: #eee; }
    .labels { display: flex; gap: 3px; font-size: 10px; color: #888; }
    .labels div { flex: 1; text-align: center; }
    .stack { display: flex; height: 14px; border-radius: 99px; overflow: hidden; background: #2c2e34; }
    .stack span { min-width: 2px; height: 100%; }
    .legend { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 2px 14px; font-size: 12px; line-height: 1.9; }
    .legend li { display: inline-flex; align-items: center; gap: 5px; }
    .toggle { display: flex; justify-content: space-between; margin-top: 12px; width: 100%; background: transparent; border: 0; border-top: 1px solid #33363d; border-radius: 0; padding: 10px 2px; font-size: 12px; font-weight: bold; color: #ccc; }
</style>
