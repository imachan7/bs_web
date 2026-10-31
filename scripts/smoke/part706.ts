// smoke パート706（ブロックまわりの制約を filter 1本に寄せた後の挙動：docs/design/FILTER_UNIFY.md 2-3・2-4・2-7）
//   TargetFilter の cost.notIn／maxLevelAsSelf、noRestWhenBlocking{filter, oncePerTurn} の4枚
import { act, assert, createGame, createInstance, declareBlock, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"
import { matchesTarget, resolveSelfRelative } from "../../shared/rules"

const CARDS = loadAllCards()

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string][] = [
        ["BS02-X07", "巨神機トール"], ["BS07-048", "シルバー・ゴレム"], ["BS07-065", "造兵工房"],
        ["BS07-062", "ブリシンガメンの首飾り"], ["BS01-002", "ロクケラトプス"], ["BS01-031", "デス・ハーデス"],
        ["BS02-014", "ファンタズマ"],
    ]
    for (const [id, name] of expect) assert(getCard(id).name === name, `${id}は${name}`)
    assert(getCard("BS02-X07").colors.includes("white"), "トールは白")
    assert(getCard("BS01-002").colors.includes("red") && getCard("BS02-014").colors.includes("purple"), "ロクケラトプスは赤・ファンタズマは紫")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): void {
    s.players[pid].field.nexuses.push(createInstance(cardId, s.turn, cores))
}
// p1 がアタックし p2 がブロックを宣言した直後（疲労はこの時点で確定する）の、ブロッカーの疲労状態
function blockedRested(s: GameState, attackerId: string, blockerId: string): boolean {
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attackerId }) === null, "p1がアタック")
    assert(declareBlock(s, "p2", blockerId) === null, "p2がブロック")
    return s.players.p2.field.spirits.find((x) => x.instanceId === blockerId)!.isRested
}
const vanilla = (pred: (c: ReturnType<typeof getCard>) => boolean): string =>
    CARDS.find((c) => c.type === "spirit" && c.effects.length === 0 && (c.levels?.[0]?.cores ?? 99) === 1 && pred(c))!.cardId

console.log("=== cost.notIn：付与コスト込みでどのコストも一致しない ===")
{
    const s = game("notin")
    const t = put(s, "p2", "BS01-031", 4) // コスト3
    assert(matchesTarget(s, "p2", t, { cost: { notIn: [8] } }), "コスト3は notIn[8] に合う")
    assert(!matchesTarget(s, "p2", t, { cost: { notIn: [3, 8] } }), "コスト3は notIn[3,8] に合わない")
    t.tempAlsoCosts = [8]
    assert(!matchesTarget(s, "p2", t, { cost: { notIn: [8] } }), "「コスト8としても扱う」付与があれば notIn[8] に合わない")
}

console.log("=== maxLevelAsSelf：Lv が self 以下 ===")
{
    const s = game("lvself")
    const self = put(s, "p1", "BS01-002", 2) // Lv2
    const lv1 = put(s, "p2", "BS01-002", 1)
    const lv2 = put(s, "p2", "BS01-002", 2)
    const lv3 = put(s, "p2", "BS01-002", 3)
    const f = { maxLevelAsSelf: true } as const
    assert(matchesTarget(s, "p2", lv1, f, self.instanceId) && matchesTarget(s, "p2", lv2, f, self.instanceId), "Lv1・Lv2 は self(Lv2) 以下")
    assert(!matchesTarget(s, "p2", lv3, f, self.instanceId), "Lv3 は合わない")
    assert(!matchesTarget(s, "p2", lv1, f), "self が分からなければ対象なし")
    const r = resolveSelfRelative(f, self)
    assert(matchesTarget(s, "p2", lv2, r) && !matchesTarget(s, "p2", lv3, r), "resolveSelfRelative 後も同じ判定")
}

