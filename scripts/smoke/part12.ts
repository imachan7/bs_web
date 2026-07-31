// smoke パート12（BS02構造化 波3a）
// 収録セクション:
//   - server/src/logic/GameEngine.ts: resolveBattleのLv比較分岐（BattleState.compareByLevel）
//   - server/src/logic/EffectModules.ts: instHasCost・drawDoubleMultiplier・
//     fireTrigger の effectGrant 合成（collectGrantedTriggerActions）・
//     fireStepTriggers の condition拡張（ownColorTotalAtLeast）・
//     resolveAction の battleCompareByLevel / grantAlsoCostAll ケース
//   - server/src/logic/RuleValidator.ts: cantActByCostのtempAlsoCosts対応
//   - data/cards.json: BS02-109 エンジェルボイス・BS02-056 アルカナビースト・ケン・
//     BS02-060 道化師クラン・BS02-087 封印された魔導書（e2のみ）
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    hasArmorAgainst,
    resolveAction,
    runTurnStart,
    spiritHasKeyword,
} from "./helpers"
import { endTurn } from "../../server/src/logic/PhaseManager"

console.log("=== BS02-109 エンジェルボイス：フラッシュでバトル解決の比較をBPからLvへ切り替える ===")
{
    const s = createGame(
        "angelvoice-lv-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const atk = createInstance("BS02-074", s.turn, 1) // 風船魔人バーバル Lv1 cores1 BP5000
    s.players.p1.field.spirits.push(atk)
    const blk = createInstance("BS02-001", s.turn, 2) // リザドエッジ Lv2 cores2 BP2000
    s.players.p2.field.spirits.push(blk)
    s.players.p2.hand[0] = "BS02-109" // エンジェルボイス（コスト5・フラッシュ）
    s.players.p2.reserve = 20

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "バーバルでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "リザドエッジでブロック")
    assert(s.priorityPlayer === "p2", "ブロック後は防御側に優先権")
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) === null,
        "エンジェルボイスを使用（Lv比較へ切り替え）",
    )
    assert(s.battle?.compareByLevel === true, "compareByLevelフラグが立つ")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（バトル解決）")

    assert(!s.players.p1.field.spirits.includes(atk), "BPが高くてもLv1（低い方）のバーバルが破壊される")
    assert(s.players.p2.field.spirits.includes(blk), "Lv2のリザドエッジは生存する")
}

console.log("--- 同Lvは相打ち ---")
{
    const s = createGame(
        "angelvoice-lv-tie-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const atk = createInstance("BS02-074", s.turn, 1) // Lv1 BP5000
    s.players.p1.field.spirits.push(atk)
    const blk = createInstance("BS02-001", s.turn, 1) // Lv1 BP1000（同Lv）
    s.players.p2.field.spirits.push(blk)
    s.players.p2.hand[0] = "BS02-109"
    s.players.p2.reserve = 20

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "バーバルでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "リザドエッジでブロック")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "エンジェルボイスを使用")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（バトル解決）")

    assert(!s.players.p1.field.spirits.includes(atk), "同Lvのため攻撃側も破壊される（相打ち）")
    assert(!s.players.p2.field.spirits.includes(blk), "同Lvのため防御側も破壊される（相打ち）")
}

console.log("=== BS02-056 アルカナビースト・ケン e1：Lv3でアルカナ名スピリットのブロック時+2000 ===")
{
    const s = createGame(
        "ken-arcana-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "yellow" },
    )
    runTurnStart(s)

    const ken = createInstance("BS02-056", s.turn, 4) // Lv3 cores4
    s.players.p2.field.spirits.push(ken)
    const panDoll = createInstance("BS02-066", s.turn, 1) // アルカナドール・パン Lv1
    s.players.p2.field.spirits.push(panDoll)
    const atk = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2
    s.players.p1.field.spirits.push(atk)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ゴラドンでアタック")
    assert(act(s, "p2", { type: "block", instanceId: panDoll.instanceId }) === null, "アルカナドール・パンでブロック")
    assert(panDoll.tempBpBuff === 2000, "ケンLv3の付与効果でブロック時+2000")
}

console.log("--- 非アルカナ名はブロックしても+2000されない ---")
{
    const s = createGame(
        "ken-nonarcana-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "yellow" },
    )
    runTurnStart(s)

    const ken = createInstance("BS02-056", s.turn, 4) // Lv3
    s.players.p2.field.spirits.push(ken)
    const golad = createInstance("BS01-001", s.turn, 1) // ゴラドン（非アルカナ名）Lv1
    s.players.p2.field.spirits.push(golad)
    const atk = createInstance("BS01-002", s.turn, 1) // ロクケラトプス
    s.players.p1.field.spirits.push(atk)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: golad.instanceId }) === null, "ゴラドンでブロック")
    assert(golad.tempBpBuff === 0, "非アルカナ名は付与されない")
}

