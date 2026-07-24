// smoke パート38（BS04第四弾 赤・紫バッチ: 構造化した代表効果の検証）
// 収録セクション:
//   - BS04-002 カメレウィップ：Lv1 cantBlock（制約） / Lv2 selfBuff（アタック時BP+1000）
//   - BS04-006 骸竜ゾン・サウル：e1オーラ（自分のアタックステップ中のみ紫スピリット+1000）/ e2 destroyExhausted（Lv3アタック時）
//   - BS04-016 堕天使アゼル：バトル勝利時（battleRole:attacker）に天霊のスピリット数ぶんドロー（drawPer/ownFamily）
//   - BS04-078 魔影街：Lv2のみ exhaustOnManualCoreAdd が発揮される（Lv1では発揮されない）
//   - BS04-095 ヴェノムショット：フラッシュのみ構造化（メインのコア→ボイド行は未対応でスキップ）BP+1000
//   - BS04-X14 魔界七将パンデミウム：battleRole省略のためブロッカー勝利でもドロー1枚（onBattle）
import { assert, act, createGame, createInstance, effectiveBp, runTurnStart } from "./helpers"

console.log("=== BS04-002 カメレウィップ: Lv1 cantBlock（制約） / Lv2 selfBuff（アタック時BP+1000） ===")
{
    const s = createGame(
        "bs04-002-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    const cham = createInstance("BS04-002", s.turn, 1) // カメレウィップ Lv1 BP3000
    s.players.p1.field.spirits.push(cham)
    const enemyAtk = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(enemyAtk)

    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(act(s, "p2", { type: "attack", instanceId: enemyAtk.instanceId }) === null, "p2がゴラドンでアタック")
    assert(
        act(s, "p1", { type: "block", instanceId: cham.instanceId }) !== null,
        "Lv1のカメレウィップはcantBlockでブロックできない",
    )
    assert(act(s, "p1", { type: "takeLife" }) === null, "ブロックできないためライフで受ける")

    assert(act(s, "p2", { type: "endTurn" }) === null, "p2がターン終了")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    cham.cores = 3 // Lv2へ（cantBlockは対象外・selfBuffが有効化）
    assert(act(s, "p1", { type: "attack", instanceId: cham.instanceId }) === null, "Lv2のカメレウィップでアタック")
    assert(cham.tempBpBuff === 1000, "アタック時効果（selfBuff）でBP+1000")
}

console.log("=== BS04-006 骸竜ゾン・サウル: e1オーラ（自分のアタックステップ中のみ紫+1000）/ e2 destroyExhausted（Lv3） ===")
{
    const s = createGame(
        "bs04-006-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    const zonsaur = createInstance("BS04-006", s.turn, 1) // 骸竜ゾン・サウル Lv1
    s.players.p1.field.spirits.push(zonsaur)
    const purpleSpirit = createInstance("BS01-031", s.turn, 1) // デス・ハーデス（紫バニラ）Lv1 BP4000
    s.players.p1.field.spirits.push(purpleSpirit)

    const baseBp = effectiveBp(s, "p1", purpleSpirit)
    assert(baseBp === 4000, "素のBPは4000")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    assert(
        effectiveBp(s, "p1", purpleSpirit) === baseBp + 1000,
        "自分のアタックステップ中は紫スピリット+1000（アウラ）",
    )

    console.log("--- Lv3: アタック時に疲労状態の相手スピリットを破壊（destroyExhausted） ---")
    zonsaur.cores = 6 // Lv3へ
    const restedEnemy = createInstance("BS01-001", s.turn, 1) // ゴラドン（疲労状態にしておく）
    restedEnemy.isRested = true
    s.players.p2.field.spirits.push(restedEnemy)
    assert(act(s, "p1", { type: "attack", instanceId: zonsaur.instanceId }) === null, "骸竜ゾン・サウルでアタック")
    assert(!s.players.p2.field.spirits.includes(restedEnemy), "疲労状態のゴラドンが破壊された")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ブロッカーがいないためライフで受ける")
}

console.log("=== BS04-016 堕天使アゼル: バトル勝利時、天霊のスピリット数ぶんドロー（drawPer/ownFamily） ===")
{
    const s = createGame(
        "bs04-016-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "green" },
    )
    runTurnStart(s)
    const azel = createInstance("BS04-016", s.turn, 1) // 堕天使アゼル Lv1（系統：魔神/天霊）BP2000
    s.players.p1.field.spirits.push(azel)
    const sloane = createInstance("BS04-053", s.turn, 1) // 天使スローン（系統：天霊）
    s.players.p1.field.spirits.push(sloane)
    const weakBlocker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(weakBlocker)

    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: azel.instanceId }) === null, "堕天使アゼルでアタック")
    assert(
        act(s, "p2", { type: "block", instanceId: weakBlocker.instanceId }) === null,
        "ゴラドンでブロック（アタッカー勝利）",
    )
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(
        s.players.p1.hand.length === handBefore + 2,
        "天霊のスピリット2体（自身+天使スローン）ぶん2枚ドロー",
    )
}

