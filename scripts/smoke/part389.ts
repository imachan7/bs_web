// smoke パート389（寿命 nextRefresh：自分のターンに掛けた「次の相手のリフレッシュステップで」の記録は、ターン終了をまたいで相手のリフレッシュで使い切る）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart, timedHas } from "./helpers"
import { endTurn } from "../../server/src/logic/PhaseManager"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS11-055").name === "ジャノメ・シールダー", "BS11-055 はジャノメ・シールダー")
}

console.log("=== ジャノメ・シールダー：指定した相手のスピリットは、次の相手のリフレッシュステップで回復しない ===")
{
    const s = createGame("p389", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    assert(s.turnPlayer === "p1", "前提：p1 のターン")
    const target = createInstance("BS01-001", s.turn, 1)
    target.isRested = true
    const other = createInstance("BS01-002", s.turn, 1)
    other.isRested = true
    s.players.p2.field.spirits = [target, other]
    refreshLevelAsOverrides(s)
    const effect = getCard("BS11-055").effects.find((e) => JSON.stringify(e).includes("markSkipNextRefresh")) as { action: Parameters<typeof resolveAction>[3] }
    resolveAction(s, "p1", null, effect.action, target.instanceId)
    assert(timedHas(s, target, "skipRefresh"), "指定したスピリットに記録が付く")

    endTurn(s) // p1 のターン終了 → p2 のターン（リフレッシュステップ）
    assert(s.turnPlayer === "p2", "p2 のターンになった")
    assert(target.isRested, "指定されたスピリットは回復しない")
    assert(!other.isRested, "指定されていないスピリットは回復する")
    assert(!timedHas(s, target, "skipRefresh"), "記録は使い切って消える")
}

console.log("すべてのチェックに合格しました 🎉（part389）")
