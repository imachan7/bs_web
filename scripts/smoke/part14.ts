// smoke パート14（BS02構造化 最終波: ネクサスのコア数リンク・手動コア増加検知・制約継続付与）
// 収録セクション:
//   - server/src/type.ts: CardInstance.coresLinkedTo/coresOverride、EffectAction "linkNexusCoresChoice"、
//     EffectDef の kind:"exhaustOnManualCoreAdd"／kind:"constraintGrant"
//   - server/src/logic/GameState.ts: currentLevelがcoresOverride??coresを参照
//   - server/src/logic/EffectModules.ts: activeConstraintsへのconstraintGrant合成、
//     refreshLevelAsOverridesでのcoresLinkedTo同期、resolveActionのlinkNexusCoresChoiceハンドラ
//   - server/src/logic/GameEngine.ts: checkExhaustOnManualCoreAdd（doMoveCore/doAwaken後のフック）
//   - server/src/logic/PhaseManager.ts: endTurnでcoresLinkedTo/coresOverrideをリセット
//   - data/cards.json: BS02-028 クロスシザース・BS02-078 夢魔の寝所・BS02-063 冥犬ケルル・ベロス
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    runTurnStart,
} from "./helpers"
import { endTurn } from "../../server/src/logic/PhaseManager"

console.log("=== BS02-028 クロスシザース：スタートステップでネクサスのコア数をリンクする choice ===")
{
    const s = createGame(
        "crossshears-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const shears = createInstance("BS02-028", s.turn, 3) // クロスシザース Lv2（cores3）
    s.players.p1.field.spirits.push(shears)
    const antNest = createInstance("BS01-108", s.turn, 0) // 無限蟲の蟻塚 Lv1（cores0）
    s.players.p1.field.nexuses.push(antNest)
    const sageTree = createInstance("BS01-106", s.turn, 0) // 隠されたる賢者の樹 Lv1（cores0、リンク対象外）
    s.players.p1.field.nexuses.push(sageTree)

    endTurn(s) // p1 → p2（クロスシザースのturn:"own"はp2のスタートステップでは発火しない）
    endTurn(s) // p2 → p1（p1のスタートステップでクロスシザースが発火 → 候補2件でpendingChoiceが立つ）

    assert(s.pendingChoice !== null, "pendingChoiceが立つ")
    assert(s.pendingChoice?.kind === "target", "kind:targetの選択")
    assert(s.pendingChoice?.optional === true, "任意（スキップ可）")
    assert(
        [...(s.pendingChoice?.candidates ?? [])].sort().join(",") ===
            [antNest.instanceId, sageTree.instanceId].sort().join(","),
        "候補は自分のネクサス2つ",
    )

    assert(act(s, "p1", { type: "resolveChoice", instanceId: antNest.instanceId }) === null, "蟻塚を指定")
    assert(s.pendingChoice === null, "選択後pendingChoiceは解消される")
    assert(antNest.coresLinkedTo === shears.instanceId, "指定したネクサスにリンクが設定される")
    assert(currentLevel(antNest).level === 2, "ネクサスはクロスシザースのコア数(3)基準でLv2として扱われる")
    assert(sageTree.coresLinkedTo === undefined, "選ばなかったネクサスはリンクされない")

    endTurn(s) // p1 → p2（ターン終了でリンク解除）
    assert(antNest.coresLinkedTo === undefined, "ターン終了でリンクが解除される")
    assert(antNest.coresOverride === undefined, "ターン終了でoverrideも解除される")
    assert(currentLevel(antNest).level === 1, "リンク解除後は実コア数(0)基準のLv1に戻る")
}

console.log("--- スキップも可能 ---")
{
    const s = createGame(
        "crossshears-skip-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const shears = createInstance("BS02-028", s.turn, 1) // クロスシザース Lv1
    s.players.p1.field.spirits.push(shears)
    const antNest = createInstance("BS01-108", s.turn, 0)
    s.players.p1.field.nexuses.push(antNest)
    const sageTree = createInstance("BS01-106", s.turn, 0)
    s.players.p1.field.nexuses.push(sageTree)

    endTurn(s)
    endTurn(s)

    assert(s.pendingChoice !== null, "pendingChoiceが立つ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "何も選ばずスキップ")
    assert(s.pendingChoice === null, "スキップ後pendingChoiceは解消される")
    assert(
        antNest.coresLinkedTo === undefined && sageTree.coresLinkedTo === undefined,
        "どちらのネクサスもリンクされない",
    )
}

console.log("=== BS02-078 夢魔の寝所 e1：相手のメインステップにmoveCore(add)したスピリットが疲労する ===")
{
    const s = createGame(
        "yumemadoko-exhaust-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s) // p1のターン開始 → main phase

    const nest = createInstance("BS02-078", s.turn, 0) // 夢魔の寝所 Lv1（cores0、p2持ち）
    s.players.p2.field.nexuses.push(nest)
    const spirit = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1（p1のスピリット）
    s.players.p1.field.spirits.push(spirit)

    assert(!spirit.isRested, "初期状態は回復状態")
    assert(
        act(s, "p1", { type: "moveCore", instanceId: spirit.instanceId, direction: "add" }) === null,
        "p1が自分のメインステップにコアを1個追加",
    )
    assert(spirit.isRested, "ネクサス持ち主(p2)から見て相手(p1)の操作のため疲労する")
}

console.log("--- ネクサス持ち主自身のメインステップでの操作では疲労しない ---")
{
    const s = createGame(
        "yumemadoko-ownturn-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const nest = createInstance("BS02-078", s.turn, 0)
    s.players.p1.field.nexuses.push(nest) // 今度はp1（ターンプレイヤー）自身が持ち主
    const spirit = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(spirit)

    assert(
        act(s, "p1", { type: "moveCore", instanceId: spirit.instanceId, direction: "add" }) === null,
        "p1が自分のメインステップにコアを1個追加",
    )
    assert(!spirit.isRested, "ネクサス持ち主自身の操作では疲労しない")
}

console.log("=== BS02-078 夢魔の寝所 e2：Lv2ネクサスは自分のLv3スピリットに疲労相手への指定アタックを許す ===")
{
    const s = createGame(
        "yumemadoko-direct-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const nest = createInstance("BS02-078", s.turn, 3) // 夢魔の寝所 Lv2（cores3）
    s.players.p1.field.nexuses.push(nest)
    const lv3spirit = createInstance("BS01-002", s.turn, 3) // ロクケラトプス Lv3（cores3）
    s.players.p1.field.spirits.push(lv3spirit)
    const restedTarget = createInstance("BS01-001", s.turn, 1) // ゴラドン（p2、疲労状態）
    restedTarget.isRested = true
    s.players.p2.field.spirits.push(restedTarget)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: lv3spirit.instanceId,
            targetSpiritInstanceId: restedTarget.instanceId,
        }) === null,
        "Lv3スピリットは疲労状態の相手を指定してアタックできる",
    )
    assert(s.battle?.blockerInstanceId === restedTarget.instanceId, "指定した対象がブロッカーとして固定される")
}

console.log("--- Lv2以下のスピリットは指定アタックできない ---")
{
    const s = createGame(
        "yumemadoko-direct-lv2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const nest = createInstance("BS02-078", s.turn, 3) // 夢魔の寝所 Lv2
    s.players.p1.field.nexuses.push(nest)
    const lv2spirit = createInstance("BS01-002", s.turn, 2) // ロクケラトプス Lv2（cores2）
    s.players.p1.field.spirits.push(lv2spirit)
    const restedTarget = createInstance("BS01-001", s.turn, 1)
    restedTarget.isRested = true
    s.players.p2.field.spirits.push(restedTarget)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: lv2spirit.instanceId,
            targetSpiritInstanceId: restedTarget.instanceId,
        }) !== null,
        "Lv2スピリットは指定アタックできない（minLevel:3を満たさない）",
    )
}

console.log("=== BS02-063 冥犬ケルル・ベロス：Lv1-2はアタックできない ===")
{
    const s = createGame(
        "keruberos-attack-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)

    const keru = createInstance("BS02-063", s.turn, 1) // 冥犬ケルル・ベロス Lv1（cores1）
    s.players.p1.field.spirits.push(keru)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: keru.instanceId }) !== null, "ケルル・ベロスはアタックできない")
}

console.log("--- ブロックもできない ---")
{
    const s = createGame(
        "keruberos-block-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "yellow" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-002", s.turn, 1) // ロクケラトプス Lv1（p1）
    s.players.p1.field.spirits.push(attacker)
    const keru = createInstance("BS02-063", s.turn, 1) // 冥犬ケルル・ベロス Lv1（p2）
    s.players.p2.field.spirits.push(keru)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "block", instanceId: keru.instanceId }) !== null, "ケルル・ベロスはブロックできない")
}
