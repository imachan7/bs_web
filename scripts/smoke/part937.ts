// smoke パート937（BS08-021 ブラックアメンボーグ Lv2：BP6000以下の相手のスピリットがアタックしたとき、相手は相手のスピリット1体を疲労させる。#530）
// 疲労させるのはアタックした側のスピリットで、選ぶのもアタックした側。以前は逆で、アメンボーグ側のスピリットを疲労させていた（#516 と同じ形）
import { act, assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const AMENBORG = "BS08-021"
const VANILLA = "BS01-002" // ロクケラトプス（BP1000）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(AMENBORG).name === "ブラックアメンボーグ", "AMENBORG")

function setup(seed: string, interactive: boolean) {
    const s: GameState = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    const amen = createInstance(AMENBORG, s.turn, 3) // Lv2
    const mine = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(amen, mine)
    const attacker = createInstance(VANILLA, s.turn, 1)
    const other = createInstance(VANILLA, s.turn, 1)
    const other2 = createInstance(VANILLA, s.turn, 1) // 候補が1体だと自動で決まるので2体にする
    s.players.p2.field.spirits.push(attacker, other, other2)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1 ターン終了")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2 アタックステップへ")
    return { s, amen, mine, attacker, other, other2 }
}

console.log("=== アタックした側が、自分のスピリット1体を選んで疲労させる ===")
{
    const { s, amen, mine, attacker, other, other2 } = setup("t937-ask", true)
    assert(handleAction(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2 がアタック")
    const pc = s.pendingChoice
    assert(pc?.pid === "p2", `選ぶのはアタックした側（実際 ${pc?.pid}）`)
    assert((pc?.candidates ?? []).length > 0 && (pc?.candidates ?? []).every((id) => [attacker.instanceId, other.instanceId, other2.instanceId].includes(id)), "候補はアタックした側のスピリットだけ")
    assert(!amen.isRested && !mine.isRested, "アメンボーグ側のスピリットは疲労しない")
}
{
    const { s, amen, mine, attacker, other, other2 } = setup("t937-auto", false)
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2 がアタック")
    assert(!amen.isRested && !mine.isRested, "アメンボーグ側のスピリットは疲労しない")
    assert(other.isRested || other2.isRested, "アタックした側の、回復状態のスピリットが疲労する")
}

console.log("すべてのチェックに合格しました 🎉（part937）")
