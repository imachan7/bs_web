// smoke パート319（BS14-098 ダークリボーン：このターン最初の【不死】召喚のコストが0になる）
//
// メイン：「このターンの最初に【不死】の効果によって召喚される、自分のスピリットカード1枚を、
//          コストを支払わずに召喚する。」
//   - コスト0になるのは**このターン最初の1回だけ**（使ったら制約を取り除く）
//   - **維持コアは通常どおり要る**（「コストを支払わずに」＝召喚コストのみ）
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { effectiveCost } from "../../shared/cost"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const byId = (id: string): CardRow => {
    const c = CARDS.find((x) => x.cardId === id)
    if (!c) throw new Error(`${id} が見つかりません`)
    return c
}

const fushiEntryOf = (c: CardRow): Record<string, unknown> | undefined =>
    (c.effects ?? []).find((e) => e["kind"] === "keyword" && e["keyword"] === "fushi")
const FUSHI = CARDS.filter((c) => {
    const e = fushiEntryOf(c)
    return e !== undefined && Array.isArray(e["triggerCosts"]) && (e["triggerCosts"] as number[]).length > 0
})[0]!
const FUSHI_COSTS = fushiEntryOf(FUSHI)!["triggerCosts"] as number[]
const MAINTAIN = FUSHI.levels?.[0]?.cores ?? 1

// 引き金にちょうどよいコストの、効果を持たない生贄スピリット
const victimCard = (cost: number): CardRow => {
    const c = CARDS.find((x) => x.type === "spirit" && (x.effects ?? []).length === 0 && x.cost === cost)
    if (!c) throw new Error(`コスト${String(cost)}の効果なしスピリットが見つかりません`)
    return c
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const ON_FIELD = (s: GameState, pid: PlayerId, cardId: string): boolean =>
    s.players[pid].field.spirits.some((x) => x.cardId === cardId)
const destroyByEffect = (s: GameState, pid: PlayerId, instanceId: string): void => {
    destroyTargetsBatch(s, "p2", [{ pid, instanceId }], { sourcePid: "p2", sourceType: "spirit" })
}

function setup(seed: string, reserve = 30): GameState {
    const s: GameState = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.phase = "attack"
    s.interactiveTargets = false
    s.players.p1.reserve = reserve
    s.players.p2.reserve = 30
    s.players.p1.trashCards.push(FUSHI.cardId)
    return s
}

console.log("=== BS14-098：メイン効果でこのターンの制約が積まれる ===")
{
    const card = byId("BS14-098")
    const main = (card.effects ?? []).find((e) => e["timing"] === "main")
    assert(main !== undefined, "メイン側の効果が書かれている")
    assert(
        (main!["action"] as Record<string, unknown>)["type"] === "freeFushiSummonThisTurn",
        "メイン側は freeFushiSummonThisTurn",
    )
    const s = setup("darkreborn-push")
    resolveAction(s, "p1", null, { type: "freeFushiSummonThisTurn" })
    assert(
        s.turnConstraints.some((c) => c.type === "freeFushiSummonForPid" && c.pid === "p1"),
        "このターンの制約が積まれる",
    )
}

console.log("=== BS14-098：【不死】の召喚コストが0になり、維持コアだけ要る ===")
{
    const s = setup("darkreborn-free")
    resolveAction(s, "p1", null, { type: "freeFushiSummonThisTurn" })
    const victim = put(s, "p1", victimCard(FUSHI_COSTS[0]!).cardId, 1)
    const cost = effectiveCost(s, "p1", FUSHI as unknown as Parameters<typeof effectiveCost>[2])
    assert(cost > 0, `素の実コストは0より大きい（${String(cost)}）`)
    const reserveBefore = s.players.p1.reserve
    const trashCoresBefore = s.players.p1.trashCores

    destroyByEffect(s, "p1", victim.instanceId)

    assert(ON_FIELD(s, "p1", FUSHI.cardId), `${FUSHI.name}がトラッシュから召喚されている`)
    // 生贄のコア1個がリザーブへ戻り、維持コアだけがリザーブから出ていく
    assert(
        s.players.p1.reserve === reserveBefore + 1 - MAINTAIN,
        `維持コア${String(MAINTAIN)}しか減っていない（実際: ${String(s.players.p1.reserve)}）`,
    )
    assert(s.players.p1.trashCores === trashCoresBefore, "召喚コストぶんのコアはトラッシュへ行かない")
    assert(
        !s.turnConstraints.some((c) => c.type === "freeFushiSummonForPid" && c.pid === "p1"),
        "使い切りなので制約は取り除かれる",
    )
}

console.log("=== BS14-098：2回目の【不死】召喚は通常どおりコストを支払う ===")
{
    const s = setup("darkreborn-second")
    resolveAction(s, "p1", null, { type: "freeFushiSummonThisTurn" })
    const cost = effectiveCost(s, "p1", FUSHI as unknown as Parameters<typeof effectiveCost>[2])

    const v1 = put(s, "p1", victimCard(FUSHI_COSTS[0]!).cardId, 1)
    destroyByEffect(s, "p1", v1.instanceId)
    const trashCoresAfterFirst = s.players.p1.trashCores
    assert(trashCoresAfterFirst === 0, "1回目はコストを払っていない")

    // 2枚目をトラッシュに置いてから、もう一度引き金を引く
    s.players.p1.trashCards.push(FUSHI.cardId)
    const v2 = put(s, "p1", victimCard(FUSHI_COSTS[0]!).cardId, 1)
    destroyByEffect(s, "p1", v2.instanceId)
    assert(
        s.players.p1.field.spirits.filter((x) => x.cardId === FUSHI.cardId).length === 2,
        "2枚目も召喚されている",
    )
    assert(s.players.p1.trashCores > trashCoresAfterFirst, `2回目はコスト${String(cost)}を支払う`)
}

console.log("=== BS14-098：コストぶんのリザーブが無くても、維持コアさえあれば召喚できる ===")
{
    // 素のコストには足りないが、維持コアだけは足りる量（生贄のコア1個が戻るぶんも見込む）
    const s = setup("darkreborn-poor", MAINTAIN)
    resolveAction(s, "p1", null, { type: "freeFushiSummonThisTurn" })
    const victim = put(s, "p1", victimCard(FUSHI_COSTS[0]!).cardId, 1)
    destroyByEffect(s, "p1", victim.instanceId)
    assert(ON_FIELD(s, "p1", FUSHI.cardId), "コスト0なので維持コアだけで召喚できる")
}

console.log("=== BS14-098：対話モードの確認プロンプトもコスト0と出す ===")
{
    const s = setup("darkreborn-prompt")
    s.interactiveTargets = true
    resolveAction(s, "p1", null, { type: "freeFushiSummonThisTurn" })
    const victim = put(s, "p1", victimCard(FUSHI_COSTS[0]!).cardId, 1)
    destroyByEffect(s, "p1", victim.instanceId)
    assert(s.pendingChoice?.fushiSummon !== undefined, "【不死】の召喚確認が立つ")
    assert((s.pendingChoice?.prompt ?? "").includes("コスト0"), "確認文はコスト0と出す")
    assert(act(s, "p1", { type: "resolveChoice", option: "召喚する" }) === null, "召喚するを選ぶ")
    assert(ON_FIELD(s, "p1", FUSHI.cardId), "召喚されている")
}

console.log("すべてのチェックに合格しました 🎉（part319）")
