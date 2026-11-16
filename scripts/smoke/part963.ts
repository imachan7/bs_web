// smoke パート963（BS13-077 ブリーズライド／BS19-088 獣の氷窟／BS01-106 隠されたる賢者の樹：
// トラッシュのカードの『自分のエンドステップ』の手札戻しを、エンドステップの誘発と同じ列で解決する。
// 確かめること：手札増加の誘発（氷窟）が反応する／選択待ちが挟まってもターンが正しく進む／maxCount／解決順の選択に入る）
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const RETURN = "BS13-077" // ブリーズライド（緑・魔法・コスト2）：トラッシュにあるとき、自分のエンドステップに手札へ戻る（maxCount 1）
const ICE = "BS19-088" // 獣の氷窟（白・ネクサス）：Lv2。相手の効果で手札が増えたとき、任意で1枚ドロー
const ORDER = "BS01-106" // 隠されたる賢者の樹（緑・ネクサス）：Lv2。自分のエンドステップの誘発を持つ（解決順の相手）
const ARES = "BS10-008" // 火星神龍アレス・ドラグーン（赤・スピリット）：【合体時】Lv2。自分のターン終了時にアタックステップとエンドステップを1回ずつ行う
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）：デッキの中身を固定する

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(RETURN).name === "ブリーズライド" && getCard(RETURN).type === "magic", "RETURNはブリーズライド（魔法）")
    assert(getCard(ICE).name === "獣の氷窟" && getCard(ICE).type === "nexus", "ICEは獣の氷窟（ネクサス）")
    assert(getCard(ORDER).name === "隠されたる賢者の樹" && getCard(ORDER).type === "nexus", "ORDERは隠されたる賢者の樹（ネクサス）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
}

// p1 のターン（turn 3 相当）。両者のデッキは固定（ドロー数を数えるため）
function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "white" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): void {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    assert(currentLevel(inst).level === 2, `${getCard(cardId).name}はLv2（コア${cores}）`)
}

// 氷窟（p2）を置いて p1 がターンを終える。戻り値は p2 のデッキ減少数
function runEnd(s: GameState): number {
    putNexus(s, "p2", ICE, 3)
    const before = s.players.p2.deck.length
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1のターン終了が通る")
    return before - s.players.p2.deck.length
}

console.log("=== A: 非対話。トラッシュのブリーズライドが戻り、相手の氷窟が1枚多くドローする ===")
{
    const ctrl = game("part963-A-ctrl")
    const ctrlDraw = runEnd(ctrl)
    assert(ctrlDraw === 1, `対照（トラッシュに戻すカードなし）は p2 の通常ドロー1枚だけ（${ctrlDraw}枚）`)

    const s = game("part963-A")
    s.players.p1.trashCards.push(RETURN)
    const draw = runEnd(s)
    assert(s.players.p1.hand.includes(RETURN), "ブリーズライドが p1 の手札に戻る")
    assert(!s.players.p1.trashCards.includes(RETURN), "トラッシュからは消えている")
    assert(draw === 2, `p2 は通常ドロー1枚＋氷窟の1枚＝2枚減る（${draw}枚）`)
    assert(s.turnPlayer === "p2", "ターンは p2 に移る")
}

console.log("=== B: 対話。氷窟の確認に答えるまで待ち、答えるとターンが進み、デッキ横のコアは1つだけ減る ===")
{
    const s = game("part963-B", true)
    s.players.p1.trashCards.push(RETURN)
    s.players.p1.deckSideCores = 2
    runEnd(s)
    const pc = s.pendingChoice
    assert(pc !== null && pc.pid === "p2", "氷窟の任意ドローの確認が p2 に出る")
    assert(s.turnPlayer === "p1", "確認の間はまだターンが進まない")
    assert(act(s, "p2", { type: "resolveChoice", option: pc!.options![0]! }) === null, "p2 が確認に答える")
    assert(!s.pendingChoice, "選択待ちが残らない")
    assert(s.turnPlayer === "p2", "答えた後にターンが p2 へ進む")
    assert(s.players.p1.deckSideCores === 1, `デッキ横のコアは2回減らず1つ減る（${s.players.p1.deckSideCores}）`)
    assert(s.players.p1.hand.includes(RETURN), "ブリーズライドは手札に戻っている")
}

