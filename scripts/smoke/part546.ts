// smoke パート546
//   - bpBuff（自分のスピリット1体を指定）：対話で候補が2体以上なら選択を出し、1体なら選ばせない
import { act, assert, createGame, createInstance, effectiveBp, resolveAction } from "./helpers"
import type { GameState } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}

console.log("=== 1. 2体いれば選択、選んだ1体だけBP+ ===")
{
    const s = game("546a")
    const a = createInstance("BS01-006", 1, 1)
    const b = createInstance("BS01-006", 1, 1)
    s.players.p1.field.spirits.push(a, b)
    const base = effectiveBp(s, "p1", b)
    resolveAction(s, "p1", a, { type: "timedEffect", content: [{ type: "bp", amount: 3000 }], duration: "turn", side: "own", count: 1 })
    assert(s.pendingChoice?.kind === "target", "選択が出る")
    assert(effectiveBp(s, "p1", a) === base && effectiveBp(s, "p1", b) === base, "選ぶ前は増加しない")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: b.instanceId }) === null, "bを選ぶ")
    assert(effectiveBp(s, "p1", b) === base + 3000 && effectiveBp(s, "p1", a) === base, "bだけBP+")
}

console.log("=== 2. 1体なら選択なし ===")
{
    const s = game("546b")
    const a = createInstance("BS01-006", 1, 1)
    s.players.p1.field.spirits.push(a)
    const base = effectiveBp(s, "p1", a)
    resolveAction(s, "p1", a, { type: "timedEffect", content: [{ type: "bp", amount: 3000 }], duration: "turn", side: "own", count: 1 })
    assert(!s.pendingChoice && effectiveBp(s, "p1", a) === base + 3000, "選択なしでBP+")
}
