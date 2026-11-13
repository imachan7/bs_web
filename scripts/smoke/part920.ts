// smoke パート920（#485 Lv◯として扱うが円卓の支払い確認を通す、#486 色を与えるが【装甲】を見る）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const ROUND_TABLE = "BS08-055" // 竜騎集う円卓（Lv2＝コア1個）
const CLAIRE = "BS04-010" // 雷帝エール・クレル（龍帝＝円卓が守る）
const ATTACKER = "BS01-002" // ロクケラトプス（相手の効果の発生源）
const ARMORED = "BS05-028" // アーメットクラブ（【装甲：黄】Lv1・2）
const ADD_COLOR = "BS02-104" // アディショナルカラー（黄マジック。side:"both"）
const CATS_EYE = "BS08-079" // キャッツアイ（黄マジック。相手1体を Lv1 として扱う）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ROUND_TABLE).name === "竜騎集う円卓", "ROUND_TABLEは竜騎集う円卓")
    assert(getCard(CLAIRE).name === "雷帝エール・クレル", "CLAIREは雷帝エール・クレル")
    assert(getCard(ARMORED).name === "アーメットクラブ", "ARMOREDはアーメットクラブ")
    assert(getCard(ADD_COLOR).name === "アディショナルカラー" && getCard(ADD_COLOR).colors.includes("yellow"), "ADD_COLORは黄のアディショナルカラー")
    assert(getCard(CATS_EYE).name === "キャッツアイ" && getCard(CATS_EYE).colors.includes("yellow"), "CATS_EYEは黄のキャッツアイ")
}

const actionOf = (cardId: string, id: string) => (getCard(cardId).effects!.find((e) => e.id === id) as unknown as { action: EffectAction }).action
const recorded = (s: GameState, id: string, type: string) =>
    (s.timedEffects ?? []).some((r) => JSON.stringify(r.target).includes(id) && r.content.some((c) => c.type === type))

// p1 のアタックステップに、p2 の効果が p1 の龍帝を Lv1 として扱おうとする（part213 と同じ場面）
function roundTable() {
    const s = createGame("rt-level", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.nexuses.push(createInstance(ROUND_TABLE, s.turn, 1))
    const target = createInstance(CLAIRE, s.turn, 3)
    s.players.p1.field.spirits.push(target)
    const src = createInstance(ATTACKER, s.turn, 1)
    s.players.p2.field.spirits.push(src)
    s.players.p1.hand = ["BS01-001", "BS01-003", "BS01-004"]
    refreshLevelAsOverrides(s)
    return { s, target, src }
}
const level1: EffectAction = { type: "timedEffect", content: [{ type: "level", set: 1 }], duration: "turn" }

console.log("=== 1. Lv1として扱う：円卓の支払い確認が出て、払えば受けない（#485） ===")
{
    const { s, target, src } = roundTable()
    resolveAction(s, "p2", src, level1, target.instanceId)
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice?.pid === "p1", "守る側に破棄する手札を聞く")
    assert(!recorded(s, target.instanceId, "level"), "聞いている間はまだ Lv は変わらない")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "手札を1枚破棄する")
    assert(!recorded(s, target.instanceId, "level") && s.players.p1.hand.length === 2, "払ったので Lv1 にならず、手札が1枚減る")
}

console.log("=== 2. Lv1として扱う：断れば受ける（#485） ===")
{
    const { s, target, src } = roundTable()
    resolveAction(s, "p2", src, level1, target.instanceId)
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "払わない")
    assert(recorded(s, target.instanceId, "level") && s.players.p1.hand.length === 3, "Lv1 として扱われ、手札は減らない")
}

function colorGame(seed: string) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = true
    const armored = createInstance(ARMORED, s.turn, 1)
    const plain = createInstance(ATTACKER, s.turn, 1)
    s.players.p2.field.spirits.push(armored, plain)
    refreshLevelAsOverrides(s)
    return { s, armored, plain }
}
const addColor = actionOf(ADD_COLOR, "BS02-104-e1")

console.log("=== 3. 色を与える：候補に【装甲：黄】が出ない（#486） ===")
{
    const { s, armored, plain } = colorGame("color1")
    resolveAction(s, "p1", null, addColor, undefined, ["yellow"], "magic")
    // 装甲持ちが外れて候補1体になるので、対象は自動で決まり色の選択へ進む
    const c = s.pendingChoice
    assert(c?.kind === "option" && c.selfInstanceId === plain.instanceId && c.selfInstanceId !== armored.instanceId, "装甲持ちは候補に入らず、装甲の無い方に決まる")
}

console.log("=== 4. 色を与える：装甲持ちを直接指定しても色を聞かない（#486） ===")
{
    const { s, armored } = colorGame("color2")
    resolveAction(s, "p1", null, addColor, armored.instanceId, ["yellow"], "magic")
    assert(s.pendingChoice === null && !recorded(s, armored.instanceId, "color"), "色の選択に進まず、色も付かない")
}

console.log("=== 5. 色を与える：装甲の色と違う発生源なら進む（対照） ===")
{
    const { s, armored } = colorGame("color3")
    resolveAction(s, "p1", null, addColor, armored.instanceId, ["red"], "magic")
    assert(s.pendingChoice?.kind === "option", "赤の発生源なら色の選択に進む")
}

console.log("=== 6. キャッツアイ：装甲持ちを Lv1 にできない（#485 の盤面軸。変わらないことの確認） ===")
{
    const { s, armored, plain } = colorGame("level3")
    resolveAction(s, "p1", null, actionOf(CATS_EYE, "BS08-079-e1"), armored.instanceId, ["yellow"], "magic")
    assert(!recorded(s, armored.instanceId, "level"), "装甲持ちには付かない")
    resolveAction(s, "p1", null, actionOf(CATS_EYE, "BS08-079-e1"), plain.instanceId, ["yellow"], "magic")
    assert(recorded(s, plain.instanceId, "level"), "装甲の無い方には付く")
}

console.log("すべてのチェックに合格しました 🎉（part920）")
