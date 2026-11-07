// smoke パート830（cantBounce：「手札に戻すことで」の支払いも効果のうち。2026-11-07 ユーザー確認）
// 戻らないスピリットは支払いの候補から外れ、払えないので「回復する」は発揮されない（コロコーン BS13-019）
import { instColors } from "../../shared/rules"
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const KOROCORN = "BS13-019" // コロコーン（緑・コスト3）終了時、【神速】持ちの自分のスピリット1体を手札に戻すことで回復する
const MACH = "BS19-024" // ダーク・マッハジー（緑・コスト2・【神速】・召喚時効果あり）
const FLAMEFIELD = "BS19-099" // フレイムフィールド（お互いの効果で手札/デッキに戻らない）
const PRISCILLA = "BS22-016" // 魔剣使プリシラ（召喚時効果を持つスピリットは効果で戻らない）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(KOROCORN).name === "コロコーン" && getCard(KOROCORN).colors.includes("green"), "KOROCORNはコロコーン")
    assert(getCard(MACH).name === "ダーク・マッハジー" && getCard(MACH).cost === 2, "MACHはダーク・マッハジー")
    assert(getCard(FLAMEFIELD).name === "フレイムフィールド" && getCard(FLAMEFIELD).type === "magic", "FLAMEFIELDはフレイムフィールド")
    assert(getCard(PRISCILLA).name === "魔剣使プリシラ" && getCard(PRISCILLA).type === "spirit", "PRISCILLAは魔剣使プリシラ")
}

function run(guard: "none" | "field" | "priscilla"): { returned: boolean; refreshed: boolean } {
    const s: GameState = createGame("cb-" + guard, { p1: "a", p2: "b" }, { p1: "green", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    const me = createInstance(KOROCORN, s.turn, 3)
    const mach = createInstance(MACH, s.turn, 1)
    s.players.p1.field.spirits.push(me, mach)
    me.isRested = true
    if (guard === "field") s.players.p1.field.nexuses.push(createInstance(FLAMEFIELD, s.turn, 0))
    if (guard === "priscilla") s.players.p2.field.spirits.push(createInstance(PRISCILLA, s.turn, 3))
    refreshLevelAsOverrides(s)
    const e = getCard(KOROCORN).effects.find((x) => x.id === "BS13-019-e1") as unknown as { action: Parameters<typeof resolveAction>[3] }
    resolveAction(s, "p1", me, e.action, undefined, instColors(me), "spirit")
    return { returned: !s.players.p1.field.spirits.some((x) => x.instanceId === mach.instanceId), refreshed: !me.isRested }
}

console.log("=== 1. 対照：何も無ければ戻して回復する ===")
{
    const r = run("none")
    assert(r.returned && r.refreshed, "神速持ちを戻して回復した")
}
console.log("=== 2. フレイムフィールド：戻せないので払えず、回復しない ===")
{
    const r = run("field")
    assert(!r.returned && !r.refreshed, "戻らず、回復もしない")
}
console.log("=== 3. プリシラ：召喚時効果持ちは戻せないので払えず、回復しない ===")
{
    const r = run("priscilla")
    assert(!r.returned && !r.refreshed, "戻らず、回復もしない")
}
console.log("すべてのチェックに合格しました 🎉（part831）")
