// smoke パート193（excludeTarget を持つ破壊が、選択後に**選んだ相手を破壊する**か）
//
// 2026-08-15 に対話モードの火入れで見つけた実バグの回帰テスト。
//
// 「そのブロックしたスピリットと同じコストを持つ、**他の**相手のスピリット1体を破壊する」
// （BS06-088 計画された場外乱闘Lv2）は、誘発から渡ってくる targetInstanceId（＝ブロッカー）を
// 「破壊する対象」ではなく「**除外する**対象」として扱う（action.excludeTarget）。
//
// ところが**選択待ちに渡す action に excludeTarget が残っていた**ため、
// プレイヤーが選んだ instanceId まで「除外する対象」と誤読され、**誰も破壊されなかった**。
// 破壊されないので同じ選択待ちがまた立ち、**実プレイなら進行不能**になる。
// exhaust 側（BS01甲精ディース）は先に同じ対策をしていて、destroy 側だけ漏れていた。
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireFieldEventTriggers } from "../../server/src/logic/EffectModules"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    family?: string[]
    effects?: Record<string, unknown>[]
    levels?: { cores: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const maxCores = (c: CardRow): number => (c.levels ?? []).reduce((m, lv) => Math.max(m, lv.cores), 1)

// 「excludeTarget を持つ破壊」を実データから決定的に選ぶ（cardId 直書きは過去にIDズレ事故があるため）
const SOURCE = CARDS.find((c) =>
    (c.effects ?? []).some(
        (e) =>
            e["kind"] === "fieldEvent" &&
            e["event"] === "ownSpiritBlocked" &&
            (e["action"] as Record<string, unknown> | undefined)?.["excludeTarget"] === true,
    ),
)
if (!SOURCE) throw new Error("excludeTarget を持つ ownSpiritBlocked の破壊効果が見つかりません")
const ENTRY = (SOURCE.effects ?? []).find(
    (e) => e["kind"] === "fieldEvent" && e["event"] === "ownSpiritBlocked",
)!
const FAMILY = String(ENTRY["familyFilter"])

console.log(`=== パート193：excludeTarget の破壊は、選んだ相手を破壊する（${SOURCE.name}）===`)

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

{
    const s = createGame("part193", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.turnPlayer = "p1" // 効果は『自分のアタックステップ』
    s.phase = "attack"
    s.interactiveTargets = true // 実サーバーと同じ経路
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []

    const nex = createInstance(SOURCE.cardId, s.turn, maxCores(SOURCE))
    s.players.p1.field.nexuses.push(nex)
    // 条件の系統を持つ自分のスピリット（ブロックされる側）
    const own = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes(FAMILY))!
    const mine = put(s, "p1", own.cardId, maxCores(own))
    // 相手：同じコストのスピリットを3体（ブロッカー＋他2体。候補が2体以上でないと選択待ちにならない）
    const opp = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!
    const blocker = put(s, "p2", opp.cardId, maxCores(opp))
    const other1 = put(s, "p2", opp.cardId, maxCores(opp))
    const other2 = put(s, "p2", opp.cardId, maxCores(opp))
    refreshLevelAsOverrides(s)

    fireFieldEventTriggers(s, "p1", "ownSpiritBlocked" as never, { pid: "p1", inst: mine }, undefined, blocker.instanceId)

    const pc = s.pendingChoice
    assert(pc !== null, "破壊するスピリットの選択待ちになる")
    const ids = pc!.candidates ?? []
    assert(ids.length === 2, `候補はブロッカー以外の2体（実際: ${ids.length}体）`)
    assert(!ids.includes(blocker.instanceId), "ブロックしたスピリット自身は候補に入らない（「他の」）")

    const picked = other1.instanceId
    assert(act(s, "p1", { type: "resolveChoice", instanceId: picked }) === null, "1体を選ぶ")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === picked),
        "**選んだスピリットが破壊される**（excludeTarget が残っていると誰も破壊されなかった）",
    )
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId),
        "ブロックしたスピリットは破壊されない",
    )
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === other2.instanceId),
        "選ばなかったスピリットも破壊されない（1体だけ）",
    )
    assert(s.pendingChoice === null, "選択待ちが解消する（同じ選択が立ち続けない＝進行不能にならない）")
}
