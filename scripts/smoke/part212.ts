// smoke パート212（S7「誰が選ぶか」の続き：「相手の手札すべてを見て」は自分が選ぶ）
//
// 「自分は相手の**手札すべてを見て**、その中の◯◯カード1枚を破棄する」
//   BS08-009 関将龍皇ドラグロン（スピリットカード1枚。系統「竜人」で【転召】したとき）
//   SD02-011 獣皇子バハムンド  （マジックカード1枚。『このスピリットの召喚時』）
//
// discardOpponent は選択者が「破棄される相手本人」に焼き込まれているため、
// このままだと**相手が最も不要なカードを差し出せる**＝印刷より弱かった。
// 主語が「自分は」なので選ぶのは自分（2026-08-17 ユーザー確認。CHOOSER_RULES.md §1.6）。
//
// 実対戦では相手の手札を公開ゾーン（revealedCards）へ載せて自分に選ばせる。
// 相手は自分の手札を既に知っているので、公開しても情報は漏れない。
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const DRAGRON = "BS08-009" // 関将龍皇ドラグロン（スピリットカードを破棄）
const BAHAMUND = "SD02-011" // 獣皇子バハムンド（マジックカードを破棄）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard(DRAGRON).name === "関将龍皇ドラグロン", "BS08-009 は関将龍皇ドラグロン")
    assert(getCard(BAHAMUND).name === "獣皇子バハムンド", "SD02-011 は獣皇子バハムンド")
    for (const id of [DRAGRON, BAHAMUND]) {
        assert(getCard(id).effect.includes("相手の手札すべてを見て"), `${getCard(id).name} の効果文は「相手の手札すべてを見て」`)
        assert(
            JSON.stringify(getCard(id).effects).includes('"chooserIsSource":true'),
            `${getCard(id).name} の discardOpponent は chooserIsSource:true`,
        )
    }
}

// 相手（p2）の手札を、種別のはっきりしたカードで組み立てる。
// カード名ではなく**実データの type** で選ぶ（cardId のハードコードを避ける）
import { loadAllCards } from "../../data/loadCards"
const ALL = loadAllCards() as unknown as { cardId: string; type: string; cost: number }[]
const spirits = ALL.filter((c) => c.type === "spirit").sort((a, b) => a.cost - b.cost)
const magics = ALL.filter((c) => c.type === "magic").sort((a, b) => a.cost - b.cost)
const CHEAP_SPIRIT = spirits[0]!.cardId
const PRICEY_SPIRIT = spirits[spirits.length - 1]!.cardId
const CHEAP_MAGIC = magics[0]!.cardId
const PRICEY_MAGIC = magics[magics.length - 1]!.cardId

console.log("=== テスト用カードの前提確認 ===")
{
    assert(getCard(CHEAP_SPIRIT).type === "spirit" && getCard(PRICEY_SPIRIT).type === "spirit", "スピリット2枚を用意した")
    assert(getCard(CHEAP_MAGIC).type === "magic" && getCard(PRICEY_MAGIC).type === "magic", "マジック2枚を用意した")
    assert(getCard(PRICEY_SPIRIT).cost > getCard(CHEAP_SPIRIT).cost, "スピリットにコスト差がある（自動選択の検証に使う）")
    assert(getCard(PRICEY_MAGIC).cost > getCard(CHEAP_MAGIC).cost, "マジックにコスト差がある")
}

function base(seed: string, hand: string[], interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.players.p2.hand = [...hand]
    return s
}

console.log("=== 実対戦：選ぶのは自分。相手の手札が公開ゾーンに載る ===")
{
    const hand = [CHEAP_MAGIC, CHEAP_SPIRIT, PRICEY_MAGIC]
    const s = base("chooser-source-interactive", hand, true)
    const src = createInstance(BAHAMUND, s.turn, 1)
    s.players.p1.field.spirits.push(src)

    resolveAction(s, "p1", src, { type: "discardOpponent", count: 1, cardTypeFilter: "magic", chooserIsSource: true })

    assert(s.pendingChoice !== null, "選択待ちになる")
    assert(s.pendingChoice?.pid === "p1", "選ぶのは発生源の持ち主（p1）。相手ではない")
    assert(s.pendingChoice?.cardZone === "reveal", "公開ゾーンから選ぶ")
    assert(s.revealedCards?.cardIds.length === hand.length, "相手の手札すべてが公開ゾーンに載る（効果文の「すべてを見て」）")
    assert(s.revealedCards?.pid === "p2", "公開ゾーンの持ち主は相手")
    const indices = s.pendingChoice?.cardIndices ?? []
    assert(indices.length === 2, "選べるのはマジック2枚だけ（スピリットは候補外）")
    assert(
        indices.every((i) => getCard(hand[i]!).type === "magic"),
        "候補はすべてマジックカード",
    )

    // 自分が「重いほう」を選べる＝相手が不要牌を差し出す形になっていない
    const pickPricey = indices.find((i) => hand[i] === PRICEY_MAGIC)!
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: pickPricey }) === null, "自分が高コストのマジックを選ぶ")
    assert(!s.players.p2.hand.includes(PRICEY_MAGIC), "選んだカードが相手の手札から消える")
    assert(s.players.p2.trashCards.includes(PRICEY_MAGIC), "選んだカードは相手のトラッシュへ")
    assert(s.players.p2.hand.length === hand.length - 1, "減ったのは1枚だけ")
    assert(s.revealedCards === undefined, "公開ゾーンは片付く")
}

console.log("=== 相手は選べない ===")
{
    const s = base("chooser-source-not-target", [CHEAP_MAGIC, PRICEY_MAGIC], true)
    const src = createInstance(BAHAMUND, s.turn, 1)
    s.players.p1.field.spirits.push(src)
    resolveAction(s, "p1", src, { type: "discardOpponent", count: 1, cardTypeFilter: "magic", chooserIsSource: true })
    assert(act(s, "p2", { type: "resolveChoice", cardIndex: 0 }) !== null, "相手（p2）が選ぼうとしても拒否される")
}

console.log("=== 該当する種別が無ければ不発（公開もしない） ===")
{
    const s = base("chooser-source-none", [CHEAP_SPIRIT], true)
    const src = createInstance(BAHAMUND, s.turn, 1)
    s.players.p1.field.spirits.push(src)
    resolveAction(s, "p1", src, { type: "discardOpponent", count: 1, cardTypeFilter: "magic", chooserIsSource: true })
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(s.revealedCards === undefined, "公開ゾーンも作らない")
    assert(s.players.p2.hand.length === 1, "手札は減らない")
}

console.log("=== 非対話：自分が選ぶので、該当カードのうちコスト最大を落とす ===")
{
    const hand = [PRICEY_SPIRIT, CHEAP_SPIRIT]
    const s = base("chooser-source-auto", hand, false)
    const src = createInstance(DRAGRON, s.turn, 1)
    s.players.p1.field.spirits.push(src)
    resolveAction(s, "p1", src, { type: "discardOpponent", count: 1, cardTypeFilter: "spirit", chooserIsSource: true })
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(s.players.p2.trashCards.includes(PRICEY_SPIRIT), "コストの高いスピリットが落ちる（自分に有利な決定的簡略化）")
    assert(s.players.p2.hand.includes(CHEAP_SPIRIT), "コストの低いほうは残る")
}
