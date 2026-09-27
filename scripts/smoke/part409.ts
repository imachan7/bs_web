// smoke パート409（skipBpCompare：「バトル解決時、BPを比べずにバトルを終了させる」はその場で終わらせない。TIMING_CHART §1.12）
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const SMILE = "BS06-109" // アルカイックスマイル
const PEGASUS = "BS13-082" // ペガサスフラップ
const WEAK = "BS13-034" // BP1000
const STRONG = "BS13-040" // BP4000

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SMILE).name === "アルカイックスマイル", "SMILE")
    assert(getCard(PEGASUS).name === "ペガサスフラップ", "PEGASUS")
    assert(getCard(WEAK).type === "spirit" && getCard(STRONG).type === "spirit", "WEAK／STRONG")
}

function blockedBattle(seed: string): { s: GameState; attackerId: string } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = false
    const attacker = createInstance(WEAK, s.turn, 1)
    const blocker = createInstance(STRONG, s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    return { s, attackerId: attacker.instanceId }
}
function flashOf(cardId: string): EffectAction {
    return (getCard(cardId).effects!.find((e) => e.kind === "magic") as { action: EffectAction }).action
}

for (const [cardId, label] of [[SMILE, "アルカイックスマイル"], [PEGASUS, "ペガサスフラップ"]] as const) {
    console.log(`=== ${label}：使った直後はバトルが続き、解決時に BP を比べずに終わる ===`)
    const { s, attackerId } = blockedBattle(cardId)
    resolveAction(s, "p1", null, flashOf(cardId))
    assert(s.battle !== null && s.battle.skipBpCompare === true, "バトルは続き、BP比較を飛ばす印が付く")
    while (s.isFlashTiming && s.battle) {
        assert(act(s, s.priorityPlayer, { type: "pass" }) === null, "パスして解決へ進める")
    }
    assert(s.battle === null, "バトルは終了する")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === attackerId), "BP1000のアタッカーは破壊されない")
}

console.log("すべてのチェックに合格しました 🎉（part409）")