console.log("--- ケンLv2では付与されない ---")
{
    const s = createGame(
        "ken-lv2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "yellow" },
    )
    runTurnStart(s)

    const ken = createInstance("BS02-056", s.turn, 2) // Lv2 cores2
    s.players.p2.field.spirits.push(ken)
    const panDoll = createInstance("BS02-066", s.turn, 1) // アルカナドール・パン
    s.players.p2.field.spirits.push(panDoll)
    const atk = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(atk)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: panDoll.instanceId }) === null, "アルカナドール・パンでブロック")
    assert(panDoll.tempBpBuff === 0, "ケンLv2では付与効果が発動しない")
}

console.log("=== BS02-060 道化師クラン e1：黄3つ以上で自分のスピリットがコスト2としても扱われる ===")
{
    const s = createGame(
        "clan-alsocost-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    const clan = createInstance("BS02-060", s.turn, 3) // 道化師クラン Lv2 cores3
    s.players.p1.field.spirits.push(clan)
    const piyon = createInstance("BS02-049", s.turn, 1) // ピヨン（黄・コスト0）
    s.players.p1.field.spirits.push(piyon)
    const chun = createInstance("BS02-051", s.turn, 1) // チュンポポ（黄・コスト1）
    s.players.p1.field.spirits.push(chun)

    runTurnStart(s) // スタートステップ：黄3体（クラン+ピヨン+チュンポポ）以上 → grantAlsoCostAll発火

    assert(clan.tempAlsoCosts.includes(2), "クラン自身もコスト2として扱われる")
    assert(piyon.tempAlsoCosts.includes(2), "ピヨンもコスト2として扱われる")
    assert(chun.tempAlsoCosts.includes(2), "チュンポポもコスト2として扱われる")

    // 2026-07-31: grantKeywordAll から lendSelfThisTurn + kind:"keywordGrant" へ移行。
    // 移行時に keywordGrant.costFilter が静的コストしか見ておらず、クランで「コスト2としても扱う」
    // スピリットが対象から外れる退行が出たため、instMatchesCostFilter（tempAlsoCosts を見る）を新設した。
    // 実コスト2の個体と、クランで2扱いになった個体の**両方**が装甲を得ることを固定する
    const pom = createInstance("BS02-054", s.turn, 1) // ポム（黄・実コスト2）
    s.players.p1.field.spirits.push(pom)

    s.players.p1.hand[0] = "BS02-101" // リフレクションアーマー：コスト2のスピリット全員に【装甲】
    s.players.p1.reserve = 10

    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "リフレクションアーマーを使用")
    assert(spiritHasKeyword(s, "p1", pom, "armor"), "実コスト2のスピリットは装甲を得る")
    assert(
        spiritHasKeyword(s, "p1", piyon, "armor"),
        "実コスト0のピヨンもクランでコスト2として扱われている間は装甲を得る",
    )
    assert(
        hasArmorAgainst(piyon, ["red"]),
        "装甲の実効判定（armorColorsGranted経由）でもクランのコスト2扱いが効く",
    )
    assert(getCard(piyon.cardId).cost === 0, "ピヨンの実コストは変わらない")

    endTurn(s)
    assert(piyon.tempAlsoCosts.length === 0, "ターン終了でtempAlsoCostsがリセットされる")
    assert(!spiritHasKeyword(s, "p1", pom, "armor"), "ターンが変わるとlendSelfThisTurnの貸与も消え、装甲は外れる")
}

console.log("=== BS02-087 封印された魔導書 e2：自分のアタックステップ中は効果ドローが2倍 ===")
{
    const s = createGame(
        "sealedbook-drawdouble-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const book = createInstance("BS02-087", s.turn, 0) // Lv1 cores0
    s.players.p1.field.nexuses.push(book)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")

    const before1 = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "draw", count: 1 })
    assert(s.players.p1.hand.length === before1 + 1, "Lv1では効果ドローは2倍にならない")

    book.cores = 3 // Lv2へ
    const before2 = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "draw", count: 1 })
    assert(s.players.p1.hand.length === before2 + 2, "Lv2の自分アタックステップ中は効果ドローが2倍になる")

    s.turnPlayer = "p2" // 相手ターンをシミュレート（フェーズはattackのまま）
    const before3 = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "draw", count: 1 })
    assert(s.players.p1.hand.length === before3 + 1, "相手ターンでは2倍にならない")
    s.turnPlayer = "p1" // 後続に影響しないよう戻す
}
