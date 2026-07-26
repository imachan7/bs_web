// smoke パート28（第三弾 BS03：バニラ参照ネクサス6枚の構造化）
// 収録セクション:
//   - 汎用: isVanillaCard を使うオーラ vanillaFilter（無法者の荒野Lv1-2）
//   - reviveOnDestroy: vanillaFilter・when.byBattle・revived.toHand（無法者の荒野Lv2／深緑の樹海Lv2）
//   - reviveOnDestroy: when.byBattleKillerLevel の一致・不一致（子供部屋 午前0時）
//   - fieldEvent: vanillaOnly・byBattleOnly（運命分かつ岐路Lv1-2）
//   - battleWon: role:"any"・vanillaWinnerOnly・selfMode:"source"（深緑の樹海Lv1-2）
//   - levelAs: target:"ownSpiritsVanilla" treatAs:"coresScaled"（サファイアの城壁Lv1-2）
//   - globalConstraint: "ownNexusIndestructible" condition.ownVanillaSpiritsAtLeast（サファイアの城壁Lv2）
import {
    assert,
    createGame,
    createInstance,
    destroySpirit,
    effectiveBp,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import {
    destroyNexus,
    fireBattleWonTriggers,
} from "../../server/src/logic/EffectModules"

console.log("=== 無法者の荒野Lv1-2：バニラオーラのBP加算（非バニラは対象外） ===")
{
    const s = createGame(
        "vanilla-aura-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    s.phase = "attack"
    s.turnPlayer = "p1"
    const nexus = createInstance("BS03-102", s.turn, 0) // Lv1
    const vanilla = createInstance("BS03-001", s.turn, 1) // 火精サラマンダート（バニラ、Lv1 BP2000）
    const nonVanilla = createInstance("BS03-002", s.turn, 1) // エッジホッグ（非バニラ、Lv1 BP1000）
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.field.spirits.push(vanilla, nonVanilla)
    assert(effectiveBp(s, "p1", vanilla) === 4000, "バニラはBP+2000される（2000→4000）")
    assert(effectiveBp(s, "p1", nonVanilla) === 1000, "非バニラは対象外のまま")
}

console.log("=== 無法者の荒野Lv2：byBattle破壊で疲労状態のまま復活 ===")
{
    const s = createGame(
        "revive-byBattle-rested-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    s.phase = "attack"
    s.turnPlayer = "p1"
    const nexus = createInstance("BS03-102", s.turn, 2) // Lv2
    const vanilla = createInstance("BS03-001", s.turn, 3) // Lv2
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.field.spirits.push(vanilla)
    destroySpirit(s, "p1", vanilla.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 2 },
    })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === vanilla.instanceId),
        "破壊される代わりにフィールドに残る",
    )
    assert(vanilla.isRested === true, "疲労状態で戻る")
}

console.log("=== 深緑の樹海Lv2：byBattle破壊で手札に戻る（toHand） ===")
{
    const s = createGame(
        "revive-tohand-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "blue" },
    )
    runTurnStart(s)
    s.phase = "attack"
    s.turnPlayer = "p1"
    const nexus = createInstance("BS03-106", s.turn, 1) // Lv2
    const vanilla = createInstance("BS03-001", s.turn, 3)
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.field.spirits.push(vanilla)
    const reserveBefore = s.players.p1.reserve
    destroySpirit(s, "p1", vanilla.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 2 },
    })
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === vanilla.instanceId),
        "フィールドからは除去される",
    )
    assert(s.players.p1.hand.includes("BS03-001"), "手札に戻る")
    assert(s.players.p1.reserve === reserveBefore + 3, "コアは持ち主のリザーブへ")
}

console.log("=== 子供部屋 午前0時：byBattleKillerLevelの一致・不一致 ===")
{
    const s = createGame(
        "revive-killerlevel-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "blue" },
    )
    runTurnStart(s)
    s.phase = "attack"
    s.turnPlayer = "p2" // 発生源(p1)から見て相手のアタックステップ
    const nexus = createInstance("BS03-111", s.turn, 1) // Lv2（e1: killerLv1 / e2: killerLv3）
    const v1 = createInstance("BS03-001", s.turn, 1) // killerLv1 → e1で復活
    const v3 = createInstance("BS03-005", s.turn, 1) // killerLv3 → e2で復活
    const v2 = createInstance("BS03-013", s.turn, 1) // killerLv2 → 一致なし、通常通り破壊
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.field.spirits.push(v1, v3, v2)
    destroySpirit(s, "p1", v1.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 1 },
    })
    destroySpirit(s, "p1", v3.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 3 },
    })
    destroySpirit(s, "p1", v2.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 2 },
    })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === v1.instanceId),
        "killerLv1一致：e1で復活する",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === v3.instanceId),
        "killerLv3一致：e2で復活する",
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === v2.instanceId),
        "killerLv2は不一致：通常通り破壊される",
    )
}

