// smoke パート927（CPU のトグル選択：選択済みを選び直して解除し続けず、確定する。#496）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import { decideAiAction } from "../../server/src/ai"
import type { GameState, PlayerId } from "./helpers"

const EX = "BS07-009" // 剣龍皇エクス・キャリバス（召喚時：BP合計6000まで好きなだけ破壊）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(EX).name === "剣龍皇エクス・キャリバス", "EXはエクス・キャリバス")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
}

function game(): GameState {
    const s = createGame("ai-toggle", { p1: "CPU", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, 1)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. 予算つきの好きなだけ破壊：CPU が選んで確定する ===")
{
    const s = game()
    const ex = put(s, "p1", EX)
    put(s, "p2", VANILLA)
    put(s, "p2", VANILLA)
    const e2 = getCard(EX).effects.find((e) => e.id === "BS07-009-e2")
    if (e2?.kind === "triggered") resolveAction(s, "p1", ex, e2.action)
    assert(s.pendingChoice?.selectedIds !== undefined, "トグル選択が出る")
    let moves = 0
    while (s.pendingChoice && moves < 20) {
        const move = decideAiAction(s, "p1")
        if (!move) break
        handleAction(s, "p1", move.action)
        moves++
    }
    assert(s.pendingChoice === null, `20手以内に選択が確定する（${moves}手）`)
    assert(s.players.p2.field.spirits.length < 2, "相手のスピリットが破壊される")
}

console.log("すべてのチェックに合格しました 🎉（part927）")
