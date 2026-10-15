// smoke パート496（第2メインステップ: アタックステップの後にもう一度メインステップを行う。2026-10-06）
//
// 公式ルール: 通常ターンは start → core → draw → refresh → main → attack → 第2main → end の順。
// 先攻1ターン目はコアステップ・アタックステップ・第2メインステップが存在しない（メイン→エンド直行）。
// BS15-X04 の追加ステップはアタックステップ終了後・第2メインステップの前に行う。
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

console.log("=== §B アタックステップ終了後、第2メインステップへ移行する ===")
{
    const s = game("p496-b")
    assert(handleAction(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(s.phase === "attack", "アタックステップ")
    assert(handleAction(s, "p1", { type: "endTurn" }) === null, "アタックステップを終了する")
    assert(s.turnPlayer === "p1" && s.phase === "main" && s.secondMainStep === true, "第2メインステップに入っている")
    assert(s.log.some((l) => l.includes("第2メインステップに移行")), "移行ログが出る")
    // 第2メインからはアタックステップへ進めない（アタックの機会はもう無い）
    assert(handleAction(s, "p1", { type: "nextPhase" }) !== null, "第2メインからアタックステップへは進めない")
    // 第2メインでも通常どおりメインステップの行動ができる
    const before = s.players.p1.field.spirits.length
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "第2メインでも召喚できる")
    assert(s.players.p1.field.spirits.length === before + 1, "フィールドにスピリットが増えている")
    assert(handleAction(s, "p1", { type: "endTurn" }) === null, "第2メインを終了する")
    assert(s.turnPlayer === "p2" && s.phase === "main", "エンドステップを経て相手のターンへ")
    assert(s.secondMainStep === undefined, "ターン終了で第2メインのフラグは消える")
}

console.log("=== §C メインステップから直接ターン終了してもアタックステップ→第2メインを経る ===")
{
    const s = game("p496-c")
    assert(handleAction(s, "p1", { type: "endTurn" }) === null, "メインステップから直接ターンを終了する")
    assert(s.secondMainStep === true && s.phase === "main", "アタックステップを経由して第2メインに入っている")
    assert(s.log.some((l) => l.includes("アタックステップに移行")), "アタックステップを経由した")
    assert(handleAction(s, "p1", { type: "endTurn" }) === null, "第2メインを終了する")
    assert(s.turnPlayer === "p2", "相手のターンへ")
}

console.log("=== §D BS15-X04 の追加ステップの後にも第2メインステップが来る ===")
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
    assert(s.secondMainStep === true && s.phase === "main", "追加ステップの後に第2メインステップへ入る")
    assert(handleAction(s, "p1", { type: "endTurn" }) === null, "第2メインを終了する")
    assert(s.turnPlayer === "p2", "相手のターンへ")
}

console.log("すべてのチェックに合格しました 🎉（part496）")
