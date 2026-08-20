// smoke パート220（フィールドのシンボル参照・「◯色としても扱う」・自分自身を含む対象）
// 収録セクション:
//   - ownColorSymbols は**ネクサスのシンボルも数える**（BS04-X16機動要塞キャッスル・ゴレム）
//   - colorAs / tempColors の付与色は、**そのシンボルの色としても数える**（元の色も残る）
//   - voidCoreToOther は**発生源自身も対象に含む**（BS09-023要塞蟲ラルバ）。
//     excludeSelf を持つカードだけ自身を外す（BS01-066スタッグローブ）
//   - ラルバをLv2で召喚したとき、召喚時効果の解決時点で自身が白として数えられている
import { act, assert, createGame, createInstance, effectiveBp, getCard, resolveAction, runTurnStart } from "./helpers"
import { countSymbols } from "../../shared/rules"
import { ownFieldSymbolColors } from "../../shared/cost"
import { refreshLevelAsOverrides } from "../../server/src/logic/EffectModules"

const CASTLE = "BS04-X16" // 機動要塞キャッスル・ゴレム（青／シンボル青1／Lv2は6コア）
const BLUE_NEXUS = "BS03-113" // 力奪う凱旋門（青／シンボル青1）
const LARVA = "BS09-023" // 要塞蟲ラルバ（緑／シンボル緑1／Lv2で白としても扱う／コスト4）
const WHITE_VANILLA = "BS01-084" // ガトリングスタンド（白／効果なし）
const STAG = "BS01-066" // スタッグローブ（「このスピリット以外の」の明記あり）

