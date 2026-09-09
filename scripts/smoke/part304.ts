// smoke パート304（BS13 白バッチ16枚。docs/design/BS13_PLAN.md §10）
// 新しく足した器 AI・AJ・AK・AL・AM・AN・AO・AQ を1つずつ固定する。
// 特に #17（破壊は成立し、破壊で誘発した効果を処理してから疲労状態で戻る）・
// #18（【重装甲】の色をハードコードせず、後天的な付与も含めて色ごとに1体を選ぶ）・
// #19（相手のメインステップを終了後、アタックステップへ進む＝ターンごと飛ばさない）を明示的に確認する
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    draw,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { canBlock } from "../../shared/block"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = true
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS13-067").name === "光導く巨塔" && getCard("BS13-067").type === "nexus", "BS13-067は光導く巨塔（ネクサス）")
    assert(getCard("BS13-030").name === "リーサルウェポンドラゴン" && getCard("BS13-030").type === "spirit", "BS13-030はリーサルウェポンドラゴン")
    assert(getCard("BS13-029").name === "剣馬グラニム", "BS13-029は剣馬グラニム")
    assert(getCard("BS13-026").name === "キグナ・スワンMk-II", "BS13-026はキグナ・スワンMk-II")
    assert(getCard("BS13-068").name === "遥かなる衛星砲" && getCard("BS13-068").type === "nexus", "BS13-068は遥かなる衛星砲（ネクサス）")
    assert(getCard("BS13-027").name === "ムーンショウウオ", "BS13-027はムーンショウウオ")
}

console.log("=== 器AI・#17：BS13-067（お互い、【重装甲】持ちが指定色の相手にBP比較で破壊されたとき、疲労状態で残る） ===")
{
    const s = game("ai-revive-heavyarmor")
    act(s, "p1", { type: "endTurn" }) // p2のターン（turn2）へ。p2がアタックする
    act(s, "p2", { type: "nextPhase" }) // アタックステップへ
    const nexus = createInstance("BS13-067", s.turn, getCard("BS13-067").levels[0]!.cores) // Lv1
    s.players.p1.field.nexuses.push(nexus)
    const blocker = createInstance("BS13-030", s.turn, getCard("BS13-030").levels[0]!.cores) // Lv1【重装甲：紫/青】BP4000
    s.players.p1.field.spirits.push(blocker)
    // 紫のスピリットでBP4000より確実に高いものを機械的に探す（cardIdのハードコード回避）
    const attackerCard = ALL_CARDS.find(
        (c) => c.type === "spirit" && c.colors.includes("purple") && c.levels[0] !== undefined && c.levels[0].bp > 4000,
    )
    assert(attackerCard !== undefined, "テスト前提: BP4000超の紫スピリットが存在する")
    const attacker = createInstance(attackerCard!.cardId, s.turn, attackerCard!.levels[0]!.cores)
    s.players.p2.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)

    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "紫の攻撃側がアタック")
    act(s, "p1", { type: "pass" })
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "重装甲持ちがブロック")
    act(s, "p1", { type: "pass" })
    act(s, "p2", { type: "pass" })

    assert(s.players.p1.field.spirits.some((x) => x.instanceId === blocker.instanceId), "#17：破壊されずフィールドに残る（破壊待機からの復帰）")
    assert(blocker.isRested === true, "#17：疲労状態で戻る")
    assert(blocker.cores === getCard("BS13-030").levels[0]!.cores, "#17：コアはそのまま（Lv1のまま）")
}

console.log("=== 器AI：色が違えば復活しない（紫/青以外の色の攻撃では通常どおり破壊される） ===")
{
    const s = game("ai-revive-wrongcolor")
    act(s, "p1", { type: "endTurn" })
    act(s, "p2", { type: "nextPhase" })
    const nexus = createInstance("BS13-067", s.turn, getCard("BS13-067").levels[0]!.cores)
    s.players.p1.field.nexuses.push(nexus)
    const blocker = createInstance("BS13-030", s.turn, getCard("BS13-030").levels[0]!.cores)
    s.players.p1.field.spirits.push(blocker)
    // 赤（【重装甲】が防がない色）でBP4000超のスピリットを探す
    const attackerCard = ALL_CARDS.find(
        (c) => c.type === "spirit" && c.colors.length === 1 && c.colors[0] === "red" && c.levels[0] !== undefined && c.levels[0].bp > 4000,
    )
    assert(attackerCard !== undefined, "テスト前提: BP4000超の赤スピリットが存在する")
    const attacker = createInstance(attackerCard!.cardId, s.turn, attackerCard!.levels[0]!.cores)
    s.players.p2.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)

    act(s, "p2", { type: "attack", instanceId: attacker.instanceId })
    act(s, "p1", { type: "pass" })
    declareBlock(s, "p1", blocker.instanceId)
    act(s, "p1", { type: "pass" })
    act(s, "p2", { type: "pass" })

    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === blocker.instanceId), "赤の攻撃では重装甲が守らないため破壊される")
}

