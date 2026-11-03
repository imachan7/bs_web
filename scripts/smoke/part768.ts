// smoke パート768（操作の終わりに、効果の一時記録 lastLeftCosts・effectFizzled が残らない。audit:paths で見つかった後片づけの漏れ）
import { assert, createGame, createInstance, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"

const ROKU = "BS01-002" // ロクケラトプス（コスト1）

console.log("=== 1. 効果で破壊したスピリットのコストの記録（lastLeftCosts）は、操作が終わると消える ===")
{
    const s = createGame("part768", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p2.field.spirits.push(createInstance(ROKU, s.turn, 3))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "destroy", count: 1 })
    assert(s.lastLeftCosts !== undefined, "テスト前提: 破壊した効果がコストを記録する")
    // 選択待ちが無いときの resolveChoice は何もせず、操作の終わりの後始末だけが走る
    handleAction(s, "p1", { type: "resolveChoice" })
    assert(s.lastLeftCosts === undefined, "操作の終わりに lastLeftCosts が消える")
}

console.log("=== 2. 不発の目印（effectFizzled）は、操作が終わると消える ===")
{
    const s = createGame("part768b", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.effectFizzled = true
    handleAction(s, "p1", { type: "resolveChoice" })
    assert(s.effectFizzled === undefined, "操作の終わりに effectFizzled が消える")
}

console.log("すべてのチェックに合格しました 🎉（part768）")
