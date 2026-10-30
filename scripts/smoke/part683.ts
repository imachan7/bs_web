// smoke パート683（「一切の効果で防げない」＝EffectAttempt.pierce:"all"。BS45-X01【龍射撃】相当。Q7409・Q7415、EFFECT_GATE §2.5）
import { assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resistanceAgainst } from "../../server/src/logic/EffectModules"
import type { EffectAttempt } from "../../shared/rules"
import { loadAllCards } from "../../data/loadCards"

interface CardRow { cardId: string; type?: string; effects?: Record<string, unknown>[] }
const CARDS = loadAllCards() as unknown as CardRow[]
const findByEffect = (pred: (e: Record<string, unknown>) => boolean): CardRow => {
    const found = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).some(pred))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}
const lv1 = (e: Record<string, unknown>) => (((e["levels"] as number[] | null) ?? [1])[0] === 1)
const ARMORED = findByEffect((e) => e["kind"] === "keyword" && e["keyword"] === "armor" && ((e["colors"] as string[] | undefined) ?? []).includes("red") && lv1(e))
const FULL_IMMUNE = findByEffect((e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "immuneToOpponentEffects" && lv1(e))
const UNTARGETABLE = findByEffect((e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "untargetableByOpponent")

function put(seed: string, cardId: string): { s: GameState; t: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    const t = createInstance(cardId, s.turn, 3)
    s.players.p2.field.spirits.push(t)
    refreshLevelAsOverrides(s)
    return { s, t }
}
const attempt = (scope: EffectAttempt["scope"], pierce: boolean): EffectAttempt => ({
    op: "destroy", scope, actorPid: "p1", sourceType: "spirit", sourceColors: ["red"], ...(pierce ? { pierce: "all" as const } : {}),
})
const pid: PlayerId = "p2"

console.log("=== 1. 【装甲】も「相手の効果を受けない」も、一切の効果で防げない破壊は防がない ===")
for (const card of [ARMORED, FULL_IMMUNE]) {
    const { s, t } = put(`pierce-${card.cardId}`, card.cardId)
    assert(resistanceAgainst(s, pid, t, attempt("targeted", false)) !== null, `${card.cardId}：ふだんは防ぐ`)
    assert(resistanceAgainst(s, pid, t, attempt("targeted", true)) === null, `${card.cardId}：一切の効果で防げないなら通る`)
}

console.log("=== 2. このターン相手の効果を受けない（付与）も防がない ===")
{
    const { s, t } = put("pierce-timed", CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!.cardId)
    t.immuneToOpponentThisTurn = true
    assert(resistanceAgainst(s, pid, t, attempt("targeted", false)) !== null, "ふだんは防ぐ")
    assert(resistanceAgainst(s, pid, t, attempt("targeted", true)) === null, "一切の効果で防げないなら通る")
}

console.log("=== 3. 「対象にならない」は防ぐ効果ではないので、貫通しても対象には取れない（「すべて」も止まる＝Q1679） ===")
{
    const { s, t } = put("pierce-untargetable", UNTARGETABLE.cardId)
    assert(resistanceAgainst(s, pid, t, attempt("targeted", true))?.category === "untargetable", "対象指定は止まる")
    assert(resistanceAgainst(s, pid, t, attempt("area", true))?.category === "untargetable", "「すべて」も止まる")
}

console.log("すべてのチェックに合格しました 🎉（part683）")
