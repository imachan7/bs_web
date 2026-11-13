// smoke パート934（自分のフィールドのシンボルの色の集合を、シンボルの数え方 countSymbols と同じ規則で求める。#508）
// 合体しているブレイヴのシンボルと、効果で追加されたシンボルの色も入る。凱旋門の色の制限・ソウルマジックなどが読む
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import { attachBrave } from "../../server/src/logic/brave"
import { ownFieldSymbolColors } from "../../shared/cost"
import { countSymbols } from "../../shared/rules"

const HOST = "BS01-074" // バーサーカー・ガン（白シンボル・バニラ）
const RED_BRAVE = "BS11-050" // 激爪竜パワード・タスカー（赤シンボルのブレイヴ）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(HOST).name === "バーサーカー・ガン" && getCard(HOST).symbol.join() === "white", "HOST は白シンボル")
assert(getCard(RED_BRAVE).type === "brave" && getCard(RED_BRAVE).symbol.join() === "red", "RED_BRAVE は赤シンボルのブレイヴ")

console.log("=== 合体しているブレイヴのシンボルの色が入る ===")
{
    const s = createGame("t934-brave", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p1.field.nexuses = []
    const host = createInstance(HOST, s.turn, 1)
    s.players.p1.field.spirits.push(host)
    attachBrave(s, "p1", host, createInstance(RED_BRAVE, s.turn, 0))
    refreshLevelAsOverrides(s)
    assert(countSymbols(s.players.p1, ["red"]) === 1, "テスト前提: 赤シンボルは1つと数える")
    assert(ownFieldSymbolColors(s, "p1").has("red"), "色の集合にも赤が入る")
}

console.log("=== 効果で追加されたシンボルの色が入る ===")
{
    const s = createGame("t934-added", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p1.field.nexuses = []
    const host = createInstance(HOST, s.turn, 1)
    host.timedSymbolsAdded = ["red"]
    s.players.p1.field.spirits.push(host)
    assert(countSymbols(s.players.p1, ["red"]) === 1, "テスト前提: 赤シンボルは1つと数える")
    assert(ownFieldSymbolColors(s, "p1").has("red"), "色の集合にも赤が入る")
}

console.log("すべてのチェックに合格しました 🎉（part934）")
