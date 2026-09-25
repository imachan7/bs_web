// smoke パート387（アタック時⇔ブロック時の付け替えを一覧へ移した後：「すべて」は後から出たスピリットにも効き、陣営を守る）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart, timedHas } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"
import { endTurn } from "../../server/src/logic/PhaseManager"

function swapAction(cardId: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => JSON.stringify(x).includes('"triggerSwap"')) as { action: EffectAction } | undefined
    assert(e !== undefined, `${cardId}：triggerSwap の効果がある`)
    return e!.action
}
function game(): GameState {
    const s = createGame("p387", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}
function put(s: GameState, pid: "p1" | "p2") {
    const inst = createInstance("BS01-001", s.turn, 1)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS01-149").name === "アタックシフト", "BS01-149 はアタックシフト")
    assert(getCard("BS10-072").name === "セイバーシャーク", "BS10-072 はセイバーシャーク")
}

console.log("=== 1. アタックシフト：お互いのスピリットすべて。効果の後に出たスピリットにも効き、ターン終了で消える ===")
{
    const s = game()
    resolveAction(s, "p1", null, swapAction("BS01-149"), undefined, undefined, "magic")
    const mine = put(s, "p1")
    const theirs = put(s, "p2")
    assert(timedHas(s, mine, "triggerSwap") && timedHas(s, theirs, "triggerSwap"), "後から出た自分と相手のスピリットに効く")
    endTurn(s)
    assert(!timedHas(s, mine, "triggerSwap"), "ターン終了で消える")
}

console.log("=== 2. セイバーシャーク：自分のスピリットすべてだけ ===")
{
    const s = game()
    resolveAction(s, "p1", null, swapAction("BS10-072"))
    const mine = put(s, "p1")
    const theirs = put(s, "p2")
    assert(timedHas(s, mine, "triggerSwap"), "自分のスピリットに効く")
    assert(!timedHas(s, theirs, "triggerSwap"), "相手のスピリットには効かない")
}

console.log("すべてのチェックに合格しました 🎉（part387）")
