// smoke パート320（SD06 陽昇ハジメデッキ バーストヒーローズを対戦で使えること）
//
// part2 が全レシピ共通で「40枚以上・カードが実在する」を見ているので、ここは
// **そのレシピで実際にゲームを開始できるか**を見る（デッキ選択から対戦に入る経路）。
import { assert, createGame, engineRunTurnStart, getCard } from "./helpers"
import { DECK_RECIPES } from "../../data/constants"

console.log("=== SD06：実物どおりの40枚で構成されている ===")
{
    const recipe = DECK_RECIPES.sd06
    assert(recipe !== undefined, "sd06 レシピが定義されている")
    const cards = recipe!.cards
    const total = Object.values(cards).reduce((a, b) => a + b, 0)
    // 公式の収録内訳は M1 / R4 / U8 / C27 の計40枚
    assert(total === 40, `合計40枚ちょうど（実際: ${String(total)}）`)
    assert(Object.keys(cards).length === 17, "17種すべてを使っている")
    // 同名は3枚まで（禁止・制限は適用しない方針だが、基本ルールの上限は守る）
    for (const [cardId, n] of Object.entries(cards)) {
        assert(n >= 1 && n <= 3, `${cardId} は1〜3枚（実際: ${String(n)}）`)
    }
}

console.log("=== SD06：赤白の2色で、バースト持ちを7種含む ===")
{
    const cards = DECK_RECIPES.sd06!.cards
    const colors = new Set<string>()
    let burstKinds = 0
    for (const cardId of Object.keys(cards)) {
        const card = getCard(cardId)
        for (const c of card.colors) colors.add(c)
        if (card.effects.some((e) => e.kind === "burst")) burstKinds++
    }
    assert(colors.size === 2 && colors.has("red") && colors.has("white"), "赤と白の2色")
    assert(burstKinds === 7, `【バースト】持ちが7種（実際: ${String(burstKinds)}）`)
}

console.log("=== SD06：このデッキでゲームを開始できる ===")
{
    const s = createGame("sd06-start", { p1: "アキラ", p2: "ユウキ" }, { p1: "sd06", p2: "sd06" })
    engineRunTurnStart(s)
    for (const pid of ["p1", "p2"] as const) {
        assert(
            s.players[pid].deck.length + s.players[pid].hand.length === 40,
            `${pid} が40枚でゲームを開始できる`,
        )
    }
}

console.log("すべてのチェックに合格しました 🎉（part320）")
