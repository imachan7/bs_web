// smoke パート495(ソウルコア段7追補: メインステップの自由なコア移動で[ソウルコア]をリザーブ⇔個体へ動かす)
// 仕様(docs/design/SOULCORE.md §1.4の自由なコア移動の一部・2026-10-05):
//   - moveCore に soulCore フラグ: add=リザーブの[ソウルコア]を自分の個体へ置く／remove=個体の[ソウルコア]をリザーブへ戻す
//   - 通常コアの数値（reserve/inst.cores/trashCores）は一切不変で、ポインタだけが移る（案A-outside）
//   - removeで維持コア（Lv1）を下回るときは confirmDeplete が要る（通常コアの取り除きと同じ）
//   - add で[ソウルコア]を置いた個体には「コアを増やした」誘発（夢魔の寝所）が発火する
import {
    act,
    assert,
    assertSoulCoreConsistent,
    createGame,
    createInstance,
    enableSoulCore,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import { soulCoreInReserve, soulCoreOnInstance } from "../../server/src/logic/soulCore"
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

function put(s: GameState, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(VANILLA, s.turn, cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. add: リザーブの[ソウルコア]をスピリットに置く（cores+1/reserve-1・案B-inside） ===")
{
    const s = game("case1-add")
    enableSoulCore(s)
    const target = put(s, 1)
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", { type: "moveCore", instanceId: target.instanceId, direction: "add", soulCore: true }) === null,
        "[ソウルコア]を置ける",
    )
    assert(soulCoreOnInstance(s.players.p1, target.instanceId), "[ソウルコア]はこの個体に載った")
    assert(!soulCoreInReserve(s.players.p1), "リザーブにはもういない")
    assert(s.players.p1.reserve === reserveBefore - 1, "[ソウルコア]ぶんリザーブは-1")
    assert(target.cores === 2, "個体の cores は+1（[ソウルコア]もコアとして数える）")
    assert(assertSoulCoreConsistent(s) === null, "不変条件は健全")
}

console.log("=== 2. remove: 個体の[ソウルコア]をリザーブへ戻す ===")
{
    const s = game("case2-remove")
    enableSoulCore(s)
    const target = put(s, 1)
    // [ソウルコア]を載せた状態にする（part1と同じ操作）
    assert(
        act(s, "p1", { type: "moveCore", instanceId: target.instanceId, direction: "add", soulCore: true }) === null,
        "載せる",
    )
    assert(
        act(s, "p1", { type: "moveCore", instanceId: target.instanceId, direction: "remove", soulCore: true }) === null,
        "[ソウルコア]をリザーブへ戻せる",
    )
    assert(soulCoreInReserve(s.players.p1), "[ソウルコア]はリザーブに戻った")
    assert(target.cores === 1, "[ソウルコア]を戻したので cores は-1（通常コア1個が残る）")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === target.instanceId), "スピリットは場に残る")
    assert(assertSoulCoreConsistent(s) === null, "不変条件は健全")
}

console.log("=== 3. remove: 維持コアを割るときはconfirmDepleteが要る ===")
{
    const s = game("case3-deplete")
    enableSoulCore(s)
    // [ソウルコア]1個だけのスピリット（通常コア0。cores=0から載せて cores=1 になる）
    const target = put(s, 0)
    assert(
        act(s, "p1", { type: "moveCore", instanceId: target.instanceId, direction: "add", soulCore: true }) === null,
        "載せる",
    )
    const err = act(s, "p1", { type: "moveCore", instanceId: target.instanceId, direction: "remove", soulCore: true })
    assert(err !== null && err.includes("維持コア"), `confirmDeplete無しでは弾く（実際: ${String(err)}）`)
    assert(
        act(s, "p1", { type: "moveCore", instanceId: target.instanceId, direction: "remove", confirmDeplete: true, soulCore: true }) === null,
        "confirmDeplete付きなら取り除ける",
    )
    assert(soulCoreInReserve(s.players.p1), "[ソウルコア]はリザーブへ")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === target.instanceId), "維持コアを割ったのでスピリットは消滅した")
    assert(assertSoulCoreConsistent(s) === null, "不変条件は健全")
}

console.log("=== 4. 検証エラー: リザーブに[ソウルコア]が無い/個体に載っていない ===")
{
    const s = game("case4-errors")
    enableSoulCore(s)
    const target = put(s, 1)
    // [ソウルコア]を先に別の個体へ移しておく
    const other = put(s, 1)
    assert(
        act(s, "p1", { type: "moveCore", instanceId: other.instanceId, direction: "add", soulCore: true }) === null,
        "別の個体へ載せる",
    )
    const err1 = act(s, "p1", { type: "moveCore", instanceId: target.instanceId, direction: "add", soulCore: true })
    assert(err1 !== null && err1.includes("[ソウルコア]"), `リザーブに無ければaddは弾く（実際: ${String(err1)}）`)
    const err2 = act(s, "p1", { type: "moveCore", instanceId: target.instanceId, direction: "remove", soulCore: true })
    assert(err2 !== null && err2.includes("[ソウルコア]"), `載っていなければremoveは弾く（実際: ${String(err2)}）`)
}

console.log("すべてのチェックに合格しました 🎉(part495)")
