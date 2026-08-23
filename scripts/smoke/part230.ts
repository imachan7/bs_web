// smoke パート230（回復させるスピリットはプレイヤーが選ぶ。2026-08-23）
//
// refreshOne は候補が複数いても実効BP最大を自動で回復させていた（実対戦でも選べなかった）。
// 対象は25枚と、選択できない簡略化のなかで最多。interactiveTargets では選ばせるようにした。
//
// ⚠️ targetInstanceId の二重の意味に注意：
// refreshOne は onBlock / onDestroy などの**誘発からも呼ばれ**、そのとき targetInstanceId には
// イベント対象（ベル・ダンディアなら相手のアタッカー）が入る。回復対象ではない。
// そのため「選択の解決として再入した」ことを内部フラグ chosenByPlayer で区別する。
// 選択の応答は handleAction を直接呼ぶ（helpers.act は対話モードで pendingChoice を先に消化してしまい、
// 「どれを選んだか」を確かめられないため。part223 と同じ理由）
import { assert, createGame, createInstance, handleAction, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const BIG = "BS01-004" // ドラグノ偵察兵：Lv1 BP2000
const SMALL = "BS01-001" // ゴラドン：Lv1 BP1000

function putRested(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    inst.isRested = true
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

function setup(name: string, interactive: boolean): GameState {
    const s = createGame(name, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    return s
}

const isRested = (s: GameState, id: string): boolean =>
    s.players.p1.field.spirits.find((sp) => sp.instanceId === id)!.isRested

console.log("=== 候補が2体以上なら、どれを回復させるか選ばせる ===")
{
    const s = setup("refresh-choice", true)
    const big = putRested(s, "p1", BIG, 1)
    const small = putRested(s, "p1", SMALL, 1)
    resolveAction(s, "p1", null, { type: "refreshOne" })
    assert(!!s.pendingChoice, "選択待ちになる")
    assert(
        s.pendingChoice!.candidates.includes(big) && s.pendingChoice!.candidates.includes(small),
        "疲労中の2体がどちらも候補",
    )

    // BP最大（自動選択なら選ばれる方）ではなく、あえて BP の低い方を選ぶ
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: small }) === null, "BPの低い方を選ぶ")
    assert(!isRested(s, small), "選んだスピリットが回復した")
    assert(isRested(s, big), "選ばなかったスピリットは疲労のまま")
}

console.log("=== count 指定は、その体数ぶん1体ずつ選ばせる ===")
{
    const s = setup("refresh-choice-count", true)
    const a = putRested(s, "p1", BIG, 1)
    const b = putRested(s, "p1", SMALL, 1)
    const c = putRested(s, "p1", SMALL, 1)
    resolveAction(s, "p1", null, { type: "refreshOne", count: 2 })
    assert(!!s.pendingChoice, "1体目の選択待ち")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: b }) === null, "1体目を選ぶ")
    assert(!!s.pendingChoice, "2体目の選択待ちが続く")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: c }) === null, "2体目を選ぶ")
    assert(!s.pendingChoice, "2体ぶんで選択は終わる")
    assert(!isRested(s, b) && !isRested(s, c), "選んだ2体が回復した")
    assert(isRested(s, a), "選ばなかった1体は疲労のまま")
}

console.log("=== 候補が1体しかないときは聞かずに回復させる ===")
{
    const s = setup("refresh-choice-single", true)
    const only = putRested(s, "p1", BIG, 1)
    resolveAction(s, "p1", null, { type: "refreshOne" })
    assert(!s.pendingChoice, "選択待ちにならない")
    assert(!isRested(s, only), "そのまま回復した")
}

console.log("=== 非対話（テスト・自動解決）では従来どおり実効BP最大を回復させる ===")
{
    const s = setup("refresh-auto", false)
    const big = putRested(s, "p1", BIG, 1)
    const small = putRested(s, "p1", SMALL, 1)
    resolveAction(s, "p1", null, { type: "refreshOne" })
    assert(!s.pendingChoice, "選択待ちにならない")
    assert(!isRested(s, big), "BP最大が回復した")
    assert(isRested(s, small), "BPの低い方は疲労のまま")
}

console.log("=== 誘発が渡すイベント対象を、回復対象と読み違えない ===")
{
    // ベル・ダンディアの onBlock は「相手のアタッカー」を targetInstanceId として渡してくる。
    // chosenByPlayer が無いので、これは回復対象ではなく無視されなければならない
    const s = setup("refresh-trigger-target", true)
    const mine = putRested(s, "p1", BIG, 1)
    const enemy = createInstance(SMALL, s.turn, 1)
    s.players.p2.field.spirits.push(enemy)

    resolveAction(s, "p1", null, { type: "refreshOne" }, enemy.instanceId)
    assert(!isRested(s, mine), "自分の疲労スピリットが回復した（相手のアタッカーを対象と誤読していない）")
    assert(
        s.players.p2.field.spirits[0]!.instanceId === enemy.instanceId,
        "相手のスピリットには何も起きない",
    )
}
