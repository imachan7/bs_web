// smoke パート1073（アルティメットの土台 段3c：フィールドのコアにアルティメットを含める。docs/design/ULTIMATE_STAGE3.md）
// removeCores の置き場 "field" はアルティメットのコアも対象にし、"spirit"/"nexus" だけの指定は含めない（B1・B2）
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { fieldOrReserveCores, payCoresFromFieldOrReserveToTrash } from "../../server/src/logic/actions/cores"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

function removeCoresOf(cardId: string, index: number): EffectAction {
    const e = (getCard(cardId).effects ?? []).filter((x) => (x as { action?: { type?: string } }).action?.type === "removeCores")[index] as unknown as { action: EffectAction }
    return e.action
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS21-018").name === "骸獣侯ボーン・クスロー", "BS21-018は骸獣侯ボーン・クスロー")
    assert(getCard("BS17-012").name === "闇騎士アグロヴァル", "BS17-012は闇騎士アグロヴァル")
    const a = removeCoresOf("BS21-018", 0) as { from?: string[] }
    assert(a.from?.length === 1 && a.from[0] === "field", "BS21-018の置き場は field")
    const b = removeCoresOf("BS17-012", 0) as { from?: string[] }
    assert(b.from?.join() === "spirit,nexus", "BS17-012の置き場は spirit,nexus のまま")
}

console.log("=== 1. from:field：アルティメットのコアが取られる ===")
{
    const s = game("ult3c-field")
    const ult = createInstance(VANILLA, s.turn, 2)
    s.players.p2.field.ultimates.push(ult)
    const before = s.players.p2.reserve
    const src = createInstance("BS21-018", s.turn, 1)
    resolveAction(s, "p1", src, removeCoresOf("BS21-018", 0))
    assert(ult.cores === 1, "アルティメットのコアが1個減った")
    assert(s.players.p2.reserve === before + 1, "相手のリザーブに置かれた")
}

console.log("=== 2. from:[spirit,nexus]：アルティメットのコアは取られない ===")
{
    const s = game("ult3c-spirit-nexus")
    const ult = createInstance(VANILLA, s.turn, 2)
    s.players.p2.field.ultimates.push(ult)
    const before = s.players.p2.reserve
    const src = createInstance("BS17-012", s.turn, 1)
    resolveAction(s, "p1", src, removeCoresOf("BS17-012", 0))
    assert(ult.cores === 2, "アルティメットのコアは減らない")
    assert(s.players.p2.reserve === before, "リザーブも変わらない")
}

console.log("=== 3. from:field：スピリットとアルティメットの合計で数える（downTo） ===")
{
    const s = game("ult3c-downto")
    const ult = createInstance(VANILLA, s.turn, 3)
    const sp = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.ultimates.push(ult)
    s.players.p2.field.spirits.push(sp)
    resolveAction(s, "p1", null, { type: "removeCores", side: "opponent", from: ["field"], count: 1, downTo: 1, to: "reserve" })
    assert(ult.cores + sp.cores === 1, "フィールドのコア合計（アルティメット含む）が1個になった")
}

console.log("=== 4. コストの支払い：アルティメットのコアでも払える ===")
{
    const s = game("ult3c-pay")
    const ult = createInstance(VANILLA, s.turn, 3)
    s.players.p1.field.ultimates.push(ult)
    s.players.p1.reserve = 0
    s.players.p1.field.spirits.length = 0
    assert(fieldOrReserveCores(s, "p1") === 3, "払えるコアの総量にアルティメットのコアが入る")
    const paid = payCoresFromFieldOrReserveToTrash(s, "p1", 2)
    assert(paid === 2, "2個払えた")
    assert(ult.cores === 1, "アルティメットのコアが減った")
}

console.log("すべてのチェックに合格しました 🎉（part1073）")
