// smoke パート290（BS12 緑バッチ4：新しく足した5つの器を1件ずつ発火させる）
// U=noLifeDamageByCost symbolCount+combinedOnly／W=coresCantBeRemovedByOpponent／
// X=revealTopSummonFreeByFamily／R=draw countCounter（discardHandAllのthenDrawOpponentHand経由）／
// I=noRefreshUntilOwnEndSteps／voidCoreToSelf.orReserve
import {
    assert,
    act,
    createGame,
    createInstance,
    endTurn,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave } from "../../server/src/logic/removal"
import { noLifeDamageByCost, coresCantBeRemovedByOpponent, boardResistanceAgainst } from "../../shared/rules"

const SHIBERUZA = "BS12-020" // 一番槍のシベルザ（symbolCount+combinedOnly）
const GENJI = "BS12-022" // 太陽武者ゲンジ・ボルタ（coresCantBeRemovedByOpponent：カード名に「太陽」）

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

// symbolを1つ持つ任意のスピリット/ブレイヴを探す（cardIdのハードコード事故を避けるためデータから引く）
const oneSymbolSpirit = ALL_CARDS.find((c) => c.type === "spirit" && c.symbol.length === 1 && c.effects.length === 0)
const oneSymbolBrave = ALL_CARDS.find((c) => c.type === "brave" && c.symbol.length === 1)
assert(oneSymbolSpirit !== undefined && oneSymbolBrave !== undefined, "テスト前提: シンボル1つのスピリット/ブレイヴがいる")

console.log("=== U: globalConstraint noLifeDamageByCost（symbolCount+combinedOnly） ===")
{
    const s = game("u-symbolcount")
    const source = createInstance(SHIBERUZA, s.turn, 1) // Lv1で有効
    s.players.p1.field.spirits.push(source)
    const host = createInstance(oneSymbolSpirit!.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(host)
    const brave = createInstance(oneSymbolBrave!.cardId, s.turn, 0)
    attachBrave(s, "p1", host, brave)
    refreshLevelAsOverrides(s)
    assert(noLifeDamageByCost(s, "p2", host) === true, "シンボル2つの合体スピリットのアタックはライフ保護される")

    const uncombined = createInstance(oneSymbolSpirit!.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(uncombined)
    assert(noLifeDamageByCost(s, "p2", uncombined) === false, "合体していなければ（シンボル1つ）保護されない")
}

console.log("=== W: globalConstraint coresCantBeRemovedByOpponent（相手の効果限定・カード名一致） ===")
{
    const s = game("w-corelock")
    const genji = createInstance(GENJI, s.turn, 1) // Lv1で有効（カード名「太陽」）
    genji.cores = 3
    s.players.p1.field.spirits.push(genji)
    refreshLevelAsOverrides(s)
    const byOpponent = boardResistanceAgainst(s, "p1", genji, { op: "coreRemove", scope: "targeted", actorPid: "p2", sourceType: "spirit" })
    assert(byOpponent?.category === "coresLocked", "相手のスピリットの効果ではコアを取り除けない")
    const bySelf = boardResistanceAgainst(s, "p1", genji, { op: "coreRemove", scope: "targeted", actorPid: "p1", sourceType: "spirit" })
    assert(bySelf === null, "自分の効果は片側限定の制約に止められない")
    assert(coresCantBeRemovedByOpponent(s, "p1", genji, "nexus") === false, "sourceTypeがネクサスなら対象外")
}

console.log("=== X: revealTopSummonFreeByFamily（対象なら無償召喚・対象外なら破棄） ===")
{
    const s = game("x-reveal-match")
    const matching = ALL_CARDS.find((c) => c.type === "spirit" && c.family.includes("怪虫"))
    assert(matching !== undefined, "テスト前提: 系統「怪虫」のスピリットカードがいる")
    s.players.p1.deck.unshift(matching!.cardId)
    const before = s.players.p1.field.spirits.length
    resolveAction(s, "p1", null, { type: "revealTopSummonFreeByFamily", familyFilter: ["怪虫", "殻虫", "殻人"] })
    assert(s.players.p1.field.spirits.length === before + 1, "対象カードは非対話時にコストを支払わず召喚される")
    assert(!s.players.p1.trashCards.includes(matching!.cardId), "召喚できたカードはトラッシュへ行かない")
}
{
    const s = game("x-reveal-miss")
    const nonMatching = ALL_CARDS.find((c) => c.type === "spirit" && !c.family.includes("怪虫") && !c.family.includes("殻虫") && !c.family.includes("殻人"))
    assert(nonMatching !== undefined, "テスト前提: 対象外の系統のスピリットカードがいる")
    s.players.p1.deck.unshift(nonMatching!.cardId)
    const before = s.players.p1.field.spirits.length
    resolveAction(s, "p1", null, { type: "revealTopSummonFreeByFamily", familyFilter: ["怪虫", "殻虫", "殻人"] })
    assert(s.players.p1.field.spirits.length === before, "対象外のカードは召喚されない")
    assert(s.players.p1.trashCards.includes(nonMatching!.cardId), "対象外のカードはトラッシュへ破棄される")
}

console.log("=== R: draw countCounter（discardHandAllのthenDrawOpponentHand経由。opponentHand） ===")
{
    const s = game("r-draw-counter")
    s.players.p1.hand = ["BS01-001", "BS01-002"]
    s.players.p2.hand = ["BS01-001", "BS01-002", "BS01-003"]
    const before = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "discardHandAll", thenDrawOpponentHand: true })
    assert(s.players.p1.hand.length === 3, `相手の手札枚数（3枚）ぶんドローする（実際=${s.players.p1.hand.length}）`)
    assert(s.players.p1.deck.length === before - 3, "デッキから3枚引いた")
}
{
    const s = game("r-draw-counter-empty")
    s.players.p1.hand = []
    resolveAction(s, "p1", null, { type: "discardHandAll", thenDrawOpponentHand: true })
    assert(s.players.p1.hand.length === 0, "手札が0枚なら破棄が起きず、ドローもしない")
}

