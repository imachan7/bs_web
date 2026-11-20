// smoke パート1041（AI のアタックの計画が、相手のコアが多いときは次のターンの召喚を多く見込んで守り手を残す。server/src/ai/attackPlan.ts の coreSummon）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { decideAiAction } from "../../server/src/ai/index"
import { DEFAULT_POLICY, KEEP_GUARD_POLICY } from "../../server/src/ai/policy"

const ROKU = "BS01-002" // ロクケラトプス（2コア=BP3000）
const BEET = "BS01-050" // ビートビートル（1コア=BP1000）
assert(getCard(ROKU).name === "ロクケラトプス" && getCard(BEET).name === "ビートビートル", "cardId の機械確認")

// p1 のアタックステップ。p1 ライフ3・BP3000 が2体（回復）、p2 ライフ5・BP1000 が1体（回復）・手札4枚
function scene(oppReserve: number): GameState {
    const s = createGame("summon", { p1: "A", p2: "B" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 5
    s.turnPlayer = "p1"
    s.phase = "attack"
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.deck = Array.from({ length: 40 }, () => ROKU)
        p.burst = null
        p.trashCores = 0
    }
    s.players.p1.life = 3
    s.players.p1.reserve = 0
    s.players.p1.hand = []
    s.players.p1.field.spirits = [createInstance(ROKU, 1, 2), createInstance(ROKU, 1, 2)]
    s.players.p2.life = 5
    s.players.p2.reserve = oppReserve
    s.players.p2.hand = [ROKU, ROKU, ROKU, ROKU]
    s.players.p2.field.spirits = [createInstance(BEET, 1, 1)]
    refreshLevelAsOverrides(s)
    return s
}
const attacks = (s: GameState, policy: typeof DEFAULT_POLICY) => decideAiAction(s, "p1", new Set(), policy)?.action.type === "attack"

console.log("=== 1. 相手のコアが多いと、次のターンの召喚を多く見込んでアタックしない ===")
// 見込み：(9＋0＋1＋このターン取りうるライフ1)÷3＝3体 → 相手の打点は場の1＋3＝4。ライフ3を守るには2体残す必要があり、アタックすると1体しか残らない
assert(attacks(scene(9), KEEP_GUARD_POLICY), "変更前（見込みは最大2体）はアタックする")
assert(!attacks(scene(9), DEFAULT_POLICY), "既定はアタックせず守り手を残す")

console.log("=== 2. 相手のコアが少なければ従来どおり（見込みの下限は2体） ===")
assert(attacks(scene(0), DEFAULT_POLICY), "リザーブ0なら見込みは2体のままで、アタックする")

console.log("すべてのチェックに合格しました 🎉（part1041）")