console.log("=== C: maxCount。トラッシュに2枚あっても戻るのは1枚 ===")
{
    const s = game("part963-C")
    s.players.p1.trashCards.push(RETURN, RETURN)
    runEnd(s)
    assert(s.players.p1.hand.filter((id) => id === RETURN).length === 1, "手札に戻るのは1枚")
    assert(s.players.p1.trashCards.filter((id) => id === RETURN).length === 1, "残りの1枚はトラッシュに残る")
}

console.log("=== D: 対話。エンドステップの別の誘発と並ぶと、解決順をターンプレイヤー（p1）が選ぶ ===")
{
    const s = game("part963-D", true)
    s.players.p1.trashCards.push(RETURN)
    putNexus(s, "p1", ORDER, 3)
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1のターン終了が通る")
    const pc = s.pendingChoice
    assert(pc !== null && pc.pid === "p1", "解決順の選択が p1 に出る")
    const opts = pc!.options ?? []
    const idx = opts.findIndex((o) => o.includes("ブリーズライド"))
    assert(idx !== -1 && opts.some((o) => o.includes("隠されたる賢者の樹")), `両方の候補が並ぶ（${opts.join(" / ")}）`)
    assert(act(s, "p1", { type: "resolveChoice", option: opts[idx]! }) === null, "ブリーズライドを先に選ぶ")
    assert(s.players.p1.hand.includes(RETURN), "選んだブリーズライドが手札に戻る")
    assert(!s.players.p1.trashCards.includes(RETURN), "トラッシュからは消えている")
}

console.log("=== E: 追加のアタックステップとエンドステップで、エンドステップは1ターンに2回ある。各エンドステップで1枚ずつ戻る ===")
{
    const s = game("part963-E")
    assert(getCard(ARES).name === "火星神龍アレス・ドラグーン", "ARESは火星神龍アレス・ドラグーン（効果の発生源）")
    s.players.p1.trashCards.push(RETURN, RETURN)
    const handBefore = s.players.p1.hand.filter((id) => id === RETURN).length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    // アレスの「もう1回ずつ行う」が発揮された状況を直接立てる（発揮の経路そのものは別パートで確かめている）
    s.extraAttackStepPending = true
    assert(act(s, "p1", { type: "endTurn" }) === null, "1回目のターン終了が通る")
    assert(s.turnPlayer === "p1" && s.phase === "attack", "追加のアタックステップへ戻る（ターンは p1 のまま）")
    const handAfter1 = s.players.p1.hand.filter((id) => id === RETURN).length
    assert(handAfter1 - handBefore === 1, `1回目のエンドステップで手札に1枚戻る（${handAfter1 - handBefore}枚）`)
    assert(s.players.p1.trashCards.filter((id) => id === RETURN).length === 1, "1回目の後、トラッシュに1枚残る")

    assert(act(s, "p1", { type: "endTurn" }) === null, "2回目のターン終了が通る")
    assert(s.turnPlayer === "p2", "2回目のエンドステップの後にターンが p2 へ移る")
    const handAfter2 = s.players.p1.hand.filter((id) => id === RETURN).length
    assert(handAfter2 - handBefore === 2, `2回目のエンドステップでもう1枚戻り、手札は計2枚増える（${handAfter2 - handBefore}枚）`)
    assert(s.players.p1.trashCards.filter((id) => id === RETURN).length === 0, "2回目の後、トラッシュは0枚")
}

console.log("すべてのチェックに合格しました 🎉（part963）")
