// smoke part1066（アルティメット土台 段1：極シンボル。docs/design/ULTIMATE.md §5・ULTIMATE_PLAN B11・B12）
// 極は色として数えず（軽減・「◯のシンボルがある」）、シンボルの数では1つと数える。data/cards に極のカードは無いので偽のカードを登録する
import { assert, createGame, createInstance, effectiveCost, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import { instanceSymbolCount, onlyColors } from "../../shared/rules/symbols"
import { ownFieldSymbolColors } from "../../shared/cost"

const BASE = "BS01-002" // ロクケラトプス（赤）
assert(getCard(BASE).name === "ロクケラトプス" && getCard(BASE).colors[0] === "red", "BASEは赤のロクケラトプス")

const ULT_SPIRIT = "TEST-U01" // 極シンボル1つ
const RED_COST3 = "TEST-U02" // コスト3・赤の軽減1
const ULT_COST3 = "TEST-U03" // コスト3・極の軽減1
const fakes: Record<string, Partial<ReturnType<typeof getCard>>> = {
    [ULT_SPIRIT]: { symbol: ["ultimate"] },
    [RED_COST3]: { cost: 3, reduction: ["red"] },
    [ULT_COST3]: { cost: 3, reduction: ["ultimate"] },
}
for (const [id, patch] of Object.entries(fakes)) CARD_DB.set(id, { ...getCard(BASE), ...patch, cardId: id })

function field(spirits: string[]): GameState {
    const s = createGame("ult", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    for (const id of spirits) s.players.p1.field.spirits.push(createInstance(id, s.turn, 1))
    refreshLevelAsOverrides(s)
    return s
}
const cost = (s: GameState, id: string, pid: PlayerId = "p1") => effectiveCost(s, pid, getCard(id))

try {
    console.log("=== A. 軽減：極は色として数えない／極の枠は極でだけ埋まる ===")
    const onlyUlt = field([ULT_SPIRIT])
    assert(cost(onlyUlt, RED_COST3) === 3, "極だけのとき赤の軽減は0")
    assert(cost(onlyUlt, ULT_COST3) === 2, "極の枠は極シンボルで埋まる")
    const onlyRed = field([BASE])
    assert(cost(onlyRed, RED_COST3) === 2, "対照：赤シンボルなら赤の軽減が効く")
    assert(cost(onlyRed, ULT_COST3) === 3, "色のシンボルでは極の枠は埋まらない")

    console.log("=== B. 「赤のシンボルがある」に極は入らない ===")
    assert(!ownFieldSymbolColors(onlyUlt, "p1").has("red"), "極だけなら赤は入らない")
    assert(ownFieldSymbolColors(onlyUlt, "p1").size === 0, "極だけなら色の集合は空（極が色として混ざらない）")
    assert(ownFieldSymbolColors(onlyRed, "p1").has("red"), "対照：赤スピリットなら入る")

    console.log("=== C. シンボルの数は極も1つ ===")
    assert(instanceSymbolCount(onlyUlt.players.p1.field.spirits[0]!) === 1, "極シンボルの数は1")
    assert(onlyColors(["red", "ultimate"]).length === 1, "onlyColors は極を除く")
} finally {
    for (const id of Object.keys(fakes)) CARD_DB.delete(id)
}

console.log("すべてのチェックに合格しました 🎉（part1066）")
