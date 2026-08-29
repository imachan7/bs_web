// smoke パート254（BS10黄バッチ：ノックアウト／龍仙公主／赤ずきん妖精ルージュ）
// 新設した機構:
//   - state.battle.compareByCost（既存のcompareByLevel/compareByCoresの3つ目。BS10-110ノックアウト）
//     action "battleCompareByCost" と battleFlow.ts の battleCompareByCostHandler
//   - reviveOnDestroy.cost.handDiscardCardType（handDiscardOneの種別絞り込み。BS10-046龍仙公主Lv1＝magic）
//   - triggered.condition の requirePrevAttackerCombined（GameState.lastAttackerCombinedPid /
//     prevAttackerCombinedPid をdoAttackがスライドさせ、直前のアタックが自分の合体スピリットだった
//     ときのみ発火。BS10-047赤ずきん妖精ルージュLv3）
import {
    act,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    effectiveCost,
    getCard,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS10-110").name === "ノックアウト", "BS10-110 はノックアウト")
    assert(getCard("BS10-046").name === "龍仙公主", "BS10-046 は龍仙公主")
    assert(getCard("BS10-047").name === "赤ずきん妖精ルージュ", "BS10-047 は赤ずきん妖精ルージュ")
}

console.log("=== BS10-110 ノックアウト：BPではなくコストを比較する（BP高・コスト低が負ける） ===")
{
    const s = base("t254-knockout-cost")
    const atk = put(s, "p1", "BS01-003", 1) // テラノセイバー：コスト2・BP4000（Lv1）
    const blk = put(s, "p2", "BS01-094", 1) // グラン・ドルバルカン：コスト5・BP1000（Lv1）
    s.players.p2.hand[0] = "BS10-110"
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "テラノセイバーでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "グラン・ドルバルカンでブロック")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "ノックアウトを使用（コスト比較へ切り替え）")
    assert(s.battle?.compareByCost === true, "compareByCostフラグが立つ")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（バトル解決）")
    assert(!s.players.p1.field.spirits.includes(atk), "BPはブロッカーより高いが、コストが低いテラノセイバーが破壊される")
    assert(s.players.p2.field.spirits.includes(blk), "コストの高いグラン・ドルバルカンは生存する")
}

console.log("--- 同コストは相打ち（BPは無関係） ---")
{
    const s = base("t254-knockout-tie")
    const atk = put(s, "p1", "BS01-062", 1) // ハングリートゥリー：コスト4・BP5000（Lv1）
    const blk = put(s, "p2", "BS01-012", 1) // トライソードン：コスト4・BP1000（Lv1）
    s.players.p2.hand[0] = "BS10-110"
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ハングリートゥリーでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "トライソードンでブロック")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "ノックアウトを使用")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（バトル解決）")
    assert(!s.players.p1.field.spirits.includes(atk), "同コストのため攻撃側も破壊される（BPは5倍差があっても無関係）")
    assert(!s.players.p2.field.spirits.includes(blk), "同コストのため防御側も破壊される")
}

console.log("=== BS10-046 龍仙公主Lv1：自分のスピリット破壊時、手札のマジック1枚を破棄して疲労状態で戻る ===")
{
    const s = base("t254-ryusen-revive")
    put(s, "p1", "BS10-046", 1) // Lv1
    const spirit = put(s, "p1", "BS01-003", 1)
    s.players.p1.hand = ["BS01-126"] // 手札はマジック1枚（シャドウエリクサー）だけに固定
    destroySpirit(s, "p1", spirit.instanceId, "destroy")
    assert(s.players.p1.field.spirits.includes(spirit), "破棄コストを払って場に残る")
    assert(spirit.isRested === true, "戻るのは疲労状態")
    assert(s.players.p1.hand.length === 0, "手札のマジック1枚が破棄された")
    assert(s.players.p1.trashCards.includes("BS01-126"), "破棄したマジックはトラッシュへ")
}

