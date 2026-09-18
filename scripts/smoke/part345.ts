// smoke パート345（BS15-X04 機獣要塞ナウマンガルド Lv2：アタックステップ終了後にステップを1つ行う。2026-09-18）
//
// アタックステップ終了後・エンドステップの前に、ドロー／リフレッシュ／メインのどれか1つを通常どおり丸ごと行う（ターンに1回・断れない）。
// メインを選んだらアタックステップへは進めず、ターン終了でエンドステップへ。
// アタックステップが行われないターン（ルナティックシール）は発揮しない（Q3622〜Q3626・BS15_PLAN §7.1）。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

function game(seed: string, interactive: boolean, cores = 4): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.field.spirits = [createInstance("BS15-X04", s.turn, cores)]
    s.players.p2.field.spirits = []
    return s
}
const choose = (s: GameState, option: string) => {
    assert(!!s.pendingChoice?.extraStepChoice && s.pendingChoice.pid === "p1", "ステップの選択が出る")
    assert(s.pendingChoice?.optional === false, "断れない")
    return act(s, "p1", { type: "resolveChoice", option })
}

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard("BS15-X04")
    assert(c.name === "機獣要塞ナウマンガルド" && c.type === "spirit", "BS15-X04 は機獣要塞ナウマンガルド")
    assert(c.levels[1]?.level === 2 && c.levels[1]?.cores === 4, "Lv2 はコア4個")
}

console.log("=== §A 非対話：ドローステップを行ってからターンを終える ===")
{
    const s = game("p345-a", false)
    const hand = s.players.p1.hand.length
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターンを終了できる")
    assert(s.players.p1.hand.length === hand + 1, `1枚ドローした（${s.players.p1.hand.length - hand}枚）`)
    assert(s.turnPlayer === "p2", "ターンが相手へ移る")
}

console.log("=== §B 対話：ドローステップを選ぶ ===")
{
    const s = game("p345-b", true)
    const hand = s.players.p1.hand.length
    act(s, "p1", { type: "endTurn" })
    assert(act(s, "p1", { type: "resolveChoice" }) !== null, "選ばずには進めない")
    assert(choose(s, "ドローステップ") === null, "選べる")
    assert(s.players.p1.hand.length === hand + 1, "1枚ドローした")
    assert(s.turnPlayer === "p2", "ターンが相手へ移る")
}

console.log("=== §C 対話：リフレッシュステップを選ぶ ===")
{
    const s = game("p345-c", true)
    const x04 = s.players.p1.field.spirits[0]!
    x04.isRested = true
    s.players.p1.trashCores = 2
    const reserve = s.players.p1.reserve
    act(s, "p1", { type: "endTurn" })
    choose(s, "リフレッシュステップ")
    assert(!x04.isRested, "回復した")
    assert(s.players.p1.reserve === reserve + 2 && s.players.p1.trashCores === 0, "トラッシュのコアがリザーブへ戻った")
    assert(s.turnPlayer === "p2", "ターンが相手へ移る")
}

console.log("=== §D 対話：メインステップを選ぶと、アタックへは進めずターン終了でエンドステップへ ===")
{
    const s = game("p345-d", true)
    act(s, "p1", { type: "endTurn" })
    choose(s, "メインステップ")
    assert(s.turnPlayer === "p1" && s.phase === "main" && !!s.extraMainStep, `追加のメインステップに入る（${s.phase}）`)
    assert(act(s, "p1", { type: "nextPhase" }) !== null, "アタックステップへは進めない")
    s.players.p1.reserve = 1
    assert(act(s, "p1", { type: "moveCore", instanceId: s.players.p1.field.spirits[0]!.instanceId, direction: "add" }) === null, "コアを動かせる")
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターンを終了できる")
    assert(!s.pendingChoice?.extraStepChoice, "2回目の選択は出ない（ターンに1回）")
    assert(s.turnPlayer === "p2" && !s.extraMainStep, "ターンが相手へ移り、追加メインの状態は消える")
}

console.log("=== §E Lv1 では発揮しない ===")
{
    const s = game("p345-e", true, 1)
    act(s, "p1", { type: "endTurn" })
    assert(!s.pendingChoice?.extraStepChoice && s.turnPlayer === "p2", "選択は出ずにターンが移る")
}

console.log("=== §F アタックステップが行われないターンは発揮しない ===")
{
    const s = game("p345-f", true)
    s.endStepLocks.push({ pid: "p2", remaining: 2, cardId: "BS10-108", locks: ["attackStep"] } as never)
    act(s, "p1", { type: "endTurn" })
    assert(!s.pendingChoice?.extraStepChoice && s.turnPlayer === "p2", "選択は出ずにターンが移る")
}

console.log("=== §G アタックステップから（アタックした後で）ターンを終えても発揮する ===")
{
    const s = game("p345-g", true)
    act(s, "p1", { type: "nextPhase" })
    assert(s.phase === "attack", "アタックステップ")
    act(s, "p1", { type: "endTurn" })
    choose(s, "ドローステップ")
    assert(s.turnPlayer === "p2", "ターンが相手へ移る")
}

console.log("すべてのチェックに合格しました 🎉（part345）")
