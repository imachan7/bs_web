// smoke パート182（破壊待機状態）
//
// 破壊されたカードはすぐには場を離れない（docs/design/TIMING_CHART.md §1.5。2026-08-14 ユーザー確認）:
//   1. 破壊されると「破壊待機状態」になる（＝まだフィールドにいる。コアも乗ったまま）
//   2. 破壊時に誘発した効果を発揮する（この間、数・シンボル・効果の対象に数えられる）
//   3. 破壊待機状態のカードをトラッシュに置く
//   4. その後、乗っていたコアをリザーブへ移す
//
// 破壊待機状態の間は**疲労も回復もできず、そこからさらに破壊されることもない**。
import {
    assert,
    createGame,
    createInstance,
    destroyNexus,
    destroySpirit,
    effectiveBp,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { exhaustSpirit, refreshSpirit, tenshoCandidates } from "../../server/src/logic/EffectModules"
import { commitPendingDestruction, commitPendingNexusDestruction } from "../../server/src/logic/removal"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    colors?: string[]
    family?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const ALIVE = (s: GameState, pid: PlayerId, id: string): boolean =>
    s.players[pid].field.spirits.some((x) => x.instanceId === id)

// 『このスピリットの破壊時』に「自分のフィールドにいる系統：Xを持つスピリット1体につき」
// を数えるカード（宝石の獣カーバルク）。**自分自身が数に入るか**で破壊待機状態を観測できる
const COUNTER_CARD = CARDS.find((c) => {
    if (c.type !== "spirit") return false
    return (c.effects ?? []).some((e) => {
        if (e["kind"] !== "triggered" || e["trigger"] !== "onDestroy") return false
        const action = e["action"] as Record<string, unknown> | undefined
        if (action?.["type"] !== "coreGainPer") return false
        // 「自分のフィールドにいる系統：Xを持つスピリット1体につき」＝自分自身も数に入るはずの形。
        // selfCoresAtDestruction のような別の数え方は除く
        const counter = action["counter"] as Record<string, unknown> | string | undefined
        if (typeof counter !== "object" || counter === null) return false
        const family = counter["ownFamily"]
        return typeof family === "string" && (c.family ?? []).includes(family)
    })
})!

console.log("=== 破壊時の誘発を解決している間、破壊されたスピリットはまだフィールドに数えられる ===")
{
    const s: GameState = createGame("pending-count", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const cores = COUNTER_CARD.levels?.[1]?.cores ?? 3
    const inst = put(s, "p1", COUNTER_CARD.cardId, cores)
    const reserveBefore = s.players.p1.reserve

    // 同じ系統の仲間は**1体も置かない**。それでも自分自身が数えられるので効果が発揮する
    destroySpirit(s, "p1", inst.instanceId)

    assert(
        s.players.p1.reserve === reserveBefore + cores + 1,
        `破壊された自分自身も数に入る（乗っていたコア${String(cores)}個＋数えたぶん1個。実際: ${String(s.players.p1.reserve - reserveBefore)}）`,
    )
    assert(!ALIVE(s, "p1", inst.instanceId), "誘発を解決し終えたらフィールドから離れる")
    assert(s.players.p1.trashCards.includes(COUNTER_CARD.cardId), "カードはトラッシュに置かれる")
    assert(inst.pendingDestruction === undefined, "破壊待機状態の印は残らない")
}

// 破壊待機状態を直接作って、その間の禁止事項を確かめる
function makePending(seed: string) {
    const s: GameState = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    const vanilla = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!
    const inst = put(s, "p1", vanilla.cardId, 2)
    inst.pendingDestruction = true
    return { s, inst }
}

console.log("=== 破壊待機状態のスピリットは疲労も回復もできない ===")
{
    const { s, inst } = makePending("pending-rest")
    exhaustSpirit(s, "p1", inst)
    assert(!inst.isRested, "疲労させられない")
    inst.isRested = true
    refreshSpirit(s, "p1", inst)
    assert(inst.isRested, "回復させられない")
}

console.log("=== 破壊待機状態のスピリットは、そこからさらに破壊されない ===")
{
    const { s, inst } = makePending("pending-redestroy")
    const trashBefore = s.players.p1.trashCards.length
    assert(destroySpirit(s, "p1", inst.instanceId) === false, "破壊は成立しない")
    assert(ALIVE(s, "p1", inst.instanceId), "フィールドに残ったまま")
    assert(s.players.p1.trashCards.length === trashBefore, "トラッシュにも置かれない")
    // 維持コア割れによる消滅も同じ扱い
    assert(destroySpirit(s, "p1", inst.instanceId, "deplete") === false, "消滅も成立しない")
    assert(ALIVE(s, "p1", inst.instanceId), "まだフィールドに残っている")
}

console.log("=== 破壊待機状態の解除：カードはトラッシュへ、コアはリザーブへ ===")
{
    const { s, inst } = makePending("pending-commit")
    const reserveBefore = s.players.p1.reserve
    const cores = inst.cores
    commitPendingDestruction(s, "p1", inst)
    assert(!ALIVE(s, "p1", inst.instanceId), "フィールドから離れる")
    assert(s.players.p1.trashCards.includes(inst.cardId), "カードはトラッシュへ")
    assert(
        s.players.p1.reserve === reserveBefore + cores,
        `乗っていたコア${String(cores)}個はリザーブへ（実際: ${String(s.players.p1.reserve - reserveBefore)}）`,
    )
    assert(inst.pendingDestruction === undefined, "印は消える")
}

// ネクサスも破壊待機状態になり、その間も効果（誘発・継続効果）は普通に働く（2026-08-14 ユーザー確認）
const BUFF_NEXUS = CARDS.find((c) => {
    if (c.type !== "nexus") return false
    return (c.effects ?? []).some((e) => {
        if (e["kind"] !== "aura") return false
        const aura = e["aura"] as Record<string, unknown> | undefined
        return (
            aura?.["type"] === "bp" &&
            aura["target"] === "ownAll" &&
            typeof aura["amount"] === "number" &&
            typeof aura["colorFilter"] === "string" &&
            aura["battlingOnly"] === undefined
        )
    })
})!
const BUFF_ENTRY = (BUFF_NEXUS.effects ?? []).find((e) => e["kind"] === "aura")!
const BUFF_AURA = BUFF_ENTRY["aura"] as Record<string, unknown>
const BUFF_COLOR = BUFF_AURA["colorFilter"] as string
const BUFF_AMOUNT = BUFF_AURA["amount"] as number

console.log("=== 破壊待機中のネクサスも、継続効果はそのまま働く ===")
{
    const s: GameState = createGame("pending-nexus-aura", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const buffed = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.colors ?? []).includes(BUFF_COLOR),
    )!
    const spirit = put(s, "p1", buffed.cardId, 1)
    const baseBp = effectiveBp(s, "p1", spirit)

    const nexus = createInstance(BUFF_NEXUS.cardId, s.turn, BUFF_NEXUS.levels?.[0]?.cores ?? 0)
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", spirit) === baseBp + BUFF_AMOUNT, "ネクサスの継続効果でBPが上がる")

    // 破壊待機状態にしても、まだフィールドにいるので効果は生きている
    nexus.pendingDestruction = true
    refreshLevelAsOverrides(s)
    assert(
        effectiveBp(s, "p1", spirit) === baseBp + BUFF_AMOUNT,
        "破壊待機中でも継続効果は切れない",
    )

    // 確定してトラッシュへ置かれると、そこで初めて効果が切れる
    commitPendingNexusDestruction(s, "p1", nexus)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", spirit) === baseBp, "トラッシュに置かれた時点で効果が切れる")
    assert(s.players.p1.trashCards.includes(BUFF_NEXUS.cardId), "カードはトラッシュへ")
}

console.log("=== 破壊待機中のネクサスは、そこからさらに破壊されない ===")
{
    const s: GameState = createGame("pending-nexus-redestroy", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const nexus = createInstance(BUFF_NEXUS.cardId, s.turn, 2)
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    nexus.pendingDestruction = true
    const reserveBefore = s.players.p1.reserve
    assert(destroyNexus(s, "p1", nexus.instanceId) === false, "破壊は成立しない")
    assert(
        s.players.p1.field.nexuses.some((n) => n.instanceId === nexus.instanceId),
        "フィールドに残ったまま",
    )
    commitPendingNexusDestruction(s, "p1", nexus)
    assert(s.players.p1.reserve === reserveBefore + 2, "確定すると乗っていたコアがリザーブへ移る")
}

console.log("=== 破壊待機中のスピリットは【転召】の生贄にできる ===")
{
    // 破壊で誘発した効果がスピリットを召喚し、そのカードが【転召】を持っていた場合、
    // 破壊待機状態のスピリットを生贄にできる（2026-08-14 ユーザー確認。TIMING_CHART.md §1.5）。
    // 実カードの組み合わせはまだ無いので、候補列挙の土台だけを固定しておく
    const { s, inst } = makePending("pending-tensho")
    // 破壊待機の印を外した状態と付けた状態で、候補が変わらないことを見る
    // （minCost はカードのコストに依存しないよう 0 にする）
    delete inst.pendingDestruction
    const before = tenshoCandidates(s, "p1", 0).map((c) => c.instanceId)
    inst.pendingDestruction = true
    const after = tenshoCandidates(s, "p1", 0).map((c) => c.instanceId)
    assert(before.includes(inst.instanceId), "（前提）破壊されていなければ候補に入る")
    assert(
        after.length === before.length && after.includes(inst.instanceId),
        "破壊待機中でも【転召】の生贄候補に入る",
    )
}
