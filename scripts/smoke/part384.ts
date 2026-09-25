// smoke パート384（期間つき効果の「ブロックされない」を一覧へ移した後の寿命。「ターンに1回」は指定された1体のアタックでだけ使い切る）
import { act, assert, createGame, createInstance, declareBlock, getCard, runTurnStart, takeLifeAndResolve, timedHas } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS04-081").name === "強者統べる大地", "BS04-081 は強者統べる大地")
    assert(getCard("BS01-025").levels[1]?.bp === 10000, "要塞龍ギガのLv2BPは10000")
    assert(getCard("BS01-001").name === "ゴラドン", "BS01-001 はゴラドン")
}

console.log("=== 強者統べる大地 Lv2：別のスピリットが先にアタックしても、指定された1体の印は残る ===")
{
    const s = createGame("p384", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-081", s.turn, 1)) // Lv2
    const giga = put(s, "p1", "BS01-025", 3) // BP10000
    const small = put(s, "p1", "BS01-001", 1)
    const blocker = put(s, "p2", "BS01-031", 4)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(timedHas(s, giga, "unblockable"), "ギガに印が付く")

    assert(act(s, "p1", { type: "attack", instanceId: small.instanceId }) === null, "先にゴラドンでアタック")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(timedHas(s, giga, "unblockable"), "ゴラドンのアタックが終わっても、ギガの印は残る")

    assert(act(s, "p1", { type: "attack", instanceId: giga.instanceId }) === null, "ギガでアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) !== null, "ギガはブロックされない")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(!timedHas(s, giga, "unblockable"), "ギガのアタックの終了で使い切る")
}

console.log("すべてのチェックに合格しました 🎉（part384）")
