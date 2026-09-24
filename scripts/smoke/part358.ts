// smoke パート358（数え上げの統一：countCounter は (count ?? 1)×値で countMax が上限、amountCounter は amount×値）
import { assert, createGame, createInstance, getCard, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance } from "../../server/src/type"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const BOFU2 = "BS06-036" // 牙王樹ラフレシオー（【暴風：2】）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
    assert(
        getCard(BOFU2).name === "牙王樹ラフレシオー" &&
            getCard(BOFU2).effects.some((e) => e.kind === "keyword" && e.keyword === "bofu" && e.count === 2),
        "BOFU2は【暴風：2】",
    )
}

// 自分3体（うち2体疲労）・相手3体（うち2体疲労）・相手の手札4枚の盤面。
// self は自分の先頭のスピリット（BOFU2）
function board(seed: string): { s: GameState; self: CardInstance } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = []
    s.players.p2.hand = Array.from({ length: 4 }, () => VANILLA)
    const put = (pid: PlayerId, cardId: string, cores: number, rested: boolean): CardInstance => {
        const inst = createInstance(cardId, s.turn, cores)
        inst.isRested = rested
        s.players[pid].field.spirits.push(inst)
        return inst
    }
    const self = put("p1", BOFU2, 3, false)
    put("p1", VANILLA, 1, true)
    put("p1", VANILLA, 1, true)
    put("p2", VANILLA, 1, true)
    put("p2", VANILLA, 2, true)
    put("p2", VANILLA, 3, false)
    s.lastBattleDestroyedCost = 3
    return { s, self }
}

console.log("=== 2. 量の規則：(count ?? 1) × 値、countMax で頭打ち ===")
{
    const { s, self } = board("rule")
    const deck = s.players.p2.deck.length
    resolveAction(s, "p1", self, { type: "mill", count: 3, countCounter: "opponentHand" }, undefined, undefined, "spirit")
    assert(s.players.p2.deck.length === deck - 12, "count:3 × 相手の手札4枚＝12枚破棄")
    const r2 = board("rule2")
    resolveAction(r2.s, "p1", r2.self, { type: "mill", count: 3, countCounter: "opponentHand", countMax: 5 }, undefined, undefined, "spirit")
    assert(r2.s.players.p2.deck.length === 40 - 5, "countMax:5 で5枚に頭打ち")
    const r3 = board("rule3")
    const hand = r3.s.players.p1.hand.length
    resolveAction(r3.s, "p1", r3.self, { type: "draw", count: 2, countCounter: "exhaustedEnemies" }, undefined, undefined, "spirit")
    assert(r3.s.players.p1.hand.length === hand + 4, "draw count:2 × 相手の疲労2体＝4枚")
    const r4 = board("rule4")
    resolveAction(r4.s, "p1", r4.self, { type: "timedEffect", content: [{ type: "bp", amount: 1000, amountCounter: "opponentHand" }], duration: "turn", target: "self" }, undefined, undefined, "spirit")
    assert(r4.self.tempBpBuff === 4000, "amount:1000 × 相手の手札4枚＝BP+4000")
}

console.log("すべてのチェックに合格しました 🎉（part358）")
