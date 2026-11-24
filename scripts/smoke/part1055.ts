// smoke パート1055（BS11-X05 魔導双神ジェミナイズ：自身の召喚ではLv1-3効果を発揮しない。Q3055・#692）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const GEMINI = "BS11-X05" // 魔導双神ジェミナイズ（黄・コスト7・光導）
const AQUA = "BS11-X04" // 宝瓶神機アクア・エリシオン（白・コスト7・光導）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(GEMINI).name === "魔導双神ジェミナイズ" && getCard(GEMINI).family.includes("光導"), "GEMINIはジェミナイズ（光導）")
    assert(getCard(AQUA).name === "宝瓶神機アクア・エリシオン" && getCard(AQUA).family.includes("光導"), "AQUAはアクア・エリシオン（光導）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
}

function game(seed: string, hand: string[]): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = hand
    return s
}

console.log("=== 1. ジェミナイズ自身を手札から召喚：デッキはオープンされない ===")
{
    const s = game("gemini-self", [GEMINI])
    handleAction(s, "p1", { type: "summon", handIndex: 0 })
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === GEMINI), "ジェミナイズが場に出た")
    assert(s.players.p1.deck.length === 40, `デッキは40枚のまま（実際 ${s.players.p1.deck.length}）`)
}

console.log("=== 2. ジェミナイズがいて、別の光導を手札から召喚：デッキが1枚オープンされる ===")
{
    const s = game("gemini-other", [AQUA])
    s.players.p1.field.spirits.push(createInstance(GEMINI, s.turn, 1))
    refreshLevelAsOverrides(s)
    handleAction(s, "p1", { type: "summon", handIndex: 0 })
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === AQUA), "アクア・エリシオンが場に出た")
    assert(s.players.p1.deck.length === 39, `デッキが1枚減った（実際 ${s.players.p1.deck.length}）`)
}

console.log("すべてのチェックに合格しました 🎉（part1055）")
