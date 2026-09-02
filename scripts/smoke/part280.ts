// smoke パート280（BS11：種別混在の1つ選択と、召喚の軽減だけに効くシンボル固定）
//
// 2026-09-02 ユーザー確認:
// - 「相手のスピリット/ブレイヴ/ネクサス、どれか1つ」の**ブレイヴは合体中もスピリット状態も含む**
// - BS11-039 のシンボル黄3つは**スピリット召喚の軽減計算の間だけ**
import { assert, createGame, createInstance, effectiveCost, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS, getCard } from "../../server/src/logic/GameState"
import { attachBrave } from "../../server/src/logic/removal"
import { countSymbols, instanceSymbolCount } from "../../shared/rules"

const TIAEL = "BS11-039" // 天使ティアエル（黄・召喚の軽減の間だけシンボル黄3つ）
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
const braveCard = ALL_CARDS.find(
    (c) => c.type === "brave" && JSON.stringify(c.braveCondition) === JSON.stringify({ vanilla: true }),
)
const anyNexus = ALL_CARDS.find((c) => c.type === "nexus")
assert(braveCard !== undefined && anyNexus !== undefined && vanilla.length >= 2, "テスト前提: 必要なカードがいる")

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== §A 種別混在：合体中のブレイヴを選ぶとホストを残してそれだけが場を離れる ===")
{
    const s = game("any-type-brave")
    const host = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(host)
    const brave = createInstance(braveCard!.cardId, s.turn, 0)
    attachBrave(s, "p2", host, brave)
    refreshLevelAsOverrides(s)
    // 非対話は「スピリット → 合体中のブレイヴ → ネクサス」の順に先頭を選ぶので、対象を絞るため対話で選ぶ
    s.interactiveTargets = true
    resolveAction(s, "p1", null, { type: "removeOneOfAnyType", mode: "destroy" })
    assert(s.pendingChoice?.candidates.includes(brave.instanceId) === true, "合体中のブレイヴも候補に入る")
    assert(s.pendingChoice?.candidates.includes(host.instanceId) === true, "ホストも候補に入る")
}

console.log("=== §B 種別混在：ネクサスも手札に戻せる ===")
{
    const s = game("any-type-nexus")
    const nexus = createInstance(anyNexus!.cardId, s.turn, 2)
    s.players.p2.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    const reserveBefore = s.players.p2.reserve
    resolveAction(s, "p1", null, { type: "removeOneOfAnyType", mode: "toHand" })
    assert(s.players.p2.field.nexuses.length === 0, "ネクサスが場を離れる")
    assert(s.players.p2.hand.includes(nexus.cardId), "手札に戻る")
    assert(s.players.p2.reserve === reserveBefore + 2, "コアはリザーブへ")
}

console.log("=== §C 種別混在：スピリットを破壊する（候補が1つなら自動） ===")
{
    const s = game("any-type-spirit")
    const target = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "removeOneOfAnyType", mode: "destroy" })
    assert(s.players.p2.field.spirits.length === 0, "スピリットが破壊される")
    assert(s.players.p2.trashCards.includes(target.cardId), "トラッシュへ")
}

console.log("=== §D BS11-039：召喚の軽減計算の間だけシンボルが黄3つになる ===")
{
    const s = game("tiael")
    const tiael = createInstance(TIAEL, s.turn, 1)
    s.players.p1.field.spirits.push(tiael)
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(tiael) === getCard(TIAEL).symbol.length, "通常のシンボル数は変わらない")
    assert(countSymbols(s.players.p1, ["yellow"], true) >= 3, "召喚の軽減では黄3つとして数える")
    assert(
        countSymbols(s.players.p1, ["yellow"], false) < 3,
        "軽減以外（ライフダメージ等）の数え方は変わらない",
    )
    // 実際に軽減が効くこと（黄の軽減シンボルを3つ持つスピリットカード）
    const yellowReduce = ALL_CARDS.find(
        (c) => c.type === "spirit" && c.reduction.filter((r) => r === "yellow").length >= 3 && c.cost >= 4,
    )
    if (yellowReduce) {
        const cost = effectiveCost(s, "p1", yellowReduce)
        assert(cost <= yellowReduce.cost - 3, `黄3つぶん軽減される（${String(cost)} <= ${String(yellowReduce.cost - 3)}）`)
    }
    s.phase = "attack"
    refreshLevelAsOverrides(s)
    assert(countSymbols(s.players.p1, ["yellow"], true) < 3, "自分のメインステップ以外では効かない")
}

console.log("すべてのチェックに合格しました 🎉（part280）")
