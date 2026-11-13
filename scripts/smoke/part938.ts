// smoke パート938（マクラーンスラッシュの対象「『ブロック時』効果を持つ自分のスピリット」を、印刷された見出しで選ぶ。#527）
// 『ブロック時』の結果連動型（BPを比べ破壊したとき 等）だけを持つスピリットも候補になる
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart, timedHas } from "./helpers"

const MACLAAN = "BS07-078" // マクラーンスラッシュ
const LIORIDER = "BS02-041" // ライオライダー：Lv2『このスピリットのブロック時』BPを比べ相手のスピリットだけを破壊したとき、このスピリットは回復する

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(MACLAAN).name === "マクラーンスラッシュ", "MACLAAN")
assert(getCard(LIORIDER).name === "ライオライダー", "LIORIDER")

const swap = (getCard(MACLAAN).effects.find((e) => e.id === "BS07-078-e1") as { action: unknown }).action as never

console.log("=== 『ブロック時』の結果連動型だけを持つスピリットを指定できる ===")
{
    const s = createGame("t938", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    const lio = createInstance(LIORIDER, s.turn, 3)
    s.players.p1.field.spirits.push(lio)
    resolveAction(s, "p1", null, swap, undefined, undefined, "magic")
    assert(timedHas(s, lio, "triggerSwap"), "ライオライダーが対象になる")
}

console.log("すべてのチェックに合格しました 🎉（part938）")
