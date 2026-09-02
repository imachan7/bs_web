// smoke パート275（BS11 グループC その4：合体スピリットを狙う／合体させない）
//
// - BS11-X02 滅神星龍ダークヴルム・ノヴァ：合体できない／相手の合体スピリットを指定してアタック／
//   合体スピリットとバトルしたときBP+10000
// - BS11-030 ドルフィング：相手のアタックステップ開始時、相手の合体スピリット1体をアタック不可にする
// - BS11-063 終末描かれしキャンバスLv2：自分の合体スピリットに疲労状態を狙う指定アタックを与える
import { act, assert, createGame, createInstance, effectiveBp, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave } from "../../server/src/logic/removal"
import { braveCombineCandidates } from "../../shared/summon"

const NOVA = "BS11-X02" // 滅神星龍ダークヴルム・ノヴァ（コスト7・Lv2=3コア）
const DOLPHING = "BS11-030" // ドルフィング
const CANVAS = "BS11-063" // 終末描かれしキャンバス（Lv2=3コア）
const braveCard = ALL_CARDS.find(
    (c) => c.type === "brave" && JSON.stringify(c.braveCondition) === JSON.stringify({ vanilla: true }),
)
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
assert(braveCard !== undefined && vanilla.length >= 2, "テスト前提: 合体条件バニラのブレイヴとバニラスピリットがいる")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function combined(s: GameState, pid: PlayerId, hostCardId: string, cores: number) {
    const host = createInstance(hostCardId, s.turn, cores)
    s.players[pid].field.spirits.push(host)
    const brave = createInstance(braveCard!.cardId, s.turn, 0)
    attachBrave(s, pid, host, brave)
    refreshLevelAsOverrides(s)
    return host
}

console.log("=== §A BS11-X02：このスピリットは合体できない ===")
{
    const s = game("nova-cant-combine")
    const nova = createInstance(NOVA, s.turn, 3)
    const other = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(nova, other)
    refreshLevelAsOverrides(s)
    const candidates = braveCombineCandidates(s, "p1", braveCard!.cardId)
    assert(!candidates.includes(nova.instanceId), "ノヴァは合体先の候補に出ない")
    assert(candidates.includes(other.instanceId), "他のスピリットは候補に出る")
}

console.log("=== §B BS11-X02：相手の合体スピリットしか指定アタックできない ===")
{
    const s = game("nova-directed")
    const nova = createInstance(NOVA, s.turn, 3)
    s.players.p1.field.spirits.push(nova)
    const lone = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(lone)
    const host = combined(s, "p2", vanilla[1]!.cardId, 2)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", { type: "attack", instanceId: nova.instanceId, targetSpiritInstanceId: lone.instanceId }) !== null,
        "合体していないスピリットは指定できない",
    )
    assert(
        act(s, "p1", { type: "attack", instanceId: nova.instanceId, targetSpiritInstanceId: host.instanceId }) === null,
        "合体スピリットは指定できる",
    )
    assert(s.battle?.blockerInstanceId === host.instanceId, "指定した合体スピリットがブロッカーに固定される")
}

console.log("=== §C BS11-X02 Lv2：合体スピリットとバトルしたときだけBP+10000 ===")
{
    const s = game("nova-bp")
    const nova = createInstance(NOVA, s.turn, 3) // Lv2
    s.players.p1.field.spirits.push(nova)
    const host = combined(s, "p2", vanilla[1]!.cardId, 2)
    const base = effectiveBp(s, "p1", nova)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", { type: "attack", instanceId: nova.instanceId, targetSpiritInstanceId: host.instanceId }) === null,
        "合体スピリットを指定してアタック",
    )
    assert(effectiveBp(s, "p1", nova) === base + 10000, "BP+10000される")
}
{
    const s = game("nova-bp-none")
    const nova = createInstance(NOVA, s.turn, 3)
    s.players.p1.field.spirits.push(nova)
    const lone = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(lone)
    const base = effectiveBp(s, "p1", nova)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: nova.instanceId }) === null, "通常アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: lone.instanceId }) === null, "合体していないスピリットでブロック")
    assert(effectiveBp(s, "p1", nova) === base, "合体スピリットでなければBPは上がらない")
}

