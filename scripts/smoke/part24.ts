// smoke パート24（第三弾 BS03 青カード構造化バッチ）
// 収録セクション:
//   - BS03-074 戦闘獣ドーベン：アタック時、自身をBP+1000（selfBuff）
//   - BS03-077 強襲兵のノーマン：破壊時、手札の青ネクサス1枚をコスト無しで配置（deployNexus from:hand）
//   - BS03-094 偉大なる鍛冶師バギン：アタック時、Lv1は自分のネクサス数、Lv2は両者のネクサス数×1000で自身+BP（selfBuffPer）
//   - BS03-098 戦闘竜ワイヴァーン：Lv1はブロック不可（cantBlock）、Lv1･Lv2はLv1以下にブロックされない（unblockableBy levelFilter）
//   - BS03-142 サルベージ：メインで山札上5枚からネクサスを回収（deckReveal）、フラッシュでBP+3000
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    resolveAction,
    runTurnStart,
} from "./helpers"
import { fireTrigger } from "../../server/src/logic/EffectModules"

console.log("=== BS03-074 戦闘獣ドーベン：アタック時に自身がBP+1000 ===")
{
    const s = createGame(
        "bs03-074-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const doben = createInstance("BS03-074", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(doben)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: doben.instanceId }) === null, "ドーベンでアタック")
    assert(doben.tempBpBuff === 1000, "アタック時に自身がBP+1000される")
}

console.log("=== BS03-077 強襲兵のノーマン：破壊時に手札の青ネクサスを無償配置 ===")
{
    const s = createGame(
        "bs03-077-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const norman = createInstance("BS03-077", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(norman)
    s.players.p1.hand = ["BS03-113"] // 手札を青ネクサス1枚に固定（力奪う凱旋門）
    const nexusesBefore = s.players.p1.field.nexuses.length
    fireTrigger(s, "p1", norman, "onDestroy")
    assert(
        s.players.p1.field.nexuses.length === nexusesBefore + 1,
        "破壊時の効果で手札の青ネクサスがコストを支払わず場に出る",
    )
    assert(!s.players.p1.hand.includes("BS03-113"), "配置したネクサスは手札から取り除かれる")
}

console.log("=== BS03-094 偉大なる鍛冶師バギン：アタック時にネクサス数ぶんBP+ ===")
{
    const s = createGame(
        "bs03-094-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const bagin = createInstance("BS03-094", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(bagin)
    s.players.p1.field.nexuses.push(createInstance("BS03-113", s.turn, 0))
    s.players.p2.field.nexuses.push(createInstance("BS03-114", s.turn, 0))
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: bagin.instanceId }) === null, "バギンでアタック")
    assert(bagin.tempBpBuff === 1000, "Lv1は自分のネクサス数（1）×1000でBP+1000")

    const s2 = createGame(
        "bs03-094-lv2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s2)
    const bagin2 = createInstance("BS03-094", s2.turn, 4) // Lv2
    s2.players.p1.field.spirits.push(bagin2)
    s2.players.p1.field.nexuses.push(createInstance("BS03-113", s2.turn, 0))
    s2.players.p2.field.nexuses.push(createInstance("BS03-114", s2.turn, 0))
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s2, "p1", { type: "attack", instanceId: bagin2.instanceId }) === null, "バギンでアタック")
    assert(bagin2.tempBpBuff === 2000, "Lv2は両者のネクサス数合計（2）×1000でBP+2000")
}

console.log("=== BS03-098 戦闘竜ワイヴァーン：Lv1はブロック不可、Lv1以下にブロックされない ===")
{
    const s = createGame(
        "bs03-098-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    const attacker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1
    const wyvern = createInstance("BS03-098", s.turn, 1) // Lv1: cantBlock
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(wyvern)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ゴラドンでアタック")
    const blockErr = act(s, "p2", { type: "block", instanceId: wyvern.instanceId })
    assert(blockErr !== null && blockErr.includes("ブロックできません"), "Lv1のワイヴァーンはcantBlockでブロック拒否される")
}
{
    const s = createGame(
        "bs03-098-unblockable-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const wyvern = createInstance("BS03-098", s.turn, 1) // Lv1: unblockableBy levelFilter:[1]
    const blockerLv1 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1
    s.players.p1.field.spirits.push(wyvern)
    s.players.p2.field.spirits.push(blockerLv1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: wyvern.instanceId }) === null, "ワイヴァーンでアタック")
    const blockErr = act(s, "p2", { type: "block", instanceId: blockerLv1.instanceId })
    assert(blockErr !== null, "Lv1のスピリットはワイヴァーンをブロックできない（unblockableBy levelFilter:[1]）")
}

console.log("=== BS03-142 サルベージ：山札上5枚からネクサス回収、フラッシュでBP+3000 ===")
{
    const s = createGame(
        "bs03-142-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.deck.splice(0, 5, "BS01-001", "BS01-001", "BS03-113", "BS01-001", "BS01-001")
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "deckReveal", count: 5, pickType: "nexus" })
    assert(s.players.p1.hand.includes("BS03-113"), "メイン：公開した5枚の中のネクサスが手札に加わる")
    assert(s.players.p1.hand.length === handBefore + 1, "手札が1枚増える")

    const target = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(target)
    const before = effectiveBp(s, "p1", target)
    resolveAction(s, "p1", target, { type: "bpBuff", amount: 3000 })
    assert(effectiveBp(s, "p1", target) === before + 3000, "フラッシュ：対象スピリットがBP+3000される")
}
