// smoke パート295（BS11-065 満天の牧草地：メインステップの手札破棄禁止）
// 「お互い、手札を破棄できない」の破棄側（ドロー側は part283 で検証済み）。
// 関門は shared/rules.ts の canDiscardHand。メインステップだけ止まり、コストとしての破棄も止まる。
import { assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const MEADOW = "BS11-065" // 満天の牧草地
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    const meadow = createInstance(MEADOW, s.turn, 1) // Lv1
    s.players.p1.field.nexuses.push(meadow)
    refreshLevelAsOverrides(s)
    return s
}

console.log("=== §A メインステップでは手札破棄が止まる（discardSelfChoose） ===")
{
    const s = game("discard-main-block")
    s.players.p1.hand = [vanilla[0]!.cardId, vanilla[1]!.cardId]
    s.phase = "main"
    resolveAction(s, "p1", null, { type: "discardSelfChoose", count: 1 })
    assert(s.players.p1.hand.length === 2, "メインステップでは破棄できない（手札は減らない）")
}

console.log("=== §B メインステップ以外では止まらない ===")
{
    const s = game("discard-attack-ok")
    s.players.p1.hand = [vanilla[0]!.cardId, vanilla[1]!.cardId]
    s.phase = "attack"
    resolveAction(s, "p1", null, { type: "discardSelfChoose", count: 1 })
    assert(s.players.p1.hand.length === 1, "メインステップ以外では通常どおり破棄できる")
}

console.log("=== §C 相手の手札破棄（discardOpponent）もメインステップでは止まる ===")
{
    const s = game("discard-opponent-block")
    s.players.p2.hand = [vanilla[0]!.cardId]
    s.phase = "main"
    resolveAction(s, "p1", null, { type: "discardOpponent", count: 1 })
    assert(s.players.p2.hand.length === 1, "相手の手札もメインステップ中は破棄されない")
}

console.log("=== §D コストとしての破棄も止まり、効果自体が発揮しない（costDiscardHandThenDraw） ===")
{
    const s = game("discard-cost-block")
    s.players.p1.hand = [vanilla[0]!.cardId, vanilla[1]!.cardId]
    const deckBefore = s.players.p1.deck.length
    s.phase = "main"
    resolveAction(s, "p1", null, { type: "costDiscardHandThenDraw", discardCount: 1, drawCount: 2 })
    assert(s.players.p1.hand.length === 2, "コストの破棄が止まるので手札は減らない")
    assert(s.players.p1.deck.length === deckBefore, "コストが払えないので本体のドローも発揮しない")
}

console.log("=== §E デッキ破棄（mill）は対象外＝メインステップでも止まらない ===")
{
    const s = game("discard-mill-ok")
    const deckBefore = s.players.p1.deck.length
    const trashBefore = s.players.p1.trashCards.length
    s.phase = "main"
    resolveAction(s, "p1", null, { type: "mill", count: 1, side: "own" })
    assert(s.players.p1.deck.length === deckBefore - 1, "デッキ破棄（mill）はメインステップ中でも止まらない")
    assert(s.players.p1.trashCards.length === trashBefore + 1, "破棄したカードはトラッシュへ行く")
}

console.log("すべてのチェックに合格しました 🎉（part295）")
