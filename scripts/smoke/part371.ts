// smoke パート371（プレイヤーに掛かる「このターンの間」の制約：timedEffect の内容 playerRule。移したカードデータを直接解決する）
import { assert, createGame, getCard, resolveAction } from "./helpers"
import type { EffectAction, PlayerId } from "../../server/src/type"
import { ALL_CARDS } from "../../server/src/logic/GameState"

// 制約の type → p1 が使ったときに効くプレイヤー（旧 type と同じ）
const EXPECTED: Record<string, PlayerId> = {
    lifeDamageMaxForPid: "p1",
    lifeFloorForPid: "p1",
    lifeImmuneForPid: "p1",
    cantUseHandCardsForPid: "p2",
    nexusEffectsDisabledForPid: "p2",
    freeFushiSummonForPid: "p1",
    bounceToDeckTopForPid: "p1",
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

console.log("=== 1. 移したカードデータ10か所が、正しい制約を正しいプレイヤーに積む ===")
{
    const entries = collect()
    assert(entries.length === 10, `playerRule は10か所（実際: ${entries.length}）`)
    for (const { cardId, action } of entries) {
        const s = createGame("p371", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
        s.turnConstraints = []
        resolveAction(s, "p1", null, action)
        const rule = (action.content[0] as { rule: { type: string } }).rule
        const placed = s.turnConstraints.filter((c) => c.type === rule.type) as { pid?: PlayerId }[]
        // 【装甲】を働かなくするのは、アーマーパージ（SD01-040）が自分、ジャンビ・オレピス（BS11-049）が相手
        const want = rule.type === "armorDisabledForPid" ? (cardId === "SD01-040" ? "p1" : "p2") : EXPECTED[rule.type]
        assert(placed.length === 1 && placed[0]!.pid === want, `${cardId} ${getCard(cardId).name}：${rule.type} が ${want} に1つ積まれる`)
    }
}

console.log("=== 2. side:\"both\" は両方のプレイヤーに積む ===")
{
    const s = createGame("p371b", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    s.turnConstraints = []
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "lifeImmuneForPid" } }], duration: "turn", side: "both" })
    const pids = s.turnConstraints.map((c) => (c as { pid?: PlayerId }).pid).sort()
    assert(JSON.stringify(pids) === JSON.stringify(["p1", "p2"]), "p1 と p2 の両方に積まれる")
}

console.log("すべてのチェックに合格しました 🎉（part371）")
