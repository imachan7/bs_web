// smoke パート356（pay：「〜することで〜する」の汎用の器＋discardSelfChooseのcardType/keyword絞り込み。COST_MODEL §1）
import { assert, createGame, createInstance, getCard, resolveAction, act } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VANILLA = "BS01-002" // ロクケラトプス（赤・スピリット・コスト1）
const ARMOR = "BS02-040" // ロブスターク（白・スピリット・コスト3・【装甲】）
const NEXUS = "BS01-098" // 燃えさかる戦場（赤・ネクサス・コスト3）
const MAGIC_BURST = "BS14-091" // 双光気弾（赤・マジック・コスト3・バースト持ち）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).type === "spirit", "VANILLAはスピリット")
    assert(getCard(ARMOR).name === "ロブスターク" && getCard(ARMOR).effects.some((e) => e.kind === "keyword" && e.keyword === "armor"), "ARMORは【装甲】持ち")
    assert(getCard(NEXUS).name === "燃えさかる戦場" && getCard(NEXUS).type === "nexus", "NEXUSはネクサス")
    assert(getCard(MAGIC_BURST).type === "magic" && getCard(MAGIC_BURST).effects.some((e) => e.kind === "burst"), "MAGIC_BURSTはバースト持ちのマジック")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== 1. 5種の旧typeと同じ結果になる（非対話） ===")
{
    // 1a. costDiscardHandThenDraw相当：手札discardCount枚を破棄→drawCount枚ドロー
    const s = game("case1a")
    s.players.p1.hand = [VANILLA, VANILLA, VANILLA]
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "pay", cost: { type: "discardSelfChoose", count: 2 }, then: { type: "draw", count: 3 } })
    assert(s.players.p1.hand.length === 4, "手札2枚を破棄し3枚ドロー（3-2+3=4）")
    assert(s.players.p1.deck.length === deckBefore - 3, "デッキから3枚引かれた")
    assert(s.players.p1.trashCards.length === 2, "破棄した2枚がトラッシュにある")
}
{
    // 1b. costDiscardHandThenDiscardOpponentMagic相当：手札1枚を破棄→相手のマジック1枚を破棄
    const s = game("case1b")
    s.players.p1.hand = [VANILLA]
    s.players.p2.hand = [MAGIC_BURST, VANILLA]
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "discardSelfChoose", count: 1 },
        then: { type: "discardOpponent", count: 1, cardTypeFilter: "magic" },
    })
    assert(s.players.p1.hand.length === 0, "自分の手札1枚を破棄した")
    assert(!s.players.p2.hand.includes(MAGIC_BURST), "相手のマジックが破棄された")
}
{
    // 1c. costSetBurstThenDraw相当：バースト持ち1枚をセット→ドロー
    const s = game("case1c")
    s.players.p1.hand = [MAGIC_BURST]
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "pay", cost: { type: "setBurstFromHand" }, then: { type: "draw", count: 1 } })
    assert(s.players.p1.hand.length === 1, "セットした1枚が引いた1枚に入れ替わった")
    assert(s.players.p1.deck.length === deckBefore - 1, "1枚ドローした")
}
{
    // 1d. selfBuffByHandDiscard相当：手札の指定種別1枚を破棄→自身BP+
    const s = game("case1d")
    const me = put(s, "p1", ARMOR, 1)
    s.players.p1.hand = [NEXUS, VANILLA]
    resolveAction(s, "p1", me, { type: "pay", cost: { type: "discardSelfChoose", count: 1, cardType: "nexus" }, then: { type: "selfBuff", amount: 2000 } })
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === VANILLA, "ネクサスだけが破棄された")
    assert(me.tempBpBuff === 2000, "自身がBP+2000された")
}
{
    // 1e. costDiscardHandKeywordThenDraw相当：指定キーワード持ちの手札1枚を破棄→ドロー
    const s = game("case1e")
    s.players.p1.hand = [ARMOR, VANILLA]
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "pay", cost: { type: "discardSelfChoose", count: 1, keyword: "armor" }, then: { type: "draw", count: 2 } })
    assert(s.players.p1.hand.length === 3 && !s.players.p1.hand.includes(ARMOR), "【装甲】持ちだけが破棄され、2枚ドローした（1-1+2=2、元のVANILLA込みで3）")
}

console.log("=== 2. costが数どおりそろわないと何も動かない ===")
{
    const s = game("case2")
    s.players.p1.hand = [VANILLA]
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "pay", cost: { type: "discardSelfChoose", count: 2 }, then: { type: "draw", count: 3 } })
    assert(s.players.p1.hand.length === 1, "手札が2枚に満たないため破棄しなかった")
    assert(s.players.p1.deck.length === deckBefore, "コストを払えないのでドローもしない")
    assert(s.players.p1.trashCards.length === 0, "トラッシュも増えない")
}

