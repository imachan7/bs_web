// smoke パート309（SD06 スターターデッキ「陽昇ハジメデッキ バーストヒーローズ」17種）
// 今回足した4つの器（AuraDef.uncombinedFilter／globalConstraint ownLifeDamageCapPerSourcePerTurn／
// banAttackTargetThisTurn.alsoCantBlock／ownNexusIndestructible.nameIncludes）と、
// SD06-003/005/007/009/010/011/012の効果解釈を確認する
import {
    act,
    assert,
    createGame,
    createInstance,
    destroyNexus,
    effectiveBp,
    fireStepTriggers,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState } from "./helpers"
import { placeBurst } from "../../server/src/logic/EffectModules"
import { fireFieldEventTriggers } from "../../server/src/logic/triggers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: SD06カード定義（cardIdのズレ検出） ===")
{
    assert(getCard("SD06-003").name === "ワン・ケンゴー", "SD06-003はワン・ケンゴー")
    assert(getCard("SD06-004").name === "ドス・モンキ", "SD06-004はドス・モンキ")
    assert(getCard("SD06-005").name === "ツインブレード・ドラゴン", "SD06-005はツインブレード・ドラゴン")
    assert(getCard("SD06-007").name === "英雄龍ロード・ドラゴン", "SD06-007は英雄龍ロード・ドラゴン")
    assert(getCard("SD06-009").name === "キジ・トリア", "SD06-009はキジ・トリア")
    assert(getCard("SD06-010").name === "海皇龍シーマ・クリーク", "SD06-010は海皇龍シーマ・クリーク")
    assert(getCard("SD06-011").name === "英雄皇の神剣", "SD06-011は英雄皇の神剣")
    assert(getCard("SD06-012").name === "英雄皇の御盾", "SD06-012は英雄皇の御盾")
}

console.log("=== 器: AuraDef.uncombinedFilter（SD06-004ドス・モンキ） ===")
{
    const s = game("uncombined-aura")
    const monki = createInstance("SD06-004", s.turn, 1)
    s.players.p1.field.spirits.push(monki)
    const ally = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(ally)
    refreshLevelAsOverrides(s)
    const baseBp = effectiveBp(s, "p1", ally)

    assert(effectiveBp(s, "p1", ally) === baseBp, "バースト未セットではBP+されない")
    s.players.p1.burst = "SD06-013"
    s.players.p1.burstSet = true
    assert(effectiveBp(s, "p1", ally) === baseBp, "メインステップ中はBP+されない（自分のアタックステップ限定）")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(effectiveBp(s, "p1", ally) === baseBp + 3000, "自分のアタックステップ・バーストセット中はBP+3000")

    // 合体スピリットは対象外（uncombinedFilter）
    ally.braveRefs = [{ slot: "single", instanceId: "fake-brave" }]
    assert(effectiveBp(s, "p1", ally) === baseBp, "合体スピリットはuncombinedFilterで対象外になる")
}

console.log("=== 器: globalConstraint ownLifeDamageCapPerSourcePerTurn（SD06-010海皇龍シーマ・クリーク Lv3） ===")
{
    const s = game("life-cap")
    // Lv3（cores5）で使う：Lv1-2限定のアタック禁止系（cantAttack/cantAttackByCost）を避け、
    // 全レベル共通のライフ上限だけを単独で確認する
    const shima = createInstance("SD06-010", s.turn, 5)
    s.players.p2.field.spirits.push(shima)
    refreshLevelAsOverrides(s)

    const a1 = createInstance("BS01-001", s.turn, 1)
    a1.tempExtraSymbols = 3 // 素のシンボル数+3。上限が無ければ4減るはず
    s.players.p1.field.spirits.push(a1)
    const a2 = createInstance("BS01-001", s.turn, 1)
    a2.tempExtraSymbols = 3
    s.players.p1.field.spirits.push(a2)
    refreshLevelAsOverrides(s)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: a1.instanceId }) === null, "a1でアタック宣言")
    assert(takeLifeAndResolve(s, "p2") === null, "p2はライフで受ける")
    assert(s.players.p2.life === 4, "同じ相手スピリット(a1)からは1ターンに1しか減らない（シンボル4でも-1）")

    assert(act(s, "p1", { type: "attack", instanceId: a2.instanceId }) === null, "a2でアタック宣言（別の相手スピリット）")
    assert(takeLifeAndResolve(s, "p2") === null, "p2はライフで受ける")
    assert(s.players.p2.life === 3, "別の相手スピリット(a2)からは別枠でさらに1減る")

    assert(act(s, "p1", { type: "endTurn" }) === null, "ターン終了")
    assert(a1.lifeDealtThisTurn === undefined, "ターン終了でlifeDealtThisTurnはリセットされる")
}

