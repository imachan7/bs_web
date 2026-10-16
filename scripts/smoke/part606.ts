// smoke パート606（画面に出すシンボルは、効果の増減・合体を含む今の値。2026-10-16 ユーザー依頼）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import { instanceSymbolColors } from "../../shared/rules"

const BELL = "BS01-089" // デュアルキャノン・ベル（コスト4・効果なし）
const HYO = "BS13-054" // ヒョウ・カッチュー（緑のブレイヴ・合体条件コスト4以上）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(BELL).cost === 4 && getCard(BELL).symbol.length === 1, "デュアルキャノン・ベルはコスト4・シンボル1つ")
assert(getCard(HYO).type === "brave" && getCard(HYO).symbol[0] === "green", "ヒョウ・カッチューは緑のシンボルを持つブレイヴ")

const s = createGame("p606", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
s.interactiveTargets = false
runTurnStart(s)
s.phase = "main"
const host = createInstance(BELL, s.turn, 1)
const brave = createInstance(HYO, s.turn, 1)
s.players.p1.field.spirits.push(host, brave)
refreshLevelAsOverrides(s)
const own = getCard(BELL).symbol[0]!

console.log("=== 1. 合体すると、ブレイヴのシンボルも並ぶ ===")
assert(handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, "合体できる")
assert(JSON.stringify(instanceSymbolColors(host)) === JSON.stringify([own, "green"]), `ホスト＋ブレイヴのシンボル（${instanceSymbolColors(host).join(",")}）`)

console.log("=== 2. 同じ色を1つ追加する効果（ダブルハート）は、持っている色で並ぶ ===")
host.timedExtraSymbols = 1
assert(JSON.stringify(instanceSymbolColors(host)) === JSON.stringify([own, "green", own]), `追加の1つは持っている色（${instanceSymbolColors(host).join(",")}）`)

console.log("=== 3. シンボルを固定する効果は、固定した値だけを並べる（追加は効かない） ===")
host.symbolsOverrideContinuous = ["white", "white", "white"]
assert(JSON.stringify(instanceSymbolColors(host)) === JSON.stringify(["white", "white", "white"]), `固定した白3つ（${instanceSymbolColors(host).join(",")}）`)

console.log("すべてのチェックに合格しました 🎉（part606）")
