// smoke パート86（ネクサスの手動コア移動＝レベルの上げ下げ）
//
// 従来 moveCore は findSpirit しか見ておらず、**ネクサスは配置時に指定したレベルから変えられなかった**
// （効果によるコア増減を除く）。メインステップにコアを置く／戻すでレベルを上下できるようにした。
// ネクサスの Lv1 は全カード0コアのため、既存の維持コア判定でそのまま0まで戻せる。
import { act, assert, createGame, createInstance, currentLevel } from "./helpers"
import type { GameState } from "./helpers"

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 5
    s.players.p2.reserve = 5
    return s
}

console.log("=== ネクサスにコアを置いてレベルを上げられる ===")
{
    const s = setup("nexus-corelevel-test")
    const nexus = createInstance("BS01-098", s.turn, 0) // 燃えさかる戦場（Lv1=0 / Lv2=2コア）
    s.players.p1.field.nexuses.push(nexus)
    assert(currentLevel(nexus).level === 1, "配置直後はLv1")

    assert(act(s, "p1", { type: "moveCore", instanceId: nexus.instanceId, direction: "add" }) === null, "コアを1個置く")
    assert(act(s, "p1", { type: "moveCore", instanceId: nexus.instanceId, direction: "add" }) === null, "コアをもう1個置く")
    assert(nexus.cores === 2, "ネクサスのコアが2個になる")
    assert(currentLevel(nexus).level === 2, "Lv2になる")
    assert(s.players.p1.reserve === 3, "リザーブから2個減る")
}

console.log("--- コアを戻してレベルを下げられる（0まで戻せる） ---")
{
    const s = setup("nexus-coredown-test")
    const nexus = createInstance("BS01-098", s.turn, 2)
    s.players.p1.field.nexuses.push(nexus)
    assert(currentLevel(nexus).level === 2, "Lv2から開始")

    assert(act(s, "p1", { type: "moveCore", instanceId: nexus.instanceId, direction: "remove" }) === null, "コアを1個戻す")
    assert(currentLevel(nexus).level === 1, "Lv1に下がる")
    assert(act(s, "p1", { type: "moveCore", instanceId: nexus.instanceId, direction: "remove" }) === null, "もう1個戻す")
    assert(nexus.cores === 0, "コア0個まで戻せる（ネクサスのLv1は0コア）")
    assert(s.players.p1.reserve === 7, "戻したコアがリザーブへ")

    assert(
        act(s, "p1", { type: "moveCore", instanceId: nexus.instanceId, direction: "remove" }) !== null,
        "コアが無いネクサスからはこれ以上戻せない",
    )
}

console.log("--- メインステップ以外・相手のネクサスは操作できない ---")
{
    const s = setup("nexus-core-timing-test")
    const nexus = createInstance("BS01-098", s.turn, 0)
    s.players.p1.field.nexuses.push(nexus)
    const oppNexus = createInstance("BS01-098", s.turn, 0)
    s.players.p2.field.nexuses.push(oppNexus)

    s.phase = "attack"
    assert(
        act(s, "p1", { type: "moveCore", instanceId: nexus.instanceId, direction: "add" }) !== null,
        "アタックステップでは操作できない",
    )
    s.phase = "main"
    assert(
        act(s, "p1", { type: "moveCore", instanceId: oppNexus.instanceId, direction: "add" }) !== null,
        "相手のネクサスは操作できない",
    )
}

console.log("--- 夢魔の寝所（コアを増やしたスピリットを疲労させる）はネクサスには反応しない ---")
{
    const s = setup("nexus-core-nemuri-test")
    // 相手（p2）のフィールドに夢魔の寝所 Lv1。効果は『相手のメインステップ』＝p1のメインステップに効く
    const bed = createInstance("BS02-078", s.turn, 0)
    s.players.p2.field.nexuses.push(bed)

    const myNexus = createInstance("BS01-098", s.turn, 0)
    s.players.p1.field.nexuses.push(myNexus)
    const mySpirit = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(mySpirit)

    assert(act(s, "p1", { type: "moveCore", instanceId: myNexus.instanceId, direction: "add" }) === null, "ネクサスにコアを置く")
    assert(!myNexus.isRested, "ネクサスは疲労しない（効果の対象はスピリット）")

    assert(act(s, "p1", { type: "moveCore", instanceId: mySpirit.instanceId, direction: "add" }) === null, "スピリットにコアを置く")
    assert(mySpirit.isRested, "スピリットは従来どおり疲労する")
}