console.log("=== 3. thenが数どおりそろわないとcostも払わない ===")
{
    const s = game("case3")
    s.players.p1.hand = [VANILLA, VANILLA, VANILLA]
    s.players.p1.deck = [VANILLA] // 1枚しかない
    resolveAction(s, "p1", null, { type: "pay", cost: { type: "discardSelfChoose", count: 2 }, then: { type: "draw", count: 2 } })
    assert(s.players.p1.hand.length === 3, "デッキが足りないので手札は減らない（コストも払わない）")
    assert(s.players.p1.deck.length === 1, "デッキも減らない")
}

console.log("=== 4. discardSelfChooseのcardType／keyword絞り込み ===")
{
    const s = game("case4a")
    s.players.p1.hand = [NEXUS, VANILLA]
    resolveAction(s, "p1", null, { type: "discardSelfChoose", count: 1, cardType: "nexus" })
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === VANILLA, "cardType指定でネクサスだけが破棄された")
}
{
    const s = game("case4b")
    s.players.p1.hand = [ARMOR, VANILLA]
    resolveAction(s, "p1", null, { type: "discardSelfChoose", count: 1, keyword: "armor" })
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === VANILLA, "keyword指定で【装甲】持ちだけが破棄された")
}
{
    // 該当なし：条件に合う手札が無ければ何もしない
    const s = game("case4c")
    s.players.p1.hand = [VANILLA, VANILLA]
    resolveAction(s, "p1", null, { type: "discardSelfChoose", count: 1, cardType: "nexus" })
    assert(s.players.p1.hand.length === 2, "対象が無いので破棄されない")
}

console.log("=== 5. 対話モード：costの選択で中断し、選んだあとthenまで進む ===")
{
    const s = game("case5", true)
    s.players.p1.hand = [VANILLA, VANILLA]
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "pay", cost: { type: "discardSelfChoose", count: 1 }, then: { type: "draw", count: 1 } })
    assert(s.pendingChoice !== null, "cost側の選択で止まっている")
    assert(s.pendingChoice?.kind === "card", "手札選択の中断")
    const idx = s.pendingChoice?.cardIndices?.[0]
    assert(idx !== undefined, "候補が出ている")
    if (idx !== undefined) {
        assert(act(s, "p1", { type: "resolveChoice", cardIndex: idx }) === null, "1枚選ぶ")
    }
    assert(s.pendingChoice === null, "選択後は中断が解けてthenまで進んでいる")
    assert(s.players.p1.hand.length === 2, "破棄1枚・ドロー1枚で手札枚数は変わらない（2-1+1=2）")
    assert(s.players.p1.deck.length === deckBefore - 1, "thenのドローが実行された")
    assert(s.players.p1.trashCards.length === 1, "costの破棄が実行された")
}

console.log("=== 5b. 対話モード：2枚破棄のcostは2枚目の選択を挟んでからthenへ進む ===")
{
    const s = game("case5b", true)
    s.players.p1.hand = [VANILLA, VANILLA, VANILLA]
    resolveAction(s, "p1", null, { type: "pay", cost: { type: "discardSelfChoose", count: 2 }, then: { type: "draw", count: 3 } })
    act(s, "p1", { type: "resolveChoice", cardIndex: s.pendingChoice?.cardIndices?.[0] ?? 0 })
    assert(s.pendingChoice?.kind === "card", "2枚目の選択で止まっている")
    assert(s.players.p1.deck.length === 40, "2枚目を選ぶ前にはドローしていない")
    act(s, "p1", { type: "resolveChoice", cardIndex: s.pendingChoice?.cardIndices?.[0] ?? 0 })
    assert(s.pendingChoice === null, "2枚目を選ぶと中断が解ける")
    assert(s.players.p1.trashCards.length === 2 && s.players.p1.deck.length === 37 && s.players.p1.hand.length === 4, "破棄2枚のあとドロー3枚")
}

console.log("=== 6. 判定表に無いtypeを書いたら何も動かない ===")
{
    const s = game("case6")
    s.players.p1.hand = [VANILLA, VANILLA]
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "pay", cost: { type: "sequence", actions: [] }, then: { type: "draw", count: 1 } })
    assert(s.players.p1.hand.length === 2, "判定表に無いcost typeなので何もしない")
    assert(s.players.p1.deck.length === deckBefore, "ドローも起きない")
}

console.log("すべてのチェックに合格しました 🎉（part356）")
