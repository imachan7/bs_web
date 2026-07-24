// smoke パート26（第三弾 BS03 効果構造化バッチ：条件付きトリガー3種・条件付きマジック・オーラ条件・新規4アクション）
// 収録セクション:
//   - 汎用: destroyAllNexusesWithCores（コア1個以上の両陣営ネクサスをすべて破壊）
//   - 汎用: voidCoreToAllOwnByFamily（指定系統いずれか持ちの自分スピリット全員にコアを置く）
//   - 汎用: voidCoreToTarget（対象指定 / フォールバックはBP最大）
//   - 汎用: refreshByFamilyAuto（疲労中スピリットの最多系統を自動選択して回復）
//   - triggered condition: ownFieldHasColorSpirit（BS03-056 オチョゴ）
//   - triggered condition: targetSameLevelAsSelf（BS03-008 剣竜ステゴラーサウルス）
//   - triggered condition: ownFieldHasColorNexus（BS03-065 天使キュリオ）
//   - aura condition: ownHasKeyword（BS03-004 ブロントライデント）
//   - magic condition: ownFamilyCountAtLeast（BS03-149 デルタクラッシュ）
import {
    assert,
    createGame,
    createInstance,
    effectiveBp,
    resolveAction,
    runTurnStart,
} from "./helpers"
import { fireTrigger, resolveMagic } from "../../server/src/logic/EffectModules"

