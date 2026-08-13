// smoke パート174（BS07-058 常闇の聖堂Lv2：「ドローしないことで」トラッシュの夜族を手札に戻す）
//
// card-notes の突き合わせ（2026-08-11）で見つかったズレ。
// 効果文は「**ドローしないことで**、自分のトラッシュにある系統：「夜族」を持つスピリットカード1枚を
// 選んで手札に戻すことができる」なのに、ドローの支払いが無く「引いたうえで戻せる」状態だった
// （毎ターン1枚ぶん得をする＝印刷より強い）。
//
// ドローステップを2区間に割り、ドローより前に発火する効果（step.beforeDraw）で
// GameState.drawStepSkipped を立てて、次の区間が引かずに進むようにした。
// 区間を分けているのは、発動確認（optional）で中断したときの再開が「次の区間から」になるため
// （turnStartResumeStep の仕組み。中断してもドロー本体が残っている）。
import { assert, createGame, createInstance, engineRunTurnStart, act } from "./helpers"
import type { GameState } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    family?: string[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const YOZOKU = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes("夜族"))!
const OTHER = CARDS.find((c) => c.type === "spirit" && !(c.family ?? []).includes("夜族"))!

// p1 のターン開始処理を素の engineRunTurnStart で回す
// （smoke ヘルパーの runTurnStart は「初回のドローを打ち消す」後始末を入れるため、
//   ドローの有無そのものを見るこのテストでは使えない）
function setup(seed: string, trash: string[], interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = interactive
    s.players.p1.field.nexuses.push(createInstance("BS07-058", s.turn, 2))
    s.players.p1.trashCards = [...trash]
    return s
}

console.log("=== 発動すると、ドローの代わりに夜族1枚が手札に戻る ===")
{
    const s = setup("tokoyami-pay", [YOZOKU.cardId], false)
    const handBefore = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    engineRunTurnStart(s)
    assert(s.drawStepSkipped === true, "ドローを支払ったことが記録される")
    assert(s.players.p1.deck.length === deckBefore, "デッキが減っていない（ドローしていない）")
    assert(s.players.p1.hand.length === handBefore + 1, "手札は戻した1枚だけ増える")
    assert(s.players.p1.hand.includes(YOZOKU.cardId), "戻ったのは夜族のカード")
    assert(s.players.p1.trashCards.length === 0, "トラッシュから出ている")
}

console.log("=== トラッシュに夜族がいなければ、通常どおりドローする ===")
{
    const s = setup("tokoyami-nopay", [OTHER.cardId], false)
    const handBefore = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    engineRunTurnStart(s)
    assert(s.drawStepSkipped === false, "支払いは発生しない")
    assert(s.players.p1.deck.length === deckBefore - 1, "デッキが1枚減る（ドローした）")
    assert(s.players.p1.hand.length === handBefore + 1, "手札が1枚増える（引いたぶん）")
    assert(s.players.p1.trashCards.length === 1, "トラッシュはそのまま")
}

console.log("=== 実対戦：発動確認で中断しても、そのあとドロー本体が続く ===")
{
    const s = setup("tokoyami-confirm-yes", [YOZOKU.cardId], true)
    const deckBefore = s.players.p1.deck.length
    engineRunTurnStart(s)
    assert(s.pendingChoice?.confirm === true, "発動確認で中断する")
    assert(s.phase === "draw", "中断したのはドローステップ")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動する")
    assert(s.phase === "main", "再開してメインステップまで進む")
    assert(s.players.p1.deck.length === deckBefore, "発動したのでドローしない")
    assert(s.players.p1.hand.includes(YOZOKU.cardId), "夜族が手札に戻っている")
}

console.log("=== 実対戦：発動しないことを選ぶと、通常どおりドローする ===")
{
    const s = setup("tokoyami-confirm-no", [YOZOKU.cardId], true)
    const deckBefore = s.players.p1.deck.length
    engineRunTurnStart(s)
    assert(s.pendingChoice?.confirm === true, "発動確認で中断する")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "発動しない（スキップ）")
    assert(s.phase === "main", "再開してメインステップまで進む")
    assert(s.players.p1.deck.length === deckBefore - 1, "ドローしている")
    assert(s.players.p1.trashCards.length === 1, "トラッシュに夜族が残る")
}

console.log("=== ドローの後に発火する効果は、従来どおり引いた後に動く ===")
{
    // 百識の谷Lv1：ドロー1枚＋手札1枚破棄。引いたカードを破棄の対象にできる順序を保つ
    const s = createGame("hyakushiki-order", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.players.p1.field.nexuses.push(createInstance("BS01-099", s.turn, 1))
    const handBefore = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    engineRunTurnStart(s)
    assert(s.players.p1.deck.length === deckBefore - 2, "通常ドロー1枚＋効果のドロー1枚")
    assert(s.players.p1.hand.length === handBefore + 1, "2枚引いて1枚破棄した結果、手札は+1")
    assert(s.drawStepSkipped === false, "ドローの支払いとは無関係")
}
