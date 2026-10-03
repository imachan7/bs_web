// smoke パート476（【相手の『召喚時』発揮後】：召喚時効果が誘発したら、払えない・断った・対象がいないときもバーストの条件を満たす。2026-10-03 ユーザー決定。BURST.md §10 C）
import { act, assert, createGame, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const PAY = "BS10-019" // 土星神龍クロノ・ボロス（手札2枚を破棄することで3枚ドロー）
const NO_TARGET = "BS06-071" // 重槍のモーガン（召喚時：コスト4のスピリットすべてを破壊）
const VANILLA = "BS01-002" // ロクケラトプス
const BURST = "BS14-094" // 天翔龍神覇（【相手の『召喚時』発揮後】）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(PAY).name === "土星神龍クロノ・ボロス" && getCard(PAY).effect.includes("破棄することで"), "PAYはクロノ・ボロス")
    assert(getCard(NO_TARGET).name === "重槍のモーガン" && getCard(NO_TARGET).effect.includes("召喚時"), "NO_TARGETは重槍のモーガン")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effect === "", "VANILLAは効果なし")
    assert(getCard(BURST).name === "天翔龍神覇" && getCard(BURST).effect.includes("召喚時』発揮後"), "BURSTは天翔龍神覇")
}

function setup(seed: string, interactive: boolean, hand: string[]): { s: GameState; me: PlayerId; opp: PlayerId } {
    const s = createGame(seed, { p1: "A", p2: "B" }, { p1: "red", p2: "white" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    const me = s.turnPlayer
    const opp: PlayerId = me === "p1" ? "p2" : "p1"
    assert(s.phase === "main", "メインステップから始まる")
    s.players[opp].field.spirits = []
    s.players[me].field.spirits = []
    s.players[opp].burst = BURST
    s.players[opp].burstSet = true
    s.players[me].reserve = 20
    s.players[me].hand = hand
    act(s, me, { type: "summon", handIndex: 0 })
    return { s, me, opp }
}
const burstOffered = (s: GameState, opp: PlayerId) => s.pendingChoice?.burstActivate?.pid === opp || s.players[opp].burst !== BURST

console.log("=== 「ことで」：払えない（対話）→ 確認は出ないが、バーストの条件は満たす ===")
{
    const { s, opp } = setup("p476-a", true, [PAY])
    assert(burstOffered(s, opp), "相手にバーストの発動確認が出る")
}

console.log("=== 「ことで」：払えるが断る（対話）→ バーストの条件は満たす ===")
{
    const { s, me, opp } = setup("p476-b", true, [PAY, VANILLA, VANILLA, VANILLA])
    assert(s.pendingChoice?.pid === me && s.pendingChoice.confirm === true, "持ち主に発動の確認が出る")
    act(s, me, { type: "resolveChoice" })
    assert(s.players[me].hand.length === 3, "断ったので手札は減らない")
    assert(burstOffered(s, opp), "相手にバーストの発動確認が出る")
}

console.log("=== 「ことで」：払えない（非対話）→ バーストの条件は満たす ===")
{
    const { s, opp } = setup("p476-c", false, [PAY])
    assert(burstOffered(s, opp), "バーストが発動する")
}

console.log("=== 対象がいない → バーストの条件は満たす ===")
{
    const { s, opp } = setup("p476-d", true, [NO_TARGET])
    assert(burstOffered(s, opp), "相手にバーストの発動確認が出る")
}

console.log("=== 召喚時効果を持たないスピリット → 満たさない ===")
{
    const { s, opp } = setup("p476-e", true, [VANILLA])
    assert(!burstOffered(s, opp), "バーストは出ない")
}

console.log("すべてのチェックに合格しました 🎉（part476）")
