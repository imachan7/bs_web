// smoke パート421（手札を手元へ置く部品 toTegamoto と、pay の「好きなだけ払う」の上限。HANDOFF §1 R5 pay の残り①）
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"

const BOOK = "BS02-108" // マジックブック
const URANAI = "BS06-054" // 占いペンタン
const HINA = "BS06-052" // ヒナペンタン
const HAFE = "BS04-065" // 機織のハーフェレシテ
const MAGIC = "BS01-114" // バスタースピア
const NEXUS = "BS01-098" // 燃えさかる戦場
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BOOK).name === "マジックブック" && getCard(URANAI).name === "占いペンタン", "カード名1")
    assert(getCard(HINA).name === "ヒナペンタン" && getCard(HAFE).name === "機織のハーフェレシテ", "カード名2")
    assert(getCard(MAGIC).type === "magic" && getCard(NEXUS).type === "nexus" && getCard(VANILLA).effects.length === 0, "種別")
}

const actionOf = (cardId: string, id: string): EffectAction =>
    (getCard(cardId).effects.find((e) => e.id === id) as { action: EffectAction }).action

function game(interactive: boolean): GameState {
    const s = createGame("teg", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

console.log("=== マジックブック：デッキ2枚なら手元に置けるのは2枚まで（後半を解決しきれない数は選べない） ===")
{
    const s = game(false)
    s.players.p1.hand = [MAGIC, MAGIC, MAGIC, VANILLA]
    s.players.p1.deck = [VANILLA, VANILLA]
    resolveAction(s, "p1", null, actionOf(BOOK, "BS02-108-e2"))
    assert(s.players.p1.tegamoto.length === 2, "手元に2枚")
    assert(s.players.p1.deck.length === 0 && s.players.p1.hand.length === 4, "2枚引いた（残りマジック1・スピリット1＋引いた2）")
}

console.log("=== マジックブック（対話）：1枚置いて終えると1枚引く／上限に達したら自動で終える ===")
{
    const s = game(true)
    s.players.p1.hand = [MAGIC, MAGIC, VANILLA]
    resolveAction(s, "p1", null, actionOf(BOOK, "BS02-108-e2"))
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    act(s, "p1", { type: "resolveChoice" })
    assert(s.players.p1.tegamoto.length === 1 && s.players.p1.hand.length === 3, "1枚置いて1枚引いた")

    const t = game(true)
    t.players.p1.hand = [MAGIC, MAGIC, MAGIC]
    t.players.p1.deck = [VANILLA]
    resolveAction(t, "p1", null, actionOf(BOOK, "BS02-108-e2"))
    act(t, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(!t.pendingChoice && t.players.p1.tegamoto.length === 1 && t.players.p1.deck.length === 0, "デッキ1枚なので1枚で終わって引いた")
}

console.log("=== 占いペンタン：手札にマジックが無ければ引かない ===")
{
    const s = game(false)
    const me = createInstance(URANAI, s.turn, 1)
    s.players.p1.field.spirits.push(me)
    s.players.p1.hand = [VANILLA]
    resolveAction(s, "p1", me, actionOf(URANAI, "BS06-054-e1"))
    assert(s.players.p1.hand.length === 1 && s.players.p1.deck.length === 40, "何も起きない")
    s.players.p1.hand = [MAGIC, VANILLA]
    resolveAction(s, "p1", me, actionOf(URANAI, "BS06-054-e1"))
    assert(s.players.p1.tegamoto.length === 1 && s.players.p1.hand.length === 2 && s.players.p1.deck.length === 39, "1枚置いて1枚引いた")
}

console.log("=== ハーフェレシテ：手札のネクサスを破棄してボイドから自分にコア1個 ===")
{
    const s = game(false)
    const me = createInstance(HAFE, s.turn, 1)
    s.players.p1.field.spirits.push(me)
    s.players.p1.hand = [VANILLA]
    resolveAction(s, "p1", me, actionOf(HAFE, "BS04-065-e1"))
    assert(me.cores === 1 && s.players.p1.hand.length === 1, "ネクサスが無ければ何もしない")
    s.players.p1.hand = [NEXUS, VANILLA]
    resolveAction(s, "p1", me, actionOf(HAFE, "BS04-065-e1"))
    assert(me.cores === 2 && s.players.p1.hand.length === 1 && s.players.p1.trashCards.includes(NEXUS), "ネクサスを破棄してコア+1")
}

console.log("=== ヒナペンタン：自分を疲労させて貸し出す／疲労済みなら何もしない ===")
{
    const s = game(false)
    const me = createInstance(HINA, s.turn, 1)
    s.players.p1.field.spirits.push(me)
    me.isRested = true
    resolveAction(s, "p1", me, actionOf(HINA, "BS06-052-e1"))
    assert(s.players.p1.turnVirtualInstances.length === 0, "疲労済みなら貸さない")
    me.isRested = false
    resolveAction(s, "p1", me, actionOf(HINA, "BS06-052-e1"))
    assert(me.isRested && s.players.p1.turnVirtualInstances.some((v) => v.cardId === HINA), "疲労して貸し出した")
}

console.log("すべてのチェックに合格しました 🎉（part421）")
