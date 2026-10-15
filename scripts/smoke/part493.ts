// smoke パート493(ソウルコア段5: 条件軸 TargetFilter.soulCore ＋ placeSoulCore効果 ＋ swapSoulCore 1:1交換)
// 仕様(docs/design/SOULCORE.md 部品4/5・2026-10-05):
//   - TargetFilter に「[ソウルコア]が載っている/載っていない」軸（対象選択の絞り込みで使う）
//   - placeSoulCore: [ソウルコア]を自分の個体に置く効果（「自分のトラッシュの[ソウルコア]をそれに置く」等）。
//     ソウルコアが指定元にないときは不発。置いた個体にはコア増加の誘発が効く
//   - swapSoulCore: メインステップの1:1交換。「[ソウルコア]1個と通常コア1個」を同時に交換し、消滅判定は挟まない
import {
    act,
    assert,
    assertSoulCoreConsistent,
    createGame,
    createInstance,
    enableSoulCore,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import { matchesTarget } from "../../shared/rules"
import { moveSoulCore, soulCoreInReserve, soulCoreOnInstance } from "../../server/src/logic/soulCore"
import type { GameState } from "./helpers"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1維持コア1）

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.turnPlayer = "p1"
    s.phase = "main"
    return s
}

function put(s: GameState, pid: "p1" | "p2", cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(VANILLA, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. TargetFilter.soulCore: [ソウルコア]が載っている/載っていないで絞り込める ===")
{
    const s = game("case1-filter")
    enableSoulCore(s)
    const withSoul = put(s, "p2", 1)
    const withoutSoul = put(s, "p2", 1)
    moveSoulCore(s.players.p2, { zone: "instance", instanceId: withSoul.instanceId })
    assert(
        matchesTarget(s, "p1", withSoul, { soulCore: "present" } as never),
        "ソウルコアが載っている個体は present に一致",
    )
    assert(
        !matchesTarget(s, "p1", withoutSoul, { soulCore: "present" } as never),
        "載っていない個体は present に不一致",
    )
    assert(
        matchesTarget(s, "p1", withoutSoul, { soulCore: "absent" } as never),
        "載っていない個体は absent に一致",
    )
    assert(
        !matchesTarget(s, "p1", withSoul, { soulCore: "absent" } as never),
        "載っている個体は absent に不一致",
    )
}

console.log("=== 2. placeSoulCore: トラッシュの[ソウルコア]を自分のスピリットに置く ===")
{
    const s = game("case2-place")
    enableSoulCore(s, { zone: "trash" }) // ソウルコアをトラッシュに置く
    const target = put(s, "p1", 1)
    const other = put(s, "p1", 1)
    resolveAction(s, "p1", null, { type: "placeSoulCore", from: "trash", filter: { cost: { max: 1 } } } as never)
    // 候補2体・非対話は先頭（target）に置かれる
    assert(soulCoreOnInstance(s.players.p1, target.instanceId), "先頭の候補に[ソウルコア]が置かれた")
    assert(!soulCoreOnInstance(s.players.p1, other.instanceId), "他の個体には置かれていない")
    assert(assertSoulCoreConsistent(s) === null, "不変条件は健全")
}

console.log("=== 3. placeSoulCore: [ソウルコア]が指定元にないときは不発 ===")
{
    const s = game("case3-no-soul")
    enableSoulCore(s, { zone: "reserve" }) // リザーブにある
    const target = put(s, "p1", 1)
    resolveAction(s, "p1", null, { type: "placeSoulCore", from: "trash" } as never)
    assert(!soulCoreOnInstance(s.players.p1, target.instanceId), "トラッシュにないので置かれない")
    assert(soulCoreInReserve(s.players.p1), "ソウルコアはリザーブのまま")
}

console.log("=== 4. swapSoulCore: 1:1交換（ソウルコア⇔通常コア1個。消滅判定なし） ===")
{
    const s = game("case4-swap")
    enableSoulCore(s)
    // from: [ソウルコア]のみ（cores=1）。to: 通常コア1個（案B-inside）
    const from = put(s, "p1", 0)
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: from.instanceId })
    const to = put(s, "p1", 1)
    assert(
        act(s, "p1", { type: "swapSoulCore", fromInstanceId: from.instanceId, toInstanceId: to.instanceId }) === null,
        "1:1交換が成功する",
    )
    assert(soulCoreOnInstance(s.players.p1, to.instanceId), "[ソウルコア]は to へ移った")
    assert(from.cores === 1, "from には通常コア1個が移った")
    assert(to.cores === 1, "to は[ソウルコア]1個になった（通常コア1個と交換）")
    assert(
        s.players.p1.field.spirits.length === 2,
        "両方とも場に残る（fromは通常コア1個、toは[ソウルコア]でそれぞれLv1を満たす）",
    )
    assert(assertSoulCoreConsistent(s) === null, "不変条件は健全")
}

console.log("=== 5. swapSoulCore の検証エラー ===")
{
    const s = game("case5-errors")
    enableSoulCore(s)
    const from = put(s, "p1", 1)
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: from.instanceId })
    const to = put(s, "p1", 0) // 通常コア0
    assert(
        act(s, "p1", { type: "swapSoulCore", fromInstanceId: from.instanceId, toInstanceId: from.instanceId }) !== null,
        "同じ個体同士では交換できない",
    )
    assert(
        act(s, "p1", { type: "swapSoulCore", fromInstanceId: from.instanceId, toInstanceId: to.instanceId }) !== null,
        "通常コア0個の個体とは交換できない",
    )
    const noSoul = put(s, "p1", 1)
    assert(
        act(s, "p1", { type: "swapSoulCore", fromInstanceId: noSoul.instanceId, toInstanceId: from.instanceId }) !== null,
        "[ソウルコア]が載っていない個体を移動元には選べない",
    )
    // 相手のターンにはできない
    s.turnPlayer = "p2"
    assert(
        act(s, "p1", { type: "swapSoulCore", fromInstanceId: from.instanceId, toInstanceId: noSoul.instanceId }) !== null,
        "自分のターンでなければ交換できない",
    )
}

console.log("すべてのチェックに合格しました 🎉(part493)")
