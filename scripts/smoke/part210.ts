// smoke パート210（効果文と実装の意味照合＝S7「誰が選ぶか」で見つかった食い違い）
//
// `discardOpponent` は**選択者が「破棄される相手本人」に焼き込まれている**
// （type.ts の定義／handDeck.ts の tryInteractiveCardChoice(state, targetPid, …)）。
// これは「相手は、相手の手札1枚を破棄する」には正しいが、
// 主語が「自分は」の効果に使うと**相手が最も不要なカードを差し出せる**＝印刷より弱くなる。
//
// このパートは「自分は、相手の手札1枚を**内容を見ないで**破棄する」の2枚。
// どちらも中身を見ないのだから誰も選ばない＝ランダムが正しい（2026-08-17 ユーザー確認）。
//   BS02-021 髑髏騎士ズ・ガイン Lv3『このスピリットのアタック時』
//   BS03-084 巨猫ブリンクス     Lv3『このスピリットのアタック時』
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const ZUGAIN = "BS02-021" // 髑髏騎士ズ・ガイン
const BLINKS = "BS03-084" // 巨猫ブリンクス

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard(ZUGAIN).name === "髑髏騎士ズ・ガイン", "BS02-021 は髑髏騎士ズ・ガイン")
    assert(getCard(BLINKS).name === "巨猫ブリンクス", "BS03-084 は巨猫ブリンクス")
    for (const id of [ZUGAIN, BLINKS]) {
        assert(
            getCard(id).effect.includes("内容を見ないで破棄する"),
            `${getCard(id).name} の効果文は「内容を見ないで破棄する」`,
        )
        // 効果データ側に random:true が入っていること（データとテキストの対応）
        const hasRandom = JSON.stringify(getCard(id).effects).includes('"random":true')
        assert(hasRandom, `${getCard(id).name} の discardOpponent は random:true`)
    }
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true // 実対戦と同じ条件で確かめる
    return s
}

console.log("=== 実対戦でも選択待ちにならず、相手の手札が1枚減る ===")
{
    const s = base("random-discard-basic")
    const src = createInstance(ZUGAIN, s.turn, 1)
    s.players.p1.field.spirits.push(src)
    const handBefore = [...s.players.p2.hand]
    const trashBefore = s.players.p2.trashCards.length
    assert(handBefore.length >= 2, "相手の手札が2枚以上ある（前提。1枚だと選択の有無が判別できない）")

    resolveAction(s, "p1", src, { type: "discardOpponent", count: 1, random: true })

    assert(s.pendingChoice === null, "相手に選ばせる選択待ちにならない（誰も選ばない）")
    assert(s.players.p2.hand.length === handBefore.length - 1, "相手の手札が1枚減る")
    assert(s.players.p2.trashCards.length === trashBefore + 1, "減った1枚は相手のトラッシュへ")
    const removed = handBefore.filter((id, i) => s.players.p2.hand[i] !== id || i >= s.players.p2.hand.length)
    assert(removed.length >= 1, "減ったのは手札のいずれか1枚")
}

console.log("=== 手札が0枚なら不発 ===")
{
    const s = base("random-discard-empty")
    const src = createInstance(BLINKS, s.turn, 1)
    s.players.p1.field.spirits.push(src)
    s.players.p2.hand = []
    const trashBefore = s.players.p2.trashCards.length
    resolveAction(s, "p1", src, { type: "discardOpponent", count: 1, random: true })
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(s.players.p2.trashCards.length === trashBefore, "トラッシュも増えない")
}

console.log("=== 末尾固定ではない（何度か試すと違う位置が選ばれる） ===")
{
    // ランダムなので1回では確かめられない。同じ盤面で30回試して
    // 「末尾以外が選ばれたことが一度でもあるか」を見る（末尾固定＝旧実装への退行を捕まえる）。
    // **手札は重複しない4枚に固定する**。同名カードが混ざると「末尾が残っているか」を
    // cardId では判別できず、末尾固定のままでも合格してしまうため
    const HAND = ["BS01-001", "BS01-002", "BS01-003", "BS01-004"]
    assert(new Set(HAND).size === HAND.length, "テスト用の手札は重複しない（判定の前提）")
    let pickedNonLast = false
    for (let i = 0; i < 30; i++) {
        const s = base(`random-discard-spread-${i}`)
        const src = createInstance(ZUGAIN, s.turn, 1)
        s.players.p1.field.spirits.push(src)
        s.players.p2.hand = [...HAND]
        const last = HAND[HAND.length - 1]!
        resolveAction(s, "p1", src, { type: "discardOpponent", count: 1, random: true })
        assert(s.players.p2.hand.length === HAND.length - 1, "毎回ちょうど1枚だけ減る")
        if (s.players.p2.hand.includes(last)) {
            pickedNonLast = true
            break
        }
    }
    assert(pickedNonLast, "末尾固定ではなく、末尾以外のカードも選ばれる")
}
