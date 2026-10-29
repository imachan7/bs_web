// smoke パート554
//   - bpBuff.amountCounter ownExhausted（26RBS02-087「疲労状態の自分のスピリット1体につき」）
//   - AuraCounter ownFamily.otherThanTarget（26RBS03-003「このスピリット以外の」）
//   - CardPick.keisho（26RBS02-CP01「その中の継召を持つスピリットカード」）
//   - IfCond opponentLifeNotLostThisTurn（26RBS02-X02）
//   - bpMinus が複数体の対象を lastTarget に控える（26RBS02-091「それらがBP0なら破壊する」）
import { assert, createGame, createInstance, getCard, resolveAction } from "./helpers"
import { countAuraCounter, effectiveBp } from "../../shared/rules"
import type { GameState, PlayerId } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        s.players[pid].field.spirits = []
        s.players[pid].field.nexuses = []
    }
    return s
}

console.log("=== 1. 疲労状態の自分のスピリット数だけBP+ ===")
{
    const s = game("554a")
    const a = createInstance("BS01-006", 1, 1)
    const b = createInstance("BS01-006", 1, 1)
    a.isRested = true
    b.isRested = true
    s.players.p1.field.spirits.push(a, b)
    const total = (): number => effectiveBp(s, "p1", a) + effectiveBp(s, "p1", b)
    const before = total()
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "bp", amount: 1000, amountCounter: "ownExhausted" }], duration: "turn", side: "own", count: 1 })
    assert(total() === before + 2000, "疲労2体なので1体に+2000")
}

console.log("=== 2. このスピリット以外の系統持ちを数える ===")
{
    const s = game("554b")
    const a = createInstance("BS01-006", 1, 1)
    const b = createInstance("BS01-006", 1, 1)
    s.players.p1.field.spirits.push(a, b)
    const family = getCard("BS01-006").family[0]!
    assert(countAuraCounter(s, "p1", { ownFamily: family }, a) === 2, "素の ownFamily は自身も数える")
    assert(countAuraCounter(s, "p1", { ownFamily: family, otherThanTarget: true }, a) === 1, "otherThanTarget は自身を数えない")
}

console.log("=== 3. オープンから継召持ちだけを手札に加える ===")
{
    const s = game("554c")
    const effects = getCard("BS01-006").effects as unknown as object[]
    effects.push({ kind: "exTrashReduction" })
    try {
        s.players.p1.deck = ["BS01-002", "BS01-006", "BS01-003"]
        const handBefore = s.players.p1.hand.length
        resolveAction(s, "p1", null, { type: "reveal", count: 3, pick: { keisho: true, cardType: "spirit" }, pickCount: 2, dest: "hand", rest: "deckBottom" })
        assert(s.players.p1.hand.length === handBefore + 1, "継召持ちの1枚だけ手札に入る")
        assert(s.players.p1.hand.includes("BS01-006"), "手札に入ったのは継召持ち")
    } finally {
        effects.pop()
    }
}

console.log("=== 4. このターンに相手のライフが減っていないなら ===")
{
    const s = game("554d")
    const draw = { type: "if", cond: { opponentLifeNotLostThisTurn: true }, then: { type: "draw", count: 1 } } as const
    const h0 = s.players.p1.hand.length
    resolveAction(s, "p1", null, draw)
    assert(s.players.p1.hand.length === h0 + 1, "減っていなければ成立")
    s.lifeLostThisTurn = { p2: true }
    resolveAction(s, "p1", null, draw)
    assert(s.players.p1.hand.length === h0 + 1, "相手のライフが減っていたら不成立")
}

console.log("=== 5. 2体にBP-してBP0の全員を破壊する ===")
{
    const s = game("554e")
    s.players.p2.field.spirits.push(createInstance("BS01-006", 1, 1), createInstance("BS01-006", 1, 1))
    resolveAction(s, "p1", null, {
        type: "sequence",
        actions: [{ type: "bpMinus", amount: 99999, count: 2 }, { type: "destroy", count: 2, filter: { lastTarget: true, maxBp: 0 } }],
    })
    assert(s.players.p2.field.spirits.length === 0, "BP0になった2体とも破壊された")
}
