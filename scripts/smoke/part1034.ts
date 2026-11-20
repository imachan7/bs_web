// smoke パート1034（AI 段階3 決定化 determinize。docs/design/AI_OPPONENT.md §9）
import { assert, createGame, runTurnStart } from "./helpers"
import { determinize } from "../../server/src/ai/determinize"

const sorted = (a: string[]) => [...a].sort().join(",")

const s = createGame("det", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
runTurnStart(s)
s.players.p2.burst = "BS01-001"
s.players.p2.burstSet = true
const before = JSON.stringify(s)
const sim = determinize(s, "p1")

assert(JSON.stringify(s) === before, "元の state は変わらない")
assert(sim !== s && sim.players.p1 !== s.players.p1, "複製である")
assert(s.players.p2.hand.length > 0 && sim.players.p2.hand.length === 0, "相手の手札が空")
for (const pid of ["p1", "p2"] as const) {
    assert(sorted(sim.players[pid].deck) === sorted(s.players[pid].deck), `${pid} のデッキは多重集合が同じ`)
}
// 40枚の順が偶然一致する確率は無視できる
assert(sim.players.p1.deck.join() !== s.players.p1.deck.join() || sim.players.p2.deck.join() !== s.players.p2.deck.join(), "デッキの順が変わる")
assert(sim.players.p2.burst === "BS01-002" && sim.players.p2.burstSet === true && s.players.p2.burst === "BS01-001", "相手のバーストは効果なしのカードに置き換わり、セットの事実は残る")
const same = (k: "hand" | "trashCards" | "life") => JSON.stringify(sim.players.p1[k]) === JSON.stringify(s.players.p1[k])
assert(same("hand") && same("trashCards") && same("life"), "自分の手札・トラッシュ・ライフは同じ")
assert(JSON.stringify(sim.players.p1.field) === JSON.stringify(s.players.p1.field), "自分の場は同じ")

console.log("すべてのチェックに合格しました 🎉（part1034）")