console.log("=== §D BS11-030：相手のアタックステップ開始時、合体スピリット1体をアタック不可にする ===")
{
    const s = game("dolphing")
    const dolphing = createInstance(DOLPHING, s.turn, 2)
    s.players.p2.field.spirits.push(dolphing) // p2 が持ち主＝p1のアタックステップで発揮する
    const host = combined(s, "p1", vanilla[1]!.cardId, 2)
    const lone = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(lone)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ")
    assert(host.cantAttackThisTurn === true, "合体スピリットはこのターンアタックできない")
    assert(lone.cantAttackThisTurn === false, "合体していないスピリットは指定されない")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) !== null, "実際にアタックが拒否される")
}

console.log("=== §E BS11-063 Lv2：自分の合体スピリットが疲労状態の相手を指定してアタックできる ===")
{
    const s = game("canvas")
    const canvas = createInstance(CANVAS, s.turn, 3) // Lv2
    s.players.p1.field.nexuses.push(canvas)
    const host = combined(s, "p1", vanilla[1]!.cardId, 2)
    const lone = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(lone)
    const rested = createInstance(vanilla[0]!.cardId, s.turn, 2)
    rested.isRested = true
    s.players.p2.field.spirits.push(rested)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", { type: "attack", instanceId: lone.instanceId, targetSpiritInstanceId: rested.instanceId }) !== null,
        "合体していないスピリットは指定アタックできない",
    )
    assert(
        act(s, "p1", { type: "attack", instanceId: host.instanceId, targetSpiritInstanceId: rested.instanceId }) === null,
        "合体スピリットは疲労状態の相手を指定できる",
    )
}

console.log("=== §F BS11-064 Lv2：相手のスピリットが合体したとき、その合体スピリットは疲労する ===")
{
    const s = game("dark-sword")
    const sword = createInstance("BS11-064", s.turn, 3) // 闇の聖剣 Lv2
    s.players.p1.field.nexuses.push(sword)
    const host = combined(s, "p2", vanilla[1]!.cardId, 2) // 相手が合体
    assert(host.isRested === true, "相手の合体スピリットは疲労する")
}
{
    const s = game("dark-sword-own")
    const sword = createInstance("BS11-064", s.turn, 3)
    s.players.p1.field.nexuses.push(sword)
    const host = combined(s, "p1", vanilla[1]!.cardId, 2) // 自分が合体
    assert(host.isRested === false, "自分の合体スピリットは疲労しない")
}

console.log("=== §G BS11-020：召喚時、手札のブレイヴを自分に直接合体するように召喚する ===")
{
    const s = game("yamasemi")
    // 先に本体を場に出す（召喚時効果は fireSummonTrigger でなく、ここでは効果を直接呼ばずに実召喚で通す）
    // 合体条件「コスト3以上」のブレイヴを使う（ヤマセミはコスト4。バニラ条件のブレイヴは合体できない）
    const minCostBrave = ALL_CARDS.find(
        (c) => c.type === "brave" && JSON.stringify(c.braveCondition) === JSON.stringify({ minCost: 3 }),
    )
    assert(minCostBrave !== undefined, "テスト前提: 合体条件コスト3以上のブレイヴがいる")
    s.players.p1.hand = [minCostBrave!.cardId]
    const self_ = createInstance("BS11-020", s.turn, 2)
    s.players.p1.field.spirits.push(self_)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", self_, { type: "summonFromHandFree", bravesOnly: true, combineToSelf: true, payCost: true })
    assert(s.players.p1.field.combinedBraves.length === 1, "ブレイヴが召喚されて合体している")
    assert((self_.braveRefs ?? []).length === 1, "合体先は発生源自身")
    assert(s.players.p1.hand.length === 0, "手札から出ている")
}

console.log("すべてのチェックに合格しました 🎉（part275）")
