// smoke パート281（BS11-060 雷神砲カノン・アームズ：相手のデッキを1枚破棄し、このバトルの間、
// 破棄したカードと同じ色の手札を使えなくする。旧 millOpponentThenReact から sequence(mill→timedEffect) へ移した）
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS, getCard } from "../../server/src/logic/GameState"
import { validateSummon } from "../../server/src/logic/RuleValidator"

const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.phase = "attack"
    return s
}

const CANNON_ARMS_ACTION = {
    type: "sequence" as const,
    actions: [
        { type: "mill" as const, count: 1 },
        {
            type: "timedEffect" as const,
            duration: "battle" as const,
            content: [{ type: "playerRule" as const, rule: { type: "cantUseHandCardsForPid" as const, bannedColors: "last" as const } }],
        },
    ],
}

console.log("=== このバトルの間、破棄したカードと同じ色の手札を使えない ===")
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
    resolveAction(s, "p1", null, CANNON_ARMS_ACTION)
    assert(s.players.p2.trashCards.includes(red!.cardId), "破棄したのは相手のデッキ上から1枚")
    const BAN = "効果により、このカードは使えません"
    assert(validateSummon(s, "p2", 0) === BAN, "同じ色の手札は色制限で止まる")
    assert(validateSummon(s, "p2", 1) !== BAN, "違う色の手札は色制限では止まらない")
    assert(s.timedEffects.some((r) => r.until === "battle" && r.target.kind === "player"), "「このバトルの間」の記録で置かれる")
}

console.log("=== 相手のデッキが0枚なら何も置かない ===")
{
    const s = game("cannon-arms-empty")
    const atk = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(atk)
    s.players.p2.deck = []
    const blue = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.includes("blue"))!
    s.players.p2.hand = [blue.cardId]
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言（バトル成立）")
    resolveAction(s, "p1", null, CANNON_ARMS_ACTION)
    assert(validateSummon(s, "p2", 0) !== "効果により、このカードは使えません", "デッキ0枚なら制約が置かれない")
}

console.log("すべてのチェックに合格しました 🎉（part281）")
