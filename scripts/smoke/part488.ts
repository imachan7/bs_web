// smoke パート488（「Lv◯BPを◯として扱う」は【装甲】で防げる。2026-10-08 ユーザー確認）
import { assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const BETOR = "BS12-037" // オリンピアの天使ベトール（黄）
const ARMET = "BS05-028" // アーメットクラブ（【装甲：黄】）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BETOR).name === "オリンピアの天使ベトール" && getCard(BETOR).colors.includes("yellow"), "BETORは黄のベトール")
    assert(getCard(ARMET).name === "アーメットクラブ", "ARMETはアーメットクラブ")
}

function game(): GameState {
    const s = createGame("bpas-armor", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}
const betorAction = (getCard(BETOR).effects.find((e) => e.id === "BS12-037-e1") as unknown as { action: EffectAction }).action

console.log("=== 1. 【装甲：黄】を持つスピリットはベトールのBP書き換えを受けない ===")
{
    const s = game()
    const armet = createInstance(ARMET, s.turn, 1)
    s.players.p2.field.spirits.push(armet)
    refreshLevelAsOverrides(s)
    const before = effectiveBp(s, "p2", armet)
    resolveAction(s, "p1", null, betorAction, armet.instanceId, ["yellow"], "spirit")
    assert(effectiveBp(s, "p2", armet) === before, `BPは変わらない（${before}→${effectiveBp(s, "p2", armet)}）`)
}

console.log("=== 2. 【装甲】が無ければ受ける ===")
{
    const s = game()
    const v = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.spirits.push(v)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, betorAction, v.instanceId, ["yellow"], "spirit")
    assert(effectiveBp(s, "p2", v) === 2000, `BPは2000（実際 ${effectiveBp(s, "p2", v)}）`)
}

console.log("すべてのチェックに合格しました 🎉（part488）")
