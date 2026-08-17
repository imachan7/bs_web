// smoke パート214（実プレイで見つかった不具合①：ステップ誘発が選択待ちで打ち切られていた）
//
// BS06-073 灼熱の谷 Lv1･Lv2『自分のドローステップ』
// 「ドローの枚数を+1枚する。ドロー後、自分は手札1枚を破棄する。」
//
// これを**2枚並べる**と、破棄は2枚になるはずが1枚しか起きなかった。
// 原因は fireStepTriggers が、選択待ち（どの手札を破棄するか）が立った時点で
// `return` するだけで、**同じステップの残りの誘発を再開スタックへ積んでいなかった**こと。
// 1枚目の破棄で中断したまま、2枚目のぶんが永久に失われていた。
//
// 灼熱の谷に限らず「ステップ誘発が2つ以上あって、先のものが選択を出す」全ケースが該当する。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { fireStepTriggers } from "../../server/src/logic/triggers"

const VALLEY = "BS06-073" // 灼熱の谷

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard(VALLEY).name === "灼熱の谷" && getCard(VALLEY).type === "nexus", "BS06-073 は灼熱の谷（ネクサス）")
    const steps = getCard(VALLEY).effects.filter((e) => e.kind === "step")
    assert(steps.length === 2, "『自分のドローステップ』のステップ誘発を2つ持つ（ドロー+1と手札破棄）")
}

// 灼熱の谷を n 枚置いた状態で、自分のドローステップの誘発を発火させる
function setup(n: number, interactive: boolean): GameState {
    const s = createGame(`valley-${n}-${interactive}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.turnPlayer = "p1"
    s.phase = "draw"
    for (let i = 0; i < n; i++) s.players.p1.field.nexuses.push(createInstance(VALLEY, s.turn, 1))
    // 手札は重複しない4枚に固定する（何枚捨てられたかを枚数で数えるため）
    s.players.p1.hand = ["BS01-001", "BS01-002", "BS01-003", "BS01-004"]
    return s
}

console.log("=== 1枚のとき：ドロー+1、破棄1枚 ===")
{
    const s = setup(1, false) // 非対話（自動選択）でまず素の枚数を確かめる
    const deckBefore = s.players.p1.deck.length
    const handBefore = s.players.p1.hand.length
    fireStepTriggers(s, "draw", undefined, "enter", "all")
    assert(s.players.p1.deck.length === deckBefore - 1, "デッキが1枚減る（ドロー+1）")
    assert(s.players.p1.hand.length === handBefore + 1 - 1, "引いた1枚と破棄1枚で差し引き同数")
    assert(s.players.p1.trashCards.length === 1, "破棄されたのは1枚")
}

console.log("=== 2枚のとき：ドロー+2、破棄2枚（非対話） ===")
{
    const s = setup(2, false)
    const deckBefore = s.players.p1.deck.length
    fireStepTriggers(s, "draw", undefined, "enter", "all")
    assert(s.players.p1.deck.length === deckBefore - 2, "デッキが2枚減る（ドロー+1が2回）")
    assert(s.players.p1.trashCards.length === 2, "破棄も2枚になる")
}

console.log("=== 2枚のとき：実対戦でも破棄は2回聞かれる（ここが直った点） ===")
{
    const s = setup(2, true)
    const deckBefore = s.players.p1.deck.length
    fireStepTriggers(s, "draw", undefined, "enter", "all")

    // 1枚目の破棄で選択待ちになる
    assert(s.pendingChoice !== null, "1回目の破棄で選択待ちになる")
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice?.cardZone === "hand", "手札から選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "1枚目を選ぶ")

    // 直す前はここで終わっていた（2枚目の誘発が失われていた）
    assert(s.pendingChoice !== null, "2枚目の灼熱の谷ぶん、もう一度聞かれる")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "2枚目を選ぶ")

    assert(s.pendingChoice === null, "2回で終わる")
    assert(s.players.p1.trashCards.length === 2, "破棄は合計2枚")
    assert(s.players.p1.deck.length === deckBefore - 2, "ドローも2回ぶん")
}

console.log("=== 3枚並べれば3回（取りこぼしが枚数に比例して起きないこと） ===")
{
    const s = setup(3, true)
    fireStepTriggers(s, "draw", undefined, "enter", "all")
    let asked = 0
    while (s.pendingChoice) {
        assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, `${asked + 1}回目の破棄を選ぶ`)
        asked++
        if (asked > 5) break // 無限ループ防止
    }
    assert(asked === 3, "3枚ぶん聞かれる")
    assert(s.players.p1.trashCards.length === 3, "破棄は合計3枚")
}
