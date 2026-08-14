// smoke パート187（第九弾「超星」＝青16枚・緑13枚）
//
// 新しく足した器の確認:
//   noRefreshByNexusOrMagic（鮫人サンゴジョー）/ canBlockUnblockable・unblockableOnly（炎蜥蜴クトゥグマ）/
//   destroyCostsEachOne（フォレスト・ゴレム）/ deployNexusFromTrashByFieldCores（名工集いし大工房）/
//   millThenDestroySameCost（ドラゴニックハウル）/ voidCoreToOther の色・体数（ヤミヤンマ／要塞蟲ラルバ）/
//   freeSummonFromHandOnDiscardedByOpponent（忍者サルトベ）/ coreFloorByCost.ownOnly（翡翠の社）/
//   TargetFilter.sameCostAsSelf（緑翼の大樹）/ battleBpAsLevel.side:"both"（オンザエッジ）
//
// あわせて「Lv1コスト」＝**Lv1に必要なコア数**（2026-08-14 ユーザー確認）を固定する
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { canBlock } from "../../shared/block"
import { refreshSpirit } from "../../server/src/logic/EffectModules"
import { battleBp } from "../../server/src/logic/triggers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const PLAIN = "BS01-001" // ゴラドン（赤のバニラ・BP1000・コスト1）

console.log("=== BS09-047 鮫人サンゴジョー：ネクサス/マジックの効果では回復しない ===")
{
    const s: GameState = createGame("bs09-047", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    put(s, "p1", "BS09-047", 1)
    const target = put(s, "p1", PLAIN, 1)
    target.isRested = true
    refreshSpirit(s, "p1", target, "nexus")
    assert(target.isRested, "ネクサスの効果では回復しない")
    refreshSpirit(s, "p1", target, "magic")
    assert(target.isRested, "マジックの効果でも回復しない")
    refreshSpirit(s, "p1", target, "spirit")
    assert(!target.isRested, "スピリットの効果では回復する")
}

console.log("=== BS09-049 炎蜥蜴クトゥグマ：「ブロックされない」相手もブロックできる／破壊できる ===")
{
    const s: GameState = createGame("bs09-049", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const kutu = put(s, "p1", "BS09-049", 4) // Lv3
    const attacker = put(s, "p2", PLAIN, 1)
    attacker.unblockableOnceThisTurn = true
    assert(canBlock(s, "p1", kutu, "p2", attacker) === null, "「ブロックされない」相手もブロックできる")
    const plain = put(s, "p1", PLAIN, 1)
    assert(canBlock(s, "p1", plain, "p2", attacker) !== null, "対照実験：普通のスピリットはブロックできない")
    // Lv3 のブロック時破壊は「ブロックされない」効果を持つ相手だけを対象にする
    const normal = put(s, "p2", PLAIN, 3)
    resolveAction(s, "p1", kutu, { type: "destroy", count: 1, filter: { unblockableOnly: true } })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === attacker.instanceId), "「ブロックされない」持ちが破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === normal.instanceId), "持たない相手は対象にならない")
}

console.log("=== BS09-052 フォレスト・ゴレム：コスト3と4を1体ずつ破壊 ===")
{
    const s: GameState = createGame("bs09-052", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const c3a = put(s, "p2", "BS09-049", 1) // コスト3
    const c3b = put(s, "p2", "BS09-049", 1)
    const c4 = put(s, "p2", "BS09-050", 1) // コスト4
    assert(getCard("BS09-049").cost === 3 && getCard("BS09-050").cost === 4, "前提：コスト3と4のカードを用意できる")
    resolveAction(s, "p1", null, { type: "destroyCostsEachOne", costs: [3, 4] })
    const c3alive = [c3a, c3b].filter((x) => s.players.p2.field.spirits.some((y) => y.instanceId === x.instanceId))
    assert(c3alive.length === 1, "コスト3からは1体だけ破壊される")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === c4.instanceId), "コスト4からも1体破壊される")
}

console.log("=== BS09-020 ヤミヤンマ / BS09-023 要塞蟲ラルバ：白のスピリットにだけコアを置く ===")
{
    const s: GameState = createGame("bs09-020", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const self = put(s, "p1", "BS09-020", 1)
    const white1 = put(s, "p1", "BS09-030", 1) // 白銀の守護者リン（白）
    const white2 = put(s, "p1", "BS09-030", 1)
    const green = put(s, "p1", "BS09-019", 1) // オオクチバは colorAs で白を持つ
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", self, { type: "voidCoreToOther", count: 1, colorFilter: "white" })
    const placed = [white1, white2, green].filter((x) => x.cores === 2).length
    assert(placed === 1, "白のスピリット1体にだけコアが置かれる")
    resolveAction(s, "p1", self, { type: "voidCoreToOther", count: 1, colorFilter: "white", targets: 2 })
    const placed2 = [white1, white2, green].filter((x) => x.cores >= 2).length
    assert(placed2 >= 2, "targets:2 なら2体に置かれる")
}

console.log("=== BS09-084 ドラゴニックハウル：破棄したカードと同じコストの相手をすべて破壊 ===")
{
    const s: GameState = createGame("bs09-084", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    // デッキの先頭をコスト3のカードに固定する
    s.players.p1.deck.unshift("BS09-049")
    const same1 = put(s, "p2", "BS09-049", 1) // コスト3
    const same2 = put(s, "p2", "BS09-012", 1) // ボーギー＝コスト3
    const other = put(s, "p2", "BS09-050", 1) // コスト4
    assert(getCard("BS09-012").cost === 3, "前提：もう1枚もコスト3")
    resolveAction(s, "p1", null, { type: "millThenDestroySameCost" })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === same1.instanceId), "同じコストの相手は破壊される")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === same2.instanceId), "同じコストはすべて破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === other.instanceId), "コストが違う相手は残る")
}

console.log("=== BS09-059 翡翠の社 Lv2：自分のスピリットだけ、コアはLv1コストを下回らない ===")
{
    const s: GameState = createGame("bs09-059", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "main"
    putNexus(s, "p1", "BS09-059", 2) // Lv2
    const mine = put(s, "p1", PLAIN, 6) // Lv1コスト＝1
    const theirs = put(s, "p2", PLAIN, 6)
    resolveAction(s, "p1", mine, { type: "coreRemoveSelf", count: 99 })
    assert(mine.cores === 1, "自分のスピリットはLv1コスト（1個）を下回らない")
    resolveAction(s, "p2", theirs, { type: "coreRemoveSelf", count: 99 })
    // 守られない側はコア0になり、維持コア割れで場から消える
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === theirs.instanceId), "相手のスピリットは守られない")
}

console.log("=== BS09-073 オンザエッジ：両陣営のLv1スピリットがLv2BPを使う ===")
{
    const s: GameState = createGame("bs09-073", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const mine = put(s, "p1", PLAIN, 1)
    const theirs = put(s, "p2", PLAIN, 1)
    const lv1 = getCard(PLAIN).levels[0]!.bp
    const lv2 = getCard(PLAIN).levels[1]!.bp
    assert(currentLevel(mine).level === 1, "前提：Lv1")
    assert(battleBp(s, "p2", theirs) === lv1, "前提：使用前はLv1BP")
    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined, undefined, "magic", undefined, undefined, "BS09-073")
    assert(battleBp(s, "p1", mine) === lv2, "自分のLv1スピリットはLv2BPを使う")
    assert(battleBp(s, "p2", theirs) === lv2, "相手のLv1スピリットもLv2BPを使う")
}