console.log("=== 器AJ・#18：BS13-030【合体時】Lv2「持つ【重装甲】と同じ色の相手1体ずつを手札に戻す」。色ごとに別の1体・後天的付与も含む ===")
{
    const s = game("aj-return-each-color")
    const self030 = createInstance("BS13-030", s.turn, getCard("BS13-030").levels[1]!.cores) // Lv2：静的に紫/青
    s.players.p1.field.spirits.push(self030)
    refreshLevelAsOverrides(s)
    // #18：後天的な付与（他カードから重装甲：赤を貰った想定）も実行時に読む。
    // ⚠️ refreshLevelAsOverridesは毎回delete→再構築するため、これより後に呼ばないこと
    self030.heavyArmorColorsGranted = ["red"]
    const purpleTarget = createInstance(
        ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length === 1 && c.colors[0] === "purple")!.cardId,
        s.turn,
        1,
    )
    const blueTarget = createInstance(
        ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length === 1 && c.colors[0] === "blue")!.cardId,
        s.turn,
        1,
    )
    const redTarget = createInstance(
        ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length === 1 && c.colors[0] === "red")!.cardId,
        s.turn,
        1,
    )
    s.players.p2.field.spirits.push(purpleTarget, blueTarget, redTarget)
    const handBefore = s.players.p2.hand.length

    resolveAction(s, "p1", self030, { type: "returnToHandEachHeavyArmorColor" })

    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === purpleTarget.instanceId), "紫1体は手札に戻る")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blueTarget.instanceId), "青1体は手札に戻る（静的付与ぶん）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === redTarget.instanceId), "#18：赤1体も手札に戻る（後天的付与も実行時に読む）")
    assert(s.players.p2.hand.length === handBefore + 3, "色ごとに別の1体を選び、3体とも戻った（多色1体で複数枠を埋めない）")
}

console.log("=== 器AK・#19：BS13-067Lv2「相手が効果でドローしたとき、その効果発揮後、相手のメインステップを終了する」 ===")
{
    const s = game("ak-force-end-main")
    act(s, "p1", { type: "endTurn" }) // p2のターンのメインステップへ
    assert(s.turnPlayer === "p2" && s.phase === "main", "前提：p2のメインステップにいる")
    const nexus = createInstance("BS13-067", s.turn, getCard("BS13-067").levels[1]!.cores) // Lv2
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)

    draw(s, "p2", 1, false) // fromDrawStep=false＝「効果でドロー」

    assert(s.phase === "attack", "#19：相手のメインステップが終了し、アタックステップへ進む（ターンは飛ばさない）")
    assert(s.turnPlayer === "p2", "#19：ターンプレイヤーはそのまま（相手のターンが続く）")
}

console.log("=== 器AK：#26と同じ扱い＝ドローステップの通常ドローでは発動しない ===")
{
    const s = game("ak-drawstep-not-triggered")
    act(s, "p1", { type: "endTurn" })
    const nexus = createInstance("BS13-067", s.turn, getCard("BS13-067").levels[1]!.cores)
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)

    draw(s, "p2", 1, true) // fromDrawStep=true＝ドローステップ本体のドロー

    assert(s.phase === "main", "ドローステップのドローでは相手のメインステップは終了しない")
}

console.log("=== 器AL・#029 Lv1-3：自分の赤すべては、BP6000以下の相手を疲労状態でブロックできる ===")
{
    const s = game("al-canblock-maxbp")
    const grantor = createInstance("BS13-029", s.turn, getCard("BS13-029").levels[0]!.cores) // Lv1
    s.players.p1.field.spirits.push(grantor)
    const redBlocker = createInstance(
        ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length === 1 && c.colors[0] === "red")!.cardId,
        s.turn,
        1,
    )
    redBlocker.isRested = true
    s.players.p1.field.spirits.push(redBlocker)
    s.phase = "attack"
    s.turnPlayer = "p2" // 『相手のアタックステップ』＝p1から見て相手のターン
    refreshLevelAsOverrides(s)

    const weakAttacker = createInstance(
        ALL_CARDS.find((c) => c.type === "spirit" && c.effect === "" && c.levels[0] !== undefined && c.levels[0].bp <= 6000)!.cardId,
        s.turn,
        1,
    )
    const strongAttacker = createInstance(
        ALL_CARDS.find((c) => c.type === "spirit" && c.levels[0] !== undefined && c.levels[0].bp > 6000)!.cardId,
        s.turn,
        1,
    )
    s.players.p2.field.spirits.push(weakAttacker, strongAttacker)
    refreshLevelAsOverrides(s)

    assert(canBlock(s, "p1", redBlocker, "p2", weakAttacker) === null, "BP6000以下の相手は疲労状態でもブロックできる")
    assert(canBlock(s, "p1", redBlocker, "p2", strongAttacker) !== null, "BP6000超の相手は疲労状態ではブロックできない")
}

