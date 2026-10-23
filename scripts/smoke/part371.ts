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
    effectTaxForPid: "p2",
    cantUseMagicForPid: "p2",
    noBurstEffectForPid: "p2",
    noDeckMillForPid: "p1",
    skipMainStep: "p2",
    handCostSetForPid: "both",
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

console.log("=== 1. 移したカードデータ15か所が、正しい制約を正しいプレイヤーに積む ===")
{
    const entries = collect()
    // BS10-073 エンジェドールは期間つき効果の unblockable へ移した（part385）。レッドウォール・ヒノキ・ゴレム・コンドラッド・サテライド・バード・秘密の花園を足した
    assert(entries.length === 25, `playerRule は25か所（BS18 の 054・059・060・078・X06 で+5）（実際: ${entries.length}）`)
    for (const { cardId, action } of entries) {
        // 雷神砲カノン・アームズは直前に破棄したカードの色を読むので、単独で解決しても何も置かない（part281・part426）
        // アブラカダブラは召喚時効果を発揮したスピリットの色（バーストの発動イベント）を読むので、単独では置かない（part622）
        // サンダーストームは相手の手札が6枚以上の間だけ、アザートゥースはブロック前のフラッシュの間だけ効くので、単独の解決では見えない（part658・part661）
        if (cardId === "BS11-060" || cardId === "BS17-083" || cardId === "BS18-078" || cardId === "BS18-X06") continue
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
