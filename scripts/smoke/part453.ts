// smoke パート453（fieldEvent の destroySelf／exhaustSelf が、相手のスピリットに効くとき「自分の効果」として扱われる）
// BS13-006 炎獣ファイオリック（BP4000以下の相手がアタックしたとき、そのスピリットを破壊する）／BS11-064 闇の聖剣（相手のスピリットが合体したとき、その合体スピリットは疲労する）。
// 解釈の確認：2026-09-30 ユーザー（相手スピリットに対するフィールド効果も自分の効果として扱い、【装甲】で防がれる）
import { assert, createGame, createInstance, fireFieldEventTriggers, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { instColors } from "../../server/src/logic/EffectModules"

const FIORIC = "BS13-006" // 炎獣ファイオリック（赤）
const SWORD = "BS11-064" // 闇の聖剣（ネクサス）
const ARMORED = "BS02-040" // ロブスターク（【装甲：赤】Lv1・BP1000）
const VANILLA = "BS01-001" // ゴラドン（バニラ・BP1000）
const ARMORED_PURPLE = "BS04-034" // ヴィゾフニル（【装甲：紫】Lv1・BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(FIORIC).name === "炎獣ファイオリック" && getCard(FIORIC).type === "spirit", "FIORICは炎獣ファイオリック")
    assert(getCard(SWORD).name === "闇の聖剣" && getCard(SWORD).type === "nexus", "SWORDは闇の聖剣")
    assert(getCard(ARMORED).name === "ロブスターク", "ARMOREDはロブスターク")
    assert(getCard(VANILLA).name === "ゴラドン", "VANILLAはゴラドン")
    assert(getCard(ARMORED_PURPLE).name === "ヴィゾフニル", "ARMORED_PURPLEはヴィゾフニル")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}
const gone = (s: GameState, inst: { instanceId: string }): boolean =>
    !s.players.p2.field.spirits.some((x) => x.instanceId === inst.instanceId) || s.players.p2.field.spirits.find((x) => x.instanceId === inst.instanceId)?.pendingDestruction === true

console.log("=== 1. BS13-006：装甲のない相手のアタッカーは破壊される ===")
{
    const s = game("fioric-plain")
    const me = createInstance(FIORIC, s.turn, 1)
    const enemy = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(me)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p2", inst: enemy }, instColors(enemy))
    assert(gone(s, enemy), "BP4000以下の相手のアタッカーが破壊された")
}

console.log("=== 2. BS13-006：【装甲：赤】の相手のアタッカーは、赤の効果では破壊されない ===")
{
    const s = game("fioric-armor")
    const me = createInstance(FIORIC, s.turn, 1)
    const enemy = createInstance(ARMORED, s.turn, 1)
    s.players.p1.field.spirits.push(me)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p2", inst: enemy }, instColors(enemy))
    assert(!gone(s, enemy), "装甲で破壊されなかった")
}

console.log("=== 3. BS13-006：自分のアタッカーには誘発しない ===")
{
    const s = game("fioric-own")
    const me = createInstance(FIORIC, s.turn, 1)
    const mine = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(me, mine)
    refreshLevelAsOverrides(s)
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p1", inst: mine }, instColors(mine))
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === mine.instanceId && !x.pendingDestruction), "自分のスピリットは破壊されない")
}

console.log("=== 4. BS11-064：合体した相手のスピリットは疲労する ===")
{
    const s = game("sword-plain")
    const sword = createInstance(SWORD, s.turn, 1)
    const enemy = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.nexuses.push(sword)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    fireFieldEventTriggers(s, "p1", "anySpiritCombined", { pid: "p2", inst: enemy })
    assert(enemy.isRested === true, "合体した相手のスピリットが疲労した")
}

console.log("=== 5. BS11-064：【装甲：紫】の相手のスピリットは、紫の効果では疲労しない ===")
{
    const s = game("sword-armor")
    const sword = createInstance(SWORD, s.turn, 1)
    const enemy = createInstance(ARMORED_PURPLE, s.turn, 1)
    s.players.p1.field.nexuses.push(sword)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    fireFieldEventTriggers(s, "p1", "anySpiritCombined", { pid: "p2", inst: enemy })
    assert(enemy.isRested === false, "装甲で疲労しなかった")
}

console.log("すべてのチェックに合格しました 🎉（part453）")
