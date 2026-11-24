<script lang="ts">
    import type { Snippet } from "svelte"
    import type { SvelteSet } from "svelte/reactivity"

    export interface PickerGroup {
        heading: string | null
        items: { value: string; text: string; cls?: string | undefined }[]
    }
    let { label, selected, groups, extra }: {
        label: string
        selected: SvelteSet<string>
        groups: PickerGroup[]
        extra?: Snippet
    } = $props()

    let open = $state(false)
    const texts = $derived(new Map(groups.flatMap((g) => g.items.map((i) => [i.value, i.text] as const))))
    const flip = (v: string) => (selected.has(v) ? selected.delete(v) : selected.add(v))
</script>

<div class="item">
    <span class="label">{label}</span>
    <button type="button" class="chip" aria-expanded={open} onclick={() => (open = !open)}>選ぶ {open ? "▾" : "▸"}</button>
    <div class="chips">
        {#each selected as v (v)}
            <button type="button" class="chip active" title="外す" onclick={() => flip(v)}>{texts.get(v) ?? v} ×</button>
        {/each}
    </div>
    {@render extra?.()}
</div>
{#if open}
    <div class="panel">
        {#each groups as g (g.heading)}
            {#if g.items.length > 0}
                {#if g.heading !== null}<div class="label">{g.heading}</div>{/if}
                <div class="chips">
                    {#each g.items as item (item.value)}
                        <button type="button" class="chip {item.cls ?? ''}" class:active={selected.has(item.value)} onclick={() => flip(item.value)}>{item.text}</button>
                    {/each}
                </div>
            {/if}
        {/each}
    </div>
{/if}

<style>
    .item { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; min-width: 0; }
    .label { flex: none; white-space: nowrap; font-size: 12px; color: #b8bdd4; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .panel { flex-basis: 100%; width: 100%; display: flex; flex-direction: column; gap: 4px; }
    .chip { background: #2c3044; color: #cdd2e8; border: 1px solid #555; padding: 4px 10px; font-size: 12px; }
    .chip:hover { background: #3a4059; }
    .chip.active { background: #4a6cd4; border-color: #7fa0ff; color: #fff; }
    .chip.active.chip-red { background: #a43a32; border-color: #d4564a; }
    .chip.active.chip-purple { background: #6e34a0; border-color: #9a4ad4; }
    .chip.active.chip-green { background: #2f7a3a; border-color: #4ad45e; }
    .chip.active.chip-white { background: #8a8fa8; border-color: #d8dcef; color: #1a1d2b; }
    .chip.active.chip-yellow { background: #b09a2a; border-color: #e8cf4a; color: #1a1d2b; }
    .chip.active.chip-blue { background: #2f4aa0; border-color: #4a6cd4; }
</style>
