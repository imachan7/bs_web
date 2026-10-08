// smoke パート490（セイ・ドリガン「このステップの最初に可能ならば必ずアタックする」。2026-10-08 ユーザー確認：
// 義務がある間は他のスピリットでアタックできず、最初のアタック宣言で（誰が宣言しても）消える）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const SEI = "BS08-035" // 獣機合神セイ・ドリガン
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SEI).name === "獣機合神セイ・ドリガン", "SEIは獣機合神セイ・ドリガン")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
}
const seiAction = (getCard(SEI).effects.find((e) => e.id === "BS08-035-e2") as unknown as { action: EffectAction }).action

function setup(): { s: GameState; a: ReturnType<typeof createInstance>; b: ReturnType<typeof createInstance> } {
    const s = createGame("sei-drigan", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    const a = createInstance(VANILLA, s.turn, 1)
    const b = createInstance(VANILLA, s.turn, 1)
    const sei = createInstance(SEI, s.turn, 1)
    s.players.p1.field.spirits.push(a, b)
    s.players.p2.field.spirits.push(sei)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    // ステップ開始時の効果を、相手（p2）のセイ・ドリガンが a を指定して解決した状態を作る
    resolveAction(s, "p2", sei, seiAction, a.instanceId)
    assert(s.timedEffects.some((r) => r.until === "firstAttack"), "前提：a に「最初にアタック」の義務が掛かった")
    return { s, a, b }
}

console.log("=== 1. 義務がある間は、ほかのスピリットでアタックできない ===")
{
    const { s, a, b } = setup()
    assert(act(s, "p1", { type: "attack", instanceId: b.instanceId }) !== null, "b ではアタックできない")
    assert(act(s, "p1", { type: "attack", instanceId: a.instanceId }) === null, "a ではアタックできる")
    assert(!s.timedEffects.some((r) => r.until === "firstAttack"), "最初のアタック宣言で義務が消える")
}

console.log("=== 2. 指定されたスピリットがアタックできなければ、ほかのスピリットでアタックでき、義務は消える ===")
{
    const { s, a, b } = setup()
    a.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: b.instanceId }) === null, "a が疲労しているので b でアタックできる")
    assert(!s.timedEffects.some((r) => r.until === "firstAttack"), "b のアタック宣言で義務が消える")
    a.isRested = false
    assert(act(s, "p2", { type: "pass" }) === null && act(s, "p1", { type: "pass" }) === null, "フラッシュを閉じる")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受ける")
    assert(s.battle === null, "バトルが終わった")
    assert(act(s, "p1", { type: "endTurn" }) === null, "あとで a が回復しても、アタックせずにターンを終えられる")
}

console.log("すべてのチェックに合格しました 🎉（part490）")
