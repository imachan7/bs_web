// smoke パート93（pendingChoice の一般化：選択者と実行者を分離する）
//
// 従来 pendingChoice は「選択したプレイヤー＝続きを実行するプレイヤー」の前提だったため、
// **相手に選ばせて自分の効果として解決する**カードが実装できなかった。
// PendingChoice.actorPid（と queue の actorPid）を追加してこの前提を外した。
//
//   - BS02-012 地龍王ケンドラゴス: 「お互い、自分のフィールドに出ているスピリットの色を1色指定する。
//     指定されなかった色のスピリットすべてを破壊する」
//     … 自分 → 相手 の順に色を選び、破壊は発生源の持ち主の効果として解決する
import { act, assert, createGame, createInstance, resolveAction } from "./helpers"
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

const alive = (s: GameState, pid: PlayerId, inst: ReturnType<typeof createInstance>): boolean =>
    s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)

console.log("=== BS02-012 ケンドラゴス：お互いが自分のフィールドから残す色を1色ずつ指定する ===")
{
    const s = setup("kendragos-choice-test")
    s.interactiveTargets = true
    // p1（発生源の持ち主）：赤と緑
    const myRed = put(s, "p1", "BS01-001", 1) // ゴラドン（赤）
    const myGreen = put(s, "p1", "BS01-050", 1) // ビートビートル（緑）
    // p2：紫と白
    const oppPurple = put(s, "p2", "BS01-031", 1) // デス・ハーデス（紫）
    const oppWhite = put(s, "p2", "BS02-040", 1) // ロブスターク（白）

    resolveAction(s, "p1", null, { type: "destroyAllExceptChosenColors" }, undefined, undefined, "spirit")

    // 1段目：発生源の持ち主が選ぶ
    assert(s.pendingChoice?.pid === "p1", "まず発生源の持ち主が色を選ぶ")
    assert((s.pendingChoice?.options ?? []).includes("緑"), "自分のフィールドに実在する色が選択肢")
    assert(act(s, "p1", { type: "resolveChoice", option: "緑" }) === null, "p1は緑を残す")

    // 2段目：相手が選ぶ（＝選択者が切り替わる）
    assert(s.pendingChoice?.pid === "p2", "続いて相手が自分の色を選ぶ")
    assert(s.pendingChoice?.actorPid === "p1", "実行者は発生源の持ち主のまま")
    assert((s.pendingChoice?.options ?? []).includes("白"), "相手のフィールドに実在する色が選択肢")
    assert(act(s, "p2", { type: "resolveChoice", option: "白" }) === null, "p2は白を残す")

    assert(s.pendingChoice === null, "選択が終わって解決される")
    assert(alive(s, "p1", myGreen), "p1が指定した緑は残る")
    assert(!alive(s, "p1", myRed), "指定されなかった赤は破壊される")
    assert(alive(s, "p2", oppWhite), "p2が指定した白は残る")
    assert(!alive(s, "p2", oppPurple), "指定されなかった紫は破壊される")
}

console.log("--- 相手の選択待ち中は、相手以外のアクションは通らない ---")
{
    const s = setup("kendragos-turnorder-test")
    s.interactiveTargets = true
    put(s, "p1", "BS01-001", 1)
    put(s, "p1", "BS01-050", 1)
    put(s, "p2", "BS01-031", 1)
    put(s, "p2", "BS02-040", 1)

    resolveAction(s, "p1", null, { type: "destroyAllExceptChosenColors" }, undefined, undefined, "spirit")
    assert(act(s, "p1", { type: "resolveChoice", option: "緑" }) === null, "p1が選ぶ")
    assert(s.pendingChoice?.pid === "p2", "相手の選択待ちになる")
    assert(
        act(s, "p1", { type: "resolveChoice", option: "白" }) !== null,
        "選択者でないp1は解決できない",
    )
}

console.log("--- 片方のフィールドに色が1種類しかなければ、その側の選択は挟まない ---")
{
    const s = setup("kendragos-single-test")
    s.interactiveTargets = true
    const myRed = put(s, "p1", "BS01-001", 1) // 赤のみ
    const oppPurple = put(s, "p2", "BS01-031", 1) // 紫のみ
    const oppWhite = put(s, "p2", "BS02-040", 1) // 白（＝相手は2色）

    resolveAction(s, "p1", null, { type: "destroyAllExceptChosenColors" }, undefined, undefined, "spirit")
    assert(s.pendingChoice?.pid === "p2", "自分は1色なので選択を挟まず、相手の選択から始まる")
    assert(act(s, "p2", { type: "resolveChoice", option: "紫" }) === null, "p2は紫を残す")
    assert(alive(s, "p1", myRed), "自分の唯一の色（赤）は自動で指定され残る")
    assert(alive(s, "p2", oppPurple), "p2が指定した紫は残る")
    assert(!alive(s, "p2", oppWhite), "指定されなかった白は破壊される")
}

console.log("--- 非対話時（テスト既定）は従来どおり最多の色を自動指定 ---")
{
    const s = setup("kendragos-auto-test")
    const myRed1 = put(s, "p1", "BS01-001", 1)
    const myRed2 = put(s, "p1", "BS01-002", 1)
    const myGreen = put(s, "p1", "BS01-050", 1)
    const oppPurple = put(s, "p2", "BS01-031", 1)

    resolveAction(s, "p1", null, { type: "destroyAllExceptChosenColors" }, undefined, undefined, "spirit")
    assert(s.pendingChoice === null, "選択待ちは立たない")
    assert(alive(s, "p1", myRed1) && alive(s, "p1", myRed2), "最多の赤が自動指定され残る")
    assert(!alive(s, "p1", myGreen), "指定されなかった緑は破壊される")
    assert(alive(s, "p2", oppPurple), "相手側も最多（紫）が自動指定され残る")
}
