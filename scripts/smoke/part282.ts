// smoke パート282（BS11：条件つきの制約とコスト増減。008 / 017 / 027）
import { assert, createGame, createInstance, instHasCost, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { activeConstraints, instBaseCost } from "../../shared/rules"
import { fireTrigger } from "../../server/src/logic/EffectModules"
import { destroyNexus } from "../../server/src/logic/removal"

const BEARD = "BS11-008" // 爆竜ドラゴニックベアード
const SWALLOW = "BS11-017" // ムシャツバメ（Lv2-3：自分のアタックステップ中コスト+3）
const NJORD = "BS11-027" // 海戦機ニヨルド
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
const anyNexus = ALL_CARDS.find((c) => c.type === "nexus")
assert(anyNexus !== undefined && vanilla.length >= 2, "テスト前提: 必要なカードがいる")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== §A BS11-017：自分のアタックステップの間だけコスト+3 ===")
{
    const s = game("swallow")
    const sw = createInstance(SWALLOW, s.turn, 3) // Lv2
    s.players.p1.field.spirits.push(sw)
    const base = ALL_CARDS.find((c) => c.cardId === SWALLOW)!.cost
    refreshLevelAsOverrides(s)
    assert(instBaseCost(sw) === base, "メインステップでは元のコスト")
    s.phase = "attack"
    refreshLevelAsOverrides(s)
    assert(instBaseCost(sw) === base + 3, "自分のアタックステップではコスト+3")
    assert(instHasCost(sw, base + 3), "コストを見る判定にも効く")
    s.turnPlayer = "p2"
    refreshLevelAsOverrides(s)
    assert(instBaseCost(sw) === base, "相手のアタックステップでは効かない")
}

console.log("=== §B BS11-027：ネクサスが1つだけある間、アタックできず効果を受けない ===")
{
    const s = game("njord")
    const njord = createInstance(NJORD, s.turn, 2)
    s.players.p1.field.spirits.push(njord)
    refreshLevelAsOverrides(s)
    assert(
        activeConstraints(s, "p1", njord).every((c) => c.type !== "cantAttack"),
        "ネクサス0のときは制約が出ない",
    )
    s.players.p1.field.nexuses.push(createInstance(anyNexus!.cardId, s.turn, 1))
    refreshLevelAsOverrides(s)
    const cs = activeConstraints(s, "p1", njord)
    assert(cs.some((c) => c.type === "cantAttack"), "ネクサス1つのときはアタック不可")
    assert(cs.some((c) => c.type === "immuneToOpponentEffects"), "効果を受けない制約も出る")
    s.players.p1.field.nexuses.push(createInstance(anyNexus!.cardId, s.turn, 1))
    refreshLevelAsOverrides(s)
    assert(
        activeConstraints(s, "p1", njord).every((c) => c.type !== "cantAttack"),
        "ネクサスが2つになると外れる",
    )
}

console.log("=== §C BS11-027 Lv2：ネクサスが1つだけの間、そのネクサスは破壊されない ===")
{
    const s = game("njord-nexus")
    const njord = createInstance(NJORD, s.turn, 3) // Lv2
    s.players.p1.field.spirits.push(njord)
    const nexus = createInstance(anyNexus!.cardId, s.turn, 1)
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    destroyNexus(s, "p1", nexus.instanceId, { sourcePid: "p2", sourceType: "spirit", sourceColors: ["red"] })
    assert(s.players.p1.field.nexuses.length === 1, "ネクサスは破壊されない")
}

console.log("=== §D BS11-008：お互いにBP10000以上がいるときだけ一斉破壊 ===")
{
    const s = game("beard-miss")
    const beard = createInstance(BEARD, s.turn, 3)
    s.players.p1.field.spirits.push(beard)
    const mine = createInstance(vanilla[0]!.cardId, s.turn, 2)
    mine.tempBpBuff = 10000 // BP10000以上にする
    s.players.p1.field.spirits.push(mine)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", beard, "onSummon")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === mine.instanceId), "片側だけなら破壊されない")
}
{
    const s = game("beard-hit")
    const beard = createInstance(BEARD, s.turn, 3)
    s.players.p1.field.spirits.push(beard)
    const mine = createInstance(vanilla[0]!.cardId, s.turn, 2)
    const theirs = createInstance(vanilla[1]!.cardId, s.turn, 2)
    mine.tempBpBuff = 10000
    theirs.tempBpBuff = 10000
    s.players.p1.field.spirits.push(mine)
    s.players.p2.field.spirits.push(theirs)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", beard, "onSummon")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === mine.instanceId), "自分のBP10000以上も破壊される")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === theirs.instanceId), "相手のBP10000以上も破壊される")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === beard.instanceId), "BP10000未満は残る")
}

console.log("すべてのチェックに合格しました 🎉（part282）")
