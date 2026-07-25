// smoke パート57（TargetFilter 直交化 第1段階の回帰テスト）
//
// 対象選択の絞り込み軸を共通の TargetFilter に一本化した。検証したいのは2点:
//   A. 旧形式（destroy.maxBp / refreshOne.colorFilter など）が従来どおり動くこと（後方互換）
//   B. 新形式（filter: {...}）が同じ結果を出すこと（新旧の等価性）
//
// B が重要で、cards.json は無変更のまま（第1段階の方針）なので、
// **新形式を通るコードパスは既存データからは一度も実行されない**。ここで初めて経路が通る。
import { assert, cardHasColor, createGame, createInstance, currentLevel, effectiveBp, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// 相手フィールドにスピリットを1体置くヘルパー（cores はレベルが立つ数を渡す）
function putEnemy(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

console.log("=== §A destroy: 旧 maxBp と 新 filter.maxBp が同じ対象を破壊する ===")
{
    // 旧形式 maxBp:3000
    const s1 = createGame("tf-destroy-legacy", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s1)
    const weak1 = putEnemy(s1, "p2", "BS01-002", 1) // 低BPのスピリット
    const strong1 = putEnemy(s1, "p2", "BS01-025", 3) // 高BPのスピリット
    const weakBp = effectiveBp(s1, "p2", s1.players.p2.field.spirits.find((x) => x.instanceId === weak1)!)
    const strongBp = effectiveBp(s1, "p2", s1.players.p2.field.spirits.find((x) => x.instanceId === strong1)!)
    assert(weakBp < strongBp, `テスト前提: 弱いほうのBPが低い（${weakBp} < ${strongBp}）`)

    resolveAction(s1, "p1", null, { type: "destroy", maxBp: weakBp, count: 1 })
    const survived1 = s1.players.p2.field.spirits.map((x) => x.instanceId)
    assert(!survived1.includes(weak1), "旧形式 maxBp: BP以下のスピリットが破壊された")
    assert(survived1.includes(strong1), "旧形式 maxBp: BP超過のスピリットは残った")

    // 新形式 filter:{ maxBp }
    const s2 = createGame("tf-destroy-new", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s2)
    const weak2 = putEnemy(s2, "p2", "BS01-002", 1)
    const strong2 = putEnemy(s2, "p2", "BS01-025", 3)

    resolveAction(s2, "p1", null, { type: "destroy", filter: { maxBp: weakBp }, count: 1 })
    const survived2 = s2.players.p2.field.spirits.map((x) => x.instanceId)
    assert(!survived2.includes(weak2), "新形式 filter.maxBp: BP以下のスピリットが破壊された")
    assert(survived2.includes(strong2), "新形式 filter.maxBp: BP超過のスピリットは残った")
    assert(
        survived1.length === survived2.length,
        `新旧で結果が一致する（残存数 ${survived1.length} = ${survived2.length}）`,
    )
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
