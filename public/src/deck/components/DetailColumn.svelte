<script lang="ts">
    import { COLOR_LABELS, CARD_TYPE_LABELS } from "../../../../data/constants"
    import { cardImageUrl } from "../../cardArt"
    import { effectLineSegments } from "../../effectText"
    import { braveBpGain, braveConditionText, maxBp } from "../logic/cardInfo"
    import { cardStore } from "../state/cards.svelte"
    import { deckCards } from "../state/deck.svelte"
    import { detail, unpinDetail } from "../state/detail.svelte"
    import AdjustButtons from "./AdjustButtons.svelte"

    // mobile: 画面いっぱいの欄として出す（絵は軽い md、閉じる × つき）
    let { mobile = false }: { mobile?: boolean } = $props()

    const card = $derived(cardStore.cards.find((c) => c.cardId === detail.cardId))
    const note = $derived(card ? cardStore.notes[card.cardId] : undefined)
    const NOTE_LABELS = { unimplemented: "未実装", partial: "一部未実装", simplified: "簡略化" }
    const art = $derived(card ? cardImageUrl(card.cardId, mobile ? "md" : "lg") : null)
    let artFailed = $state("")

    const reductionText = $derived.by(() => {
        if (!card || card.reduction.length === 0) return "軽減0"
        const counts = new Map<string, number>()
        for (const c of card.reduction) counts.set(c, (counts.get(c) ?? 0) + 1)
        return `軽減: ${[...counts].map(([c, n]) => `${COLOR_LABELS[c as keyof typeof COLOR_LABELS]}${n}`).join("・")}`
    })
    const lines = $derived.by(() => {
        if (!card) return []
        const bp = maxBp(card)
        const gain = braveBpGain(card)
        const out = [
            `${card.colors.map((c) => COLOR_LABELS[c]).join("・")} / ${CARD_TYPE_LABELS[card.type]} / コスト${card.cost}（${reductionText}） / シンボル${card.symbol?.length ?? 0}`,
        ]
        if (card.family.length > 0) out.push(`系統: ${card.family.join("・")}`)
        if (bp !== null && card.type !== "nexus") out.push(`BP${bp}`)
        if (gain !== null) out.push(`合体時BP+${gain}`)
        if (card.braveCondition) out.push(`合体条件: ${braveConditionText(card.braveCondition)}`)
        if (card.rarity !== "") out.push(`レアリティ: ${card.rarity}`)
        if (card.limited) out.push("【禁止カード】デッキに入れられません")
        return out
    })
    const levelText = $derived.by(() => {
        if (!card || card.levels.length === 0) return ""
        if (card.type === "spirit" || card.type === "brave") return card.levels.map((lv) => `Lv${lv.level}(コア${lv.cores}) BP${lv.bp}`).join(" / ")
        if (card.type === "nexus") return card.levels.map((lv) => `Lv${lv.level}(維持コア${lv.cores})`).join(" / ")
        return ""
    })
    const braveLevelText = $derived(
        card?.type === "brave" && card.braveLevels?.length ? `合体状態: ${card.braveLevels.map((lv) => `BP+${lv.bp}`).join(" / ")}` : "",
    )
</script>

<div class="col" class:mobile>
    {#if mobile}<button type="button" class="close" aria-label="閉じる" onclick={() => (detail.mobile = false)}>×</button>{/if}
    {#if !card}
        <p class="hint">カードにマウスを載せると詳しく表示します</p>
    {:else}
        {#if detail.pinned && !mobile}
            <div class="pin"><span>固定中</span><button type="button" onclick={unpinDetail}>固定を外す</button></div>
        {/if}
        {#key card.cardId}
            {#if art && artFailed !== art}
                <img class="art" src={art} alt={card.name} onerror={() => (artFailed = art)} />
            {/if}
        {/key}
        <div class="title">
            <span>{card.name}（{card.cardId}）</span>
        </div>
        <div class="meta">{lines.join("　")}</div>
        {#if levelText}<div class="meta">{levelText}</div>{/if}
        {#if braveLevelText}<div class="meta">{braveLevelText}</div>{/if}
        <div class="effect">
            {#if card.effect === ""}（効果なし）{:else}{#each effectLineSegments(card.effect) as segs, i}{#if i > 0}{"\n"}{/if}{#each segs as s}{#if s.note}<span
                                class="effect-note"
                                title="補足：バースト効果の召喚・配置はコストを支払わない（カードには書かれていない）">{s.text}</span
                            >{:else}{s.text}{/if}{/each}{/each}{/if}
        </div>
        {#if note}<div class="note {note.status}">【{NOTE_LABELS[note.status]}】 {note.note}</div>{/if}
        <div class="adjust">
            <AdjustButtons {card} />
            <span class="n">採用 {deckCards.get(card.cardId) ?? 0} 枚</span>
        </div>
    {/if}
</div>

<style>
    .col { height: 100%; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
    .col > :global(*) { flex-shrink: 0; }
    .col.mobile { padding-top: 44px; background: #1a1d2b; position: relative; }
    .close { position: absolute; top: 6px; right: 8px; width: 36px; height: 36px; font-size: 20px; padding: 0; }
    .hint { color: #889; font-size: 13px; }
    .pin { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: #8fa8ff; }
    .pin button { font-size: 12px; padding: 2px 8px; }
    .art { width: 100%; max-width: 260px; align-self: center; height: auto; aspect-ratio: 675 / 985; border-radius: 8px; background: #0003; }
    .title { display: flex; align-items: center; gap: 6px; font-weight: bold; flex-wrap: wrap; }
    .meta { font-size: 12px; color: #aab; }
    .effect { white-space: pre-wrap; font-size: 12px; line-height: 1.75; background: #26282e; border: 1px solid #33363d; border-radius: 8px; padding: 9px 10px; color: #ddd; }
    .effect-note { color: #8fd3ff; text-decoration: underline dotted; cursor: help; }
    .note { font-size: 12px; padding: 6px 8px; border-radius: 6px; }
    .note.unimplemented { background: #d44a4a33; border: 1px solid #d44a4a; }
    .note.partial { background: #d48a4a33; border: 1px solid #d48a4a; }
    .note.simplified { background: #d4c44a33; border: 1px solid #d4c44a; }
    .adjust { display: flex; align-items: center; gap: 10px; }
    .n { color: #8fa8ff; font-weight: bold; }
</style>
