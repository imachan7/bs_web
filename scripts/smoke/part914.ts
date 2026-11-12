// smoke パート914（召喚の後半は、前の段で選択待ちが立ったら止めて続きから進む。#437 F5）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import { fireSummonSequence } from "../../server/src/logic/summon"

const RUBICANTE = "P039" // 太陽伯爵ルビカンテ（召喚時：トラッシュの「太陽」スピリット1枚を手札に戻す）
const WYVERN = "BS11-004" // プロミネンスワイバーン（トラッシュにある間、「太陽」が召喚されたら召喚できる）
const SUN_A = "P038" // 太陽飛竜フレアドラグーン
const SUN_B = "P040" // 太陽巨兵ソーラー・ゴレム

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(WYVERN).effects.some((e) => e.kind === "trashSummonOnNameSummoned"), "ワイバーンはトラッシュから同名召喚に反応する")
    assert(getCard(SUN_A).name.includes("太陽") && getCard(SUN_B).name.includes("太陽"), "フレアドラグーン・ソーラー・ゴレムは「太陽」")
}

console.log("=== ルビカンテの召喚時のカード選択が先に出て、ワイバーンの確認はその後に出る（以前は上書きされて選択が消えた） ===")
{
    const s = createGame("p914", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.hand = []
    s.players.p1.trashCards = [SUN_A, SUN_B, WYVERN]
    const rubi = createInstance(RUBICANTE, s.turn, 1)
    s.players.p1.field.spirits.push(rubi)
    refreshLevelAsOverrides(s)
    fireSummonSequence(s, "p1", rubi)
    const first = s.pendingChoice
    assert(first?.kind === "card", `先にルビカンテのカード選択（${first?.kind}：${first?.prompt ?? "なし"}）`)
    act(s, "p1", { type: "resolveChoice", cardIndex: first!.cardIndices![0]! })
    assert(s.players.p1.hand.length === 1, "「太陽」1枚が手札に戻った")
    assert((s.pendingChoice?.prompt ?? "").includes("プロミネンスワイバーン"), `続いてワイバーンの確認（${s.pendingChoice?.prompt ?? "なし"}）`)
}

console.log("すべてのチェックに合格しました 🎉（part914）")
