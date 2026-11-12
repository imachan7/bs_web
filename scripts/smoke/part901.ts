// smoke パート901（「BP0になったとき、BP0になったスピリットすべてを〜」の対象は、そのとき新しく BP0 になった体だけ。TIMING_CHART・2026-11-05 ユーザー確認）
// 前から BP0 の体まで巻き込んでいた（ララファエルで報告。BS20-041・BS20-X05・SD15-002・SD15-007・SD15-X01 が同じ書き方）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import { effectiveBp } from "../../shared/rules"
import { ensureBpSeen, fireBpReachedTriggers } from "../../server/src/logic/stepTriggers"

const MAKAEL = "SD15-002" // 天使マカエル（Lv2：相手のスピリットがBP0になったとき、BP0になったスピリットすべてを疲労させる）
const PRIMA = "BS20-041" // 天使プリマ（Lv2『お互いのアタックステップ』：BP0になったスピリットすべてを破壊する）
const VANILLA = "BS01-002" // ロクケラトプス（Lv1=1コアBP1000／Lv2=2コアBP3000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(MAKAEL).name === "天使マカエル" && getCard(MAKAEL).levels[1]!.cores === 2, "MAKAELは天使マカエル（Lv2=2コア）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).levels[1]!.bp === 3000, "VANILLAはロクケラトプス")
}

const s = createGame("p901", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
runTurnStart(s)
s.players.p1.field.spirits.push(createInstance(MAKAEL, s.turn, 2))
const a = createInstance(VANILLA, s.turn, 1) // BP1000
const b = createInstance(VANILLA, s.turn, 2) // BP3000
s.players.p2.field.spirits.push(a, b)
refreshLevelAsOverrides(s)
ensureBpSeen(s)

console.log("=== 1. 1体目が BP0 になる → その体が疲労する ===")
resolveAction(s, "p1", null, { type: "bpMinus", amount: 1000, count: 1, filter: { maxBp: 1000 } })
fireBpReachedTriggers(s)
assert(effectiveBp(s, "p2", a) === 0 && a.isRested, "A が BP0 になり疲労した")
assert(!b.isRested, "B はまだ疲労していない")

console.log("=== 2. A を回復させてから B が BP0 になる → B だけが疲労し、前から BP0 の A は巻き込まない ===")
a.isRested = false
resolveAction(s, "p1", null, { type: "bpMinus", amount: 3000, count: 1, filter: { minBp: 3000 } })
fireBpReachedTriggers(s)
assert(effectiveBp(s, "p2", b) === 0 && b.isRested, "B が BP0 になり疲労した")
assert(!a.isRested, "前から BP0 の A は疲労しない")

console.log("=== 3. 誘発が2つ（プリマ・マカエル）：後に解決する方も、新しく BP0 になった体だけを対象にする ===")
{
    assert(getCard(PRIMA).name === "天使プリマ", "PRIMAは天使プリマ")
    const t = createGame("p901-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(t)
    t.interactiveTargets = true
    t.phase = "attack"
    t.players.p1.field.spirits.push(createInstance(MAKAEL, t.turn, 2), createInstance(PRIMA, t.turn, getCard(PRIMA).levels[1]!.cores))
    const old = createInstance(VANILLA, t.turn, 1)
    const fresh = createInstance(VANILLA, t.turn, 2)
    t.players.p2.field.spirits.push(old, fresh)
    refreshLevelAsOverrides(t)
    resolveAction(t, "p1", null, { type: "bpMinus", amount: 1000, count: 1, filter: { maxBp: 1000 } })
    ensureBpSeen(t)
    resolveAction(t, "p1", null, { type: "bpMinus", amount: 3000, count: 1, filter: { minBp: 3000 } })
    fireBpReachedTriggers(t)
    // 解決順を聞かれたら先頭から答える
    for (let i = 0; i < 6 && t.pendingChoice; i++) {
        const pc = t.pendingChoice
        handleAction(t, pc.pid, pc.kind === "option" ? { type: "resolveChoice", option: pc.options![0]! } : { type: "resolveChoice", instanceId: pc.candidates[0]! })
    }
    const ids = t.players.p2.field.spirits.map((x) => x.instanceId)
    assert(!ids.includes(fresh.instanceId), "新しく BP0 になった体は破壊される")
    assert(ids.includes(old.instanceId) && !old.isRested, "前から BP0 の体は破壊も疲労もされない")
}

console.log("すべてのチェックに合格しました 🎉（part901）")
