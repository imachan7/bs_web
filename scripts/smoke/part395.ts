// smoke パート395（pay の cost 側に足した部品：removeCores広げ・exhaust side own/target self・
// mill・discardBurst。docs/design/PAY_UNIFY.md §4 段階1）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    resolveAction,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const RED = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(RED).name === "ロクケラトプス" && getCard(RED).colors.includes("red"), "REDは赤")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 0
    s.players.p2.reserve = 0
    return s
}

function put(s: GameState, pid: PlayerId, cores: number) {
    const inst = createInstance(RED, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. removeCores cost（リザーブから own）：足りるなら払ってthenが出る ===")
{
    const s = game("case1")
    const before = s.players.p1.hand.length
    s.players.p1.reserve = 3
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "removeCores", side: "own", from: ["reserve"], target: "spread", count: 3, to: "void" },
        then: { type: "draw", count: 1 },
    })
    assert(s.players.p1.reserve === 0, "リザーブ3個を払った")
    assert(s.players.p1.hand.length === before + 1, "1枚ドローした")
}

console.log("=== 2. removeCores cost（リザーブから own）：1個でも足りなければ払わずthenも出ない ===")
{
    const s = game("case2")
    const before = s.players.p1.hand.length
    s.players.p1.reserve = 2
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "removeCores", side: "own", from: ["reserve"], target: "spread", count: 3, to: "void" },
        then: { type: "draw", count: 1 },
    })
    assert(s.players.p1.reserve === 2, "リザーブは払われなかった")
    assert(s.players.p1.hand.length === before, "ドローしなかった")
}

console.log("=== 3. removeCores cost（フィールド合計from own、target:spread）：複数体の合計で足りる ===")
{
    const s = game("case3")
    const before = s.players.p1.hand.length
    const a = put(s, "p1", 1)
    const b = put(s, "p1", 1)
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "removeCores", side: "own", from: ["spirit"], target: "spread", count: 2, to: "void" },
        then: { type: "draw", count: 1 },
    })
    assert(a.cores + b.cores === 0, "フィールド合計2個を払った")
    assert(s.players.p1.hand.length === before + 1, "1枚ドローした")
}

console.log("=== 4. removeCores cost（countCounter）：数えた値で判定する ===")
{
    const s = game("case4")
    const before = s.players.p1.hand.length
    s.players.p1.reserve = 2
    put(s, "p1", 1)
    put(s, "p1", 1) // 自分の場のスピリット2体＝countCounter ownOtherSpirits（self無しなので全体）で2を要求
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "removeCores", side: "own", from: ["reserve"], target: "spread", count: 1, countCounter: "ownOtherSpirits", to: "void" },
        then: { type: "draw", count: 1 },
    })
    assert(s.players.p1.reserve === 0, "countCounterで数えた2個を払った")
    assert(s.players.p1.hand.length === before + 1, "1枚ドローした")
}

console.log("=== 5. exhaust cost（target:self）：回復状態の発生源自身を払える ===")
{
    const s = game("case5")
    const self = put(s, "p1", 1)
    self.isRested = false
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", self, {
        type: "pay",
        cost: { type: "exhaust", target: "self", count: 1 },
        then: { type: "draw", count: 1 },
    })
    assert(self.isRested, "発生源自身が疲労した")
    assert(s.players.p1.hand.length === before + 1, "1枚ドローした")
}

console.log("=== 6. exhaust cost（target:self）：既に疲労している自分自身は払えない ===")
{
    const s = game("case6")
    const self = put(s, "p1", 1)
    self.isRested = true
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", self, {
        type: "pay",
        cost: { type: "exhaust", target: "self", count: 1 },
        then: { type: "draw", count: 1 },
    })
    assert(s.players.p1.hand.length === before, "疲労済みのため発動しなかった")
}

console.log("=== 7. exhaust cost（side:own）：自分の場に回復状態の候補が足りるなら払える ===")
{
    const s = game("case7")
    put(s, "p1", 1)
    put(s, "p1", 1)
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "exhaust", side: "own", count: 2 },
        then: { type: "draw", count: 1 },
    })
    assert(s.players.p1.field.spirits.every((sp) => sp.isRested), "自分のスピリット2体が疲労した")
    assert(s.players.p1.hand.length === before + 1, "1枚ドローした")
}

console.log("=== 8. exhaust cost（side:own）：候補が足りなければ払わない ===")
{
    const s = game("case8")
    put(s, "p1", 1)
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "exhaust", side: "own", count: 2 },
        then: { type: "draw", count: 1 },
    })
    assert(s.players.p1.field.spirits.every((sp) => !sp.isRested), "自分のスピリットは疲労させなかった")
    assert(s.players.p1.hand.length === before, "ドローしなかった")
}

