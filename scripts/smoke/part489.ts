// smoke パート489（ブロック宣言で誘発する効果はすべて同時発揮で、解決順はターンプレイヤーが選ぶ。
// TIMING_CHART ＞３-2B・§0-3。2026-10-08 ユーザー確認）
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const STEGO = "BS03-008" // 剣竜ステゴラーサウルス（ブロックされたとき：このバトルの間 BP+3000）
const ASPIDO = "BS09-041" // アスピドケルン（ブロック時：1枚ドロー）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(STEGO).name === "剣竜ステゴラーサウルス", "STEGOは剣竜ステゴラーサウルス")
    assert(getCard(ASPIDO).name === "アスピドケルン", "ASPIDOはアスピドケルン")
}

function setup(): { s: GameState; stego: ReturnType<typeof createInstance>; aspido: ReturnType<typeof createInstance> } {
    const s = createGame("block-order", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "yellow" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.hand = []
    const stego = createInstance(STEGO, s.turn, 2)
    const aspido = createInstance(ASPIDO, s.turn, 1)
    s.players.p1.field.spirits.push(stego)
    s.players.p2.field.spirits.push(aspido)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: stego.instanceId }) === null, "ステゴラーサウルスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: aspido.instanceId }) === null, "アスピドケルンでブロック")
    return { s, stego, aspido }
}

for (const pickIndex of [0, 1]) {
    console.log(`=== ${pickIndex + 1}. ブロック時と「ブロックされたとき」は同時発揮。ターンプレイヤーが${pickIndex + 1}番目を先に選ぶ ===`)
    const { s, stego, aspido } = setup()
    const pc = s.pendingChoice
    assert(pc?.triggerOrder !== undefined, "解決順の選択が立つ")
    assert(pc?.pid === "p1", "選ぶのはターンプレイヤー（攻撃側）")
    const options = pc?.options ?? []
    assert(options.length === 2, `候補は2つ（${options.join(" / ")}）`)
    assert(options.some((o) => o.includes("アスピドケルン")) && options.some((o) => o.includes("剣竜ステゴラーサウルス")), "両方のカードが候補に出る")
    assert(act(s, "p1", { type: "resolveChoice", option: options[pickIndex]! }) === null, "先に解決する効果を選ぶ")
    assert(s.pendingChoice === null || s.pendingChoice?.triggerOrder === undefined, "残り1つは聞かずに解決する")
    assert(s.players.p2.hand.length === 1, `アスピドケルンの持ち主が1枚ドローした（手札${s.players.p2.hand.length}枚）`)
    assert(effectiveBp(s, "p1", stego) === 7000, `ステゴラーサウルスはBP+3000（${effectiveBp(s, "p1", stego)}）`)
}

console.log("すべてのチェックに合格しました 🎉（part489）")