console.log("=== 運命分かつ岐路：fieldEvent vanillaOnly/byBattleOnlyのドロー ===")
{
    const s = createGame(
        "fieldevent-vanillaonly-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "blue" },
    )
    runTurnStart(s)
    s.phase = "attack"
    const nexus = createInstance("BS03-104", s.turn, 0) // Lv1
    const vanilla = createInstance("BS03-001", s.turn, 1)
    const nonVanilla = createInstance("BS03-002", s.turn, 1)
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.field.spirits.push(vanilla, nonVanilla)
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", vanilla.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 1 },
    })
    assert(s.players.p1.hand.length === handBefore + 1, "バニラ＋バトル破壊：1枚ドローする")
    const handAfterFirst = s.players.p1.hand.length
    destroySpirit(s, "p1", nonVanilla.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 1 },
    })
    assert(s.players.p1.hand.length === handAfterFirst, "非バニラは対象外：ドローしない")
}
console.log("=== 深緑の樹海Lv1：battleWon role:any/vanillaWinnerOnly/selfMode:sourceでネクサスにコアが乗る ===")
{
    const s = createGame(
        "battlewon-selfmode-source-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "blue" },
    )
    runTurnStart(s)
    s.turnPlayer = "p1"
    const nexus = createInstance("BS03-106", s.turn, 0) // Lv1
    const vanillaWinner = createInstance("BS03-001", s.turn, 1)
    const nonVanillaWinner = createInstance("BS03-002", s.turn, 1)
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.field.spirits.push(vanillaWinner, nonVanillaWinner)
    fireBattleWonTriggers(s, "p1", vanillaWinner, "attacker")
    assert(nexus.cores === 1, "バニラの勝利でネクサス自身にコアが1個置かれる")
    fireBattleWonTriggers(s, "p1", nonVanillaWinner, "attacker")
    assert(nexus.cores === 1, "非バニラの勝利では反応しない（vanillaWinnerOnly）")
}

console.log("=== サファイアの城壁Lv1：levelAs target:ownSpiritsVanilla treatAs:coresScaled ===")
{
    const s = createGame(
        "levelas-coresscaled-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    s.phase = "attack"
    s.turnPlayer = "p1"
    const wall = createInstance("BS03-114", s.turn, 0)
    const one = createInstance("BS03-005", s.turn, 1) // バニラ、最高Lv3
    const two = createInstance("BS03-005", s.turn, 2)
    const three = createInstance("BS03-005", s.turn, 3)
    const nonVanilla = createInstance("BS03-004", s.turn, 3) // 非バニラ（ブロントライデント）
    s.players.p1.field.nexuses.push(wall)
    s.players.p1.field.spirits.push(one, two, three, nonVanilla)
    refreshLevelAsOverrides(s)
    assert(one.levelAsContinuous === 1, "コア1個はLv1として扱う")
    assert(two.levelAsContinuous === 2, "コア2個はLv2として扱う")
    assert(three.levelAsContinuous === 3, "コア3個以上は最高Lvとして扱う")
    assert(nonVanilla.levelAsContinuous === undefined, "非バニラは対象外")

    s.phase = "main"
    refreshLevelAsOverrides(s)
    assert(one.levelAsContinuous === undefined, "自分のアタックステップ以外では無効")
}

console.log("=== サファイアの城壁Lv2：globalConstraint ownNexusIndestructible（バニラ2体では遮断されない） ===")
{
    const s = createGame(
        "ownnexusindestructible-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const wall = createInstance("BS03-114", s.turn, 2) // Lv2
    const target1 = createInstance("BS01-098", s.turn, 0)
    s.players.p1.field.nexuses.push(wall, target1)
    const v1 = createInstance("BS03-001", s.turn, 1)
    const v2 = createInstance("BS03-005", s.turn, 1)
    s.players.p1.field.spirits.push(v1, v2)
    const destroyedWithTwo = destroyNexus(s, "p1", target1.instanceId)
    assert(destroyedWithTwo === true, "バニラ2体では破壊耐性が働かず破壊される")

    const target2 = createInstance("BS01-098", s.turn, 0)
    s.players.p1.field.nexuses.push(target2)
    const v3 = createInstance("BS03-013", s.turn, 1)
    s.players.p1.field.spirits.push(v3)
    const destroyedWithThree = destroyNexus(s, "p1", target2.instanceId)
    assert(destroyedWithThree === false, "バニラ3体以上で破壊耐性が働き破壊されない")
    assert(
        s.players.p1.field.nexuses.some((n) => n.instanceId === target2.instanceId),
        "対象ネクサスは破壊されず残る",
    )
}
