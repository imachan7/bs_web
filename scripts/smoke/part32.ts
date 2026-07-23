// smoke パート32（第三弾 BS03 条件付き誘発6枚）
// 収録セクション:
//   - triggered onBattle + exhaustAllByLevel level:"lastBattleDestroyed"（BS03-021 魔界伯爵ヴィール）
//   - triggered onBattle + voidCoreToOwnNexuses（BS03-101 ボルカノ・ゴレム）
//   - fieldEvent ownNexusDestroyed（BS03-082 シャークハンマー）
//   - fieldEvent ownMagicUsed + condition selfIsAttacking（BS03-050 キノコノコ）
//   - triggered onBlock + refreshOne familyFilter（BS03-040 ベル・ダンディア e1）
//   - coreStepBonus + condition ownFieldHasNames（BS03-040 ベル・ダンディア e2）
//   - reductionGrant keywordFilter（BS03-027 フルミンゴ）
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveCost,
    engineRunTurnStart,
    getCard,
    runTurnStart,
} from "./helpers"
import { destroyNexus, resolveMagic } from "../../server/src/logic/EffectModules"

console.log("=== BS03-021 魔界伯爵ヴィールLv3：ブロッカー破壊で同Lvの両陣営スピリットが疲労 ===")
{
    const s = createGame(
        "viel-lastbattledestroyed-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const viel = createInstance("BS03-021", s.turn, 6) // Lv3 cores6 BP8000
    s.players.p1.field.spirits.push(viel)
    const p1Lv2 = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2（無関係の自陣営スピリット）
    s.players.p1.field.spirits.push(p1Lv2)
    const p1Lv1 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1（対象外の確認用）
    s.players.p1.field.spirits.push(p1Lv1)

    const blocker = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 cores3 BP3000（ブロッカー）
    s.players.p2.field.spirits.push(blocker)
    const p2Lv2 = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2（無関係の相手スピリット）
    s.players.p2.field.spirits.push(p2Lv2)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: viel.instanceId }) === null, "ヴィールでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（ブロック後は防御側が優先権を持つ）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(!s.players.p2.field.spirits.includes(blocker), "ブロッカーは破壊される（BP8000>3000）")
    assert(s.lastBattleDestroyedLevel === 2, "破壊されたブロッカーのLv2が記録される")
    assert(p1Lv2.isRested === true, "自陣営のLv2スピリットも疲労する（範囲効果）")
    assert(p2Lv2.isRested === true, "相手陣営のLv2スピリットも疲労する（範囲効果）")
    assert(p1Lv1.isRested === false, "Lv1スピリットは対象外")
}

console.log("=== BS03-101 ボルカノ・ゴレム：勝利でボイドから自分の青ネクサスすべてにコア+1 ===")
{
    const s = createGame(
        "volcanogolem-test",
        { p1: "blue", p2: "red" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)

    const golem = createInstance("BS03-101", s.turn, 1) // Lv1 cores1 BP6000
    s.players.p1.field.spirits.push(golem)
    const blueNexus = createInstance("BS03-113", s.turn, 0) // 力奪う凱旋門（青）
    s.players.p1.field.nexuses.push(blueNexus)
    const whiteNexus = createInstance("BS03-109", s.turn, 0) // 極光の大地（白・対象外）
    s.players.p1.field.nexuses.push(whiteNexus)

    const blocker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(blocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: golem.instanceId }) === null, "ボルカノ・ゴレムでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（ブロック後は防御側が優先権を持つ）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(!s.players.p2.field.spirits.includes(blocker), "ブロッカーは破壊される（BP6000>1000）")
    assert(blueNexus.cores === 1, "青のネクサスにボイドからコア+1")
    assert(whiteNexus.cores === 0, "青以外のネクサスは対象外")
}

console.log("=== BS03-082 シャークハンマー：自分のネクサス破壊で回復、相手のネクサス破壊では回復しない ===")
{
    const s = createGame(
        "sharkhammer-test",
        { p1: "blue", p2: "blue" },
        { p1: "blue", p2: "blue" },
    )
    runTurnStart(s)

    const shark1 = createInstance("BS03-082", s.turn, 1) // Lv1 自分（p1）
    shark1.isRested = true
    s.players.p1.field.spirits.push(shark1)
    const shark2 = createInstance("BS03-082", s.turn, 1) // Lv1 相手（p2）
    shark2.isRested = true
    s.players.p2.field.spirits.push(shark2)

    const p2Nexus = createInstance("BS03-109", s.turn, 0)
    s.players.p2.field.nexuses.push(p2Nexus)

    assert(destroyNexus(s, "p2", p2Nexus.instanceId) === true, "p2のネクサスを破壊")
    assert(!shark2.isRested, "自分（p2）のネクサス破壊でシャークハンマーは回復する")
    assert(shark1.isRested, "相手（p1）のシャークハンマーは回復しない")
}

