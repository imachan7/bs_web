// smoke パート370（色を与える：timedEffect の内容 color。使う人が色を選ぶ2段階。BS15-038 の2つの形）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const JACK = "BS15-038" // アルカナビースト・ジャック

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(JACK).name === "アルカナビースト・ジャック", "JACK")

const colorActions = getCard(JACK)
    .effects.flatMap((e) => {
        const a = (e as { action?: EffectAction }).action
        return a?.type === "sequence" ? a.actions : a ? [a] : []
    })
    .filter((a): a is Extract<EffectAction, { type: "timedEffect" }> => a?.type === "timedEffect" && a.content.some((c) => c.type === "color"))
const toSelf = colorActions.find((a) => a.target === "self")!
const toOpp = colorActions.find((a) => a.target === undefined)!
assert(toSelf !== undefined && toOpp !== undefined, "自分自身に与える形と、相手に与える形の2つがある")

function game() {
    const s = createGame("p370", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    const jack = createInstance(JACK, 1, 1)
    const mine = createInstance("BS01-001", 1, 1)
    const theirs = createInstance("BS01-002", 1, 1)
    const theirs2 = createInstance("BS01-002", 1, 1)
    s.players.p1.field.spirits = [jack, mine]
    s.players.p2.field.spirits = [theirs, theirs2]
    refreshLevelAsOverrides(s)
    return { s, jack, mine, theirs, theirs2 }
}

console.log("=== 1. 自分自身に与える：対象を選ばず、色だけを選ぶ ===")
{
    const { s, jack } = game()
    resolveAction(s, "p1", jack, toSelf)
    assert(s.pendingChoice?.kind === "option", "色の選択から始まる")
    assert(act(s, "p1", { type: "resolveChoice", option: "青" }) === null, "青を選ぶ")
    assert(jack.timedColors.includes("blue"), "自分自身が青としても扱われる")
}

console.log("=== 2. 相手のスピリットに与える：候補は相手のスピリットだけ ===")
{
    const { s, jack, theirs, theirs2 } = game()
    resolveAction(s, "p1", jack, toOpp)
    const c = s.pendingChoice?.candidates ?? []
    assert(s.pendingChoice?.kind === "target" && c.length === 2 && c.includes(theirs.instanceId) && c.includes(theirs2.instanceId), "候補は相手のスピリット2体だけ")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: theirs.instanceId }) === null, "相手のスピリットを選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", option: "紫" }) === null, "紫を選ぶ")
    assert(theirs.timedColors.includes("purple"), "相手のスピリットが紫としても扱われる")
}

console.log("すべてのチェックに合格しました 🎉（part370）")
