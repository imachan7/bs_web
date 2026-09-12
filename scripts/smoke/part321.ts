// smoke パート321（起動能力の phaseTurn を、サーバーとクライアントの両方が同じに判定すること）
//
// 2026-09-13 の不具合：`shared/rules.ts` の activatableAbilityOf が `phaseTurn` を見ておらず、
// **相手のアタックステップでも「効果を発動」ボタンが出て、押すとサーバーに拒否される**
// 状態だった（SD06-005 ツインブレード・ドラゴンで発覚）。
// サーバー validateActivateAbility とクライアント activatableAbility は**同じ答え**を返すべき。
import { assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart, viewFor } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { validateActivateAbility } from "../../server/src/logic/RuleValidator"
import { activatableAbility } from "../../shared/rules"

// SD06-005 Lv2『自分のアタックステップ』のフラッシュ（phaseTurn: attack / own）
const CARD = "SD06-005"
const EFFECT = "SD06-005-e3"

function setup(seed: string) {
    const s: GameState = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "sd06", p2: "sd06" })
    runTurnStart(s)
    s.phase = "attack"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    // p2 の場に Lv2 のツインブレード・ドラゴン。バーストもセットしておく（コストに使う）
    const inst = createInstance(CARD, s.turn, 3)
    s.players.p2.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    s.players.p2.burst = "SD06-013"
    s.players.p2.burstSet = true
    return { s, inst }
}

// サーバーとクライアントの答えが一致することを確かめる。戻り値は「発動できるか」
function bothAgree(s: GameState, pid: PlayerId, inst: ReturnType<typeof createInstance>, label: string): boolean {
    const serverOk = validateActivateAbility(s, pid, inst.instanceId, EFFECT) === null
    const clientOk = activatableAbility(viewFor(s, pid) as never, pid, inst) !== null
    assert(
        serverOk === clientOk,
        `${label}：サーバー（${serverOk ? "可" : "不可"}）とクライアント（${clientOk ? "可" : "不可"}）が一致する`,
    )
    return serverOk
}

console.log("=== phaseTurn『自分のアタックステップ』：相手のアタックステップでは発動できない ===")
{
    const { s, inst } = setup("phaseturn-opponent")
    // p1 のターン＝p2 から見て「相手のアタックステップ」。p2 が優先権を持つ状況を作る
    s.turnPlayer = "p1"
    s.battle = { attackerInstanceId: "dummy", blockerInstanceId: null } as never
    s.isFlashTiming = true
    s.priorityPlayer = "p2"
    assert(!bothAgree(s, "p2", inst, "相手のアタックステップ"), "相手のターンでは発動できない")
}

console.log("=== phaseTurn『自分のアタックステップ』：自分のアタックステップなら発動できる ===")
{
    const { s, inst } = setup("phaseturn-own")
    s.turnPlayer = "p2"
    s.battle = { attackerInstanceId: inst.instanceId, blockerInstanceId: null } as never
    s.isFlashTiming = true
    s.priorityPlayer = "p2"
    assert(bothAgree(s, "p2", inst, "自分のアタックステップ"), "自分のターンなら発動できる")
}

console.log("=== phaseTurn『自分のアタックステップ』：自分のメインステップでは発動できない ===")
{
    const { s, inst } = setup("phaseturn-main")
    s.turnPlayer = "p2"
    s.phase = "main"
    s.battle = null
    s.isFlashTiming = false
    s.priorityPlayer = "p2"
    // timing:"flash" はバトル外でも自分のメインステップなら発動できる簡略化があるが、
    // phaseTurn が attack を要求しているのでここは不可になるべき
    assert(!bothAgree(s, "p2", inst, "自分のメインステップ"), "メインステップでは発動できない")
}

console.log("すべてのチェックに合格しました 🎉（part321）")
