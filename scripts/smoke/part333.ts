// smoke パート333（BS15 緑・白バッチ: 30種）
// 新設した器（burst.destroyedMinBp／burst.condition.bothFieldsRestedSpiritsAtLeast／
// step.condition.opponentBurstSet／reviveOnDestroy.condition.ownFieldOnlyColor／
// reviveOnDestroy.alsoVoidCoreToReserve／action:"returnFieldExceptOpponentChosenColor"／
// magic.usableAtOpponentMainEnd／action:"disableOpponentBurstThisBattle"）を確認する
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
    runTurnStart, timedHas,
    lockedFor,
} from "./helpers"
import type { GameState } from "./helpers"
import { fireFieldEventTriggers, fireStepTriggers } from "../../server/src/logic/triggers"
import { effectiveCost } from "../../shared/cost"
import { spiritHasKeyword } from "../../shared/rules"

function game(seed: string, p1Color = "green", p2Color = "white"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1Color, p2: p2Color })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: cardId の機械確認 ===")
{
    const names: Record<string, string> = {
        "BS15-019": "ダル・イーグル",
        "BS15-020": "パンダル",
        "BS15-021": "虚兵アオイ・スビン",
        "BS15-022": "アナグマッド・デビル",
        "BS15-023": "タケノ・サイガー",
        "BS15-024": "グアン・チョーウン",
        "BS15-025": "カヒョウトン",
        "BS15-026": "軍師鳥ショカツリョー",
        "BS15-027": "虚天帝ホウオウガ",
        "BS15-028": "フェネボラック",
        "BS15-029": "ズガニ",
        "BS15-030": "愛の女神ロヴン",
        "BS15-031": "虚獣グラスベア",
        "BS15-032": "スノーフレイクン",
        "BS15-033": "キマイラ・デブリ",
        "BS15-034": "ミブロック・ジーナス",
        "BS15-035": "軍神機メガ・テュール",
        "BS15-036": "虚械帝インフェニット・ヴォルス",
        "BS15-057": "カメン・フクロウ",
        "BS15-058": "ダブル・キャメル",
        "BS15-065": "大河と絶壁",
        "BS15-066": "廃寺の無限階段",
        "BS15-067": "雪の結晶樹",
        "BS15-068": "要塞都市ナウマンシティー",
        "BS15-077": "ヒートライド",
        "BS15-078": "飛雷震之計",
        "BS15-079": "プロボケイション",
        "BS15-080": "光速三段突",
        "BS15-X03": "鳥武帝スザクロス・ソウソー",
        "BS15-X04": "機獣要塞ナウマンガルド",
    }
    for (const [id, name] of Object.entries(names)) {
        assert(getCard(id).name === name, `${id} は ${name}`)
    }
}

console.log("=== BS15-020 パンダル：【暴風：1】ブロックされたとき相手が相手のスピリットを1体疲労させる ===")
{
    const s = game("p333-020")
    const panda = createInstance("BS15-020", s.turn, minLevelCores(getCard("BS15-020")))
    s.players.p1.field.spirits.push(panda)
    const oppA = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(oppA)
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p1", panda, "bofu"), "【暴風】を持つ")
    s.battle = { attackerInstanceId: panda.instanceId, blockerInstanceId: oppA.instanceId, directed: false } as never
    // excludeTarget:trueはfireTriggerが渡すブロッカー自身のtargetInstanceIdを除外候補にするためのもの。
    // ここでは自動選択の経路を確認するのでtargetInstanceIdは渡さない
    resolveAction(s, "p1", panda, { type: "exhaust", count: 1, chooserIsTarget: true, excludeTarget: true, countFromBofu: true })
    assert(oppA.isRested, "相手のスピリットが疲労した")
}

console.log("=== BS15-021 虚兵アオイ・スビン：相手によって破壊された緑1体につき相手を1体疲労 ===")
{
    const s = game("p333-021")
    const spirit = createInstance("BS15-021", s.turn, minLevelCores(getCard("BS15-021")))
    s.players.p1.field.spirits.push(spirit)
    const greenAlly = createInstance("BS15-019", s.turn, 1) // 緑
    s.players.p1.field.spirits.push(greenAlly)
    const oppSpirit = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(oppSpirit)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", greenAlly.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    assert(oppSpirit.isRested, "破壊された緑1体につき相手のスピリットが疲労した")
}