console.log("=== BS03-050 キノコノコLv2：アタック中のマジック使用でBP+1000、非アタック中は不発 ===")
{
    const s = createGame(
        "kinokonoko-test",
        { p1: "yellow", p2: "red" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)

    const kinoko = createInstance("BS03-050", s.turn, 2) // Lv2 cores2
    s.players.p1.field.spirits.push(kinoko)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: kinoko.instanceId }) === null, "キノコノコでアタック（未ブロック）")
    resolveMagic(s, "p1", "BS01-126", "flash") // シャドウエリクサー（lifeCharge。BPには無関係）
    assert(kinoko.tempBpBuff === 1000, "アタック中のマジック使用でBP+1000")
}
{
    const s = createGame(
        "kinokonoko-noattack-test",
        { p1: "yellow", p2: "red" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)

    const kinoko = createInstance("BS03-050", s.turn, 2) // Lv2 cores2
    s.players.p1.field.spirits.push(kinoko)

    resolveMagic(s, "p1", "BS01-126", "flash")
    assert(kinoko.tempBpBuff === 0, "アタックしていない間はマジック使用しても発動しない")
}

console.log("=== BS03-040 ベル・ダンディア e1：ブロック時に系統「巨獣」を持つ自分のスピリット1体を回復 ===")
{
    const s = createGame(
        "belldandia-refresh-test",
        { p1: "red", p2: "white" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)

    const belldandia = createInstance("BS03-040", s.turn, 2) // Lv2 cores2
    s.players.p2.field.spirits.push(belldandia)
    const kyoju = createInstance("BS01-088", s.turn, 1) // タワーミットクラブ（系統:巨獣）
    kyoju.isRested = true
    s.players.p2.field.spirits.push(kyoju)

    const atk = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(atk)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(
        act(s, "p2", { type: "block", instanceId: belldandia.instanceId }) === null,
        "ベル・ダンディアでブロック",
    )
    assert(getCard(kyoju.cardId).family.includes("巨獣"), "前提: タワーミットクラブは系統「巨獣」を持つ")
    assert(!kyoju.isRested, "系統「巨獣」を持つ疲労中スピリットが回復する")
}

console.log("=== BS03-040 ベル・ダンディア e2：3名がそろえばコアステップ+1、欠ければ+0 ===")
{
    const s = createGame(
        "belldandia-corestep-test",
        { p1: "white", p2: "red" },
        { p1: "white", p2: "red" },
    )
    const belldandia = createInstance("BS03-040", s.turn, 3) // Lv3 cores3
    s.players.p1.field.spirits.push(belldandia)
    const uldine = createInstance("BS01-082", s.turn, 1) // ウル・ディーネ
    s.players.p1.field.spirits.push(uldine)
    const scruldia = createInstance("BS02-042", s.turn, 1) // スクルディア
    s.players.p1.field.spirits.push(scruldia)

    const reserveBefore = s.players.p1.reserve
    engineRunTurnStart(s)
    assert(
        s.players.p1.reserve === reserveBefore + 2,
        "3名そろっている間はコアステップのコアが+1され、通常の1個と合わせて+2される",
    )
}
{
    const s = createGame(
        "belldandia-corestep-missing-test",
        { p1: "white", p2: "red" },
        { p1: "white", p2: "red" },
    )
    const belldandia = createInstance("BS03-040", s.turn, 3) // Lv3 cores3
    s.players.p1.field.spirits.push(belldandia)
    const uldine = createInstance("BS01-082", s.turn, 1) // ウル・ディーネのみ（スクルディアが欠けている）
    s.players.p1.field.spirits.push(uldine)

    const reserveBefore = s.players.p1.reserve
    engineRunTurnStart(s)
    assert(s.players.p1.reserve === reserveBefore + 1, "3名そろっていなければコアステップは+0のまま")
}

console.log("=== BS03-027 フルミンゴLv2：手札の【神速】持ちスピリットに緑の軽減シンボルを付与 ===")
{
    const s = createGame(
        "flumingo-test",
        { p1: "green", p2: "red" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const flumingo = createInstance("BS03-027", s.turn, 3) // Lv2 cores3
    s.players.p1.field.spirits.push(flumingo)
    s.players.p1.hand[0] = "BS02-026" // マッハジー（【神速】持ち・コスト1）
    s.players.p1.hand[1] = "BS03-025" // スタッグシザー（【神速】なし・コスト1・reduction:[]）

    assert(
        effectiveCost(s, "p1", getCard("BS02-026")) === 0,
        "神速持ちの手札スピリットは緑軽減シンボルが付与されコストが下がる",
    )
    assert(
        effectiveCost(s, "p1", getCard("BS03-025")) === 1,
        "神速を持たない手札スピリットは軽減シンボルを与えられずコストそのまま",
    )
}
