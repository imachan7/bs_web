// smoke パート58（多色カード対応の回帰テスト）
//
// BS05 で多色カードが初登場した（BS05-X19 聖皇ジークフリーデン＝赤・白、
// BS05-X20 大甲帝デスタウロス＝紫・緑）。CardData.color（単数）を colors: Color[] へ
// 置換した際に静かに壊れやすい箇所を、実カードで押さえる。
//
// 検証するのは MULTICOLOR.md §6 の5点:
//   A. 多色カードは両方の色を持つ（色参照の効果はどちらの色でもヒットする）
//   B. 装甲は発生源の色のいずれかが装甲色に一致すれば防ぐ
//   C. 軽減シンボルは色ごとに1個（OR にして2個数えてはいけない）
//   D. ライフダメージはシンボル数（色は無関係）
//   E. デッキビルダーの単色プリセットに多色カードが混ざらない
import { assert, cardHasColor, createGame, createInstance, getCard, resolveAction } from "./helpers"
import { countSymbols, hasArmorAgainst, instanceSymbolCount, instColors, instHasColor } from "../../shared/rules"

const MULTI_RW = "BS05-X19" // 聖皇ジークフリーデン（赤・白）
const MULTI_PG = "BS05-X20" // 大甲帝デスタウロス（紫・緑）

console.log("=== §A 多色カードは両方の色を持つ ===")
{
    const rw = getCard(MULTI_RW)
    assert(rw.name === "聖皇ジークフリーデン", `テスト前提: ${MULTI_RW} は聖皇ジークフリーデン`)
    assert(rw.colors.length === 2, "聖皇ジークフリーデンは多色（2色）")
    assert(cardHasColor(rw, "red") && cardHasColor(rw, "white"), "赤でも白でもヒットする")
    assert(!cardHasColor(rw, "blue"), "持っていない色ではヒットしない")

    const pg = getCard(MULTI_PG)
    assert(pg.name === "大甲帝デスタウロス", `テスト前提: ${MULTI_PG} は大甲帝デスタウロス`)
    assert(cardHasColor(pg, "purple") && cardHasColor(pg, "green"), "紫でも緑でもヒットする")

    // 場のインスタンスでも同じ（instHasColor は付与色も見るが、静的な多色も拾う）
    const inst = createInstance(MULTI_RW, 1, 1)
    assert(instHasColor(inst, "red") && instHasColor(inst, "white"), "場のインスタンスも両色を持つ")
    assert(instColors(inst).length === 2, "instColors は2色を返す")
}

console.log("=== §B 装甲は発生源のいずれかの色に一致すれば防ぐ ===")
{
    // ラタトスカ（BS03-037）は【装甲：赤】。赤・白の多色発生源の効果も防がれる
    const armored = createInstance("BS03-037", 1, 1)
    assert(hasArmorAgainst(armored, ["red"]) === true, "赤の発生源は防ぐ")
    assert(hasArmorAgainst(armored, ["white"]) === false, "白の発生源は防がない")
    assert(
        hasArmorAgainst(armored, getCard(MULTI_RW).colors) === true,
        "赤・白の多色発生源は（赤を含むので）防ぐ",
    )
    assert(
        hasArmorAgainst(armored, getCard(MULTI_PG).colors) === false,
        "紫・緑の多色発生源は防がない",
    )

    // 実際の効果解決でも、多色発生源の破壊が装甲で防がれること
    const s = createGame("multi-armor", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    const target = createInstance("BS03-037", s.turn, 1) // ラタトスカ（装甲：赤）
    s.players.p2.field.spirits.push(target)
    resolveAction(s, "p1", null, { type: "destroy", count: 1 }, undefined, getCard(MULTI_RW).colors)
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === target.instanceId),
        "赤・白の発生源による破壊は【装甲：赤】に防がれる",
    )
    // 紫・緑の発生源なら通る
    resolveAction(s, "p1", null, { type: "destroy", count: 1 }, undefined, getCard(MULTI_PG).colors)
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === target.instanceId),
        "紫・緑の発生源による破壊は防がれない",
    )
}

console.log("=== §C 軽減シンボルは色ごとに1個ずつ（OR で二重に数えない） ===")
{
    const s = createGame("multi-symbol", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    const multi = createInstance(MULTI_RW, s.turn, 1)
    s.players.p1.field.spirits.push(multi)
    assert(
        getCard(MULTI_RW).symbol.length === 2,
        "テスト前提: 聖皇ジークフリーデンはシンボル2つ（赤白）",
    )
    assert(countSymbols(s.players.p1, ["red"]) === 1, "赤の軽減に効くのは1個（2個ではない）")
    assert(countSymbols(s.players.p1, ["white"]) === 1, "白の軽減に効くのも1個")
    assert(countSymbols(s.players.p1, ["red", "white"]) === 2, "赤白両方を求める軽減には2個効く")
    assert(countSymbols(s.players.p1, ["blue"]) === 0, "青の軽減には効かない")
}

console.log("=== §D ライフダメージはシンボル数（色は無関係） ===")
{
    const multi = createInstance(MULTI_RW, 1, 1)
    assert(instanceSymbolCount(multi) === 2, "多色ダブルシンボルのライフダメージは2")
}

console.log("=== §E 単色プリセットの母集団に多色カードが混ざらない ===")
{
    // デッキビルダーの buildPreset は colors.length === 1 で絞る（OR にすると多色が混ざる）。
    // ここでは同じ条件をデータ側で検証する
    const redOnly = getCard(MULTI_RW).colors.length === 1
    assert(!redOnly, "聖皇ジークフリーデンは単色プールの条件（colors.length === 1）に合致しない")
    const singleRed = createInstance("BS01-002", 1, 1)
    assert(getCard(singleRed.cardId).colors.length === 1, "単色カードは条件に合致する")
}
