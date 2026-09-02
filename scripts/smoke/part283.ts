// smoke パート283（BS11：神速召喚の検知・ライフ条件のコスト置換・回復状態の制約）
// BS11-065 満天の牧草地／BS11-X03 星騎士ハーキュリーΩ／BS11-X06 天秤造神リブラ・ゴレム
import { assert, createGame, createInstance, effectiveCost, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS, draw, getCard } from "../../server/src/logic/GameState"
import { lifeDamageLimit } from "../../shared/rules"
import { fireSummonSequence } from "../../server/src/logic/EffectModules"

const MEADOW = "BS11-065" // 満天の牧草地
const HERCULES = "BS11-X03" // 星騎士ハーキュリーΩ
const LIBRA = "BS11-X06" // 天秤造神リブラ・ゴレム
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== §A BS11-065 Lv1：メインステップの間はお互いドローできない ===")
{
    const s = game("meadow")
    const meadow = createInstance(MEADOW, s.turn, 1)
    s.players.p1.field.nexuses.push(meadow)
    refreshLevelAsOverrides(s)
    s.phase = "main"
    const before = s.players.p1.hand.length
    draw(s, "p1", 1)
    assert(s.players.p1.hand.length === before, "メインステップではドローできない")
    const beforeOpp = s.players.p2.hand.length
    draw(s, "p2", 1)
    assert(s.players.p2.hand.length === beforeOpp, "相手もドローできない（お互い）")
    s.phase = "attack"
    draw(s, "p1", 1)
    assert(s.players.p1.hand.length === before + 1, "メインステップ以外では引ける")
}

console.log("=== §B BS11-065 Lv2：【神速】の効果で召喚されたときに相手を疲労させる ===")
{
    const s = game("meadow-soku")
    const meadow = createInstance(MEADOW, s.turn, 3) // Lv2
    s.players.p1.field.nexuses.push(meadow)
    const enemy = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    s.phase = "attack"
    const summoned = createInstance(vanilla[1]!.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(summoned)
    // 神速召喚の印（doSummon が立てるもの）を再現する
    s.summoningBySoku = true
    fireSummonSequence(s, "p1", summoned)
    assert(enemy.isRested === true, "神速召喚なら相手が疲労する")
    assert(s.summoningBySoku === undefined, "印は使い終わったら消える")
}
{
    const s = game("meadow-normal")
    const meadow = createInstance(MEADOW, s.turn, 3)
    s.players.p1.field.nexuses.push(meadow)
    const enemy = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    s.phase = "attack"
    const summoned = createInstance(vanilla[1]!.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(summoned)
    fireSummonSequence(s, "p1", summoned)
    assert(enemy.isRested === false, "通常の召喚では疲労しない")
}

console.log("=== §C BS11-X03：自分のライフが3以下の間、手札のコストが4になる ===")
{
    const s = game("hercules")
    const card = getCard(HERCULES)
    s.players.p1.life = 5
    assert(effectiveCost(s, "p1", card) !== 4 || card.cost === 4, "ライフ4以上では置換されない")
    s.players.p1.life = 3
    assert(effectiveCost(s, "p1", card) === 4, "ライフ3以下ではコスト4")
}

console.log("=== §D BS11-X06 Lv3：回復状態の間、その持ち主は相手のライフを減らせない ===")
{
    const s = game("libra")
    const libra = createInstance(LIBRA, s.turn, 6) // Lv3
    s.players.p1.field.spirits.push(libra)
    refreshLevelAsOverrides(s)
    const attacker = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(attacker)
    assert(lifeDamageLimit(s, "p2", attacker).max === 0, "回復状態の間は相手のライフを減らせない")
    libra.isRested = true
    assert(lifeDamageLimit(s, "p2", attacker).max > 0, "疲労状態なら制約は外れる")
    // 自分のライフは守られない（片側だけの制約）
    const oppAttacker = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(oppAttacker)
    libra.isRested = false
    assert(lifeDamageLimit(s, "p1", oppAttacker).max > 0, "相手からのライフダメージは止まらない")
}

console.log("すべてのチェックに合格しました 🎉（part283）")
