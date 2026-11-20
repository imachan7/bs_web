// smoke パート1022（#631 バッチ3c：discard downTo・treatAsUnblocked blockerMaxLevel・nameAsGrant anyAll／reviveOnDestroy opponentAll）
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VAN = "BS01-002"
const PB = "PB12-03" // 喜劇王ペンタン
const PENTAN = "BS02-058" // ペンタン

console.log("=== 前提 ===")
{
    assert(getCard(PB).name === "喜劇王ペンタン" && getCard(PENTAN).name === "ペンタン", "ペンタン系の確認")
    assert(getCard(VAN).name === "ロクケラトプス", "VANの確認")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VAN)
    s.players.p2.deck = Array.from({ length: 40 }, () => VAN)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== discard from:deck downTo：デッキがその枚数になるまで。少なければ何もしない ===")
{
    const s = game("p1022-down")
    const me = put(s, "p1", VAN, 1)
    s.players.p2.deck = s.players.p2.deck.slice(0, 3)
    resolveAction(s, "p1", me, { type: "discard", from: "deck", side: "own", count: 0, downTo: 5 })
    resolveAction(s, "p1", me, { type: "discard", from: "deck", side: "opponent", count: 0, downTo: 5 })
    assert(s.players.p1.deck.length === 5, `自分のデッキが5枚（${s.players.p1.deck.length}）`)
    assert(s.players.p2.deck.length === 3, "相手のデッキは5枚以下なので変わらない")
    assert(s.players.p1.trashCards.length >= 35, "破棄分がトラッシュへ")
}

function blockCase(seed: string, blockerCores: number): { life: number; before: number } {
    const s = game(seed)
    const attacker = put(s, "p1", VAN, 1)
    const blocker = put(s, "p2", VAN, blockerCores)
    const before = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    resolveAction(s, "p1", attacker, { type: "treatAsUnblocked", when: { blockerMaxLevel: 2 } })
    while (s.isFlashTiming && s.battle) assert(act(s, s.priorityPlayer, { type: "pass" }) === null, "フラッシュをパス")
    return { life: s.players.p2.life, before }
}

console.log("=== treatAsUnblocked blockerMaxLevel：Lv2以下のブロッカーだけ ===")
{
    const lv2 = blockCase("p1022-lv2", 2)
    assert(lv2.life === lv2.before - 1, "Lv2のブロッカーなら通る")
    const lv3 = blockCase("p1022-lv3", 3)
    assert(lv3.life === lv3.before, "Lv3のブロッカーなら通らない")
}

console.log("=== PB12-03：召喚時に両陣営がペンタン扱い／Lv2-3 で双方のペンタンが相手に破壊されると手札へ ===")
{
    const s = game("p1022-pb")
    const pb = put(s, "p1", PB, 2)
    const mine = put(s, "p1", VAN, 1)
    const theirs = put(s, "p2", VAN, 1)
    const trig = getCard(PB).effects.find((e) => e.kind === "triggered")
    assert(trig !== undefined && trig.kind === "triggered", "召喚時の誘発がある")
    if (trig && trig.kind === "triggered") resolveAction(s, "p1", pb, trig.action)
    refreshLevelAsOverrides(s)
    assert((mine.namesAsContinuous ?? []).includes("ペンタン") && (theirs.namesAsContinuous ?? []).includes("ペンタン"), "両陣営のスピリットがペンタン扱い")
    destroySpirit(s, "p2", theirs.instanceId, "destroy", { sourcePid: "p1", sourceType: "spirit" })
    assert(s.players.p2.hand.includes(VAN) && !s.players.p2.field.spirits.some((x) => x.instanceId === theirs.instanceId), "相手のペンタンは自分に破壊されて相手の手札へ")
    destroySpirit(s, "p1", mine.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    assert(s.players.p1.hand.includes(VAN) && !s.players.p1.field.spirits.some((x) => x.instanceId === mine.instanceId), "自分のペンタンは相手に破壊されて手札へ")
    assert(s.players.p1.trashCards.length === 0 && s.players.p2.trashCards.length === 0, "トラッシュへは行かない")
}

console.log("=== PB12-03：Lv1 では戻らない／自分が自分のスピリットを破壊しても戻らない ===")
{
    const s = game("p1022-pb-lv1")
    const pb = put(s, "p1", PB, 1)
    const theirs = put(s, "p2", VAN, 1)
    const trig = getCard(PB).effects.find((e) => e.kind === "triggered")
    if (trig && trig.kind === "triggered") resolveAction(s, "p1", pb, trig.action)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p2", theirs.instanceId, "destroy", { sourcePid: "p1", sourceType: "spirit" })
    assert(s.players.p2.trashCards.length === 1, "Lv1 なので相手のペンタンはトラッシュへ")
}

console.log("すべてのチェックに合格しました 🎉（part1022）")
