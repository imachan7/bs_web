// smoke パート54（個別設計バッチB）
//   - BS04-027 アリゲイド: 相手デッキを一度に5枚以上破棄したとき疲労（FieldEvent opponentDeckMilled + minEventCount）
//   - BS04-045 氷の女神フリッグ: 相手が指定コストのマジックをフラッシュ使用したときコアをトラッシュへ（FieldEvent opponentMagicUsed）
//   - BS04-085 魔力満ちる泉: 四道3体以上で相手の召喚コスト+1（costMod condition）／相手アタック時のコア課税
//   - BS04-101 ミストカーテン: 指定した相手スピリットのアタックではライフが減らない
import { assert, act, takeLifeAndResolve, createGame, createInstance, effectiveCost, getCard, resolveAction, runTurnStart } from "./helpers"

console.log("=== BS04-027 アリゲイド Lv2: 一度に5枚以上の破棄で相手1体を疲労 ===")
{
    const s = createGame("bs04-027", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits.push(createInstance("BS04-027", s.turn, 3)) // アリゲイド Lv2
    const enemy = createInstance("BS01-007", s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    resolveAction(s, "p1", null, { type: "mill", count: 4 })
    assert(!enemy.isRested, "4枚の破棄では発火しない")
    resolveAction(s, "p1", null, { type: "mill", count: 5 })
    assert(enemy.isRested, "5枚の破棄で相手スピリットが疲労する")
}

console.log("=== BS04-045 氷の女神フリッグ: 相手のコスト4フラッシュマジックでコア4個をトラッシュへ ===")
{
    const s = createGame("bs04-045", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "green" })
    runTurnStart(s)
    s.players.p1.field.spirits.push(createInstance("BS04-045", s.turn, 1)) // 氷の女神フリッグ Lv1
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック（フラッシュ開始）")
    // p2 がコスト4のフラッシュマジック（ローヤルポーション BS02-106）を使用
    assert(getCard("BS02-106").cost === 4, "テスト前提：ローヤルポーションのコストは4")
    s.players.p2.hand = ["BS02-106"]
    s.players.p2.reserve = 12
    const trashBefore = s.players.p2.trashCores
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "相手がコスト4のマジックをフラッシュで使用")
    // 支払い分（コスト4）に加えて、フリッグの効果でさらに4個がトラッシュへ送られる
    assert(s.players.p2.trashCores === trashBefore + 4 + 4, "コスト支払い4個＋効果によるコア4個がトラッシュへ")
}

console.log("=== BS04-085 魔力満ちる泉: 四道3体以上のとき相手の召喚コスト+1 ===")
{
    const s = createGame("bs04-085", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-085", s.turn, 0)) // 魔力満ちる泉 Lv1（p1所有）
    // p2のターン（＝p1から見て相手のメインステップ）にする
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1のターンを終了 → p2のターン")
    const goradon = getCard("BS01-001")
    const base = effectiveCost(s, "p2", goradon)
    s.players.p1.field.spirits.push(createInstance("BS02-056", s.turn, 1)) // 四道1体目
    s.players.p1.field.spirits.push(createInstance("BS02-066", s.turn, 1)) // 四道2体目
    assert(effectiveCost(s, "p2", goradon) === base, "四道2体では条件未達でコストは増えない")
    s.players.p1.field.spirits.push(createInstance("BS02-070", s.turn, 1)) // 四道3体目
    assert(effectiveCost(s, "p2", goradon) === base + 1, "四道3体以上で相手のスピリット召喚コストが+1される")
}

console.log("=== BS04-101 ミストカーテン: 指定した相手スピリットのアタックではライフが減らない ===")
{
    const s = createGame("bs04-101", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    s.players.p2.hand = ["BS04-101"]
    s.players.p2.reserve = 20
    const lifeBefore = s.players.p2.life
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: attacker.instanceId }) === null,
        "ミストカーテンでアタッカーを指定",
    )
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(s.players.p2.life === lifeBefore, "指定したアタッカーのアタックではライフが減らない")
}

console.log("パート54 完了")
