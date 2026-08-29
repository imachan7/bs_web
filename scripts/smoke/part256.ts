// smoke パート256（BS10青バッチ2：未完成の古代戦艦：竜骨／ネクサスエクステンション／
// オリオンパワー／エリダヌスフラッドの4枚を新規構造化。2026-08-28）
//
// 新設した機構: recoverMagicFromTrashのネクサス版アクション「recoverNexusFromTrash」
// （server/src/logic/actions/handDeck.ts）。それ以外はすべて既存の器
// （constraintGrant canBlockWhileRested targetMaxCost／levelAs treatAs:{plus:1}／
// deployNexus from:"trash"／lendSelfThisTurn + fieldEvent ownSpiritDealtLife familyFilter／
// TargetFilter.combined／bpBuff anySide）で書けた。
// ⚠️ cardId はハードコードせず、名前をカードデータで機械検証してから使う。
import {
    act,
    assert,
    createGame,
    createInstance,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { canBlock } from "../../shared/block"
import { currentLevel, effectiveBp } from "../../shared/rules"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

import { getCard } from "../../server/src/logic/GameState"

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS10-094").name === "未完成の古代戦艦：竜骨", "BS10-094 は未完成の古代戦艦：竜骨")
    assert(getCard("BS10-112").name === "ネクサスエクステンション", "BS10-112 はネクサスエクステンション")
    assert(getCard("BS10-113").name === "オリオンパワー", "BS10-113 はオリオンパワー")
    assert(getCard("BS10-114").name === "エリダヌスフラッド", "BS10-114 はエリダヌスフラッド")
    assert(getCard("BS01-012").name === "トライソードン" && getCard("BS01-012").cost === 4, "BS01-012はコスト4")
    assert(getCard("BS01-016").name === "スケルトン・ジョウ" && getCard("BS01-016").cost === 5, "BS01-016はコスト5")
    assert(getCard("BS01-001").name === "ゴラドン" && getCard("BS01-001").effects.length === 0, "BS01-001はバニラ")
    assert(getCard("BS01-003").name === "テラノセイバー" && getCard("BS01-003").effects.length > 0, "BS01-003はバニラでない")
    assert(getCard("BS03-072").name === "槍兵のジェフリー" && getCard("BS03-072").family.includes("闘神"), "BS03-072は系統：闘神")
}

console.log("=== BS10-094 Lv1：バニラの自分スピリットは、相手のアタックステップに疲労状態でコスト4以下をブロックできる ===")
{
    const s = base("t256-094-block")
    putNexus(s, "p1", "BS10-094", 0) // Lv1
    const vanillaBlocker = put(s, "p1", "BS01-001", 1) // ゴラドン（バニラ）
    vanillaBlocker.isRested = true
    const nonVanillaBlocker = put(s, "p1", "BS01-003", 1) // テラノセイバー（効果持ち）
    nonVanillaBlocker.isRested = true
    const atk4 = createInstance("BS01-012", s.turn, 1) // コスト4
    const atk5 = createInstance("BS01-016", s.turn, 1) // コスト5
    s.players.p2.field.spirits.push(atk4, atk5)
    s.phase = "attack"
    s.turnPlayer = "p2" // 相手のアタックステップ

    assert(
        canBlock(s, "p1", vanillaBlocker, "p2", atk4) === null,
        "バニラかつ疲労状態でも、コスト4以下のアタッカーはブロックできる",
    )
    assert(
        canBlock(s, "p1", vanillaBlocker, "p2", atk5) !== null,
        "コスト5以上のアタッカーは疲労状態ではブロックできない",
    )
    assert(
        canBlock(s, "p1", nonVanillaBlocker, "p2", atk4) !== null,
        "効果を持つ（バニラでない）スピリットは疲労状態でブロックできない",
    )
}

console.log("=== BS10-094 Lv2：バニラの自分スピリットのLvを1つ上として扱う（最高Lvで頭打ち） ===")
{
    const s = base("t256-094-levelas")
    putNexus(s, "p1", "BS10-094", 3) // Lv2
    const lv1 = put(s, "p1", "BS01-001", 1) // ゴラドンLv1（Lv1/Lv2を持つ）
    const lv2 = put(s, "p1", "BS01-001", 3) // ゴラドンLv2（既に最高Lv）
    const nonVanilla = put(s, "p1", "BS01-003", 1) // テラノセイバー（バニラでない）
    refreshLevelAsOverrides(s)
    assert(currentLevel(lv1).level === 2, "Lv1のバニラスピリットは1つ上のLv2として扱われる")
    assert(currentLevel(lv2).level === 2, "既にLv2（最高Lv）のバニラスピリットは頭打ちでLv2のまま")
    assert(currentLevel(nonVanilla).level === 1, "バニラでないスピリットは対象にならず、生のLvのまま")
}

