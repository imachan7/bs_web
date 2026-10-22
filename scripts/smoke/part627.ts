// smoke パート627（陣営の書かれていない「スピリット1体をBP+」は自分・相手どちらのスピリットも選べる。BS01〜BS10・SD01 の115枚）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const DOUBLE = "BS01-117" // ダブルドロー（フラッシュ：このターンの間、スピリット1体をBP+2000）
const VANILLA = "BS01-002" // ロクケラトプス

assert(getCard(DOUBLE).name === "ダブルドロー", "DOUBLEはダブルドロー")
assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.hand = [DOUBLE]
    return s
}
const buffed = (s: GameState, id: string): boolean => s.timedEffects.some((r) => r.target.kind === "instance" && r.target.instanceId === id)

console.log("=== 自分のスピリットがいなくても、相手のスピリットを対象に使える ===")
{
    const s = game("unsided-opp-only", false)
    const enemy = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "使用できる")
    assert(buffed(s, enemy.instanceId), "相手のスピリットがBP+される")
}

console.log("=== 両方にいれば、どちらのスピリットも候補になる ===")
{
    const s = game("unsided-both", true)
    const ally = createInstance(VANILLA, s.turn, 1)
    const enemy = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(ally)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "使用できる")
    const pc = s.pendingChoice
    assert(pc !== null && pc.candidates.includes(ally.instanceId) && pc.candidates.includes(enemy.instanceId), "自分と相手のスピリットが候補")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: enemy.instanceId }) === null, "相手のスピリットを選ぶ")
    assert(buffed(s, enemy.instanceId) && !buffed(s, ally.instanceId), "選んだスピリットだけBP+される")
}

console.log("=== 自動で選ぶときは自分のスピリットを優先する ===")
{
    const s = game("unsided-auto", false)
    const ally = createInstance(VANILLA, s.turn, 1)
    const enemy = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(ally)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "使用できる")
    assert(buffed(s, ally.instanceId) && !buffed(s, enemy.instanceId), "自分のスピリットがBP+される")
}

console.log("すべてのチェックに合格しました 🎉（part627）")