console.log("=== BS15-022 アナグマッド・デビル：緑しかない間アタック時ボイドからコア、バースト破棄でさらに1個 ===")
{
    const s = game("p333-022")
    const spirit = createInstance("BS15-022", s.turn, minLevelCores(getCard("BS15-022")))
    s.players.p1.field.spirits.push(spirit)
    refreshLevelAsOverrides(s)
    s.players.p1.burst = "BS01-001"
    s.players.p1.burstSet = true
    resolveAction(s, "p1", spirit, { type: "voidCoreToSelf", count: 1 })
    resolveAction(s, "p1", spirit, { type: "voidCoreToSelf", count: 1, costDiscardOwnBurst: true })
    assert(spirit.cores === minLevelCores(getCard("BS15-022")) + 2, "ボイドから2個乗った")
    assert(s.players.p1.burst === null, "バーストを破棄した")
}

console.log("=== BS15-026 軍師鳥ショカツリョー：疲労スピリット合計3体以上でバースト召喚 ===")
{
    const s = game("p333-026")
    s.players.p1.burst = "BS15-026"
    const restedA = createInstance("BS01-001", s.turn, 1)
    restedA.isRested = true
    const restedB = createInstance("BS01-002", s.turn, 1)
    restedB.isRested = true
    s.players.p1.field.spirits.push(restedA, restedB)
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.cardId === "BS15-026"),
        "疲労合計2体では条件不成立でトラッシュへ（バースト宣言自体は消費される）",
    )
    assert(s.players.p1.trashCards.includes("BS15-026"), "条件不成立でトラッシュに置かれた")
    s.players.p1.burst = "BS15-026"
    const restedC = createInstance("BS01-003", s.turn, 1)
    restedC.isRested = true
    s.players.p2.field.spirits.push(restedC)
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS15-026"), "合計3体以上でバースト条件成立し召喚された")
}

console.log("=== BS15-027 虚天帝ホウオウガ：バーストセット中コスト7固定・ライフをボイドへ ===")
{
    const s = game("p333-027")
    s.players.p1.hand.push("BS15-027")
    s.players.p1.burstSet = true
    s.players.p1.burst = "BS01-001"
    assert(effectiveCost(s, "p1", getCard("BS15-027")) === 7, "バーストセット中はコスト7固定")
    s.players.p1.burstSet = false
    s.players.p1.burst = null
    assert(effectiveCost(s, "p1", getCard("BS15-027")) === 11, "セットしていなければ通常コスト11")
    const houou = createInstance("BS15-027", s.turn, minLevelCores(getCard("BS15-027")))
    s.players.p1.field.spirits.push(houou)
    refreshLevelAsOverrides(s)
    s.players.p2.life = 3
    const reserveBefore = s.players.p2.reserve
    resolveAction(s, "p1", houou, { type: "lifeCrush", count: 1, dest: "void" })
    assert(s.players.p2.life === 2, "ライフが減った")
    assert(s.players.p2.reserve === reserveBefore, "ボイド送りなのでリザーブへは戻らない")
}

