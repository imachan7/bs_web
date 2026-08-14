// smoke パート181（【不死】＝トラッシュからの誘発召喚。BS09）
//
// 【不死：コストN】『お互いのアタックステップ』
// 「トラッシュにあるこのスピリットカードは、自分のコストNのスピリットが破壊されたとき召喚できる。」
//
// 確定した仕様（2026-08-14 ユーザー確認。docs/design/BS09_PLAN.md §3）:
//   - **召喚コストは通常どおり支払う**（「コストを支払わずに」の記載が無いため）
//   - 確認は**＞６（破壊処理）のその場**で出す
//   - ⚠️「フィールドに残る」と**同時発揮**なので、ターンプレイヤーが決める解決順が結果を変える
//     （残るを先に解決すると破壊されなかったことになり、【不死】は発動できない）
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { effectiveCost } from "../../shared/cost"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    colors?: string[]
    reduction?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function findCard(pred: (c: CardRow) => boolean, label: string): CardRow {
    const found = CARDS.find(pred)
    if (!found) throw new Error(`${label} に合うカードが見つかりません`)
    return found
}
const fushiEntryOf = (c: CardRow): Record<string, unknown> | undefined =>
    (c.effects ?? []).find((e) => e["kind"] === "keyword" && e["keyword"] === "fushi")

// 【不死】持ち（引き金のコスト指定つき）を2枚、引き金コストが違うものを選ぶ
const FUSHI_CARDS = CARDS.filter((c) => {
    const e = fushiEntryOf(c)
    return e !== undefined && Array.isArray(e["triggerCosts"]) && (e["triggerCosts"] as number[]).length > 0
})
const FUSHI = FUSHI_CARDS[0]!
const FUSHI_COSTS = fushiEntryOf(FUSHI)!["triggerCosts"] as number[]

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const ALIVE = (s: GameState, pid: PlayerId, id: string): boolean =>
    s.players[pid].field.spirits.some((x) => x.instanceId === id)
const ON_FIELD = (s: GameState, pid: PlayerId, cardId: string): boolean =>
    s.players[pid].field.spirits.some((x) => x.cardId === cardId)

// 引き金にちょうどよいコストの、効果を持たない生贄スピリットを探す
function findVictim(cost: number): CardRow {
    return findCard(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && c.cost === cost,
        `コスト${String(cost)}の効果なしスピリット`,
    )
}

// p1 のアタックステップ（『お互いのアタックステップ』なのでどちらでもよい）で、
// トラッシュに【不死】持ちを置いた盤面を作る
function setup(seed: string, interactive: boolean, reserve = 30) {
    const s: GameState = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.phase = "attack"
    s.interactiveTargets = interactive
    s.players.p1.reserve = reserve
    s.players.p2.reserve = 30
    s.players.p1.trashCards.push(FUSHI.cardId)
    return s
}

console.log("=== 【不死】：引き金のコストの味方が破壊されると、トラッシュから召喚できる ===")
{
    const victimCost = FUSHI_COSTS[0]!
    const s = setup("fushi-basic", false)
    const victim = put(s, "p1", findVictim(victimCost).cardId, 1)
    const reserveBefore = s.players.p1.reserve
    const trashCoresBefore = s.players.p1.trashCores
    // 【不死】の軽減は「破壊された個体がまだ場にいる」ものとして数える（2026-08-14 ユーザー確認）。
    // つまり**破壊前に計算した実コスト**と一致するはず
    const cost = effectiveCost(s, "p1", FUSHI as unknown as Parameters<typeof effectiveCost>[2])
    assert(
        cost < (FUSHI.cost ?? 0),
        `破壊される個体のシンボルで軽減されている（コスト${String(FUSHI.cost)}→${String(cost)}）`,
    )

    // 相手の効果で破壊する（破壊バッチ経由＝＞６の破壊処理と同じ道）
    destroyByEffect(s, "p1", victim.instanceId)

    assert(!ALIVE(s, "p1", victim.instanceId), "引き金になったスピリットは破壊されている")
    assert(ON_FIELD(s, "p1", FUSHI.cardId), `${FUSHI.name}がトラッシュから召喚されている`)
    assert(!s.players.p1.trashCards.includes(FUSHI.cardId), "召喚されたカードはトラッシュから消えている")
    // コストは通常どおり支払う：リザーブが「コスト＋維持コア」ぶん減り、コストぶんがトラッシュへ
    const maintain = FUSHI.levels?.[0]?.cores ?? 1
    // 破壊された生贄のコア1個はリザーブへ戻るので、その分を足して比べる
    assert(
        s.players.p1.reserve === reserveBefore + 1 - cost - maintain,
        `召喚コスト${String(cost)}＋維持コア${String(maintain)}がリザーブから引かれている（実際: ${String(s.players.p1.reserve)}）`,
    )
    assert(
        s.players.p1.trashCores === trashCoresBefore + cost,
        "支払ったコストぶんのコアがトラッシュに置かれている",
    )
}

