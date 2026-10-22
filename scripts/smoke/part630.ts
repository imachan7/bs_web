// smoke パート630（コストつき起動能力の「ことで」後半の対象判定：相手の耐性を見る・「その後」で続く文も見る）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { activatedActionResolvable } from "../../shared/rules"

const ARCHER = "BS16-006" // アーチャー・ドラゴン（Lv2-3フラッシュ：自分のコア2個をトラッシュに置くことで、BP4000以下の相手のスピリット1体を破壊）
const RATA = "BS03-037" // ラタトスカ（【装甲：赤】BP1000）
const VANILLA = "BS01-002" // ロクケラトプス（BP1000）
for (const [id, name] of [[ARCHER, "アーチャー・ドラゴン"], [RATA, "ラタトスカ"], [VANILLA, "ロクケラトプス"]] as const) {
    assert(getCard(id).name === name, `${id} は ${name}`)
}
const EFFECT_ID = getCard(ARCHER).effects.find((e) => e.kind === "activated")!.id

function game(seed: string, enemy: string): { s: GameState; archer: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    const archer = createInstance(ARCHER, s.turn, 5)
    s.players.p1.field.spirits.push(archer)
    const e = createInstance(enemy, s.turn, 1)
    e.isRested = true // ブロックさせない
    s.players.p2.field.spirits.push(e)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "attack", instanceId: archer.instanceId }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    return { s, archer }
}

console.log("=== 【装甲：赤】の相手しかいなければ起動できない ===")
{
    const { s, archer } = game("archer-armor", RATA)
    assert(act(s, "p1", { type: "activateAbility", instanceId: archer.instanceId, effectId: EFFECT_ID }) !== null, "起動できない")
    assert(archer.cores === 5, "コストも払われない")
    assert(s.players.p2.field.spirits.length === 1, "ラタトスカは残る")
}
{
    const { s, archer } = game("archer-ok", VANILLA)
    assert(act(s, "p1", { type: "activateAbility", instanceId: archer.instanceId, effectId: EFFECT_ID }) === null, "耐性のない相手がいれば起動できる")
    assert(s.players.p2.field.spirits.length === 0, "破壊される")
}

console.log("=== 「その後」で続く破壊も見る ===")
{
    const { s, archer } = game("archer-seq", RATA)
    const destroy = getCard(ARCHER).effects.find((e) => e.kind === "activated")!
    if (destroy.kind !== "activated") throw new Error("前提")
    assert(!activatedActionResolvable(s, "p1", archer, { type: "sequence", actions: [{ type: "draw", count: 1 }, destroy.action] }), "後ろの破壊の対象がいなければ解決できない")
    s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    assert(activatedActionResolvable(s, "p1", archer, { type: "sequence", actions: [{ type: "draw", count: 1 }, destroy.action] }), "対象がいれば解決できる")
}

console.log("すべてのチェックに合格しました 🎉（part630）")
