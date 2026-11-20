// smoke パート1028（#631 効果耐性 immuneToEffects from:"own"/"any" が、自分の効果の候補・「すべて」にも届かない）
import { assert, bpBuffOf, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance, EffectAction } from "../../server/src/type"

const X015 = "X015" // 放浪者ロロ（このスピリット以外の一切の効果を受けない＝any＋exceptSelf）
const AMA = "BS55-XX01" // アマテラス・ドラゴン（一切の効果を受けない＝any）
const HILD = "BS04-043" // ワルキューレ・ヒルド（相手の効果だけ受けない＝opponent）
const VAN = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(X015).name === "放浪者ロロ" && getCard(AMA).name === "絶対なる幻龍神アマテラス・ドラゴン", "X015・アマテラス")
    assert(getCard(HILD).name === "ワルキューレ・ヒルド" && getCard(VAN).name === "ロクケラトプス", "ヒルド・バニラ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VAN)
    s.players.p2.deck = Array.from({ length: 40 }, () => VAN)
    s.players.p2.field.spirits.length = 0
    return s
}
function put(s: GameState, cardId: string, rested: boolean): CardInstance {
    const inst = createInstance(cardId, s.turn - 1, 3)
    inst.isRested = rested
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const gone = (s: GameState, i: CardInstance): boolean => !s.players.p1.field.spirits.some((x) => x.instanceId === i.instanceId)

interface Probe {
    name: string
    action: EffectAction
    rested: boolean // 開始時の状態
    reached: (s: GameState, i: CardInstance) => boolean
}
const probes: Probe[] = [
    { name: "回復（単体）", action: { type: "refresh" }, rested: true, reached: (_s, i) => !i.isRested },
    { name: "回復（すべて）", action: { type: "refresh", all: true }, rested: true, reached: (_s, i) => !i.isRested },
    { name: "疲労（自分か相手の1体）", action: { type: "exhaust", count: 1, anySide: true }, rested: false, reached: (_s, i) => i.isRested },
    { name: "破壊（自分か相手の1体）", action: { type: "destroy", count: 1, anySide: true }, rested: false, reached: gone },
    { name: "破壊（自分か相手のすべて）", action: { type: "destroy", count: 1, all: true, anySide: true }, rested: false, reached: gone },
    { name: "BP+2000（両者すべて）", action: { type: "timedEffect", content: [{ type: "bp", amount: 2000 }], duration: "turn", side: "both" }, rested: false, reached: (s, i) => bpBuffOf(s, i) > 0 },
    { name: "BP+2000（自分のスピリット）", action: { type: "timedEffect", content: [{ type: "bp", amount: 2000 }], duration: "turn", side: "own" }, rested: false, reached: (s, i) => bpBuffOf(s, i) > 0 },
    { name: "疲労（自分か相手のすべて）", action: { type: "exhaust", count: 1, all: true, anySide: true }, rested: false, reached: (_s, i) => i.isRested },
    { name: "破壊（自分のすべて）", action: { type: "destroy", count: 1, all: true, side: "own" }, rested: false, reached: gone },
    { name: "手札に戻す（自分か相手の1体）", action: { type: "return", to: "hand", count: 1, anySide: true }, rested: false, reached: gone },
    { name: "コア除去（自分か相手の1体）", action: { type: "removeCores", side: "any", count: 1 }, rested: false, reached: (_s, i) => i.cores < 3 },
]

// 受けない＝届かない。ヒルドは相手の効果だけ受けないので自分の効果は届く（従来どおり）
const cases: [string, boolean][] = [[X015, false], [AMA, false], [HILD, true], [VAN, true]]
for (const p of probes) {
    console.log(`=== ${p.name}：自分のマジックの効果 ===`)
    for (const [cardId, expected] of cases) {
        const s = game(`p-${p.name}-${cardId}`)
        const t = put(s, cardId, p.rested)
        resolveAction(s, "p1", null, p.action, undefined, undefined, "magic")
        assert(p.reached(s, t) === expected, `${getCard(cardId).name}に${expected ? "届く" : "届かない"}`)
    }
}

console.log("=== X015 自身の効果は X015 に届く（exceptSelf） ===")
{
    const s = game("self")
    const t = put(s, X015, true)
    resolveAction(s, "p1", t, { type: "refresh", target: "self" }, undefined, undefined, "spirit")
    assert(!t.isRested, "X015 の効果で X015 が回復する")
}

console.log("=== 相手の効果も届かない（既存） ===")
{
    const s = game("opp")
    const t = put(s, X015, false)
    resolveAction(s, "p2", null, { type: "destroy", count: 1, all: true, anySide: true }, undefined, undefined, "magic")
    assert(!gone(s, t), "相手の破壊は X015 に届かない")
}

console.log("=== 数える効果にはアマテラスも含む（ユーザー決定） ===")
{
    const s = game("count")
    const v = put(s, VAN, false)
    put(s, AMA, false)
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", v, { type: "draw", count: 1, countCounter: "ownOtherSpirits" }, undefined, undefined, "spirit")
    assert(s.players.p1.hand.length - before === 1, "自分のほかのスピリット1体（アマテラス）につき1枚引く")
}

console.log("すべてのチェックに合格しました 🎉（part1028）")
