// smoke パート543
//   - CardPick.nameExcludes（「X」以外の）
//   - 起動の condition "selfBlocking"（『ブロック中』【起動：フラッシュ】）
//   - toDeck.all（手札すべて）と IfCond.lastAll
//   - AuraCondition.ownColorSymbolsAtLeast
//   - destroySelf が自分のネクサス自身を破壊する
import { assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, legacy } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import { matchesPick } from "../../server/src/logic/actions/revealAction"
import { validateActivateAbility } from "../../server/src/logic/RuleValidator"
import { checkAuraCondition } from "../../shared/rules/bp"
import type { GameState, PlayerId } from "./helpers"
import type { CardData } from "../../server/src/type"

const BLK = "TEST-543-BLK"
CARD_DB.set(BLK, { ...CARD_DB.get("BS01-002")!, cardId: BLK, name: "テスト543", effects: [{ id: "t543-e1", kind: "activated", timing: "flashBattle", condition: "selfBlocking", levels: [1, 2, 3], action: { type: "draw", count: 1 } }] } as unknown as CardData)

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        p.reserve = 20
        p.hand = []
        p.deck = Array.from({ length: 30 }, () => "BS01-002")
        p.field.spirits = []
        p.field.nexuses = []
    }
    return s
}

console.log("=== 1. nameExcludes ===")
{
    const name = CARD_DB.get("BS01-002")!.name
    assert(!matchesPick("BS01-002", { nameExcludes: name }), "同名は除く")
    assert(matchesPick("BS01-002", { nameExcludes: "別名" }), "別名は通す")
}

console.log("=== 2. selfBlocking ===")
{
    const s = game("543b")
    s.phase = "attack"
    s.isFlashTiming = true
    const me = createInstance(BLK, 1, 3)
    s.players.p2.field.spirits.push(me)
    refreshLevelAsOverrides(s)
    const atk = createInstance("BS01-002", 1, 1)
    s.players.p1.field.spirits.push(atk)
    s.battle = { attackerInstanceId: atk.instanceId, blockerInstanceId: me.instanceId } as never
    assert(validateActivateAbility(s, "p2", me.instanceId, "t543-e1") !== "このスピリットのブロック中しか発動できません", "ブロッカーなら条件を通る")
    s.battle = { attackerInstanceId: me.instanceId, blockerInstanceId: null } as never
    assert(validateActivateAbility(s, "p2", me.instanceId, "t543-e1") === "このスピリットのブロック中しか発動できません", "アタッカーは不可")
}

console.log("=== 3. toDeck.all と lastAll ===")
{
    const s = game("543c")
    s.players.p1.hand = ["BS01-002", "BS01-002", "BS01-002"]
    const me = createInstance("BS01-002", 1, 1)
    resolveAction(s, "p1", me, {
        type: "sequence",
        actions: [
            legacy({ type: "toDeck", from: "hand", position: "bottom", count: 1, all: true }),
            { type: "if", cond: { lastAll: { cardType: "spirit" } }, then: { type: "draw", count: 2 } },
        ],
    })
    assert(s.players.p1.hand.length === 2, "手札3枚を戻し、lastAll 成立で2枚ドロー")
    const t = game("543d")
    resolveAction(t, "p1", me, {
        type: "sequence",
        actions: [
            legacy({ type: "toDeck", from: "hand", position: "bottom", count: 1, all: true }),
            { type: "if", cond: { lastAll: { cardType: "spirit" } }, then: { type: "draw", count: 2 } },
        ],
    })
    assert(t.players.p1.hand.length === 0, "0枚戻しは lastAll 不成立")
}

console.log("=== 4. ownColorSymbolsAtLeast ===")
{
    const s = game("543e")
    const inst = createInstance("BS01-002", 1, 1)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    assert(checkAuraCondition(s, "p1", { ownColorSymbolsAtLeast: { color: "red", count: 1 } }), "赤1つ以上")
    assert(!checkAuraCondition(s, "p1", { ownColorSymbolsAtLeast: { color: "blue", count: 1 } }), "青は無い")
}

console.log("=== 5. destroySelf（ネクサス自身） ===")
{
    const s = game("543f")
    const nx = createInstance("BS01-002", 1, 1)
    s.players.p1.field.nexuses.push(nx)
    resolveAction(s, "p1", nx, { type: "destroy", target: "self", count: 1 })
    assert(!s.players.p1.field.nexuses.includes(nx), "ネクサス自身が破壊される")
}

CARD_DB.delete(BLK)