console.log("=== I: CardInstance.noRefreshUntilOwnEndSteps（疲労させた個体に付与→エンドステップで減る） ===")
{
    const s = game("i-norefresh")
    const target = createInstance(oneSymbolSpirit!.cardId, s.turn, 1)
    target.isRested = false
    s.players.p2.field.spirits.push(target)
    resolveAction(s, "p1", null, { type: "exhaust", count: 1, noRefreshUntilOwnEndSteps: 2 })
    assert(target.isRested, "疲労させた")
    assert(target.noRefreshUntilOwnEndSteps === 2, "残り回数2が立つ")
    resolveAction(s, "p2", target, { type: "refreshSelf" })
    assert(target.isRested, "残り回数がある間は効果でも回復しない")
    endTurn(s) // p1のエンドステップ（持ち主p2ではないので減らない）
    assert(target.noRefreshUntilOwnEndSteps === 2, "持ち主でないエンドステップでは減らない")
    endTurn(s) // p2のエンドステップ
    assert(target.noRefreshUntilOwnEndSteps === 1, "持ち主のエンドステップで1減る")
    endTurn(s) // p1
    endTurn(s) // p2のエンドステップ：0になる
    assert((target.noRefreshUntilOwnEndSteps ?? 0) === 0, "残り回数が0になった")
    target.isRested = true
    resolveAction(s, "p2", target, { type: "refreshSelf" })
    assert(!target.isRested, "0になれば通常どおり回復できる")
}

console.log("=== orReserve: voidCoreToSelf（自分のリザーブかこのスピリット上かを選ぶ） ===")
{
    const s = game("orreserve-noninteractive")
    const self = createInstance(oneSymbolSpirit!.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(self)
    const coresBefore = self.cores
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p1", self, { type: "voidCoreToSelf", count: 1, orReserve: true })
    assert(self.cores === coresBefore, "非対話時はスピリット上に置かず")
    assert(s.players.p1.reserve === reserveBefore + 1, "非対話時はリザーブに置く側に倒す")
}
{
    const s = game("orreserve-interactive")
    s.interactiveTargets = true
    const self = createInstance(oneSymbolSpirit!.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(self)
    const coresBefore = self.cores
    resolveAction(s, "p1", self, { type: "voidCoreToSelf", count: 1, orReserve: true })
    assert(s.pendingChoice !== null && (s.pendingChoice?.options ?? []).includes("このスピリット上に置く"), "対話時は選択が立つ")
    assert(act(s, "p1", { type: "resolveChoice", option: "このスピリット上に置く" }) === null, "スピリット上に置くを選ぶ")
    assert(self.cores === coresBefore + 1, "選んだ側（スピリット上）に置かれた")
}

console.log("すべてのチェックに合格しました 🎉（part290）")
