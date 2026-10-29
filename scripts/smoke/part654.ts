// smoke パート654（revealOpponentBurst：相手のバーストを両者に公開し、スピリットなら破棄・それ以外は元に戻す）
import { assert, createGame, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const SPIRIT = "BS01-002"
const MAGIC = "BS01-114"
function game(seed: string, burst: string | null): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.players.p2.burst = burst
    return s
}
const action = {
    type: "sequence",
    actions: [{ type: "revealOpponentBurst" }, { type: "if", cond: { last: { cardType: "spirit" } }, then: { type: "discard", from: "burst", side: "opponent" } }],
} as never

console.log("=== 1. スピリットのバーストは公開されて破棄 ===")
{
    const s = game("b1", SPIRIT)
    resolveAction(s, "p1", null, action)
    assert(s.players.p2.burst === null, "スピリットなら破棄")
    assert(s.log.some((l: string) => l.includes("オープン") && l.includes(getCard(SPIRIT).name)), "ログに両者向けでカード名が出る")
}
console.log("=== 2. スピリット以外は元に戻る（セットされたまま） ===")
{
    const s = game("b2", MAGIC)
    resolveAction(s, "p1", null, action)
    assert(s.players.p2.burst === MAGIC, "マジックならセットされたまま")
    assert(s.log.some((l: string) => l.includes(getCard(MAGIC).name)), "公開はされる")
}
console.log("=== 3. 境界：バーストが無ければ破棄も起きない ===")
{
    const s = game("b3", null)
    resolveAction(s, "p1", null, action)
    assert(s.players.p2.burst === null, "何も起きない")
}
console.log("すべてのチェックに合格しました 🎉（part654）")
