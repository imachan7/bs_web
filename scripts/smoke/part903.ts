// smoke パート903（効果による召喚の「払えるか」とおまかせの払い方を summonPayPlan 1つに揃える。#437 R9-2）
import { assert, createGame, createInstance, getCard, handleAction, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { askSummonCores } from "../../server/src/logic/summonCores"

const HUGO = "P012" // 三叉槍のヒューゴー（Lv1 維持コア1）
const VANILLA = "BS01-002" // ロクケラトプス（Lv1 維持コア1）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HUGO).name === "三叉槍のヒューゴー" && getCard(HUGO).levels[0]!.cores === 1, "HUGOは三叉槍のヒューゴー（Lv1 コア1）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).levels[0]!.cores === 1, "VANILLAはロクケラトプス（Lv1 コア1）")
}

// リザーブ0・場に VANILLA（cores 個）だけ・手札に HUGO
function game(seed: string, cores: number, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.phase = "main"
    s.interactiveTargets = interactive
    const p = s.players.p1
    p.reserve = 0
    p.field.spirits = [createInstance(VANILLA, s.turn, cores)]
    p.hand = [HUGO]
    return s
}
const resume = { type: "summonFreeIndexInternal", zone: "hand", index: 0 } as Parameters<typeof askSummonCores>[4]
const hugoOnField = (s: GameState) => s.players.p1.field.spirits.some((sp) => sp.cardId === HUGO)

console.log("=== 選択肢に出た置き数は、支払い元を指定しない答え（AI・おまかせ）でも払える ===")
{
    const s = game("p903-1", 1, true)
    assert(askSummonCores(s, "p1", getCard(HUGO), 0, resume), "置くコアの待ちが立つ")
    const pc = s.pendingChoice!
    const vanilla = s.players.p1.field.spirits[0]!
    assert(JSON.stringify(pc.effectCostPay?.suggestByOption) === JSON.stringify([[{ instanceId: vanilla.instanceId, count: 1 }]]), `おまかせの払い方を画面に渡す（${JSON.stringify(pc.effectCostPay?.suggestByOption)}）`)
    const err = handleAction(s, "p1", { type: "resolveChoice", option: pc.options![0] } as Parameters<typeof handleAction>[2])
    assert(err === null || err === undefined, `支払い元なしの答えが通る（${String(err)}）`)
    assert(hugoOnField(s) && !s.players.p1.field.spirits.some((sp) => sp.cardId === VANILLA), "ヒューゴーが出て、コアを出したロクケラトプスは消滅")
}

console.log("=== おまかせは維持コアを残せるならそちらで払う ===")
{
    const s = game("p903-2", 3, true)
    assert(askSummonCores(s, "p1", getCard(HUGO), 0, resume), "置くコアの待ちが立つ")
    handleAction(s, "p1", { type: "resolveChoice", option: s.pendingChoice!.options![0] } as Parameters<typeof handleAction>[2])
    const v = s.players.p1.field.spirits.find((sp) => sp.cardId === VANILLA)
    assert(hugoOnField(s) && v?.cores === 2, `ロクケラトプスはコア2個で残る（${String(v?.cores)}）`)
}

console.log("=== 対話でないときも同じ基準（以前はリザーブだけを見て召喚できなかった） ===")
{
    const s = game("p903-3", 1, false)
    resolveAction(s, "p1", null, resume)
    assert(hugoOnField(s), "対話でなくても、味方のコアで払って召喚できる")
}

console.log("すべてのチェックに合格しました 🎉（part903）")
