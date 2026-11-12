// smoke パート918（先攻はランダムに決め、p2 が先攻でも p1 先攻と同じ手順で進む。2026-11-13 ユーザー要望）
import { act, assert, createGame, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function start(first: PlayerId): GameState {
    const s = createGame(`p918-${first}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" }, first)
    runTurnStart(s)
    return s
}

console.log("=== p2 が先攻でも、先攻1ターン目の手順は p1 先攻と同じ ===")
{
    const a = start("p1")
    const b = start("p2")
    const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1")
    assert(b.turnPlayer === "p2" && b.priorityPlayer === "p2" && b.phase === a.phase, `p2 のターンで同じステップから始まる（${b.turnPlayer}・${b.phase}）`)
    assert(b.players.p2.hand.length === a.players.p1.hand.length && b.players.p1.hand.length === a.players.p2.hand.length, "先攻・後攻の手札の枚数が入れ替わるだけ")
    assert(b.players.p2.reserve === a.players.p1.reserve && b.players.p1.reserve === a.players.p2.reserve, "リザーブも入れ替わるだけ")
    const turn = b.turn
    assert(act(b, "p2", { type: "endTurn" }) === null, "p2 がターンを終える")
    assert(b.turnPlayer === other("p2") && b.turn === turn + 1, `次は p1 のターン（${b.turnPlayer}・ターン${b.turn}）`)
}

console.log("すべてのチェックに合格しました 🎉（part918）")
