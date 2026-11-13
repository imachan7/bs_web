// smoke パート932（手元・プロボケイションの支払いを、フィールドのコアからもできるようにする。#512・#513。COST_MODEL §12）
import { assert, createGame, createInstance, getCard, handleAction, runTurnStart, timedHas } from "./helpers"
import type { GameState } from "./helpers"
import { payingCardId } from "../../public/src/ui/paying"
import type { GameView } from "../../server/src/type"

const PROVOCATION = "BS15-079" // プロボケイション（白・相手のメインステップ終了時に使用できる）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const PAYER = "BS01-001" // ゴラドン（コアの払い元に使う）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(PROVOCATION).name === "プロボケイション", "PROVOCATION はプロボケイション")
assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLA はコスト1のバニラ")

// p2 のメインステップ。p1 はリザーブ0で、フィールドのスピリットにコア6個
function provocationGame(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.turn = 3
    s.turnPlayer = "p2"
    s.phase = "main"
    s.players.p1.hand = [PROVOCATION]
    s.players.p1.reserve = 0
    s.players.p1.field.spirits.push(createInstance(PAYER, s.turn, 6))
    s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    return s
}

console.log("=== #513 プロボケイション：リザーブ0でもフィールドのコアで払って使える ===")
{
    const s = provocationGame("t932-prov-auto", false)
    const before = s.players.p1.field.spirits[0]!.cores
    assert(handleAction(s, "p2", { type: "nextPhase" }) === null, "相手がメインステップを終える")
    assert(!s.players.p1.hand.includes(PROVOCATION), "プロボケイションを使用した")
    assert(s.players.p1.field.spirits[0]!.cores < before, "フィールドのコアから払った")
    assert(timedHas(s, s.players.p2.field.spirits[0]!, "mustAttack"), "効果が解決した")
}
{
    const s = provocationGame("t932-prov-ask", true)
    assert(handleAction(s, "p2", { type: "nextPhase" }) === null, "相手がメインステップを終える")
    assert(s.pendingChoice?.pid === "p1" && s.pendingChoice.provocationUse !== undefined, "リザーブ0でも使うかの確認が出る")
    assert(handleAction(s, "p1", { type: "resolveChoice", option: "使用する" }) === null, "使用する")
    assert(s.pendingChoice?.effectCostPay !== undefined, "どのコアから払うかを聞く")
}

console.log("=== #512 手元からの召喚：フィールドのコアを支払い元にして送れば受理される ===")
{
    const s = createGame("t932-tegamoto", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 0
    const payer = createInstance(PAYER, s.turn, 4)
    s.players.p1.field.spirits.push(payer)
    s.players.p1.tegamoto = [VANILLA]
    s.players.p1.tegamotoPlayable = [VANILLA]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0, fromTegamoto: true }) !== null, "支払い元なし（リザーブだけ）では拒否される")
    // ゴラドンの赤シンボルで軽減されてコスト0。払うのは Lv1 の維持コア1個だけ
    const err = handleAction(s, "p1", { type: "summon", handIndex: 0, fromTegamoto: true, paySources: [{ instanceId: payer.instanceId, count: 1 }] })
    assert(err === null, `フィールドのコアを支払い元にすれば召喚できる（${err}）`)
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === VANILLA), "手元のスピリットが召喚された")
}

console.log("=== #512 クライアント：支払い中のカードを手元から読む ===")
{
    const view = { you: "p1", players: { p1: { hand: [PAYER], tegamoto: [VANILLA], trashCards: [], field: { spirits: [], combinedBraves: [] } } } } as unknown as GameView
    assert(payingCardId(view, { handIndex: 0, fromTegamoto: true, assigned: {}, discardHandIndices: [], millPay: 0, shinsokuAssistInstanceIds: [] }) === VANILLA, "手元から出しているときは手元のカード")
    assert(payingCardId(view, { handIndex: 0, assigned: {}, discardHandIndices: [], millPay: 0, shinsokuAssistInstanceIds: [] }) === PAYER, "手札から出しているときは手札のカード")
}

console.log("すべてのチェックに合格しました 🎉（part932）")
