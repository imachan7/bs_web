// smoke パート936（「相手のフィールドのコアN個」はネクサス上のコアも対象。N≧2 は何体からでも合計N個。#519。CORE_UNIFY_REMOVE.md）
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const BAALAR = "BS15-X02" // 虚皇帝ネザード・バァラル：Lv2-3 【不死】持ちがアタックしたとき、相手のフィールドのコア2個を相手のトラッシュに置く
const KUSURO = "BS21-018" // 骸獣侯ボーン・クスロー：召喚時、相手のフィールドのコア1個を相手のリザーブに置く
const BONGO = "BS21-062" // 弩弓獣クロス・ボンゴ：合体時ブロック時、紫シンボルを持つとき相手のフィールドのコア1個を相手のリザーブに置く
const NEXUS = "BS02-083" // 鏡の回廊（ネクサス）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(BAALAR).name === "虚皇帝ネザード・バァラル", "BAALAR")
assert(getCard(KUSURO).name === "骸獣侯ボーン・クスロー", "KUSURO")
assert(getCard(NEXUS).type === "nexus", "NEXUS はネクサス")

const actionOf = (cardId: string, effectId: string) => (getCard(cardId).effects.find((e) => e.id === effectId) as { action: unknown }).action as never

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    runTurnStart(s)
    s.players.p2.field.spirits = []
    s.players.p2.field.nexuses = []
    return s
}

console.log("=== バァラル：ネクサスにしかコアが無くても取る ===")
{
    const s = game("t936-baalar-nexus")
    const nexus = createInstance(NEXUS, s.turn, 3)
    s.players.p2.field.nexuses.push(nexus)
    const trash = s.players.p2.trashCores
    resolveAction(s, "p1", null, actionOf(BAALAR, "BS15-X02-e4"))
    assert(nexus.cores === 1, `ネクサスのコアが2個減る（実際${nexus.cores}）`)
    assert(s.players.p2.trashCores === trash + 2, "相手のトラッシュへ")
}
console.log("=== バァラル：スピリットのコアが1個でも、残りをネクサスから取って合計2個 ===")
{
    const s = game("t936-baalar-spread")
    const spirit = createInstance(VANILLA, s.turn, 1)
    const nexus = createInstance(NEXUS, s.turn, 3)
    s.players.p2.field.spirits.push(spirit)
    s.players.p2.field.nexuses.push(nexus)
    const trash = s.players.p2.trashCores
    resolveAction(s, "p1", null, actionOf(BAALAR, "BS15-X02-e4"))
    assert(s.players.p2.trashCores === trash + 2, "合計2個を相手のトラッシュへ")
}
console.log("=== ボーン・クスロー：ネクサスにしかコアが無くても取る ===")
{
    const s = game("t936-kusuro")
    const nexus = createInstance(NEXUS, s.turn, 2)
    s.players.p2.field.nexuses.push(nexus)
    const reserve = s.players.p2.reserve
    resolveAction(s, "p1", null, actionOf(KUSURO, "BS21-018-e2"))
    assert(nexus.cores === 1 && s.players.p2.reserve === reserve + 1, "ネクサスのコア1個を相手のリザーブへ")
}

console.log("=== クロス・ボンゴ（同じ形のデータ）：ネクサスにしかコアが無くても取る ===")
{
    const s = game("t936-bongo")
    const nexus = createInstance(NEXUS, s.turn, 2)
    s.players.p2.field.nexuses.push(nexus)
    const reserve = s.players.p2.reserve
    const then = ((actionOf(BONGO, "BS21-062-e1") as unknown as { actions: { then: unknown }[] }).actions[1]!.then) as never
    resolveAction(s, "p1", null, then)
    assert(nexus.cores === 1 && s.players.p2.reserve === reserve + 1, "ネクサスのコア1個を相手のリザーブへ")
}

console.log("すべてのチェックに合格しました 🎉（part936）")
