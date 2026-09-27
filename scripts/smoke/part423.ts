// smoke パート423（returnToDeckBottom の side／count、returnToHand の costBudget、カウンタ lastBp。HANDOFF §1 R5 pay の残り③）
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"

const GLACIAL = "BS04-104" // グラシアルブレス
const UNITED = "BS03-131" // ユナイテッドパワー
const BARAGAN = "BS14-X04" // 氷の覇王ミブロック・バラガン
const PIYON = "BS02-049" // ピヨン（Lv1 BP1000）
const TRIA = "BS03-054" // アルカナドール・トリア
const VANILLA = "BS01-002" // ロクケラトプス（コスト1）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(GLACIAL).name === "グラシアルブレス" && getCard(UNITED).name === "ユナイテッドパワー", "カード名1")
    assert(getCard(BARAGAN).name === "氷の覇王ミブロック・バラガン" && getCard(PIYON).name === "ピヨン", "カード名2")
    assert(getCard(VANILLA).cost === 1 && getCard(TRIA).cost > 1, "コスト")
}

const actionOf = (cardId: string, id: string): EffectAction =>
    (getCard(cardId).effects.find((e) => e.id === id) as { action: EffectAction }).action

function game(interactive: boolean): GameState {
    const s = createGame("ret", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    return s
}

console.log("=== グラシアルブレス：相手のスピリットが1体なら発揮しない（自分のスピリットも戻さない） ===")
{
    const s = game(false)
    s.players.p1.field.spirits.push(createInstance(VANILLA, s.turn, 1), createInstance(VANILLA, s.turn, 1))
    s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    resolveAction(s, "p1", null, actionOf(GLACIAL, "BS04-104-e1"))
    assert(s.players.p1.field.spirits.length === 2 && s.players.p2.field.spirits.length === 1, "何も起きない")
    s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    const deck1 = s.players.p1.deck.length
    const deck2 = s.players.p2.deck.length
    resolveAction(s, "p1", null, actionOf(GLACIAL, "BS04-104-e1"))
    assert(s.players.p1.field.spirits.length === 0 && s.players.p2.field.spirits.length === 0, "お互い2体ずつ戻した")
    assert(s.players.p1.deck.length === deck1 + 2 && s.players.p2.deck.at(-1) === VANILLA && s.players.p2.deck.length === deck2 + 2, "デッキの下へ")
}

console.log("=== ユナイテッドパワー：疲労させた自分のスピリットのBPぶん、相手のスピリットも選べる ===")
{
    const s = game(true)
    const low = createInstance(PIYON, s.turn, 1)
    const high = createInstance(TRIA, s.turn, 3)
    s.players.p1.field.spirits.push(low, high)
    const foe = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.spirits.push(foe)
    resolveAction(s, "p1", null, actionOf(UNITED, "e1"))
    assert(s.pendingChoice?.candidates.length === 2, "疲労させる自分のスピリットを選ぶ")
    act(s, "p1", { type: "resolveChoice", instanceId: low.instanceId })
    assert(low.isRested && s.pendingChoice?.candidates.includes(foe.instanceId) === true, "BPを上げる先に相手のスピリットも出る")
    act(s, "p1", { type: "resolveChoice", instanceId: foe.instanceId })
    assert(foe.tempBpBuff === 1000, "ピヨンのBP1000ぶん上がった")
}

console.log("=== バラガン：戻した自分のスピリットのコストまでしか相手を戻せない ===")
{
    const s = game(false)
    const src = createInstance(BARAGAN, s.turn, 4)
    const payer = createInstance(VANILLA, s.turn, 1) // コスト1
    s.players.p1.field.spirits.push(src, payer)
    src.isRested = true
    const cheap = createInstance(VANILLA, s.turn, 1) // コスト1
    const pricey = createInstance(TRIA, s.turn, 3)
    s.players.p2.field.spirits.push(cheap, pricey)
    s.interactiveTargets = true
    resolveAction(s, "p1", src, actionOf(BARAGAN, "BS14-X04-e3"))
    act(s, "p1", { type: "resolveChoice", instanceId: payer.instanceId })
    assert(!s.players.p1.field.spirits.includes(payer), "コストに自分のコスト1を戻した")
    assert(!s.players.p2.field.spirits.includes(cheap) && s.players.p2.field.spirits.includes(pricey), "予算1なのでコスト1だけ戻る")
}

console.log("すべてのチェックに合格しました 🎉（part423）")
