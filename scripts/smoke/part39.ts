// smoke パート39（オフェンシブオーラ BS01-116：アタック中の自分スピリット全体バフ）
// 2026-07-31: 継続化バッチでカードデータを lendSelfThisTurn + kind:"aura"（attackingOnly）へ移行した
// （part76参照）。ここでは実カード（BS01-116）を lendSelfThisTurn 経由で発火させ、
// 「アタックしている自分のスピリットにのみ動的に乗る」ことを effectiveBp で確認する
// （旧実装の tempBpBuff 直書き＋対象selectionではなく、常時BP修正として評価される）
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveBp,
    resolveAction,
} from "./helpers"

console.log("=== オフェンシブオーラ: アタックしている自分スピリットにのみ乗る（アタックしていない味方には乗らない）===")
{
    const s = createGame(
        "offensive-aura-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    s.turnPlayer = "p1"
    s.phase = "attack"
    const attacker = createInstance("BS01-001", s.turn, 1) // アタックしている自分スピリット
    const bystander = createInstance("BS01-002", s.turn, 1) // アタックしていない自分スピリット
    s.players.p1.field.spirits.push(attacker, bystander)
    s.battle = {
        attackerInstanceId: attacker.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined, ["red"], "magic", undefined, undefined, "BS01-116")
    assert(
        effectiveBp(s, "p1", attacker) === currentLevel(attacker).bp + 2000,
        "アタッカーにBP+2000が乗る",
    )
    assert(
        effectiveBp(s, "p1", bystander) === currentLevel(bystander).bp,
        "アタックしていない自分スピリットには乗らない",
    )
}

console.log("=== オフェンシブオーラ: アタックしている自分スピリットがいなければ不発 ===")
{
    const s = createGame(
        "offensive-aura-noatk-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    s.turnPlayer = "p1"
    s.phase = "attack"
    const idle = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(idle)
    // battle なし（アタック中でない）
    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined, ["red"], "magic", undefined, undefined, "BS01-116")
    assert(effectiveBp(s, "p1", idle) === currentLevel(idle).bp, "アタック中でなければ誰にも乗らない")
}
