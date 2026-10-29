// smoke パート542
//   - placeCores が置き先を記録し、bpBuff の filter { lastTarget } が「それ」を拾う（26RCB01-002 の形）
//   - destroy.upTo（対話時は 0〜count を選べる）
import { assert, createGame, createInstance, effectiveBp, refreshLevelAsOverrides, resolveAction } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import type { GameState, PlayerId } from "./helpers"
import type { CardData, CardInstance } from "../../server/src/type"

const OTHER = "TEST-542-OTHER"
CARD_DB.set(OTHER, { ...CARD_DB.get("BS01-002")!, cardId: OTHER, name: "テスト542の相手", effects: [] } as CardData)

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        p.life = 3
        p.reserve = 20
        p.hand = []
        p.deck = Array.from({ length: 30 }, () => "BS01-002")
        p.field.spirits = []
        p.field.nexuses = []
    }
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): CardInstance {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. placeCores の置き先を bpBuff { lastTarget } が拾う ===")
{
    const run = (withBuff: boolean) => {
        const s = game("542a")
        const me = put(s, "p1", "BS01-002", 3)
        const other = put(s, "p1", OTHER, 1)
        resolveAction(s, "p1", me, {
            type: "sequence",
            actions: [
                { type: "placeCores", from: "self", to: "spirit", target: "one", count: 1, filter: { nameContains: "テスト542の相手" } },
                ...(withBuff ? [{ type: "bpBuff" as const, amount: 3000, scope: "battle" as const, filter: { lastTarget: true as const } }] : []),
            ],
        })
        refreshLevelAsOverrides(s)
        return { me: effectiveBp(s, "p1", me), other: effectiveBp(s, "p1", other), cores: [me.cores, other.cores] }
    }
    const base = run(false)
    const buffed = run(true)
    assert(buffed.cores[0] === 2 && buffed.cores[1] === 2, "自分のコアが1個ずれた")
    assert(buffed.other - base.other === 3000, "置き先だけBP+3000")
    assert(buffed.me === base.me, "発生源のBPは変わらない")
}

console.log("=== 3. destroy.upTo ===")
{
    const s = game("542d")
    const e = [put(s, "p2", "BS01-002", 1), put(s, "p2", "BS01-002", 1), put(s, "p2", "BS01-002", 1)]
    resolveAction(s, "p1", null, { type: "destroy", count: 2, upTo: true })
    assert(e.filter((x) => !s.players.p2.field.spirits.includes(x)).length === 2, "非対話は2体まで破壊")
}
{
    const s = game("542e")
    s.interactiveTargets = true
    put(s, "p2", "BS01-002", 1)
    put(s, "p2", "BS01-002", 1)
    resolveAction(s, "p1", null, { type: "destroy", count: 2, upTo: true })
    assert(s.pendingChoice?.kind === "target" && s.pendingChoice.optional === true, "対話は0体も選べる選択を出す")
    assert(s.players.p2.field.spirits.length === 2, "選ぶ前は破壊しない")
}

CARD_DB.delete(OTHER)
