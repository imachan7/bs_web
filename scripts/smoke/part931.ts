// smoke パート931（BS14-055 ミスティック・ヒミコ Lv3：自分の黄のマジック1枚をコストを支払わずに使用できる。#514）
// 対象は手札か手元（Q3417「手札かオープンしているマジックカード」。トラッシュは不可）。手元は使用権の無いカードも含む（2026-11-13 ユーザー確認）
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const HIMIKO = "BS14-055"
const DELIVERY = "BS11-081" // ライトニングデリバリー（黄・フラッシュ：1枚ドロー）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(HIMIKO).name === "ミスティック・ヒミコ", "HIMIKO はミスティック・ヒミコ")
assert(getCard(DELIVERY).name === "ライトニングデリバリー" && getCard(DELIVERY).colors.includes("yellow"), "DELIVERY は黄のマジック")

const himikoAction = (getCard(HIMIKO).effects.find((e) => e.id === "BS14-055-e3") as { action: unknown }).action

function game(seed: string): { s: GameState; himiko: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.deck = Array.from({ length: 20 }, () => VANILLA)
    s.players.p1.hand = []
    const himiko = createInstance(HIMIKO, s.turn, 4)
    s.players.p1.field.spirits.push(himiko)
    return { s, himiko }
}

console.log("=== 使用権の無い手元の黄のマジックを使える ===")
{
    const { s, himiko } = game("t931-tegamoto")
    s.players.p1.tegamoto = [DELIVERY]
    s.players.p1.tegamotoPlayable = []
    resolveAction(s, "p1", himiko, himikoAction as never)
    assert(!s.players.p1.tegamoto.includes(DELIVERY), "手元から使用された")
    assert(s.players.p1.trashCards.includes(DELIVERY), "使用後はトラッシュへ")
    assert(s.players.p1.hand.length === 1, "効果（1枚ドロー）が解決した")
}

console.log("=== トラッシュの黄のマジックは使えない（Q3417） ===")
{
    const { s, himiko } = game("t931-trash")
    s.players.p1.trashCards = [DELIVERY]
    resolveAction(s, "p1", himiko, himikoAction as never)
    assert(s.players.p1.hand.length === 0, "ドローしない")
    assert(s.players.p1.trashCards.filter((c) => c === DELIVERY).length === 1, "トラッシュのカードはそのまま")
}

console.log("すべてのチェックに合格しました 🎉（part931）")