console.log("--- BS10-094 が Lv1 のときは、バニラスピリットのLvを1つ上として扱わない（Lv2限定の回帰確認） ---")
{
    const s = base("t256-094-levelas-lv1nexus")
    putNexus(s, "p1", "BS10-094", 0) // Lv1
    const lv1 = put(s, "p1", "BS01-001", 1)
    refreshLevelAsOverrides(s)
    assert(currentLevel(lv1).level === 1, "ネクサスがLv1の間は効果が発揮されない")
}

console.log("=== BS10-112：トラッシュのネクサス1枚を配置し、その後もう1枚を手札に戻す ===")
{
    const s = base("t256-112-nexus")
    s.players.p1.trashCards = ["BS01-101", "BS05-065"] // どちらもネクサス（古龍の縄張り／青嵐の虚空）
    s.players.p1.hand = ["BS10-112"]
    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ネクサスエクステンションを使用")
    assert(s.players.p1.field.nexuses.length === 1, "トラッシュのネクサス1枚がコストを支払わずに配置された")
    assert(s.players.p1.field.nexuses[0]!.cardId === "BS05-065", "配置されたのはトラッシュ末尾（新しい方）の青嵐の虚空")
    assert(
        s.players.p1.trashCards.length === 1 && s.players.p1.trashCards[0] === "BS10-112",
        "トラッシュに残っていたもう1枚（古龍の縄張り）も手札に戻る（トラッシュに残るのは使用済みのBS10-112自身だけ）",
    )
    assert(
        s.players.p1.hand.includes("BS01-101") && s.players.p1.hand.length === handBefore, // 使用した112が抜けて101が入るので枚数は変わらない
        "その後の手順で古龍の縄張りが手札に戻った",
    )
}

console.log("=== BS10-113：貸与後、系統「闘神」を持つ自分のスピリットのアタックでライフを減らすと相手デッキが10枚破棄される ===")
{
    const s = base("t256-113-family")
    s.players.p1.hand = ["BS10-113"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "オリオンパワーを使用")
    const atk = put(s, "p1", "BS03-072", 1) // 槍兵のジェフリー（闘神）
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "槍兵のジェフリーでアタック")
    const before = s.players.p2.trashCards.length
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
    assert(s.players.p2.trashCards.length === before + 10, "系統「闘神」のアタックでライフを減らしたので相手デッキが10枚破棄される")
}

console.log("--- BS10-113：系統が違うスピリットのアタックでは破棄されない ---")
{
    const s = base("t256-113-nonfamily")
    s.players.p1.hand = ["BS10-113"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "オリオンパワーを使用")
    const atk = put(s, "p1", "BS01-001", 1) // ゴラドン（系統：爬獣）
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ゴラドンでアタック")
    const before = s.players.p2.trashCards.length
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
    assert(s.players.p2.trashCards.length === before, "系統「闘神」/「星魂」を持たないので破棄されない")
}

console.log("=== BS10-114：相手の合体スピリットを破壊する。合体していない相手スピリットは対象にならない ===")
{
    const s = base("t256-114-combined")
    const combined = put(s, "p2", "BS01-003", 1)
    combined.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }] // 合体スピリット扱いにする簡略化（instIsCombined）
    const notCombined = put(s, "p2", "BS01-001", 1)
    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { combined: true } })
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === combined.instanceId),
        "合体スピリットが破壊される",
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === notCombined.instanceId),
        "合体していない相手スピリットは対象にならず残る",
    )
}

console.log("=== 112/113/114 のフラッシュ：BP+3000/4000は自分・相手どちらのスピリットも対象にできる（anySide） ===")
{
    const s = base("t256-flash-anyside")
    const ownSpirit = put(s, "p1", "BS01-001", 1)
    const oppSpirit = put(s, "p2", "BS01-001", 1)
    const ownBefore = effectiveBp(s, "p1", ownSpirit)
    const oppBefore = effectiveBp(s, "p2", oppSpirit)
    resolveAction(s, "p1", null, { type: "bpBuff", amount: 3000, anySide: true }, ownSpirit.instanceId)
    assert(effectiveBp(s, "p1", ownSpirit) === ownBefore + 3000, "112/113のフラッシュ：自分のスピリットをBP+3000できる")
    resolveAction(s, "p1", null, { type: "bpBuff", amount: 3000, anySide: true }, oppSpirit.instanceId)
    assert(effectiveBp(s, "p2", oppSpirit) === oppBefore + 3000, "112/113のフラッシュ：相手のスピリットもBP+3000できる")
    const oppSpirit2 = put(s, "p2", "BS01-001", 1)
    const oppBefore2 = effectiveBp(s, "p2", oppSpirit2)
    resolveAction(s, "p1", null, { type: "bpBuff", amount: 4000, anySide: true }, oppSpirit2.instanceId)
    assert(effectiveBp(s, "p2", oppSpirit2) === oppBefore2 + 4000, "114のフラッシュ：相手のスピリットもBP+4000できる")
}

console.log("すべてのチェックに合格しました 🎉（part256）")