console.log("=== 器AL・#029 Lv2-3：自分の赤すべては、相手の合体スピリットを疲労状態でブロックできる ===")
{
    const s = game("al-canblock-combined")
    const grantor = createInstance("BS13-029", s.turn, getCard("BS13-029").levels[1]!.cores) // Lv2
    s.players.p1.field.spirits.push(grantor)
    const redBlocker = createInstance(
        ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length === 1 && c.colors[0] === "red")!.cardId,
        s.turn,
        1,
    )
    redBlocker.isRested = true
    s.players.p1.field.spirits.push(redBlocker)
    s.phase = "attack"
    s.turnPlayer = "p2"
    refreshLevelAsOverrides(s)

    // BP6000超を選ぶ：Lv2では器AL・e1（targetMaxBp:6000）も同時に有効なので、
    // e1の軸に紛れず「合体していないから防げない」を単独で見るためBPで軸をずらす
    const normalAttacker = createInstance(
        ALL_CARDS.find((c) => c.type === "spirit" && c.levels[0] !== undefined && c.levels[0].bp > 6000)!.cardId,
        s.turn,
        1,
    )
    s.players.p2.field.spirits.push(normalAttacker)
    refreshLevelAsOverrides(s)
    assert(canBlock(s, "p1", redBlocker, "p2", normalAttacker) !== null, "合体していない相手は疲労状態でブロックできない（Lv2の軸では守らない）")

    // 合体スピリットを模す（instIsCombinedがbraveRefsを見る）
    normalAttacker.braveRefs = [{ slot: "single", instanceId: "dummy-brave-id" }]
    assert(canBlock(s, "p1", redBlocker, "p2", normalAttacker) === null, "合体スピリットは疲労状態でもブロックできる")
}

console.log("=== 器AL：BS13-031 Lv1-2 甲竜すべては、相手のスピリットすべてを疲労状態でブロックできる（BP・合体の絞り込み無し） ===")
{
    const s = game("al-canblock-kabuto")
    const grantor = createInstance("BS13-031", s.turn, getCard("BS13-031").levels[0]!.cores)
    s.players.p1.field.spirits.push(grantor)
    grantor.isRested = true
    s.phase = "attack"
    s.turnPlayer = "p2"
    refreshLevelAsOverrides(s)
    const strongAttacker = createInstance(
        ALL_CARDS.find((c) => c.type === "spirit" && c.levels[0] !== undefined && c.levels[0].bp > 6000)!.cardId,
        s.turn,
        1,
    )
    s.players.p2.field.spirits.push(strongAttacker)
    refreshLevelAsOverrides(s)
    assert(canBlock(s, "p1", grantor, "p2", strongAttacker) === null, "BP上限なしで疲労状態でもブロックできる")
}

console.log("=== 器AM：BS13-026Lv1「お互いのデッキは、効果ではターンに3枚までしか破棄されない」（自分の効果によるミルも含む） ===")
{
    const s = game("am-millcap-mutual")
    const nexus026 = createInstance("BS13-026", s.turn, getCard("BS13-026").levels[0]!.cores)
    s.players.p1.field.spirits.push(nexus026)
    refreshLevelAsOverrides(s)
    s.players.p1.deck = Array.from({ length: 10 }, () => "BS01-001")

    resolveAction(s, "p1", null, { type: "mill", count: 5, side: "own" }) // 自分の効果で自分のデッキを破棄

    assert(s.players.p1.trashCards.length === 3, "器AM：自分の効果によるミルでも、ターンに3枚までしか破棄されない")
}

console.log("=== 器AN・BS13-027Lv1-2：このスピリットを手札に戻すことで、相手のスピリット1体を指定する。ブロックされなかったそのアタックでは自分のライフは減らない ===")
{
    const s = game("an-negate-life-cost")
    const source027 = createInstance("BS13-027", s.turn, getCard("BS13-027").levels[0]!.cores)
    s.players.p1.field.spirits.push(source027)
    const enemy = createInstance(ALL_CARDS.find((c) => c.type === "spirit")!.cardId, s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)

    resolveAction(s, "p1", source027, { type: "negateLifeDamageFromTarget", costReturnSelfToHand: true }, enemy.instanceId)

    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === source027.instanceId), "コストとして自身が手札に戻った")
    assert(s.players.p1.hand.includes("BS13-027"), "手札にBS13-027が加わった")
    assert(enemy.lifeDamageNegatedFor === "p1", "指定した相手のアタックでは自分のライフが減らない印がついた")
}

