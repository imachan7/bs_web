// smoke パート388（破壊された相手のスピリットのコアの行き先：ガイ・アスラはボイド、赤き前方後円墳はトラッシュ）
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS14-073").name === "赤き前方後円墳" && getCard("BS14-073").levels[1]?.cores === 1, "BS14-073 は赤き前方後円墳（Lv2 はコア1）")
    assert(getCard("BS01-025").levels[1]?.bp === 10000, "要塞龍ギガ Lv2 は BP10000")
    assert(getCard("BS01-002").levels[0]?.bp !== undefined && getCard("BS01-002").levels[0]!.bp < 10000, "BS01-002 はギガより BP が低い")
}

console.log("=== 赤き前方後円墳 Lv2：BPを比べて破壊した相手のスピリットのコアはトラッシュへ ===")
{
    const s = game("p388-kofun")
    s.players.p1.field.nexuses.push(createInstance("BS14-073", s.turn, 1)) // Lv2
    const giga = createInstance("BS01-025", s.turn, 3)
    s.players.p1.field.spirits.push(giga)
    const blocker = createInstance("BS01-002", s.turn, 2)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    const reserveBefore = s.players.p2.reserve
    const trashBefore = s.players.p2.trashCores
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: giga.instanceId }) === null, "ギガでアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(blocker), "ブロッカーは破壊される")
    assert(s.players.p2.reserve === reserveBefore, "コアはリザーブへ戻らない")
    assert(s.players.p2.trashCores === trashBefore + 2, "コア2個はトラッシュへ置かれる")
}

console.log("すべてのチェックに合格しました 🎉（part388）")
