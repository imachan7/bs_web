// smoke パート605（【不死】は破壊なら手段を問わず誘発し、消滅では誘発しない。2026-10-16 ユーザー確認。TIMING_CHART §0）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance } from "../../server/src/type"

const BOA = "BS16-016" // ボアトリクター【不死：コスト3/4】
const BELL = "BS01-089" // デュアルキャノン・ベル（コスト4・効果なし）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(BOA).name === "ボアトリクター", "BS16-016 はボアトリクター")
assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).cost === 4, "BS01-089 はコスト4のデュアルキャノン・ベル")

function game(seed: string): { s: GameState; bell: CardInstance } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.phase = "attack"
    s.players.p1.reserve = 20
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.trashCards = [BOA]
    const bell = createInstance(BELL, s.turn, 1)
    s.players.p1.field.spirits.push(bell)
    refreshLevelAsOverrides(s)
    return { s, bell }
}
const boaOnField = (s: GameState): boolean => s.players.p1.field.spirits.some((x) => x.cardId === BOA)

console.log("=== 1. 相手の効果で1体を破壊：【不死】で召喚される ===")
{
    const { s, bell } = game("p605-1")
    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, bell.instanceId)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === bell.instanceId), "デュアルキャノン・ベルが破壊される")
    assert(boaOnField(s), "ボアトリクターが【不死】で召喚される")
}

console.log("=== 2. 自分の効果で自分のスピリットを破壊：【不死】で召喚される ===")
{
    const { s, bell } = game("p605-2")
    resolveAction(s, "p1", bell, { type: "destroy", target: "self", count: 1 })
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === bell.instanceId), "デュアルキャノン・ベルが破壊される")
    assert(boaOnField(s), "ボアトリクターが【不死】で召喚される")
}

console.log("=== 3. コアを取り除かれて消滅：【不死】は誘発しない ===")
{
    const { s, bell } = game("p605-3")
    resolveAction(s, "p2", null, { type: "removeCores", count: 1 }, bell.instanceId)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === bell.instanceId), "デュアルキャノン・ベルが消滅する")
    assert(!boaOnField(s) && s.players.p1.trashCards.includes(BOA), "ボアトリクターはトラッシュに残る")
}

console.log("すべてのチェックに合格しました 🎉（part605）")
