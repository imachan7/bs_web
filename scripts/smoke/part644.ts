// smoke パート644（BS18 部品：playerRule skipMainStep・手札コストの両陣営置き換え handCostSetForPid）
import { assert, createGame, getCard, handleAction, resolveAction, runTurnStart, endTurn, effectiveCost } from "./helpers"
import type { GameState } from "./helpers"

const BIG = "BS01-021" // 焔竜魔人マ・グー（赤・コスト6）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(BIG).name === "焔竜魔人マ・グー" && getCard(BIG).cost === 6, "BIGはコスト6")
assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

console.log("=== 1. 手札コスト置き換え：お互いの手札に効く ===")
{
    const s = game("hc1")
    s.players.p1.hand = [BIG]
    s.players.p2.hand = [BIG]
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "handCostSetForPid", value: 8 } }], duration: "turn", side: "both" })
    assert(effectiveCost(s, "p1", getCard(BIG)) === 8, "自分の手札のカードのコストが8")
    assert(effectiveCost(s, "p2", getCard(BIG)) === 8, "相手の手札のカードのコストが8")
    s.players.p1.hand.push(VANILLA)
    assert(effectiveCost(s, "p1", getCard(VANILLA)) === 8, "後から手札に入ったカードにも効く")
}

console.log("=== 2. 境界：効かない場面 ===")
{
    const s = game("hc2")
    assert(effectiveCost(s, "p1", getCard(BIG)) !== 8, "置く前は印刷コスト系")
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "handCostSetForPid", value: 8 } }], duration: "turn", side: "own" })
    assert(effectiveCost(s, "p1", getCard(BIG)) === 8, "side:own は自分に効く")
    assert(effectiveCost(s, "p2", getCard(BIG)) !== 8, "side:own は相手に効かない")
    endTurn(s)
    assert(effectiveCost(s, "p1", getCard(BIG)) !== 8, "ターンをまたぐと消える")
}

console.log("=== 3. skipMainStep：相手の次のターンのメインステップを飛ばす ===")
{
    const s = game("sk1")
    s.turnPlayer = "p1"
    s.phase = "main"
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "skipMainStep" } }], duration: "nextRefresh" })
    assert(s.timedEffects.some((r) => r.until === "nextRefresh" && r.target.kind === "player" && r.target.pid === "p2"), "相手に nextRefresh で記録")
    endTurn(s)
    assert((s.turnPlayer as string) === "p2" && (s.phase as string) === "attack", "相手の次のターンはメインステップを行わずアタックステップ")
    assert(!s.timedEffects.some((r) => r.content.some((c) => c.type === "playerRule" && c.rule.type === "skipMainStep")), "使い切って消える")
    assert(s.skipMainStepNow !== true, "フラグも残らない")
    endTurn(s)
    endTurn(s)
    assert((s.turnPlayer as string) === "p2" && (s.phase as string) === "main", "その次の相手のターンは通常どおりメインステップ")
}

console.log("すべてのチェックに合格しました 🎉（part644）")