console.log("=== BS10-046 龍仙公主Lv1：手札にマジックが無ければ不発（スピリットカードは対象外） ===")
{
    const s = base("t254-ryusen-nomagic")
    put(s, "p1", "BS10-046", 1)
    const spirit = put(s, "p1", "BS01-003", 1)
    s.players.p1.hand = ["BS01-001"] // スピリットカードのみ（ゴラドン）
    destroySpirit(s, "p1", spirit.instanceId, "destroy")
    assert(!s.players.p1.field.spirits.includes(spirit), "破棄コストを払えず、そのまま破壊される")
    assert(s.players.p1.hand.includes("BS01-001"), "手札のスピリットカードは誤って破棄されない")
}

console.log("=== BS10-046 龍仙公主Lv1：単体破壊では、手札にマジックが何枚あっても戻るのは1体まで ===")
{
    const s = base("t254-ryusen-onlyone")
    put(s, "p1", "BS10-046", 1)
    const spirit = put(s, "p1", "BS01-003", 1)
    s.players.p1.hand = ["BS01-126", "BS01-126", "BS01-126"] // マジック3枚
    destroySpirit(s, "p1", spirit.instanceId, "destroy")
    assert(s.players.p1.field.spirits.includes(spirit), "破壊されたスピリットは1体だけなので、戻るのも1体")
    assert(s.players.p1.hand.length === 2, "破棄されるマジックは1枚だけ（3枚あっても使い切らない）")
}

console.log("=== BS10-046 龍仙公主Lv2『アタック時』：トラッシュの黄マジック1枚をコストを払って使用できる ===")
{
    const s = base("t254-ryusen-lv2")
    const inst = put(s, "p1", "BS10-046", 3) // Lv2
    s.players.p1.trashCards = ["BS02-110"] // 黄マジック（ヘビィゲート・コスト5。046自身の黄シンボルで1軽減され実質4）
    const cost = effectiveCost(s, "p1", getCard("BS02-110"))
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: inst.instanceId }) === null, "龍仙公主（Lv2）でアタック")
    assert(s.players.p1.trashCards.includes("BS02-110"), "使用したマジックはトラッシュに残ったまま")
    assert(s.players.p1.reserve === reserveBefore - cost, `使用コスト（${cost}）をリザーブから支払った`)
    assert((s.magicUsedThisTurn.p1 ?? 0) >= 1, "トラッシュからのマジック使用が1回記録される")
}

console.log("=== BS10-047 赤ずきん妖精ルージュLv3：自分の合体スピリットの次にアタックするとブロックされない ===")
{
    const s = base("t254-rouge-combined")
    const atk1 = put(s, "p1", "BS01-003", 1) // 合体スピリット扱いにする簡略化（instIsCombined）
    atk1.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }]
    const rouge = put(s, "p1", "BS10-047", 3) // Lv3
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk1.instanceId }) === null, "合体スピリットでアタック（p2にブロッカーなし）")
    assert(takeLifeAndResolve(s, "p2") === null, "p2はライフで受ける（バトル終了）")
    assert(act(s, "p1", { type: "attack", instanceId: rouge.instanceId }) === null, "続けてルージュでアタック")
    assert(rouge.unblockableOnceThisTurn === true, "直前が自分の合体スピリットのアタックだったので、ブロックされない印がつく")
}

console.log("--- 直前が合体していないスピリットのアタックならブロックされる（条件が効いている） ---")
{
    const s = base("t254-rouge-notcombined")
    const atk2 = put(s, "p1", "BS01-003", 1) // 合体していない通常のアタッカー
    const rouge = put(s, "p1", "BS10-047", 3) // Lv3
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk2.instanceId }) === null, "通常のスピリットでアタック")
    assert(takeLifeAndResolve(s, "p2") === null, "p2はライフで受ける（バトル終了）")
    assert(act(s, "p1", { type: "attack", instanceId: rouge.instanceId }) === null, "続けてルージュでアタック")
    assert(!rouge.unblockableOnceThisTurn, "直前が合体スピリットのアタックではないので、ブロックされない印はつかない")
}

console.log("すべてのチェックに合格しました 🎉（part254）")
