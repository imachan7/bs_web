// smoke パート331（BS15 赤・紫バッチ1: 31種）
// 新設した器（burstのpayCost／reviveOnDestroyのtoBurst／constraint lifeDamagePerSpiritPerTurn／
// destroyAllExceptChosenColors／costMod set+ownBurstSet／keywordGrant clash／coreRemove countCounter／
// levelAs ownLifeAtLeast／destroyFieldExceptOpponentChosenColor／coreToVoidEqualizeByTotal／
// discardHandAnyThenCoreRemove／burstSummonSelfIfTargetBpAtLeast）を確認する
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    destroySpirit,
    effectiveBp,
    getCard,
    minLevelCores,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    giveBp,
} from "./helpers"
import type { GameState } from "./helpers"
import { placeBurst } from "../../server/src/logic/EffectModules"
import { fireFieldEventTriggers } from "../../server/src/logic/triggers"
import { effectiveCost } from "../../shared/cost"
import { instLevels, lifeDamageLimit, spiritHasKeyword } from "../../shared/rules"

function game(seed: string, p1Color = "red", p2Color = "purple"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1Color, p2: p2Color })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: cardId の機械確認 ===")
{
    assert(getCard("BS15-001").name === "タッチベット・モンキ", "BS15-001")
    assert(getCard("BS15-004").name === "ハンゾウ・シノビ・ドラゴン", "BS15-004")
    assert(getCard("BS15-005").name === "虚獣チャンプボンゴル", "BS15-005")
    assert(getCard("BS15-006").name === "ゴルホーン・イーグル", "BS15-006")
    assert(getCard("BS15-008").name === "パラディン・ドラゴン", "BS15-008")
    assert(getCard("BS15-009").name === "虚龍帝カタストロフドラゴン", "BS15-009")
    assert(getCard("BS15-055").name === "マタドーラ", "BS15-055")
    assert(getCard("BS15-075").name === "ブラッディロンド", "BS15-075")
    assert(getCard("BS15-076").name === "妖華吸血爪", "BS15-076")
    assert(getCard("BS15-X01").name === "刀の覇王ムサシード・アシュライガー", "BS15-X01")
    assert(getCard("BS15-X02").name === "虚皇帝ネザード・バァラル", "BS15-X02")
    assert(getCard("X014").name === "超星覇龍ヤマトヴルム・ノヴァ", "X014")
    assert(getCard("BS15-016").name === "闇騎士ガウェイン", "BS15-016")
}

console.log("=== BS15-001 タッチベット・モンキ：自分のフィールドが赤しかない間、アタック時BP+2000 ===")
{
    const s = game("p331-001")
    const monk = createInstance("BS15-001", s.turn, minLevelCores(getCard("BS15-001")))
    s.players.p1.field.spirits.push(monk)
    refreshLevelAsOverrides(s)
    s.phase = "attack"
    assert(effectiveBp(s, "p1", monk) === 1000, "アタックしていない間は乗らない（『このスピリットのアタック時』）")
    s.battle = { attackerInstanceId: monk.instanceId, blockerInstanceId: null, directed: false } as never
    assert(effectiveBp(s, "p1", monk) === 1000 + 2000, "赤しかないのでBP+2000")
    const other = createInstance("BS01-030", s.turn, 1) // 紫（赤以外）
    s.players.p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", monk) === 1000, "紫が混ざるとBP+2000は乗らない")
}

console.log("=== BS15-004 ハンゾウ：バースト（色数につき破壊、コストを支払って自身を召喚） ===")
{
    const s = game("p331-004-burst")
    placeBurst(s, "p1", "BS15-004")
    const prey = createInstance("BS01-001", s.turn, 1)
    prey.cores = 1
    s.players.p2.field.spirits.push(prey) // 相手フィールド赤1色
    refreshLevelAsOverrides(s)
    const reserveBefore = s.players.p1.reserve
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === prey.instanceId), "色1色につきコア1個の相手を破壊")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS15-004"),
        "破壊後にコストを支払って自身を召喚した",
    )
    assert(s.players.p1.reserve < reserveBefore, "コストを支払っている（無償ではない）")
}

console.log("=== BS15-004 Lv2-3：破壊時にバーストが無ければ自身をバーストとしてセットできる ===")
{
    const s = game("p331-004-revive")
    const hanzo = createInstance("BS15-004", s.turn, 2) // Lv2
    s.players.p1.field.spirits.push(hanzo)
    refreshLevelAsOverrides(s)
    assert(s.players.p1.burst === null, "バースト未セット")
    destroySpirit(s, "p1", hanzo.instanceId)
    assert(s.players.p1.burst === "BS15-004", "破壊される代わりにバーストとしてセットされた")
    assert(!s.players.p1.trashCards.includes("BS15-004"), "トラッシュには置かれていない")
}

