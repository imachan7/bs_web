// smoke パート427（R5 G-refreshBlock：timedEffect の期間 nextRefresh。BS12-047 をカードデータのまま解決する）
import { assert, createGame, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { endTurn } from "../../server/src/logic/PhaseManager"

const TRI = "BS12-047" // 海王神龍トライ・メルクリウス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TRI).name === "海王神龍トライ・メルクリウス" && getCard(TRI).type === "spirit", "TRIは海王神龍トライ・メルクリウス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    return s
}

console.log("=== BS12-047 召喚時：相手の次のリフレッシュステップだけ、トラッシュのコアは3個しか戻らない ===")
{
    const s = game("p427-tri")
    assert(s.turnPlayer === "p1", "前提：p1 のターン")
    const effect = getCard(TRI).effects.find((e) => e.kind === "triggered" && e.trigger === "onSummon") as { action: Parameters<typeof resolveAction>[3] }
    resolveAction(s, "p1", null, effect.action)
    s.players.p2.trashCores = 10
    const reserveBefore = s.players.p2.reserve
    endTurn(s) // p2 のリフレッシュステップ
    assert(s.players.p2.trashCores === 7, `トラッシュに7個残る（実際 ${s.players.p2.trashCores}）`)
    assert(s.players.p2.reserve >= reserveBefore + 3 && s.players.p2.reserve <= reserveBefore + 4, `リザーブへ戻るのは3個（コアステップ分を除く。増分 ${s.players.p2.reserve - reserveBefore}）`)
    assert(!s.timedEffects.some((r) => r.until === "nextRefresh"), "記録はそのステップで使い切る")
    endTurn(s) // p1 のターン
    endTurn(s) // 次の p2 のリフレッシュステップでは制限しない
    assert(s.players.p2.trashCores === 0, `次のリフレッシュではすべて戻る（実際 ${s.players.p2.trashCores}）`)
}

console.log("=== 期間 nextRefresh は「回復できない」「トラッシュのコアの戻し上限」にしか書けない ===")
{
    const s = game("p427-guard")
    const before = s.timedEffects.length
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "bp", amount: 3000 }], duration: "nextRefresh" })
    assert(s.timedEffects.length === before, "BP は nextRefresh では置かない")
}

console.log("すべてのチェックに合格しました 🎉（part427）")