console.log("=== 【不死】：引き金のコストが違う味方が破壊されても発動しない ===")
{
    const wrongCost = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => !FUSHI_COSTS.includes(n))!
    const s = setup("fushi-wrong-cost", false)
    const victim = put(s, "p1", findVictim(wrongCost).cardId, 1)
    destroyByEffect(s, "p1", victim.instanceId)
    assert(!ON_FIELD(s, "p1", FUSHI.cardId), "指定コストでなければ召喚されない")
    assert(s.players.p1.trashCards.includes(FUSHI.cardId), "トラッシュに残ったまま")
}

console.log("=== 【不死】：『お互いのアタックステップ』なのでメインステップでは発動しない ===")
{
    const s = setup("fushi-phase", false)
    s.phase = "main"
    const victim = put(s, "p1", findVictim(FUSHI_COSTS[0]!).cardId, 1)
    destroyByEffect(s, "p1", victim.instanceId)
    assert(!ON_FIELD(s, "p1", FUSHI.cardId), "アタックステップ以外では召喚されない")
}

console.log("=== 【不死】：コストを払えないなら確認自体が出ない ===")
{
    // 必要なのは「召喚コスト＋維持コア」。破壊された生贄のコア1個がリザーブへ戻るぶんも見込んで、
    // 戻ってきてもなお足りない量にしておく
    const need = (FUSHI.cost ?? 0) + (FUSHI.levels?.[0]?.cores ?? 1)
    const s = setup("fushi-no-cores", true, need - 2)
    const victim = put(s, "p1", findVictim(FUSHI_COSTS[0]!).cardId, 1)
    destroyByEffect(s, "p1", victim.instanceId)
    assert(s.pendingChoice === null, "リザーブが足りなければ確認は立たない")
    assert(!ON_FIELD(s, "p1", FUSHI.cardId), "召喚もされない")
}

console.log("=== 【不死】：対話モードでは召喚するかを持ち主に確認する ===")
{
    const s = setup("fushi-confirm", true)
    const victim = put(s, "p1", findVictim(FUSHI_COSTS[0]!).cardId, 1)
    destroyByEffect(s, "p1", victim.instanceId)
    assert(s.pendingChoice?.fushiSummon !== undefined, "【不死】の召喚確認が立つ")
    assert(s.pendingChoice?.pid === "p1", "確認するのはカードの持ち主")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "召喚しないを選ぶ")
    assert(s.pendingChoice === null, "選択待ちが解消する")
    assert(!ON_FIELD(s, "p1", FUSHI.cardId), "断れば召喚されない")
    assert(s.players.p1.trashCards.includes(FUSHI.cardId), "トラッシュに残ったまま")
}

console.log("=== 【不死】：確認で「召喚する」を選ぶとコストを払って場に出る ===")
{
    const s = setup("fushi-accept", true)
    const victim = put(s, "p1", findVictim(FUSHI_COSTS[0]!).cardId, 1)
    destroyByEffect(s, "p1", victim.instanceId)
    assert(s.pendingChoice?.fushiSummon !== undefined, "【不死】の召喚確認が立つ")
    assert(act(s, "p1", { type: "resolveChoice", option: "召喚する" }) === null, "召喚するを選ぶ")
    assert(ON_FIELD(s, "p1", FUSHI.cardId), "トラッシュから召喚されている")
}

// 効果による破壊を、破壊バッチ（＝＞６の破壊処理と同じ道）で起こす
function destroyByEffect(s: GameState, pid: PlayerId, instanceId: string): void {
    destroyTargetsBatch(s, "p2", [{ pid, instanceId }], { sourcePid: "p2", sourceType: "spirit" })
}
