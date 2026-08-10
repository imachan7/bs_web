// smoke パート157（BS08ビクティム：召喚コストを手札破棄で支払う）
//
// 「コスト1につき、自分の手札1枚を破棄することで支払うことができる」。
// **どこまで手札破棄で払うかは選べず、コアで足りない分だけを自動で回す簡略化**にした
// （BS04栄光の表彰台Lv1の nexusCostMillPay とまったく同じ方針。card-notes に記載）。
//
// 器の作りは、マジックが lendSelfThisTurn で自分をこのターンの発生源として貸し、
// その仮想発生源が kind:"summonCostHandDiscardPay" を持つ形。
// 「スピリットカード**1枚**の召喚に」なので、実際に破棄で払った時点で貸与を使い切る。
import {
    act,
    assert,
    createGame,
    getCard,
    handleAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { validateSummon } from "../../server/src/logic/RuleValidator"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    reduction?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

const VICTIM = CARDS.find((c) => (c.effects ?? []).some((e) => e["kind"] === "summonCostHandDiscardPay"))!
// 検証しやすいスピリット：コスト3以上・Lv1維持コア1・効果なし。
// 軽減シンボルを持つカードしか該当しないが、**各テストは自分のフィールドが空の状態から召喚する**ので
// 軽減は0になり、実コストはカード記載のコストと一致する
const TARGET = CARDS.find(
    (c) =>
        c.type === "spirit" &&
        (c.cost ?? 0) >= 3 &&
        (c.effects ?? []).length === 0 &&
        c.levels?.find((l) => l.level === 1)?.cores === 1,
)!
const COST = TARGET.cost!

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    runTurnStart(s)
    s.phase = "main"
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    return s
}
// p1 の手札を「召喚するカード1枚 ＋ 破棄用の filler」に作り替える
function setHand(s: GameState, fillers: number): void {
    s.players.p1.hand = [TARGET.cardId, ...Array<string>(fillers).fill(TARGET.cardId)]
}
// ビクティムを**マジックとして実際に使う**（このターンの間、手札破棄で召喚コストを払えるようになる）。
// resolveAction に action を直接渡すと、カードデータ側（kind:"magic" / timing:"main"）が
// 一度も検証されないまま通ってしまう（coverage:effects の「テストが手で組んだ action でしか
// 実行されていない」に出る）。
// 使用コストで検証意図が崩れないよう、支払い用のリザーブは一時的に増やして元に戻す
function castVictim(s: GameState): void {
    const keepReserve = s.players.p1.reserve
    s.players.p1.hand.unshift(VICTIM.cardId)
    s.players.p1.reserve = 30
    const err = act(s, "p1", { type: "castMagic", handIndex: 0 })
    assert(err === null, `${VICTIM.name}をマジックとして使用できた（${String(err)}）`)
    s.players.p1.reserve = keepReserve
}

console.log("=== 効果が無ければ、コアが足りない召喚は通らない ===")
{
    const s = base("victim-none")
    setHand(s, 3)
    s.players.p1.reserve = 1 // 置くコア1個ぶんしかない
    assert(validateSummon(s, "p1", 0) !== null, `${TARGET.name}（コスト${COST}）はコア不足で召喚できない`)
}

console.log("=== 効果があれば、コアで足りない分が手札破棄になる ===")
{
    const s = base("victim-pay")
    setHand(s, 5)
    s.players.p1.reserve = 1 // 置くコア1個ぶんだけ。コスト全額が手札破棄になる
    castVictim(s)

    assert(validateSummon(s, "p1", 0) === null, "召喚できるようになった")
    const handBefore = s.players.p1.hand.length
    const trashBefore = s.players.p1.trashCards.length
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚が通った")

    assert(s.players.p1.field.spirits.length === 1, `${TARGET.name}が場に出た`)
    assert(s.players.p1.reserve === 0, "リザーブのコア1個は置くコアに使われた")
    // 手札は「召喚した1枚」＋「破棄したCOST枚」だけ減る
    assert(
        s.players.p1.hand.length === handBefore - 1 - COST,
        `手札が${String(1 + COST)}枚減った（召喚1枚＋破棄${String(COST)}枚。実際: ${String(handBefore - s.players.p1.hand.length)}枚）`,
    )
    assert(s.players.p1.trashCards.length === trashBefore + COST, "破棄したカードはトラッシュへ行った")
}

console.log("=== コアが足りている分は手札を減らさない（足りない分だけ回す簡略化） ===")
{
    const s = base("victim-partial")
    setHand(s, 5)
    s.players.p1.reserve = COST + 1 - 2 // コストのうち2だけ足りない
    castVictim(s)
    const handBefore = s.players.p1.hand.length
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚が通った")
    assert(
        s.players.p1.hand.length === handBefore - 1 - 2,
        `不足していた2ぶんだけ破棄した（実際: ${String(handBefore - 1 - s.players.p1.hand.length)}枚）`,
    )
    assert(s.players.p1.reserve === 0, "リザーブのコアは先に使い切っている")
}

console.log("=== 使えるのはスピリットカード1枚の召喚まで ===")
{
    const s = base("victim-once")
    setHand(s, 9)
    s.players.p1.reserve = 1
    castVictim(s)
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "1体目は召喚できた")
    assert(
        s.players.p1.turnVirtualInstances.length === 0,
        `${getCard(VICTIM.cardId).name}の貸与は使い切られた`,
    )
    s.players.p1.reserve = 1
    assert(validateSummon(s, "p1", 0) !== null, "2体目は手札破棄で払えない（コア不足で弾かれる）")
}

console.log("=== 破棄に使えるのは召喚するカード以外（手札が足りなければ払えない） ===")
{
    const s = base("victim-handshort")
    setHand(s, 1) // 召喚するカード＋1枚しかない
    s.players.p1.reserve = 1
    castVictim(s)
    assert(
        validateSummon(s, "p1", 0) !== null,
        `破棄できるのは1枚だけなのでコスト${COST}には届かない（召喚するカード自身は使えない）`,
    )
}

console.log("=== 置くコアは手札破棄では払えない ===")
{
    const s = base("victim-maintain")
    setHand(s, 9)
    s.players.p1.reserve = 0 // 置くコア1個すら無い
    castVictim(s)
    assert(validateSummon(s, "p1", 0) !== null, "置くコアが用意できないので召喚できない")
}
