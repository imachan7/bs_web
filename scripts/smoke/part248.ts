// smoke パート248（BS10-103 グロウイングソード。2026-08-27）
//
// 新設した機構:
//   - bpBuff.extraPerCoreToTrash（「さらに、自分のフィールド/リザーブのコアを自分のトラッシュに
//     好きなだけ置くことで、置いたコア1個につきそのスピリットをBP+N」）
//   - PendingChoice.stepper（選択肢をボタンの列でなく −／＋ の増減表示で選ばせる指定。
//     サーバー側の解決は kind:"option" のままで、送られてくるのは options のラベル）
//   - cores.payCoresFromFieldOrReserveToTrash / fieldOrReserveCores（リザーブ優先の支払い）
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, effectiveBp, effectiveCost, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
const sword = byName("グロウイングソード")
const target = byName("ムシャゼミ")
{
    assert(sword.type === "magic" && sword.cost === 3, "グロウイングソードはコスト3のマジック")
    assert(sword.flash === true, "フラッシュタイミングで使える")
}

console.log("=== §A 非対話：BP+3000 のみ（コアは勝手に捨てない） ===")
{
    const s = game("bs10-103-a")
    const inst = createInstance(target.cardId, s.turn, target.levels[0]!.cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    const base = effectiveBp(s, "p1", inst)
    s.players.p1.hand = [sword.cardId]
    const reserveBefore = s.players.p1.reserve
    const cost = effectiveCost(s, "p1", sword)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "グロウイングソードを使用")
    assert(effectiveBp(s, "p1", inst) === base + 3000, `BP+3000（実際: +${String(effectiveBp(s, "p1", inst) - base)}）`)
    // マジックのコスト分しか減らない＝追加のコアは置いていない
    assert(s.players.p1.reserve === reserveBefore - cost, `リザーブはコスト分だけ減る（実際: -${String(reserveBefore - s.players.p1.reserve)} / コスト${String(cost)}）`)
    assert(inst.cores === target.levels[0]!.cores, "フィールドのコアも減らない")
    assert(s.pendingChoice === null || s.pendingChoice === undefined, "非対話では増減の選択を出さない")
}

console.log("=== §B 対話：増減式（stepper）の選択が出て、選んだ数だけ追加でBP+1000 ===")
{
    const s = game("bs10-103-b")
    s.interactiveTargets = true
    const inst = createInstance(target.cardId, s.turn, target.levels[0]!.cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    const base = effectiveBp(s, "p1", inst)
    s.players.p1.hand = [sword.cardId]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "グロウイングソードを使用")
    // 対象が1体しかいないので対象選択は自動、続けてコア数の選択が出る
    assert(s.pendingChoice?.kind === "option", "コア数の選択が出る")
    assert(s.pendingChoice?.stepper === true, "増減式（stepper）の指定が付いている")
    assert(s.pendingChoice!.optional, "0個で終えられる（「〜することで」は任意コスト）")
    const options = s.pendingChoice!.options ?? []
    assert(options[0] === "0", "0個から選べる")
    const reserveBefore = s.players.p1.reserve
    assert(options.length - 1 === reserveBefore + inst.cores, `上限はリザーブ+フィールドのコア（実際: ${String(options.length - 1)}）`)

    assert(act(s, "p1", { type: "resolveChoice", option: "4" }) === null, "コア4個を選ぶ")
    assert(effectiveBp(s, "p1", inst) === base + 3000 + 4000, `BP+3000 に加えて +4000（実際: +${String(effectiveBp(s, "p1", inst) - base)}）`)
    assert(s.players.p1.reserve === reserveBefore - 4, `リザーブから4個減る（実際: ${String(reserveBefore - s.players.p1.reserve)}）`)
    assert(s.players.p1.trashCores >= 4, "置いたコアはトラッシュにある")
}

console.log("=== §C 対話：0個を選べば追加は無し ===")
{
    const s = game("bs10-103-c")
    s.interactiveTargets = true
    const inst = createInstance(target.cardId, s.turn, target.levels[0]!.cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    const base = effectiveBp(s, "p1", inst)
    s.players.p1.hand = [sword.cardId]
    act(s, "p1", { type: "castMagic", handIndex: 0 })
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "resolveChoice", option: "0" }) === null, "0個を選ぶ")
    assert(effectiveBp(s, "p1", inst) === base + 3000, `BP+3000 のみ（実際: +${String(effectiveBp(s, "p1", inst) - base)}）`)
    assert(s.players.p1.reserve === reserveBefore, "リザーブは減らない")
}

console.log("=== §D 対話：スキップ（選ばない）でも追加は無し ===")
{
    const s = game("bs10-103-d")
    s.interactiveTargets = true
    const inst = createInstance(target.cardId, s.turn, target.levels[0]!.cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    const base = effectiveBp(s, "p1", inst)
    s.players.p1.hand = [sword.cardId]
    act(s, "p1", { type: "castMagic", handIndex: 0 })
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "選ばずに終える")
    assert(effectiveBp(s, "p1", inst) === base + 3000, "BP+3000 のみ")
    assert(s.players.p1.reserve === reserveBefore, "リザーブは減らない")
}

console.log("=== §E リザーブが尽きたらフィールドのコアからも払う ===")
{
    const s = game("bs10-103-e")
    s.interactiveTargets = true
    const inst = createInstance(target.cardId, s.turn, 3)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    const base = effectiveBp(s, "p1", inst)
    s.players.p1.hand = [sword.cardId]
    s.players.p1.reserve = effectiveCost(s, "p1", sword) + 1 // コストを払うと残り1個
    act(s, "p1", { type: "castMagic", handIndex: 0 })
    assert(s.pendingChoice?.stepper === true, "増減式の選択が出る")
    const reserveAfterCast = s.players.p1.reserve
    assert(reserveAfterCast === 1, `コスト支払い後のリザーブは1個（実際: ${String(reserveAfterCast)}）`)
    assert((s.pendingChoice!.options ?? []).length - 1 === 1 + inst.cores, `上限はリザーブ1個+フィールドのコア（実際: ${String((s.pendingChoice!.options ?? []).length - 1)}）`)
    const trashBefore = s.players.p1.trashCores
    assert(act(s, "p1", { type: "resolveChoice", option: "3" }) === null, "コア3個を選ぶ")
    assert(s.players.p1.reserve === 0, "リザーブは空になる")
    assert(inst.cores === 1, `足りない2個はフィールド（対象自身）から取られる（実際: ${String(inst.cores)}）`)
    assert(s.players.p1.trashCores === trashBefore + 3, `コア3個がトラッシュへ（実際: +${String(s.players.p1.trashCores - trashBefore)}）`)
    // 実効BPはコアが減ってレベルが下がるぶん動くので、加算そのものは tempBpBuff で確かめる
    assert(inst.tempBpBuff === 3000 + 3000, `BP+3000 に加えて +3000（実際: +${String(inst.tempBpBuff)}）`)
    void base
}
