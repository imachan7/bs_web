// smoke パート88（簡略化の解消：「自分か相手のスピリット1体」を両陣営から選べるようにする）
//
// 対象カード:
//   - BS03-121 ダブルハート（addSymbolThisTurn）／BS03-141 ビルドアップ（levelUpThisTurn）
//     … 従来は自分側のみ。action.anySide で両陣営から選べるようにした
//   - BS03-104 運命分かつ岐路 Lv2 ／ BS04-042 獣使いドヴェルグ Lv2-3（exhaust）
//     … 従来は相手側のみ
//   - BS02-024 ブラッディ・シーザー Lv2（destroyExhausted anySide）
//     … プールは両陣営だったが自動選択だった
//
// 候補列挙は pickAnySideCandidates（相手側には装甲・免疫を適用し、自分側には適用しない非対称ルール）。
// interactiveTargets（実対戦）ではプレイヤーが選び、テスト既定（false）では従来どおり自動選択。
import { act, assert, createGame, createInstance, currentLevel, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== ビルドアップ（levelUpThisTurn）：相手のスピリットも指定できる ===")
{
    const s = setup("buildup-anyside-test")
    s.interactiveTargets = true
    const mine = put(s, "p1", "BS01-001", 1) // ゴラドン Lv1
    const theirs = put(s, "p2", "BS01-002", 1) // ロクケラトプス Lv1

    resolveAction(s, "p1", null, { type: "levelUpThisTurn", anySide: true }, undefined, undefined, "magic")
    assert(s.pendingChoice !== null, "両陣営が候補になり選択待ちが立つ")
    const cands = s.pendingChoice?.candidates ?? []
    assert(cands.includes(mine.instanceId), "自分のスピリットが候補に入る")
    assert(cands.includes(theirs.instanceId), "相手のスピリットも候補に入る")

    assert(act(s, "p1", { type: "resolveChoice", instanceId: theirs.instanceId }) === null, "相手のスピリットを選ぶ")
    assert(currentLevel(theirs).level === 2, "相手のスピリットのLvが上がる")
    assert(currentLevel(mine).level === 1, "自分のスピリットは変わらない")
}

console.log("=== ダブルハート（addSymbolThisTurn）：相手のスピリットも指定できる ===")
{
    const s = setup("doubleheart-anyside-test")
    s.interactiveTargets = true
    put(s, "p1", "BS01-001", 1)
    const theirs = put(s, "p2", "BS01-002", 1)

    resolveAction(s, "p1", null, { type: "addSymbolThisTurn", anySide: true }, undefined, undefined, "magic")
    assert(s.pendingChoice !== null, "選択待ちが立つ")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: theirs.instanceId }) === null, "相手のスピリットを選ぶ")
    assert(theirs.tempExtraSymbols === 1, "相手のスピリットにシンボルが追加される")
}

console.log("=== exhaust anySide：自分のスピリットも疲労させられる ===")
{
    const s = setup("exhaust-anyside-test")
    s.interactiveTargets = true
    const mine = put(s, "p1", "BS01-001", 1)
    const theirs = put(s, "p2", "BS01-002", 1)

    resolveAction(s, "p1", null, { type: "exhaust", count: 1, anySide: true }, undefined, undefined, "magic")
    assert(s.pendingChoice !== null, "選択待ちが立つ")
    const cands = s.pendingChoice?.candidates ?? []
    assert(cands.includes(mine.instanceId) && cands.includes(theirs.instanceId), "両陣営が候補")

    assert(act(s, "p1", { type: "resolveChoice", instanceId: mine.instanceId }) === null, "自分のスピリットを選ぶ")
    assert(mine.isRested, "自分のスピリットが疲労する")
    assert(!theirs.isRested, "相手のスピリットは疲労しない")
}

console.log("--- 非対話時（テスト既定）は従来どおり自動選択 ---")
{
    const s = setup("exhaust-anyside-auto-test")
    const mine = put(s, "p1", "BS01-001", 1) // BP1000
    const theirs = put(s, "p2", "BS01-002", 3) // ロクケラトプス Lv3（BP4000）＝実効BP最大

    resolveAction(s, "p1", null, { type: "exhaust", count: 1, anySide: true }, undefined, undefined, "magic")
    assert(s.pendingChoice === null, "選択待ちは立たない")
    assert(theirs.isRested, "実効BP最大のスピリットが自動で選ばれる")
    assert(!mine.isRested, "BPの低い自分のスピリットは選ばれない")
}

console.log("=== BS02-024 ブラッディ・シーザー Lv2：疲労破壊も両陣営から選べる ===")
{
    const s = setup("caesar-anyside-test")
    s.interactiveTargets = true
    const mine = put(s, "p1", "BS01-001", 1)
    mine.isRested = true
    const theirs = put(s, "p2", "BS01-002", 1)
    theirs.isRested = true

    resolveAction(
        s,
        "p1",
        null,
        { type: "destroyExhausted", count: 1, anySide: true },
        undefined,
        undefined,
        "spirit",
    )
    assert(s.pendingChoice !== null, "選択待ちが立つ")
    const cands = s.pendingChoice?.candidates ?? []
    assert(cands.includes(mine.instanceId) && cands.includes(theirs.instanceId), "両陣営の疲労スピリットが候補")

    assert(act(s, "p1", { type: "resolveChoice", instanceId: mine.instanceId }) === null, "自分のスピリットを選ぶ")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === mine.instanceId),
        "自分の疲労スピリットを破壊できる",
    )
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === theirs.instanceId),
        "相手のスピリットは残る",
    )
}
