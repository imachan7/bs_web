// smoke パート609（BS17部品バッチ8：ownDeckMilled の byOpponentEffect／summonExhausted の self／onlyLastBattleDestroyed）
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { EffectDef } from "../../server/src/type"
import type { GameState, PlayerId } from "./helpers"

const HOLDER = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）。効果をこのパートの間だけ差し替える
const SELF_EX = "BS01-005" // アイバーン（赤・コスト2・バニラ）
const STRONG = "BS01-001" // ゴラドン
const BURST = "BS14-099" // 武迅衝（バーストを持つマジック）
const PLAIN = "BS01-050" // ビートビートル（バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HOLDER).name === "ロクケラトプス" && getCard(SELF_EX).name === "アイバーン", "バニラの名前")
    assert(getCard(STRONG).name === "ゴラドン" && getCard(PLAIN).name === "ビートビートル", "バニラの名前2")
    assert(getCard(BURST).name === "武迅衝" && getCard(BURST).effects.some((e) => e.kind === "burst"), "BURSTはバースト持ち")
    assert(getCard(HOLDER).effects.length === 0 && getCard(SELF_EX).effects.length === 0, "差し替え前はバニラ")
}

const original: Record<string, EffectDef[]> = {}
function patch(id: string, effects: EffectDef[]): void {
    original[id] = getCard(id).effects
    getCard(id).effects = effects
}
function restore(): void {
    for (const [id, e] of Object.entries(original)) getCard(id).effects = e
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => PLAIN)
    s.players.p2.deck = Array.from({ length: 40 }, () => PLAIN)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 070: 相手の効果でデッキ破棄 → バースト持ちだけ手札、そのターンは破棄されない ===")
patch(HOLDER, [
    {
        id: "t070",
        kind: "fieldEvent",
        levels: null,
        event: "ownDeckMilled",
        byOpponentEffectOnly: true,
        action: {
            type: "sequence",
            actions: [
                { type: "moveCards", from: "trash", fromEvent: true, pick: { hasBurst: true }, count: "all", dest: "hand" },
                { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "noDeckMillForPid" } }], duration: "turn", side: "own" },
            ],
        },
    },
])
{
    const s = game("m070a")
    put(s, "p1", HOLDER)
    s.players.p1.deck = [BURST, PLAIN, PLAIN, ...s.players.p1.deck]
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p2", null, { type: "mill", count: 2 })
    assert(s.players.p1.hand.length === handBefore + 1 && s.players.p1.hand.includes(BURST), "バースト持ちだけ手札に加わる")
    assert(s.players.p1.trashCards.includes(PLAIN) && !s.players.p1.trashCards.includes(BURST), "ほかはトラッシュに残る")
    const deckLen = s.players.p1.deck.length
    resolveAction(s, "p2", null, { type: "mill", count: 3 })
    assert(s.players.p1.deck.length === deckLen, "そのターンの間は自分のデッキが破棄されない")
}
{
    const s = game("m070b")
    put(s, "p1", HOLDER)
    s.players.p1.deck = [BURST, PLAIN, ...s.players.p1.deck]
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "mill", count: 2, side: "own" })
    assert(s.players.p1.hand.length === handBefore, "自分の効果で破棄したときは誘発しない")
    assert(s.players.p1.trashCards.includes(BURST), "バーストはトラッシュのまま")
}
restore()

console.log("=== 026: self:true は手札からも効果でも疲労状態で出る ===")
patch(SELF_EX, [{ id: "t026", kind: "globalConstraint", levels: null, constraint: { type: "summonExhausted", self: true } }])
{
    const s = game("m026a")
    s.players.p1.hand = [SELF_EX, HOLDER]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "手札から召喚")
    const a = s.players.p1.field.spirits.find((i) => i.cardId === SELF_EX)
    assert(a?.isRested === true, "手札からの召喚は疲労状態")
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "別カードを召喚")
    assert(s.players.p1.field.spirits.find((i) => i.cardId === HOLDER)?.isRested === false, "ほかのカードの召喚には効かない")
}
{
    const s = game("m026b")
    s.players.p1.trashCards = [SELF_EX]
    resolveAction(s, "p1", null, { type: "moveCards", from: "trash", count: 1, dest: "summon" })
    assert(s.players.p1.field.spirits.find((i) => i.cardId === SELF_EX)?.isRested === true, "効果による召喚も疲労状態")
}
restore()

console.log("=== 034: バトルで破壊されたカードだけをトラッシュから相手のデッキの上へ ===")
{
    const s = game("m034a")
    const attacker = put(s, "p1", SELF_EX, 4) // Lv2・BP6000
    const blocker = put(s, "p2", STRONG, 1) // BP1000
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(s.lastBattleDestroyedCardId === STRONG, "破壊されたカードの cardId が記録される")
    s.players.p2.trashCards = [STRONG, PLAIN, STRONG] // 手前の同名1枚は動かない
    const move = { type: "moveCards", side: "opponent", from: "trash", count: 1, dest: "deckTop", upTo: true, onlyLastBattleDestroyed: true } as const
    const deckLen = s.players.p2.deck.length
    resolveAction(s, "p1", null, move)
    assert(s.players.p2.deck[0] === STRONG && s.players.p2.deck.length === deckLen + 1, "相手のデッキの上へ1枚戻る")
    assert(s.players.p2.trashCards.length === 2 && s.players.p2.trashCards.filter((c) => c === STRONG).length === 1, "動くのは1枚だけ")
    s.players.p2.trashCards = [PLAIN]
    resolveAction(s, "p1", null, move)
    assert(s.players.p2.deck.length === deckLen + 1 && s.players.p2.trashCards.length === 1, "トラッシュに無ければ不発")
}
{
    const s = game("m034b")
    s.players.p2.trashCards = [STRONG]
    resolveAction(s, "p1", null, { type: "moveCards", side: "opponent", from: "trash", count: 1, dest: "deckTop", upTo: true, onlyLastBattleDestroyed: true })
    assert(s.players.p2.trashCards.length === 1, "バトルの記録が無ければ不発")
}

console.log("すべてのチェックに合格しました 🎉（part609）")
