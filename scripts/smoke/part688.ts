// smoke パート688（ネクサスの「破壊されない」：効果では対象に選べて破壊されないだけ、コストでは払えない。相手の効果限定の耐性は自分の効果・ブレイヴの効果を止めない。EFFECT_GATE §4 の 5b・Q1711）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardType, EffectAction } from "../../server/src/type"

const ODIN = "BS01-X04" // 要塞皇オーディーン：Lv2･Lv3 お互いのネクサスすべては破壊されない
const ALDAS = "BS05-051" // 巨人騎士アルダス：自分のネクサスすべては相手のスピリット/ネクサス/マジックの効果では破壊されない
const NEXUS = "BS01-099" // 百識の谷

console.log("=== 前提 ===")
{
    assert(getCard(ODIN).name === "要塞皇オーディーン" && getCard(ODIN).levels[1]!.cores === 3, "ODINはLv2コア3")
    assert(getCard(ALDAS).name === "巨人騎士アルダス" && getCard(ALDAS).levels[0]!.cores === 1, "ALDASはLv1コア1")
    assert(getCard(NEXUS).type === "nexus", "NEXUSはネクサス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    if (getCard(cardId).type === "nexus") s.players[pid].field.nexuses.push(inst)
    else s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const has = (s: GameState, pid: PlayerId, id: string) => s.players[pid].field.nexuses.some((n) => n.instanceId === id)
const destroyNexus = (side?: "own"): EffectAction => ({ type: "destroy", nexus: "only", count: 1, ...(side ? { side } : {}) }) as EffectAction
const run = (s: GameState, pid: PlayerId, a: EffectAction, srcType: CardType) => resolveAction(s, pid, null, a, undefined, ["red"], srcType)

console.log("=== 1. オーディーン：相手のネクサスを破壊する効果でも破壊されない（対照：いなければ破壊される） ===")
for (const odin of [true, false]) {
    const s = game(`odin-${odin}`)
    if (odin) put(s, "p2", ODIN, 3)
    const nx = put(s, "p2", NEXUS, 0)
    run(s, "p1", destroyNexus(), "magic")
    assert(has(s, "p2", nx.instanceId) === odin, odin ? "破壊されない" : "破壊される")
}

console.log("=== 2. オーディーン：「自分のネクサスを破壊することで」は払えず、後半も起きない ===")
for (const odin of [true, false]) {
    const s = game(`odin-cost-${odin}`)
    if (odin) put(s, "p1", ODIN, 3)
    const nx = put(s, "p1", NEXUS, 0)
    const hand = s.players.p1.hand.length
    run(s, "p1", { type: "pay", cost: destroyNexus("own"), then: { type: "draw", count: 1 } } as EffectAction, "spirit")
    assert(has(s, "p1", nx.instanceId) === odin, odin ? "ネクサスは残る" : "ネクサスを破壊して払う")
    assert(s.players.p1.hand.length === hand + (odin ? 0 : 1), odin ? "ドローしない" : "ドローする")
}

console.log("=== 3. アルダス：相手のスピリットの効果では破壊されないが、ブレイヴの効果と自分の効果では破壊される ===")
{
    const s = game("aldas-spirit")
    put(s, "p2", ALDAS, 1)
    const nx = put(s, "p2", NEXUS, 0)
    run(s, "p1", destroyNexus(), "spirit")
    assert(has(s, "p2", nx.instanceId), "相手のスピリットの効果では破壊されない")
}
{
    const s = game("aldas-brave")
    put(s, "p2", ALDAS, 1)
    const nx = put(s, "p2", NEXUS, 0)
    run(s, "p1", destroyNexus(), "brave")
    assert(!has(s, "p2", nx.instanceId), "相手のブレイヴの効果では破壊される（効果文に無い）")
}
{
    const s = game("aldas-own")
    put(s, "p2", ALDAS, 1)
    const nx = put(s, "p2", NEXUS, 0)
    run(s, "p2", destroyNexus("own"), "spirit")
    assert(!has(s, "p2", nx.instanceId), "自分の効果では破壊される")
}

console.log("すべてのチェックに合格しました 🎉（part688）")
