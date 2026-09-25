// smoke パート332（色を指定し「指定されなかった色」を破壊する効果の多色の扱い。2026-09-17）
//
// 公式Q&A（Q3478 パラディン・ドラゴン／Q20161 マタドーラ／Q3546 メガ・テュール）：
// **指定されていない色を1つでも持てば対象**。赤白のスピリットは、赤を指定しても白で破壊される。
// 以前は「指定した色を1つでも持てば残る」判定で、BS02-010 / BS02-012 から続く器が逆になっていた。
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"

const s = createGame("p332", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
runTurnStart(s)
s.interactiveTargets = false
const redOnly = createInstance("BS01-001", s.turn, 1)
const redWhite = createInstance("BS01-001", s.turn, 1)
s.players.p2.field.spirits.push(redOnly, redWhite)
// 赤白の多色として扱う
s.timedEffects.push({ content: [{ type: "color", color: "white" }], target: { kind: "instance", instanceId: redWhite.instanceId }, until: "turn", ownerPid: "p1" })
refreshLevelAsOverrides(s)

console.log("=== マタドーラの器：相手が赤を指定しても、赤白のスピリットは白で破壊される ===")
assert(getCard("BS01-001").colors.join() === "red", "前提：BS01-001 は赤単色")
// 非対話では破壊数が最小になる色を選ぶ（同数なら色の定義順＝赤）。赤でも白でも1体ずつなので赤
resolveAction(s, "p1", null, { type: "destroyFieldExceptOpponentChosenColor" })
const alive = (id: string) => s.players.p2.field.spirits.some((x) => x.instanceId === id)
assert(alive(redOnly.instanceId), "赤単色は残る")
assert(!alive(redWhite.instanceId), "赤白は、指定されていない白を持つので破壊される")

console.log("すべてのチェックに合格しました 🎉（part332）")
