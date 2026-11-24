// smoke パート1054（デッキ破棄の知らせ GameEvent mill。画面が枚数を1枚ずつ減らして見せるのに使う。実際に破棄した枚数を出し、破棄が起きなければ出さない）
import { assert, createGame } from "./helpers"
import type { GameState } from "./helpers"
import { millDeck } from "../../server/src/logic/zones/mill"
import { recordPlayerRule } from "../../server/src/logic/EffectModules"

const VAN = "BS01-002" // ロクケラトプス（効果なし）

function game(seed: string, deck = 40): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    for (const pid of ["p1", "p2"] as const) {
        s.players[pid].deck = Array.from({ length: deck }, () => VAN)
        s.players[pid].trashCards = []
    }
    return s
}
const mills = (s: GameState) => s.events.filter((e) => e.type === "mill") as Extract<GameState["events"][number], { type: "mill" }>[]

console.log("=== 1. 相手のデッキを3枚破棄：破棄された側と枚数を知らせる ===")
{
    const s = game("mill3")
    assert(millDeck(s, "p2", 3, "p1") === 3, "3枚破棄できる")
    const ev = mills(s)
    assert(ev.length === 1 && ev[0]!.pid === "p2" && ev[0]!.cardIds.length === 3, `p2 の3枚を1回で知らせる（実際 ${JSON.stringify(ev)}）`)
    assert(JSON.stringify(ev[0]!.cardIds) === JSON.stringify(s.players.p2.trashCards.slice(-3)), "知らせるカードは、トラッシュに置かれた3枚と同じ")
}

console.log("=== 2. デッキが足りないときは、実際に破棄した枚数を知らせる ===")
{
    const s = game("short", 2)
    assert(millDeck(s, "p2", 5, "p1") === 2, "2枚しか破棄できない")
    assert(mills(s)[0]?.cardIds.length === 2, "知らせる枚数は2")
}

console.log("=== 3. 知らせない：デッキが破棄されないルールが掛かっている／0枚の破棄 ===")
{
    const s = game("blocked")
    recordPlayerRule(s, "p2", { type: "noDeckMill", by: "opponent" })
    assert(millDeck(s, "p2", 3, "p1") === 0 && mills(s).length === 0, "相手の効果で破棄されないときは知らせない")
    const t = game("zero", 0)
    assert(millDeck(t, "p2", 3, "p1") === 0 && mills(t).length === 0, "デッキが0枚なら知らせない")
}

console.log("すべてのチェックに合格しました 🎉（part1054）")
