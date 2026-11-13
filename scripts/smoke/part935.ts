// smoke パート935（スピリット状態のブレイヴに与えた色は、合体しても残る。#507。2026-11-14 ユーザー確認）
// 合体スピリットは1体として扱うので、ホストに与えた色と同じく、合体スピリットのシンボルをその色としても数える
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import { attachBrave } from "../../server/src/logic/brave"
import { ownFieldSymbolColors } from "../../shared/cost"
import { countSymbols, instHasColor } from "../../shared/rules"

const HOST = "BS01-002" // ロクケラトプス（赤・バニラ）
const RED_BRAVE = "BS11-050" // 激爪竜パワード・タスカー（赤シンボルのブレイヴ）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(HOST).name === "ロクケラトプス" && getCard(HOST).colors.join() === "red", "HOST は赤")
assert(getCard(RED_BRAVE).type === "brave" && getCard(RED_BRAVE).colors.join() === "red", "RED_BRAVE は赤のブレイヴ")

console.log("=== 白を与えたスピリット状態のブレイヴを合体させても、白が残る ===")
{
    const s = createGame("t935", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p1.field.nexuses = []
    const host = createInstance(HOST, s.turn, 1)
    const brave = createInstance(RED_BRAVE, s.turn, 1)
    s.players.p1.field.spirits.push(host, brave)
    // アディショナルカラーの形（このターンの間、スピリット1体にもう1色を与える）
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "color", color: "white" }], duration: "turn", count: 1, side: "own" } as never, brave.instanceId, undefined, "magic")
    refreshLevelAsOverrides(s)
    assert(instHasColor(brave, "white"), "テスト前提: スピリット状態のブレイヴが白を持つ")
    attachBrave(s, "p1", host, brave)
    assert(instHasColor(host, "white"), "合体スピリットは白を持つ")
    assert(countSymbols(s.players.p1, ["white"]) >= 1, "合体スピリットのシンボルを白としても数える")
    assert(ownFieldSymbolColors(s, "p1").has("white"), "シンボルの色の集合にも白が入る")
}

console.log("すべてのチェックに合格しました 🎉（part935）")
