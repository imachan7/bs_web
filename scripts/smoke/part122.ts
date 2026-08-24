// smoke パート122（配置コストの支払い方法＝デッキ破棄）
//
// 新設した機構:
//   - kind:"nexusCostMillPay"（ネクサスの配置コストを「コスト1につきデッキ1枚破棄」で支払える）
//     ＋ shared/cost.canPayNexusCostByMill（サーバーとクライアントで同じ判定を使う）
//     ＋ RuleValidator.nexusMillPayAmount（validateSetNexus と doSetNexus が同じ枚数を出す唯一の入口）
//   **コア払いとの併用はできない**（2026-08-24 ユーザー確認）。配置の時点で「全額コア」か
//   「全額デッキ破棄」かを決める（GameAction.setNexus.millPay。0＝コア／実効コストと同値＝デッキ）。
//   millPay 省略時は「コアで足りるならコア、足りなければ全額デッキ破棄」を自動で選ぶ（AI・旧クライアント向け）。
//   置くコア（維持コア）はこの方法では払えない＝配置コストのみが対象。
// 実装したカード:
//   - BS04-088 栄光の表彰台 Lv1（自分のメインステップ、ネクサスの配置コストをデッキ破棄で支払える）
import { act, assert, createGame, createInstance, currentLevel, effectiveCost, getCard, runTurnStart, viewFor } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
// クライアントの支払いUIがサーバーと同じ選択肢を出すかを見る（ズレると「UIで選べるのに弾かれる」）
import { payingAltPay, setCardDb } from "../../public/src/renderer"
import { setCardLookup } from "../../shared/cardDb"
import { loadAllCards } from "../../data/loadCards"

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