console.log("=== BS04-078 魔影街: Lv2のみ exhaustOnManualCoreAdd が発揮される ===")
{
    const s = createGame(
        "bs04-078-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const town = createInstance("BS04-078", s.turn, 3) // 魔影街 Lv2（cores3、p2持ち）
    s.players.p2.field.nexuses.push(town)
    const spirit = createInstance("BS01-001", s.turn, 1) // ゴラドン（p1のスピリット）
    s.players.p1.field.spirits.push(spirit)

    assert(
        act(s, "p1", { type: "moveCore", instanceId: spirit.instanceId, direction: "add" }) === null,
        "p1が自分のメインステップにコアを1個追加",
    )
    assert(spirit.isRested, "ネクサス持ち主(p2)から見て相手(p1)の操作のため疲労する")
}

console.log("--- Lv1の魔影街ではこの効果は発揮されない ---")
{
    const s = createGame(
        "bs04-078-lv1-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const town = createInstance("BS04-078", s.turn, 0) // 魔影街 Lv1（cores0）
    s.players.p2.field.nexuses.push(town)
    const spirit = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(spirit)

    assert(
        act(s, "p1", { type: "moveCore", instanceId: spirit.instanceId, direction: "add" }) === null,
        "p1が自分のメインステップにコアを1個追加",
    )
    assert(!spirit.isRested, "Lv1の魔影街ではexhaustOnManualCoreAddが発揮されないため疲労しない")
}

console.log("=== BS04-095 ヴェノムショット: フラッシュ効果のみ構造化（BP+1000） ===")
{
    const s = createGame(
        "bs04-095-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const target = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(target)
    s.players.p1.reserve = 20
    s.players.p1.hand[0] = "BS04-095"
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target.instanceId }) === null,
        "ヴェノムショットを使用（メイン効果は未構造化のためflashエントリのみ解決される）",
    )
    assert(target.tempBpBuff === 1000, "ヴェノムショットでBP+1000")
}

console.log("=== BS04-X14 魔界七将パンデミウム: battleRole省略のためブロッカー勝利でもドロー1枚（onBattle） ===")
{
    const s = createGame(
        "bs04-x14-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "green" },
    )
    runTurnStart(s)
    const pandemium = createInstance("BS04-X14", s.turn, 1) // 魔界七将パンデミウム Lv1 BP5000
    s.players.p1.field.spirits.push(pandemium)
    const weakAttacker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(weakAttacker)

    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(act(s, "p2", { type: "attack", instanceId: weakAttacker.instanceId }) === null, "p2がゴラドンでアタック")
    assert(
        act(s, "p1", { type: "block", instanceId: pandemium.instanceId }) === null,
        "パンデミウムでブロック（ブロッカー勝利）",
    )
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(s.players.p1.hand.length === handBefore + 1, "battleRole省略のためブロッカー勝利でも1ドロー")
}
