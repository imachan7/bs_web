// smoke パート404（M2 if の器 PR 5：destroy count:"any"（自分のスピリットを好きなだけ）・suppressOnDestroy。IF_UNIFY.md §5）
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const DEATH_HAZE = "BS12-052" // デス・ヘイズ（召喚時：自分のスピリットを好きなだけ破壊し、1体につき1枚ドロー。『破壊時』は発揮されない）
const VOLGAMES = "BS11-001" // ボルガメス（破壊時：BP4000以下の相手1体を破壊）
const VANILLA = "BS01-002" // ロクケラトプス（スピリット）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(DEATH_HAZE).name === "デス・ヘイズ", "DEATH_HAZEはデス・ヘイズ")
    assert(getCard(VOLGAMES).name === "ボルガメス" && getCard(VOLGAMES).effects.some((e) => e.kind === "triggered" && e.trigger === "onDestroy"), "VOLGAMESは『破壊時』を持つ")
    assert(getCard(VANILLA).type === "spirit", "VANILLAはスピリット")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}
function actionOf(cardId: string, effectId: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => x.id === effectId)
    if (!e || !("action" in e) || e.action === undefined) throw new Error(`${effectId} に action が無い`)
    return e.action
}

console.log("=== 1. 対話：2体を選んで確定 → 2体破壊・2枚ドロー、『破壊時』は発揮しない ===")
{
    const s = game("interactive", true)
    const volga = createInstance(VOLGAMES, s.turn, 1)
    const a = createInstance(VANILLA, s.turn, 1)
    const keep = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(volga, a, keep)
    const foe = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.spirits.push(foe)
    refreshLevelAsOverrides(s)
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, actionOf(DEATH_HAZE, "BS12-052-e1"))
    assert(s.pendingChoice?.pid === "p1" && s.pendingChoice.optional === true, "破壊する自分のスピリットを選ぶ（0体でもよい）")
    act(s, "p1", { type: "resolveChoice", instanceId: volga.instanceId })
    act(s, "p1", { type: "resolveChoice", instanceId: a.instanceId })
    act(s, "p1", { type: "resolveChoice", instanceId: a.instanceId }) // もう一度押すと外れる
    act(s, "p1", { type: "resolveChoice", instanceId: a.instanceId })
    act(s, "p1", { type: "resolveChoice" })
    const ids = s.players.p1.field.spirits.map((x) => x.instanceId)
    assert(!ids.includes(volga.instanceId) && !ids.includes(a.instanceId) && ids.includes(keep.instanceId), "選んだ2体だけ破壊される")
    assert(s.players.p1.hand.length === hand + 2, "破壊した2体ぶんドロー")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === foe.instanceId), "ボルガメスの『破壊時』は発揮されない")
}

console.log("=== 2. 対話：選ばずに終えれば何も起きない ===")
{
    const s = game("none", true)
    s.players.p1.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    refreshLevelAsOverrides(s)
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, actionOf(DEATH_HAZE, "BS12-052-e1"))
    act(s, "p1", { type: "resolveChoice" })
    assert(s.players.p1.field.spirits.length === 1 && s.players.p1.hand.length === hand, "破壊もドローもしない")
}

console.log("=== 3. 非対話：自分のスピリットすべてを破壊（旧実装と同じ） ===")
{
    const s = game("auto", false)
    for (let i = 0; i < 3; i++) s.players.p1.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    refreshLevelAsOverrides(s)
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, actionOf(DEATH_HAZE, "BS12-052-e1"))
    assert(s.players.p1.field.spirits.length === 0 && s.players.p1.hand.length === hand + 3, "3体破壊して3枚ドロー")
}

console.log("すべてのチェックに合格しました 🎉（part404）")
