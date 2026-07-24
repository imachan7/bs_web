// smoke パート48（召喚・配置時のレベル指定）
// GameAction summon/setNexus の level 省略時は従来どおりLv1、指定時はそのレベルのコア数をリザーブから置く。
// 召喚時効果はコア配置後に発火するため、Lv2以上で召喚すればそのレベルの効果・BPが適用される
// （七龍帝の玉座Lv2「召喚されたスピリットのBP以下」のように、召喚レベルに依存する効果の前提）
import { assert, act, createGame, createInstance, currentLevel, effectiveCost, getCard, runTurnStart } from "./helpers"

console.log("=== level 省略時は従来どおりLv1で召喚される（回帰） ===")
{
    const s = createGame("summon-lv-default", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.hand[0] = "BS01-007" // ハンマドレイク（Lv1=1コア/BP4000、Lv2=2コア/BP5000、Lv3=7コア/BP9000）
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "レベル未指定で召喚")
    const inst = s.players.p1.field.spirits[s.players.p1.field.spirits.length - 1]!
    assert(inst.cores === 1, "Lv1のコア数1個で場に出る")
    assert(currentLevel(inst).level === 1, "レベルは1")
}

console.log("=== level:2 を指定するとLv2のコア数を置いて召喚される ===")
{
    const s = createGame("summon-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.hand[0] = "BS01-007"
    s.players.p1.reserve = 20
    const cost = effectiveCost(s, "p1", getCard("BS01-007"))
    const before = s.players.p1.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0, level: 2 }) === null, "Lv2を指定して召喚")
    const inst = s.players.p1.field.spirits[s.players.p1.field.spirits.length - 1]!
    assert(inst.cores === 2, "Lv2のコア数2個で場に出る")
    assert(currentLevel(inst).level === 2, "レベルは2")
    assert(currentLevel(inst).bp === 5000, "BPもLv2の5000になる（召喚レベル依存の効果の前提）")
    assert(before - s.players.p1.reserve === cost + 2, "リザーブはコスト+置いたコア2個ぶん減る")
}

console.log("=== level:3 のコアが足りなければ拒否される ===")
{
    const s = createGame("summon-lv3-poor", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.hand[0] = "BS01-007"
    s.players.p1.reserve = 5 // Lv3は7コア必要なのでコスト分を除いても足りない
    const spiritsBefore = s.players.p1.field.spirits.length
    assert(act(s, "p1", { type: "summon", handIndex: 0, level: 3 }) !== null, "コア不足でLv3召喚は拒否される")
    assert(s.players.p1.field.spirits.length === spiritsBefore, "召喚は行われていない")
    assert(s.players.p1.hand[0] === "BS01-007", "手札も減っていない")
}

console.log("=== カードに存在しないレベルは拒否される ===")
{
    const s = createGame("summon-lv-invalid", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.hand[0] = "BS01-001" // ゴラドン（Lv1・Lv2のみ）
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0, level: 3 }) !== null, "Lv3を持たないカードへのLv3指定は拒否")
    assert(act(s, "p1", { type: "summon", handIndex: 0, level: 0 }) !== null, "Lv0の指定は拒否")
}

console.log("=== ネクサスも配置時にレベルを指定できる ===")
{
    const s = createGame("setnexus-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.hand[0] = "BS04-076" // 翼持つ者の空域（Lv1=0コア、Lv2=3コア）
    s.players.p1.reserve = 20
    const cost = effectiveCost(s, "p1", getCard("BS04-076"))
    const before = s.players.p1.reserve
    assert(act(s, "p1", { type: "setNexus", handIndex: 0, level: 2 }) === null, "Lv2を指定して配置")
    const nexus = s.players.p1.field.nexuses[s.players.p1.field.nexuses.length - 1]!
    assert(nexus.cores === 3, "Lv2のコア数3個が置かれる")
    assert(currentLevel(nexus).level === 2, "ネクサスのレベルは2")
    assert(before - s.players.p1.reserve === cost + 3, "リザーブはコスト+置いたコア3個ぶん減る")
}

console.log("=== 神速召喚（フラッシュ中）でもレベル指定できる ===")
{
    const s = createGame("summon-lv-soku", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.hand[0] = "BS01-053" // リーヴォルフ（神速）
    s.players.p2.reserve = 20
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言（フラッシュ開始）")
    assert(act(s, "p2", { type: "summon", handIndex: 0, level: 2 }) === null, "防御側がLv2で神速召喚")
    const inst = s.players.p2.field.spirits[s.players.p2.field.spirits.length - 1]!
    assert(currentLevel(inst).level === 2, "神速召喚でもLv2になる")
}

console.log("パート48 完了")
