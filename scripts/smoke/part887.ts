// smoke パート887（BS15-016 闇騎士ガウェイン 召喚時：自分のバーストを破棄することで、相手のスピリットのコア3個を「相手のリザーブ」に置く。
// データの行き先がトラッシュになっていた。2026-11-11）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const GAWAIN = "BS15-016"
const VANILLA = "BS01-001" // ゴラドン
const BURST = "BS15-004" // 自分のバーストとして置くカード（中身は問わない）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(GAWAIN).name === "闇騎士ガウェイン", "BS15-016 は闇騎士ガウェイン")
assert(getCard(VANILLA).name === "ゴラドン", "BS01-001 はゴラドン")

console.log("=== 召喚時：相手のスピリットのコア3個は相手のリザーブへ（トラッシュではない） ===")
{
    const s = createGame("gawain-reserve", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const gawain = createInstance(GAWAIN, s.turn, 1)
    s.players.p1.field.spirits.push(gawain)
    s.players.p1.burst = BURST
    const target = createInstance(VANILLA, s.turn, 4)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    const reserveBefore = s.players.p2.reserve
    const trashBefore = s.players.p2.trashCores
    const entry = getCard(GAWAIN).effects.find((e) => e.id === "BS15-016-e2") as { action: EffectAction }
    resolveAction(s, "p1", gawain, entry.action)
    assert(s.players.p1.burst === null, "自分のバーストを破棄した")
    assert(target.cores === 1, `相手のスピリットのコアが3個減る（実際: ${target.cores}）`)
    assert(s.players.p2.reserve === reserveBefore + 3, `相手のリザーブに3個置かれる（実際: +${s.players.p2.reserve - reserveBefore}）`)
    assert(s.players.p2.trashCores === trashBefore, "相手のトラッシュのコアは増えない")
}

console.log("すべてのチェックに合格しました 🎉（part887）")
