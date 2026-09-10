// smoke パート309（器BU：ブロックの追加コストで破棄するマジックは、ブロックする側が選ぶ）
// 効果文が「相手は、手札にあるマジックカード1枚を破棄しなければブロックできない」なので、
// どれを破棄するかを決めるのは**破棄する側＝ブロックする側**（docs/design/CHOOSER_RULES.md）。
// 候補が2枚以上のときだけ聞き、1枚しかないときは選ぶ余地がないので従来どおり自動で払う。
import {
    act,
    assert,
    createInstance,
    createGame,
    declareBlock,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = true
    return s
}

const costLE3Spirit = ALL_CARDS.find((c) => c.type === "spirit" && c.cost <= 3 && c.levels[0]?.cores === 1)!.cardId
const magics = ALL_CARDS.filter((c) => c.type === "magic").map((c) => c.cardId)
const magicA = magics[0]!
const magicB = magics[1]!

// 器BU が効いている状態で p2 のブロック直前まで進める
function attackWithNoguDense(seed: string): { s: GameState; blockerId: string } {
    const s = game(seed)
    const attacker = createInstance("BS13-047", s.turn, getCard("BS13-047").levels[0]!.cores)
    s.players.p1.field.spirits.push(attacker)
    const blocker = createInstance(costLE3Spirit, s.turn, 1)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", attacker, { type: "grantBlockRequiresMagicDiscardThisTurn" })
    act(s, "p1", { type: "nextPhase" })
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(s.battle?.blockCostDiscardMagic?.pid === "p2", "器BU：p2 のブロックにマジック破棄が要求される")
    act(s, "p2", { type: "pass" })
    return { s, blockerId: blocker.instanceId }
}

console.log("=== 器BU：手札にマジックが2枚以上あるときは、どれを破棄するかブロック側が選ぶ ===")
{
    const { s, blockerId } = attackWithNoguDense("bu-choose-discard")
    s.players.p2.hand = [costLE3Spirit, magicA, magicB] // マジック以外も混ぜて、候補がマジックだけになることを見る

    assert(declareBlock(s, "p2", blockerId) === null, "ブロック宣言は通る")
    assert(s.pendingChoice?.blockMagicDiscard !== undefined, "どのマジックを破棄するかブロック側に聞く")
    assert(s.pendingChoice?.pid === "p2", "選ぶのは破棄する側（ブロック側）")
    assert(s.pendingChoice?.cardZone === "hand", "手札からの選択")
    assert((s.pendingChoice?.cardIndices ?? []).join(",") === "1,2", "候補は手札のマジックだけ（スピリットは除く）")
    assert(s.battle?.blockerInstanceId === null, "選び終わるまでブロックは確定しない")

    assert(act(s, "p2", { type: "resolveChoice", cardIndex: 2 }) === null, "2枚目のマジックを選ぶ")
    assert(s.players.p2.hand.join(",") === [costLE3Spirit, magicA].join(","), "選んだ1枚だけが手札から減る")
    assert(s.players.p2.trashCards.includes(magicB), "選んだカードがトラッシュへ置かれる")
    assert(s.battle?.blockerInstanceId === blockerId, "選択のあとブロックが成立する")
    assert(s.battle?.blockCostDiscardMagic === undefined, "支払い済みなので二重には取らない")
}

console.log("=== 器BU：マジックが1枚だけなら選ばせない（従来どおり自動で払う） ===")
{
    const { s, blockerId } = attackWithNoguDense("bu-single-magic")
    s.players.p2.hand = [costLE3Spirit, magicA]

    assert(declareBlock(s, "p2", blockerId) === null, "ブロック宣言は通る")
    assert(s.pendingChoice?.blockMagicDiscard === undefined, "候補が1枚なので選択は挟まらない")
    assert(s.players.p2.hand.join(",") === costLE3Spirit, "その1枚が破棄される")
    assert(s.battle?.blockerInstanceId === blockerId, "そのままブロックが成立する")
}

console.log("すべてのチェックに合格しました 🎉（part309）")