console.log("=== 9. mill cost：デッキが足りるなら払える ===")
{
    const s = game("case9")
    const before = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "mill", side: "own", count: 3 },
        then: { type: "draw", count: 1 },
    })
    assert(s.players.p1.deck.length === deckBefore - 3 - 1, "デッキを3枚破棄し1枚ドローした")
    assert(s.players.p1.hand.length === before + 1, "1枚ドローした")
}

console.log("=== 10. mill cost：デッキが足りなければ払わない ===")
{
    const s = game("case10")
    s.players.p1.deck = s.players.p1.deck.slice(0, 2)
    const before = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "mill", side: "own", count: 3 },
        then: { type: "draw", count: 1 },
    })
    assert(s.players.p1.deck.length === deckBefore, "デッキは破棄されなかった")
    assert(s.players.p1.hand.length === before, "ドローしなかった")
}

console.log("=== 11. discardBurst cost（own）：バーストがセットされていれば払える ===")
{
    const s = game("case11")
    s.players.p1.burst = RED
    s.players.p1.burstSet = true
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "discardBurst", side: "own" },
        then: { type: "draw", count: 1 },
    })
    assert(s.players.p1.burst === null, "自分のバーストを破棄した")
    assert(s.players.p1.hand.length === before + 1, "1枚ドローした")
}

console.log("=== 12. discardBurst cost（own）：バーストが無ければ払わない ===")
{
    const s = game("case12")
    s.players.p1.burst = null
    s.players.p1.burstSet = false
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "discardBurst", side: "own" },
        then: { type: "draw", count: 1 },
    })
    assert(s.players.p1.hand.length === before, "ドローしなかった")
}

console.log("=== 13. then が解決できない（デッキ0でドロー）ときは cost も払わない ===")
{
    const s = game("case13")
    s.players.p1.reserve = 3
    s.players.p1.deck = []
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "removeCores", side: "own", from: ["reserve"], target: "spread", count: 3, to: "void" },
        then: { type: "draw", count: 1 },
    })
    assert(s.players.p1.reserve === 3, "デッキが0のためリザーブは払われなかった")
}

console.log("=== 14. exhaust の既存の書き方（相手を疲労）は挙動が変わっていない ===")
{
    const s = game("case14")
    const enemy = put(s, "p2", 1)
    enemy.isRested = false
    resolveAction(s, "p1", null, { type: "exhaust", count: 1 })
    assert(enemy.isRested, "相手のスピリットが疲労した（従来どおり）")
}

console.log("=== 15. 1体から取る形は最大の1体で判定（合計ではない）／リザーブだけなら target を書かなくても取れる ===")
{
    const s = game("case15")
    s.players.p1.deck = ["BS01-002", "BS01-002"]
    put(s, "p1", 2)
    put(s, "p1", 2)
    const handBefore = s.players.p1.hand.length
    // 2体とも2個だが、1体から3個は取れない（合計4で通してはいけない）
    resolveAction(s, "p1", null, { type: "pay", cost: { type: "removeCores", side: "own", to: "trash", count: 3 }, then: { type: "draw", count: 1 } })
    assert(s.players.p1.hand.length === handBefore, "1体から3個は取れないので払わずドローもしない")

    const s2 = game("case15b")
    s2.players.p1.deck = ["BS01-002"]
    s2.players.p1.reserve = 2
    const hand2 = s2.players.p1.hand.length
    resolveAction(s2, "p1", null, { type: "pay", cost: { type: "removeCores", side: "own", from: ["reserve"], to: "trash", count: 2 }, then: { type: "draw", count: 1 } })
    assert(s2.players.p1.reserve === 0 && s2.players.p1.hand.length === hand2 + 1, "リザーブ2個を払ってドローする（target 省略＝複数から合計）")
}

console.log("=== 16. 下限（聖なる柱状彫刻）の間は、その分を払えない数として数える ===")
{
    const FLOOR = "BS08-059"
    assert(getCard(FLOOR).name === "聖なる柱状彫刻", "FLOORは聖なる柱状彫刻")
    const s = game("case16")
    s.phase = "attack"
    s.turnPlayer = "p1"
    s.players.p1.field.nexuses.push(createInstance(FLOOR, s.turn, 0))
    s.players.p1.deck = ["BS01-002"]
    const r = put(s, "p1", 2) // コスト1なので1個までしか取れない
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "pay", cost: { type: "removeCores", side: "own", to: "void", count: 2 }, then: { type: "draw", count: 1 } })
    assert(r.cores === 2 && s.players.p1.hand.length === hand, "2個は払えないので何もしない")
}

console.log("すべてのチェックに合格しました 🎉（part395）")
