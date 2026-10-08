// smoke パート491（【転召】はコアを取り除けないスピリットを対象にできない。SOULCORE.md §2・2026-10-06 ユーザー確認）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { validateSummon } from "../../server/src/logic/RuleValidator"
import { tenshoCandidates } from "../../server/src/logic/keywords/tensho"

const GAI = "BS10-X01" // 幻羅星龍ガイ・アスラ（コスト10・お互いコアを取り除けない）
const CLER = "BS04-010" // 雷帝エール・クレル（【転召：コスト5以上/トラッシュ】）
const HIGH = "BS02-023" // 双蛇ヒュドラム（コスト6・バニラ）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(GAI).name === "幻羅星龍ガイ・アスラ" && getCard(GAI).cost === 10, "GAIはコスト10のガイ・アスラ")
    assert(getCard(CLER).name === "雷帝エール・クレル", "CLERは雷帝エール・クレル")
    assert(getCard(HIGH).name === "双蛇ヒュドラム" && getCard(HIGH).cost === 6, "HIGHはコスト6のヒュドラム")
}

function game(): GameState {
    const s = createGame("tensho-lock", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p1.hand = [CLER]
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

console.log("=== 1. ガイ・アスラしかいなければ【転召】のカードは召喚できない ===")
{
    const s = game()
    s.players.p1.field.spirits.push(createInstance(GAI, s.turn, 1))
    refreshLevelAsOverrides(s)
    assert(tenshoCandidates(s, "p1", 5).length === 0, "ガイ・アスラは【転召】の候補にならない")
    const err = validateSummon(s, "p1", 0)
    assert(err !== null && err.includes("コアを取り除けない"), `召喚できず、理由が出る（${err}）`)
}

console.log("=== 2. ほかに候補がいれば召喚でき、候補はそちらだけ ===")
{
    const s = game()
    s.players.p1.field.spirits.push(createInstance(GAI, s.turn, 1))
    const high = createInstance(HIGH, s.turn, 1)
    s.players.p1.field.spirits.push(high)
    refreshLevelAsOverrides(s)
    const c = tenshoCandidates(s, "p1", 5)
    assert(c.length === 1 && c[0] === high, "候補はヒュドラムだけ")
}

console.log("すべてのチェックに合格しました 🎉（part491）")
