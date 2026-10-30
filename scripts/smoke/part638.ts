// smoke パート638（globalConstraint noDeckMill：mill／【粉砕】は0枚、オープンしてからのトラッシュ行きは止めない）
import { assert, createGame, createInstance, destroySpirit, getCard, resolveAction } from "./helpers"
import { resolveFunsai } from "../../server/src/logic/keywords/funsai"
import type { GameState, PlayerId } from "./helpers"

const SOURCE = "BS01-002" // ロクケラトプス（赤・バニラ）。効果を一時的に足して発生源にする

console.log("=== 前提 ===")
assert(getCard(SOURCE).name === "ロクケラトプス", "SOURCEはロクケラトプス")

function game(seed: string, withSource: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack" as GameState["phase"]
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        s.players[pid].field.spirits = []
        s.players[pid].deck = Array.from({ length: 20 }, () => SOURCE)
        s.players[pid].trashCards = []
    }
    if (withSource) s.players.p1.field.spirits.push(createInstance(SOURCE, s.turn, 1))
    return s
}

const card = getCard(SOURCE)
const saved = card.effects
card.effects = [{ id: "t-nodm", kind: "globalConstraint", levels: [1, 2, 3], constraint: { type: "noDeckMill" } } as never]
try {
    for (const on of [true, false]) {
        const s = game(`mill-${on}`, on)
        resolveAction(s, "p1", null, { type: "discard", from: "deck", side: "opponent", count: 3 }, undefined, undefined, "magic")
        resolveAction(s, "p1", null, { type: "discard", from: "deck", count: 2, side: "own" }, undefined, undefined, "magic")
        assert(s.players.p2.trashCards.length === (on ? 0 : 3), `相手のデッキ破棄 ${on ? "止まる" : "対照：通る"}`)
        assert(s.players.p1.trashCards.length === (on ? 0 : 2), `自分のデッキ破棄 ${on ? "止まる（自分の効果も）" : "対照：通る"}`)
    }
    {
        const s = game("reveal", true)
        resolveAction(s, "p1", null, { type: "revealOpen", count: 2 }, undefined, undefined, "magic")
        resolveAction(s, "p1", null, { type: "moveCards", from: "revealed", count: "all", dest: "trash" }, undefined, undefined, "magic")
        assert(s.players.p1.trashCards.length === 2, "オープンしてからトラッシュへ置く処理は止めない")
    }
    {
        // 【粉砕】は0枚の破棄として成立し、後続（lastFunsai）は0枚で動く
        const s = game("funsai", true)
        const funsaiSpirit = createInstance("BS03-076", s.turn, 3) // 爪剣のラザラス
        s.players.p1.field.spirits.push(funsaiSpirit)
        resolveFunsai(s, "p1", funsaiSpirit)
        assert(s.players.p2.trashCards.length === 0 && s.lastFunsai?.total === 0, "【粉砕】は0枚破棄として成立する")
    }
    {
        // デッキを破棄するコストは払えない＝復活しない
        for (const on of [true, false]) {
            const s = game(`cost-${on}`, on)
            const c = getCard("BS01-005")
            const keep = c.effects
            c.effects = [{ id: "t-rv", kind: "reviveOnDestroy", levels: [1, 2, 3], scope: "self", when: {}, cost: { millSelfCount: 2 }, revived: { rested: false } } as never]
            try {
                const sp = createInstance("BS01-005", s.turn, 2)
                s.players.p1.field.spirits.push(sp)
                destroySpirit(s, "p1", sp.instanceId, "destroy")
                const alive = s.players.p1.field.spirits.some((x) => x.instanceId === sp.instanceId)
                assert(alive === !on, `デッキ破棄コストの復活 ${on ? "払えず破壊される" : "対照：払えて復活する"}`)
            } finally {
                c.effects = keep
            }
        }
    }
} finally {
    card.effects = saved
}
console.log("すべてのチェックに合格しました 🎉（part638）")
