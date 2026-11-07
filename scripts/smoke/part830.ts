// smoke パート830（BS13-027 ムーンショウウオ Lv2：相手のアタックステップの間だけ、相手のスピリットの効果では自分のライフが減らされない。lifeGuard）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { lifeLossAllowed } from "../../shared/rules"

const TARGET = "BS13-027"
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TARGET).name === "ムーンショウウオ" && getCard(TARGET).type === "spirit", "TARGETはムーンショウウオ")
    assert(getCard(TARGET).levels[1]!.cores === 3, "Lv2はコア3個")
}

function game(seed: string, cores: number): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.field.spirits.push(createInstance(TARGET, s.turn, cores))
    refreshLevelAsOverrides(s)
    return s
}

// p2（相手）のスピリットの効果で p1 のライフを減らす
const byOpponentSpiritEffect = (s: GameState): number =>
    lifeLossAllowed(s, { pid: "p1", amount: 1, cause: "effect", actorPid: "p2", sourceType: "spirit", sourceInstance: createInstance(VANILLA, s.turn, 1) })

console.log("=== 1. 相手のアタックステップでは、相手のスピリットの効果でライフが減らない ===")
{
    const s = game("p830a", 3)
    s.turnPlayer = "p2"
    s.phase = "attack"
    assert(byOpponentSpiritEffect(s) === 0, "相手のアタックステップ：減らない")
}

console.log("=== 2. 相手のメインステップでは働かない ===")
{
    const s = game("p830b", 3)
    s.turnPlayer = "p2"
    s.phase = "main"
    assert(byOpponentSpiritEffect(s) === 1, "相手のメインステップ：減る")
}

console.log("=== 3. 自分のアタックステップでは働かない ===")
{
    const s = game("p830c", 3)
    s.turnPlayer = "p1"
    s.phase = "attack"
    assert(byOpponentSpiritEffect(s) === 1, "自分のアタックステップ：減る")
}

console.log("=== 4. Lv1では働かない／マジックの効果は止めない ===")
{
    const s = game("p830d", 1)
    s.turnPlayer = "p2"
    s.phase = "attack"
    assert(byOpponentSpiritEffect(s) === 1, "Lv1：減る")
    const s2 = game("p830e", 3)
    s2.turnPlayer = "p2"
    s2.phase = "attack"
    assert(lifeLossAllowed(s2, { pid: "p1", amount: 1, cause: "effect", actorPid: "p2", sourceType: "magic" }) === 1, "マジックの効果は止めない")
}

console.log("すべてのチェックに合格しました 🎉（part830）")
