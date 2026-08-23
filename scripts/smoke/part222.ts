// smoke パート222（起動能力の対象選択を「やめられる」ようにする。2026-08-21 ユーザー確定）
// 収録セクション:
//   - 起動ボタン → 対象選択（候補が1枚でも必ず聞く。summonFromHandFree.cancelable）
//   - 選択を**やめたら**「ターンに1回」を消費せず、同じターンにもう一度起動できる
//   - 選んで召喚したときは従来どおり消費する（2回目は拒否）
//   - 召喚できる手札が無いときも消費しない（対象がいない＝発揮しなかった扱い）
//
// pendingChoice をこのテスト自身が検査するため、選択を自動応答する act ラッパーではなく
// handleAction を直接呼ぶ（helpers.act は対話モードで pendingChoice を先に消化してしまう）
import { assert, createGame, createInstance, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

// BS08-034 空帝竜騎プラチナム：Lv1-3『自分のメインステップ』ターンに1回、手札の【転召】持ちを
//   【転召】させずに召喚できる（part219 と同じ器。ここでは中断・再開の側を見る）
const PLATINUM = "BS08-034"
const PLATINUM_EFFECT = "BS08-034-e1"
const ZABURUGAN = "BS07-017" // 【転召】持ちコスト6
const NO_TENSHO = "BS01-004" // ドラグノ偵察兵：【転召】を持たない＝候補にならない

function setup(name: string): { s: GameState; platinumId: string } {
    const s = createGame(name, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "purple" })
    runTurnStart(s)
    // 実サーバーと同じく選択式で動かす（cancelable はこの経路でだけ効く）
    s.interactiveTargets = true
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 30
    const platinum = createInstance(PLATINUM, s.turn, 1)
    s.players.p1.field.spirits.push(platinum)
    return { s, platinumId: platinum.instanceId }
}

const activate = (s: GameState, instanceId: string): string | null =>
    handleAction(s, "p1", { type: "activateAbility", instanceId, effectId: PLATINUM_EFFECT })

console.log("=== 起動：候補が1枚でも選択を出し、やめられる ===")
{
    const { s, platinumId } = setup("activate-cancelable-ask")
    s.players.p1.hand = [ZABURUGAN]
    assert(activate(s, platinumId) === null, "起動できる")
    const pending = s.pendingChoice
    assert(!!pending, "候補が1枚でも選択待ちになる（自動で召喚しない）")
    assert(pending!.kind === "card" && pending!.cardZone === "hand", "手札からの選択として出る")
    assert(pending!.optional, "「やめる」を選べる（optional）")
    assert(s.players.p1.hand.includes(ZABURUGAN), "選ぶ前は手札に残っている")
}

console.log("=== 起動：選択をやめたら「ターンに1回」を消費せず、もう一度起動できる ===")
{
    const { s, platinumId } = setup("activate-cancel-revert")
    s.players.p1.hand = [ZABURUGAN]
    assert(activate(s, platinumId) === null, "1回目の起動")
    // 「選ばない」＝ instanceId も cardIndex も渡さない
    assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, "選択をやめられる")
    assert(s.pendingChoice === null, "選択待ちが解消する")
    assert(s.players.p1.hand.includes(ZABURUGAN), "召喚されていない")
    const inst = s.players.p1.field.spirits.find((sp) => sp.instanceId === platinumId)!
    assert(
        inst.activatedUsedTurn?.[PLATINUM_EFFECT] === undefined,
        "「ターンに1回」の記録が消えている（発揮しなかった扱い）",
    )
    assert(activate(s, platinumId) === null, "同じターンにもう一度起動できる")
    assert(!!s.pendingChoice, "また対象選択に入る")
}

console.log("=== 起動：選んで召喚したら従来どおり消費する ===")
{
    const { s, platinumId } = setup("activate-summon-consumes")
    s.players.p1.hand = [ZABURUGAN, ZABURUGAN]
    assert(activate(s, platinumId) === null, "起動できる")
    const idx = s.pendingChoice!.cardIndices![0]!
    assert(handleAction(s, "p1", { type: "resolveChoice", cardIndex: idx }) === null, "手札を選べる")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === ZABURUGAN),
        "選んだスピリットが召喚される",
    )
    const inst = s.players.p1.field.spirits.find((sp) => sp.instanceId === platinumId)!
    assert(inst.activatedUsedTurn?.[PLATINUM_EFFECT] === s.turn, "「ターンに1回」が消費されている")
    assert(activate(s, platinumId) !== null, "2回目は拒否される")
}

console.log("=== 起動：召喚できる手札が無ければ消費しない ===")
{
    const { s, platinumId } = setup("activate-no-candidate")
    s.players.p1.hand = [NO_TENSHO] // 【転召】を持たない＝候補0枚
    assert(activate(s, platinumId) === null, "起動そのものは通る")
    assert(s.pendingChoice === null, "選択待ちにはならない")
    const inst = s.players.p1.field.spirits.find((sp) => sp.instanceId === platinumId)!
    assert(
        inst.activatedUsedTurn?.[PLATINUM_EFFECT] === undefined,
        "対象がいなければ「ターンに1回」を消費しない",
    )
    // 候補が出来たら同じターンに起動できる
    s.players.p1.hand = [ZABURUGAN]
    assert(activate(s, platinumId) === null, "候補が出来れば同じターンに起動できる")
    assert(!!s.pendingChoice, "対象選択に入る")
    assert(getCard(NO_TENSHO).name === "ドラグノ偵察兵", "候補外に使ったカードの取り違えがない")
}
