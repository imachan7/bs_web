// smoke パート551
//   - IfCond ownAllSpiritsHaveFamily.costIn（26RBS03-049/096）
//   - TargetFilter inBattle（26RBS02-019）
//   - fireSoryoSelf（26RBS02-023）
import { assert, createGame, createInstance, resolveAction, legacy } from "./helpers"
import { getCard } from "../../server/src/logic/GameState"
import { matchesTarget } from "../../shared/rules"
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

console.log("=== 1. すべてがコストN/N/Nで系統を持つなら ===")
{
    const c = getCard("BS01-006")
    const fam = (c.family ?? [])[0] as string
    const cost = c.cost
    const draws = (costIn: number[]): number => {
        const s = game("551a")
        s.players.p1.field.spirits.push(createInstance("BS01-006", 1, 1))
        const before = s.players.p1.hand.length
        resolveAction(s, "p1", null, { type: "if", cond: { ownAllSpiritsHaveFamily: fam, costIn }, then: { type: "draw", count: 1 } })
        return s.players.p1.hand.length - before
    }
    assert(draws([cost, cost + 2]) === 1, "コストが一覧に入っていれば成立")
    assert(draws([cost + 1, cost + 3]) === 0, "コストが一覧に無ければ不成立")
}

console.log("=== 2. アタック/ブロックしている絞り込み ===")
{
    const s = game("551b")
    const a = createInstance("BS01-006", 1, 1)
    const b = createInstance("BS01-006", 1, 1)
    const c = createInstance("BS01-006", 1, 1)
    s.players.p1.field.spirits.push(a)
    s.players.p2.field.spirits.push(b, c)
    s.battle = { attackerInstanceId: a.instanceId, blockerInstanceId: b.instanceId } as unknown as GameState["battle"]
    assert(matchesTarget(s, "p1", b, { inBattle: true }), "ブロッカーは対象")
    assert(matchesTarget(s, "p1", a, { inBattle: true }), "アタッカーは対象")
    assert(!matchesTarget(s, "p1", c, { inBattle: true }), "バトル外は対象外")
}

console.log("=== 3. このスピリットの【操霊】を発揮する ===")
{
    const s = game("551c")
    const a = createInstance("BS01-006", 1, 1)
    s.players.p1.field.spirits.push(a)
    s.players.p1.reserve = 5
    s.players.p1.trashCards = ["BS01-006"]
    const effects = getCard("BS01-006").effects as unknown as object[]
    effects.push({ id: "t-soryo", kind: "triggered", keyword: "soryo", trigger: "onSummon", levels: [1], optional: false, action: legacy({ type: "summonFromTrashFree", costFilter: { max: 9 } }) })
    try {
        resolveAction(s, "p1", a, { type: "fireSoryoSelf" })
        assert(s.players.p1.field.spirits.length === 2, "【操霊】の中身が発揮されトラッシュから召喚された")
    } finally {
        effects.pop()
    }
}
