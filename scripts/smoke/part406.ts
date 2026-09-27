// smoke パート406（記録の枠：ステップの間に別の効果が挟まっても、同じ効果の後ろのステップは自分の記録を読む。IF_UNIFY.md §6）
import { act, assert, createGame, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { pushResumeFrames } from "../../server/src/logic/GameState"

const VANILLA = "BS01-002" // ロクケラトプス（スピリット）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VANILLA).type === "spirit", "VANILLAはスピリット")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.phase = "attack" // 手札を破棄できないメインステップの制限に掛からないステップ
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = [VANILLA, VANILLA, VANILLA]
    return s
}

const discardThenDraw: EffectAction = {
    type: "sequence",
    actions: [{ type: "discardSelfChoose", count: "any" }, { type: "draw", count: 1, countCounter: "lastMoved" }],
}

console.log("=== 1. 破棄の途中で別の効果（デッキを3枚破棄）が挟まっても、ドローは自分が破棄した1枚ぶん ===")
{
    const s = game("interleave")
    resolveAction(s, "p1", null, discardThenDraw)
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(s.pendingChoice?.pid === "p1", "前提：まだ破棄の選択中")
    // 別の効果が、同じ効果の続き（ドロー）より先に解決される場面を作る
    pushResumeFrames(s, [{ kind: "action", selfInstanceId: null, actorPid: "p1", action: { type: "sequence", actions: [{ type: "mill", count: 3, side: "own" }] } }])
    const deck = s.players.p1.deck.length
    act(s, "p1", { type: "resolveChoice" })
    assert(s.pendingChoice === null, "前提：解決しきった")
    assert(deck - s.players.p1.deck.length === 3 + 1, "挟まった効果で3枚破棄し、ドローは1枚だけ")
    assert(s.players.p1.hand.length === 2 + 1, "手札は残り2枚＋1枚ドロー")
}

console.log("すべてのチェックに合格しました 🎉（part406）")
