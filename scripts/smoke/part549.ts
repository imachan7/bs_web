// smoke パート549
//   - timedEffect canBlockWhileRested の相手側・このバトル中（26RBS01-109/X01「相手のスピリット1体を指定する。このバトル中、それは疲労状態でもブロックできる」）
//   - placeCores to:"nexus" の targets（自分の青のネクサス2つまでに1個ずつ。26RBS01-X17）
import { assert, createGame, createInstance, resolveAction } from "./helpers"
import { canBlock } from "../../shared/block"
import type { GameState, PlayerId } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        s.players[pid].field.spirits = []
        s.players[pid].field.nexuses = []
    }
    return s
}

console.log("=== 1. 相手のスピリットをこのバトル中、疲労状態でもブロックできるようにする ===")
{
    const s = game("549a")
    const attacker = createInstance("BS01-006", 1, 1)
    const enemy = createInstance("BS01-006", 1, 1)
    enemy.isRested = true
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(enemy)
    assert(canBlock(s, "p2", enemy, "p1", attacker) !== null, "前は疲労でブロックできない")
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "canBlockWhileRested" }], duration: "battle" })
    assert(canBlock(s, "p2", enemy, "p1", attacker) === null, "後は疲労でもブロックできる")
    assert(s.timedEffects.some((r) => r.until === "battle" && r.target.kind === "instance" && r.target.instanceId === enemy.instanceId), "バトル終了までの記録")
}

console.log("=== 2. 自分の青のネクサス2つに1個ずつ ===")
{
    const s = game("549b")
    const [a, b, c] = [createInstance("BS03-113", 1, 0), createInstance("BS03-114", 1, 0), createInstance("BS03-115", 1, 0)]
    s.players.p1.field.nexuses.push(a, b, c)
    resolveAction(s, "p1", null, { type: "placeCores", from: "void", to: "nexus", target: "one", targets: 2, count: 1, filter: { color: "blue" } })
    assert([a, b, c].filter((x) => x.cores === 1).length === 2 && [a, b, c].every((x) => x.cores <= 1), "2つに1個ずつ")
}
