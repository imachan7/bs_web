// smoke パート969（アタッカーが場を離れたとき、フラッシュ①が閉じるまではバトルを終えない。公式Q22290・TIMING_CHART §1.8。2026-11-16 ユーザー確認）
//
// フラッシュ①の前（アタック時の破壊）・途中（効果での手札戻し）に離れても、フラッシュ①は双方がパスするまで続ける。
// 閉じた時点でアタッカーが居なければ、ブロック／ライフ受けを出さずにバトルを終える。
// アタッカーが残っていれば、フラッシュ①の後に防御側がブロック／ライフで受けるを選べる（今と同じ）。
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { validateBlock, validateTakeLife } from "../../server/src/logic/RuleValidator"

const ATTACKER = "BS01-008" // メタルバーン（赤・Lv1 BP3000・バニラ）
const BLOCKER = "BS01-031" // デス・ハーデス（紫・Lv1 BP4000・バニラ）
const NEXUS_KILLER = "BS13-063" // 血塗られた魔具（紫ネクサス。コア2個以下のスピリットがアタックしたら破壊）
const BOUNCE_MAGIC = "BS01-146" // ドリームリボン（白・フラッシュ：相手のスピリット1体を手札に戻す）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ATTACKER).name === "メタルバーン" && getCard(ATTACKER).type === "spirit", "ATTACKERはメタルバーン")
    assert(getCard(BLOCKER).name === "デス・ハーデス" && getCard(BLOCKER).type === "spirit", "BLOCKERはデス・ハーデス")
    assert(getCard(NEXUS_KILLER).name === "血塗られた魔具" && getCard(NEXUS_KILLER).type === "nexus", "NEXUS_KILLERは血塗られた魔具")
    assert(getCard(BOUNCE_MAGIC).name === "ドリームリボン" && getCard(BOUNCE_MAGIC).flash === true, "BOUNCE_MAGICはフラッシュのドリームリボン")
}

// p1 のアタッカーと p2 のブロッカーを並べたアタック直前の盤面
function setup(attackerCores: number): GameState {
    const s = createGame(`flash-one-${attackerCores}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.spirits.push(createInstance(ATTACKER, s.turn, attackerCores))
    s.players.p2.field.spirits.push(createInstance(BLOCKER, s.turn, 1))
    s.players.p2.reserve = 12 // フラッシュマジックのコストを確実に払えるようにする
    refreshLevelAsOverrides(s)
    return s
}

// 選択待ちに答える（対象は指定した instanceId を優先）
function answerChoices(s: GameState, preferred?: string): void {
    let guard = 0
    while (s.pendingChoice && guard++ < 10) {
        const pid = s.pendingChoice.pid as PlayerId
        const target =
            preferred && s.pendingChoice.candidates.includes(preferred) ? preferred : s.pendingChoice.candidates[0]
        const action = target
            ? ({ type: "resolveChoice", instanceId: target } as const)
            : s.pendingChoice.options && s.pendingChoice.options.length > 0
              ? ({ type: "resolveChoice", option: s.pendingChoice.options[0]! } as const)
              : ({ type: "resolveChoice" } as const)
        if (handleAction(s, pid, action)) break
    }
}

// フラッシュ①（または②）を双方のパスで閉じる
function closeFlash(s: GameState): void {
    let guard = 0
    while (s.isFlashTiming && s.battle && guard++ < 10) {
        if (handleAction(s, s.priorityPlayer, { type: "pass" })) break
    }
}

console.log("=== A: フラッシュ①の前（アタック時効果による破壊）で場を離れても、フラッシュ①は行い、閉じたらバトルを終える ===")
{
    const s = setup(2) // コア2個以下なので血塗られた魔具で破壊される
    s.players.p2.field.nexuses.push(createInstance(NEXUS_KILLER, s.turn, 0))
    refreshLevelAsOverrides(s)
    const attacker = s.players.p1.field.spirits[0]!
    const blocker = s.players.p2.field.spirits[0]!
    handleAction(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    assert(s.players.p1.field.spirits.length === 0, "アタック時にアタッカーが破壊された")
    assert(s.battle !== null, "場を離れてもバトルはまだ終わらない（フラッシュ①は行う）")
    assert(s.isFlashTiming === true, "フラッシュタイミング中")

    closeFlash(s)
    assert(s.battle === null, "双方がパスしたらバトルが終わる")
    assert(validateBlock(s, "p2", blocker.instanceId) !== null, "防御側はブロックを宣言できない（バトルが無い）")
    assert(validateTakeLife(s, "p2") !== null, "防御側はライフで受ける宣言もできない（バトルが無い）")
    assert(s.players.p2.life === 5, "ライフは減らない")
}

console.log("=== B: フラッシュ①の途中で効果により場を離れても、フラッシュ①は双方がパスするまで続く ===")
{
    const s = setup(1)
    s.players.p2.hand = [BOUNCE_MAGIC]
    const attacker = s.players.p1.field.spirits[0]!
    const blocker = s.players.p2.field.spirits[0]!
    handleAction(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    assert(s.battle !== null && s.isFlashTiming === true, "アタック宣言後はフラッシュ①の最中")

    handleAction(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: attacker.instanceId })
    answerChoices(s, attacker.instanceId)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === attacker.instanceId), "フラッシュ①の途中でアタッカーが手札に戻った")
    assert(s.battle !== null, "場を離れてもフラッシュ①の途中なのでバトルは続く")
    assert(s.isFlashTiming === true, "フラッシュ①はまだ続いている")
    assert(s.priorityPlayer === "p1", "優先権は相手（p1）へ移り、フラッシュで使える")

    closeFlash(s)
    assert(s.battle === null, "双方がパスしたらバトルが終わる")
    assert(validateBlock(s, "p2", blocker.instanceId) !== null, "防御側はブロックを宣言できない（バトルが無い）")
    assert(validateTakeLife(s, "p2") !== null, "防御側はライフで受ける宣言もできない（バトルが無い）")
    assert(s.players.p2.life === 5, "ライフは減らない")
}

console.log("=== C（対照）: アタッカーが残っていれば、フラッシュ①の後に防御側がブロック／ライフで受けるを選べる ===")
{
    const s = setup(1)
    const attacker = s.players.p1.field.spirits[0]!
    const blocker = s.players.p2.field.spirits[0]!
    handleAction(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    closeFlash(s)
    assert(s.battle !== null && s.battle.blockerInstanceId === null, "フラッシュ①が閉じてもバトルは残り、ブロック未宣言")
    assert(validateBlock(s, "p2", blocker.instanceId) === null, "防御側はブロックを宣言できる")
    assert(validateTakeLife(s, "p2") === null, "防御側はライフで受けることもできる")
}

console.log("すべてのチェックに合格しました 🎉（part969）")
