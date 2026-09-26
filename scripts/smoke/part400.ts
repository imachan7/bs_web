// smoke パート400（M2 if の器 PR 2：destroy の記録・カウンタ lastCost・絞り込み sameCostAsLast・cond.event。IF_UNIFY.md §5）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const X28 = "BS07-X28" // 巨人大帝アレクサンダー（Lv2 アタック時：コスト4以下1体破壊→そのコストと同じ枚数破棄）
const GINGER = "BS11-045" // MCギンガー（アタック時：相手のデッキ1枚破棄→同じコストの相手1体を破壊）
const VOLGAMES = "BS11-001" // ボルガメス（コスト1。破壊時：BP4000以下の相手1体を破壊）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const COST3 = "BS09-049" // コスト3のスピリット

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(X28).name === "巨人大帝アレクサンダー", "X28は巨人大帝アレクサンダー")
    assert(getCard(GINGER).name === "MCギンガー", "GINGERはMCギンガー")
    assert(getCard(VOLGAMES).name === "ボルガメス" && getCard(VOLGAMES).cost === 1, "VOLGAMESはコスト1のボルガメス")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1")
    assert(getCard(COST3).type === "spirit" && getCard(COST3).cost === 3, "COST3はコスト3のスピリット")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function actionOf(cardId: string, effectId: string) {
    const e = getCard(cardId).effects.find((x) => x.id === effectId)
    if (!e || !("action" in e) || e.action === undefined) throw new Error(`${effectId} に action が無い`)
    return e.action
}

console.log("=== 1. BS07-X28：破壊したスピリットのコストと同じ枚数を破棄（destroy の記録＋lastCost） ===")
{
    const s = game("x28")
    const me = put(s, "p1", X28, 5)
    put(s, "p2", COST3, 1)
    const deck = s.players.p2.deck.length
    resolveAction(s, "p1", me, actionOf(X28, "BS07-X28-e3"))
    assert(s.players.p2.deck.length === deck - 3, "コスト3なので相手のデッキを3枚破棄する")
}
{
    const s = game("x28-none")
    const me = put(s, "p1", X28, 5)
    const deck = s.players.p2.deck.length
    resolveAction(s, "p1", me, actionOf(X28, "BS07-X28-e3"))
    assert(s.players.p2.deck.length === deck, "破壊できなければ破棄しない")
}

console.log("=== 2. 破壊時の誘発が別に破壊したカードは記録に混ざらない ===")
{
    const s = game("nested")
    const me = put(s, "p1", VANILLA, 1) // ボルガメスの破壊時効果で破壊される側
    put(s, "p2", VOLGAMES, 1)
    resolveAction(s, "p1", null, { type: "destroy", count: 1 })
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === me.instanceId), "前提：ボルガメスの破壊時効果で自分のスピリットも破壊された")
    assert(s.lastMoved?.length === 1 && s.lastMoved[0] === VOLGAMES, "記録はこの destroy が破壊したボルガメスだけ")
}

console.log("=== 3. BS11-045：破棄したカードと同じコストの相手1体を破壊（sameCostAsLast） ===")
{
    const s = game("ginger")
    const me = put(s, "p1", GINGER, 1)
    s.players.p2.deck[0] = COST3
    const same = put(s, "p2", COST3, 1)
    const cheap = put(s, "p2", VANILLA, 1)
    resolveAction(s, "p1", me, actionOf(GINGER, "BS11-045-e2"))
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === same.instanceId), "コスト3を破棄したのでコスト3の相手を破壊する")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === cheap.instanceId), "コストが違う相手は残る")
}
{
    const s = game("ginger-empty")
    const me = put(s, "p1", GINGER, 1)
    s.players.p2.deck = []
    const foe = put(s, "p2", VANILLA, 1)
    resolveAction(s, "p1", me, actionOf(GINGER, "BS11-045-e2"))
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === foe.instanceId), "破棄できなければ誰も破壊しない")
}

console.log("=== 4. cond.event：このバースト発動時に破壊されたスピリットの色 ===")
{
    const s = game("event")
    const hand = s.players.p1.hand.length
    const act = { type: "if", cond: { event: { destroyedColor: "purple" } }, then: { type: "draw", count: 1 } } as const
    s.burstEventColors = ["red"]
    resolveAction(s, "p1", null, act)
    assert(s.players.p1.hand.length === hand, "紫が破壊されていなければ起きない")
    s.burstEventColors = ["red", "purple"]
    resolveAction(s, "p1", null, act)
    assert(s.players.p1.hand.length === hand + 1, "紫が破壊されていれば起きる")
}

console.log("すべてのチェックに合格しました 🎉（part400）")