console.log("=== BS15-005 虚獣チャンプボンゴル：バーストセット中、ライフはスピリット1体から1までしか減らない ===")
{
    const s = game("p331-005")
    const bongoru = createInstance("BS15-005", s.turn, minLevelCores(getCard("BS15-005")))
    s.players.p2.field.spirits.push(bongoru)
    s.players.p2.burstSet = true
    s.players.p2.burst = "BS01-001"
    refreshLevelAsOverrides(s)
    s.players.p1.life = 5
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    const limit = lifeDamageLimit(s, "p1", attacker)
    assert(limit.max === 1, "神将のライフ上限により1までしか減らせない")
}

console.log("=== BS15-006 ゴルホーン・イーグル：【激突】を自身と系統「皇獣」に持つ ===")
{
    const s = game("p331-006")
    const eagle = createInstance("BS15-006", s.turn, minLevelCores(getCard("BS15-006")))
    const ally = createInstance("BS15-001", s.turn, minLevelCores(getCard("BS15-001"))) // 皇獣
    const stranger = createInstance("BS01-001", s.turn, 1) // 皇獣ではない
    s.players.p1.field.spirits.push(eagle, ally, stranger)
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p1", eagle, "clash"), "自身が【激突】を持つ")
    assert(spiritHasKeyword(s, "p1", ally, "clash"), "系統「皇獣」のスピリットにも【激突】が付与される")
    assert(!spiritHasKeyword(s, "p1", stranger, "clash"), "皇獣以外には付与されない")
}

console.log("=== BS15-008 パラディン・ドラゴン：お互い1色ずつ指定し、指定外の色を持つスピリットを両陣営とも破壊 ===")
{
    const s = game("p331-008")
    const paladin = createInstance("BS15-008", s.turn, minLevelCores(getCard("BS15-008")))
    s.players.p1.field.spirits.push(paladin)
    const ownRed = createInstance("BS01-001", s.turn, 1) // 赤
    s.players.p1.field.spirits.push(ownRed)
    // 相手は赤2体・緑1体：色を指定すると赤を残すのが最多（自分視点で被害最小の色を選ぶ決定的簡略化）なので緑だけ破壊される
    const oppRed1 = createInstance("BS01-001", s.turn, 1)
    const oppRed2 = createInstance("BS01-002", s.turn, 1)
    const oppPurple = createInstance("BS01-030", s.turn, 1)
    s.players.p2.field.spirits.push(oppRed1, oppRed2, oppPurple)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", paladin, { type: "destroyAllExceptChosenColors" })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === ownRed.instanceId) ||
            s.players.p1.field.spirits.some((sp) => sp.instanceId === paladin.instanceId),
        "自陣は指定色（コスト最大化の自動選択）で少なくとも一部残る",
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === oppRed1.instanceId) &&
            s.players.p2.field.spirits.some((sp) => sp.instanceId === oppRed2.instanceId),
        "相手は最多の赤を指定して赤2体を残す",
    )
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === oppPurple.instanceId), "指定されなかった紫は破壊される")
}

console.log("=== BS15-009 虚龍帝カタストロフドラゴン：バーストセット中は手札コスト7固定 ===")
{
    const s = game("p331-009")
    s.players.p1.hand.push("BS15-009")
    s.players.p1.burstSet = true
    s.players.p1.burst = "BS01-001"
    const cost = effectiveCost(s, "p1", getCard("BS15-009"))
    assert(cost === 7, "バーストセット中はコスト7固定")
    s.players.p1.burstSet = false
    s.players.p1.burst = null
    const cost2 = effectiveCost(s, "p1", getCard("BS15-009"))
    assert(cost2 === 11, "セットしていなければ通常コスト（軽減無し）11")
}

console.log("=== BS15-013 エレフォッグ：破壊時、相手フィールドの色数につき相手のコアをリザーブへ ===")
{
    const s = game("p331-013")
    const efog = createInstance("BS15-013", s.turn, minLevelCores(getCard("BS15-013")))
    s.players.p1.field.spirits.push(efog)
    const oppSpirit = createInstance("BS01-001", s.turn, 1) // 赤
    oppSpirit.cores = 3
    s.players.p2.field.spirits.push(oppSpirit)
    const oppNexus = createInstance("BS01-106", s.turn, 1) // 別色ネクサス（色数を増やす目的）
    s.players.p2.field.nexuses.push(oppNexus)
    refreshLevelAsOverrides(s)
    const reserveBefore = s.players.p2.reserve
    destroySpirit(s, "p1", efog.instanceId)
    assert(s.players.p2.reserve > reserveBefore, "相手のコアがリザーブへ移動した")
}

console.log("=== BS15-016 闇騎士ガウェイン：ライフ3以上の間Lv3として扱う ===")
{
    const s = game("p331-016", "purple", "red")
    const gawain = createInstance("BS15-016", s.turn, 2) // Lv2のコア数
    s.players.p1.field.spirits.push(gawain)
    s.players.p1.life = 3
    refreshLevelAsOverrides(s)
    assert(currentLevel(gawain).level === 3, "ライフ3以上ならLv3として扱う")
    s.players.p1.life = 2
    refreshLevelAsOverrides(s)
    assert(currentLevel(gawain).level === 2, "ライフ3未満なら本来のLv")
}

