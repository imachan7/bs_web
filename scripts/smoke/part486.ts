// smoke パート486(《継召》exTrashReduction:トラッシュのEXシンボル持ちカード除外による召喚コスト軽減)
// 仕様(2026-10 ユーザー確定):
//   - 効果kind "exTrashReduction"。効果は「召喚しようとするカード自身」が持っているかで判定する
//     (手札以外=トラッシュ等からコストを支払う召喚でも効く。旧scope self/ownHandは廃止)
//   - トラッシュのEXシンボル持ちカード(symbolEx:true)を除外し、そのシンボルで召喚コストを軽減できる
//   - 軽減は軽減シンボルと同じ色のみ(赤軽減なら赤のEXシンボルでしか軽減できない)
//   - 軽減の合計はカードの軽減シンボル数を超えない(通常の軽減シンボルと同じ枠で数える)
//   - summon アクションの exReductionTrashIndices(trashCards 内インデックス)で何枚除外するかを選ぶ
//   - 除外されたカードは trashCards から消えて excludedCards へ移る
//   - 候補外・重複指定は validateSummon でエラー
import { act, assert, createGame, effectiveCost, getCard, runTurnStart } from "./helpers"
import { exTrashReductionCandidateIndices } from "../../shared/cost"
import type { GameState } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"

const TARGET = "BS01-006" // メラット(赤スピリット cost2 reduction[赤,赤]。《継召》効果を注入して使う)
const VANILLA = "BS01-002" // ロクケラトプス(候補外カードの素材。symbolExなし)
const EX_RED = "BS01-001" // ゴラ・ドン(赤シンボル。テスト中だけ symbolEx:true を付けてEX素材にする)
const EX_PURPLE = "BS01-027" // ウィル・オーブ(紫シンボル。テスト中だけ symbolEx:true を付けてEX素材にする)

console.log("=== 前提: カードデータの機械確認 ===")
{
    // cardId は記憶で書かない。名前・種別・色・コストをここで必ず確かめる
    assert(getCard(TARGET).name === "メラット" && getCard(TARGET).cost === 2, "TARGET はメラット(コスト2)")
    assert(
        getCard(TARGET).reduction.length === 2 && getCard(TARGET).reduction.every((c) => c === "red"),
        "メラットの軽減シンボルは赤2つ",
    )
    assert(getCard(EX_RED).symbol.join() === "red", "EX_RED のシンボルは赤")
    assert(getCard(EX_PURPLE).symbol.join() === "purple", "EX_PURPLE のシンボルは紫")
    assert(getCard(EX_RED).symbolEx !== true, "EX素材は通常は symbolEx なし(テストで一時的に付ける)")
}

// テスト中だけ CARD_DB のカードへ効果・symbolEx を注入し、終わったら戻す
const savedTarget = CARD_DB.get(TARGET)!
const savedRed = CARD_DB.get(EX_RED)!
const savedPurple = CARD_DB.get(EX_PURPLE)!
const savedTargetEffects = [...savedTarget.effects]
function injectEffect(): void {
    savedTarget.effects.push({ id: "test-ex-trash-reduction", kind: "exTrashReduction", levels: null })
}
function restoreCards(): void {
    savedTarget.effects.length = 0
    savedTarget.effects.push(...savedTargetEffects)
    savedRed.symbolEx = false
    savedPurple.symbolEx = false
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function mainPhase(s: GameState): void {
    s.turnPlayer = "p1"
    s.phase = "main"
}

console.log("=== 1. 候補一覧: 効果がなければ空 ===")
{
    const s = game("case1-no-effect")
    savedRed.symbolEx = true
    s.players.p1.trashCards.push(EX_RED, EX_RED)
    assert(
        exTrashReductionCandidateIndices(s, "p1", getCard(TARGET)).length === 0,
        "《継召》を持たないカードは候補なし(効果が条件)",
    )
    restoreCards()
}

console.log("=== 2. 候補一覧: 効果があればトラッシュのEXシンボル持ちだけが候補 ===")
{
    const s = game("case2-candidates")
    injectEffect()
    savedRed.symbolEx = true
    savedPurple.symbolEx = true
    s.players.p1.trashCards.push(VANILLA, EX_RED, VANILLA, EX_PURPLE)
    const cands = exTrashReductionCandidateIndices(s, "p1", getCard(TARGET))
    assert(cands.length === 2 && cands[0] === 1 && cands[1] === 3, "EXシンボル持ちのインデックス1・3だけが候補")
    restoreCards()
}

console.log("=== 3. effectiveCost: 軽減シンボルと同じ色だけが軽減に使える ===")
{
    const s = game("case3-effective-cost")
    const merat = getCard(TARGET) // cost2 reduction[赤,赤]
    assert(effectiveCost(s, "p1", merat) === 2, "効果未使用ならコスト2のまま")
    // 赤のEXシンボル2つで軽減2(コスト0)。軽減シンボルの色と一致するため使える
    assert(effectiveCost(s, "p1", merat, false, ["red", "red"]) === 0, "赤のEXシンボル2つでコスト0")
    // 紫のEXシンボルは赤軽減には使えない
    assert(effectiveCost(s, "p1", merat, false, ["purple", "purple"]) === 2, "紫のEXシンボルでは軽減されない")
    // 軽減シンボル数(2)を超えては軽減されない
    assert(effectiveCost(s, "p1", merat, false, ["red", "red", "red"]) === 0, "3つ指定しても軽減は2で頭打ち")
}

console.log("=== 4. 召喚: 赤のEXシンボルを除外して軽減。カードは excludedCards へ ===")
{
    const s = game("case4-summon-red")
    injectEffect()
    savedRed.symbolEx = true
    s.players.p1.trashCards = [VANILLA, EX_RED, VANILLA, EX_RED]
    s.players.p1.hand = [TARGET]
    s.players.p1.excludedCards = []
    mainPhase(s)
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", { type: "summon", handIndex: 0, exReductionTrashIndices: [1, 3] }) === null,
        "《継召》でトラッシュの赤EXシンボル2枚を除外して召喚できる",
    )
    // コスト2から軽減2で支払い0コア+Lv1の維持コア1個でリザーブは1減る
    assert(s.players.p1.reserve === reserveBefore - 1, "赤EX2枚でコスト2が全額軽減され、支払いは維持コア1のみ")
    assert(s.players.p1.trashCores === 0, "軽減で支払いコアは0")
    assert(
        s.players.p1.trashCards.length === 2 && s.players.p1.trashCards.every((c) => c === VANILLA),
        "除外した2枚はトラッシュから消える",
    )
    assert(
        s.players.p1.excludedCards.length === 2 && s.players.p1.excludedCards.every((c) => c === EX_RED),
        "除外した2枚は excludedCards に移る",
    )
    restoreCards()
}

