// smoke パート57（TargetFilter 直交化の回帰テスト）
//
// 対象選択の絞り込み軸（BP・色・系統・コスト・レベル・キーワード・バニラ）を
// 共通の TargetFilter に一本化した。ここでは各軸が `filter` 形式で正しく効くことを検証する。
//
// 第1段階では旧形式（destroy.maxBp / refreshOne.colorFilter など）との後方互換も検証していたが、
// 第2段階（2026-07-30）で cards.json を filter へ移行して旧フィールドを削除したため、
// 旧形式のケースは撤去した（型に存在しないので書けない）。
import { assert, cardHasColor, createGame, createInstance, currentLevel, effectiveBp, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// 相手フィールドにスピリットを1体置くヘルパー（cores はレベルが立つ数を渡す）
function putEnemy(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

console.log("=== §A destroy: filter.maxBp がBP以下だけを破壊する ===")
{
    const s = createGame("tf-destroy-new", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const weak = putEnemy(s, "p2", "BS01-002", 1) // 低BPのスピリット
    const strong = putEnemy(s, "p2", "BS01-025", 3) // 高BPのスピリット
    const weakBp = effectiveBp(s, "p2", s.players.p2.field.spirits.find((x) => x.instanceId === weak)!)
    const strongBp = effectiveBp(s, "p2", s.players.p2.field.spirits.find((x) => x.instanceId === strong)!)
    assert(weakBp < strongBp, `テスト前提: 弱いほうのBPが低い（${weakBp} < ${strongBp}）`)

    resolveAction(s, "p1", null, { type: "destroy", filter: { maxBp: weakBp }, count: 1 })
    const survived = s.players.p2.field.spirits.map((x) => x.instanceId)
    assert(!survived.includes(weak), "filter.maxBp: BP以下のスピリットが破壊された")
    assert(survived.includes(strong), "filter.maxBp: BP超過のスピリットは残った")
}

console.log("=== §B refreshOne: 新 filter.color が色で絞り込む ===")
{
    const s = createGame("tf-refresh-color", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    // 自分の場に赤と紫の疲労スピリットを1体ずつ置く
    const red = createInstance("BS01-002", s.turn, 1)
    const purple = createInstance("BS01-041", s.turn, 1)
    assert(cardHasColor(getCard(red.cardId), "red"), `テスト前提: ${getCard(red.cardId).name} は赤`)
    assert(cardHasColor(getCard(purple.cardId), "purple"), `テスト前提: ${getCard(purple.cardId).name} は紫`)
    red.isRested = true
    purple.isRested = true
    s.players.p1.field.spirits.push(red, purple)

    // 紫だけを回復対象にする（resolveAction による変更を見るため、フィールドから読み直す）
    resolveAction(s, "p1", null, { type: "refreshOne", filter: { color: "purple" } })
    const after = (id: string) => s.players.p1.field.spirits.find((x) => x.instanceId === id)!
    assert(!after(purple.instanceId).isRested, "新形式 filter.color: 指定色のスピリットが回復した")
    assert(after(red.instanceId).isRested, "新形式 filter.color: 指定色以外は疲労のまま")
}

console.log("=== §C exhaust: 新 filter.level がレベルで絞り込む ===")
{
    const s = createGame("tf-exhaust-level", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    // 相手の場に Lv1 と Lv2 のスピリットを置く（同じカードでコア数を変える）
    const lv1 = putEnemy(s, "p2", "BS01-025", 1)
    const lv2 = putEnemy(s, "p2", "BS01-025", 3)
    const find = (id: string) => s.players.p2.field.spirits.find((x) => x.instanceId === id)!
    assert(currentLevel(find(lv1)).level === 1, "テスト前提: 1体目は Lv1")
    assert(currentLevel(find(lv2)).level >= 2, "テスト前提: 2体目は Lv2 以上")

    // Lv1 だけを疲労させる
    resolveAction(s, "p1", null, { type: "exhaust", count: 1, filter: { level: [1] } })
    assert(find(lv1).isRested === true, "新形式 filter.level: 指定レベルのスピリットが疲労した")
    assert(find(lv2).isRested === false, "新形式 filter.level: 指定レベル以外は疲労しない")
}
