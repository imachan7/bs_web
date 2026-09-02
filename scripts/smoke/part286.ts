// smoke パート286（BS11：トラッシュからの名前条件召喚と、手札召喚のデッキオープン。004 / X05）
import { assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS, getCard } from "../../server/src/logic/GameState"
import { fireSummonSequence } from "../../server/src/logic/EffectModules"

const WYVERN = "BS11-004" // プロミネンスワイバーン（トラッシュから「太陽」の召喚時に無償召喚）
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
const sunSpirit = ALL_CARDS.find((c) => c.type === "spirit" && c.name.includes("太陽"))
assert(sunSpirit !== undefined && vanilla.length >= 2, "テスト前提: カード名に「太陽」を含むスピリットがいる")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== §A BS11-004：「太陽」を含むスピリットが召喚されたとき、トラッシュから無償召喚する ===")
{
    const s = game("wyvern")
    s.players.p1.trashCards.push(WYVERN)
    const summoned = createInstance(sunSpirit!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(summoned)
    refreshLevelAsOverrides(s)
    fireSummonSequence(s, "p1", summoned)
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === WYVERN),
        `トラッシュのプロミネンスワイバーンが場に出る（${getCard(sunSpirit!.cardId).name}の召喚）`,
    )
    assert(!s.players.p1.trashCards.includes(WYVERN), "トラッシュからは無くなる")
}
{
    const s = game("wyvern-miss")
    s.players.p1.trashCards.push(WYVERN)
    const other = vanilla.find((c) => !c.name.includes("太陽"))!
    const summoned = createInstance(other.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(summoned)
    refreshLevelAsOverrides(s)
    fireSummonSequence(s, "p1", summoned)
    assert(s.players.p1.trashCards.includes(WYVERN), "名前が違えば何も起きない")
}

console.log("=== §B BS11-X05：デッキの上をオープンし、スピリット/ブレイヴなら無償召喚する ===")
{
    const s = game("geminize")
    const top = vanilla[0]!.cardId
    s.players.p1.deck = [top, ...s.players.p1.deck]
    resolveAction(s, "p1", null, { type: "revealTopSummonFreeOrHand" })
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === top), "スピリットなら場に出る")
}
{
    const s = game("geminize-magic")
    const magic = ALL_CARDS.find((c) => c.type === "magic")!
    s.players.p1.deck = [magic.cardId, ...s.players.p1.deck]
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "revealTopSummonFreeOrHand" })
    assert(s.players.p1.hand.length === before + 1, "スピリット/ブレイヴ以外は手札に加わる")
    assert(s.players.p1.field.spirits.length === 0, "場には出ない")
}

console.log("=== §C fromHandOnly：手札からの召喚のときだけ発火する ===")
{
    const s = game("from-hand")
    const inst = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    // 手札からの召喚の印が立っていないときは fromHandOnly の誘発は鳴らない
    s.players.p1.deck = [vanilla[1]!.cardId, ...s.players.p1.deck]
    const deckBefore = s.players.p1.deck.length
    fireSummonSequence(s, "p1", inst)
    assert(s.players.p1.deck.length === deckBefore, "手札からでなければデッキは動かない（印が無い）")
    assert(s.summoningFromHand === undefined, "印は使い終わったら消える")
}

console.log("すべてのチェックに合格しました 🎉（part286）")
