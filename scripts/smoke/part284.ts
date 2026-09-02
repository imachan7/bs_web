// smoke パート284（BS11：デッキ operations と「ターンに1回」の誘発。032 / 038 / 058）
import { assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS, getCard } from "../../server/src/logic/GameState"
import { fireTrigger } from "../../server/src/logic/EffectModules"

const URANOS = "BS11-032" // 天王神獣スレイ・ウラノス（Lv2-3：ターン1回）
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
const cheap = vanilla.find((c) => c.cost <= 4)
const pricey = vanilla.find((c) => c.cost >= 5)
const kodo = ALL_CARDS.find((c) => c.type === "spirit" && (c.family ?? []).some((f) => f === "光導" || f === "神星"))
assert(cheap !== undefined && pricey !== undefined && kodo !== undefined, "テスト前提: 必要なカードがいる")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.phase = "attack"
    return s
}

console.log("=== §A BS11-032：コスト4以下を戻したときだけ味方を回復させる ===")
{
    const s = game("uranos-hit")
    const ally = createInstance(kodo!.cardId, s.turn, 2)
    ally.isRested = true
    s.players.p1.field.spirits.push(ally)
    const target = createInstance(cheap!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "returnOneThenRefreshIfMaxCost", maxCost: 4, refreshFamilyFilter: ["光導", "神星"] })
    assert(s.players.p2.hand.includes(target.cardId), "相手のスピリットが手札に戻る")
    assert(!(ally.isRested as boolean), "コスト4以下だったので味方が回復する")
}
{
    const s = game("uranos-miss")
    const ally = createInstance(kodo!.cardId, s.turn, 2)
    ally.isRested = true
    s.players.p1.field.spirits.push(ally)
    const target = createInstance(pricey!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "returnOneThenRefreshIfMaxCost", maxCost: 4, refreshFamilyFilter: ["光導", "神星"] })
    assert(s.players.p2.hand.includes(target.cardId), "相手のスピリットが手札に戻る")
    assert(ally.isRested === true, "コスト5以上なら回復しない")
}

console.log("=== §B 誘発の oncePerTurn：同じターンに2回は発揮しない ===")
{
    const s = game("uranos-once")
    const uranos = createInstance(URANOS, s.turn, 4) // Lv2
    s.players.p1.field.spirits.push(uranos)
    const a = createInstance(cheap!.cardId, s.turn, 2)
    const b = createInstance(cheap!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(a, b)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", uranos, "onAttack")
    assert(s.players.p2.field.spirits.length === 1, "1回目は発揮する")
    fireTrigger(s, "p1", uranos, "onAttack")
    assert(s.players.p2.field.spirits.length === 1, "同じターンの2回目は発揮しない")
    s.turn += 1
    fireTrigger(s, "p1", uranos, "onAttack")
    assert(s.players.p2.field.spirits.length === 0, "ターンが変われば また発揮する")
}

console.log("=== §C BS11-038：コスト6/7が出るまで破棄し、出たらコストを支払わずに召喚する ===")
{
    const s = game("pegasida")
    const big = vanilla.find((c) => c.cost === 6 || c.cost === 7)
    assert(big !== undefined, "テスト前提: コスト6/7のバニラがいる")
    const filler = vanilla.find((c) => c.cost <= 2)!
    s.players.p1.deck = [filler.cardId, filler.cardId, big!.cardId, ...s.players.p1.deck]
    resolveAction(s, "p1", null, { type: "millUntilCostSpiritSummonFree", costs: [6, 7], maxCount: 6, skipOnSummon: true })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === big!.cardId),
        "コスト6/7のスピリットが場に出る",
    )
    assert(s.players.p1.trashCards.length === 2, "そこまでのカードはトラッシュへ")
}
{
    const s = game("pegasida-miss")
    const filler = vanilla.find((c) => c.cost <= 2)!
    s.players.p1.deck = new Array(8).fill(filler.cardId)
    resolveAction(s, "p1", null, { type: "millUntilCostSpiritSummonFree", costs: [6, 7], maxCount: 6, skipOnSummon: true })
    assert(s.players.p1.field.spirits.length === 0, "出なければ召喚されない")
    assert(s.players.p1.trashCards.length === 6, "上限6枚で止まる")
}

console.log("=== §D BS11-058：デッキの一番上がマジックなら無償で使い、違えば手札に加える ===")
{
    const s = game("peryton-magic")
    const magic = ALL_CARDS.find((c) => c.type === "magic" && c.flash)
    assert(magic !== undefined, "テスト前提: フラッシュマジックがいる")
    s.players.p1.deck = [magic!.cardId, ...s.players.p1.deck]
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "revealTopCastMagicFreeOrHand" })
    assert(s.players.p1.hand.length === handBefore, "マジックは手札に入らず使用される")
    assert(s.players.p1.deck[0] !== magic!.cardId, "デッキから離れる")
}
{
    const s = game("peryton-spirit")
    const top = vanilla[0]!.cardId
    s.players.p1.deck = [top, ...s.players.p1.deck]
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "revealTopCastMagicFreeOrHand" })
    assert(s.players.p1.hand.length === handBefore + 1, "マジック以外は手札に加わる")
    assert(getCard(s.players.p1.hand[s.players.p1.hand.length - 1]!).cardId === top, "加わるのはオープンしたカード")
}

console.log("すべてのチェックに合格しました 🎉（part284）")
