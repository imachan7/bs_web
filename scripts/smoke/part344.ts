// smoke パート344（BS15-079 プロボケイション：メインから直接ターン終了しても確認が出る。2026-09-18）
//
// 「相手のメインステップ終了時に使用できる」は、アタックステップへ進む（nextPhase）ときだけでなく、
// メインステップから直接ターンを終了したときにも来る（アタックステップは必ず経由する。part343）。
// 使われたらアタックステップで止め、指定されたスピリットにアタックさせる。使わなければそのままターンを終える。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.field.spirits = [createInstance("BS01-001", s.turn, 1)]
    s.players.p2.field.spirits = []
    s.players.p2.hand.push("BS15-079")
    s.players.p2.reserve = 10
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS15-079").name === "プロボケイション" && getCard("BS15-079").type === "magic", "BS15-079 はプロボケイション（マジック）")
    assert(getCard("BS01-001").type === "spirit", "BS01-001 はスピリット")
}

console.log("=== §A 対話：直接ターン終了で確認が出て、使うとアタックステップで止まる ===")
{
    const s = game("p344-a", true)
    assert(act(s, "p1", { type: "endTurn" }) === null, "メインから直接ターン終了できる")
    assert(!!s.pendingChoice?.provocationUse && s.pendingChoice.pid === "p2", "相手にプロボケイションの確認が出る")
    const option = s.pendingChoice!.options![0]!
    act(s, "p2", { type: "resolveChoice", option })
    for (let i = 0; i < 3 && s.pendingChoice?.pid === "p2"; i++) {
        act(s, "p2", { type: "resolveChoice", instanceId: s.pendingChoice.candidates[0]! })
    }
    assert(s.players.p2.trashCards.includes("BS15-079"), "プロボケイションを使用した")
    assert(s.turnPlayer === "p1" && s.phase === "attack", `ターンは終わらずアタックステップで止まる（${s.turnPlayer}/${s.phase}）`)
    assert(act(s, "p1", { type: "endTurn" }) !== null, "指定されたスピリットがアタックするまでターンを終えられない")
}

console.log("=== §B 対話：使わなければそのままターンを終える ===")
{
    const s = game("p344-b", true)
    act(s, "p1", { type: "endTurn" })
    assert(!!s.pendingChoice?.provocationUse, "確認が出る")
    act(s, "p2", { type: "resolveChoice" })
    assert(s.players.p2.hand.includes("BS15-079"), "手札に残る")
    assert(s.turnPlayer === "p2", `ターンが相手へ移る（${s.turnPlayer}）`)
}

console.log("=== §C 非対話：直接ターン終了で自動使用し、アタックステップで止まる ===")
{
    const s = game("p344-c", false)
    assert(act(s, "p1", { type: "endTurn" }) === null, "エラーにならない")
    assert(s.players.p2.trashCards.includes("BS15-079"), "自動で使用した")
    assert(s.turnPlayer === "p1" && s.phase === "attack", `アタックステップで止まる（${s.turnPlayer}/${s.phase}）`)
}

console.log("=== §D コストを払えなければ確認は出ずターンを終える ===")
{
    const s = game("p344-d", true)
    s.players.p2.reserve = 0
    act(s, "p1", { type: "endTurn" })
    assert(!s.pendingChoice, "確認は出ない")
    assert(s.turnPlayer === "p2", "ターンが相手へ移る")
}

console.log("すべてのチェックに合格しました 🎉（part344）")
