// smoke パート92（簡略化の解消：BS03-075 犬人マードックの「相手のフィールド/リザーブから」）
//
// 「マジック/ネクサスの効果で相手の手札にカードが加えられたとき、相手の**フィールド/リザーブ**から、
//  そのカード1枚につき、コア1個を相手のトラッシュに置く」
// 従来はフィールドのカードしか候補にならなかった。リザーブは instanceId を持たないため、
// 番兵 OPPONENT_RESERVE_TARGET を候補に混ぜて選べるようにした（action.includeReserve 指定時のみ）。
//
// BS02-022 魔界侯爵コキュートスは「スピリット1体かネクサス1つ」なのでリザーブを含めない。
import { act, assert, createGame, createInstance, resolveAction } from "./helpers"
import type { GameState } from "./helpers"
import { OPPONENT_RESERVE_TARGET } from "../../shared/rules"

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 10
    s.players.p2.reserve = 5
    return s
}

console.log("=== 犬人マードック：相手のリザーブも取得元に選べる ===")
{
    const s = setup("mardock-reserve-test")
    const target = createInstance("BS01-054", s.turn, 2) // 相手のスピリット（コア2個）
    s.players.p2.field.spirits.push(target)

    resolveAction(
        s,
        "p1",
        null,
        { type: "coreToOpponentTrashChoice", count: 1, includeReserve: true },
        undefined,
        undefined,
        "spirit",
    )
    assert(s.pendingChoice !== null, "候補が2つ以上になり選択待ちが立つ")
    const cands = s.pendingChoice?.candidates ?? []
    assert(cands.includes(target.instanceId), "フィールドのスピリットが候補")
    assert(cands.includes(OPPONENT_RESERVE_TARGET), "相手のリザーブも候補")

    const reserveBefore = s.players.p2.reserve
    assert(
        act(s, "p1", { type: "resolveChoice", instanceId: OPPONENT_RESERVE_TARGET }) === null,
        "相手のリザーブを選ぶ",
    )
    assert(s.players.p2.reserve === reserveBefore - 1, "相手のリザーブからコア1個が減る")
    assert(s.players.p2.trashCores === 1, "取り除いたコアは相手のトラッシュへ")
    assert(target.cores === 2, "フィールドのスピリットのコアは減らない")
}

console.log("--- includeReserve が無い効果（コキュートス）はリザーブを候補にしない ---")
{
    const s = setup("cocytus-noreserve-test")
    const a = createInstance("BS01-054", s.turn, 2)
    const b = createInstance("BS01-050", s.turn, 2)
    s.players.p2.field.spirits.push(a, b)

    resolveAction(
        s,
        "p1",
        null,
        { type: "coreToOpponentTrashChoice", count: 1 },
        undefined,
        undefined,
        "spirit",
    )
    assert(s.pendingChoice !== null, "候補2体で選択待ちが立つ")
    assert(
        !(s.pendingChoice?.candidates ?? []).includes(OPPONENT_RESERVE_TARGET),
        "リザーブは候補に含まれない",
    )
}

console.log("--- 相手のリザーブが空なら候補にしない ---")
{
    const s = setup("mardock-emptyreserve-test")
    s.players.p2.reserve = 0
    const a = createInstance("BS01-054", s.turn, 2)
    const b = createInstance("BS01-050", s.turn, 2)
    s.players.p2.field.spirits.push(a, b)

    resolveAction(
        s,
        "p1",
        null,
        { type: "coreToOpponentTrashChoice", count: 1, includeReserve: true },
        undefined,
        undefined,
        "spirit",
    )
    assert(
        !(s.pendingChoice?.candidates ?? []).includes(OPPONENT_RESERVE_TARGET),
        "リザーブにコアが無ければ候補に入らない",
    )
}