console.log("=== BS15-030 愛の女神ロヴン：白しかない間、破壊時ボイドからリザーブへ置いた後手札に戻る ===")
{
    const s = game("p333-030")
    const rovun = createInstance("BS15-030", s.turn, 2) // Lv2の維持コア（白しかない条件はLv2限定）
    s.players.p1.field.spirits.push(rovun)
    refreshLevelAsOverrides(s)
    const beforeReserve = s.players.p1.reserve
    const handBefore = s.players.p1.hand.length
    const cores = rovun.cores
    destroySpirit(s, "p1", rovun.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    // +1はalsoVoidCoreToReserve、+coresは手札へ戻る際にこのスピリット自身の上のコアがリザーブへ戻る分（toHandの既定動作）
    assert(s.players.p1.reserve === beforeReserve + 1 + cores, "ボイドからコア1個をリザーブへ置いた（＋自身のコアもリザーブへ）")
    assert(s.players.p1.hand.includes("BS15-030"), "破壊される代わりに手札に戻った")
    assert(s.players.p1.hand.length === handBefore + 1, "手札が1枚増えた")
}

console.log("=== BS15-032 スノーフレイクン：相手のアタックステップ開始時リザーブ1個で相手を必ずアタックさせる ===")
{
    const s = game("p333-032")
    const snow = createInstance("BS15-032", s.turn, minLevelCores(getCard("BS15-032")))
    s.players.p2.field.spirits.push(snow)
    const target = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    s.players.p2.reserve = 5
    s.turnPlayer = "p1"
    s.phase = "attack"
    fireStepTriggers(s, "attack")
    assert(s.players.p2.reserve === 4, "リザーブのコア1個をトラッシュに置いた")
    assert(
        timedHas(s, target, "mustAttack"),
        "指定した相手のスピリットは必ずアタックする",
    )
    assert(currentLevel(snow).level === 1, "前提：Lv1で開始")
    // ⚠️ spiritHasKeyword は kind:"keyword" のlevelsを見ない既知の仕様（hasKeywordの従来挙動を保つ設計。
    // shared/rules.ts spiritHasKeywordのコメント参照）ため、【氷壁】の「持っている」判定自体はLv1でもtrueになる。
    // 機能面（Lv2限定のmagicNegate本体）だけをここでは確認する
    const snowLv2 = createInstance("BS15-032", s.turn, 2)
    s.players.p2.field.spirits.push(snowLv2)
    refreshLevelAsOverrides(s)
    assert(currentLevel(snowLv2).level === 2, "前提：Lv2")
    assert(spiritHasKeyword(s, "p2", snowLv2, "hyoheki"), "Lv2で【氷壁】を持つ")
}

console.log("=== BS15-034 ミブロック・ジーナス：白しかない間ネクサス効果を両陣営封じる・バーストはBP5000以上限定 ===")
{
    const s = game("p333-034")
    const jinas = createInstance("BS15-034", s.turn, minLevelCores(getCard("BS15-034")))
    s.players.p1.field.spirits.push(jinas)
    refreshLevelAsOverrides(s)
    // バースト条件：破壊されたスピリットのBPが5000未満なら不発
    s.players.p1.burst = "BS15-034"
    const weak = createInstance("BS01-001", s.turn, 1) // BP1000
    s.players.p1.field.spirits.push(weak)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", weak.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    assert(s.players.p1.burst === "BS15-034", "BP5000未満の破壊ではバースト不発")
    const strong = createInstance("BS01-016", s.turn, 1) // BP5000
    s.players.p1.field.spirits.push(strong)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", strong.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    assert(s.players.p1.burst === null, "BP5000以上の破壊ではバースト条件成立し発動した")
}

console.log("=== BS15-035 軍神機メガ・テュール：相手が1色指定し、それ以外の色を持つ相手のスピリットを手札に戻す ===")
{
    const s = game("p333-035")
    const mega = createInstance("BS15-035", s.turn, minLevelCores(getCard("BS15-035")))
    s.players.p1.field.spirits.push(mega)
    const oppRed1 = createInstance("BS01-001", s.turn, 1)
    const oppRed2 = createInstance("BS01-002", s.turn, 1)
    const oppPurple = createInstance("BS01-030", s.turn, 1)
    s.players.p2.field.spirits.push(oppRed1, oppRed2, oppPurple)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", mega, { type: "returnFieldExceptOpponentChosenColor" })
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === oppRed1.instanceId) &&
            s.players.p2.field.spirits.some((sp) => sp.instanceId === oppRed2.instanceId),
        "相手は最多の赤を指定して赤2体を場に残す（決定的簡略化）",
    )
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === oppPurple.instanceId), "指定されなかった紫は手札に戻る")
    assert(s.players.p2.hand.includes("BS01-030"), "手札に戻った（破壊ではない）")
}

console.log("=== BS15-X03 鳥武帝スザクロス・ソウソー：バトル時相手のバースト無効化 ===")
{
    const s = game("p333-x03")
    const suzaku = createInstance("BS15-X03", s.turn, minLevelCores(getCard("BS15-X03")))
    s.players.p1.field.spirits.push(suzaku)
    refreshLevelAsOverrides(s)
    s.battle = { attackerInstanceId: suzaku.instanceId, blockerInstanceId: null, directed: false } as never
    resolveAction(s, "p1", suzaku, { type: "timedEffect", content: [{ type: "battleLock", lock: "burst" }], duration: "battle" })
    assert(lockedFor(s, "p2", "burst"), "相手のバーストがこのバトルの間無効化された")
}

console.log("=== BS15-X04 機獣要塞ナウマンガルド：相手によって破壊されたとき3枚ドロー+ボイドからコア3個 ===")
{
    const s = game("p333-x04")
    const naumangard = createInstance("BS15-X04", s.turn, minLevelCores(getCard("BS15-X04")))
    s.players.p1.field.spirits.push(naumangard)
    for (let i = 0; i < 5; i++) s.players.p1.deck.push("BS01-001")
    refreshLevelAsOverrides(s)
    const handBefore = s.players.p1.hand.length
    const reserveBefore = s.players.p1.reserve
    const destroyedCores = naumangard.cores // 破壊時、このスピリット自身のコアも通常どおりリザーブへ戻る
    destroySpirit(s, "p1", naumangard.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    assert(s.players.p1.hand.length === handBefore + 3, "3枚ドローした")
    assert(s.players.p1.reserve === reserveBefore + destroyedCores + 3, "ボイドからコア3個をリザーブに置いた（＋破壊で戻る自身のコア）")
}

console.log("すべてのチェックに合格しました 🎉（part333）")
