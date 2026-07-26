// smoke パート59（多色カードの軽減シンボル：色別突き合わせ）
//
// 軽減シンボルは「色ごとに、その色のフィールドシンボル数まで」しか適用されない。
// 修正前は reductionColors 全体を1つの集合として countSymbols に渡していたため、
// 混色の軽減を持つ多色カードで**別の色のシンボルでも払えてしまう**バグがあった
// （BS05-X19＝コスト9・軽減 赤3白3 が、赤シンボル6個・白0個の場でコスト3になっていた。正しくは6）。
//
// 単色カードは軽減シンボルが1色しかないため、修正の前後で結果は変わらない。
// 既存パートが無変更で通ることが単色側の挙動保存の確認になっており、ここでは混色側を押さえる。
import { assert, cardHasColor, createGame, createInstance, effectiveCost, getCard } from "./helpers"
import type { GameState } from "./helpers"

// 自分の場に、指定カードのスピリットを n 体置く（シンボル供給用）
function putSymbols(s: GameState, cardId: string, n: number): void {
    for (let i = 0; i < n; i++) s.players.p1.field.spirits.push(createInstance(cardId, s.turn, 1))
}

console.log("=== 多色カードの軽減：片方の色のシンボルだけでは、その色ぶんしか軽減されない ===")
{
    const s = createGame("reduction-multicolor", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    const x19 = getCard("BS05-X19") // 聖皇ジークフリーデン
    // テスト前提をデータから機械的に確認する（cards.json 由来の値をハードコードしない）
    assert(cardHasColor(x19, "red") && cardHasColor(x19, "white"), "テスト前提: X19 は赤・白の多色")
    assert(x19.cost === 9, `テスト前提: X19 のコストは9（実際 ${x19.cost}）`)
    const redNeed = x19.reduction.filter((c) => c === "red").length
    const whiteNeed = x19.reduction.filter((c) => c === "white").length
    assert(redNeed === 3 && whiteNeed === 3, `テスト前提: 軽減は赤3・白3（実際 赤${redNeed}・白${whiteNeed}）`)

    const redSymbol = getCard("BS01-001") // ゴラドン（赤・シンボル1個）
    assert(
        redSymbol.symbol.length === 1 && redSymbol.symbol[0] === "red",
        "テスト前提: ゴラドンは赤シンボル1個",
    )

    // 赤シンボル6個・白0個。赤の軽減3個だけが払えるので 9 - 3 = 6
    putSymbols(s, "BS01-001", 6)
    assert(
        effectiveCost(s, "p1", x19) === 6,
        `赤6個・白0個なら軽減は赤ぶんの3だけ＝コスト6（実際 ${effectiveCost(s, "p1", x19)}）`,
    )
}

console.log("--- 両方の色のシンボルが揃えば、軽減はすべて適用される ---")
{
    const s = createGame("reduction-multicolor-both", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    const x19 = getCard("BS05-X19")
    const whiteSymbol = getCard("BS01-093") // 白のスピリット（シンボル1個）
    assert(
        whiteSymbol.symbol.length === 1 && whiteSymbol.symbol[0] === "white",
        `テスト前提: ${whiteSymbol.name} は白シンボル1個`,
    )

    putSymbols(s, "BS01-001", 3) // 赤3
    putSymbols(s, whiteSymbol.cardId, 3) // 白3
    assert(
        effectiveCost(s, "p1", x19) === 3,
        `赤3・白3なら軽減6すべてが適用されコスト3（実際 ${effectiveCost(s, "p1", x19)}）`,
    )
}

console.log("--- 余分に並べても、必要数を超えて軽減されない ---")
{
    const s = createGame("reduction-multicolor-excess", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    const x19 = getCard("BS05-X19")
    putSymbols(s, "BS01-001", 10) // 赤10（必要なのは3）
    assert(
        effectiveCost(s, "p1", x19) === 6,
        `赤を余分に並べても赤の軽減3までしか効かない＝コスト6（実際 ${effectiveCost(s, "p1", x19)}）`,
    )
}

console.log("--- 単色カードは修正の影響を受けない（回帰確認） ---")
{
    const s = createGame("reduction-monocolor", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    const mono = getCard("BS01-025") // 要塞龍ギガ（赤・単色）
    assert(mono.colors.length === 1, `テスト前提: ${mono.name} は単色`)
    const need = mono.reduction.length
    const noSymbol = effectiveCost(s, "p1", mono)
    assert(noSymbol === mono.cost, `シンボル0個なら軽減なし（コスト${mono.cost}）`)

    putSymbols(s, "BS01-001", need)
    assert(
        effectiveCost(s, "p1", mono) === mono.cost - need,
        `赤シンボルを軽減数ぶん並べれば全部軽減される（${mono.cost} - ${need}）`,
    )
}
