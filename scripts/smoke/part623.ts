// smoke パート623（「次のリフレッシュステップで回復できない」の all:true はルールとして置く。SEMANTICS_AUDIT §3.12）
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const RED1 = "BS01-002"
const FENRIR = "BS17-X04"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    for (const p of ["p1", "p2"] as const) {
        s.players[p].reserve = 14
        s.players[p].deck = Array.from({ length: 40 }, () => RED1)
        s.players[p].hand = []
    }
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, rested: boolean) {
    const inst = createInstance(cardId, s.turn - 1, 1)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== X04 の「相手のスピリットすべては回復できない」は発揮後に出たスピリットにも効く ===")
for (const me of ["p1", "p2"] as const) {
    const opp: PlayerId = me === "p1" ? "p2" : "p1"
    const s = game(`fenrir-later-${me}`)
    const mine = put(s, me, RED1, true)
    s.players[me].hand = [FENRIR]
    s.turnPlayer = me; s.priorityPlayer = me; s.phase = "main"
    assert(act(s, me, { type: "summon", handIndex: 0 }) === null, "召喚できる")
    if (s.pendingChoice !== null && s.pendingChoice.kind === "option") act(s, me, { type: "resolveChoice" })
    const later = put(s, opp, RED1, true)
    assert(act(s, me, { type: "endTurn" }) === null, "ターン終了")
    assert(later.isRested, `発揮後に相手の場に出たスピリットも回復しない（自分=${me}）`)
    assert(act(s, opp, { type: "endTurn" }) === null, "相手のターン終了")
    assert(!mine.isRested, `自分のスピリットは自分のリフレッシュで回復する（自分=${me}）`)
    assert(act(s, me, { type: "endTurn" }) === null, "自分のターン終了")
    assert(!later.isRested, `その次のリフレッシュでは回復する（自分=${me}）`)
}

console.log("すべてのチェックに合格しました 🎉（part623）")
