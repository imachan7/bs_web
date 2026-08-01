// smoke パート31（第三弾 BS03 効果構造化バッチ：マジック使用制約・手札加入検知5枚）
// 収録セクション:
//   - magicRestriction: oncePerTurnAll（BS03-079 作戦参謀フォクシン）
//   - magicRestriction: noReductionOpponent（BS03-069 イワトビペンタン。turn条件2分岐）
//   - magicRestriction: colorLockOpponent（BS03-113 力奪う凱旋門）
//   - fieldEvent: opponentHandAdded（BS03-075 犬人マードック／BS03-116 英雄の喪失Lv1）
//   - fieldEvent: ownSpiritDestroyed familyFilter（BS03-116 英雄の喪失Lv2）
import { act, assert, createGame, createInstance, destroySpirit, draw, effectiveCost, getCard, runTurnStart } from "./helpers"

console.log("=== 作戦参謀フォクシン：oncePerTurnAllでターン2枚目のマジックが拒否される ===")
{
    const s = createGame("foxin-test", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p1.field.spirits.push(createInstance("BS03-079", s.turn, 1))
    s.players.p1.hand[0] = "BS01-142" // ピュアエリクサー：コスト3
    s.players.p1.hand[1] = "BS01-135" // パワーオーラ：コスト3
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "1枚目のマジックは使用できる")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0 }) !== null,
        "フォクシンがいると同一ターン2枚目のマジックは拒否される",
    )
}
console.log("=== フォクシンがいなければターン2枚目のマジックも使用できる ===")
{
    const s = createGame("foxin-absent-test", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p1.hand[0] = "BS01-142"
    s.players.p1.hand[1] = "BS01-135"
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "1枚目のマジックは使用できる")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "フォクシンがいなければ2枚目も使用できる")
}

console.log("=== イワトビペンタン：noReductionOpponentのturn条件2分岐 ===")
{
    const s = createGame("pentan-test", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    const pentan = createInstance("BS03-069", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(pentan)
    s.players.p2.field.spirits.push(createInstance("BS01-054", s.turn, 1)) // 緑シンボル1（軽減対象）
    const powerAura = getCard("BS01-135") // パワーオーラ：コスト3・軽減[緑]

    s.turnPlayer = "p2" // 相手（p1から見た）ターン：e1(turn:"opponent")がLv1から有効
    assert(effectiveCost(s, "p2", powerAura) === 3, "相手ターンはLv1から軽減シンボルが無効になる")

    s.turnPlayer = "p1" // 自分（p1）のターン：Lv1ではe1もe2も無効
    assert(effectiveCost(s, "p2", powerAura) === 2, "自分のターン・Lv1では通常通り軽減が効く（3-1=2）")

    pentan.cores = 4 // Lv2
    assert(effectiveCost(s, "p2", powerAura) === 3, "自分のターンでもLv2になるとe2が有効になり軽減が無効になる")
}

console.log("=== 力奪う凱旋門：colorLockOpponentで色不一致マジックの使用可否 ===")
{
    const s = createGame("triumphalarch-test", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS03-113", s.turn, 0))
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了（p2ターンへ）")
    s.players.p2.reserve = 20
    s.players.p2.hand[0] = "BS01-135" // パワーオーラ：緑
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) !== null,
        "自分のフィールドに緑シンボルがないため色不一致マジックは使用できない",
    )
    s.players.p2.field.spirits.push(createInstance("BS01-054", s.turn, 1)) // 緑シンボルを与える
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "緑シンボルを得たので使用できる")
}

console.log("=== 犬人マードック：相手メイン中の手札加入で相手のコアをトラッシュへ ===")
{
    const s = createGame("mardock-test", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.players.p1.field.spirits.push(createInstance("BS03-075", s.turn, 1))
    const target = createInstance("BS01-054", s.turn, 2) // p2側の唯一の候補（コア2個）
    s.players.p2.field.spirits.push(target)
    // マードックは「相手のフィールド/リザーブから」取れるため、リザーブにコアがあると候補が2つになり
    // 選択待ちになる。ここでは候補1つの自動解決を見たいのでリザーブを空にする（選択経路は part92 で検証）
    s.players.p2.reserve = 0
    s.turnPlayer = "p2"
    s.phase = "main"
    draw(s, "p2", 1)
    assert(target.cores === 1, "相手メイン中の手札加入でp2のスピリットのコアが1個トラッシュへ")
    assert(s.players.p2.trashCores === 1, "取り除いたコアはp2のトラッシュに置かれる")
}

console.log("=== 英雄の喪失Lv1：相手メイン中の手札加入でミル ===")
{
    const s = createGame("herolost-e1-test", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS03-116", s.turn, 0)) // Lv1
    s.turnPlayer = "p2"
    s.phase = "main"
    const trashBefore = s.players.p2.trashCards.length
    draw(s, "p2", 2)
    assert(s.players.p2.trashCards.length === trashBefore + 2, "ドロー2枚ぶんp2のデッキが2枚ミルされる")
}

console.log("=== 英雄の喪失Lv2：familyFilter「勇傑」のバトル破壊でミル5枚 ===")
{
    const s = createGame("herolost-e2-test", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.phase = "attack"
    s.players.p1.field.nexuses.push(createInstance("BS03-116", s.turn, 2)) // Lv2
    const hero = createInstance("BS03-096", s.turn, 1) // 系統：勇傑
    const other = createInstance("BS03-001", s.turn, 1) // 系統：空牙（対象外）
    s.players.p1.field.spirits.push(hero, other)
    const trashBefore = s.players.p2.trashCards.length
    destroySpirit(s, "p1", hero.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 1 },
    })
    assert(s.players.p2.trashCards.length === trashBefore + 5, "勇傑がバトル破壊されると相手のデッキを5枚ミルする")
    const trashAfterFirst = s.players.p2.trashCards.length
    destroySpirit(s, "p1", other.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 1 },
    })
    assert(s.players.p2.trashCards.length === trashAfterFirst, "勇傑を持たないスピリットの破壊では発火しない")
}
