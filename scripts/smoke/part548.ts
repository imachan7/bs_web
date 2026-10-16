// smoke パート548
//   - toHand.dest:"placeNexus"（トラッシュのネクサスをコストを支払わずに配置する）
//   - timedEffect bp の side:"own"・count>1（自分のスピリットN体までをBP+。同じ個体を2度選ばない）
//   - 「Nコスト支払うなら」＝pay（リザーブ→トラッシュ）／相手が選んで手札をデッキの下に戻す
import { assert, createGame, createInstance, effectiveBp, resolveAction, legacy } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { EffectAction } from "../../server/src/type"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        p.reserve = 5
        p.hand = []
        p.trashCards = []
        p.deck = Array.from({ length: 30 }, () => "BS01-002")
        p.field.spirits = []
        p.field.nexuses = []
    }
    return s
}

console.log("=== 1. トラッシュの青のネクサスを配置 ===")
{
    const s = game("548a")
    s.players.p1.trashCards = ["BS01-002", "BS03-113"]
    resolveAction(s, "p1", null, { type: "toHand", from: "trash", count: 1, pick: { color: "blue", cardType: "nexus", cost: { max: 5 } }, dest: "placeNexus" })
    assert(s.players.p1.field.nexuses.length === 1 && s.players.p1.field.nexuses[0]!.cardId === "BS03-113", "配置された")
    assert(s.players.p1.trashCards.join() === "BS01-002" && s.players.p1.hand.length === 0 && s.players.p1.reserve === 5, "手札に行かずコストも払わない")
}

console.log("=== 2. 自分のスピリット2体までをBP+（別々の個体） ===")
{
    const s = game("548b")
    const [a, b, c] = [createInstance("BS01-006", 1, 1), createInstance("BS01-006", 1, 1), createInstance("BS01-006", 1, 1)]
    s.players.p1.field.spirits.push(a, b, c)
    const base = effectiveBp(s, "p1", a)
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "bp", amount: 3000 }], duration: "turn", side: "own", count: 2 })
    const buffed = [a, b, c].filter((x) => effectiveBp(s, "p1", x) === base + 3000).length
    assert(buffed === 2 && [a, b, c].every((x) => effectiveBp(s, "p1", x) <= base + 3000), "2体に1回ずつ")
}

console.log("=== 3. 2コスト支払うなら、相手は手札1枚をデッキの下に戻す ===")
{
    const s = game("548c")
    s.players.p2.hand = ["BS01-002", "BS01-001"]
    const deck = s.players.p2.deck.length
    const act = { type: "pay", cost: { type: "removeCores", side: "own", from: ["reserve"], to: "trash", count: 2 }, then: legacy({ type: "toDeck", from: "hand", side: "opponent", position: "bottom", count: 1, chooserIsTarget: true }) } as EffectAction
    resolveAction(s, "p1", null, act)
    assert(s.players.p1.reserve === 3 && s.players.p2.hand.length === 1 && s.players.p2.deck.length === deck + 1, "払って相手の手札が1枚デッキ下へ")
    s.players.p1.reserve = 1
    resolveAction(s, "p1", null, act)
    assert(s.players.p2.hand.length === 1, "払えなければ戻さない")
}
