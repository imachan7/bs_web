// smoke パート888（BS04-039 宝石虫スカラベール Lv2：【神速】を持つ自分のスピリットが BP比べで破壊されたとき、
// 自分のフィールド/リザーブのコア1個をトラッシュに置くことで手札に戻る）
// どこから払うかは持ち主がクリックして選ぶ（リザーブ／自分のスピリット・ネクサス。2026-11-11 ユーザー指示）。
// 破壊される本人のコアも払えるが、0個になると消滅の待機に変わって戻れないので2個以上のときだけ（PENDING_STATE.md・2026-11-11 ユーザー確認）
import { coreZoneChoiceId } from "../../shared/rules/activation"
import { assert, createGame, createInstance, destroySpirit, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const SCARABEL = "BS04-039"
const SOKU = "BS02-026" // マッハジー（効果は【神速】だけ）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(SCARABEL).name === "宝石虫スカラベール", "BS04-039 は宝石虫スカラベール")
assert(getCard(SOKU).name === "マッハジー", "BS02-026 はマッハジー")

function setup(seed: string, sokuCores: number, reserve: number) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.reserve = reserve
    const scarabel = createInstance(SCARABEL, s.turn, 3) // Lv2
    const soku = createInstance(SOKU, s.turn, sokuCores)
    s.players.p1.field.spirits.push(scarabel, soku)
    refreshLevelAsOverrides(s)
    // 相手のスピリットとBPを比べて破壊された
    destroySpirit(s, "p1", soku.instanceId, "destroy", { battle: { attackerLevel: 1, attackerBp: 9999, attackerColors: ["red"] }, battleLoser: true })
    // 「戻りますか」の確認には承認で答える（コストつきなので確認が出る。COST_MODEL.md §10）
    if (s.pendingChoice?.kind === "option") handleAction(s, "p1", { type: "resolveChoice", option: s.pendingChoice.options![0]! })
    return { s, scarabel, soku }
}

const pick = (s: GameState, id: string) => handleAction(s, "p1", { type: "resolveChoice", instanceId: id })

console.log("=== 候補が複数：リザーブ・スカラベール・本人（コア2個）から持ち主が選ぶ。本人を選ぶ ===")
{
    const { s, scarabel, soku } = setup("scarabel-pick-self", 2, 1)
    const pc = s.pendingChoice
    assert(pc?.kind === "target", "払う場所の選択が出る（自動では払わない）")
    const cands = pc?.candidates ?? []
    assert(cands.includes(coreZoneChoiceId("reserve", "p1")), "リザーブが候補")
    assert(cands.includes(scarabel.instanceId), "スカラベールが候補")
    assert(cands.includes(soku.instanceId), "コア2個の本人も候補")
    assert(pick(s, soku.instanceId) === null, "本人を選ぶ")
    assert(s.players.p1.hand.includes(SOKU), "マッハジーは手札に戻る")
    assert(scarabel.cores === 3, "スカラベールのコアは減らない")
    assert(s.players.p1.trashCores === 1, "トラッシュにコア1個")
    assert(s.players.p1.reserve === 2, "リザーブは減らず、本人に残っていたコア1個がリザーブへ（1→2）")
}

console.log("=== リザーブを選ぶ ===")
{
    const { s, scarabel } = setup("scarabel-pick-reserve", 2, 1)
    assert(pick(s, coreZoneChoiceId("reserve", "p1")) === null, "リザーブを選ぶ")
    assert(s.players.p1.hand.includes(SOKU), "マッハジーは手札に戻る")
    assert(scarabel.cores === 3 && s.players.p1.trashCores === 1, "リザーブから1個トラッシュへ")
    assert(s.players.p1.reserve === 2, "リザーブ 1−1＋本人のコア2個＝2")
}

console.log("=== 本人のコアが1個：本人は候補に出ない（0個で消滅になる）。リザーブ0なら候補はスカラベールだけなので選ばせずに払う ===")
{
    const { s, scarabel, soku } = setup("scarabel-self1", 1, 0)
    assert(s.pendingChoice === null, "候補が1つなら選択は出ない")
    assert(s.players.p1.hand.includes(SOKU), "マッハジーは手札に戻る")
    assert(scarabel.cores === 2, `スカラベールのコアから1個払う（実際: ${scarabel.cores}）`)
    assert(!s.players.p1.field.spirits.includes(soku), "本人は場にいない")
}

console.log("すべてのチェックに合格しました 🎉（part888）")
