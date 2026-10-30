// smoke パート329（待機状態のシンボルの軽減）
//
// 2026-09-16 に「消滅待機のシンボルは軽減に使えない」（旧 Wiki）として書いた。
// 2026-10-30 のルール改訂（待機状態の統一。PENDING_STATE.md §1）で、破壊・消滅・戻すのどの待機状態でも
// シンボルで軽減できるようになったので、期待値を改めた
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
assert(countSymbols(p1, ["red"]) === 1, "破壊待機：1")

spirit.pendingVanish = true
assert(countSymbols(p1, ["red"]) === 1, "消滅待機：1")

delete spirit.pendingDestruction
delete spirit.pendingVanish
spirit.pendingBounce = { to: "hand" }
assert(countSymbols(p1, ["red"]) === 1, "戻す待機：1")

console.log("すべてのチェックに合格しました 🎉（part329）")
