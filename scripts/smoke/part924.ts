// smoke パート924（ブレイヴの破壊・分離は合体スピリット（ホスト）を対象に取る：ホストの耐性が効く。2026-11-13 ユーザー裁定。#491）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { attachBrave } from "../../server/src/logic/brave"

const BREAK = "BS12-076" // ブレイヴブレイク（紫マジック。相手の合体スピリットのブレイヴ1つを破壊）
const HADES = "BS11-015" // 冥王神獣インフェルド・ハデス（紫。アタック時に相手の合体スピリットを分離）
const HILD = "BS04-043" // ワルキューレ・ヒルド（相手の効果を受けない）
const VIZO = "BS04-034" // ヴィゾフニル（【装甲：紫】）
const ROKU = "BS01-002" // ロクケラトプス（耐性なし）
const SHIBA = "BS10-067" // からくり犬シバ（ブレイヴ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BREAK).name === "ブレイヴブレイク" && getCard(BREAK).colors.includes("purple"), "BREAKは紫のブレイヴブレイク")
    assert(getCard(HADES).name === "冥王神獣インフェルド・ハデス" && getCard(HADES).colors.includes("purple"), "HADESは紫のインフェルド・ハデス")
    assert(getCard(HILD).name === "ワルキューレ・ヒルド", "HILDはワルキューレ・ヒルド")
    assert(getCard(VIZO).name === "ヴィゾフニル", "VIZOはヴィゾフニル")
    assert(getCard(SHIBA).type === "brave", "SHIBAはブレイヴ")
}

const actionOf = (cardId: string, id: string) => (getCard(cardId).effects.find((e) => e.id === id) as unknown as { action: EffectAction }).action

function scene(seed: string, hostCardId: string) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    runTurnStart(s)
    s.interactiveTargets = false
    s.turn = 3
    const host = createInstance(hostCardId, s.turn, 1)
    s.players.p2.field.spirits.push(host)
    const brave = createInstance(SHIBA, s.turn, 0)
    attachBrave(s, "p2", host, brave)
    refreshLevelAsOverrides(s)
    return { s, host, brave }
}
const combined = (s: GameState, brave: ReturnType<typeof createInstance>) => s.players.p2.field.combinedBraves.includes(brave)

console.log("=== 1. ブレイヴの破壊：ホストが相手の効果を受けないなら、ブレイヴも破壊されない ===")
{
    const { s, brave } = scene("hild-break", HILD)
    resolveAction(s, "p1", null, actionOf(BREAK, "BS12-076-e1"), undefined, ["purple"], "magic")
    assert(combined(s, brave) && !s.players.p2.trashCards.includes(SHIBA), "ブレイヴは合体したまま")
}

console.log("=== 2. ブレイヴの破壊：ホストの【装甲：紫】が紫のマジックから守る ===")
{
    const { s, brave } = scene("vizo-break", VIZO)
    resolveAction(s, "p1", null, actionOf(BREAK, "BS12-076-e1"), undefined, ["purple"], "magic")
    assert(combined(s, brave), "ブレイヴは合体したまま")
}

console.log("=== 3. ブレイヴの破壊：耐性の無いホストなら破壊される（対照） ===")
{
    const { s, brave } = scene("roku-break", ROKU)
    resolveAction(s, "p1", null, actionOf(BREAK, "BS12-076-e1"), undefined, ["purple"], "magic")
    assert(!combined(s, brave) && s.players.p2.trashCards.includes(SHIBA), "ブレイヴは破壊されてトラッシュへ")
}

console.log("=== 4. 分離：ホストが相手の効果を受けないなら分離しない／耐性が無ければ分離する ===")
{
    const a = scene("hild-detach", HILD)
    const hadesA = createInstance(HADES, a.s.turn, 1)
    a.s.players.p1.field.spirits.push(hadesA)
    resolveAction(a.s, "p1", hadesA, actionOf(HADES, "BS11-015-e2"))
    assert(combined(a.s, a.brave), "ヒルドのブレイヴは合体したまま")

    const b = scene("roku-detach", ROKU)
    const hadesB = createInstance(HADES, b.s.turn, 1)
    b.s.players.p1.field.spirits.push(hadesB)
    resolveAction(b.s, "p1", hadesB, actionOf(HADES, "BS11-015-e2"))
    assert(!combined(b.s, b.brave), "ロクケラトプスのブレイヴは分離する（対照）")
}

console.log("すべてのチェックに合格しました 🎉（part924）")