console.log("=== ownColorSymbols：ネクサスのシンボルも数える ===")
{
    const s = createGame("symbols-with-nexus", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    const castle = createInstance(CASTLE, s.turn, 1)
    s.players.p1.field.spirits.push(castle)
    // スピリットだけのとき＝青シンボル1つ
    const deckBefore1 = s.players.p2.deck.length
    resolveAction(s, "p1", castle, { type: "millPer", counter: { ownColorSymbols: "blue" }, multiplier: 1 })
    assert(
        deckBefore1 - s.players.p2.deck.length === 1,
        `スピリットの青シンボル1つぶん破棄する（実際: ${deckBefore1 - s.players.p2.deck.length}）`,
    )
    // 青ネクサスを1つ置くと2つになる（修正前はネクサスを数えず1のままだった）
    s.players.p1.field.nexuses.push(createInstance(BLUE_NEXUS, s.turn, 1))
    const deckBefore2 = s.players.p2.deck.length
    resolveAction(s, "p1", castle, { type: "millPer", counter: { ownColorSymbols: "blue" }, multiplier: 1 })
    assert(
        deckBefore2 - s.players.p2.deck.length === 2,
        `ネクサスの青シンボルも数えて2枚破棄する（実際: ${deckBefore2 - s.players.p2.deck.length}）`,
    )
}

console.log("=== colorAs：付与された色のシンボルとしても数える（元の色も残る） ===")
{
    const s = createGame("symbol-color-as", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    // ラルバはLv2（2コア）で「白のスピリットとしても扱う」
    const larva = createInstance(LARVA, s.turn, 2)
    s.players.p1.field.spirits.push(larva)
    // 継続効果を組み直す（実対戦では handleAction の事後フックが毎回呼ぶ。盤面を直に組んだので明示的に通す）
    refreshLevelAsOverrides(s)
    assert(
        (larva.colorsAsContinuous ?? []).includes("white"),
        "Lv2 のラルバは白としても扱われる（colorAs が反映されている）",
    )
    assert(
        countSymbols(s.players.p1, ["green"]) === 1,
        `元の緑シンボルとしても数える（実際: ${countSymbols(s.players.p1, ["green"])}）`,
    )
    assert(
        countSymbols(s.players.p1, ["white"]) === 1,
        `付与された白のシンボルとしても数える（実際: ${countSymbols(s.players.p1, ["white"])}）`,
    )
    // Lv1（1コア）に落ちれば白ではなくなる
    larva.cores = 1
    refreshLevelAsOverrides(s)
    assert(
        countSymbols(s.players.p1, ["white"]) === 0,
        `Lv1 では白シンボルとして数えない（実際: ${countSymbols(s.players.p1, ["white"])}）`,
    )
    assert(countSymbols(s.players.p1, ["green"]) === 1, "緑シンボルは変わらず1つ")
}

console.log("=== voidCoreToOther：発生源自身も対象に含む ===")
{
    const s = createGame("void-core-include-self", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const larva = createInstance(LARVA, s.turn, 2)
    s.players.p1.field.spirits.push(larva)
    const ally = createInstance(WHITE_VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(ally)
    refreshLevelAsOverrides(s) // colorAs を反映させる
    const larvaBefore = larva.cores
    const allyBefore = ally.cores

    resolveAction(s, "p1", larva, { type: "voidCoreToOther", count: 1, colorFilter: "white", targets: 2 })
    assert(ally.cores === allyBefore + 1, `味方の白スピリットにコアが置かれる（実際: ${ally.cores}）`)
    assert(
        larva.cores === larvaBefore + 1,
        `白としても扱われる発生源自身にもコアが置かれる（実際: ${larva.cores} / 期待: ${larvaBefore + 1}）`,
    )
}

console.log("=== voidCoreToOther：excludeSelf のカードは自身を対象にしない ===")
{
    const s = createGame("void-core-exclude-self", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const stag = createInstance(STAG, s.turn, 1)
    s.players.p1.field.spirits.push(stag)
    const ally = createInstance(WHITE_VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(ally)
    const stagBefore = stag.cores
    const allyBefore = ally.cores

    resolveAction(s, "p1", stag, { type: "voidCoreToOther", count: 1, excludeSelf: true })
    assert(stag.cores === stagBefore, "「このスピリット以外の」なので自身には置かれない")
    assert(ally.cores === allyBefore + 1, "他のスピリットに置かれる")
}

console.log("=== ラルバ：Lv2で召喚した時点で、自身が白として数えられている ===")
{
    const s = createGame("larva-summon-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 30
    const ally = createInstance(WHITE_VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(ally)
    const allyBefore = ally.cores
    s.players.p1.hand = [LARVA]

    // Lv2（2コア）で召喚する。『召喚時』ボイドからコア1個ずつを自分の白のスピリット2体に置く
    assert(act(s, "p1", { type: "summon", handIndex: 0, level: 2 }) === null, "Lv2で召喚できる")
    const larva = s.players.p1.field.spirits.find((sp) => sp.cardId === LARVA)
    assert(!!larva, "ラルバが場に出ている")
    assert(ally.cores === allyBefore + 1, `味方の白スピリットにコアが置かれる（実際: ${ally.cores}）`)
    assert(
        !!larva && larva.cores === getCard(LARVA).levels[1]!.cores + 1,
        `Lv2 の自身も白として数えられ、コアが1個増える（実際: ${larva?.cores} / 期待: ${getCard(LARVA).levels[1]!.cores + 1}）`,
    )
}

console.log("=== ownFieldSymbolColors：シンボルの色の種類数も同じ規則で数える ===")
{
    const s = createGame("field-symbol-colors", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const larva = createInstance(LARVA, s.turn, 2) // Lv2＝白としても扱う（シンボルは緑1つ）
    s.players.p1.field.spirits.push(larva)
    refreshLevelAsOverrides(s)
    const colors = ownFieldSymbolColors(s, "p1")
    assert(colors.has("green"), "元の緑シンボルの色を数える")
    assert(colors.has("white"), "「白としても扱う」で得た色も、シンボルの色として数える")
    assert(colors.size === 2, `色の種類数は2（実際: ${colors.size}）`)

    // 青ネクサスを足すと3色になる（ネクサスのシンボルも数える）
    s.players.p1.field.nexuses.push(createInstance(BLUE_NEXUS, s.turn, 1))
    assert(ownFieldSymbolColors(s, "p1").size === 3, "ネクサスのシンボルの色も数える")
}

console.log("=== selfBuffByExhaustFamily：発生源自身も疲労させる対象に含む ===")
{
    // BS06-X24 鎧神機ヴァルハランス（系統：武装・戦騎）：
    // 「系統：「武装」を持つ自分のスピリット1体を疲労させることで、このスピリットをBP+(疲労させたスピリットのBP)する」
    // 効果文に「このスピリット以外の」が無いので、自身が「武装」持ちなら自分を選べる（2026-08-20 ユーザー確認）
    const s = createGame("self-exhaust-buff", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const valhalans = createInstance("BS06-X24", s.turn, 3) // Lv2
    s.players.p1.field.spirits.push(valhalans)
    const bpBefore = effectiveBp(s, "p1", valhalans)
    assert(!valhalans.isRested, "まだ回復状態（アタック宣言前）")

    resolveAction(s, "p1", valhalans, { type: "selfBuffByExhaustFamily", familyFilter: "武装" })
    assert(valhalans.isRested, "自分自身を疲労させた")
    assert(
        effectiveBp(s, "p1", valhalans) === bpBefore * 2,
        `自身のBPぶん上がる（実際: ${effectiveBp(s, "p1", valhalans)} / 期待: ${bpBefore * 2}）`,
    )
}
