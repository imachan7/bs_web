// smoke パート496（旧カードの対戦には第2メインステップが無い。2026-10-15 ユーザー決定）
//
// standard 版（26系ルール）は main → attack → 第2main → end だが、旧版は main → attack → end のまま。
// 先攻1ターン目はアタックステップも無い（メイン→エンド直行）。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { assert, createGame, createInstance, engineRunTurnStart, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s) // turn 3 相当（先攻1ターン目のルールを外す）
    s.players.p1.hand[0] = "BS01-001" // ゴラドン: コスト0・維持1
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS01-001").name === "ゴラドン" && getCard("BS01-001").type === "spirit", "BS01-001 はスピリット（ゴラドン）")
    const x04 = getCard("BS15-X04")
    assert(x04.effects.some((e) => e.kind === "extraStepAfterAttackStep"), "BS15-X04 はアタックステップ終了後にステップを行う効果を持つ")
}

console.log("=== §A 先攻1ターン目: アタックステップも第2メインステップも存在しない ===")
{
    const s = createGame("p496-a", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    engineRunTurnStart(s) // ラッパーを使わず、実際のターン1のまま検証する
    assert(s.turn === 1 && s.phase === "main", "ターン1のメインステップから開始")
    assert(handleAction(s, "p1", { type: "nextPhase" }) !== null, "先攻1ターン目はアタックステップへは移行できない")
    assert(handleAction(s, "p1", { type: "endTurn" }) === null, "ターン終了はできる")
    assert(s.turnPlayer === "p2" && s.turn === 2 && s.phase === "main", "アタック・第2メインを経ずに相手のターンへ")
    assert(!s.log.some((l) => l.includes("アタックステップに移行")), "アタックステップのログが出ない")
    assert(!s.log.some((l) => l.includes("第2メインステップに移行")), "第2メインステップのログが出ない")
}

console.log("=== §B アタックステップ終了後は第2メインを経ずに相手のターンへ ===")
{
    const s = game("p496-b")
    assert(handleAction(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(handleAction(s, "p1", { type: "endTurn" }) === null, "アタックステップを終了する")
    assert(s.turnPlayer === "p2" && s.phase === "main" && s.secondMainStep === undefined, "第2メインに入らず相手のターンへ")
    assert(!s.log.some((l) => l.includes("第2メインステップに移行")), "第2メインステップのログが出ない")
}

console.log("=== §C BS15-X04 の追加ステップの後も第2メインは来ない ===")
{
    const s = createGame("p496-d", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.players.p1.field.spirits = [createInstance("BS15-X04", s.turn, 4)] // Lv2
    const hand = s.players.p1.hand.length
    assert(handleAction(s, "p1", { type: "endTurn" }) === null, "ターンを終了する")
    assert(!!s.pendingChoice?.extraStepChoice, "追加ステップの選択が出る")
    assert(handleAction(s, "p1", { type: "resolveChoice", option: "ドローステップ" }) === null, "ドローステップを選ぶ")
    assert(s.players.p1.hand.length === hand + 1, `1枚ドローした（${s.players.p1.hand.length - hand}枚）`)
    assert(s.turnPlayer === "p2" && s.secondMainStep === undefined, "追加ステップの後は相手のターンへ")
}

console.log("すべてのチェックに合格しました 🎉（part496）")
