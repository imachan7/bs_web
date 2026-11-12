// smoke パート903（効果による召喚の「払えるか」とおまかせの払い方を summonPayPlan 1つに揃える。#437 R9-2）
import { assert, createGame, createInstance, getCard, handleAction, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { askSummonCores } from "../../server/src/logic/summonCores"
import { fushiSummonOrConfirm } from "../../server/src/logic/revive"
import { effectiveCost } from "../../shared/cost"

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

// 【不死】：通常の道（コストを払う）と魔門の道（BS15-064 Lv2 を疲労させて無償）
const FOGNIX = "BS14-021" // 不紫鳥フォグニクス（召喚時に Lv と同じ枚数ドロー）
const MAMON = "BS15-064" // 冥府へ続く魔門
const PURPLE = "BS15-011" // 紫のスピリット（Lv1 維持コア1）

// トラッシュにフォグニクス、場に魔門（Lv2）と紫のスピリット1体（Lv1）。
// sacrificeOnly：リザーブを「魔門のコアまで使っても1個足りない」にする＝通常の道は紫のスピリットを消滅させないと払えない
function fushiGame(seed: string, interactive: boolean, sacrificeOnly: boolean) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.phase = "attack"
    const p = s.players.p1
    const mamon = createInstance(MAMON, s.turn, 2)
    p.field.nexuses.push(mamon)
    const purple = createInstance(PURPLE, s.turn, 1)
    p.field.spirits.push(purple)
    p.trashCards = [FOGNIX]
    const need = effectiveCost(s, "p1", getCard(FOGNIX)) + getCard(FOGNIX).levels[0]!.cores
    p.reserve = sacrificeOnly ? need - 2 - 1 : 20
    return { s, mamon, purple, hand: p.hand.length }
}
const fognixOnField = (s: GameState) => s.players.p1.field.spirits.some((sp) => sp.cardId === FOGNIX)

console.log("=== 前提: 【不死】の場面のカード ===")
{
    assert(getCard(FOGNIX).name === "不紫鳥フォグニクス" && getCard(MAMON).name === "冥府へ続く魔門", "FOGNIX・MAMON の名前")
    assert(getCard(PURPLE).colors.includes("purple") && getCard(PURPLE).levels[0]!.cores === 1, "PURPLE は紫で Lv1 維持コア1")
    const { s } = fushiGame("p903-f0", false, true)
    assert(s.players.p1.reserve >= 0, `場面が組める（リザーブ${s.players.p1.reserve}）`)
}

console.log("=== 対話：通常の道が味方を消滅させないと払えなくても、両方の選択肢が出る。通常の道を選ぶと消滅させて払い、召喚時効果が出る ===")
{
    const { s, mamon, purple, hand } = fushiGame("p903-f1", true, true)
    fushiSummonOrConfirm(s, "p1", 0)
    const options = s.pendingChoice?.options ?? []
    assert(options.includes("コストを支払って召喚する") && options.includes("魔門を疲労させて無償で召喚する"), `両方の選択肢が出る（${options.join("／")}）`)
    handleAction(s, "p1", { type: "resolveChoice", option: "コストを支払って召喚する" } as Parameters<typeof handleAction>[2])
    // 置くコアの待ち。支払い元を指定しない答え（おまかせ）で払う
    const pay = s.pendingChoice?.effectCostPay
    assert(pay?.suggestByOption?.[0]?.some((x) => x.instanceId === purple.instanceId) === true, "おまかせの払い方に紫のスピリットが入る")
    const err = handleAction(s, "p1", { type: "resolveChoice", option: s.pendingChoice!.options![0] } as Parameters<typeof handleAction>[2])
    assert(err === null || err === undefined, `おまかせで払える（${String(err)}）`)
    assert(fognixOnField(s) && !s.players.p1.field.spirits.includes(purple), "フォグニクスが出て、紫のスピリットは消滅")
    assert(!mamon.isRested, "魔門は疲労しない")
    assert(s.players.p1.hand.length === hand + 1, "召喚時効果でドローする")
}

console.log("=== 対話：同じ盤面で魔門の道を選ぶと、味方は残り、召喚時効果は出ない ===")
{
    const { s, mamon, purple, hand } = fushiGame("p903-f2", true, true)
    fushiSummonOrConfirm(s, "p1", 0)
    handleAction(s, "p1", { type: "resolveChoice", option: "魔門を疲労させて無償で召喚する" } as Parameters<typeof handleAction>[2])
    while (s.pendingChoice?.effectCostPay) handleAction(s, "p1", { type: "resolveChoice", option: s.pendingChoice.options![0] } as Parameters<typeof handleAction>[2])
    assert(fognixOnField(s) && s.players.p1.field.spirits.includes(purple), "フォグニクスが出て、紫のスピリットは残る")
    assert(mamon.isRested && s.players.p1.hand.length === hand, "魔門が疲労し、ドローしない")
}

console.log("=== 対話なしの既定：味方を削らずに払えるなら通常の道 ===")
{
    const { s, mamon, hand } = fushiGame("p903-f3", false, false)
    fushiSummonOrConfirm(s, "p1", 0)
    assert(fognixOnField(s) && !mamon.isRested && s.players.p1.hand.length === hand + 1, "通常の道（魔門は疲労せず、ドローする）")
}

console.log("=== 対話なしの既定：味方を削らないと払えないなら魔門の道 ===")
{
    const { s, mamon, purple, hand } = fushiGame("p903-f4", false, true)
    fushiSummonOrConfirm(s, "p1", 0)
    assert(fognixOnField(s) && mamon.isRested && s.players.p1.hand.length === hand, "魔門の道（魔門が疲労し、ドローしない）")
    assert(s.players.p1.field.spirits.includes(purple), "紫のスピリットは残る")
}

console.log("すべてのチェックに合格しました 🎉（part903）")
