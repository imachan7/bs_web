// smoke パート919（#479 ミストカーテンの対話の候補と再入、#480 ラグナ・フェンリルのスピリット/ネクサス手札戻しが【装甲】を見る。#481 期間の無いアタック時・バトル時の3枚は battle）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { loadAllCards } from "../../data/loadCards"

const MIST = "BS04-101" // ミストカーテン（白マジック）
const FENRIR = "BS17-X04" // 神狼機獣ラグナ・フェンリル（白）
const ARMORED = "BS11-028" // 鳥人機フレスヴェルガー（【装甲：白】Lv1〜3）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(MIST).name === "ミストカーテン" && getCard(MIST).colors.includes("white"), "MISTは白のミストカーテン")
    assert(getCard(FENRIR).name === "神狼機獣ラグナ・フェンリル" && getCard(FENRIR).colors.includes("white"), "FENRIRは白のラグナ・フェンリル")
    assert(getCard(ARMORED).name === "鳥人機フレスヴェルガー", "ARMOREDはフレスヴェルガー")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const actionOf = (cardId: string, id: string) => (getCard(cardId).effects!.find((e) => e.id === id) as unknown as { action: EffectAction }).action
const mist = actionOf(MIST, "BS04-101-e1")
// countCounter（合体ブレイヴ数）は外して1体ずつ確かめる
const { countCounter: _cc, ...fenrir } = actionOf(FENRIR, "BS17-X04-e3") as Extract<EffectAction, { type: "return"; to: "hand"; count: number }>
const pending = (g: GameState) => g.pendingChoice
const hasNoLifeDamage = (s: GameState, id: string) =>
    JSON.stringify(s.timedEffects ?? []).includes(id)

console.log("=== 1. ミストカーテン：対話の候補に【装甲：白】が出ない（#479） ===")
{
    const s = game("mist1", true)
    const armored = put(s, "p2", ARMORED)
    const plain = put(s, "p2", VANILLA)
    resolveAction(s, "p1", null, mist, undefined, ["white"], "magic")
    const c = s.pendingChoice
    // 候補が1体なら選択を出さず自動で決まる。どちらでも装甲持ちが対象にならないことを見る
    if (c) assert(!c.candidates.includes(armored.instanceId), "候補に装甲持ちが含まれない")
    else assert(hasNoLifeDamage(s, plain.instanceId), "装甲の無い方へ印が付く")
    assert(!hasNoLifeDamage(s, armored.instanceId), "装甲持ちには印が付かない")
}

console.log("=== 2. ミストカーテン：再入で装甲持ちを直接指定しても印は付かない（#479） ===")
{
    const s = game("mist2", true)
    const armored = put(s, "p2", ARMORED)
    resolveAction(s, "p1", null, mist, armored.instanceId, ["white"], "magic")
    assert(!hasNoLifeDamage(s, armored.instanceId), "直接指定でも装甲持ちには印が付かない")
}

console.log("=== 3. ミストカーテン：装甲の色と違う発生源なら付く（対照） ===")
{
    const s = game("mist3", true)
    const armored = put(s, "p2", ARMORED)
    resolveAction(s, "p1", null, mist, armored.instanceId, ["red"], "magic")
    assert(hasNoLifeDamage(s, armored.instanceId), "赤の発生源なら装甲：白は効かない")
}

console.log("=== 4. ラグナ・フェンリル：候補にも直接指定にも装甲持ちが入らない（#480） ===")
{
    const s = game("fen1", true)
    const self = put(s, "p1", FENRIR, 3)
    const armored = put(s, "p2", ARMORED)
    const plain = put(s, "p2", VANILLA)
    resolveAction(s, "p1", self, fenrir, undefined, ["white"], "spirit")
    // 装甲持ちが候補から外れると候補1つ＝数ちょうどなので、聞かずに戻る
    assert(s.pendingChoice === null && s.players.p2.field.spirits.includes(armored) && !s.players.p2.field.spirits.includes(plain), "装甲持ちは候補にならず、装甲の無い方が戻る")

    const s2 = game("fen2", true)
    const self2 = put(s2, "p1", FENRIR, 3)
    const armored2 = put(s2, "p2", ARMORED)
    resolveAction(s2, "p1", self2, fenrir, armored2.instanceId, ["white"], "spirit")
    assert(s2.players.p2.field.spirits.includes(armored2), "直接指定しても装甲持ちは場に残る")
}

