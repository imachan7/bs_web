// smoke パート769（「アタックできるとき、必ずアタックする」は、実際にアタック宣言できないならターン終了を止めない。fuzz seed=187 の詰み）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const DISASTER = "BS01-033" // ディザスター：Lv2･Lv3 アタックできるとき、必ずアタックする
const PORT = "BS13-071" // 巨人港：自分／相手のスピリットが3体以下のとき、アタックできない

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(DISASTER).name === "ディザスター" && getCard(DISASTER).levels[1]!.cores === 3, "DISASTERはLv2がコア3個")
    assert(getCard(PORT).name === "巨人港" && getCard(PORT).type === "nexus", "PORTは巨人港（ネクサス）")
}

function game(withPort: boolean): GameState {
    const s = createGame("part769", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.reserve = 5
    s.players.p1.field.spirits.push(createInstance(DISASTER, s.turn, 3))
    if (withPort) s.players.p2.field.nexuses.push(createInstance(PORT, s.turn, 0))
    refreshLevelAsOverrides(s)
    return s
}

console.log("=== 1. 巨人港でアタックできないなら、ターンを終了できる ===")
{
    const s = game(true)
    const id = s.players.p1.field.spirits[0]!.instanceId
    assert(handleAction(s, "p1", { type: "attack", instanceId: id }) !== null, "テスト前提: 自分のスピリットが1体なのでアタックできない")
    assert(handleAction(s, "p1", { type: "endTurn" }) === null, "アタックできないので、必ずアタックする効果はターン終了を止めない")
}

console.log("=== 2. 対照：アタックできるなら、ターン終了は止められる ===")
{
    const s = game(false)
    const err = handleAction(s, "p1", { type: "endTurn" })
    assert(err !== null && err.includes("必ずアタック"), `アタックできるので、ターンを終了できない（${err}）`)
}

console.log("すべてのチェックに合格しました 🎉（part769）")
