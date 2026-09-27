// smoke パート407（toDeck：手札・トラッシュのカードをデッキの上下へ。実カードデータで解決する）
import { act, assert, createGame, createInstance, destroySpirit, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const DEESHA = "BS07-013" // 魔札の占い師ディーシャ
const PLANK = "BS04-105" // トリックプランク
const TAIMA = "BS14-113" // 退魔絶刀角
const SENGEKKA = "BS15-082" // 神閃月下
const VANILLA = "BS01-002" // ロクケラトプス
const MAGIC = "BS01-114" // バスタースピア

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(DEESHA).name === "魔札の占い師ディーシャ", "DEESHA")
    assert(getCard(PLANK).name === "トリックプランク", "PLANK")
    assert(getCard(TAIMA).name === "退魔絶刀角", "TAIMA")
    assert(getCard(SENGEKKA).name === "神閃月下", "SENGEKKA")
    assert(getCard(VANILLA).type === "spirit" && getCard(MAGIC).type === "magic", "VANILLA／MAGIC")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    return s
}
function actionOf(cardId: string, kind: string): EffectAction {
    const e = getCard(cardId).effects!.find((x) => x.kind === kind && "action" in x && JSON.stringify(x.action).includes("toDeck"))
    return (e as { action: EffectAction }).action
}

console.log("=== 1. ディーシャ：相手が自分の手札から選び、相手の手札がデッキの上へ ===")
{
    const s = game("deesha")
    const inst = createInstance(DEESHA, s.turn, getCard(DEESHA).levels![1]!.cores)
    s.players.p1.field.spirits.push(inst)
    s.players.p2.hand = [VANILLA, MAGIC]
    const myHand = s.players.p1.hand.length
    destroySpirit(s, "p1", inst.instanceId)
    assert(s.pendingChoice?.pid === "p2" && s.pendingChoice.cardOwner === "p2", "選ぶのは相手、見るのは相手の手札")
    act(s, "p2", { type: "resolveChoice", cardIndex: 1 })
    assert(s.players.p2.hand.length === 1 && s.players.p2.deck[0] === MAGIC, "相手が選んだマジックが相手のデッキの上")
    assert(s.players.p1.hand.length === myHand, "自分の手札は減らない")
}

console.log("=== 2. トリックプランク：スピリットだけを選んだ順にデッキの下へ ===")
{
    const s = game("plank")
    s.players.p1.trashCards = [VANILLA, MAGIC, "BS01-001", "BS01-003"]
    resolveAction(s, "p1", null, actionOf(PLANK, "magic"))
    assert(s.pendingChoice?.cardIndices?.length === 3, "マジックは候補にならない")
    act(s, "p1", { type: "resolveChoice", cardIndex: 3 })
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    act(s, "p1", { type: "resolveChoice", cardIndex: 2 })
    assert(s.pendingChoice === null, "候補が尽きたら終わる（5枚に満たなくてよい）")
    assert(s.players.p1.deck.slice(-3).join() === ["BS01-003", VANILLA, "BS01-001"].join(), "選んだ順に下へ積む")
    assert(s.players.p1.trashCards.join() === MAGIC, "マジックは残る")
}

console.log("=== 3. 退魔絶刀角：自分が相手のトラッシュから選び、相手のデッキの下へ ===")
{
    const s = game("taima")
    s.players.p2.trashCards = [VANILLA, MAGIC]
    const flash = getCard(TAIMA).effects!.find((x) => x.kind === "magic" && (x as { timing?: string }).timing === "flash") as { action: EffectAction }
    resolveAction(s, "p1", null, flash.action)
    assert(s.pendingChoice?.pid === "p1" && s.pendingChoice.cardOwner === "p2", "選ぶのは自分、見るのは相手のトラッシュ")
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(s.players.p2.deck.at(-1) === VANILLA && s.players.p2.trashCards.join() === MAGIC, "選んだカードが相手のデッキの下")
}

console.log("=== 4. 神閃月下：マジック1枚を上へ、他のカードを下へ（非対話は新しい方から） ===")
{
    const s = game("sengekka")
    s.interactiveTargets = false
    s.players.p1.trashCards = [VANILLA, MAGIC, "BS01-001"]
    resolveAction(s, "p1", null, actionOf(SENGEKKA, "burst"))
    assert(s.players.p1.deck[0] === MAGIC, "マジックがデッキの上")
    assert(s.players.p1.deck.slice(-2).join() === ["BS01-001", VANILLA].join(), "残りは新しい方から下へ")
    assert(s.players.p1.trashCards.length === 0, "トラッシュは空")
}

console.log("=== 5. 戻したカードを記録し、同じ効果の後ろのステップが読める ===")
{
    const s = game("record")
    s.interactiveTargets = false
    s.players.p1.trashCards = [VANILLA, MAGIC]
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, {
        type: "sequence",
        actions: [{ type: "toDeck", from: "trash", position: "bottom", count: 5 }, { type: "draw", count: 1, countCounter: "lastMoved" }],
    })
    assert(s.players.p1.hand.length === hand + 2, "戻した2枚ぶん引く")
}

console.log("すべてのチェックに合格しました 🎉（part407）")
