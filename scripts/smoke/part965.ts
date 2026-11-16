// smoke パート965（フラッシュマジックをメインステップで使えるか。#581）
//   - アブソーブシンボル・エターナルシールドは「メインステップで使用できない」の記載が無いので、メインステップで使える
//   - 対照のゴッドスピードは記載があるので、メインステップで拒否される
import { act, assert, createGame, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const ABSORB = "BS05-072" // アブソーブシンボル（紫・コスト4のマジック。フラッシュ）
const ETERNAL = "BS05-076" // エターナルシールド（白・コスト4のマジック。フラッシュ）
const GODSPEED = "BS05-073" // ゴッドスピード（緑・コスト3のマジック。メインステップ不可）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(ABSORB).name === "アブソーブシンボル" && getCard(ABSORB).type === "magic", "ABSORB")
assert(getCard(ETERNAL).name === "エターナルシールド" && getCard(ETERNAL).type === "magic", "ETERNAL")
assert(getCard(GODSPEED).name === "ゴッドスピード" && getCard(GODSPEED).type === "magic", "GODSPEED")

function game(seed: string, handCard: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.hand = [handCard]
    return s
}

console.log("=== アブソーブシンボル：メインステップで使用できる ===")
{
    const s = game("p965-absorb", ABSORB)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "アブソーブシンボルはメインステップで使える")
}

console.log("=== エターナルシールド：メインステップで使用できる ===")
{
    const s = game("p965-eternal", ETERNAL)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "エターナルシールドはメインステップで使える")
}

console.log("=== 対照：ゴッドスピードはメインステップで拒否される ===")
{
    const s = game("p965-godspeed", GODSPEED)
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    assert(typeof err === "string" && err.length > 0, "ゴッドスピードはメインステップで拒否される")
}

console.log("すべてのチェックに合格しました 🎉（part965）")
