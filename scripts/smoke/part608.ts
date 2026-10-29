// smoke パート608（部品バッチ7：lastBattleDestroyedBp／lifeCrush.countMax／returnToHand.countCounter／combineLimit.extraSlotSymbolless）
import { braveCombineCandidates } from "../../shared/summon"
import { assert, createGame, createInstance, effectiveBp, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const BIG = "BS02-036" // カイザレオン大帝（Lv2・7コアでBP15000）
const HOST = "BS01-002" // ロクケラトプス（コスト1・バニラ）
const SYM1_BRAVE = "BS10-063" // 飛槍獣バリ・スター（シンボル1）
const SYM0_A = "BS10-061" // 剣鎧竜バスター・ドラゴン（シンボル0）
const SYM0_B = "BS10-064" // 骸戦車ゲパルバート（シンボル0）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BIG).name === "カイザレオン大帝" && getCard(BIG).type === "spirit", "BIGはカイザレオン大帝")
    assert(getCard(HOST).name === "ロクケラトプス", "HOSTはロクケラトプス")
    assert(getCard(SYM1_BRAVE).type === "brave" && getCard(SYM1_BRAVE).symbol.length === 1, "SYM1_BRAVEはシンボル1のブレイヴ")
    assert(getCard(SYM0_A).type === "brave" && getCard(SYM0_A).symbol.length === 0, "SYM0_Aはシンボル0のブレイヴ")
    assert(getCard(SYM0_B).type === "brave" && getCard(SYM0_B).symbol.length === 0, "SYM0_Bはシンボル0のブレイヴ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 20
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => HOST)
    s.players.p2.deck = Array.from({ length: 40 }, () => HOST)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. lastBattleDestroyedBp + lifeCrush.countMax ===")
for (const [diff, expected] of [[7000, 2], [12000, 3], [2000, 0]] as const) {
    const s = game(`life${diff}`)
    const me = put(s, "p1", BIG, 7)
    const bp = effectiveBp(s, "p1", me)
    assert(bp === 15000, "BIGのBPは15000")
    s.lastBattleDestroyedBp = bp - diff
    const before = s.players.p2.life
    resolveAction(s, "p1", me, { type: "lifeCrush", count: 1, countCounter: { div: [{ minus: ["selfBp", "lastBattleDestroyedBp"] }, 3000] }, countMax: 3 })
    assert(before - s.players.p2.life === expected, `BP差${diff}で相手のライフが${expected}減る`)
}

console.log("=== 2. returnToHand.countCounter ===")
{
    const s = game("bounce")
    const braves = [SYM0_A, SYM0_B]
    const host = put(s, "p1", HOST, 1)
    host.braveRefs = []
    // 上限2のホスト（テスト内だけ共有カードデータへ制約を足す）
    getCard(HOST).effects.push(
        { id: "t608-1", kind: "constraint", levels: [1, 2, 3], constraint: { type: "combineLimit", limit: 2, extraSlotSymbolless: true } },
        { id: "t608-2", kind: "constraint", levels: [1, 2, 3], constraint: { type: "ignoreBraveCondition" } },
    )
    refreshLevelAsOverrides(s)
    for (const b of braves) {
        s.players.p1.hand = [b]
        assert(handleAction(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null, `${getCard(b).name}を合体できる`)
    }
    assert((host.braveRefs ?? []).length === 2, "ブレイヴ2つ合体")
    const o1 = put(s, "p2", HOST), o2 = put(s, "p2", HOST), o3 = put(s, "p2", HOST)
    const handBefore = s.players.p2.hand.length
    resolveAction(s, "p1", host, { type: "return", to: "hand", count: 1, countCounter: "selfBraveCount", nexus: "also" })
    assert(s.players.p2.hand.length === handBefore + 2, "相手のスピリットが2体手札に戻る")
    assert(s.players.p2.field.spirits.length === 1 && [o1, o2, o3].some((o) => s.players.p2.field.spirits.includes(o)), "1体だけ残る")

    const s0 = game("bounce0")
    const lone = put(s0, "p1", HOST, 1)
    put(s0, "p2", HOST)
    const hb = s0.players.p2.hand.length
    resolveAction(s0, "p1", lone, { type: "return", to: "hand", count: 1, countCounter: "selfBraveCount", nexus: "also" })
    assert(s0.players.p2.hand.length === hb && s0.players.p2.field.spirits.length === 1, "ブレイヴ0なら何も戻らない")
}

console.log("=== 3. combineLimit.extraSlotSymbolless ===")
{
    // 前の場面でHOSTのカードデータへ制約を足してある
    const s = game("combine")
    const host = put(s, "p1", HOST, 1)
    assert(braveCombineCandidates(s, "p1", SYM1_BRAVE).includes(host.instanceId), "1体目はシンボル1のブレイヴも候補に出る")
    s.players.p1.hand = [SYM0_A]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null, "1体目（シンボル0）が合体できる")
    assert(!braveCombineCandidates(s, "p1", SYM1_BRAVE).includes(host.instanceId), "2体目のシンボル1は候補に出ない")
    assert(braveCombineCandidates(s, "p1", SYM0_B).includes(host.instanceId), "2体目のシンボル0は候補に出る")
    s.players.p1.hand = [SYM1_BRAVE]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) !== null, "サーバーも2体目のシンボル1を拒否する")
    s.players.p1.hand = [SYM0_B]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null, "2体目のシンボル0は合体できる")
    assert((host.braveRefs ?? []).length === 2, "2体合体")
    assert(!braveCombineCandidates(s, "p1", SYM0_A).includes(host.instanceId), "上限2なので3体目は候補に出ない")
}

// 共有カードデータに足した制約を外す（同じプロセスで後に走るパートへ漏らさない）
getCard(HOST).effects.splice(0, getCard(HOST).effects.length, ...getCard(HOST).effects.filter((e) => !e.id.startsWith("t608-")))

console.log("すべてのチェックに合格しました 🎉（part608）")
