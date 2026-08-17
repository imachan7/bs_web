// smoke パート217（同時発揮の解決順をターンプレイヤーが決める。2026-08-17 ユーザー確認）
//
// docs/design/TIMING_CHART.md §0-3
//   「A と B のそれぞれの中で複数が同時に発揮する場合は、ターンプレイヤーが解決順を決める」
//
// これを守っていたのは破壊処理（PendingChoice.destroyOrder）だけで、**誘発は場に出た順で固定**だった
// （docs/design/PROCEDURES_AUDIT.md §3 の棚卸しで発見）。
//
// ⚠️ 聞くのは「**別のカード**の効果が同時に発揮するとき」だけ。次の2つは聞かない:
//   - 同じカードの複数エントリ（「ドロー後、〜する」のようにテキストで順序が決まっている）
//   - 同名カードを2枚以上並べた場合（順序を入れ替えても結果が同じ＝対称）
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { fireStepTriggers } from "../../server/src/logic/triggers"

const VALLEY = "BS06-073" // 灼熱の谷（ドローステップ：ドロー+1 と 手札1枚破棄）
const TRANSMIGRATION = "BS09-055" // 転生の谷（ドローステップの誘発を持つ別のネクサス）
const TENSHO_SPIRIT = "BS04-010" // 雷帝エール・クレル（【転召】持ち。転生の谷のコストに使う）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard(VALLEY).name === "灼熱の谷", "BS06-073 は灼熱の谷")
    assert(getCard(TRANSMIGRATION).name === "転生の谷", "BS09-055 は転生の谷")
    const steps = getCard(TRANSMIGRATION).effects.filter((e) => e.kind === "step")
    assert(steps.some((e) => e.kind === "step" && e.step === "draw"), "転生の谷はドローステップの誘発を持つ")
    const kws = getCard(TENSHO_SPIRIT).effects.filter((e) => e.kind === "keyword").map((e) => (e.kind === "keyword" ? e.keyword : ""))
    assert(kws.includes("tensho"), "BS04-010 は【転召】を持つ（転生の谷のコストに使える）")
}

function setup(cardIds: string[], interactive: boolean): GameState {
    const s = createGame(`order-${cardIds.join("-")}-${interactive}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.turnPlayer = "p1"
    s.phase = "draw"
    for (const id of cardIds) s.players.p1.field.nexuses.push(createInstance(id, s.turn, 3))
    // 転生の谷は「手札の【転召】持ち1枚を破棄することで」＝コストが要るので、手札に1枚入れておく
    s.players.p1.hand = [TENSHO_SPIRIT, "BS01-001", "BS01-002", "BS01-003"]
    return s
}

console.log("=== 同じカードの複数エントリは聞かない（テキストで順序が決まっている） ===")
{
    const s = setup([VALLEY], true)
    fireStepTriggers(s, "draw", undefined, "enter", "all")
    // 灼熱の谷は「ドロー+1」と「手札1枚破棄」の2エントリを同時に持つが、解決順は聞かれない。
    // 最初に立つ選択待ちは「どの手札を破棄するか」
    assert(s.pendingChoice !== null, "選択待ちにはなる")
    assert(s.pendingChoice?.triggerOrder === undefined, "解決順は聞かれない")
    assert(s.pendingChoice?.cardZone === "hand", "聞かれるのは破棄する手札")
}

console.log("=== 同名カードを2枚並べても聞かない（順序を入れ替えても結果が同じ） ===")
{
    const s = setup([VALLEY, VALLEY], true)
    fireStepTriggers(s, "draw", undefined, "enter", "all")
    assert(s.pendingChoice?.triggerOrder === undefined, "解決順は聞かれない")
    assert(s.pendingChoice?.cardZone === "hand", "1枚目の破棄から始まる")
}

console.log("=== 別のカードの効果が同時に発揮するときは、ターンプレイヤーが解決順を決める ===")
{
    const s = setup([VALLEY, TRANSMIGRATION], true)
    fireStepTriggers(s, "draw", undefined, "enter", "all")
    assert(s.pendingChoice?.triggerOrder !== undefined, "解決順を聞かれる（ここが直った点）")
    assert(s.pendingChoice?.pid === "p1", "聞かれるのはターンプレイヤー")
    assert(s.pendingChoice?.optional === false, "解決順は必ず決める（スキップ不可）")
    const options = s.pendingChoice?.options ?? []
    assert(options.length >= 2, `候補が2つ以上並ぶ（実際: ${options.length}）`)
    assert(
        options.some((o) => o.includes("灼熱の谷")) && options.some((o) => o.includes("転生の谷")),
        "両方のカード名が候補に出る",
    )
    // 2番目（転生の谷）を先に解決すると選んでも、処理が続いて最後まで解決しきる
    const second = options[1]
    assert(second !== undefined, "2番目の候補がある")
    if (second !== undefined) {
        assert(act(s, "p1", { type: "resolveChoice", option: second }) === null, "2番目を先に解決すると選ぶ")
    }
    let guard = 0
    while (s.pendingChoice && guard < 12) {
        // 残りの選択（破棄する手札など）はすべて先頭候補で答える
        const pc = s.pendingChoice
        const firstOption = pc.options?.[0]
        const answer =
            pc.kind === "option" && firstOption !== undefined
                ? { type: "resolveChoice" as const, option: firstOption }
                : { type: "resolveChoice" as const, cardIndex: 0 }
        if (act(s, "p1", answer) !== null) break
        guard++
    }
    assert(guard < 12, "解決しきる（無限に聞かれない）")
    assert(s.players.p1.trashCards.length >= 1, "灼熱の谷の破棄も解決された（取りこぼしがない）")
}

console.log("=== 非対話（テスト）では聞かず、従来どおり場に出た順で解決する ===")
{
    const s = setup([VALLEY, TRANSMIGRATION], false)
    const deckBefore = s.players.p1.deck.length
    fireStepTriggers(s, "draw", undefined, "enter", "all")
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(s.players.p1.deck.length < deckBefore, "灼熱の谷のドロー+1は解決されている")
}
