// smoke パート50（トリガー無効化）
// ①このターン限りの抑止: BS04-093 ユーサネイジア（相手スピリットの『破壊時』を発揮させない）
// ②フィールドからの継続抑止: BS04-086 古代闘技場 Lv2（相手のメインステップに相手の『召喚時』を発揮させない）
import { assert, act, createGame, createInstance, destroySpirit, runTurnStart } from "./helpers"

console.log("=== BS04-093 ユーサネイジア: 相手スピリットの破壊時効果が発揮されない ===")
{
    const s = createGame("bs04-093", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const enemy = createInstance("BS01-042", s.turn, 1) // ミストウィゼル（破壊時に3枚ドロー）
    s.players.p2.field.spirits.push(enemy)
    s.players.p1.hand = ["BS04-093"]
    s.players.p1.reserve = 20
    const handBefore = s.players.p2.hand.length
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ユーサネイジアを使用")
    destroySpirit(s, "p2", enemy.instanceId, "destroy")
    assert(s.players.p2.hand.length === handBefore, "破壊されても相手の破壊時ドローが発揮されない")
}

console.log("=== BS04-093 は自分の破壊時効果までは止めない／使用していなければ通常どおり発揮される ===")
{
    const s = createGame("bs04-093-own", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const mine = createInstance("BS01-042", s.turn, 1) // 自分のミストウィゼル
    s.players.p1.field.spirits.push(mine)
    s.players.p1.hand = ["BS04-093"]
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ユーサネイジアを使用")
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", mine.instanceId, "destroy")
    assert(s.players.p1.hand.length === handBefore + 3, "自分のスピリットの破壊時効果は通常どおり発揮される")
}
{
    const s = createGame("bs04-093-none", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const enemy = createInstance("BS01-042", s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    const handBefore = s.players.p2.hand.length
    destroySpirit(s, "p2", enemy.instanceId, "destroy")
    assert(s.players.p2.hand.length === handBefore + 3, "マジック未使用なら破壊時ドローは通常どおり発揮される")
}

console.log("=== BS04-086 古代闘技場 Lv2: 相手のメインステップに相手の召喚時効果が発揮されない ===")
{
    const s = createGame("bs04-086", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "purple" })
    runTurnStart(s)
    // p1（非ターンプレイヤー側にしたいので、まずp2のターンにする）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1のターンを終了 → p2のターン")
    s.players.p1.field.nexuses.push(createInstance("BS04-086", s.turn, 3)) // 古代闘技場 Lv2（p1が所有＝p2から見て相手）
    s.players.p2.hand[0] = "BS01-030" // グリプ・ハンズ（召喚時に1枚ドロー）
    s.players.p2.reserve = 20
    const handBefore = s.players.p2.hand.length
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "p2がグリプ・ハンズを召喚")
    // 手札は「召喚で1枚減る」だけ。召喚時ドローが発揮されていれば±0になる
    assert(s.players.p2.hand.length === handBefore - 1, "相手のメインステップなので召喚時ドローが発揮されない")
}

console.log("=== BS04-086 Lv1 では発揮されない（レベル条件） ===")
{
    const s = createGame("bs04-086-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "purple" })
    runTurnStart(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1のターンを終了 → p2のターン")
    s.players.p1.field.nexuses.push(createInstance("BS04-086", s.turn, 0)) // 古代闘技場 Lv1
    s.players.p2.hand[0] = "BS01-030"
    s.players.p2.reserve = 20
    const handBefore = s.players.p2.hand.length
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "p2がグリプ・ハンズを召喚")
    assert(s.players.p2.hand.length === handBefore, "Lv1では抑止されず、召喚時ドローで±0になる")
}

console.log("パート50 完了")
