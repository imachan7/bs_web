<script lang="ts">
    import type { CardType, Color } from "../../../../server/src/type"
    import { CARD_TYPE_LABELS, COLOR_LABELS } from "../../../../data/constants"
    import type { DeckStats } from "../logic/deckStats"

    let { stats }: { stats: DeckStats } = $props()
    let detail = $state(false)

    const peak = $derived(Math.max(1, ...stats.byCost))
    const COLORS: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
    const TYPE_BG: Record<CardType, string> = { spirit: "#4a6cd4", brave: "#d4824a", nexus: "#4ab08a", magic: "#a86ad4" }

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
        {#each stats.byCost as n, cost}
            <div class="col">
                <span class="num">{n || ""}</span>
                <div class="track"><div class="bar" class:peak={n > 0 && n === peak} style:height="{(n / peak) * 100}%"></div></div>
                <span class="lbl">{cost}</span>
            </div>
        {/each}
    </div>

    {#if stats.total > 0}
        <h4>色</h4>
        {@render bar(stats.byColor.map((c) => ({ label: c.colors.map((x) => COLOR_LABELS[x]).join("・"), count: c.count, bg: colorBg(c.colors) })))}
        <h4>タイプ</h4>
        {@render bar(stats.byType.map((t) => ({ label: CARD_TYPE_LABELS[t.type], count: t.count, bg: TYPE_BG[t.type] })))}
        <h4>系統トップ5</h4>
        <ol class="fam">
            {#each stats.families as f}<li>{f.name} <b>{f.count}</b></li>{/each}
        </ol>
    {/if}

    <button type="button" class="toggle" onclick={() => (detail = !detail)}>{detail ? "▲ 詳細を閉じる" : "▼ 詳細（シンボル）"}</button>
    {#if detail}
        <h4>シンボル供給</h4>
        <div class="syms">
            {#each COLORS as c}{#if stats.symbols[c]}<span class="chip"><i style:background="var(--c-{c})"></i>{COLOR_LABELS[c]} {stats.symbols[c]}</span>{/if}{/each}
        </div>
        <h4>軽減シンボル</h4>
        <div class="syms">
            {#each COLORS as c}{#if stats.reduction[c]}<span class="chip"><i style:background="var(--c-{c})"></i>{COLOR_LABELS[c]} {stats.reduction[c]}</span>{/if}{/each}
        </div>
    {/if}
</div>

<style>
    /* 縦に並べる欄は縮めない（flex の子が潰れて重なる不具合の再発防止） */
    .stats { flex-shrink: 0; padding: 8px; background: #20243a; border-radius: 8px; }
    h4 { margin: 10px 0 4px; font-size: 12px; color: #aab; }
    .chips, .syms { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; background: #2a2f45; font-size: 12px; }
    .chip b { font-size: 14px; }
    i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
    .curve { display: flex; align-items: stretch; gap: 3px; height: 64px; }
    .col { flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 0; }
    .num { font-size: 11px; height: 14px; }
    .bar { width: 100%; min-height: 0; border-radius: 3px 3px 0 0; background: linear-gradient(#6f8be8, #3a55a8); flex-shrink: 0; }
    .track { flex: 1; width: 100%; min-height: 0; display: flex; align-items: flex-end; }
    .bar.peak { background: linear-gradient(#ffd666, #d49a1a); }
    .lbl { font-size: 11px; color: #aab; height: 14px; }
    .stack { display: flex; height: 12px; border-radius: 6px; overflow: hidden; }
    .stack span { min-width: 2px; }
    .legend { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 12px; }
    .legend li { display: inline-flex; align-items: center; gap: 4px; }
    .fam { margin: 0; padding-left: 18px; font-size: 12px; }
    .toggle { display: block; margin-top: 10px; width: 100%; background: #2a2f45; }
</style>
