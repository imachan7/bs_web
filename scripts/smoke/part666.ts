// smoke パート666（BS12-073 ネクサスコラプス「ネクサス2つまでを破壊する」は自分のネクサスも選べる。destroyNexus side:"either" ＋ upTo）
import { assert, createGame, createInstance, getCard, handleAction, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const COLLAPSE = "BS12-073"
const NEXUS_CARD = "BS05-065" // 青嵐の虚空（中身の効果は使わない）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(COLLAPSE).name === "ネクサスコラプス" && getCard(COLLAPSE).type === "magic", "COLLAPSEはネクサスコラプス")
    assert(getCard(NEXUS_CARD).type === "nexus", "NEXUS_CARDはネクサス")
}
const collapse = (getCard(COLLAPSE).effects.find((e) => e.kind === "magic" && e.timing === "main") as { action: EffectAction }).action

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}
function nexusesOf(s: GameState): { own: ReturnType<typeof createInstance>; foe: ReturnType<typeof createInstance> } {
    const own = createInstance(NEXUS_CARD, s.turn, 0)
    const foe = createInstance(NEXUS_CARD, s.turn, 0)
    s.players.p1.field.nexuses.push(own)
    s.players.p2.field.nexuses.push(foe)
    return { own, foe }
}

console.log("=== 1. 対話：自分と相手のネクサスを1つずつ選んで破壊できる ===")
{
    const s = game("p666-both", true)
    const { own, foe } = nexusesOf(s)
    resolveAction(s, "p1", null, collapse)
    assert(s.pendingChoice?.candidates.includes(own.instanceId) === true && s.pendingChoice?.candidates.includes(foe.instanceId) === true, "自分と相手のネクサスが両方候補に出る")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: own.instanceId }) === null, "自分のネクサスを選ぶ")
    assert(s.pendingChoice?.candidates.includes(foe.instanceId) === true, "2つ目の候補に相手のネクサスが残る")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: foe.instanceId }) === null, "相手のネクサスを選ぶ")
    assert(s.players.p1.field.nexuses.length === 0 && s.players.p2.field.nexuses.length === 0, "両方破壊された")
}

console.log("=== 2. 対話：選ばずに終えられる ===")
{
    const s = game("p666-skip", true)
    nexusesOf(s)
    resolveAction(s, "p1", null, collapse)
    assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, "選ばずに終える")
    assert(s.players.p1.field.nexuses.length === 1 && s.players.p2.field.nexuses.length === 1, "何も破壊されない")
}

console.log("すべてのチェックに合格しました 🎉（part666）")
