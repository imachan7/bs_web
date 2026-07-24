// smoke パート39（オフェンシブオーラ BS01-116：アタック中の自分スピリット全体バフ）
// 「アタックしている自分のスピリットすべてをBP+2000」を bpBuff の attackingAll で表現し、
// 対象選択なしでアタッカーへ適用する（誤って別スピリットを targetInstanceId 指定しても無視）。
import {
    assert,
    createGame,
    createInstance,
    resolveAction,
} from "./helpers"

console.log("=== オフェンシブオーラ: アタック中の自分スピリットへ選択なしで適用（誤指定targetは無視）===")
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
    // 誤って bystander を targetInstanceId 指定してもアタッカーに乗る（attackingAll は選択を無視する）
    resolveAction(
        s,
        "p1",
        null,
        { type: "bpBuff", amount: 2000, attackingAll: true },
        bystander.instanceId,
        "red",
        "magic",
    )
    assert(attacker.tempBpBuff === 2000, "アタッカーにBP+2000が乗る")
    assert(bystander.tempBpBuff === 0, "アタックしていない自分スピリットには乗らない（誤指定targetは無視）")
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
    resolveAction(
        s,
        "p1",
        null,
        { type: "bpBuff", amount: 2000, attackingAll: true },
        undefined,
        "red",
        "magic",
    )
    assert(idle.tempBpBuff === 0, "アタック中でなければ誰にも乗らない")
}