console.log("=== 器: banAttackTargetThisTurn.alsoCantBlock（SD06-012英雄皇の御盾 Lv1） ===")
{
    const s = game("also-cant-block")
    const shield = createInstance("SD06-012", s.turn, 0)
    s.players.p1.field.nexuses.push(shield)
    const target = createInstance("BS01-001", s.turn, 1)
    target.braveRefs = [{ slot: "single", instanceId: "fake-brave" }] // 相手の合体スピリット扱いにする
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行（お互いのアタックステップ誘発が発火）")
    assert(target.cantAttackThisTurn === true, "指定された合体スピリットはこのターンアタックできない")
    assert(target.cantBlockThisTurn === true, "alsoCantBlockによりブロックもできない（バトルできない）")
}

console.log("=== 器: ownNexusIndestructible.nameIncludes（SD06-012英雄皇の御盾 Lv2） ===")
{
    const s = game("nexus-name-indestructible")
    const shield = createInstance("SD06-012", s.turn, 3) // Lv2
    s.players.p1.field.nexuses.push(shield)
    s.players.p1.burst = "SD06-013"
    s.players.p1.burstSet = true
    const protectedNexus = createInstance("SD06-011", s.turn, 0) // 英雄皇の神剣：カード名に「英雄皇」
    s.players.p1.field.nexuses.push(protectedNexus)
    const otherNexus = createInstance("BS01-098", s.turn, 0) // 燃えさかる戦場：「英雄皇」を含まない
    s.players.p1.field.nexuses.push(otherNexus)
    refreshLevelAsOverrides(s)

    assert(destroyNexus(s, "p1", protectedNexus.instanceId) === false, "カード名に「英雄皇」を含むネクサスは破壊されない")
    assert(
        s.players.p1.field.nexuses.some((n) => n.instanceId === protectedNexus.instanceId),
        "破壊耐性のあるネクサスは場に残る",
    )
    assert(destroyNexus(s, "p1", otherNexus.instanceId) === true, "「英雄皇」を含まないネクサスは通常どおり破壊される")
}

console.log("=== SD06-003ワン・ケンゴー：バーストセット中はLv3として扱う（levelAs condition:ownBurstSet） ===")
{
    const s = game("levelas-burstset")
    const ken = createInstance("SD06-003", s.turn, 1) // Lv1（コア1）
    s.players.p1.field.spirits.push(ken)
    refreshLevelAsOverrides(s)
    assert(ken.levelAsContinuous === undefined, "バースト未セットなら通常のLv1のまま")
    s.players.p1.burst = "SD06-013"
    s.players.p1.burstSet = true
    refreshLevelAsOverrides(s)
    assert(ken.levelAsContinuous === 3, "バーストセット中はLv3として扱う")
}

