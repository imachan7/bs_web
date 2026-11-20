// smoke パート1018（draw.nth：デッキの上から nth 枚目を引く／loseGame：効果で敗北させる）
import {
    assert,
    createGame,
    getCard,
    resolveAction,
} from "./helpers"
import type { GameState } from "./helpers"

const A: string = "BS01-002"
const B: string = "BS01-003"
const C: string = "BS01-004"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(!!getCard(A).name && !!getCard(B).name && !!getCard(C).name, "A/B/C は存在するカード")
    assert(A !== B && B !== C && A !== C, "A/B/C は別のカード")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.players.p1.hand = []
    s.players.p2.hand = []
    s.players.p1.deck = [A, B, C]
    s.players.p2.deck = [A, B, C]
    return s
}

console.log("=== 1. draw nth:2（自分だけ）：2枚目を引き、上の1枚目と3枚目はデッキに残る ===")
{
    const s = game("draw-nth-own")
    resolveAction(s, "p1", null, { type: "draw", count: 1, nth: 2 })
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === B, "手札はBだけ")
    assert(s.players.p1.deck.length === 2 && s.players.p1.deck[0] === A && s.players.p1.deck[1] === C, "デッキは[A,C]")
    assert(s.players.p2.hand.length === 0 && s.players.p2.deck.length === 3, "相手は変わらない")
}

console.log("=== 2. draw nth:2 side both：自分→相手の順で両者が2枚目を引く ===")
{
    const s = game("draw-nth-both")
    s.players.p2.deck = [A, B, C]
    resolveAction(s, "p1", null, { type: "draw", count: 1, nth: 2, side: "both" })
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === B, "自分の手札はB")
    assert(s.players.p2.hand.length === 1 && s.players.p2.hand[0] === B, "相手の手札もB")
    assert(s.players.p1.deck.join() === [A, C].join() && s.players.p2.deck.join() === [A, C].join(), "両者のデッキは[A,C]")
}

console.log("=== 3. draw nth:2 でデッキが1枚しかない場合は引かない ===")
{
    const s = game("draw-nth-short")
    s.players.p1.deck = [A]
    resolveAction(s, "p1", null, { type: "draw", count: 1, nth: 2 })
    assert(s.players.p1.hand.length === 0, "手札は増えない")
    assert(s.players.p1.deck.length === 1 && s.players.p1.deck[0] === A, "デッキは変わらない")
}

console.log("=== 4. loseGame side:opponent：相手が負ける（持ち主の勝ち） ===")
{
    const s = game("lose-opp")
    resolveAction(s, "p1", null, { type: "loseGame", side: "opponent" })
    assert(s.winner === "p1", "勝者は持ち主のp1")
}

console.log("=== 5. loseGame side:own：持ち主が負ける（相手の勝ち） ===")
{
    const s = game("lose-own")
    resolveAction(s, "p1", null, { type: "loseGame", side: "own" })
    assert(s.winner === "p2", "勝者は相手のp2")
}

console.log("=== 6. すでに勝敗が決まっていれば変わらない ===")
{
    const s = game("lose-already")
    s.winner = "p2"
    resolveAction(s, "p1", null, { type: "loseGame", side: "opponent" })
    assert(s.winner === "p2", "既存の勝者p2のまま")
}

console.log("すべてのチェックに合格しました 🎉（part1018）")
