// smoke パート44（BS04構造化スキップ解消・エンジン拡張バッチ2の検証）
// 拡張1: destroy/destroyExhausted の costFilter（{max,min}）— BS04-011 風龍王フージャオス／BS04-017 ヘルウィッチ
// 拡張2: coreRemovePerHandDiscard（好きなだけ手札破棄→枚数ぶん相手コアをトラッシュへ。非interactiveは全破棄の決定的動作）
//        — BS04-022 王蛇ケツァルカトル／BS04-094 ダンスマカブル
// 拡張3: coreRemove の dest:"void"（リザーブでなくボイドへ）— BS04-095 ヴェノムショット
// 拡張4: destroyAll の anySide/colorExclude — BS04-X13 魔龍帝ジークフリードLv3
// ついでに: destroyNexus の all（相手ネクサスすべて破壊）／refreshOne の excludeSelf・
//           selfBuffPer の新カウンタ opponentTrashCores・coreToTrashAllByCost も本パートでまとめて検証
import { assert, act, createGame, createInstance, runTurnStart } from "./helpers"

console.log("=== BS04-011 風龍王フージャオス: onSummon destroyNexus(all) ===")
{
    const s = createGame(
        "bs04-011-summon-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const nexus1 = createInstance("BS04-082", s.turn, 1) // 侵されざる聖域（白・バニラネクサス）
    s.players.p2.field.nexuses.push(nexus1)
    const nexus2 = createInstance("BS04-082", s.turn, 1)
    s.players.p2.field.nexuses.push(nexus2)
    s.players.p1.hand[0] = "BS04-011"
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "風龍王フージャオスを召喚")
    assert(s.players.p2.field.nexuses.length === 0, "相手ネクサス2つがすべて破壊された（destroyNexus all）")
}

console.log("=== BS04-011 風龍王フージャオス: onAttack refreshOne(familyFilter翼竜,excludeSelf) と onBattle destroy(costFilter) ===")
{
    const s = createGame(
        "bs04-011-attack-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const fujaosu = createInstance("BS04-011", s.turn, 6) // 風龍王フージャオス Lv3 cores6 BP8000（系統：皇獣/翼竜）
    s.players.p1.field.spirits.push(fujaosu)
    const aivern = createInstance("BS01-005", s.turn, 1) // アイバーン（系統：翼竜）Lv1 BP2000、疲労状態
    aivern.isRested = true
    s.players.p1.field.spirits.push(aivern)
    const blocker = createInstance("BS01-089", s.turn, 1) // デュアルキャノン・ベル コスト4 BP3000
    s.players.p2.field.spirits.push(blocker)
    const cheapTarget = createInstance("BS01-001", s.turn, 1) // ゴラドン コスト0（costFilter max3 に該当）
    s.players.p2.field.spirits.push(cheapTarget)
    const priceyTarget = createInstance("BS01-089", s.turn, 1) // コスト4（costFilter max3 の対象外）
    s.players.p2.field.spirits.push(priceyTarget)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: fujaosu.instanceId }) === null, "フージャオスでアタック宣言")
    assert(fujaosu.isRested, "アタック宣言でフージャオス自身は疲労する")
    assert(!aivern.isRested, "excludeSelf：自身以外の系統「翼竜」のアイバーンが回復した")

    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "p2がブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === blocker.instanceId),
        "ブロッカーはBP比較（フージャオス勝利）で破壊される",
    )
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === cheapTarget.instanceId),
        "onBattle(attacker)：costFilter(max3)に該当するコスト0のゴラドンも追加破壊される",
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === priceyTarget.instanceId),
        "costFilter(max3)：コスト4は対象外のため生存する",
    )
}

