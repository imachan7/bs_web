// smoke パート450（バースト効果が対象選択で中断したあとの後始末と、相手への公開。2026-09-28 発覚）
//
// 対話モードでバースト効果が対象を選ばせると、選択の解決後に誰も後始末をせず、
// カードがバーストエリアに残ったまま thenPay（その後コストを支払うことで〜）も聞かれなかった。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { fireFieldEventTriggers } from "../../server/src/logic/triggers"
import { viewFor } from "../../server/src/logic/GameState"

function setup(seed: string): { s: GameState; ids: string[] } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.field.spirits = []
    s.players.p1.burst = "BS14-096"
    s.players.p1.burstSet = true
    const ids: string[] = []
    for (let i = 0; i < 2; i++) {
        const t = createInstance("BS06-037", s.turn, 1)
        t.isRested = true
        s.players.p2.field.spirits.push(t)
        ids.push(t.instanceId)
    }
    return { s, ids }
}

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard("BS14-096")
    assert(c.name === "冥皇封滅呪" && c.type === "magic", "BS14-096 はマジックの冥皇封滅呪")
    assert(c.effects.some((e) => e.kind === "burst" && e.thenPay === "flash"), "BS14-096 はフラッシュの thenPay を持つ")
    assert(getCard("BS06-037").type === "spirit", "BS06-037 はスピリット")
}

console.log("=== §A 発動確認の間は相手にカードが見えない ===")
{
    const { s } = setup("p450-a")
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.pendingChoice?.burstActivate !== undefined, "発動確認が出る")
    const oppView = viewFor(s, "p2")
    assert(oppView.pendingChoice !== null && oppView.pendingChoice.burstActivate === undefined, "相手の画面にはバーストのカードIDが渡らない")
    assert(viewFor(s, "p1").pendingChoice?.burstActivate?.cardId === "BS14-096", "持ち主には渡る")
}

console.log("=== §B 対象選択のあと、トラッシュへ置かれ thenPay が聞かれる（断る） ===")
{
    const { s, ids } = setup("p450-b")
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    act(s, "p1", { type: "resolveChoice", option: "発動する" })
    assert(s.events.some((e) => e.type === "burst" && e.pid === "p1" && e.cardName === "冥皇封滅呪"), "発動した時点で相手にも見えるイベントが出る")
    assert((s.pendingChoice?.candidates ?? []).length === 2, "破壊する対象を選ぶ")
    act(s, "p1", { type: "resolveChoice", instanceId: ids[0]! })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === ids[0]), "選んだスピリットが破壊される")
    assert(s.players.p1.burst === null && s.players.p1.burstSet === false, "バーストエリアが空になる")
    assert(s.players.p1.trashCards.includes("BS14-096"), "バーストのカードはトラッシュへ")
    assert(s.pendingChoice?.burstThenPay !== undefined, "フラッシュ効果を発揮するかの確認が出る")
    const reserve = s.players.p1.reserve
    act(s, "p1", { type: "resolveChoice" })
    assert(s.pendingChoice === null, "断れば選択待ちは残らない")
    assert(s.players.p1.reserve === reserve, "断ればコストは払わない")
    assert(s.players.p1.trashCards.includes("BS14-096") && s.players.p1.burst === null, "断ってもカードはトラッシュのまま")
}

console.log("すべてのチェックに合格しました 🎉（part450）")