console.log("=== 5. 召喚: 色が一致しないEXシンボルを除外しても軽減されない ===")
{
    const s = game("case5-summon-purple")
    injectEffect()
    savedPurple.symbolEx = true
    s.players.p1.trashCards = [EX_PURPLE, EX_PURPLE]
    s.players.p1.hand = [TARGET]
    s.players.p1.excludedCards = []
    mainPhase(s)
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", { type: "summon", handIndex: 0, exReductionTrashIndices: [0, 1] }) === null,
        "紫のEXシンボルでも除外自体はできる(軽減はされない)",
    )
    // 軽減0なのでコスト2を支払い(trashCores)+維持コア1でリザーブは3減る
    assert(s.players.p1.reserve === reserveBefore - 3, "紫EXでは軽減されず、コスト2+維持1でリザーブは3減る")
    assert(s.players.p1.excludedCards.length === 2, "除外した2枚は excludedCards へ(軽減されなく除外は有効)")
    restoreCards()
}

console.log("=== 6. 検証エラー: 候補外・重複・効果なしでの指定 ===")
{
    const s = game("case6-validate")
    injectEffect()
    savedRed.symbolEx = true
    s.players.p1.trashCards = [VANILLA, EX_RED]
    s.players.p1.hand = [TARGET]
    mainPhase(s)
    assert(
        act(s, "p1", { type: "summon", handIndex: 0, exReductionTrashIndices: [0] }) !== null,
        "EXシンボルでないトラッシュのカード(候補外)は指定できない",
    )
    assert(
        act(s, "p1", { type: "summon", handIndex: 0, exReductionTrashIndices: [1, 1] }) !== null,
        "同じカードを重複して指定できない",
    )
    restoreCards()
    const s2 = game("case6-no-effect")
    savedRed.symbolEx = true
    s2.players.p1.trashCards = [EX_RED]
    s2.players.p1.hand = [TARGET]
    mainPhase(s2)
    assert(
        act(s2, "p1", { type: "summon", handIndex: 0, exReductionTrashIndices: [0] }) !== null,
        "効果を持たないカードでは候補が空(=効果なし)なので指定できない",
    )
    restoreCards()
}

console.log("=== 7. 除外済みのカードは再び候補に数えられない ===")
{
    const s = game("case7-after-exclude")
    injectEffect()
    savedRed.symbolEx = true
    s.players.p1.trashCards = [EX_RED, EX_RED]
    s.players.p1.hand = [TARGET, TARGET]
    s.players.p1.excludedCards = []
    mainPhase(s)
    assert(act(s, "p1", { type: "summon", handIndex: 0, exReductionTrashIndices: [0] }) === null, "1枚除外して召喚")
    assert(s.players.p1.trashCards.length === 1, "トラッシュには残り1枚")
    const cands = exTrashReductionCandidateIndices(s, "p1", getCard(TARGET))
    assert(cands.length === 1 && cands[0] === 0, "除外後は残り1枚のインデックス0だけが候補(除外分は数えない)")
    assert(
        act(s, "p1", { type: "summon", handIndex: 0, exReductionTrashIndices: [0, 1] }) !== null,
        "消えた分のインデックス1はもう候補外",
    )
    restoreCards()
}

console.log("すべてのチェックに合格しました 🎉(part486)")