console.log("=== 器AN：対象がいなければコストを払わず不発（COST_MODEL.md §1） ===")
{
    const s = game("an-negate-life-noTarget")
    const source027 = createInstance("BS13-027", s.turn, getCard("BS13-027").levels[0]!.cores)
    s.players.p1.field.spirits.push(source027)
    refreshLevelAsOverrides(s)

    resolveAction(s, "p1", source027, { type: "negateLifeDamageFromTarget", costReturnSelfToHand: true })

    assert(s.players.p1.field.spirits.some((x) => x.instanceId === source027.instanceId), "対象がいないので自身は手札に戻らなかった（コスト不払い）")
}

console.log("=== 器AN：BS13-027Lv2「相手のスピリットの効果では、自分のライフは減らされない」 ===")
{
    const s = game("an-life-immune-spirit-effect")
    const source027 = createInstance("BS13-027", s.turn, getCard("BS13-027").levels[1]!.cores) // Lv2
    s.players.p1.field.spirits.push(source027)
    refreshLevelAsOverrides(s)
    const lifeBefore = s.players.p1.life

    // 相手のスピリットの効果でライフを減らそうとする（lifeCrush、srcType:"spirit"）
    resolveAction(s, "p2", null, { type: "lifeCrush", count: 1 }, undefined, undefined, "spirit")

    assert(s.players.p1.life === lifeBefore, "相手のスピリットの効果ではライフが減らない")
}

console.log("=== 器AO：BS13-079メイン「このターンの間、自分の効果で手札に戻るスピリットは持ち主のデッキの上に戻る」 ===")
{
    const s = game("ao-bounce-decktop")
    resolveAction(s, "p1", null, { type: "bounceToDeckTopThisTurn" })
    const target = createInstance(ALL_CARDS.find((c) => c.type === "spirit")!.cardId, s.turn, 1)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    const deckLenBefore = s.players.p2.deck.length

    resolveAction(s, "p1", null, { type: "returnToHand", count: 1 }, target.instanceId)

    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === target.instanceId), "対象は場を離れた")
    assert(!s.players.p2.hand.includes(target.cardId) || s.players.p2.hand.filter((c) => c === target.cardId).length === 0,
        "手札には加わっていない")
    assert(s.players.p2.deck.length === deckLenBefore + 1 && s.players.p2.deck[0] === target.cardId,
        "器AO：手札の代わりに持ち主のデッキの上に戻った")
}

console.log("=== 器AO：「〜を手札に戻すことで」のコスト支払いもデッキの上へ振り替わる ===")
{
    const s = game("ao-bounce-cost")
    resolveAction(s, "p1", null, { type: "bounceToDeckTopThisTurn" })
    // コストにする自分のスピリット（【神速】持ち）と、効果の対象になる相手のスピリット
    const cost = createInstance("BS13-021", s.turn, 1)
    s.players.p1.field.spirits.push(cost)
    const target = createInstance(ALL_CARDS.find((c) => c.type === "spirit")!.cardId, s.turn, 1)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    const deckLenBefore = s.players.p1.deck.length

    resolveAction(s, "p1", null, { type: "returnToHand", count: 1, costReturnOwnSpiritKeyword: "soku" }, target.instanceId)

    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === cost.instanceId), "コストのスピリットは場を離れた")
    assert(!s.players.p1.hand.includes("BS13-021"), "コストのスピリットは手札に加わっていない")
    assert(s.players.p1.deck.length === deckLenBefore + 1 && s.players.p1.deck[0] === "BS13-021",
        "器AO：コストとして戻すスピリットも持ち主のデッキの上へ振り替わる")
}

console.log("=== 器AQ：BS13-068Lv1-2「お互い、シンボル2つを持つスピリットはターンに1回しかアタックできない」 ===")
{
    const s = game("aq-attack-once")
    act(s, "p1", { type: "endTurn" })
    act(s, "p2", { type: "endTurn" }) // p1のターン（turn3）。攻撃可能
    const nexus = createInstance("BS13-068", s.turn, getCard("BS13-068").levels[0]!.cores)
    s.players.p1.field.nexuses.push(nexus)
    const attacker = createInstance(
        ALL_CARDS.find((c) => c.type === "spirit" && c.symbol.length === 2)!.cardId,
        s.turn,
        1,
    )
    s.players.p1.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    act(s, "p1", { type: "nextPhase" }) // アタックステップへ

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "1回目のアタックはできる")
    act(s, "p2", { type: "pass" })
    assert(takeLifeAndResolve(s, "p2") === null, "ブロックされずライフで受けてバトルが終了する")
    attacker.isRested = false // 疲労を無視して2回目を試す（このテストは体数制限そのものを見る）

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) !== null, "器AQ：シンボル2つのスピリットは同じターンに2回アタックできない")
}

console.log("すべてのチェックに合格しました 🎉（part304）")
