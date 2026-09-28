// smoke パート430（R5：トラッシュ→手札の器 toHand。ACTION_VOCABULARY「手札に加える」）
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const NEXUS_A = "BS01-101" // 古龍の縄張り
const NEXUS_B = "BS05-065" // 青嵐の虚空
const MAGIC = "BS01-126" // シャドウエリクサー
const VALIEL = "BS03-X11" // 大天使ヴァリエル
const GREEN_MAGIC = "BS01-132" // ストームドロー
const YELLOW_MAGIC = "BS02-104"
const YELLOW_SPIRIT = "BS02-061" // 天使エンジュ

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(NEXUS_A).type === "nexus" && getCard(NEXUS_A).name === "古龍の縄張り", "NEXUS_Aは古龍の縄張り")
    assert(getCard(NEXUS_B).type === "nexus" && getCard(NEXUS_B).name === "青嵐の虚空", "NEXUS_Bは青嵐の虚空")
    assert(getCard(MAGIC).type === "magic" && getCard(MAGIC).name === "シャドウエリクサー", "MAGICはシャドウエリクサー")
    assert(getCard(VALIEL).name === "大天使ヴァリエル", "VALIELは大天使ヴァリエル")
    assert(getCard(GREEN_MAGIC).type === "magic" && getCard(GREEN_MAGIC).colors.join() === "green", "GREEN_MAGICは緑のマジック")
    assert(getCard(YELLOW_MAGIC).type === "magic" && getCard(YELLOW_MAGIC).colors.join() === "yellow", "YELLOW_MAGICは黄のマジック")
    assert(getCard(YELLOW_SPIRIT).type === "spirit" && getCard(YELLOW_SPIRIT).colors.join() === "yellow", "YELLOW_SPIRITは黄のスピリット")
}

// ヴァリエルの召喚時効果（カードデータのまま）
function valielAction(): Parameters<typeof resolveAction>[3] {
    const e = getCard(VALIEL).effects.find((x) => x.kind === "triggered" && x.trigger === "onSummon") as { action: Parameters<typeof resolveAction>[3] }
    return e.action
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
    const s = game("p430-auto")
    resolveAction(s, "p1", null, { type: "toHand", from: "trash", count: 1, pick: { cardType: "nexus" } })
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === NEXUS_B, "新しい方のネクサスが手札に来る")
    assert(s.players.p1.trashCards.join() === [NEXUS_A, MAGIC].join(), "残りはトラッシュに残る")
}

console.log("=== count all：合うものすべて ===")
{
    const s = game("p430-all")
    resolveAction(s, "p1", null, { type: "toHand", from: "trash", count: "all", pick: { cardType: "nexus" } })
    assert(s.players.p1.hand.length === 2 && s.players.p1.trashCards.join() === MAGIC, "ネクサス2枚とも手札に来て、マジックは残る")
}

console.log("=== 対話：候補が2枚以上なら使う人が選ぶ ===")
{
    const s = game("p430-choose", true)
    resolveAction(s, "p1", null, { type: "toHand", from: "trash", count: 1, pick: { cardType: "nexus" } })
    const pc = s.pendingChoice
    assert(pc !== null && pc !== undefined && pc.kind === "card" && pc.pid === "p1", "カードの選択で止まる")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "古龍の縄張りを選ぶ")
    assert(s.players.p1.hand.join() === NEXUS_A, "選んだカードが手札に来る")
    assert(s.players.p1.trashCards.join() === [MAGIC, NEXUS_B].join(), "選ばなかった方は残る")
}

console.log("=== 対象が無ければ何もしない ===")
{
    const s = game("p430-none")
    s.players.p1.trashCards = [MAGIC]
    resolveAction(s, "p1", null, { type: "toHand", from: "trash", count: 1, pick: { cardType: "nexus" } })
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCards.length === 1, "何も動かない")
}

console.log("=== ヴァリエル：非対話は自分のトラッシュのマジックに多い色を指定する（相手の場の色ではない。09-28 ユーザー了承） ===")
{
    const s = game("p430-valiel-auto")
    s.players.p1.trashCards = [YELLOW_MAGIC, GREEN_MAGIC, GREEN_MAGIC, MAGIC]
    s.players.p2.field.spirits = [createInstance(YELLOW_SPIRIT, s.turn, 1), createInstance(YELLOW_SPIRIT, s.turn, 1)]
    resolveAction(s, "p1", null, valielAction())
    assert(s.players.p1.hand.filter((id) => id === GREEN_MAGIC).length === 2, "緑のマジック2枚が手札に来る")
    assert(s.players.p1.trashCards.includes(YELLOW_MAGIC) && s.players.p1.trashCards.includes(MAGIC), "黄・赤のマジックは残る")
}

console.log("=== ヴァリエル：対話では、トラッシュに無い色も指定できる（効果文どおり。09-28 ユーザー了承） ===")
{
    const s = game("p430-valiel-choose", true)
    s.players.p1.trashCards = [GREEN_MAGIC]
    resolveAction(s, "p1", null, valielAction())
    const pc = s.pendingChoice
    assert(pc !== null && pc !== undefined && pc.kind === "option" && (pc.options ?? []).length === 2, "緑・黄の2択で止まる")
    assert(act(s, "p1", { type: "resolveChoice", option: "黄" }) === null, "黄を指定する")
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCards.join() === GREEN_MAGIC, "黄のマジックが無いので何も戻らない")
}

console.log("すべてのチェックに合格しました 🎉（part430）")
