// smoke パート359（M4 filter の統一：destroyAll／exhaustAll／exhaustAllByLevel／returnAllToHand の全使用箇所が、
// 元のアクション＋all:true＋filter で同じ結果になる。移行後にこのパートの比較節は消す）
import { assert, createGame, createInstance, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardData, CardInstance, EffectAction } from "../../server/src/type"
import { loadAllCards } from "../../data/loadCards"

const CARDS = loadAllCards() as CardData[]
const OLD = new Set(["destroyAll", "exhaustAll", "exhaustAllByLevel", "returnAllToHand"])

// 移行スクリプトと同じ変換
function convert(a: Record<string, unknown>): EffectAction {
    const { type, ...rest } = a
    if (type === "destroyAll") {
        const { anySide, ...others } = rest
        return { type: "destroy", count: 1, all: true, ...(anySide ? { anySide: true } : {}), ...others } as EffectAction
    }
    if (type === "exhaustAll") {
        const { side, minBp, maxBp, costFilter, filter } = rest as Record<string, never>
        const f = { ...(filter ?? {}), ...(minBp !== undefined ? { minBp } : {}), ...(maxBp !== undefined ? { maxBp } : {}), ...(costFilter !== undefined ? { cost: costFilter } : {}) }
        return { type: "exhaust", count: 1, all: true, ...(side === "both" ? { anySide: true } : {}), ...(Object.keys(f).length ? { filter: f } : {}) } as EffectAction
    }
    if (type === "exhaustAllByLevel") {
        const level = rest["level"]
        const filter = level === "lastBattleDestroyed" ? { sameLevelAsBattleLoser: true } : { level: [level] }
        return { type: "exhaust", count: 1, all: true, anySide: true, filter } as EffectAction
    }
    const { side, costFilter, filter } = rest as Record<string, never>
    const f = { ...(filter ?? {}), ...(costFilter !== undefined ? { cost: costFilter } : {}) }
    return { type: "returnToHand", count: 1, all: true, ...(side === "both" ? { anySide: true } : {}), ...(Object.keys(f).length ? { filter: f } : {}) } as EffectAction
}

const uses: { cardId: string; srcType: CardData["type"]; action: Record<string, unknown> }[] = []
const walk = (o: unknown, card: CardData): void => {
    if (Array.isArray(o)) return o.forEach((x) => walk(x, card))
    if (o === null || typeof o !== "object") return
    const rec = o as Record<string, unknown>
    if (typeof rec["type"] === "string" && OLD.has(rec["type"])) uses.push({ cardId: card.cardId, srcType: card.type, action: rec })
    Object.values(rec).forEach((v) => walk(v, card))
}
CARDS.forEach((c) => walk(c.effects, c))

// バニラのスピリットをコスト順に並べ、色・BP・コストがばらけるように拾う
const vanillas = CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0 && c.levels.length >= 2)
const byCost = new Map<number, CardData>()
for (const c of vanillas) if (!byCost.has(c.cost)) byCost.set(c.cost, c)
const pool = [...byCost.values()].sort((a, b) => a.cost - b.cost).slice(0, 6)

console.log("=== 前提 ===")
assert(uses.length >= 50, `旧4種の使用箇所を集められる（${uses.length}か所）`)
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

console.log("=== 1. 旧4種の全使用箇所が、元のアクション＋all:true で同じ結果 ===")
let moved = 0
for (const u of uses) {
    const a = board()
    const b = board()
    const before = snapshot(a.s)
    resolveAction(a.s, "p1", a.self, u.action as unknown as EffectAction, a.eventTarget.instanceId, undefined, u.srcType)
    resolveAction(b.s, "p1", b.self, convert(u.action), b.eventTarget.instanceId, undefined, u.srcType)
    if (snapshot(a.s) !== before) moved++
    assert(snapshot(a.s) === snapshot(b.s), `${u.cardId} ${String(u.action["type"])}：旧と新で同じ結果`)
}
assert(moved >= uses.length * 0.8, `比べた盤面の大半で旧の書き方が実際に盤面を動かしている（${moved}/${uses.length}）`)

console.log("=== 2. sameLevelAsBattleLoser：記録が0なら対象なし ===")
{
    const { s, self } = board()
    s.lastBattleDestroyedLevel = 0
    const before = snapshot(s)
    resolveAction(s, "p1", self, { type: "exhaust", count: 1, all: true, anySide: true, filter: { sameLevelAsBattleLoser: true } }, undefined, undefined, "spirit")
    assert(snapshot(s) === before, "直前のバトルで破壊されたスピリットがいなければ何も疲労しない")
}

console.log("すべてのチェックに合格しました 🎉（part359）")