console.log("=== SD06-009キジ・トリア：ownBurstSet:falseの条件つきstep（バーストをセットしていないときだけ発火） ===")
{
    const s = game("burstset-false-step")
    const kiji = createInstance("SD06-009", s.turn, 2) // Lv2
    s.players.p1.field.spirits.push(kiji)
    s.players.p1.hand = ["SD06-013"] // バースト効果を持つカード（双翼乱舞）
    s.players.p1.burstSet = true
    s.turnPlayer = "p2" // p1から見て『相手のスタートステップ』
    refreshLevelAsOverrides(s)

    fireStepTriggers(s, "start")
    assert(s.players.p1.burst === null, "バーストをセット済みのときは発火しない")

    s.players.p1.burstSet = false
    fireStepTriggers(s, "start")
    assert(s.players.p1.burst === "SD06-013", "バーストをセットしていないときだけ発火し、手札からセットできる")
    assert(s.players.p1.hand.length === 0, "セットしたカードは手札から取り除かれる")
}

console.log("=== SD06-005ツインブレード・ドラゴン：アタック時ドロー＋バーストセット中は同時に破壊 ===")
{
    const s = game("twinblade-draw-destroy")
    const dragon = createInstance("SD06-005", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(dragon)
    const weak = createInstance("BS01-001", s.turn, 1) // BP1000（4000以下）
    s.players.p2.field.spirits.push(weak)
    refreshLevelAsOverrides(s)

    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: dragon.instanceId }) === null, "アタック宣言（バースト未セット）")
    assert(s.players.p1.deck.length === deckBefore - 1, "アタック時に1枚ドローする")
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === weak.instanceId),
        "バースト未セットなら破壊は発揮されない",
    )
    assert(takeLifeAndResolve(s, "p2") === null, "バトルを解決してテストを進める")

    // バーストをセットしてから再度アタック（コアを積んで維持し、疲労を戻す）
    dragon.isRested = false
    s.players.p1.burst = "SD06-013"
    s.players.p1.burstSet = true
    const deckBefore2 = s.players.p1.deck.length
    assert(act(s, "p1", { type: "attack", instanceId: dragon.instanceId }) === null, "アタック宣言（バーストセット中）")
    assert(s.players.p1.deck.length === deckBefore2 - 1, "ドローは同時に発揮される")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === weak.instanceId),
        "バーストセット中は同時にBP4000以下の相手スピリットを破壊する",
    )
}

console.log("=== SD06-007英雄龍ロード・ドラゴン：ownBurstActivatedのburstCostAtMost条件 ===")
{
    // 発動したカードのコストが5以下（SD06-013双翼乱舞：コスト4）なら破壊が発揮される
    const s = game("rodo-dragon-burst-cost-ok")
    const lord = createInstance("SD06-007", s.turn, 1)
    s.players.p1.field.spirits.push(lord)
    const weak = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(weak)
    refreshLevelAsOverrides(s)
    placeBurst(s, "p1", "SD06-013") // コスト4（5以下）：双翼乱舞（【バースト：相手の召喚時効果発揮後】ドロー2）
    fireFieldEventTriggers(s, "p1", "opponentSummonEffectResolved")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === weak.instanceId),
        "発動したバーストのコストが5以下なら相手のスピリットを破壊する",
    )

    // 発動したカードのコストが5を超える（SD06-007自身：コスト6）なら破壊は発揮されない
    const s2 = game("rodo-dragon-burst-cost-ng")
    const lord2 = createInstance("SD06-007", s2.turn, 1)
    s2.players.p1.field.spirits.push(lord2)
    const weak2 = createInstance("BS01-001", s2.turn, 1)
    s2.players.p2.field.spirits.push(weak2)
    refreshLevelAsOverrides(s2)
    s2.players.p1.reserve = 20
    placeBurst(s2, "p1", "SD06-007") // コスト6（5を超える）：英雄龍ロード・ドラゴン自身
    fireFieldEventTriggers(s2, "p1", "ownLifeDamaged")
    assert(
        s2.players.p2.field.spirits.some((sp) => sp.instanceId === weak2.instanceId),
        "発動したバーストのコストが5を超えるときは破壊が発揮されない",
    )
}

console.log("すべてのチェックに合格しました 🎉（part309）")
