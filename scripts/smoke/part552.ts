// smoke パート552
//   - drawStepBonus（26RBS01-093。〔重複不可〕は同名を1回だけ数える）
//   - TimedContent untargetableByOpponentMagic（26RBS01-119）
//   - mill が lastMoved に書く＋toHand.lastMovedOnly（26RBS02-016）
//   - discardHandAll が lastMoved に書く（26RBS02-036「1枚以上破棄したなら」）
import { assert, createGame, createInstance, resolveAction } from "./helpers"
import { getCard } from "../../server/src/logic/GameState"
import { drawStepBonusFor } from "../../server/src/logic/EffectModules"
import { boardResistanceAgainst } from "../../shared/rules"
import type { GameState, PlayerId } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        s.players[pid].field.spirits = []
        s.players[pid].field.nexuses = []
    }
    return s
}

console.log("=== 1. ドローステップのドロー枚数+N ===")
{
    const effects = getCard("BS01-006").effects as unknown as object[]
    const bonusOf = (unique: boolean): number => {
        effects.push({ id: "t-dsb", kind: "drawStepBonus", levels: [1], amount: 1, ...(unique ? { uniqueByName: true } : {}) })
        try {
            const s = game("552a")
            s.players.p1.field.spirits.push(createInstance("BS01-006", 1, 1), createInstance("BS01-006", 1, 1))
            return drawStepBonusFor(s, "p1")
        } finally {
            effects.pop()
        }
    }
    assert(bonusOf(false) === 2, "同名2体はそれぞれ+1")
    assert(bonusOf(true) === 1, "〔重複不可〕は同名を1回分だけ数える")
}

console.log("=== 2. このバトル中、相手のマジックの効果では指定されない ===")
{
    const s = game("552b")
    const a = createInstance("BS01-006", 1, 1)
    s.players.p1.field.spirits.push(a)
    const attempt = (scope: "targeted" | "area", sourceType: "magic" | "spirit") => boardResistanceAgainst(s, "p1", a, { op: "other", scope, actorPid: "p2", sourceType })
    assert(attempt("targeted", "magic") === null, "付与前は指定できる")
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "untargetableByOpponentMagic" }], duration: "turn", side: "own" })
    assert(attempt("targeted", "magic") !== null, "相手のマジックでは指定できない")
    assert(attempt("targeted", "spirit") === null, "スピリットの効果では指定できる")
    assert(attempt("area", "magic") === null, "範囲効果は届く")
}

console.log("=== 3. 破棄したカードだけを手札に戻す ===")
{
    const s = game("552c")
    s.players.p1.trashCards = ["BS01-001"]
    s.players.p1.deck = ["BS01-002", "BS01-003", "BS01-004"]
    s.players.p1.hand = []
    resolveAction(s, "p1", null, { type: "mill", count: 2, side: "own" })
    resolveAction(s, "p1", null, { type: "toHand", from: "trash", count: "all", lastMovedOnly: true })
    assert(s.players.p1.hand.length === 2 && !s.players.p1.hand.includes("BS01-001"), "元からトラッシュにあったカードは戻らない")
}

console.log("=== 4. 手札すべてを破棄したなら ===")
{
    const draws = (hand: string[]): number => {
        const s = game("552d")
        s.players.p1.hand = hand
        s.players.p1.deck = ["BS01-002", "BS01-003", "BS01-004", "BS01-005"]
        resolveAction(s, "p1", null, { type: "sequence", actions: [{ type: "discardHandAll" }, { type: "if", cond: { count: "lastMoved", atLeast: 1 }, then: { type: "draw", count: 3 } }] })
        return s.players.p1.hand.length
    }
    assert(draws(["BS01-006"]) === 3, "1枚以上破棄したなら3枚ドロー")
    assert(draws([]) === 0, "手札0枚なら破棄していないのでドローしない")
}