console.log("=== 5. ラグナ・フェンリル：非対話でも装甲持ちを飛ばす（#480） ===")
{
    const s = game("fen3", false)
    const self = put(s, "p1", FENRIR, 3)
    const armored = put(s, "p2", ARMORED, 3)
    const plain = put(s, "p2", VANILLA)
    resolveAction(s, "p1", self, fenrir, undefined, ["white"], "spirit")
    assert(s.players.p2.field.spirits.includes(armored), "装甲持ちは場に残る")
    assert(!s.players.p2.field.spirits.includes(plain), "装甲の無い方が戻る")
}

const NEXUS = "BS01-099" // 百識の谷
console.log("=== 7. ラグナ・フェンリル：2つは全部選んでから一度に戻す（2026-11-13 ユーザー決定）・「まで」ではない ===")
{
    assert(getCard(NEXUS).name === "百識の谷" && getCard(NEXUS).type === "nexus", "NEXUSは百識の谷")
    const s = game("fen4", true)
    const self = put(s, "p1", FENRIR, 3)
    const a = put(s, "p2", VANILLA)
    put(s, "p2", VANILLA)
    const nx = createInstance(NEXUS, s.turn, 0)
    s.players.p2.field.nexuses.push(nx)
    const two = { ...fenrir, count: 2 }
    resolveAction(s, "p1", self, two, undefined, ["white"], "spirit")
    const c1 = pending(s)
    assert(c1 !== null && c1.optional !== true, "ちょうど2つ（0〜1つで確定できない）")
    s.pendingChoice = null
    resolveAction(s, "p1", self, c1!.action as EffectAction, a.instanceId, ["white"], "spirit")
    assert(s.players.p2.field.spirits.includes(a), "1つ目を選んだ時点ではまだ戻らない")
    const c2 = pending(s)
    assert(c2 !== null && !c2.candidates.includes(a.instanceId) && c2.candidates.includes(nx.instanceId), "2つ目の候補にネクサスが出て、選んだ体は外れる")
    s.pendingChoice = null
    resolveAction(s, "p1", self, c2!.action as EffectAction, nx.instanceId, ["white"], "spirit")
    assert(!s.players.p2.field.spirits.includes(a) && !s.players.p2.field.nexuses.includes(nx), "2つ選び終えたら両方戻る")
    assert(s.players.p2.hand.includes(VANILLA) && s.players.p2.hand.includes(NEXUS), "両方とも手札にある")

    const t = game("fen5", true)
    const selfT = put(t, "p1", FENRIR, 3)
    const only = put(t, "p2", VANILLA)
    resolveAction(t, "p1", selfT, two, undefined, ["white"], "spirit")
    assert(t.pendingChoice === null && !t.players.p2.field.spirits.includes(only), "候補が数以下なら聞かずに全部戻す")
}

console.log("=== 6. 期間の無いアタック時・バトル時は battle（#481） ===")
{
    const all = loadAllCards()
    for (const id of ["BS07-041-e2", "BS07-041-e3", "SD13-006-e1", "BS22-042-e3"]) {
        const card = all.find((c) => c.effects?.some((e) => e.id === id))!
        const json = JSON.stringify(card.effects!.find((e) => e.id === id))
        assert(json.includes('"duration":"battle"') && !json.includes('"duration":"turn"'), `${id} の期間が battle`)
    }
}

console.log("すべてのチェックに合格しました 🎉（part919）")
