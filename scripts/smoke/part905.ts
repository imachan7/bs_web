// smoke パート905（効果の発生源の色・種別を、再入・特殊な使用・ネクサスの破壊でも落とさない。#437 R4-2 色F1〜F3）
import { assert, createGame, handleAction, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart, timedHas } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { applyProvocationUse } from "../../server/src/logic/magic/cast"
import type { EffectAction } from "../../server/src/type"

const VANILLA = "BS01-002" // ロクケラトプス（BP1000）
const ARMOR_PURPLE = "BS04-034" // ヴィゾフニル（【装甲：紫】・BP1000）
const ARMOR_WHITE = "BS11-028" // 鳥人機フレスヴェルガー（【装甲：白】・BP3000）
const GUARD = "SD01-032" // 機械神の加護（自分の白のネクサスは相手の赤の効果で破壊されない）

console.log("=== 前提: カードの機械確認 ===")
{
    const armorOf = (id: string) => getCard(id).effects.find((e) => e.kind === "keyword" && e.keyword === "armor") as { colors?: string[] } | undefined
    assert(armorOf(ARMOR_PURPLE)?.colors?.includes("purple") === true, "ヴィゾフニルは【装甲：紫】")
    assert(armorOf(ARMOR_WHITE)?.colors?.includes("white") === true, "フレスヴェルガーは【装甲：白】")
    assert(getCard(GUARD).colors.includes("white") && getCard(GUARD).type === "nexus", "機械神の加護は白のネクサス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.reserve = 10
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    ;(getCard(cardId).type === "nexus" ? s.players[pid].field.nexuses : s.players[pid].field.spirits).push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const magicAction = (id: string) => (getCard(id).effects.find((e) => e.kind === "magic") as { action: EffectAction }).action

console.log("=== 色F2. ソウルスライド（紫）：1体目を選んだあと、2体目の候補にも【装甲：紫】は出ない ===")
{
    const s = game("p905-soulslide")
    s.interactiveTargets = true
    const a = put(s, "p2", ARMOR_PURPLE, 3)
    const v = put(s, "p2", VANILLA, 3)
    const v2 = put(s, "p2", VANILLA, 3)
    put(s, "p2", VANILLA, 3) // 選ぶ余地を作る（候補が2体ちょうどだと聞かずに全員に適用する）
    resolveAction(s, "p1", null, magicAction("BS21-076"), undefined, ["purple"], "magic")
    assert(s.pendingChoice?.candidates.includes(a.instanceId) === false, "1体目の候補に装甲の体は出ない")
    handleAction(s, "p1", { type: "resolveChoice", instanceId: v.instanceId })
    const second = s.pendingChoice?.candidates ?? []
    assert(!second.includes(a.instanceId) && second.includes(v2.instanceId), `2体目の候補にも装甲の体は出ない（${second.length}体）`)
    if (s.pendingChoice) handleAction(s, "p1", { type: "resolveChoice", instanceId: v2.instanceId })
    assert(a.cores === 3 && v.cores === 1 && v2.cores === 1, `装甲の体はそのまま、ほかは1個（${a.cores}・${v.cores}・${v2.cores}）`)
}

console.log("=== 色F2. 手札に戻す（BP合計まで）：白のマジックで、【装甲：白】は2体目以降でも戻らない ===")
{
    const s = game("p905-bounce")
    const v = put(s, "p2", VANILLA, 1)
    const w = put(s, "p2", ARMOR_WHITE, 1)
    resolveAction(s, "p1", null, { type: "return", to: "hand", count: 1, budget: { by: "bp", amount: 5000 } } as EffectAction, undefined, ["white"], "magic")
    assert(!s.players.p2.field.spirits.includes(v), "装甲の無い体は戻る")
    assert(s.players.p2.field.spirits.includes(w), "【装甲：白】は戻らない")
}

console.log("=== 色F3. 機械神の加護：赤のマジックの効果では自分の白のネクサスは破壊されない（白以外の発生源なら破壊される） ===")
for (const [colors, survives] of [[["red"], true], [["blue"], false]] as const) {
    const s = game(`p905-guard-${colors[0]}`)
    const guard = put(s, "p2", GUARD, 0)
    resolveAction(s, "p1", null, { type: "destroy", nexus: "only", count: 1 } as EffectAction, undefined, [...colors], "magic")
    assert(s.players.p2.field.nexuses.includes(guard) === survives, `${colors[0]}のマジック：${survives ? "破壊されない" : "破壊される"}`)
}

console.log("=== 色F1. プロボケイション（白）を相手のメインステップ終了時に使っても、【装甲：白】は指定できない ===")
{
    const s = game("p905-provocation")
    s.turnPlayer = "p2"
    s.phase = "main"
    s.players.p1.hand = ["BS15-079"]
    const w = put(s, "p2", ARMOR_WHITE, 1)
    const v = put(s, "p2", VANILLA, 1)
    applyProvocationUse(s, { pid: "p1", cardId: "BS15-079" } as Parameters<typeof applyProvocationUse>[1])
    assert(!timedHas(s, w, "mustAttack"), "【装甲：白】は必ずアタックにならない")
    assert(timedHas(s, v, "mustAttack"), "装甲の無い体が指定される")
}

console.log("すべてのチェックに合格しました 🎉（part905）")
