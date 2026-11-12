// smoke パート917（「〜できる」は断れる：古剣使ティグリスの「ネクサスの色1色を指定できる」、クロスシザースの「同じとして扱うことができる」。
// SEMANTICS_AUDIT §3.2「〜できる」は確認式・2026-11-12 ユーザー確認。#437 Round 2 の低確度の疑い）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const TIGRIS = "BS22-052"
const CROSS = "BS02-028" // クロスシザース
const RED_NEXUS = "BS14-075" // 焔竜の城塞都市（赤）
const PURPLE_NEXUS = "BS15-064" // 冥府へ続く魔門（紫）

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turnPlayer = "p1"
    s.phase = "attack"
    return s
}
const tigrisDeclare = (): EffectAction => {
    const e = getCard(TIGRIS).effects.find((x) => x.id === "BS22-052-e2") as { action: { actions: { type: string; then?: EffectAction }[] } }
    return e.action.actions.find((a) => a.type === "if" && a.then?.type === "declare")!.then!
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert((tigrisDeclare() as { optional?: true }).optional === true, "ティグリスの色の指定は任意")
    assert(getCard(RED_NEXUS).colors.includes("red") && getCard(PURPLE_NEXUS).colors.includes("purple"), "赤と紫のネクサス")
}

console.log("=== ティグリス：色を指定しなければ、相手のネクサスは手札に戻らない ===")
{
    const s = game("p917-tigris-skip")
    s.players.p2.field.nexuses = [createInstance(RED_NEXUS, s.turn, 0), createInstance(PURPLE_NEXUS, s.turn, 0)]
    resolveAction(s, "p1", null, tigrisDeclare())
    assert(s.pendingChoice?.optional === true, `指定は飛ばせる（${s.pendingChoice?.prompt ?? "なし"}）`)
    act(s, "p1", { type: "resolveChoice" })
    assert(s.pendingChoice === null && s.players.p2.field.nexuses.length === 2, "ネクサスは戻らない")
}

console.log("=== ティグリス：赤を指定すれば、赤のネクサスすべてが手札に戻る（対照） ===")
{
    const s = game("p917-tigris-pick")
    s.players.p2.field.nexuses = [createInstance(RED_NEXUS, s.turn, 0), createInstance(PURPLE_NEXUS, s.turn, 0)]
    resolveAction(s, "p1", null, tigrisDeclare())
    const red = (s.pendingChoice?.options ?? []).find((o) => o.includes("赤"))!
    act(s, "p1", { type: "resolveChoice", option: red })
    assert(s.players.p2.field.nexuses.length === 1 && s.players.p2.hand.includes(RED_NEXUS), "赤のネクサスが戻る")
}

for (const accept of [false, true]) {
    console.log(`=== クロスシザース：ネクサスを指定したあと「同じとして扱う」を${accept ? "選ぶとリンクする" : "断るとリンクしない"} ===`)
    const s = game(`p917-cross-${accept}`)
    const cross = createInstance(CROSS, s.turn, 3)
    s.players.p1.field.spirits = [cross]
    const nexus = createInstance(PURPLE_NEXUS, s.turn, 0)
    s.players.p1.field.nexuses = [nexus, createInstance(RED_NEXUS, s.turn, 0)]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", cross, { type: "linkNexusCoresChoice" } as EffectAction)
    act(s, "p1", { type: "resolveChoice", instanceId: nexus.instanceId })
    assert((s.pendingChoice?.prompt ?? "").includes("同じとして扱いますか"), `指定のあと確認が出る（${s.pendingChoice?.prompt ?? "なし"}）`)
    act(s, "p1", accept ? { type: "resolveChoice", option: "同じとして扱う" } : { type: "resolveChoice" })
    assert(s.pendingChoice === null, "選択は残らない")
    assert((nexus.coresLinkedTo === cross.instanceId) === accept, accept ? "リンクした" : "リンクしない")
}

console.log("すべてのチェックに合格しました 🎉（part917）")
