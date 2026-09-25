// smoke パート360（TargetFilter.keywordCount：カードに書かれたキーワードの指定数で絞る。【暴風：1】限定）
import { cantActByTimed } from "../../shared/rules"
import { assert, createGame, createInstance, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardData, CardInstance } from "../../server/src/type"
import { loadAllCards } from "../../data/loadCards"

const CARDS = loadAllCards() as CardData[]
// キーワード・系統・コスト・色の違うスピリットが両陣営にいる盤面
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
assert(pool.length === 13, "盤面用のスピリットを13枚拾える")

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
    JSON.stringify((["p1", "p2"] as PlayerId[]).map((pid) => s.players[pid].field.spirits.map((x) => [x.cardId, x.isRested, cantActByTimed(s, x)])))

console.log("=== 2. keywordCount：付与や別の指定数の暴風は対象外 ===")
{
    const { s, self } = board()
    resolveAction(s, "p1", self, { type: "refreshOne", all: true, filter: { keyword: "bofu", keywordCount: 1 } }, undefined, undefined, "spirit")
    const bofu1 = s.players.p1.field.spirits[1]!
    const bofu2 = s.players.p1.field.spirits[2]!
    assert(!bofu1.isRested && bofu2.isRested, "【暴風：1】だけ回復し、【暴風：2】は疲労のまま")
}

console.log("すべてのチェックに合格しました 🎉（part360）")
