// smoke パート550
//   - AuraCondition ownNexusColorAtLeast（26RBS01-085）／AuraCounter ownExTrashReductionSpirits（26RBS02-003）
//   - bpBuff → refreshOne{lastBpBuffTarget}（26RBS02-009 の同一個体への回復＋BP+）
//   - toHand dest:"summon" + destroyAtBattleEnd（26RBS01-113）
import { assert, createGame, createInstance, resolveAction } from "./helpers"
import { checkAuraCondition, countAuraCounter } from "../../shared/rules/bp"
import { getCard } from "../../server/src/logic/GameState"
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

console.log("=== 1. 自分の青のネクサスがN以上（常時条件） ===")
{
    const s = game("550a")
    const cond = { ownNexusColorAtLeast: { color: "blue" as const, count: 2 } }
    s.players.p1.field.nexuses.push(createInstance("BS03-113", 1, 0))
    assert(!checkAuraCondition(s, "p1", cond), "1つでは不成立")
    s.players.p1.field.nexuses.push(createInstance("BS03-114", 1, 0))
    assert(checkAuraCondition(s, "p1", cond), "2つで成立")
}

console.log("=== 2. 《継召》を持つ自分のスピリット数（AuraCounter） ===")
{
    const s = game("550b")
    const a = createInstance("BS01-006", 1, 1)
    const b = createInstance("BS01-006", 1, 1)
    s.players.p1.field.spirits.push(a, b)
    assert(countAuraCounter(s, "p1", "ownExTrashReductionSpirits", a) === 0, "継召持ちがいなければ0")
    // 旧カードに継召持ちは無いので、カード定義へ一時的に付けて数える
    const effects = getCard("BS01-006").effects as unknown as { kind: string }[]
    effects.push({ kind: "exTrashReduction" })
    try {
        assert(countAuraCounter(s, "p1", "ownExTrashReductionSpirits", a) === 2, "継召持ち2体で2")
    } finally {
        effects.pop()
    }
}

console.log("=== 3. 指定した1体への回復＋BP+（同じ個体） ===")
{
    const s = game("550c")
    const a = createInstance("BS01-006", 1, 1)
    const b = createInstance("BS01-006", 1, 1)
    a.isRested = true
    b.isRested = true
    s.players.p1.field.spirits.push(a, b)
    resolveAction(s, "p1", null, { type: "sequence", actions: [{ type: "bpBuff", amount: 2000 }, { type: "refreshOne", filter: { lastBpBuffTarget: true } }] })
    const refreshed = [a, b].filter((x) => !x.isRested)
    assert(refreshed.length === 1, "回復したのは1体だけ")
    assert(s.lastBpBuffTargetId === refreshed[0]!.instanceId, "BP+した個体と回復した個体が同じ")
}

console.log("=== 4. トラッシュから召喚し、バトル終了時に破壊する印を立てる ===")
{
    const s = game("550d")
    s.players.p1.reserve = 5
    s.players.p1.trashCards = ["BS01-006"]
    resolveAction(s, "p1", null, { type: "toHand", from: "trash", count: 1, pick: { cardType: "spirit" }, dest: "summon", destroyAtBattleEnd: true })
    const sp = s.players.p1.field.spirits[0]
    assert(sp !== undefined && sp.destroyAtBattleEnd === true, "召喚された個体に destroyAtBattleEnd")
    assert(s.players.p1.trashCards.length === 0, "トラッシュから出た")
}
