// smoke パート487（「破壊したスピリットのコスト」は場にいたときのコスト＝増減込み。2026-10-08 ユーザー確認）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { instBaseCost } from "../../shared/rules"

const ALEXANDER = "BS07-X28" // 巨人大帝アレクサンダー（Lv2：コスト4以下を破壊し、そのコストと同じ枚数破棄）
const HYDRAM = "BS02-023" // 双蛇ヒュドラム（コスト6・バニラ）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ALEXANDER).name === "巨人大帝アレクサンダー", "ALEXANDERは巨人大帝アレクサンダー")
    assert(getCard(HYDRAM).name === "双蛇ヒュドラム" && getCard(HYDRAM).cost === 6, "HYDRAMはコスト6の双蛇ヒュドラム")
}

function game(): GameState {
    const s = createGame("lastcost", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

console.log("=== 1. コスト-2されたコスト6を破壊したら、4枚破棄する ===")
{
    const s = game()
    const self = createInstance(ALEXANDER, s.turn, 5)
    s.players.p1.field.spirits.push(self)
    const victim = createInstance(HYDRAM, s.turn, 1)
    s.players.p2.field.spirits.push(victim)
    refreshLevelAsOverrides(s)
    // 「このターンの間、コスト-2」を相手のヒュドラムに置く（置く側の器ではなく、置かれた状態を直接作る）
    s.timedEffects = [{ content: [{ type: "cost", amount: -2 }], target: { kind: "instance", instanceId: victim.instanceId }, until: "turn", ownerPid: "p1" }] as never
    refreshLevelAsOverrides(s)
    assert(instBaseCost(victim) === 4, "前提：ヒュドラムのコストは4")
    const deckBefore = s.players.p2.deck.length
    const e = getCard(ALEXANDER).effects.find((x) => x.id === "BS07-X28-e3") as unknown as { action: never }
    resolveAction(s, "p1", self, e.action)
    assert(s.players.p2.trashCards.includes(HYDRAM), "コスト4として扱われるヒュドラムを破壊した")
    assert(s.players.p2.deck.length === deckBefore - 4, `デッキを4枚破棄する（実際 ${deckBefore - s.players.p2.deck.length}枚）`)
}

console.log("すべてのチェックに合格しました 🎉（part487）")
