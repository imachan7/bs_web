// smoke パート381（期間つき効果の記録 state.timedEffects：寿命・「すべて」の照合・配信。docs/design/TIMED_EFFECTS.md）
import { assert, createGame, createInstance, endTurn, fireTrigger, getCard, refreshLevelAsOverrides, resolveAction, viewFor } from "./helpers"
import { isTriggerSuppressed } from "../../server/src/logic/triggers"
import type { GameState } from "./helpers"
import { clearBattle } from "../../server/src/logic/GameState"
import { canBlock } from "../../shared/block"
import { cantActByTimed, instanceSymbolCount, instHasColor, spiritHasKeyword } from "../../shared/rules"

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
    s.battle = { attackerInstanceId: a.instanceId, blockerInstanceId: null, directed: false }
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

console.log("=== 4. プレイヤーに掛かる記録（誘発を止める）：陣営単位で効き、ターン終了で消える ===")
{
    const s = game()
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "suppressTrigger", trigger: "onDestroy" }], duration: "turn", all: true })
    assert(isTriggerSuppressed(s, "p2", "onDestroy") && !isTriggerSuppressed(s, "p1", "onDestroy"), "相手の破壊時だけ止まる")
    endTurn(s)
    assert(!isTriggerSuppressed(s, "p2", "onDestroy"), "ターン終了で消える")
}

console.log("=== 5. 1体に与えた誘発効果は、場を離れた後に誘発しても読める ===")
{
    const s = game()
    const a = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits = [a]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "grantTrigger", trigger: "onDestroy", action: { type: "voidCoreToReserve", count: 1 } }], duration: "turn", side: "own", count: 1 })
    s.players.p1.field.spirits = [] // 破壊されて場を離れた後
    const before = s.players.p1.reserve
    fireTrigger(s, "p1", a, "onDestroy")
    assert(s.players.p1.reserve === before + 1, "場を離れた個体でも付与した効果が発火する")
}

console.log("=== 6. すべてにキーワード：1体向けに化けず、後から出た自分のスピリットにも効く ===")
{
    const s = game()
    const first = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits = [first]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "keyword", keyword: "jugeki" }], duration: "turn", all: true, side: "own" })
    const later = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits.push(later)
    const opp = createInstance(VANILLA, 1, 1)
    s.players.p2.field.spirits.push(opp)
    assert(spiritHasKeyword(s, "p1", first, "jugeki") && spiritHasKeyword(s, "p1", later, "jugeki"), "既にいた1体も後から出た1体も【呪撃】を持つ")
    assert(!spiritHasKeyword(s, "p2", opp, "jugeki"), "相手のスピリットは持たない")
}

console.log("=== 7. 色：記録した直後から写しに反映され、ターン終了で消え、配信した盤面でも同じ ===")
{
    const s = game()
    const x = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits = [x]
    refreshLevelAsOverrides(s)
    assert(!instHasColor(x, "blue"), "前提：赤単色")
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "color", color: "blue" }], duration: "turn", side: "own", count: 1 }, x.instanceId)
    assert(instHasColor(x, "blue") && instHasColor(x, "red"), "記録した直後から青としても扱う（元の赤も残る）")
    assert(instHasColor(viewFor(s, "p2").players.p1.field.spirits[0]!, "blue"), "配信した盤面でも青としても扱う")
    endTurn(s)
    assert(!instHasColor(x, "blue"), "ターン終了で消える")
}

console.log("=== 8. シンボル上書き（このバトルの間）：記録した直後から効き、バトル終了で写しも消える ===")
{
    const s = game()
    const a = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits = [a]
    refreshLevelAsOverrides(s)
    s.battle = { attackerInstanceId: a.instanceId, blockerInstanceId: null, directed: false }
    const before = instanceSymbolCount(a)
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "symbolSet", color: "red", count: 3 }], duration: "battle", side: "own", count: 1 }, a.instanceId)
    assert(instanceSymbolCount(a) === 3, "このバトルの間シンボル3つとして扱う")
    clearBattle(s)
    assert(instanceSymbolCount(a) === before, "バトル終了で元のシンボル数に戻る")
}

console.log("すべてのチェックに合格しました 🎉（part381）")
