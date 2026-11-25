// smoke パート1064（バーストのあとにコストを払って発揮するフラッシュ効果を、画面へ知らせる出来事 burstMagicEffect。2026-11-25 ユーザー指摘：絶甲氷盾のフラッシュ効果の中身が分からなかった）
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う（part451 と同じ場面）
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard("SD06-016")
    assert(c.name === "絶甲氷盾" && c.effects.some((e) => e.kind === "burst" && e.event === "ownLifeDamaged" && e.thenPay === "flash"), "SD06-016 は絶甲氷盾（ライフ減少後・フラッシュの thenPay）")
    assert(getCard("BS01-001").type === "spirit", "BS01-001 はスピリット")
}

// 相手のアタックをライフで受け、絶甲氷盾のバーストを発動して、フラッシュ効果を払うかの確認まで進める
function toThenPay(id: string): GameState {
    const s = createGame(id, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.interactiveTargets = true
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.burst = "SD06-016"
    s.players.p2.burstSet = true
    s.players.p2.reserve = 10
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    let guard = 0
    while (s.battle && s.isFlashTiming && guard++ < 5) act(s, s.priorityPlayer, { type: "pass" })
    act(s, "p2", { type: "takeLife" })
    act(s, "p2", { type: "resolveChoice", option: s.pendingChoice!.options?.[0] ?? "発動する" })
    return s
}

console.log("=== 払うかの確認は、発揮するのがフラッシュ効果だと持っている（画面が効果文を出す） ===")
{
    const s = toThenPay("p1064a")
    assert(s.pendingChoice?.burstThenPay?.timing === "flash", "確認待ちの burstThenPay.timing が flash")
    assert(!s.events.some((e) => e.type === "burstMagicEffect"), "確認の前には出ない")
}

console.log("=== 発動を選ぶと、フラッシュ効果を発揮する出来事が出る ===")
{
    const s = toThenPay("p1064b")
    act(s, "p2", { type: "resolveChoice", option: s.pendingChoice!.options?.[0] ?? "発動する" })
    const ev = s.events.find((e) => e.type === "burstMagicEffect")
    assert(ev?.type === "burstMagicEffect" && ev.cardId === "SD06-016" && ev.timing === "flash" && ev.pid === "p2", "絶甲氷盾のフラッシュ効果の出来事（p2）")
}

console.log("=== 払わない（選ばない）と出ない ===")
{
    const s = toThenPay("p1064c")
    act(s, "p2", { type: "resolveChoice" })
    assert(!s.events.some((e) => e.type === "burstMagicEffect"), "選ばなければ出来事は出ない")
}

console.log("すべてのチェックに合格しました 🎉（part1064）")
