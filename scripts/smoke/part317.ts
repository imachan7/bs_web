// smoke パート317（BS14 黄バッチ20枚：BS14-045〜055/071/085〜087/107〜110/X05）
// 新設した器: kind:"activated" の cost.exhaustOwnFamilyOne／action:"levelOverrideTarget".side:"opponent"／
// action:"revealOwnBurstThenSortByType"／globalConstraint "opponentCantAttackByCost".phase/turn／
// ConstraintDef "unblockableBy".familyFilterAbsent／globalConstraint "noDeckMillInMain"／
// FieldEvent "anySpiritRefreshed"（refreshSourceTypeFilter）／action:"revealTopToHandThenRefreshOwn"／
// reviveOnDestroy.minCost／action:"levelOverrideOpponentSpiritsAllThisTurn"／globalConstraint
// "noLifeDamageByCost".attackerLevel（maxCost省略の単独判定）／action:"millSelfTopThenRefreshSelfIfFamily"／
// reviveOnDestroy.cost.discardOwnBurst
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    getCard,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { millDeck, placeBurst, refreshSpirit } from "../../server/src/logic/EffectModules"
import { destroySpirit } from "../../server/src/logic/removal"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: BS14黄カード定義（cardIdのズレ検出） ===")
{
    assert(getCard("BS14-045").name === "ゴリスタル", "BS14-045はゴリスタル")
    assert(getCard("BS14-051").name === "アルカナビーストクィーン", "BS14-051はアルカナビーストクィーン")
    assert(getCard("BS14-055").name === "ミスティック・ヒミコ", "BS14-055はミスティック・ヒミコ")
    assert(getCard("BS14-071").name === "トランプン", "BS14-071はトランプン")
    assert(getCard("BS14-085").name === "賛美するパイプオルガン", "BS14-085は賛美するパイプオルガン")
    assert(getCard("BS14-087").name === "ペンタン帝国：帝都アンプルール", "BS14-087はペンタン帝国：帝都アンプルール")
    assert(getCard("BS14-107").name === "夢幻祈祷", "BS14-107は夢幻祈祷")
    assert(getCard("BS14-110").name === "天災之禍風", "BS14-110は天災之禍風")
    assert(getCard("BS14-X05").name === "神獣鳥アン・ズール", "BS14-X05は神獣鳥アン・ズール")
}

console.log("=== BS14-087 帝都アンプルール：Lvの低い側が破壊される（BP修正は勝敗に影響しない） ===")
{
    const s = game("t317-087-a")
    const nexus = createInstance("BS14-087", s.turn, 2)
    s.players.p1.field.nexuses.push(nexus)
    const attacker = put(s, "p1", "BS14-045", 1) // Lv1 BP3000
    const blocker = put(s, "p2", "BS14-048", 7) // Lv3 BP6000（効果を持たないアゲハ妖精ナミ。ゴリスタルLv1同士だと勝者の【バトル時】自壊と混同するため避ける）
    attacker.tempBpBuff = 10000 // 実効BP13000（Lvより高いが、Lv比較では見ない）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パスで攻撃側に優先権")
    const effectId = getCard("BS14-087").effects.find((e) => e.kind === "activated")!.id
    assert(
        act(s, "p1", { type: "activateAbility", instanceId: nexus.instanceId, effectId }) === null,
        "ネクサスのコア2個を払って起動",
    )
    assert(nexus.cores === 0, "ネクサスのコアが2個減った")
    assert(s.battle?.compareByLevel === true, "バトル解決をLv比較に差し替えた")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.battle === null, "バトルが解決される")
    assert(!s.players.p1.field.spirits.includes(attacker), "Lvの低いアタッカーが破壊される（実効BPは高いのに）")
    assert(s.players.p2.field.spirits.includes(blocker), "Lvの高いブロッカーは残る")
}

console.log("=== BS14-087：Lvが同じとき相打ち ===")
{
    const s = game("t317-087-b")
    const nexus = createInstance("BS14-087", s.turn, 2)
    s.players.p1.field.nexuses.push(nexus)
    const attacker = put(s, "p1", "BS14-045", 2) // Lv2 BP4000
    const blocker = put(s, "p2", "BS14-045", 3) // Lv3 BP5000（BPでは攻撃側が負けるがLvは攻撃側が低い→今回は同Lvにする）
    blocker.cores = 2 // Lv2に合わせる（相打ち検証のため同Lv）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パスで攻撃側に優先権")
    const effectId = getCard("BS14-087").effects.find((e) => e.kind === "activated")!.id
    assert(
        act(s, "p1", { type: "activateAbility", instanceId: nexus.instanceId, effectId }) === null,
        "ネクサスのコア2個を払って起動",
    )
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.battle === null, "バトルが解決される")
    assert(!s.players.p1.field.spirits.includes(attacker), "同Lvなのでアタッカーも破壊される")
    assert(!s.players.p2.field.spirits.includes(blocker), "同Lvなのでブロッカーも破壊される（相打ち）")
}

