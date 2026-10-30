// smoke パート648（BS18 部品バッチ3：anySpiritSummoned の subjectSide／リフレッシュステップの回復は陣営ごとに1回）
import { act, assert, createGame, createInstance, engineRunTurnStart, getCard, refreshLevelAsOverrides, refreshSpirit } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SRC = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）。一時的に効果を足す発生源
const PLAIN = "BS01-001" // ゴラドン（赤・コスト0・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SRC).name === "ロクケラトプス" && getCard(SRC).effects.length === 0, "SRCはバニラのロクケラトプス")
    assert(getCard(PLAIN).name === "ゴラドン" && getCard(PLAIN).cost === 0, "PLAINはコスト0のゴラドン")
}

function withEffect(entry: object, body: () => void): void {
    const effects = getCard(SRC).effects as unknown[]
    effects.push(entry)
    try {
        body()
    } finally {
        effects.pop()
    }
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.interactiveTargets = false
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => PLAIN)
    s.players.p2.deck = Array.from({ length: 40 }, () => PLAIN)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, rested = false): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, 1)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const drawOne = { id: "t648", kind: "fieldEvent", levels: null, selfMode: "source", action: { type: "draw", count: 1 } }

console.log("=== 1. anySpiritSummoned subjectSide:opponent：相手の召喚だけで発火する ===")
withEffect({ ...drawOne, event: "anySpiritSummoned", subjectSide: "opponent" }, () => {
    const s = game("summon-opp")
    s.turnPlayer = "p2"
    s.phase = "main"
    put(s, "p1", SRC)
    s.players.p2.hand = [PLAIN]
    const before = s.players.p1.hand.length
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手がスピリットを召喚")
    assert(s.players.p1.hand.length === before + 1, "相手の召喚で発生源の持ち主が1枚引いた")

    const t = game("summon-own")
    t.turnPlayer = "p1"
    t.phase = "main"
    put(t, "p1", SRC)
    t.players.p1.hand = [PLAIN]
    const b2 = t.players.p1.hand.length
    assert(act(t, "p1", { type: "summon", handIndex: 0 }) === null, "自分がスピリットを召喚")
    assert(t.players.p1.hand.length === b2 - 1, "自分の召喚では発火しない（手札は召喚した1枚だけ減る）")
})

console.log("=== 2. anySpiritSummoned subjectSide:own：自分の召喚だけで発火する ===")
withEffect({ ...drawOne, event: "anySpiritSummoned", subjectSide: "own" }, () => {
    const t = game("summon-own2")
    t.turnPlayer = "p1"
    t.phase = "main"
    put(t, "p1", SRC)
    t.players.p1.hand = [PLAIN]
    assert(act(t, "p1", { type: "summon", handIndex: 0 }) === null, "自分がスピリットを召喚")
    assert(t.players.p1.hand.length === 1, "自分の召喚で発火して1枚引いた（-1+1+... 引いた1枚が手札に残る）")
})

console.log("=== 3. リフレッシュステップ：陣営ごとに1回（何体回復しても1回） ===")
withEffect({ ...drawOne, event: "anySpiritRefreshed", subjectSide: "opponent", action: { type: "discard", from: "deck", count: 1, side: "own" } }, () => {
    const s = game("refresh-step-opp")
    s.turnPlayer = "p2"
    put(s, "p1", SRC)
    put(s, "p2", PLAIN, true)
    put(s, "p2", PLAIN, true)
    put(s, "p2", PLAIN, true)
    const deck = s.players.p1.deck.length
    engineRunTurnStart(s)
    assert(s.players.p2.field.spirits.every((x) => !x.isRested), "相手の3体が回復した")
    assert(s.players.p1.deck.length === deck - 1, `3体回復しても1回だけ発火した（${deck - s.players.p1.deck.length}回）`)

    const t = game("refresh-step-none")
    t.turnPlayer = "p2"
    put(t, "p1", SRC)
    put(t, "p2", PLAIN, false)
    const d2 = t.players.p1.deck.length
    engineRunTurnStart(t)
    assert(t.players.p1.deck.length === d2, "回復する個体がいなければ発火しない")
})

console.log("=== 4. 自分のリフレッシュステップの ownSpiritRefreshed も1回 ===")
withEffect({ ...drawOne, event: "ownSpiritRefreshed", action: { type: "discard", from: "deck", count: 1, side: "own" } }, () => {
    const s = game("refresh-step-own")
    s.turnPlayer = "p1"
    put(s, "p1", SRC)
    put(s, "p1", PLAIN, true)
    put(s, "p1", PLAIN, true)
    const deck = s.players.p1.deck.length
    engineRunTurnStart(s)
    // ドローステップで1枚減るぶんを引く
    assert(deck - s.players.p1.deck.length === 2, `ドロー1＋発火1回（実際に減った枚数 ${deck - s.players.p1.deck.length}）`)
})

console.log("=== 5. 効果による回復は1体ごと ===")
withEffect({ ...drawOne, event: "ownSpiritRefreshed", action: { type: "discard", from: "deck", count: 1, side: "own" } }, () => {
    const s = game("refresh-effect")
    put(s, "p1", SRC)
    const a = put(s, "p1", PLAIN, true)
    const b = put(s, "p1", PLAIN, true)
    const deck = s.players.p1.deck.length
    refreshSpirit(s, "p1", a, "spirit")
    refreshSpirit(s, "p1", b, "spirit")
    assert(deck - s.players.p1.deck.length === 2, "効果で2体回復すれば2回発火する")
})

console.log("すべてのチェックに合格しました 🎉（part648）")
