// smoke パート91（簡略化の解消：公開ゾーン＝「デッキを上からN枚オープンする」の選択）
//
//   - BS01-067 スワロウアイヴィー / BS03-142 サルベージ（deckReveal）
//     「ネクサスカードがあれば、その中から1枚を選び、手札に加える。残ったカードは好きな順番でデッキの下に戻す」
//
// 従来は「一致する最初の1枚」を自動で手札に加え、残りは公開順のまま戻していた。
// GameState.revealedCards（公開ゾーン）と cardZone:"reveal" の card choice を新設し、
// 実対戦では手札に加える1枚と、デッキの下へ戻す順番を選べるようにした（順番はスキップ可）。
import { act, assert, createGame, resolveAction } from "./helpers"
import type { GameState } from "./helpers"

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    return s
}

// デッキ上5枚を「ネクサス2枚を含む」状態に固定する
function stackDeck(s: GameState): string[] {
    const top = ["BS01-001", "BS01-098", "BS01-002", "BS01-102", "BS01-050"]
    s.players.p1.deck = [...top, ...s.players.p1.deck]
    return top
}

console.log("=== deckReveal：手札に加えるネクサスを選べる ===")
{
    const s = setup("reveal-pick-test")
    s.interactiveTargets = true
    stackDeck(s) // 燃えさかる戦場(BS01-098) と 主無き古城(BS01-102) の2枚がネクサス
    const handBefore = s.players.p1.hand.length

    resolveAction(s, "p1", null, { type: "deckReveal", count: 5, pickType: "nexus" }, undefined, undefined, "spirit")

    assert(s.pendingChoice?.kind === "card", "カード選択待ちが立つ")
    assert(s.pendingChoice?.cardZone === "reveal", "選択元は公開ゾーン")
    assert(s.revealedCards?.cardIds.length === 5, "公開ゾーンに5枚が積まれている")
    assert((s.pendingChoice?.cardIndices ?? []).length === 2, "候補はネクサス2枚だけ")

    // 自動選択なら先に出てくる BS01-098 だが、後ろの BS01-102 を選ぶ
    const idx = s.revealedCards!.cardIds.indexOf("BS01-102")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: idx }) === null, "主無き古城を選ぶ")
    assert(s.players.p1.hand.includes("BS01-102"), "選んだネクサスが手札に加わる")
    assert(!s.players.p1.hand.includes("BS01-098"), "選ばなかったネクサスは手札に来ない")
    assert(s.players.p1.hand.length === handBefore + 1, "手札は1枚だけ増える")
}

console.log("--- 残りを戻す順番を選べる（スキップで現在の順のまま） ---")
{
    const s = setup("reveal-order-test")
    s.interactiveTargets = true
    stackDeck(s)

    resolveAction(s, "p1", null, { type: "deckReveal", count: 5, pickType: "nexus" }, undefined, undefined, "spirit")
    const pickIdx = s.revealedCards!.cardIds.indexOf("BS01-098")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: pickIdx }) === null, "ネクサスを1枚選ぶ")

    // 残り4枚 → 戻す順番の選択が続く（スキップ可）
    assert(s.pendingChoice?.cardZone === "reveal", "続けて戻す順番の選択待ちが立つ")
    assert(s.pendingChoice?.optional === true, "順番の選択はスキップできる")
    const remaining = [...s.revealedCards!.cardIds]
    assert(remaining.length === 4, "残りは4枚")

    // 先頭ではない BS01-050 を最初に戻す
    const firstBack = remaining.indexOf("BS01-050")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: firstBack }) === null, "戻す1枚目を選ぶ")
    assert(s.players.p1.deck[s.players.p1.deck.length - 1] === "BS01-050", "選んだカードがデッキの一番下へ")

    assert(act(s, "p1", { type: "resolveChoice" }) === null, "残りはスキップして現在の順のまま戻す")
    assert(s.pendingChoice === null, "選択は解消される")
    assert(s.revealedCards === undefined, "公開ゾーンは片付けられる")
    assert(s.players.p1.deck.length >= 4, "残りのカードがデッキへ戻っている")
}

console.log("--- 非対話時は従来どおり自動（最初の一致を手札へ、残りは公開順で戻す） ---")
{
    const s = setup("reveal-auto-test")
    stackDeck(s)

    resolveAction(s, "p1", null, { type: "deckReveal", count: 5, pickType: "nexus" }, undefined, undefined, "spirit")
    assert(s.pendingChoice === null, "選択待ちは立たない")
    assert(s.revealedCards === undefined, "公開ゾーンは使わない")
    assert(s.players.p1.hand.includes("BS01-098"), "最初に一致したネクサスが自動で手札へ")
}

console.log("--- 一致するカードが1枚だけなら選択を挟まない ---")
{
    const s = setup("reveal-single-test")
    s.interactiveTargets = true
    s.players.p1.deck = ["BS01-001", "BS01-098", "BS01-002", "BS01-050", "BS01-051", ...s.players.p1.deck]

    resolveAction(s, "p1", null, { type: "deckReveal", count: 5, pickType: "nexus" }, undefined, undefined, "spirit")
    assert(s.pendingChoice === null, "候補1枚なので手札追加の選択は立たない")
    assert(s.players.p1.hand.includes("BS01-098"), "唯一のネクサスが手札に加わる")
}
