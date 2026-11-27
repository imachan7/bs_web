<script lang="ts">
    import type { CardData } from "../../../../server/src/type"
    import { COLOR_LABELS, CARD_TYPE_LABELS } from "../../../../data/constants"
    import { effectLineSegments } from "../../effectText"
    import { braveBpGain, braveConditionText, maxBp } from "../logic/cardInfo"
    import { cardStore } from "../state/cards.svelte"

    // 詳細カラムとホバーの欄の共通部分（絵とボタンは含まない）
    let { card }: { card: CardData } = $props()

    const note = $derived(cardStore.notes[card.cardId])
    const NOTE_LABELS = { unimplemented: "未実装", partial: "一部未実装", simplified: "簡略化" }

    const reductionText = $derived.by(() => {
        if (card.reduction.length === 0) return "軽減0"
        const counts = new Map<string, number>()
        for (const c of card.reduction) counts.set(c, (counts.get(c) ?? 0) + 1)
        return `軽減: ${[...counts].map(([c, n]) => `${c === "ultimate" ? "極" : COLOR_LABELS[c as keyof typeof COLOR_LABELS]}${n}`).join("・")}`
    })
    const lines = $derived.by(() => {
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
        if (card.levels.length === 0) return ""
        if (card.type === "spirit" || card.type === "brave") return card.levels.map((lv) => `Lv${lv.level}(コア${lv.cores}) BP${lv.bp}`).join(" / ")
        if (card.type === "nexus") return card.levels.map((lv) => `Lv${lv.level}(維持コア${lv.cores})`).join(" / ")
        return ""
    })
    const braveLevelText = $derived(
        card.type === "brave" && card.braveLevels?.length ? `合体状態: ${card.braveLevels.map((lv) => `BP+${lv.bp}`).join(" / ")}` : "",
    )
</script>

<div class="text">
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
</div>

<style>
    .text { display: flex; flex-direction: column; gap: 8px; }
    .title { display: flex; align-items: center; gap: 6px; font-weight: bold; flex-wrap: wrap; }
    .meta { font-size: 12px; color: #aab; }
    .effect { white-space: pre-wrap; font-size: 12px; line-height: 1.75; background: #26282e; border: 1px solid #33363d; border-radius: 8px; padding: 9px 10px; color: #ddd; }
    .effect-note { color: #8fd3ff; text-decoration: underline dotted; cursor: help; }
    .note { font-size: 12px; padding: 6px 8px; border-radius: 6px; }
    .note.unimplemented { background: #d44a4a33; border: 1px solid #d44a4a; }
    .note.partial { background: #d48a4a33; border: 1px solid #d48a4a; }
    .note.simplified { background: #d4c44a33; border: 1px solid #d4c44a; }
</style>
