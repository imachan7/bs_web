// smoke パート46（BS04構造化スキップ解消・エンジン拡張バッチ4の検証）
// 拡張A: levelAs condition ownFieldHasFamily — BS04-058 鼠人チューリヒ（戦獣がいる間Lv2扱い）
// 拡張B: levelMaxAllOwnThisTurn — BS04-069 幻影士のミラージ（召喚時、自分のスピリットすべてを最高Lv扱い）
// 拡張C: millPer multiplier/cap ＋ counter ownColorSymbols — BS04-X16 機動要塞キャッスル・ゴレム
import { assert, act, createGame, createInstance, currentLevel, refreshLevelAsOverrides, runTurnStart } from "./helpers"

console.log("=== 拡張A: BS04-058 鼠人チューリヒ（戦獣がいる間Lv2扱い） ===")
{
    const s = createGame("bs04-058", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const zurich = createInstance("BS04-058", s.turn, 1) // 鼠人チューリヒ（コア1個＝素のLv1）
    s.players.p1.field.spirits.push(zurich)
    refreshLevelAsOverrides(s)
    assert(currentLevel(zurich).level === 1, "戦獣がいないときは素のLv1")
    const sensou = createInstance("BS03-071", s.turn, 1) // 戦闘獣ブルトップ（戦獣）
    s.players.p1.field.spirits.push(sensou)
    refreshLevelAsOverrides(s)
    assert(currentLevel(zurich).level === 2, "戦獣が自陣にいる間はLv2として扱う")
    s.players.p1.field.spirits = s.players.p1.field.spirits.filter((x) => x.instanceId !== sensou.instanceId)
    refreshLevelAsOverrides(s)
    assert(currentLevel(zurich).level === 1, "戦獣がいなくなればLv1に戻る")
}

console.log("=== 拡張B: BS04-069 幻影士のミラージ（召喚時、自分のスピリットすべてを最高Lv扱い） ===")
{
    const s = createGame("bs04-069", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const ally = createInstance("BS01-007", s.turn, 1) // ハンマドレイク（最高Lv3、コア1個＝素のLv1）
    s.players.p1.field.spirits.push(ally)
    assert(currentLevel(ally).level === 1, "召喚前は素のLv1")
    s.players.p1.hand[0] = "BS04-069"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "幻影士のミラージを召喚")
    assert(currentLevel(ally).level === 3, "召喚時効果で他スピリットが最高Lv3として扱われる")
}

console.log("=== 拡張C: BS04-X16 機動要塞キャッスル・ゴレム（ネクサス数×5・上限15／青シンボル数×1のmillPer） ===")
{
    const s = createGame("bs04-x16-e1", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    // 自分のネクサス2つ → 相手デッキを 2×5=10 枚破棄
    s.players.p1.field.nexuses.push(createInstance("BS04-082", s.turn, 1))
    s.players.p1.field.nexuses.push(createInstance("BS04-088", s.turn, 1))
    const trashBefore = s.players.p2.trashCards.length
    const deckBefore = s.players.p2.deck.length
    s.players.p1.hand[0] = "BS04-X16"
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "キャッスル・ゴレムを召喚")
    assert(s.players.p2.trashCards.length - trashBefore === 10, "ネクサス2つで相手デッキを10枚破棄（2×5）")
    assert(deckBefore - s.players.p2.deck.length === 10, "相手デッキが10枚減る")
}
{
    const s = createGame("bs04-x16-cap", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    // 自分のネクサス4つ → 4×5=20 だが上限15で頭打ち
    for (let i = 0; i < 4; i++) s.players.p1.field.nexuses.push(createInstance("BS04-082", s.turn, 1))
    const trashBefore = s.players.p2.trashCards.length
    s.players.p1.hand[0] = "BS04-X16"
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "キャッスル・ゴレムを召喚（上限テスト）")
    assert(s.players.p2.trashCards.length - trashBefore === 15, "4×5=20だが上限15枚で頭打ち")
}

console.log("パート46 完了")
