// smoke パート1043（効果のコストを、維持コアを残して払えなければ自分のスピリットを消滅させて払う。EffectModules.ts の costPayPlan。#662・#665）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import { decideAiAction } from "../../server/src/ai/index"
import { canPayMagicCost } from "../../server/src/logic/magic/payThenResolve"
import { costPayPlan } from "../../server/src/logic/EffectModules"
import { burstActivationFee, burstFeeUnpayable } from "../../server/src/logic/burstActivationFee"

const SANSATSU = "BS15-074" // 三札之術（コスト5・軽減 赤×3。バースト：自分のライフ減少後、BP4000以下を1体破壊。その後コストを支払うことでメイン効果＝2枚ドロー…）
const ROKU = "BS01-002" // ロクケラトプス（赤・シンボル1）
const BEET = "BS01-050" // ビートビートル（1コア=BP1000）
const HASTARK = "BS23-X06" // 異海双龍ハスターク（自分のアタックステップの間、相手はバーストのコストを支払わなければ発動できない）
assert(getCard(SANSATSU).name === "三札之術" && getCard(ROKU).name === "ロクケラトプス" && getCard(BEET).name === "ビートビートル" && getCard(HASTARK).name === "異海双龍ハスターク", "cardId の機械確認")

console.log("=== 1. 払えるかの判定：維持コアを残して足りなければ、消滅させて払う払い方を数える ===")
{
    const s = createGame("pay", { p1: "A", p2: "B" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 1
    s.players.p1.field.spirits = [createInstance(ROKU, 1, 2)]
    refreshLevelAsOverrides(s)
    assert(canPayMagicCost(s, "p1", 3), "リザーブ1＋スピリット2コアで3コストを払える（スピリットは消滅する）")
    assert(!canPayMagicCost(s, "p1", 4), "4コストは払えない")
    const keep = costPayPlan(s, "p1", 2)
    assert(keep !== null && keep.paySources.reduce((n, p) => n + p.count, 0) === 1, "2コストなら維持コアを残す払い方（スピリットから1個）を選ぶ")
}

console.log("=== 2. 報告の盤面：ライフ減少で三札之術のバースト → その後のコストをスピリットを消滅させて払う（#662） ===")
{
    const s = createGame("sansatsu", { p1: "A", p2: "B" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 6
    s.turnPlayer = "p2"
    s.phase = "attack"
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.deck = Array.from({ length: 40 }, () => ROKU)
        p.hand = []
        p.burst = null
        p.burstSet = false
        p.life = 5
        p.reserve = 0
    }
    // 自分（p1）：疲労状態のロクケラトプス2コア・1コア（赤シンボル2つ → 実質コスト3）。ライフ減少でリザーブに1個入る。
    // 維持コアを残すと 1＋1＋0＝2 で足りず、消滅させれば 1＋2＋1＝4 で払える
    const a = createInstance(ROKU, 1, 2)
    const b = createInstance(ROKU, 1, 1)
    a.isRested = true
    b.isRested = true
    s.players.p1.field.spirits = [a, b]
    s.players.p1.burst = SANSATSU
    s.players.p1.burstSet = true
    s.players.p2.field.spirits = [createInstance(BEET, 1, 1)]
    refreshLevelAsOverrides(s)
    assert(handleAction(s, "p2", { type: "attack", instanceId: s.players.p2.field.spirits[0]!.instanceId }) === null, "p2 がアタックする")
    for (let i = 0; i < 40 && (s.battle !== null || s.pendingChoice !== null); i++) {
        const pid = s.pendingChoice?.pid ?? (decideAiAction(s, "p1") ? "p1" : "p2")
        const m = decideAiAction(s, pid)
        if (!m || handleAction(s, pid, m.action) !== null) break
    }
    assert(s.log.some((l) => String(l).includes("三札之術：3コストを支払った")), "三札之術の3コストを支払った")
    assert(s.players.p1.hand.length >= 2, `メイン効果で2枚以上ドローした（手札 ${s.players.p1.hand.length} 枚）`)
    assert(s.players.p1.field.spirits.length < 2, "支払いでスピリットが消滅した")
}

console.log("=== 3. バーストの発動料（異海双龍ハスターク）も、消滅させて払う払い方を数える（#665 の1） ===")
{
    const s = createGame("fee", { p1: "A", p2: "B" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 6
    s.turnPlayer = "p2"
    s.phase = "attack"
    s.players.p1.reserve = 1
    s.players.p1.field.spirits = [createInstance(ROKU, 1, 2), createInstance(ROKU, 1, 1)]
    s.players.p2.field.spirits = [createInstance(HASTARK, 1, 1)]
    refreshLevelAsOverrides(s)
    assert(burstActivationFee(s, "p1", SANSATSU) === 3, "発動料は三札之術の実質コスト3")
    assert(!burstFeeUnpayable(s, "p1", SANSATSU), "リザーブ1＋スピリット2コア・1コアで発動料3を払える（維持コアを残すと2しか払えない）")
}

console.log("すべてのチェックに合格しました 🎉（part1043）")
