// smoke パート428（R5：トラッシュ→手札の器 toHand。ACTION_VOCABULARY「手札に加える」）
import { act, assert, createGame, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const NEXUS_A = "BS01-101" // 古龍の縄張り
const NEXUS_B = "BS05-065" // 青嵐の虚空
const MAGIC = "BS01-126" // シャドウエリクサー

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(NEXUS_A).type === "nexus" && getCard(NEXUS_A).name === "古龍の縄張り", "NEXUS_Aは古龍の縄張り")
    assert(getCard(NEXUS_B).type === "nexus" && getCard(NEXUS_B).name === "青嵐の虚空", "NEXUS_Bは青嵐の虚空")
    assert(getCard(MAGIC).type === "magic" && getCard(MAGIC).name === "シャドウエリクサー", "MAGICはシャドウエリクサー")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.hand = []
    s.players.p1.trashCards = [NEXUS_A, MAGIC, NEXUS_B]
    return s
}

console.log("=== 非対話：pick に合うカードを新しい方から count 枚 ===")
{
    const s = game("p428-auto")
    resolveAction(s, "p1", null, { type: "toHand", from: "trash", count: 1, pick: { cardType: "nexus" } })
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === NEXUS_B, "新しい方のネクサスが手札に来る")
    assert(s.players.p1.trashCards.join() === [NEXUS_A, MAGIC].join(), "残りはトラッシュに残る")
}

console.log("=== count all：合うものすべて ===")
{
    const s = game("p428-all")
    resolveAction(s, "p1", null, { type: "toHand", from: "trash", count: "all", pick: { cardType: "nexus" } })
    assert(s.players.p1.hand.length === 2 && s.players.p1.trashCards.join() === MAGIC, "ネクサス2枚とも手札に来て、マジックは残る")
}

console.log("=== 対話：候補が2枚以上なら使う人が選ぶ ===")
{
    const s = game("p428-choose", true)
    resolveAction(s, "p1", null, { type: "toHand", from: "trash", count: 1, pick: { cardType: "nexus" } })
    const pc = s.pendingChoice
    assert(pc !== null && pc !== undefined && pc.kind === "card" && pc.pid === "p1", "カードの選択で止まる")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "古龍の縄張りを選ぶ")
    assert(s.players.p1.hand.join() === NEXUS_A, "選んだカードが手札に来る")
    assert(s.players.p1.trashCards.join() === [MAGIC, NEXUS_B].join(), "選ばなかった方は残る")
}

console.log("=== 対象が無ければ何もしない ===")
{
    const s = game("p428-none")
    s.players.p1.trashCards = [MAGIC]
    resolveAction(s, "p1", null, { type: "toHand", from: "trash", count: 1, pick: { cardType: "nexus" } })
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCards.length === 1, "何も動かない")
}

console.log("すべてのチェックに合格しました 🎉（part428）")
