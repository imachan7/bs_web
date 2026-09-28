// smoke パート431（R5：「ブロックされなかったものとして扱う」を treatAsUnblocked の1つにした。BS15-045 はカードデータのまま）
import { act, assert, createGame, createInstance, declareBlock, getCard, hasKeyword, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SPHINX = "BS15-045" // 虚獣帝スフィン・クロス
const SEIMEI = "BS15-041" // 天使リユイエル（【聖命】）
const BLOCKER = "BS15-037" // クダギツネン

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SPHINX).name === "虚獣帝スフィン・クロス", "SPHINXは虚獣帝スフィン・クロス")
    assert(getCard(SEIMEI).name === "天使リユイエル" && hasKeyword(SEIMEI, "seimei"), "SEIMEIは【聖命】を持つ天使リユイエル")
    assert(getCard(BLOCKER).name === "クダギツネン", "BLOCKERはクダギツネン")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== スフィン・クロス：【聖命】を持つ別のスピリットがブロックされても、そのスピリットのコアを払って通せる ===")
{
    const s = game("p431-seimei")
    const sphinx = put(s, "p1", SPHINX, 8)
    const seimei = put(s, "p1", SEIMEI, 3)
    const blocker = put(s, "p2", BLOCKER, 1)
    refreshLevelAsOverrides(s)
    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: seimei.instanceId }) === null, "リユイエルでアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(seimei.cores === 2, `アタックしているスピリットのコアが1個ボイドへ（${seimei.cores}）`)
    assert(sphinx.cores === 8, "スフィン・クロス自身のコアは減らない")
    while (s.isFlashTiming && s.battle) assert(act(s, s.priorityPlayer, { type: "pass" }) === null, "フラッシュをパス")
    assert(s.players.p2.life === lifeBefore - 1, "ブロックされずライフに通る")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === blocker.instanceId), "ブロッカーは破壊されない")
}

console.log("=== treatAsUnblocked の when：条件を満たさなければ普通に BP を比べる ===")
{
    const s = game("p431-when")
    const attacker = put(s, "p1", SEIMEI, 1) // Lv1
    const blocker = put(s, "p2", SPHINX, 8) // Lv2 以上
    refreshLevelAsOverrides(s)
    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    resolveAction(s, "p1", null, { type: "treatAsUnblocked", when: "levelAtLeastBlocker" })
    assert((s.battle?.treatAsUnblocked ?? []).join() === "levelAtLeastBlocker", "印が立つ")
    while (s.isFlashTiming && s.battle) assert(act(s, s.priorityPlayer, { type: "pass" }) === null, "フラッシュをパス")
    assert(s.players.p2.life === lifeBefore, "Lvが低いのでライフは減らない")
}

console.log("すべてのチェックに合格しました 🎉（part431）")
