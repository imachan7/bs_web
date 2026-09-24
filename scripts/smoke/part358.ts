// smoke パート358（M3 数え上げの統一：旧 *Per 10種と「元のアクション＋countCounter／amountCounter」が同じ結果になる。HANDOFF §1）
import { assert, createGame, createInstance, getCard, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance, EffectAction } from "../../server/src/type"

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

// 盤面で結果に効くところだけを比べる（ログ・ID採番は比べない）
function snapshot(s: GameState): string {
    const side = (pid: PlayerId) => {
        const p = s.players[pid]
        return {
            hand: p.hand.length,
            deck: p.deck.length,
            trash: p.trashCards.length,
            reserve: p.reserve,
            spirits: p.field.spirits.map((x) => [x.cardId, x.cores, x.isRested, x.tempBpBuff]),
        }
    }
    return JSON.stringify({ p1: side("p1"), p2: side("p2") })
}

function same(label: string, oldAction: EffectAction, newAction: EffectAction, srcType: "spirit" | "magic" = "spirit"): void {
    const a = board(label)
    const b = board(label)
    resolveAction(a.s, "p1", a.self, oldAction, undefined, undefined, srcType)
    resolveAction(b.s, "p1", b.self, newAction, undefined, undefined, srcType)
    const before = snapshot(board(label).s)
    const oldSnap = snapshot(a.s)
    assert(oldSnap !== before, `${label}：旧の書き方で盤面が動く（比べる意味がある）`)
    assert(oldSnap === snapshot(b.s), `${label}：旧と新で同じ結果`)
}

console.log("=== 1. 旧 *Per と新しい書き方が同じ結果 ===")
same("drawPer", { type: "drawPer", counter: "exhaustedEnemies" }, { type: "draw", count: 1, countCounter: "exhaustedEnemies" })
same("destroyPer", { type: "destroyPer", counter: "ownExhausted", filter: { rested: true } }, { type: "destroy", count: 1, countCounter: "ownExhausted", filter: { rested: true } })
same("coreGainPer", { type: "coreGainPer", counter: "opponentHand" }, { type: "coreGain", count: 1, countCounter: "opponentHand" })
same("voidCoreToSelfPer", { type: "voidCoreToSelfPer", counter: "ownExhausted" }, { type: "voidCoreToSelf", count: 1, countCounter: "ownExhausted" })
same("voidCoreToSelfPerBofuCount", { type: "voidCoreToSelfPerBofuCount" }, { type: "voidCoreToSelf", count: 1, countCounter: "selfBofuCount" })
same("selfBuffPer", { type: "selfBuffPer", counter: "exhaustedEnemies", amountPer: 2000 }, { type: "selfBuff", amount: 2000, amountCounter: "exhaustedEnemies" })
same("bpBuffPer", { type: "bpBuffPer", counter: "opponentHand", amountPer: 1000 }, { type: "bpBuff", amount: 1000, amountCounter: "opponentHand" }, "magic")
same("bpBuffPer（対象のシンボル）", { type: "bpBuffPer", counter: "targetSymbols", amountPer: 3000 }, { type: "bpBuff", amount: 3000, amountCounter: "targetSymbols" }, "magic")
same("bpBuffAllPer", { type: "bpBuffAllPer", counter: "ownExhausted", amountPer: 1000 }, { type: "bpBuffAll", amount: 1000, amountCounter: "ownExhausted" })
same("millPer", { type: "millPer", counter: "opponentHand", multiplier: 2, cap: 6 }, { type: "mill", count: 2, countCounter: "opponentHand", countMax: 6 })
same("millPerLoserCost", { type: "millPerLoserCost" }, { type: "mill", count: 1, countCounter: "lastBattleDestroyedCost" })

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
    resolveAction(r4.s, "p1", r4.self, { type: "selfBuff", amount: 1000, amountCounter: "opponentHand" }, undefined, undefined, "spirit")
    assert(r4.self.tempBpBuff === 4000, "amount:1000 × 相手の手札4枚＝BP+4000")
}

console.log("すべてのチェックに合格しました 🎉（part358）")