// p1 のメインステップ。手札の先頭に配置したいネクサスを置く
function setup(id: string, handCardId: string, reserve: number) {
    const s = createGame(id, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.hand[0] = handCardId
    s.players.p1.reserve = reserve
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS04-088").name === "栄光の表彰台" && getCard("BS04-088").type === "nexus", "BS04-088 は栄光の表彰台（ネクサス）")
    assert(getCard("BS03-113").name === "力奪う凱旋門" && getCard("BS03-113").type === "nexus", "BS03-113 は力奪う凱旋門（ネクサス）")
    assert(getCard("BS03-113").levels[0]?.cores === 0, "力奪う凱旋門のLv1は0コア（置くコアなし）")
    assert(getCard("BS01-001").name === "ゴラドン", "BS01-001 はゴラドン")
}

console.log("=== BS04-088 栄光の表彰台 Lv1：コアが足りない分をデッキ破棄で払って配置できる ===")
{
    // 対照：表彰台なし → リザーブ0では配置できない
    const base = setup("t122-podium-base", "BS03-113", 0)
    assert(act(base, "p1", { type: "setNexus", handIndex: 0 }) !== null, "表彰台がなければコア不足で配置できない")

    const s = setup("t122-podium-1", "BS03-113", 0)
    const podium = putNexus(s, "p1", "BS04-088", 0) // Lv1
    assert(currentLevel(podium).level === 1, `栄光の表彰台は0コアでLv1（実際: ${String(currentLevel(podium).level)}）`)
    // 軽減シンボルが効くので、支払う額は素のコストではなく実効コスト
    const cost = effectiveCost(s, "p1", getCard("BS03-113"))
    assert(cost > 0, `実効コストが0より大きい（実際: ${String(cost)}）`)
    const deckBefore = s.players.p1.deck.length
    const trashBefore = s.players.p1.trashCards.length

    assert(act(s, "p1", { type: "setNexus", handIndex: 0 }) === null, "リザーブ0でもデッキ破棄で配置できる")
    assert(
        s.players.p1.deck.length === deckBefore - cost,
        `コスト${String(cost)}ぶんデッキが減る（実際: ${String(deckBefore - s.players.p1.deck.length)}枚）`,
    )
    assert(
        s.players.p1.trashCards.length === trashBefore + cost,
        `破棄したカードはトラッシュへ（実際: ${String(s.players.p1.trashCards.length - trashBefore)}枚）`,
    )
    assert(s.players.p1.reserve === 0, `コアは減らない（実際: ${String(s.players.p1.reserve)}個）`)
    assert(
        s.players.p1.field.nexuses.some((n) => n.cardId === "BS03-113"),
        "力奪う凱旋門が配置される",
    )
}

console.log("=== BS04-088 栄光の表彰台：コアとデッキ破棄は併用できない（足りなければ全額デッキ破棄） ===")
{
    const probe = setup("t122-podium-2-probe", "BS03-113", 0)
    putNexus(probe, "p1", "BS04-088", 0)
    const cost = effectiveCost(probe, "p1", getCard("BS03-113"))
    const s = setup("t122-podium-2", "BS03-113", cost - 1) // 1だけ足りない
    putNexus(s, "p1", "BS04-088", 0)
    const deckBefore = s.players.p1.deck.length

    assert(act(s, "p1", { type: "setNexus", handIndex: 0 }) === null, "配置できる")
    assert(
        s.players.p1.deck.length === deckBefore - cost,
        `不足分だけでなくコスト${String(cost)}の全額をデッキで払う（実際: ${String(deckBefore - s.players.p1.deck.length)}枚）`,
    )
    assert(s.players.p1.reserve === cost - 1, `コアは1個も使わない（実際: 残り${String(s.players.p1.reserve)}個）`)
}

console.log("=== BS04-088 栄光の表彰台：中間の枚数（一部だけデッキ破棄）は拒否される ===")
{
    const probe = setup("t122-podium-2b-probe", "BS03-113", 0)
    putNexus(probe, "p1", "BS04-088", 0)
    const cost = effectiveCost(probe, "p1", getCard("BS03-113"))
    assert(cost >= 2, `この検証には実効コスト2以上が要る（実際: ${String(cost)}）`)
    const s = setup("t122-podium-2b", "BS03-113", cost)
    putNexus(s, "p1", "BS04-088", 0)
    const deckBefore = s.players.p1.deck.length

    assert(
        act(s, "p1", { type: "setNexus", handIndex: 0, millPay: cost - 1 }) !== null,
        "コアとデッキ破棄を混ぜた支払いはできない",
    )
    assert(s.players.p1.deck.length === deckBefore, "弾かれるのでデッキは減らない")
    assert(s.players.p1.reserve === cost, "弾かれるのでコアも減らない")
}

console.log("=== BS04-088 栄光の表彰台：コアが足りていてもデッキ払いを選べる（millPay=実効コスト） ===")
{
    const probe = setup("t122-podium-2c-probe", "BS03-113", 0)
    putNexus(probe, "p1", "BS04-088", 0)
    const cost = effectiveCost(probe, "p1", getCard("BS03-113"))
    const s = setup("t122-podium-2c", "BS03-113", cost + 3)
    putNexus(s, "p1", "BS04-088", 0)
    const deckBefore = s.players.p1.deck.length

    assert(act(s, "p1", { type: "setNexus", handIndex: 0, millPay: cost }) === null, "デッキ払いを選んで配置できる")
    assert(
        s.players.p1.deck.length === deckBefore - cost,
        `コスト${String(cost)}ぶんデッキが減る（実際: ${String(deckBefore - s.players.p1.deck.length)}枚）`,
    )
    assert(s.players.p1.reserve === cost + 3, `コアは減らない（実際: ${String(s.players.p1.reserve)}個）`)
}

console.log("=== BS04-088 栄光の表彰台：millPay=0 ならコアで払う ===")
{
    const probe = setup("t122-podium-2d-probe", "BS03-113", 0)
    putNexus(probe, "p1", "BS04-088", 0)
    const cost = effectiveCost(probe, "p1", getCard("BS03-113"))
    const s = setup("t122-podium-2d", "BS03-113", cost)
    putNexus(s, "p1", "BS04-088", 0)
    const deckBefore = s.players.p1.deck.length

    assert(act(s, "p1", { type: "setNexus", handIndex: 0, millPay: 0 }) === null, "コア払いを選んで配置できる")
    assert(s.players.p1.deck.length === deckBefore, "デッキは減らない")
    assert(s.players.p1.reserve === 0, `コアで払う（実際: 残り${String(s.players.p1.reserve)}個）`)
}

console.log("=== BS04-088 栄光の表彰台：コアが足りていればデッキは減らない ===")
{
    const probe = setup("t122-podium-3-probe", "BS03-113", 0)
    putNexus(probe, "p1", "BS04-088", 0)
    const cost = effectiveCost(probe, "p1", getCard("BS03-113"))
    const s = setup("t122-podium-3", "BS03-113", cost + 5)
    putNexus(s, "p1", "BS04-088", 0)
    const deckBefore = s.players.p1.deck.length

    assert(act(s, "p1", { type: "setNexus", handIndex: 0 }) === null, "配置できる")
    assert(s.players.p1.deck.length === deckBefore, `デッキは減らない（実際: ${String(deckBefore - s.players.p1.deck.length)}枚）`)
    assert(s.players.p1.reserve === 5, `コアで支払う（実際: 残り${String(s.players.p1.reserve)}個）`)
}

console.log("=== BS04-088 栄光の表彰台：置くコアはデッキ破棄で払えない（Lv2配置） ===")
{
    const probe = setup("t122-podium-7-probe", "BS03-113", 0)
    putNexus(probe, "p1", "BS04-088", 0)
    const cost = effectiveCost(probe, "p1", getCard("BS03-113"))
    const maintain = getCard("BS03-113").levels[1]?.cores ?? 0
    assert(maintain > 0, `力奪う凱旋門のLv2には置くコアが要る（実際: ${String(maintain)}個）`)

    // 配置コストをデッキで払っても、置くコアぶんのリザーブが無ければLv2では配置できない
    const s = setup("t122-podium-7", "BS03-113", 0)
    putNexus(s, "p1", "BS04-088", 0)
    assert(act(s, "p1", { type: "setNexus", handIndex: 0, level: 2, millPay: cost }) !== null, "置くコアはデッキ破棄では払えない")

    // 置くコアぶんだけリザーブがあれば配置できる（コストはデッキ、置くコアはコア）
    const ok = setup("t122-podium-7b", "BS03-113", maintain)
    putNexus(ok, "p1", "BS04-088", 0)
    const deckBefore = ok.players.p1.deck.length
    assert(act(ok, "p1", { type: "setNexus", handIndex: 0, level: 2, millPay: cost }) === null, "置くコアぶんのコアがあれば配置できる")
    assert(ok.players.p1.reserve === 0, `置くコアはリザーブから出る（実際: 残り${String(ok.players.p1.reserve)}個）`)
    assert(
        ok.players.p1.deck.length === deckBefore - cost,
        `配置コストぶんだけデッキが減る（実際: ${String(deckBefore - ok.players.p1.deck.length)}枚）`,
    )
}

console.log("=== BS04-088 栄光の表彰台：スピリットの召喚コストには使えない ===")
{
    const s = setup("t122-podium-4", "BS01-001", 0) // ゴラドン（スピリット）
    putNexus(s, "p1", "BS04-088", 0)
    assert(
        act(s, "p1", { type: "summon", handIndex: 0 }) !== null,
        "スピリットの召喚はデッキ破棄で払えない（『ネクサスの配置に支払うコスト』限定）",
    )
}

console.log("=== BS04-088 栄光の表彰台：デッキが足りなければ配置できない ===")
{
    const s = setup("t122-podium-5", "BS03-113", 0)
    putNexus(s, "p1", "BS04-088", 0)
    s.players.p1.deck = ["BS01-001"] // 1枚しかない（コストに足りない）
    assert(act(s, "p1", { type: "setNexus", handIndex: 0 }) !== null, "デッキが足りなければ配置できない")
    assert(s.players.p1.deck.length === 1, "検証で弾かれるのでデッキは減らない")
}

console.log("=== BS04-088 栄光の表彰台 Lv2：配置のたびにボイドからコア1個（既存e2の回帰確認） ===")
{
    const probe = setup("t122-podium-6-probe", "BS03-113", 0)
    putNexus(probe, "p1", "BS04-088", 3)
    const cost = effectiveCost(probe, "p1", getCard("BS03-113"))
    const s = setup("t122-podium-6", "BS03-113", cost)
    putNexus(s, "p1", "BS04-088", 3) // Lv2
    assert(act(s, "p1", { type: "setNexus", handIndex: 0 }) === null, "配置できる")
    assert(s.players.p1.reserve === 1, `配置後にボイドからコア1個がリザーブへ（実際: ${String(s.players.p1.reserve)}個）`)
}

console.log("=== BS04-088 栄光の表彰台：クライアントの支払いUIもサーバーと同じ二択になる ===")
{
    const probe = setup("t122-podium-8-probe", "BS03-113", 0)
    putNexus(probe, "p1", "BS04-088", 0)
    const cost = effectiveCost(probe, "p1", getCard("BS03-113"))

    const s = setup("t122-podium-8", "BS03-113", cost)
    putNexus(s, "p1", "BS04-088", 0)
    // クライアントのカード辞書を入れる（共有ルール層の参照先が master へ差し替わるので、この節の最後に戻す）
    setCardDb(loadAllCards())
    const paying = { handIndex: 0, assigned: {}, discardHandIndices: [], millPay: 0 }
    const alt = payingAltPay(viewFor(s, "p1"), paying)
    assert(alt.kind === "mill", `デッキ破棄が選択肢に出る（実際: ${String(alt.kind)}）`)
    assert(alt.max === cost, `選べるのは全額（${String(cost)}枚）だけ（実際: ${String(alt.max)}）`)

    // デッキが実効コストに足りなければ全額払えない＝選択肢ごと出さない（サーバーも弾く）
    const few = setup("t122-podium-8b", "BS03-113", cost)
    putNexus(few, "p1", "BS04-088", 0)
    few.players.p1.deck = few.players.p1.deck.slice(0, cost - 1)
    const altFew = payingAltPay(viewFor(few, "p1"), paying)
    assert(altFew.kind === null, `デッキが足りなければ選択肢に出ない（実際: ${String(altFew.kind)}）`)
    setCardLookup(getCard) // 共有ルール層の参照先をサーバー側へ戻す（以降のパートに影響させない）
    assert(
        act(few, "p1", { type: "setNexus", handIndex: 0, millPay: cost }) !== null,
        "サーバーも全額デッキ払いを弾く（デッキ不足）",
    )
}
