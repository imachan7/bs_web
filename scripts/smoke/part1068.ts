// smoke パート1068（#743：支払いに使えるコアの数をコアの下限込みで数える。BS12-065 大樹茂る天守閣・BS12-X03 独眼武神マンティクス・マサムネ）
// 候補の判定と画面（GameView.costSpendable）が場のコアを全部数えていて、払えないのに召喚できるように見えた
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart, viewFor } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { costSpendableField, costSpendableOn } from "../../server/src/logic/coreGate"
import { handSummonCostPayable } from "../../shared/rules"

const TENSHU = "BS12-065" // 大樹茂る天守閣（緑・ネクサス）Lv1『相手のターン』自分の緑のスピリットのコアは Lv1 コストより少なくならない
const MASAMUNE = "BS12-X03" // 独眼武神マンティクス・マサムネ（緑・スピリット）『お互いのアタックステップ』スピリットすべてのコアは Lv1 コストより少なくならない
const GREEN = "BS01-060" // イーグラス（緑・コスト3・Lv1 コア1）
const RED = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1 コア1）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TENSHU).name === "大樹茂る天守閣" && getCard(TENSHU).type === "nexus", "TENSHUは大樹茂る天守閣（ネクサス）")
    assert(getCard(MASAMUNE).name === "独眼武神マンティクス・マサムネ" && getCard(MASAMUNE).colors.includes("green"), "MASAMUNEは緑のマンティクス・マサムネ")
    assert(getCard(GREEN).name === "イーグラス" && getCard(GREEN).colors.join() === "green", "GREENは緑のイーグラス")
    assert(getCard(RED).name === "ロクケラトプス" && getCard(RED).colors.join() === "red", "REDは赤のロクケラトプス")
}

function game(seed: string, turnPlayer: PlayerId, phase: "main" | "attack"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.phase = phase
    s.players.p1.reserve = 0
    s.players.p2.reserve = 0
    return s
}

function spirit(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function nexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. 天守閣：相手のターンは、自分の緑のスピリットの維持コアを払いに使えない ===")
{
    const s = game("case1", "p2", "main")
    const tenshu = nexus(s, "p1", TENSHU, 2)
    const green = spirit(s, "p1", GREEN, 1)
    const red = spirit(s, "p1", RED, 1)
    assert(costSpendableOn(s, "p1", green) === 0, `緑のスピリット（コア1）からは0個（実際: ${String(costSpendableOn(s, "p1", green))}）`)
    assert(costSpendableOn(s, "p1", red) === 1, "赤のスピリットは天守閣の対象外なので1個")
    assert(costSpendableOn(s, "p1", tenshu) === 2, "ネクサスは下限の対象外なので2個")
    const v = viewFor(s, "p1")
    assert(v.costSpendable?.[green.instanceId] === 0 && v.costSpendable?.[tenshu.instanceId] === 2, "画面へも同じ数を渡す（GameView.costSpendable）")
    assert(viewFor(s, "p2").costSpendable?.[green.instanceId] === undefined, "相手の画面には自分の場の数を渡さない")
}

console.log("=== 2. 天守閣：自分のターンは下限が無いので、維持コアも払いに使える ===")
{
    const s = game("case2", "p1", "main")
    nexus(s, "p1", TENSHU, 2)
    const green = spirit(s, "p1", GREEN, 1)
    assert(costSpendableOn(s, "p1", green) === 1, `自分のターンは緑のスピリットからも1個（実際: ${String(costSpendableOn(s, "p1", green))}）`)
}

console.log("=== 3. マサムネ：アタックステップは、どちらの陣営のスピリットも維持コアを使えない ===")
{
    const s = game("case3", "p2", "attack")
    spirit(s, "p2", MASAMUNE, 1)
    const red = spirit(s, "p1", RED, 3)
    assert(costSpendableOn(s, "p1", red) === 2, `コア3の赤のスピリットからは維持コアを除いた2個（実際: ${String(costSpendableOn(s, "p1", red))}）`)
    const s2 = game("case3b", "p2", "main")
    spirit(s2, "p2", MASAMUNE, 1)
    const red2 = spirit(s2, "p1", RED, 3)
    assert(costSpendableOn(s2, "p1", red2) === 3, "メインステップでは3個とも使える")
}

console.log("=== 4. 効果で手札から召喚できるかの判定も、使えるコアで数える ===")
{
    const s = game("case4", "p2", "main")
    nexus(s, "p1", TENSHU, 0)
    spirit(s, "p1", GREEN, 1)
    const field = costSpendableField(s, "p1")
    assert(field === 0, `使える場のコアは0（実際: ${String(field)}）`)
    // RED はコスト1・維持1。場のコアを全部数えると1個あるので払えるように見えていた
    assert(!handSummonCostPayable(s, "p1", getCard(RED), 0, field), "使えるコアで数えると払えない")
    assert(handSummonCostPayable(viewFor(s, "p1"), "p1", getCard(RED), 0) === false, "画面側（GameView）でも払えない")
}

console.log("すべてのチェックに合格しました 🎉（part1068）")
