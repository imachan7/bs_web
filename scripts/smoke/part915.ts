// smoke パート915（破壊で誘発した効果は、相手側の「相手のスピリットが破壊されたとき」も同じ列に並び、ターンプレイヤーが順番を決める。
// 「フィールドに残る」が先に解決したら、相手側の破壊条件の効果も処理しない。#437 R11B-1・TIMING_CHART「破壊で誘発した効果は1つの列」）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const CORONA = "BS20-002" // 炎楯の守護者コロナ・ドラゴン（コスト3以下の自分のスピリットは、相手の効果で破壊されたときフィールドに残ることができる）
const FORTRESS = "BS14-075" // 焔竜の城塞都市（『自分のアタックステップ』相手のスピリットを破壊したとき、1体につき1枚ドロー）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CORONA).effects.some((e) => e.kind === "reviveOnDestroy") && getCard(CORONA).cost === 3, "コロナ・ドラゴンはコスト3で「フィールドに残る」を持つ")
    assert(getCard(FORTRESS).effects.some((e) => e.kind === "fieldEvent" && e.event === "opponentSpiritDestroyed"), "城塞都市は「相手のスピリットが破壊されたとき」")
}

console.log("=== 両陣営の誘発が1つの列に並び、「フィールドに残る」を先に選ぶと、相手側のドローは処理されない ===")
{
    const s = createGame("p915", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.nexuses.push(createInstance(FORTRESS, s.turn, 0))
    const corona = createInstance(CORONA, s.turn, 1)
    s.players.p2.field.spirits = [corona]
    refreshLevelAsOverrides(s)
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "destroy", count: 1 } as EffectAction, undefined, ["red"], "magic")
    const order = s.pendingChoice
    assert(order?.pid === "p1" && (order.options ?? []).length >= 2, `ターンプレイヤーに解決順の質問が出る（${order?.prompt ?? "なし"}）`)
    assert(s.players.p1.hand.length === hand, "質問の前に城塞都市のドローは起きていない")
    const reviveFirst = (order?.options ?? []).find((o) => o.includes("コロナ") || o.includes("残"))
    act(s, "p1", { type: "resolveChoice", option: reviveFirst ?? order!.options![0]! })
    for (let i = 0; i < 5 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.kind === "option") act(s, pc.pid, { type: "resolveChoice", option: pc.options![0]! })
        else act(s, pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0]! })
    }
    assert(s.players.p2.field.spirits.includes(corona), "コロナ・ドラゴンはフィールドに残った")
    assert(s.players.p1.hand.length === hand, `破壊が無かったことになったので城塞都市はドローしない（${s.players.p1.hand.length - hand}枚）`)
}

console.log("すべてのチェックに合格しました 🎉（part915）")
