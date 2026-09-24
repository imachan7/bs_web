// smoke パート360（M4b refresh の統一：refreshAllOwnByFilter／refreshAllByKeyword／refreshAllByCost／refreshByFamily の全使用箇所が、
// refreshOne＋all／anySide／filter で同じ結果になる。移行後にこのパートの比較節は消す）
import { assert, createGame, createInstance, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardData, CardInstance, EffectAction } from "../../server/src/type"
import { loadAllCards } from "../../data/loadCards"

const CARDS = loadAllCards() as CardData[]
const OLD = new Set(["refreshAllOwnByFilter", "refreshAllByKeyword", "refreshAllByCost", "refreshByFamily"])

// 移行スクリプトと同じ変換
function convert(a: Record<string, unknown>): EffectAction {
    const t = a["type"]
    if (t === "refreshAllOwnByFilter") return { type: "refreshOne", all: true, filter: a["filter"] } as EffectAction
    if (t === "refreshAllByKeyword") {
        const filter = { keyword: a["keyword"], ...(a["keywordCount"] !== undefined ? { keywordCount: a["keywordCount"] } : {}) }
        return { type: "refreshOne", all: true, ...(a["side"] === "own" ? {} : { anySide: true }), filter } as EffectAction
    }
    if (t === "refreshAllByCost") return { type: "refreshOne", all: true, anySide: true, filter: { cost: { min: a["cost"], max: a["cost"] } } } as EffectAction
    const count = a["count"] as number
    return { type: "refreshOne", ...(count >= 99 ? { all: true } : { count }), filter: { family: a["familyFilter"] } } as EffectAction
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

// 各使用箇所の絞り込みに当たるスピリットと当たらないスピリットが両陣営にいる盤面
const spirits = CARDS.filter((c) => c.type === "spirit" && c.levels.length > 0)
const kwCount = (c: CardData, kw: string): number | undefined => {
    const e = c.effects.find((x) => x.kind === "keyword" && x.keyword === kw && (x.levels === null || x.levels.includes(1)))
    return e && e.kind === "keyword" ? (e.count ?? 1) : undefined
}
const pick = (pred: (c: CardData) => boolean, label: string): CardData => {
    const c = spirits.find(pred)
    if (!c) throw new Error(`盤面用のスピリットが見つからない：${label}`)
    return c
}
const pool: CardData[] = [
    pick((c) => kwCount(c, "funsai") !== undefined, "粉砕"),
    pick((c) => kwCount(c, "bofu") === 1, "暴風1"),
    pick((c) => kwCount(c, "bofu") === 2, "暴風2"),
    pick((c) => kwCount(c, "soku") !== undefined, "神速"),
    pick((c) => kwCount(c, "clash") !== undefined, "激突"),
    pick((c) => c.effects.length === 0 && c.cost === 2, "コスト2のバニラ"),
    pick((c) => c.effects.length === 0 && c.colors.includes("green") && c.cost !== 2, "緑のバニラ"),
    ...["巨獣", "甲獣", "龍帝", "虚神", "機獣", "戯狩"].map((f) => pick((c) => c.family.includes(f), f)),
]

console.log("=== 前提 ===")
assert(uses.length >= 14, `旧4種の使用箇所を集められる（${uses.length}か所）`)

function board(): { s: GameState; self: CardInstance } {
    const s = createGame("m4b", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const c of pool) {
            const inst = createInstance(c.cardId, s.turn, c.levels[0]!.cores)
            inst.isRested = true
            s.players[pid].field.spirits.push(inst)
        }
    }
    return { s, self: s.players.p1.field.spirits[0]! }
}
const snapshot = (s: GameState): string =>
    JSON.stringify((["p1", "p2"] as PlayerId[]).map((pid) => s.players[pid].field.spirits.map((x) => [x.cardId, x.isRested, x.cantAttackThisTurn ?? false])))

console.log("=== 1. 旧4種の全使用箇所が、refreshOne＋all／anySide／filter で同じ結果 ===")
let moved = 0
for (const u of uses) {
    const a = board()
    const b = board()
    const before = snapshot(a.s)
    resolveAction(a.s, "p1", a.self, u.action as unknown as EffectAction, undefined, undefined, u.srcType)
    resolveAction(b.s, "p1", b.self, convert(u.action), undefined, undefined, u.srcType)
    if (snapshot(a.s) !== before) moved++
    assert(snapshot(a.s) === snapshot(b.s), `${u.cardId} ${String(u.action["type"])}：旧と新で同じ結果`)
}
assert(moved === uses.length, `すべての使用箇所で旧の書き方が実際に回復させている（${moved}/${uses.length}）`)

console.log("=== 2. keywordCount：付与や別の指定数の暴風は対象外 ===")
{
    const { s, self } = board()
    resolveAction(s, "p1", self, { type: "refreshOne", all: true, filter: { keyword: "bofu", keywordCount: 1 } }, undefined, undefined, "spirit")
    const bofu1 = s.players.p1.field.spirits[1]!
    const bofu2 = s.players.p1.field.spirits[2]!
    assert(!bofu1.isRested && bofu2.isRested, "【暴風：1】だけ回復し、【暴風：2】は疲労のまま")
}

console.log("すべてのチェックに合格しました 🎉（part360）")