console.log("=== BS04-017 ヘルウィッチ: onAttack destroyExhausted(costFilter) をLv2/Lv3で比較 ===")
{
    const s2 = createGame(
        "bs04-017-lv2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s2)
    const witchLv2 = createInstance("BS04-017", s2.turn, 3) // ヘルウィッチ Lv2 cores3
    s2.players.p1.field.spirits.push(witchLv2)
    const cost0 = createInstance("BS01-001", s2.turn, 1) // コスト0 BP1000、疲労
    cost0.isRested = true
    s2.players.p2.field.spirits.push(cost0)
    const cost4 = createInstance("BS01-089", s2.turn, 1) // コスト4 BP3000、疲労
    cost4.isRested = true
    s2.players.p2.field.spirits.push(cost4)
    const cost7 = createInstance("BS04-021", s2.turn, 1) // コスト7 BP4000、疲労（max6対象外）
    cost7.isRested = true
    s2.players.p2.field.spirits.push(cost7)

    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s2, "p1", { type: "attack", instanceId: witchLv2.instanceId }) === null, "Lv2ヘルウィッチでアタック宣言")
    assert(
        !s2.players.p2.field.spirits.some((sp) => sp.instanceId === cost4.instanceId),
        "Lv2：costFilter(max6)の候補中BP最大のコスト4が破壊される",
    )
    assert(
        s2.players.p2.field.spirits.some((sp) => sp.instanceId === cost0.instanceId),
        "Lv2：max1用の効果(e2)は発揮されないためコスト0は生存する",
    )
    assert(
        s2.players.p2.field.spirits.some((sp) => sp.instanceId === cost7.instanceId),
        "costFilter(max6)：コスト7は対象外のため生存する",
    )

    const s3 = createGame(
        "bs04-017-lv3-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s3)
    const witchLv3 = createInstance("BS04-017", s3.turn, 6) // ヘルウィッチ Lv3 cores6
    s3.players.p1.field.spirits.push(witchLv3)
    const cost0b = createInstance("BS01-001", s3.turn, 1) // コスト0（max6にもmax1にも該当）
    cost0b.isRested = true
    s3.players.p2.field.spirits.push(cost0b)
    const cost4b = createInstance("BS01-089", s3.turn, 1) // コスト4（max6のみ該当）
    cost4b.isRested = true
    s3.players.p2.field.spirits.push(cost4b)
    const cost7b = createInstance("BS04-021", s3.turn, 1) // コスト7（どちらにも該当せず）
    cost7b.isRested = true
    s3.players.p2.field.spirits.push(cost7b)

    assert(act(s3, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s3, "p1", { type: "attack", instanceId: witchLv3.instanceId }) === null, "Lv3ヘルウィッチでアタック宣言")
    assert(
        !s3.players.p2.field.spirits.some((sp) => sp.instanceId === cost4b.instanceId),
        "Lv3：e1(max6)がBP最大のコスト4を破壊する",
    )
    assert(
        !s3.players.p2.field.spirits.some((sp) => sp.instanceId === cost0b.instanceId),
        "Lv3：e2(max1)が残る候補中で唯一該当するコスト0を破壊する",
    )
    assert(
        s3.players.p2.field.spirits.some((sp) => sp.instanceId === cost7b.instanceId),
        "コスト7はmax6にもmax1にも該当せず生存する",
    )
}

console.log("=== BS04-021 吸血鬼ダンピール: onSummon coreToTrashAllByCost(maxCost4) と onAttack selfBuffPer(opponentTrashCores) ===")
{
    const s = createGame(
        "bs04-021-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const cheapA = createInstance("BS01-002", s.turn, 2) // ロクケラトプス コスト1 Lv2 cores2
    s.players.p2.field.spirits.push(cheapA)
    const cheapB = createInstance("BS01-007", s.turn, 2) // ハンマドレイク コスト2 Lv2 cores2
    s.players.p2.field.spirits.push(cheapB)
    const pricey = createInstance("BS04-011", s.turn, 2) // 風龍王フージャオス コスト7（maxCost4対象外）
    s.players.p2.field.spirits.push(pricey)
    s.players.p1.hand[0] = "BS04-021"
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "吸血鬼ダンピールを召喚")
    assert(cheapA.cores === 1, "コスト1のロクケラトプスはコア1個がトラッシュへ（2→1）")
    assert(cheapB.cores === 1, "コスト2のハンマドレイクもコア1個がトラッシュへ（2→1）")
    assert(pricey.cores === 2, "コスト7のフージャオスはmaxCost4対象外でコア変化なし")
    assert(s.players.p2.trashCores === 2, "相手トラッシュのコア数は2（コスト4以下の2体ぶん）")

    const dampiru = s.players.p1.field.spirits.find((sp) => sp.cardId === "BS04-021")!
    dampiru.cores = 4 // Lv2へ引き上げ（selfBuffPerの検証用）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: dampiru.instanceId }) === null, "ダンピールでアタック宣言")
    assert(dampiru.tempBpBuff === 2000, "相手トラッシュのコア2個ぶんBP+2000（selfBuffPer opponentTrashCores）")
}

console.log("=== BS04-022 王蛇ケツァルカトル: onAttack coreRemovePerHandDiscard（非interactiveの決定的動作） ===")
{
    const s = createGame(
        "bs04-022-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const ketsal = createInstance("BS04-022", s.turn, 3) // 王蛇ケツァルカトル Lv2 cores3
    s.players.p1.field.spirits.push(ketsal)
    s.players.p1.hand = ["BS01-001", "BS01-002", "BS01-003"] // 破棄されるだけのフィラー3枚
    const e1 = createInstance("BS01-007", s.turn, 7) // ハンマドレイク Lv3 BP9000 cores7
    s.players.p2.field.spirits.push(e1)
    const e2 = createInstance("BS01-003", s.turn, 3) // テラノセイバー Lv2 BP6000 cores3
    s.players.p2.field.spirits.push(e2)
    const e3 = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000 cores3
    s.players.p2.field.spirits.push(e3)
    const trashBefore = s.players.p2.trashCores

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: ketsal.instanceId }) === null, "ケツァルカトルでアタック宣言")
    assert(s.players.p1.hand.length === 0, "手札3枚がすべて破棄された（非interactiveの決定的動作）")
    assert(s.players.p2.trashCores === trashBefore + 3, "相手トラッシュにコア3個（破棄3枚ぶん、異なる3体から1個ずつ）")
    assert(e1.cores === 6, "BP最大のハンマドレイクから1個除去された")
    assert(e2.cores === 2, "次点のテラノセイバーから1個除去された")
    assert(e3.cores === 2, "3番目のゴラドンから1個除去された")
}

