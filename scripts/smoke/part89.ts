// smoke パート89（簡略化の解消：色・系統の「指定」をプレイヤーが選べるようにする）
//
//   - BS01-140 バインディングウッズ（exhaustAllByColor）: 「色をひとつ選び」
//   - BS03-129 フロックリカバリー（refreshByFamilyAuto）: 「系統1つを指定する」
//
// どちらも従来は最多の色／系統を自動選択していた。実対戦（interactiveTargets）では
// 実在する候補から option choice で選ばせる。テスト既定（false）では従来どおり自動選択。
import { act, assert, createGame, createInstance, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
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

console.log("=== BS01-140 バインディングウッズ：疲労させる色を選べる ===")
{
    const s = setup("bindingwoods-choice-test")
    s.interactiveTargets = true
    // 相手フィールドに赤2体・紫1体 → 自動選択なら赤（最多）だが、プレイヤーは紫も選べる
    const red1 = put(s, "p2", "BS01-001", 1) // ゴラドン（赤）
    const red2 = put(s, "p2", "BS01-002", 1) // ロクケラトプス（赤）
    const purple = put(s, "p2", "BS01-031", 1) // デス・ハーデス（紫）

    resolveAction(s, "p1", null, { type: "exhaustAllByColor" }, undefined, undefined, "magic")
    assert(s.pendingChoice?.kind === "option", "色の選択待ちが立つ")
    const opts = s.pendingChoice?.options ?? []
    assert(opts.includes("赤") && opts.includes("紫"), "相手フィールドに実在する色が選択肢になる")

    assert(act(s, "p1", { type: "resolveChoice", option: "紫" }) === null, "最多ではない紫を選ぶ")
    assert(purple.isRested, "選んだ色（紫）のスピリットが疲労する")
    assert(!red1.isRested && !red2.isRested, "選ばなかった赤は疲労しない")
}

console.log("--- 非対話時は従来どおり最多の色を自動選択 ---")
{
    const s = setup("bindingwoods-auto-test")
    const red1 = put(s, "p2", "BS01-001", 1)
    const red2 = put(s, "p2", "BS01-002", 1)
    const purple = put(s, "p2", "BS01-031", 1)

    resolveAction(s, "p1", null, { type: "exhaustAllByColor" }, undefined, undefined, "magic")
    assert(s.pendingChoice === null, "選択待ちは立たない")
    assert(red1.isRested && red2.isRested, "最多の赤が自動で選ばれる")
    assert(!purple.isRested, "紫は疲労しない")
}

console.log("=== BS03-129 フロックリカバリー：回復させる系統を選べる ===")
{
    const s = setup("flockrecovery-choice-test")
    s.interactiveTargets = true
    // 疲労中の自分スピリット：殻虫2体・樹魔1体 → 自動なら殻虫だが、樹魔も選べる
    const beetle1 = put(s, "p1", "BS01-050", 1) // ビートビートル（殻虫）
    const beetle2 = put(s, "p1", "BS01-051", 1) // フライングミラージュ（殻虫）
    const treant = put(s, "p1", "BS01-054", 1) // ショックイーター（樹魔）
    for (const sp of [beetle1, beetle2, treant]) sp.isRested = true

    resolveAction(s, "p1", null, { type: "refreshByFamilyAuto", count: 3 }, undefined, undefined, "magic")
    assert(s.pendingChoice?.kind === "option", "系統の選択待ちが立つ")
    const opts = s.pendingChoice?.options ?? []
    assert(opts.includes("殻虫") && opts.includes("樹魔"), "疲労中のスピリットが持つ系統が選択肢になる")

    assert(act(s, "p1", { type: "resolveChoice", option: "樹魔" }) === null, "最多ではない樹魔を選ぶ")
    assert(!treant.isRested, "選んだ系統（樹魔）のスピリットが回復する")
    assert(beetle1.isRested && beetle2.isRested, "選ばなかった殻虫は回復しない")
}

console.log("--- 非対話時は従来どおり最多の系統を自動選択 ---")
{
    const s = setup("flockrecovery-auto-test")
    const beetle1 = put(s, "p1", "BS01-050", 1)
    const beetle2 = put(s, "p1", "BS01-051", 1)
    const treant = put(s, "p1", "BS01-054", 1)
    for (const sp of [beetle1, beetle2, treant]) sp.isRested = true

    resolveAction(s, "p1", null, { type: "refreshByFamilyAuto", count: 3 }, undefined, undefined, "magic")
    assert(s.pendingChoice === null, "選択待ちは立たない")
    assert(!beetle1.isRested && !beetle2.isRested, "最多の殻虫が自動で選ばれる")
    assert(treant.isRested, "樹魔は回復しない")
}
