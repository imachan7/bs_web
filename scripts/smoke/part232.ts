// smoke パート232（「指定する」「1体ずつ残し」はプレイヤーが選ぶ。2026-08-24）
//
// 効果文が対象の選び方を書いているのに、実装が自動選択で固定していた2種。
//
//   BS04-053 天使スローン  「相手のスピリット2体を**指定する**」→ 実効BP上位2体で固定されていた
//   BS02-090 マインドフレア「カード名1つにつきスピリット1体ずつを**残し**」→ 先頭を残す固定だった
//
// どちらも非対話（テスト・自動解決）では従来の自動選択を残す。
// 選択の応答は handleAction を直接呼ぶ（helpers.act は対話モードで先に消化してしまうため）
import { assert, createGame, createInstance, handleAction, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const BIG = "BS01-004" // ドラグノ偵察兵：Lv1 BP2000
const SMALL = "BS01-001" // ゴラドン：Lv1 BP1000

function putEnemy(s: GameState, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players.p2.field.spirits.push(inst)
    return inst.instanceId
}

function setup(name: string, interactive: boolean): GameState {
    const s = createGame(name, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    return s
}

const coresOf = (s: GameState, id: string): number | undefined =>
    s.players.p2.field.spirits.find((sp) => sp.instanceId === id)?.cores

console.log("=== 天使スローン：コアを入れ替える2体を自分で指定できる ===")
{
    const s = setup("throne-pick-two", true)
    const a = putEnemy(s, BIG, 5) // BP2000・コア5
    const b = putEnemy(s, BIG, 4) // BP2000・コア4（自動選択だとこの2体が選ばれる）
    const c = putEnemy(s, SMALL, 1) // BP1000・コア1

    resolveAction(s, "p1", null, { type: "swapOpponentCores" })
    assert(!!s.pendingChoice, "1体目の選択待ちになる")
    assert(s.pendingChoice!.candidates.length === 3, "相手の3体すべてが候補")

    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: a }) === null, "1体目を選ぶ")
    assert(!!s.pendingChoice, "2体目の選択待ちが続く")
    assert(!s.pendingChoice!.candidates.includes(a), "1体目は2体目の候補から外れる")

    // 自動選択なら a と b が選ばれる。あえて c を選ぶ
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: c }) === null, "2体目に別の個体を選ぶ")
    assert(coresOf(s, a) === 1, `指定した2体のコアが入れ替わる（aは1個。実際は${coresOf(s, a)}）`)
    assert(coresOf(s, c) === 5, `同上（cは5個。実際は${coresOf(s, c)}）`)
    assert(coresOf(s, b) === 4, "指定しなかった個体は変わらない")
}

console.log("=== 天使スローン：非対話では従来どおり実効BP上位2体 ===")
{
    const s = setup("throne-auto", false)
    const a = putEnemy(s, BIG, 5)
    const b = putEnemy(s, BIG, 4)
    const c = putEnemy(s, SMALL, 1)
    resolveAction(s, "p1", null, { type: "swapOpponentCores" })
    assert(!s.pendingChoice, "選択待ちにならない")
    assert(coresOf(s, a) === 4 && coresOf(s, b) === 5, "BP上位2体が入れ替わる")
    assert(coresOf(s, c) === 1, "BPの低い個体は変わらない")
}

console.log("=== マインドフレア：同名のうち残す1体を自分で選べる ===")
{
    const s = setup("mindflare-pick-kept", true)
    const first = putEnemy(s, BIG, 3) // 同名1体目（自動なら先頭が残る）
    const second = putEnemy(s, BIG, 1) // 同名2体目
    const other = putEnemy(s, SMALL, 1) // 重複していないので対象外

    resolveAction(s, "p1", null, { type: "destroyDuplicateNames" })
    assert(!!s.pendingChoice, "残す1体の選択待ちになる")
    assert(
        s.pendingChoice!.candidates.includes(first) && s.pendingChoice!.candidates.includes(second),
        "同名の2体が候補",
    )
    assert(!s.pendingChoice!.candidates.includes(other), "重複していない個体は候補に入らない")

    // 自動選択なら first が残る。あえて second を残す
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: second }) === null, "2体目を残す")
    const left = s.players.p2.field.spirits.map((sp) => sp.instanceId)
    assert(left.includes(second), "選んだ個体が残った")
    assert(!left.includes(first), "選ばなかった同名の個体が破壊された")
    assert(left.includes(other), "重複していない個体は残る")
}

console.log("=== マインドフレア：非対話では従来どおり先頭を残す ===")
{
    const s = setup("mindflare-auto", false)
    const first = putEnemy(s, BIG, 3)
    const second = putEnemy(s, BIG, 1)
    resolveAction(s, "p1", null, { type: "destroyDuplicateNames" })
    assert(!s.pendingChoice, "選択待ちにならない")
    const left = s.players.p2.field.spirits.map((sp) => sp.instanceId)
    assert(left.includes(first) && !left.includes(second), "先頭が残り、2体目が破壊される")
}

console.log("=== マインドフレア：重複するカード名が2種類あれば、名前ごとに聞く ===")
{
    const s = setup("mindflare-two-groups", true)
    const a1 = putEnemy(s, BIG, 3)
    const a2 = putEnemy(s, BIG, 1)
    const b1 = putEnemy(s, SMALL, 3)
    const b2 = putEnemy(s, SMALL, 1)

    resolveAction(s, "p1", null, { type: "destroyDuplicateNames" })
    assert(!!s.pendingChoice, "1つ目のカード名の選択待ち")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: a2 }) === null, "1つ目は2体目を残す")
    assert(!!s.pendingChoice, "2つ目のカード名の選択待ちが続く")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: b2 }) === null, "2つ目も2体目を残す")

    const left = s.players.p2.field.spirits.map((sp) => sp.instanceId)
    assert(left.includes(a2) && left.includes(b2), "選んだ2体が残った")
    assert(!left.includes(a1) && !left.includes(b1), "選ばなかった2体が破壊された")
}