console.log("=== BS04-094 ダンスマカブル: フラッシュ coreRemovePerHandDiscard（メインステップからも使用可） ===")
{
    const s = createGame(
        "bs04-094-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.hand = ["BS04-094", "BS01-001", "BS01-002"]
    s.players.p1.reserve = 10
    const e1 = createInstance("BS01-007", s.turn, 2) // ハンマドレイク Lv2 BP5000 cores2
    s.players.p2.field.spirits.push(e1)
    const e2 = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000 cores3
    s.players.p2.field.spirits.push(e2)
    const trashBefore = s.players.p2.trashCores

    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ダンスマカブルを使用（手札index0）")
    assert(s.players.p1.hand.length === 0, "破棄対象2枚（フィラー）がすべて破棄された")
    assert(s.players.p2.trashCores === trashBefore + 2, "破棄2枚ぶん、相手トラッシュにコア2個")
    assert(e1.cores === 1, "BP最大のハンマドレイクから1個除去された")
    assert(e2.cores === 2, "次点のゴラドンから1個除去された")
}

console.log("=== BS04-095 ヴェノムショット: メイン coreRemove(dest:void)（ボイドへ消滅、トラッシュ/リザーブは増えない） ===")
{
    const s = createGame(
        "bs04-095-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.hand[0] = "BS04-095"
    s.players.p1.reserve = 10
    const target = createInstance("BS01-007", s.turn, 2) // ハンマドレイク cores2
    s.players.p2.field.spirits.push(target)
    const trashBefore = s.players.p2.trashCores
    const reserveBefore = s.players.p2.reserve

    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target.instanceId }) === null,
        "ヴェノムショットをメインで使用（対象指定）",
    )
    assert(target.cores === 1, "対象のコアが1個減った")
    assert(s.players.p2.trashCores === trashBefore, "トラッシュのコア数は変化しない（voidへ送られるため）")
    assert(s.players.p2.reserve === reserveBefore, "リザーブのコア数も変化しない（voidへ送られるため）")
}

console.log("=== BS04-X13 魔龍帝ジークフリード: onAttack destroyAll(maxBp4000, anySide, colorExclude:red) ===")
{
    const s = createGame(
        "bs04-x13-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    const jiegufried = createInstance("BS04-X13", s.turn, 5) // 魔龍帝ジークフリード Lv3 cores5 BP12000
    s.players.p1.field.spirits.push(jiegufried)
    const allyRed = createInstance("BS01-001", s.turn, 1) // ゴラドン 赤 BP1000（colorExcludeで除外）
    s.players.p1.field.spirits.push(allyRed)
    const allyGreen = createInstance("BS01-050", s.turn, 1) // ビートビートル 緑 BP1000（anySideで対象）
    s.players.p1.field.spirits.push(allyGreen)
    const enemyRed = createInstance("BS01-001", s.turn, 1) // 赤 BP1000（colorExcludeで除外）
    s.players.p2.field.spirits.push(enemyRed)
    const enemyGreenLow = createInstance("BS01-050", s.turn, 1) // 緑 BP1000（対象）
    s.players.p2.field.spirits.push(enemyGreenLow)
    const enemyGreenHigh = createInstance("BS01-062", s.turn, 1) // 緑 BP5000（maxBp超過で除外）
    s.players.p2.field.spirits.push(enemyGreenHigh)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: jiegufried.instanceId }) === null, "ジークフリードでアタック宣言")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === allyRed.instanceId),
        "自陣の赤ゴラドンはcolorExcludeで生存",
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === allyGreen.instanceId),
        "自陣の緑ビートビートルはanySideで破壊される",
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === enemyRed.instanceId),
        "相手の赤ゴラドンはcolorExcludeで生存",
    )
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === enemyGreenLow.instanceId),
        "相手の緑ビートビートル（BP4000以下）は破壊される",
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === enemyGreenHigh.instanceId),
        "相手の緑ハングリートゥリー（BP5000超）はmaxBpで生存",
    )
}

console.log("パート44 完了")
