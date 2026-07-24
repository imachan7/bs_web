// smoke パート41（onBlock トリガーへの targetInstanceId 伝達修正と BS04-041 の検証）
// 修正: GameEngine doBlock の fireTrigger("onBlock") がアタッカーの instanceId を渡していなかったため、
// targetSameLevelAsSelf 等の対象条件つき onBlock 効果が一切発火しなかった
// 検証カード: BS04-041 フェンリルキャノンMk-II e2『ブロック時、同じLvのスピリットをブロックしたとき BP+3000』
import { assert, act, createGame, createInstance, runTurnStart } from "./helpers"

console.log("=== BS04-041 フェンリルキャノンMk-II: 同LvブロックでBP+3000（onBlock + targetSameLevelAsSelf） ===")
{
    const s = createGame(
        "bs04-041-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const attacker = createInstance("BS01-007", s.turn, 1) // ハンマドレイク Lv1 BP4000
    s.players.p1.field.spirits.push(attacker)
    const fenrir = createInstance("BS04-041", s.turn, 1) // フェンリルキャノンMk-II Lv1 BP3000
    s.players.p2.field.spirits.push(fenrir)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ハンマドレイクLv1でアタック")
    assert(act(s, "p2", { type: "block", instanceId: fenrir.instanceId }) === null, "フェンリルキャノンLv1でブロック（同Lv）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === fenrir.instanceId),
        "同Lvブロック: BP+3000で6000>4000となりフェンリルキャノンが生き残る",
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === attacker.instanceId),
        "同Lvブロック: アタッカーのハンマドレイクは破壊される",
    )
}

console.log("=== BS04-041: Lvが異なるブロックではBP+3000は発揮されない ===")
{
    const s = createGame(
        "bs04-041-test2",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const attacker = createInstance("BS01-007", s.turn, 2) // ハンマドレイク Lv2 BP5000
    s.players.p1.field.spirits.push(attacker)
    const fenrir = createInstance("BS04-041", s.turn, 1) // フェンリルキャノンMk-II Lv1 BP3000
    s.players.p2.field.spirits.push(fenrir)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ハンマドレイクLv2でアタック")
    assert(act(s, "p2", { type: "block", instanceId: fenrir.instanceId }) === null, "フェンリルキャノンLv1でブロック（Lv違い）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === fenrir.instanceId),
        "Lv違いブロック: バフなし3000<5000でフェンリルキャノンは破壊される",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === attacker.instanceId),
        "Lv違いブロック: アタッカーは生き残る",
    )
}

console.log("パート41 完了")
