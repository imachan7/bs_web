// smoke パート451（ライフ減少後バーストの確認で中断しても、バトルを終わらせない。2026-09-28 発覚）
//
// 対話モードでは、ライフで受けたあとのバースト確認で中断している間にバトルが終わってしまい、
// 絶甲氷盾のフラッシュ効果（このバトルが終了したとき、アタックステップを終了する）が
// 「バトルが発生していない」として空振りし、アタックステップが続いていた。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard("SD06-016")
    assert(c.name === "絶甲氷盾" && c.effects.some((e) => e.kind === "burst" && e.event === "ownLifeDamaged" && e.thenPay === "flash"), "SD06-016 は絶甲氷盾（ライフ減少後・フラッシュの thenPay）")
    assert(getCard("BS01-001").type === "spirit", "BS01-001 はスピリット")
}

console.log("=== 対話：絶甲氷盾のフラッシュ効果でアタックステップが終わり、相手のターンへ進む ===")
{
    const s = createGame("p451", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.interactiveTargets = true
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.burst = "SD06-016"
    s.players.p2.burstSet = true
    s.players.p2.reserve = 10
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    let guard = 0
    while (s.battle && s.isFlashTiming && guard++ < 5) act(s, s.priorityPlayer, { type: "pass" })
    assert(act(s, "p2", { type: "takeLife" }) === null, "p2がライフで受ける")
    assert(s.pendingChoice?.burstActivate !== undefined, "ライフ減少後バーストの発動確認が出る")
    assert(s.battle !== null, "確認中もバトルは続いている")
    act(s, "p2", { type: "resolveChoice", option: s.pendingChoice!.options?.[0] ?? "発動する" })
    assert(s.pendingChoice?.burstThenPay !== undefined, "フラッシュ効果を発揮するかの確認が出る")
    assert(s.battle !== null, "thenPay の確認中もバトルは続いている")
    act(s, "p2", { type: "resolveChoice", option: s.pendingChoice!.options?.[0] ?? "発動する" })
    assert(!s.log.some((l) => l.includes("バトルが発生していないため")), "フラッシュ効果が空振りしない")
    assert(s.battle === null, "バトルは終了した")
    assert(s.turnPlayer === "p2", "アタックステップが終わり、エンドステップを経て相手のターンへ進む")
    assert(s.players.p2.trashCards.includes("SD06-016"), "絶甲氷盾はトラッシュへ")
}

console.log("すべてのチェックに合格しました 🎉（part451）")
