// smoke パート281（BS11：相手のデッキを1枚破棄して、破棄したカードで続きが変わる3枚）
// BS11-045 MCギンガー（同コスト1体を破壊）／BS11-071 柱岩の海上都市Lv2（コスト3以下なら疲労）／
// BS11-060 雷神砲カノン・アームズ（このバトルの間、同じ色の手札を使えない）
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS, getCard } from "../../server/src/logic/GameState"
import { validateSummon } from "../../server/src/logic/RuleValidator"

const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
assert(vanilla.length >= 3, "テスト前提: バニラスピリットが3種以上いる")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.phase = "attack"
    return s
}

console.log("=== §A destroyOneSameCost：破棄したカードと同じコストの相手1体を破壊する ===")
{
    const s = game("ginger")
    const victimCard = vanilla.find((c) => c.cost >= 1)!
    s.players.p2.deck.unshift(victimCard.cardId) // 破棄されるのは同コストのカード
    const victim = createInstance(victimCard.cardId, s.turn, 2)
    const other = vanilla.find((c) => c.cost !== victimCard.cost)
    s.players.p2.field.spirits.push(victim)
    if (other) s.players.p2.field.spirits.push(createInstance(other.cardId, s.turn, 2))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "millOpponentThenReact", react: "destroyOneSameCost" })
    assert(s.players.p2.trashCards.includes(victimCard.cardId), "破棄したカードはトラッシュへ")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === victim.instanceId),
        "同じコストのスピリットが破壊される",
    )
}

console.log("=== §B exhaustOneIfMaxCost：コスト条件を満たすときだけ疲労させる ===")
{
    const s = game("pillar-hit")
    const cheap = vanilla.find((c) => c.cost <= 3)!
    s.players.p2.deck.unshift(cheap.cardId)
    const target = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "millOpponentThenReact", react: "exhaustOneIfMaxCost", maxCost: 3 })
    assert(target.isRested === true, "コスト3以下なら疲労する")
}
{
    const s = game("pillar-miss")
    const pricey = vanilla.find((c) => c.cost >= 4)
    assert(pricey !== undefined, "テスト前提: コスト4以上のバニラがいる")
    s.players.p2.deck.unshift(pricey!.cardId)
    const target = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "millOpponentThenReact", react: "exhaustOneIfMaxCost", maxCost: 3 })
    assert(target.isRested === false, "コストが条件に合わなければ疲労しない")
}

console.log("=== §C banHandColorThisBattle：このバトルの間、同じ色の手札を使えない ===")
{
    const s = game("cannon-arms")
    const atk = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(atk)
    const red = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.includes("red") && c.cost === 0)
    const blue = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.includes("blue") && !c.colors.includes("red") && c.cost === 0)
    assert(red !== undefined && blue !== undefined, "テスト前提: コスト0の赤と青のスピリットがいる")
    s.players.p2.deck.unshift(red!.cardId) // 破棄されるのは赤
    s.players.p2.hand = [red!.cardId, blue!.cardId]
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言（バトル成立）")
    resolveAction(s, "p1", null, { type: "millOpponentThenReact", react: "banHandColorThisBattle" })
    assert(
        s.battle?.handColorBannedFor?.color === "red" && s.battle.handColorBannedFor.pid === "p2",
        `破棄したカードの色（${getCard(red!.cardId).colors.join("/")}）で止まる`,
    )
    // 相手のターン中なので召喚自体は別の理由でも拒否される。色制限で止まったかを文面で見分ける
    const BAN = "効果により、このバトルの間はこの色のカードを使えません"
    assert(validateSummon(s, "p2", 0) === BAN, "同じ色の手札は色制限で止まる")
    assert(validateSummon(s, "p2", 1) !== BAN, "違う色の手札は色制限では止まらない")
}

console.log("すべてのチェックに合格しました 🎉（part281）")
