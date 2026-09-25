// smoke パート371（プレイヤーに掛かる「このターンの間」の制約：timedEffect の内容 playerRule。移したカードデータを直接解決する）
import { assert, createGame, getCard, resolveAction, playerHas } from "./helpers"
import type { EffectAction, PlayerId } from "../../server/src/type"
import { ALL_CARDS } from "../../server/src/logic/GameState"

// 制約の type → p1 が使ったときに効くプレイヤー（旧 type と同じ）
const EXPECTED: Record<string, PlayerId | "both"> = {
    lifeDamageMaxForPid: "p1",
    lifeFloorForPid: "p1",
    lifeImmuneForPid: "p1",
    cantUseHandCardsForPid: "p2",
    nexusEffectsDisabledForPid: "p2",
    freeFushiSummonForPid: "p1",
    bounceToDeckTopForPid: "p1",
    ignoreUnblockableForPid: "p1",
    handReductionColorAsForPid: "p1",
    noLifeDamageByCostForPid: "p1",
    noBurstSpiritSummonForPid: "both",
}

function collect(): { cardId: string; action: Extract<EffectAction, { type: "timedEffect" }> }[] {
    const out: { cardId: string; action: Extract<EffectAction, { type: "timedEffect" }> }[] = []
    const walk = (o: unknown, cardId: string): void => {
        if (Array.isArray(o)) return o.forEach((x) => walk(x, cardId))
        if (!o || typeof o !== "object") return
        const r = o as Record<string, unknown>
        if (r.type === "timedEffect" && (r.content as { type: string }[]).some((c) => c.type === "playerRule")) {
            out.push({ cardId, action: r as unknown as Extract<EffectAction, { type: "timedEffect" }> })
        }
        Object.values(r).forEach((v) => walk(v, cardId))
    }
    for (const c of ALL_CARDS) walk(c.effects, c.cardId)
    return out
}

console.log("=== 1. 移したカードデータ14か所が、正しい制約を正しいプレイヤーに積む ===")
{
    const entries = collect()
    // BS10-073 エンジェドールは期間つき効果の unblockable へ移した（part385）。レッドウォール・ヒノキ・ゴレム・コンドラッド・サテライド・バードを足した
    assert(entries.length === 14, `playerRule は14か所（実際: ${entries.length}）`)
    for (const { cardId, action } of entries) {
        const s = createGame("p371", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
        resolveAction(s, "p1", null, action)
        const rule = (action.content[0] as { rule: { type: string } }).rule
        const placed = (["p1", "p2"] as PlayerId[]).filter((pid) => playerHas(s, pid, rule.type))
        // 【装甲】を働かなくするのは、アーマーパージ（SD01-040）が自分、ジャンビ・オレピス（BS11-049）が相手
        const want = rule.type === "armorDisabledForPid" ? (cardId === "SD01-040" ? "p1" : "p2") : EXPECTED[rule.type]
        const ok = want === "both" ? placed.length === 2 : placed.length === 1 && placed[0] === want
        assert(ok, `${cardId} ${getCard(cardId).name}：${rule.type} が ${want} に積まれる`)
    }
}

console.log("=== 2. side:\"both\" は両方のプレイヤーに積む ===")
{
    const s = createGame("p371b", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "lifeImmuneForPid" } }], duration: "turn", side: "both" })
    const pids = (["p1", "p2"] as PlayerId[]).filter((pid) => playerHas(s, pid, "lifeImmuneForPid"))
    assert(JSON.stringify(pids) === JSON.stringify(["p1", "p2"]), "p1 と p2 の両方に積まれる")
}

console.log("すべてのチェックに合格しました 🎉（part371）")
