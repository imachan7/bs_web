// smoke パート211（S7「誰が選ぶか」の続き：ブラッディレインの取り先を相手に選ばせる）
//
// BS02-094 ブラッディレイン メイン：
// 「相手のフィールド/トラッシュ/リザーブにコアが合計10個～19個あるとき、
//   **相手は**その中から2個をボイドに置く。コアが合計20個以上あるとき、**相手は**その中から、コア6個をボイドに置く。」
//
// 主語が「相手は」なのに、実装（opponentCoresToVoidByTotal）は対話モードでも
// リザーブ→トラッシュ→フィールドの順に**機械的に取っていた**。どのゾーンのコアを失うかで
// 盤面が変わるので、1個ずつ相手に選ばせる（2026-08-17 ユーザー確認。CHOOSER_RULES.md §1.6）。
//
// 解決は発生源の持ち主の効果のまま（装甲・効果耐性の判定基準を変えない）。
// 選択者だけ相手に差し替えるのは requestChoice の chooserPid ＝ PendingChoice.actorPid の形。
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const BLOODY_RAIN = "BS02-094" // ブラッディレイン
const VANILLA = "BS01-002" // ロクケラトプス（バニラ。コアの置き場として使う）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard(BLOODY_RAIN).name === "ブラッディレイン", "BS02-094 はブラッディレイン")
    assert(getCard(BLOODY_RAIN).effect.includes("相手はその中から2個をボイドに置く"), "効果文の主語は「相手は」")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effects.length === 0, "BS01-002 はロクケラトプス（バニラ）")
}

// p1 がブラッディレインを使い、p2 がコアを失う。
// コア合計が10個以上19個以下になるように積んで、2個ぶんの選択が起きる状態を作る
function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p2.field.spirits = []
    s.players.p2.field.nexuses = []
    const sp = createInstance(VANILLA, s.turn, 4)
    s.players.p2.field.spirits.push(sp)
    s.players.p2.reserve = 5
    s.players.p2.trashCores = 3
    return s
}

function totalOf(s: GameState): number {
    const p = s.players.p2
    return (
        p.reserve +
        p.trashCores +
        p.field.spirits.reduce((n, x) => n + x.cores, 0) +
        p.field.nexuses.reduce((n, x) => n + x.cores, 0)
    )
}

console.log("=== 取り先は相手が選ぶ（選択者と解決の主体が分かれる） ===")
{
    const s = setup("bloodyrain-chooser")
    const src = createInstance(BLOODY_RAIN, s.turn, 1)
    assert(totalOf(s) === 12, "コア合計は12個（10〜19の段＝2個をボイドへ）")

    resolveAction(s, "p1", src, { type: "opponentCoresToVoidByTotal", tiers: [{ minTotal: 10, count: 2 }, { minTotal: 20, count: 6 }] })

    assert(s.pendingChoice !== null, "取り先の選択待ちになる")
    assert(s.pendingChoice?.kind === "option", "選択肢固定式（ゾーンとフィールドの個体を並べる）")
    assert(s.pendingChoice?.pid === "p2", "選ぶのはコアを失う側（p2）")
    assert(s.pendingChoice?.actorPid === "p1", "解決は発生源の持ち主（p1）の効果として行う")
    const opts = s.pendingChoice?.options ?? []
    assert(opts.includes("リザーブ"), "リザーブが候補に出る")
    assert(opts.includes("トラッシュ"), "トラッシュが候補に出る")
    assert(opts.includes("ロクケラトプス"), "フィールドの個体も候補に出る")
}

console.log("=== 発生源の持ち主は選べない ===")
{
    const s = setup("bloodyrain-not-owner")
    const src = createInstance(BLOODY_RAIN, s.turn, 1)
    resolveAction(s, "p1", src, { type: "opponentCoresToVoidByTotal", tiers: [{ minTotal: 10, count: 2 }] })
    assert(act(s, "p1", { type: "resolveChoice", option: "リザーブ" }) !== null, "p1 が選ぼうとしても拒否される")
}

console.log("=== 相手が選んだゾーンから1個ずつ減り、指定個数で止まる ===")
{
    const s = setup("bloodyrain-resolve")
    const src = createInstance(BLOODY_RAIN, s.turn, 1)
    resolveAction(s, "p1", src, { type: "opponentCoresToVoidByTotal", tiers: [{ minTotal: 10, count: 2 }] })

    const reserveBefore = s.players.p2.reserve
    const spiritBefore = s.players.p2.field.spirits[0]?.cores ?? -1
    assert(act(s, "p2", { type: "resolveChoice", option: "ロクケラトプス" }) === null, "1個目はフィールドの個体から取る")
    assert(s.players.p2.field.spirits[0]?.cores === spiritBefore - 1, "選んだスピリットのコアが1個減る")
    assert(s.players.p2.reserve === reserveBefore, "選んでいないリザーブは減らない（機械的な順序ではない）")

    assert(s.pendingChoice !== null, "残り1個ぶんの選択待ちが続く")
    assert(act(s, "p2", { type: "resolveChoice", option: "リザーブ" }) === null, "2個目はリザーブから取る")
    assert(s.players.p2.reserve === reserveBefore - 1, "リザーブが1個減る")

    assert(s.pendingChoice === null, "2個で止まる（指定個数ちょうど）")
    assert(totalOf(s) === 10, "コア合計は12個から2個減って10個")
}

console.log("=== 非対話（テスト・自動解決）では従来どおりの決定的簡略化 ===")
{
    const s = setup("bloodyrain-auto")
    s.interactiveTargets = false
    const src = createInstance(BLOODY_RAIN, s.turn, 1)
    resolveAction(s, "p1", src, { type: "opponentCoresToVoidByTotal", tiers: [{ minTotal: 10, count: 2 }] })
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(s.players.p2.reserve === 3, "リザーブから先に2個取る（従来の簡略化を変えていない）")
    assert(totalOf(s) === 10, "合計は2個減る")
}
