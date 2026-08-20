// smoke パート173（deckReveal の公開ゾーン経由でデッキが減る不具合／BS06-107 セカンドサイトの並べ替え）
//
// card-notes の突き合わせ（2026-08-11）で見つかった2件。
//
// ① deckReveal は、公開ゾーンから「手札に加える1枚」が選ばれて**再入**したときにも
//    冒頭の deck.splice(0, count) を実行していた。公開済みのカードとは別に
//    デッキの上から count 枚が抜かれ、そのまま捨てられる（＝カードが消える）。
//    再入は interactiveTargets（実対戦）でしか通らないため、smoke では一度も踏まれていなかった。
//    影響：スワロウアイヴィー（5枚）・サルベージ（5枚）・闘将カタパルドス（2枚）・古将ドグウ・ゴレム（ネクサス数）。
//
// ② セカンドサイトのメインは noop で、カードテキストの「デッキの上から3枚オープンして、
//    好きな順番でデッキの上に戻す」が何も起きていなかった。
//    deckReveal に pickNone（拾わずに戻すだけ）、revealReturnToDeck に toTop（上へ戻す）を足して実装した。
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

function zoneCount(s: GameState): number {
    return s.revealedCards?.cardIds.length ?? 0
}
// デッキ＋手札＋トラッシュ＋公開ゾーンの総数（どこにも消えていないことの検算）
function totalCards(s: GameState): number {
    const p = s.players.p1
    return p.deck.length + p.hand.length + p.trashCards.length + zoneCount(s)
}

console.log("=== deckReveal：公開ゾーン経由で選んでもデッキが余計に減らない ===")
{
    const s = createGame("reveal-no-leak", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    const src = createInstance("BS01-067", s.turn, 1) // スワロウアイヴィー（デッキ上5枚を公開）
    s.players.p1.field.spirits.push(src)
    // ⚠️ デッキの**先頭にスピリットを2枚持ってくる**（2026-08-20 修正）。
    // createGame の seed は名前だけで、実際のシャッフルは Math.random（GameState.ts の shuffle）。
    // つまりデッキ順は実行のたびに変わる。
    // **公開ゾーンに乗るのは候補が2枚以上のときだけ**（deckRevealHandler は候補1枚なら選択を挟まず
    // 自動で手札に加えるので state.revealedCards が立たない）。1枚しか保証しないと
    // 上5枚のスピリットが1枚のときに落ちる——実測で10回に1回の頻度で落ちていた。
    // 総数を変えないよう、デッキ内のスピリットを2枚だけ先頭へ移す
    {
        const deck = s.players.p1.deck
        for (const slot of [1, 0]) {
            const idx = deck.findIndex((id, i) => i >= slot && getCard(id).type === "spirit")
            assert(idx >= 0, "デッキにスピリットが2枚はある（テストの前提）")
            if (idx > slot) {
                const [sp] = deck.splice(idx, 1)
                if (sp !== undefined) deck.splice(slot, 0, sp)
            }
        }
        assert(
            s.players.p1.deck.slice(0, 5).filter((id) => getCard(id).type === "spirit").length >= 2,
            "デッキ上5枚にスピリットが2枚以上ある（選択待ちが立つ前提）",
        )
    }
    const totalBefore = totalCards(s)
    const deckBefore = s.players.p1.deck.length

    resolveAction(s, "p1", src, { type: "deckReveal", count: 5, pickType: "spirit" })
    assert(zoneCount(s) === 5, "5枚が公開ゾーンに乗る")
    assert(s.players.p1.deck.length === deckBefore - 5, "公開したぶんだけデッキが減る")
    assert(s.pendingChoice?.kind === "card", "手札に加える1枚の選択待ちになる")

    const pick = s.pendingChoice?.cardIndices?.[0] ?? 0
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: pick }) === null, "1枚を選ぶ")
    assert(
        s.players.p1.deck.length === deckBefore - 5,
        "選んだ再入で、デッキの上からさらに5枚が抜かれたりしない",
    )

    // 残り4枚の「戻す順番」を最後まで進める（スキップ可なのでスキップで畳む）
    while (s.pendingChoice) assert(act(s, "p1", { type: "resolveChoice" }) === null, "戻す順番はスキップできる")
    assert(zoneCount(s) === 0, "公開ゾーンが片付く")
    assert(s.players.p1.hand.length === totalBefore - s.players.p1.deck.length, "手札に加わったのは1枚だけ")
    assert(totalCards(s) === totalBefore, "デッキ＋手札の総数が変わらない（カードが消えていない）")
}

console.log("=== セカンドサイト：デッキ上3枚を公開し、好きな順番で上に戻す ===")
{
    const s = createGame("second-sight", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    const src = createInstance("BS06-107", s.turn, 1)
    const top3 = s.players.p1.deck.slice(0, 3)
    const totalBefore = totalCards(s)

    resolveAction(s, "p1", src, { type: "deckReveal", count: 3, pickNone: true, returnToTop: true })
    assert(zoneCount(s) === 3, "3枚が公開される")
    assert(s.players.p1.hand.length === totalBefore - s.players.p1.deck.length - 3, "手札には加わらない")
    assert(s.pendingChoice?.optional === false, "上に戻す順番はスキップできない（残りが下に沈むため）")

    // 3枚目 → 2枚目 → 残り の順で選ぶ＝元の並びを逆にする
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 2 }) === null, "1番上に置くカードを選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 1 }) === null, "2番目に置くカードを選ぶ")
    assert(s.pendingChoice === null, "残り1枚は自動で戻る")
    assert(zoneCount(s) === 0, "公開ゾーンが片付く")
    assert(
        JSON.stringify(s.players.p1.deck.slice(0, 3)) === JSON.stringify([top3[2], top3[1], top3[0]]),
        "選んだ順（先に選んだカードが上）でデッキの上に戻る",
    )
    assert(totalCards(s) === totalBefore, "総数が変わらない")
}

console.log("=== セカンドサイト：非対話（smokeの既定）では同じ順のまま戻す ===")
{
    const s = createGame("second-sight-auto", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const src = createInstance("BS06-107", s.turn, 1)
    const top3 = s.players.p1.deck.slice(0, 3)
    const deckBefore = s.players.p1.deck.length

    resolveAction(s, "p1", src, { type: "deckReveal", count: 3, pickNone: true, returnToTop: true })
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(zoneCount(s) === 0, "公開ゾーンが残らない")
    assert(s.players.p1.deck.length === deckBefore, "デッキ枚数が変わらない")
    assert(
        JSON.stringify(s.players.p1.deck.slice(0, 3)) === JSON.stringify(top3),
        "同じ順のままデッキの上に戻る",
    )
}
