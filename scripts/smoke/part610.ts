// smoke パート610（declare what:"name"／fromSide／minSameName、nameIs。BS17-074 殲剣火炎陣の部品）
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const A = "BS01-002" // ロクケラトプス
const B = "BS01-003" // テラノセイバー
const NX = "BS01-098" // 燃えさかる戦場
const NY = "BS01-099" // 百識の谷

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(A).name === "ロクケラトプス" && getCard(B).name === "テラノセイバー", "スピリット名")
    assert(getCard(NX).type === "nexus" && getCard(NY).type === "nexus", "ネクサス")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    return s
}
const put = (s: GameState, pid: PlayerId, id: string): ReturnType<typeof createInstance> => {
    const i = createInstance(id, s.turn, 1)
    s.players[pid].field.spirits.push(i)
    return i
}
const putNx = (s: GameState, pid: PlayerId, id: string): void => {
    s.players[pid].field.nexuses.push(createInstance(id, s.turn, 0))
}
const nexusNames = (s: GameState, pid: PlayerId): string[] => s.players[pid].field.nexuses.map((n) => getCard(n.cardId).name)
const spiritNames = (s: GameState, pid: PlayerId): string[] => s.players[pid].field.spirits.map((n) => getCard(n.cardId).name)

const burst: EffectAction = {
    type: "declare", what: "name", from: "nexuses", fromSide: "opponent",
    then: { type: "destroy", nexus: "only", count: 1, all: true, filter: { declared: "match" } },
}
const flash: EffectAction = {
    type: "declare", what: "name", from: "spirits", fromSide: "opponent", minSameName: 2,
    then: { type: "destroy", count: 1, all: true, filter: { declared: "match" } },
}

console.log("=== 1. ネクサス：指定した名前の2つだけ破壊 ===")
{
    const s = game("n1")
    putNx(s, "p2", NX)
    putNx(s, "p2", NX)
    putNx(s, "p2", NY)
    putNx(s, "p1", NX)
    resolveAction(s, "p1", null, burst)
    assert(nexusNames(s, "p2").join() === "百識の谷", `同名2つだけ破壊（実際 ${nexusNames(s, "p2").join()}）`)
    assert(nexusNames(s, "p1").length === 1, "自分のネクサスは対象外")
}

console.log("=== 2. スピリット：A×2・B×1 → A だけが候補、A 2体だけ破壊 ===")
{
    const s = game("s1", true)
    put(s, "p2", A)
    put(s, "p2", A)
    put(s, "p2", B)
    put(s, "p2", B)
    put(s, "p2", "BS01-004") // 1体だけ：候補に出ない
    put(s, "p1", A)
    resolveAction(s, "p1", null, flash)
    const pc = s.pendingChoice
    assert(pc !== null && pc.kind === "option", "対話では選択待ち")
    assert(pc?.pid === "p1", "選ぶのは使用者")
    assert(pc?.options?.join() === "ロクケラトプス,テラノセイバー", `候補は同名2体以上のみ（実際 ${pc?.options?.join()}）`)
    assert(act(s, "p1", { type: "resolveChoice", option: "ロクケラトプス" }) === null, "指定できる")
    assert(spiritNames(s, "p2").join() === "テラノセイバー,テラノセイバー,ドラグノ偵察兵", `A 2体だけ破壊（実際 ${spiritNames(s, "p2").join()}）`)
    assert(spiritNames(s, "p1").length === 1, "自分のスピリットは残る")
}

console.log("=== 3. 全部1体ずつなら何も起きない ===")
{
    const s = game("s2", true)
    put(s, "p2", A)
    put(s, "p2", B)
    resolveAction(s, "p1", null, flash)
    assert(s.pendingChoice === null, "候補なしなら選択待ちも立たない")
    assert(spiritNames(s, "p2").length === 2, "何も破壊されない")
}

console.log("=== 4. 対話：候補が相手の場の個体名で、複数あれば選べる ===")
{
    const s = game("n2", true)
    putNx(s, "p2", NX)
    putNx(s, "p2", NY)
    putNx(s, "p1", getCard("BS01-100").cardId)
    resolveAction(s, "p1", null, burst)
    const pc = s.pendingChoice
    assert(pc !== null && pc.pid === "p1", "使用者が選ぶ")
    assert(pc?.options?.length === 2 && pc.options.includes("燃えさかる戦場") && pc.options.includes("百識の谷"), "候補は相手のネクサス名のみ")
    act(s, "p1", { type: "resolveChoice", option: "百識の谷" })
    assert(nexusNames(s, "p2").join() === "燃えさかる戦場", "選んだ名前だけ破壊")
}

console.log("=== 5. nameIs は完全一致。「〜として扱う」名は一致 ===")
{
    const s = game("m1")
    put(s, "p2", A)
    resolveAction(s, "p1", null, { type: "destroy", count: 1, all: true, filter: { nameIs: "ロクケラ" } })
    assert(spiritNames(s, "p2").length === 1, "部分一致では破壊されない")
    s.players.p2.field.spirits[0]!.namesAsContinuous = ["テラノセイバー"]
    resolveAction(s, "p1", null, { type: "destroy", count: 1, all: true, filter: { nameIs: "テラノセイバー" } })
    assert(spiritNames(s, "p2").length === 0, "扱う名でも一致")
}

console.log("すべてのチェックに合格しました 🎉（part610）")