console.log("=== BS14-051アルカナビーストクィーン：cost.exhaustOwnFamilyOne＋levelOverrideTarget.side:opponent ===")
{
    const s = game("t317-051-a")
    const queen = put(s, "p1", "BS14-051", 2) // Lv2以上
    const shido = put(s, "p1", "BS14-046", 1) // パム：系統「小玩」…四道ではないので候補にならないことも確認したいが、まず候補側を用意
    // 系統「四道」を持つ自分のスピリットを用意（BS14-053オリンピアの天使ハギトは四道持ち）
    const yondo = put(s, "p1", "BS14-053", 1)
    const oppSpirit = put(s, "p2", "BS14-045", 3) // Lv3
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: queen.instanceId }) === null, "クィーンでアタック宣言（フラッシュタイミングを開く）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パスで攻撃側に優先権")
    const effectId = getCard("BS14-051").effects.find((e) => e.kind === "activated")!.id
    assert(
        act(s, "p1", { type: "activateAbility", instanceId: queen.instanceId, effectId }) === null,
        "四道持ちを疲労させて起動",
    )
    assert(yondo.isRested === true, "系統「四道」を持つスピリットが疲労した")
    assert(shido.isRested === false, "四道を持たないスピリットは疲労しない")
    assert(oppSpirit.levelOverrideThisTurn === 1, "相手のスピリットがこのターンLv1として扱われる")
}

console.log("=== BS14-085賛美するパイプオルガン：noDeckMillInMain＋anySpiritRefreshed(spirit/magic限定)で破壊 ===")
{
    const s = game("t317-085-a")
    const organ = put(s, "p1", "BS14-085", 2) // Lv2
    const redSpirit = put(s, "p2", "BS01-001", 1) // 赤スピリット（BP1000, Lv1）
    redSpirit.isRested = true
    s.turnPlayer = "p2" // 相手のターン（オルガンの持ち主から見て相手）にする
    // ネクサスの効果による回復は対象外（sourceType:"nexus"）
    refreshSpirit(s, "p2", redSpirit, "nexus")
    assert(s.players.p2.field.spirits.includes(redSpirit), "ネクサス由来の回復では破壊されない")
    redSpirit.isRested = true
    refreshSpirit(s, "p2", redSpirit, "spirit")
    assert(!s.players.p2.field.spirits.includes(redSpirit), "スピリットの効果で回復した赤のスピリットは破壊される")

    // メインステップでのデッキ破棄が両陣営とも止まる
    s.phase = "main"
    const before1 = s.players.p1.deck.length
    const before2 = s.players.p2.deck.length
    millDeck(s, "p1", 1, "p1")
    millDeck(s, "p2", 1, "p1")
    assert(s.players.p1.deck.length === before1, "メインステップ中は自分のデッキも破棄されない")
    assert(s.players.p2.deck.length === before2, "メインステップ中は相手のデッキも破棄されない")
}

console.log("=== BS14-055ミスティック・ヒミコ：unblockableBy.familyFilterAbsent ===")
{
    const s = game("t317-055-a")
    const himiko = put(s, "p1", "BS14-055", 3) // Lv2以上（系統「導魔」持ち）
    const nonHaou = put(s, "p2", "BS01-001", 1) // 系統「覇皇」を持たない相手
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: himiko.instanceId }) === null, "ヒミコでアタック宣言")
    const blockErr = declareBlock(s, "p2", nonHaou.instanceId)
    assert(blockErr !== null, "系統「覇皇」を持たない相手のスピリットはブロックできない")
}

console.log("=== BS14-X05神獣鳥アン・ズール：millSelfTopThenRefreshSelfIfFamily／reviveOnDestroy.cost.discardOwnBurst ===")
{
    const s = game("t317-x05-a")
    const anzuru = put(s, "p1", "BS14-X05", 3)
    s.players.p1.deck.unshift("BS14-050") // エアレイ：系統「想獣」のスピリットカード
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: anzuru.instanceId }) === null, "アタック宣言（onAttack誘発）")
    assert(!anzuru.isRested, "系統「想獣」のカードが出たので回復した")

    const s2 = game("t317-x05-b")
    const anzuru2 = put(s2, "p1", "BS14-X05", 3)
    placeBurst(s2, "p1", "BS01-001")
    assert(s2.players.p1.burst !== null, "バーストをセットした")
    destroySpirit(s2, "p1", anzuru2.instanceId)
    assert(s2.players.p1.field.spirits.includes(anzuru2), "自分のバーストを破棄して回復状態でフィールドに残る")
    assert(anzuru2.isRested === false, "回復状態で残る")
    assert(s2.players.p1.burst === null, "コストとしてバーストが破棄された")
}

console.log("すべてのチェックに合格しました 🎉（part317）")
