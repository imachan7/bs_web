// smoke パート285（BS11：ブロックの追加コストと、指定色にブロックされたときの回復。037 / 054）
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { validateBlock } from "../../server/src/logic/RuleValidator"

const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
const redSpirit = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.includes("red") && c.effects.length === 0)
assert(redSpirit !== undefined && vanilla.length >= 2, "テスト前提: 必要なカードがいる")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== §A BS11-037：リザーブのコアを払わなければブロックできない ===")
{
    const s = game("hippogriff")
    const atk = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(atk)
    const blocker = createInstance(vanilla[1]!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    resolveAction(s, "p1", null, { type: "requireCoreToBlockThisBattle", count: 1 })
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    s.players.p2.reserve = 0
    assert(validateBlock(s, "p2", blocker.instanceId) !== null, "リザーブが0ならブロックできない")
    s.players.p2.reserve = 3
    const e = validateBlock(s, "p2", blocker.instanceId)
    assert(e === null, `リザーブがあればブロックできる（${String(e)}）`)
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ブロック宣言")
    assert(s.players.p2.reserve === 2, "ブロックのときにコア1個を払う")
    assert(s.players.p2.trashCores === 1, "払ったコアはトラッシュへ")
}

console.log("=== §B BS11-054：指定した色にブロックされたらアタッカーが回復する ===")
{
    const s = game("hayato")
    const atk = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(atk)
    const blocker = createInstance(redSpirit!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", atk, { type: "refreshWhenBlockedByChosenColorThisTurn" })
    assert(atk.refreshOnBlockedByColorThisTurn === "red", "非対話では相手に最も多い色（赤）を指定する")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言（疲労する）")
    assert(atk.isRested === true, "アタックで疲労している")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "赤のスピリットでブロック")
    assert(!(atk.isRested as boolean), "指定色にブロックされたので回復する")
}
{
    const s = game("hayato-miss")
    const atk = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(atk)
    const blue = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.includes("blue") && !c.colors.includes("red") && c.effects.length === 0)
    assert(blue !== undefined, "テスト前提: 青のバニラがいる")
    const blocker = createInstance(blue!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    atk.refreshOnBlockedByColorThisTurn = "red"
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "青のスピリットでブロック")
    assert(atk.isRested === true, "指定色以外なら回復しない")
}

console.log("すべてのチェックに合格しました 🎉（part285）")