console.log("=== 汎用 destroyAllNexusesWithCores：コアが1個以上の両陣営ネクサスをすべて破壊 ===")
{
    const s = createGame(
        "destroyallnexuseswithcores-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const p1Cored = createInstance("BS01-098", s.turn, 2) // コアあり
    const p1Empty = createInstance("BS01-106", s.turn, 0) // コアなし
    const p2Cored = createInstance("BS01-112", s.turn, 4) // コアあり
    s.players.p1.field.nexuses.push(p1Cored, p1Empty)
    s.players.p2.field.nexuses.push(p2Cored)
    resolveAction(s, "p1", null, { type: "destroyAllNexusesWithCores" })
    assert(
        s.players.p1.field.nexuses.length === 1 && s.players.p1.field.nexuses[0]?.instanceId === p1Empty.instanceId,
        "自分のコアなしネクサスは残る",
    )
    assert(s.players.p2.field.nexuses.length === 0, "相手のコアありネクサスも破壊される（両陣営対象）")
}

console.log("=== 汎用 voidCoreToAllOwnByFamily：指定系統いずれか持ちの自分スピリット全員にコアを置く ===")
{
    const s = createGame(
        "voidcoretoallownbyfamily-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const jumo = createInstance("BS01-054", s.turn, 1) // 系統:樹魔
    const tsumedori = createInstance("BS01-059", s.turn, 1) // 系統:爪鳥
    const other = createInstance("BS01-002", s.turn, 1) // 系統:地竜（対象外）
    s.players.p1.field.spirits.push(jumo, tsumedori, other)
    resolveAction(s, "p1", null, {
        type: "voidCoreToAllOwnByFamily",
        families: ["樹魔", "爪鳥"],
        count: 2,
    })
    assert(jumo.cores === 3, "樹魔はコア+2される")
    assert(tsumedori.cores === 3, "爪鳥はコア+2される")
    assert(other.cores === 1, "対象外の系統はコアが変化しない")
}

console.log("=== 汎用 voidCoreToTarget：targetInstanceId指定時はその対象にコアを置く ===")
{
    const s = createGame(
        "voidcoretotarget-explicit-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const low = createInstance("BS01-001", s.turn, 1) // Lv1 BP1000
    const high = createInstance("BS01-002", s.turn, 3) // Lv3 BP4000
    s.players.p1.field.spirits.push(low, high)
    resolveAction(s, "p1", null, { type: "voidCoreToTarget", count: 1 }, low.instanceId)
    assert(low.cores === 2 && high.cores === 3, "BP最大でなくても指定した対象にコアが置かれる")
}

console.log("=== 汎用 voidCoreToTarget：targetInstanceId省略時は自分の実効BP最大にフォールバック ===")
{
    const s = createGame(
        "voidcoretotarget-fallback-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const low = createInstance("BS01-001", s.turn, 1) // Lv1 BP1000
    const high = createInstance("BS01-002", s.turn, 3) // Lv3 BP4000
    s.players.p1.field.spirits.push(low, high)
    resolveAction(s, "p1", null, { type: "voidCoreToTarget", count: 1 })
    assert(high.cores === 4 && low.cores === 1, "対象未指定時は実効BP最大のスピリットにコアが置かれる")
}

console.log("=== 汎用 refreshByFamilyAuto：疲労中スピリットの最多系統を自動選択して回復 ===")
{
    const s = createGame(
        "refreshbyfamilyauto-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const tousin1 = createInstance("BS03-072", s.turn, 1) // 系統:闘神
    const tousin2 = createInstance("BS03-076", s.turn, 1) // 系統:闘神
    const other = createInstance("BS01-001", s.turn, 1) // 系統:爬獣（少数派）
    tousin1.isRested = true
    tousin2.isRested = true
    other.isRested = true
    s.players.p1.field.spirits.push(tousin1, tousin2, other)
    resolveAction(s, "p1", null, { type: "refreshByFamilyAuto", count: 3 })
    assert(!tousin1.isRested && !tousin2.isRested, "最多系統（闘神）の疲労スピリットは回復する")
    assert(other.isRested, "少数派の系統は回復対象に選ばれない")
}

console.log("=== triggered condition ownFieldHasColorSpirit：BS03-056 オチョゴ（緑スピリット不在では不発） ===")
{
    const s = createGame(
        "bs03-056-nogreen-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const ochogo = createInstance("BS03-056", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(ochogo)
    fireTrigger(s, "p1", ochogo, "onAttack")
    assert(ochogo.cores === 1, "緑のスピリットがいなければコアは置かれない")
}
{
    const s = createGame(
        "bs03-056-green-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const ochogo = createInstance("BS03-056", s.turn, 1) // Lv1
    const green = createInstance("BS01-054", s.turn, 1) // 緑
    s.players.p1.field.spirits.push(ochogo, green)
    fireTrigger(s, "p1", ochogo, "onAttack")
    assert(ochogo.cores === 2, "自分のフィールドに緑のスピリットがいれば発火してコアが置かれる")
}

console.log("=== triggered condition targetSameLevelAsSelf：BS03-008 剣竜ステゴラーサウルス ===")
{
    const s = createGame(
        "bs03-008-match-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    const stego = createInstance("BS03-008", s.turn, 2) // Lv1
    const blocker = createInstance("BS01-001", s.turn, 1) // Lv1（同レベル）
    s.players.p1.field.spirits.push(stego)
    s.players.p2.field.spirits.push(blocker)
    fireTrigger(s, "p1", stego, "onBlocked", undefined, blocker.instanceId)
    assert(stego.tempBpBuff === 3000, "同じLvのスピリットにブロックされたときはBP+3000する")
}
{
    const s = createGame(
        "bs03-008-mismatch-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    const stego = createInstance("BS03-008", s.turn, 2) // Lv1
    const blocker = createInstance("BS01-002", s.turn, 2) // Lv2（レベル不一致）
    s.players.p1.field.spirits.push(stego)
    s.players.p2.field.spirits.push(blocker)
    fireTrigger(s, "p1", stego, "onBlocked", undefined, blocker.instanceId)
    assert(stego.tempBpBuff === 0, "レベルが異なるスピリットにブロックされたときは発火しない")
}

console.log("=== triggered condition ownFieldHasColorNexus：BS03-065 天使キュリオ ===")
{
    const s = createGame(
        "bs03-065-nogreen-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const curio = createInstance("BS03-065", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(curio)
    fireTrigger(s, "p1", curio, "onBlock")
    assert(curio.cores === 1, "緑のネクサスがなければ発火しない")
}
{
    const s = createGame(
        "bs03-065-green-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const curio = createInstance("BS03-065", s.turn, 1) // Lv1
    const greenNexus = createInstance("BS01-106", s.turn, 0)
    s.players.p1.field.spirits.push(curio)
    s.players.p1.field.nexuses.push(greenNexus)
    fireTrigger(s, "p1", curio, "onBlock")
    assert(curio.cores === 2, "自分のフィールドに緑のネクサスがあれば発火してコアが置かれる")
}

console.log("=== aura condition ownHasKeyword：BS03-004 ブロントライデント ===")
{
    const s = createGame(
        "bs03-004-noawaken-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    const bront = createInstance("BS03-004", s.turn, 1) // Lv1 BP3000
    s.players.p1.field.spirits.push(bront)
    assert(effectiveBp(s, "p1", bront) === 3000, "覚醒持ちがいなければBP修正なし")
}
{
    const s = createGame(
        "bs03-004-awaken-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    const bront = createInstance("BS03-004", s.turn, 1) // Lv1 BP3000
    const awakener = createInstance("BS01-013", s.turn, 1) // 【覚醒】持ち
    s.players.p1.field.spirits.push(bront, awakener)
    assert(effectiveBp(s, "p1", bront) === 5000, "自分のフィールドに覚醒持ちがいればBP+2000される")
}

console.log("=== magic condition ownFamilyCountAtLeast：BS03-149 デルタクラッシュ ===")
{
    const s = createGame(
        "bs03-149-shortage-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const tousin1 = createInstance("BS03-072", s.turn, 1)
    const tousin2 = createInstance("BS03-076", s.turn, 1)
    s.players.p1.field.spirits.push(tousin1, tousin2)
    const enemy = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    resolveMagic(s, "p1", "BS03-149", "flash")
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === enemy.instanceId),
        "闘神が3体未満なら発動せず相手スピリットは破壊されない",
    )
}
{
    const s = createGame(
        "bs03-149-met-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const tousin1 = createInstance("BS03-072", s.turn, 1)
    const tousin2 = createInstance("BS03-076", s.turn, 1)
    const tousin3 = createInstance("BS03-072", s.turn, 1)
    s.players.p1.field.spirits.push(tousin1, tousin2, tousin3)
    const enemy = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    resolveMagic(s, "p1", "BS03-149", "flash")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === enemy.instanceId),
        "闘神が3体以上いれば発動し相手スピリットが破壊される",
    )
}
