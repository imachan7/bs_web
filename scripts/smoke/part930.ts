// smoke パート930（BS11-063 終末描かれしキャンバス Lv1：相手のスピリットがアタックしたとき、相手は相手のスピリットのコア1個を相手のリザーブに置く。#516）
// コアを失うのはアタックした側。以前は守備側（キャンバスの持ち主）のスピリットが失い、自分のスピリットが消滅していた
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"

const CANVAS = "BS11-063"
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(CANVAS).name === "終末描かれしキャンバス" && getCard(CANVAS).type === "nexus", "CANVAS は終末描かれしキャンバス")
assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effects.length === 0, "VANILLA はバニラ")

console.log("=== 相手がアタックすると、アタックした側のスピリットのコアが1個、その持ち主のリザーブへ ===")
{
    const s = createGame("t930-canvas", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance(CANVAS, s.turn, 0))
    const mine = createInstance(VANILLA, s.turn, 1) // コア1個：失えば消滅する
    s.players.p1.field.spirits.push(mine)
    const attacker = createInstance(VANILLA, s.turn, 3)
    s.players.p2.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1 ターン終了")
    const p1Reserve = s.players.p1.reserve
    const p2Reserve = s.players.p2.reserve
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2 アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2 がアタック")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === mine.instanceId && sp.cores === 1), "キャンバスの持ち主のスピリットはコアを失わない")
    assert(s.players.p1.reserve === p1Reserve, "キャンバスの持ち主のリザーブは変わらない")
    const att = s.players.p2.field.spirits.find((sp) => sp.instanceId === attacker.instanceId)
    assert(att !== undefined && att.cores === 2, `アタックしたスピリットのコアが1個減る（実際${att?.cores}）`)
    assert(s.players.p2.reserve === p2Reserve + 1, "そのコアは相手（アタックした側）のリザーブへ")
}

console.log("すべてのチェックに合格しました 🎉（part930）")