console.log("=== BS15-055 マタドーラ：相手が自分のスピリットの色を1色指定し、指定外の色の相手スピリット/ネクサスを破壊 ===")
{
    const s = game("p331-055")
    // 【合体時】アクション自体（destroyFieldExceptOpponentChosenColor）の動作確認が目的なので、
    // 合体状態は組まずスピリット状態のまま resolveAction で直接発揮させる
    const matadora = createInstance("BS15-055", s.turn, 1)
    s.players.p1.field.spirits.push(matadora)
    const oppRed = createInstance("BS01-001", s.turn, 1) // 赤
    const oppPurple = createInstance("BS01-030", s.turn, 1) // 紫
    s.players.p2.field.spirits.push(oppRed, oppPurple)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", matadora, { type: "destroyFieldExceptOpponentChosenColor" })
    const remaining = s.players.p2.field.spirits.length
    assert(remaining === 1, "相手視点で被害が最小になる色が選ばれ、1体だけ残る（非対話の決定的簡略化）")
}

console.log("=== BS15-075 ブラッディロンド：コア合計が多い方がボイドへ（メイン）／BP+2000（フラッシュ） ===")
{
    const s = game("p331-075", "purple", "red")
    s.players.p1.reserve = 10
    s.players.p2.reserve = 2
    resolveAction(s, "p1", null, {
        type: "removeCores",
        from: ["spirit", "nexus", "reserve", "trash"],
        to: "void",
        count: 0,
        downTo: "equalize",
        chooser: "owner",
    })
    assert(s.players.p1.reserve === 2, "多かった自分がボイドへ置き、相手と同じ合計になった")
    const target = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "bpBuff", amount: 2000, anySide: true }, target.instanceId)
    assert(effectiveBp(s, "p2", target) === 1000 + 2000, "指定したスピリットがBP+2000された")
}

console.log("=== BS15-076 妖華吸血爪：手札を好きなだけ破棄し、1枚につき相手のコアをトラッシュへ ===")
{
    const s = game("p331-076", "purple", "red")
    s.players.p1.hand = ["BS01-001", "BS01-030"] // 開始時のドロー分をクリアして枚数を固定する
    const oppSpirit = createInstance("BS01-001", s.turn, 1)
    oppSpirit.cores = 3
    s.players.p2.field.spirits.push(oppSpirit)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "discardHandAnyThenCoreRemove" })
    assert(s.players.p1.hand.length === 0, "非対話では手札をすべて破棄する（決定的簡略化）")
    assert(oppSpirit.cores === 1, "破棄した2枚ぶんコア2個をトラッシュへ")
}

console.log("=== BS15-X01 刀の覇王：バースト（相手のアタック後、BP5000以上ならコスト無しで自身を召喚しBP+3000） ===")
{
    const s = game("p331-x01")
    placeBurst(s, "p1", "BS15-X01")
    const attacker = createInstance("BS01-002", s.turn, 1)
    giveBp(s, attacker, 10000) // BP5000以上を確実にする
    s.players.p2.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p2", attacker) >= 5000, "前提：アタッカーのBPは5000以上")
    fireFieldEventTriggers(s, "p2", "anySpiritAttacked", { pid: "p2", inst: attacker }, undefined, attacker.instanceId)
    const summoned = s.players.p1.field.spirits.find((sp) => sp.cardId === "BS15-X01")
    assert(summoned !== undefined, "BP5000以上のアタック後、コストを支払わずに自身を召喚した")
    if (summoned) assert(summoned.tempBpBuff === 3000, "召喚後、このターンの間BP+3000した")
}

console.log("=== BS15-X01：相手のアタックがBP5000未満なら発動しない ===")
{
    const s = game("p331-x01-low")
    placeBurst(s, "p1", "BS15-X01")
    const attacker = createInstance("BS01-001", s.turn, 1) // Lv1 BP1000
    s.players.p2.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    fireFieldEventTriggers(s, "p2", "anySpiritAttacked", { pid: "p2", inst: attacker }, undefined, attacker.instanceId)
    assert(!s.players.p1.field.spirits.some((sp) => sp.cardId === "BS15-X01"), "BP5000未満なら発動しない")
}

console.log("=== BS15-X02 虚皇帝ネザード・バァラル：バーストをセットしていない間コスト11、相手のLvコスト+1 ===")
{
    const s = game("p331-x02", "purple", "red")
    s.players.p1.hand.push("BS15-X02")
    s.players.p1.burstSet = false
    s.players.p1.burst = null
    assert(effectiveCost(s, "p1", getCard("BS15-X02")) === 11, "セットしていない間コスト11")
    s.players.p1.burstSet = true
    s.players.p1.burst = "BS01-001"
    assert(effectiveCost(s, "p1", getCard("BS15-X02")) === 7, "セットしていれば通常コスト（軽減元が無いので素のコスト7）")
    const opp = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(opp)
    const zaval = createInstance("BS15-X02", s.turn, 1)
    s.players.p1.field.spirits.push(zaval)
    refreshLevelAsOverrides(s)
    assert(instLevels(opp)[0]!.cores > minLevelCores(getCard("BS01-001")), "相手スピリットのLvコストが+1されている")
}

console.log("すべてのチェックに合格しました 🎉（part331）")
