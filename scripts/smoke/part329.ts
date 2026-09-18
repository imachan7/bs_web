// smoke パート329（消滅待機中のカードのシンボルは軽減に使えない。2026-09-16）
//
// バトスピ Wiki「わかりづらいルール」：破壊待機中のシンボルは軽減に使えるが、
// **消滅したカードのシンボルは使えない**。以前は破壊と消滅が同じ pendingDestruction だけを
// 立てていたため区別できず、消滅待機中も軽減に数えていた（RULES_BATSPI_WIKI.md §2）。
import { assert, createGame, createInstance, runTurnStart } from "./helpers"
import { countSymbols } from "../../shared/rules"

const s = createGame("p329", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
runTurnStart(s)
const p1 = s.players.p1
const spirit = createInstance("BS01-001", s.turn, 1) // 赤シンボル1つ
p1.field.spirits = [spirit]

console.log("=== 待機状態ごとの軽減シンボルの数 ===")
assert(countSymbols(p1, ["red"]) === 1, "通常：1")

spirit.pendingDestruction = true
assert(countSymbols(p1, ["red"]) === 1, "破壊待機：1（使える）")

spirit.pendingVanish = true
assert(countSymbols(p1, ["red"]) === 0, "消滅待機：0（使えない）")

delete spirit.pendingDestruction
assert(countSymbols(p1, ["red"]) === 1, "待機が解除されたら、残った印は無視される")

console.log("すべてのチェックに合格しました 🎉（part329）")
