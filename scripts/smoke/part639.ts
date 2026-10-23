// smoke パート639（noHandGainByEffect の拡張：トラッシュ→手札・オープン→手札・【光芒】系・ドローステップは止めない）
import { assert, createGame, createInstance, destroySpirit, getCard, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SOURCE = "BS01-002" // ロクケラトプス（赤・バニラ）。効果を一時的に足して発生源にする
const OTHER = "BS01-005" // コスト2のバニラ

console.log("=== 前提 ===")
assert(getCard(SOURCE).name === "ロクケラトプス" && getCard(OTHER).cost === 2, "カード確認")

function game(seed: string, withSource: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        s.players[pid].field.spirits = []
        s.players[pid].hand = []
        s.players[pid].trashCards = []
        s.players[pid].deck = Array.from({ length: 20 }, () => SOURCE)
    }
    if (withSource) s.players.p2.field.spirits.push(createInstance(SOURCE, s.turn, 1))
    return s
}

const card = getCard(SOURCE)
const saved = card.effects
card.effects = [{ id: "t-nohg", kind: "globalConstraint", levels: [1, 2, 3], constraint: { type: "noHandGainByEffect" } } as never]
try {
    for (const on of [true, false]) {
        const tag = on ? "止まる" : "対照：通る"
        {
            const s = game(`trash-${on}`, on)
            s.players.p1.trashCards = [OTHER]
            resolveAction(s, "p1", null, { type: "moveCards", from: "trash", count: 1, dest: "hand" }, undefined, undefined, "magic")
            assert(s.players.p1.hand.length === (on ? 0 : 1), `トラッシュから手札 ${tag}`)
            assert(s.players.p1.trashCards.length === (on ? 1 : 0), `トラッシュの残り ${tag}`)
        }
        {
            const s = game(`reveal-${on}`, on)
            s.players.p1.deck = [OTHER, OTHER, SOURCE, SOURCE]
            resolveAction(s, "p1", null, { type: "revealOpen", count: 2 }, undefined, undefined, "magic")
            resolveAction(s, "p1", null, { type: "moveCards", from: "revealed", count: 1, dest: "hand" }, undefined, undefined, "magic")
            resolveAction(s, "p1", null, { type: "moveCards", from: "revealed", count: "all", dest: "trash" }, undefined, undefined, "magic")
            assert(s.players.p1.hand.length === (on ? 0 : 1), `オープンして手札に加える ${tag}`)
            assert(s.players.p1.trashCards.length === (on ? 2 : 1), `選ばれなかった扱いで残りと同じ行き先（トラッシュ） ${tag}`)
        }
        {
            const s = game(`revive-${on}`, on)
            const c = getCard(OTHER)
            const keep = c.effects
            c.effects = [{ id: "t-rv2", kind: "reviveOnDestroy", levels: [1, 2, 3], scope: "self", when: {}, revived: { toHand: true } } as never]
            try {
                const sp = createInstance(OTHER, s.turn, 2)
                s.players.p1.field.spirits.push(sp)
                destroySpirit(s, "p1", sp.instanceId, "destroy")
                assert(s.players.p1.hand.length === (on ? 0 : 1), `復活(toHand)で手札へ ${tag}`)
                assert(s.players.p1.trashCards.includes(OTHER) === on, `止まるときは通常どおり破壊される ${tag}`)
            } finally {
                c.effects = keep
            }
        }
    }
} finally {
    card.effects = saved
}
console.log("すべてのチェックに合格しました 🎉（part639）")