console.log("=== BS02-X07 巨神機トール：赤をブロックしても疲労しない ===")
{
    const redAtk = vanilla((c) => c.colors.length === 1 && c.colors[0] === "red")
    const purpleAtk = vanilla((c) => c.colors.length === 1 && c.colors[0] === "purple")
    const s = game("thor-red")
    const b = put(s, "p2", "BS02-X07", 2)
    assert(!blockedRested(s, put(s, "p1", redAtk, 1).instanceId, b.instanceId), "赤のアタッカーなら疲労しない")
    const s2 = game("thor-purple")
    const b2 = put(s2, "p2", "BS02-X07", 2)
    assert(blockedRested(s2, put(s2, "p1", purpleAtk, 1).instanceId, b2.instanceId), "紫のアタッカーなら疲労する")
}

console.log("=== BS07-048 シルバー・ゴレム：コスト3以下をブロックしても疲労しない ===")
{
    const cheap = vanilla((c) => c.cost <= 3)
    const big = vanilla((c) => c.cost >= 4)
    const s = game("golem-cheap")
    assert(!blockedRested(s, put(s, "p1", cheap, 1).instanceId, put(s, "p2", "BS07-048", 3).instanceId), "コスト3以下なら疲労しない")
    const s2 = game("golem-big")
    assert(blockedRested(s2, put(s2, "p1", big, 1).instanceId, put(s2, "p2", "BS07-048", 3).instanceId), "コスト4以上なら疲労する")
}

console.log("=== BS07-065 造兵工房：造兵のスピリットは同じコストの相手をブロックしても疲労しない ===")
{
    const worker = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes("造兵") && c.cardId !== "BS07-048" && c.effects.every((e) => e.kind !== "constraint"))!
    const same = vanilla((c) => c.cost === worker.cost)
    const diff = vanilla((c) => c.cost !== worker.cost)
    const s = game("kobo-same")
    putNexus(s, "p2", "BS07-065", 2)
    assert(!blockedRested(s, put(s, "p1", same, 1).instanceId, put(s, "p2", worker.cardId, 1).instanceId), "同じコストなら疲労しない")
    const s2 = game("kobo-diff")
    putNexus(s2, "p2", "BS07-065", 2)
    assert(blockedRested(s2, put(s2, "p1", diff, 1).instanceId, put(s2, "p2", worker.cardId, 1).instanceId), "違うコストなら疲労する")
}

console.log("=== BS07-062 ブリシンガメンの首飾り：【転召】を持たない相手なら疲労しない（ターンに1回） ===")
{
    const plain = vanilla((c) => c.cost <= 2)
    const tensho = CARDS.find((c) => c.type === "spirit" && (c.levels?.[0]?.cores ?? 99) === 1 && c.effects.some((e) => e.kind === "keyword" && e.keyword === "tensho" && (e.levels ?? [1]).includes(1)))!.cardId
    const s = game("neck-once")
    putNexus(s, "p2", "BS07-062", 2)
    const b1 = put(s, "p2", "BS01-031", 1)
    const b2 = put(s, "p2", "BS01-031", 1)
    const a1 = put(s, "p1", plain, 1)
    const a2 = put(s, "p1", plain, 1)
    assert(!blockedRested(s, a1.instanceId, b1.instanceId), "1回目：転召を持たない相手なら疲労しない")
    assert(act(s, "p2", { type: "pass" }) === null && act(s, "p1", { type: "pass" }) === null, "バトル解決")
    assert(act(s, "p1", { type: "attack", instanceId: a2.instanceId }) === null, "p1が2体目でアタック")
    assert(declareBlock(s, "p2", b2.instanceId) === null, "2体目でブロック")
    assert(b2.isRested, "2回目：ターンに1回を使い切っているので疲労する")
    const s2 = game("neck-tensho")
    putNexus(s2, "p2", "BS07-062", 2)
    assert(blockedRested(s2, put(s2, "p1", tensho, 1).instanceId, put(s2, "p2", "BS01-031", 1).instanceId), "転召持ちなら疲労する")
}

console.log("すべてのチェックに合格しました 🎉（part706）")
