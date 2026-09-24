// smoke パート359（TargetFilter.sameLevelAsBattleLoser：直前のバトルで破壊された側と同じLv。記録が0なら対象なし）
import { assert, createGame, createInstance, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardData, CardInstance, EffectAction } from "../../server/src/type"
import { loadAllCards } from "../../data/loadCards"

const CARDS = loadAllCards() as CardData[]
const CARDS_OK = CARDS.length > 0

// バニラのスピリットをコスト順に並べ、色・BP・コストがばらけるように拾う
const vanillas = CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0 && c.levels.length >= 2)
const byCost = new Map<number, CardData>()
for (const c of vanillas) if (!byCost.has(c.cost)) byCost.set(c.cost, c)
const pool = [...byCost.values()].sort((a, b) => a.cost - b.cost).slice(0, 6)

console.log("=== 前提 ===")
assert(CARDS_OK, "カードデータを読める")
assert(pool.length === 6 && new Set(pool.map((c) => c.cost)).size === 6, `コストの違うバニラを6枚拾える（${pool.map((c) => `${c.cardId}:${c.cost}`).join(" ")}）`)

function board(): { s: GameState; self: CardInstance; eventTarget: CardInstance } {
    const s = createGame("m4", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        s.players[pid].deck = Array.from({ length: 30 }, () => pool[0]!.cardId)
        s.players[pid].hand = []
        s.players[pid].reserve = 5
        pool.forEach((c, i) => {
            // 偶数番目はLv2、3の倍数番目は疲労状態
            const inst = createInstance(c.cardId, s.turn, i % 2 === 0 ? c.levels[1]!.cores : c.levels[0]!.cores)
            inst.isRested = i % 3 === 0
            s.players[pid].field.spirits.push(inst)
        })
    }
    const loser = s.players.p2.field.spirits[2]!
    const loserCard = CARDS.find((c) => c.cardId === loser.cardId)!
    s.lastBattleDestroyedFamilies = [...loserCard.family]
    s.lastBattleDestroyedColors = [...loserCard.colors]
    s.lastBattleDestroyedBp = 3000
    s.lastBattleDestroyedLevel = 1
    return { s, self: s.players.p1.field.spirits[1]!, eventTarget: s.players.p2.field.spirits[1]! }
}

function snapshot(s: GameState): string {
    const side = (pid: PlayerId) => {
        const p = s.players[pid]
        return [p.hand.length, p.deck.length, p.trashCards.length, p.reserve, p.field.spirits.map((x) => [x.cardId, x.cores, x.isRested])]
    }
    return JSON.stringify([side("p1"), side("p2")])
}

console.log("=== 2. sameLevelAsBattleLoser：記録が0なら対象なし ===")
{
    const { s, self } = board()
    s.lastBattleDestroyedLevel = 0
    const before = snapshot(s)
    resolveAction(s, "p1", self, { type: "exhaust", count: 1, all: true, anySide: true, filter: { sameLevelAsBattleLoser: true } }, undefined, undefined, "spirit")
    assert(snapshot(s) === before, "直前のバトルで破壊されたスピリットがいなければ何も疲労しない")
}

console.log("すべてのチェックに合格しました 🎉（part359）")
