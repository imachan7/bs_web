// smoke パート381（期間つき効果の記録 state.timedEffects：寿命・「すべて」の照合・配信。docs/design/TIMED_EFFECTS.md）
import { assert, createGame, createInstance, endTurn, getCard, refreshLevelAsOverrides, resolveAction, viewFor } from "./helpers"
import type { GameState } from "./helpers"
import { clearBattle } from "../../server/src/logic/GameState"
import { canBlock } from "../../shared/block"
import { cantActByTimed } from "../../shared/rules"

const VANILLA = "BS01-002" // ロクケラトプス（コスト1）

function game(): GameState {
    const s = createGame("p381", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}

console.log("=== 前提 ===")
assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1")

console.log("=== 1. 1体・このバトルの間：バトル終了で消える ===")
{
    const s = game()
    const a = createInstance(VANILLA, 1, 1)
    const b = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits = [a]
    s.players.p2.field.spirits = [b]
    refreshLevelAsOverrides(s)
    s.battle = { attackerInstanceId: a.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "cantBlock" }], duration: "battle" }, b.instanceId)
    assert(cantActByTimed(s, b, "block"), "このバトルの間ブロックできない")
    assert(canBlock(s, "p2", b, "p1", a) !== null, "共有のブロック判定も拒否する")
    clearBattle(s)
    assert(!cantActByTimed(s, b, "block") && s.timedEffects.length === 0, "バトル終了で記録が消える")
}

console.log("=== 2. 1体・このターンの間：ターン終了で消える ===")
{
    const s = game()
    const b = createInstance(VANILLA, 1, 1)
    s.players.p2.field.spirits = [b]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "cantAttack" }], duration: "turn" }, b.instanceId)
    assert(cantActByTimed(s, b), "このターンの間アタックできない")
    clearBattle(s)
    assert(cantActByTimed(s, b), "バトル終了では消えない")
    endTurn(s)
    assert(!cantActByTimed(s, b) && s.timedEffects.length === 0, "ターン終了で記録が消える")
}

console.log("=== 3. すべて：後から出たスピリットにも効き、配信にも入る ===")
{
    const s = game()
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "cantAttack" }], duration: "turn", all: true, filter: { cost: { max: 1 } } })
    const later = createInstance(VANILLA, 1, 1)
    s.players.p2.field.spirits.push(later)
    const mine = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits.push(mine)
    assert(cantActByTimed(s, later), "解決後に出た相手のコスト1にも効く")
    assert(!cantActByTimed(s, mine), "既定の陣営（相手）以外には効かない")
    const view = viewFor(s, "p2")
    assert(view.timedEffects.length === 1 && cantActByTimed(view, view.players.p2.field.spirits[0]!), "クライアントに送る盤面でも同じ判定になる")
}

console.log("すべてのチェックに合格しました 🎉（part381）")
