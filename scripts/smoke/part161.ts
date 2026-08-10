// smoke パート161（実行実績0だった全体制約7種）
//
// coverage:effects（2026-08-10）で「実装されているのに、どのカードからも一度も適用されていない」
// 機構が7つ見つかった。前回この層から【激突】・turnStartResumeStep・returnSelfToHand の
// 実バグが出ているので、まず1回ずつ通す。
//
//   globalConstraint : noDeckMillByOpponent / levelCantAct / summonLimitByCostForOpponent
//                      noSummonTriggerByCost / noReductionBySummonCost
//   constraintGrant  : noRestWhenBlockingCost / lifeDamageToVoid
//
// キーワード（【聖命】【強襲】【氷壁】など）は「全滅」が1つも無かったので、ここでは扱わない。
import {
    assert,
    createGame,
    createInstance,
    effectiveCost,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { millDeck } from "../../server/src/logic/EffectModules"
import { validateSummon } from "../../server/src/logic/RuleValidator"
import { activeConstraints, instCostCantAct, noSummonTriggerByCost } from "../../shared/rules"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    family?: string[]
    reduction?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const byId = (id: string): CardRow => {
    const c = CARDS.find((x) => x.cardId === id)
    if (!c) throw new Error(`カードが見つかりません: ${id}`)
    return c
}
// 発生源が持つ globalConstraint / constraintGrant のレベル指定から、必要なコア数を引く
function coresForConstraintLevel(card: CardRow, effectId: string): number {
    const e = (card.effects ?? []).find((x) => x["id"] === effectId)!
    const levels = (e["levels"] as number[] | null) ?? [1]
    const want = levels[0]!
    return card.levels?.find((l) => l.level === want)?.cores ?? 0
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number, summonedTurn?: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, summonedTurn ?? s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== noDeckMillByOpponent：配置したターンだけデッキが破棄されない（BS08鳳翼の聖剣） ===")
{
    const sword = byId("BS08-064")
    // このターンに配置した（summonedTurn === state.turn）
    const s = base("nomill-thisturn")
    putNexus(s, "p2", sword.cardId, 0)
    const before = s.players.p2.deck.length
    millDeck(s, "p2", 3, "p1", { sourceType: "spirit" })
    assert(s.players.p2.deck.length === before, `${sword.name}を配置したターンは破棄されない`)

    // 前のターンに配置していた（whileSourceDeployedTurnOnly が外れる）
    const s2 = base("nomill-oldturn")
    // コア0＝Lv1なので Lv2 の「ライフのコア1個で無効にする」は本来働かないが、
    // レベル判定が壊れたときに黙って通ってしまわないよう、ライフを0にして確実に切り離しておく
    s2.players.p2.life = 0
    putNexus(s2, "p2", sword.cardId, 0, s2.turn - 1)
    const before2 = s2.players.p2.deck.length
    millDeck(s2, "p2", 3, "p1", { sourceType: "spirit" })
    assert(s2.players.p2.deck.length === before2 - 3, "配置したターンを過ぎれば通常どおり破棄される")
}

console.log("=== levelCantAct：Lv1のスピリットはアタックもブロックもできない（BS07腐りゆく湖沼Lv2） ===")
{
    const swamp = byId("BS07-057")
    const s = base("levelcantact")
    s.phase = "attack"
    putNexus(s, "p1", swamp.cardId, coresForConstraintLevel(swamp, "BS07-057-e2"))
    // Lv1（コア1）と Lv2（コア2以上）を並べる
    const rock = byId("BS03-080") // ロック・ゴレム：Lv1=1コア / Lv2=2コア
    const lv1 = putSpirit(s, "p2", rock.cardId, 1)
    const lv2 = putSpirit(s, "p2", rock.cardId, 2)

    assert(instCostCantAct(s, lv1), "Lv1のスピリットは行動できない")
    assert(!instCostCantAct(s, lv2), "Lv2のスピリットは行動できる")
    // 「お互いの」なので発生源の持ち主側も止まる
    const own = putSpirit(s, "p1", rock.cardId, 1)
    assert(instCostCantAct(s, own), "自分側のLv1も止まる（『お互いの』）")
}

console.log("=== summonLimitByCostForOpponent：相手はコスト4以下をターン1体まで（BS08夢想法師サンゾール） ===")
{
    const sanzo = byId("BS08-053")
    const s = base("summonlimit")
    s.phase = "main"
    s.turnPlayer = "p1"
    putSpirit(s, "p2", sanzo.cardId, coresForConstraintLevel(sanzo, "BS08-053-e5"))
    // コスト4以下・コスト5以上のスピリットを1枚ずつ用意する
    const cheap = CARDS.find((c) => c.type === "spirit" && (c.cost ?? 99) <= 4 && (c.effects ?? []).length === 0)!
    const pricey = CARDS.find((c) => c.type === "spirit" && (c.cost ?? 0) >= 5 && (c.effects ?? []).length === 0)!

    s.players.p1.hand = [cheap.cardId, cheap.cardId, pricey.cardId]
    assert(validateSummon(s, "p1", 0) === null, `1体目の${cheap.name}（コスト${String(cheap.cost)}）は召喚できる`)
    // 1体目を召喚済みの状態を作る（このターンに出したものとして数えられる）
    putSpirit(s, "p1", cheap.cardId, 1)
    assert(validateSummon(s, "p1", 1) !== null, "2体目のコスト4以下は召喚できない")
    assert(validateSummon(s, "p1", 2) === null, `コスト5以上（${pricey.name}）は制限を受けない`)
}

console.log("=== noSummonTriggerByCost：コスト4以下の召喚時効果は発揮されない（BS08共鳴する音叉の塔） ===")
{
    const tower = byId("BS08-061")
    const s = base("nosummontrigger")
    putNexus(s, "p1", tower.cardId, coresForConstraintLevel(tower, "BS08-061-e1"))
    const cheap = CARDS.find((c) => c.type === "spirit" && (c.cost ?? 99) <= 4)!
    const pricey = CARDS.find((c) => c.type === "spirit" && (c.cost ?? 0) >= 5)!

    assert(noSummonTriggerByCost(s, putSpirit(s, "p1", cheap.cardId, 1)), "コスト4以下は召喚時効果が止まる")
    assert(!noSummonTriggerByCost(s, putSpirit(s, "p1", pricey.cardId, 1)), "コスト5以上は通常どおり発揮する")
}

console.log("=== noReductionBySummonCost：コスト3以下は軽減が効かない（BS08超時空重力炉） ===")
{
    const reactor = byId("BS08-062")
    // 軽減シンボルを持つコスト3以下のスピリットと、そのシンボル色を場に用意する
    const cheap = CARDS.find(
        (c) => c.type === "spirit" && (c.cost ?? 99) <= 3 && (c.reduction ?? []).length > 0,
    )!
    const color = cheap.reduction![0]!
    const symbolSource = CARDS.find((c) => c.type === "nexus" && (c.effects ?? []).length === 0)

    const s = base("noreduction")
    // 軽減元として、同じ色のシンボルを持つスピリットを並べる
    const symbolCard = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).length >= 0 && (c as unknown as { symbol?: string[] }).symbol?.includes(color))!
    putSpirit(s, "p1", symbolCard.cardId, 1)
    const withReduction = effectiveCost(s, "p1", getCard(cheap.cardId))
    assert(withReduction < (cheap.cost ?? 0), `前提: 通常は軽減が効く（${String(cheap.cost)}→${String(withReduction)}）`)

    putNexus(s, "p1", reactor.cardId, coresForConstraintLevel(reactor, "BS08-062-e1"))
    assert(
        effectiveCost(s, "p1", getCard(cheap.cardId)) === cheap.cost,
        `${reactor.name}があると軽減されない（コスト${String(cheap.cost)}のまま）`,
    )
    void symbolSource
}

console.log("=== noRestWhenBlockingCost：同じコストをブロックしても疲労しない（BS07造兵工房） ===")
{
    const workshop = byId("BS07-065")
    const s = base("norest")
    s.phase = "attack"
    s.turnPlayer = "p2" // 『相手のアタックステップ』＝発生源の持ち主(p1)が非ターンプレイヤー
    putNexus(s, "p1", workshop.cardId, coresForConstraintLevel(workshop, "BS07-065-e1"))
    const golem = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes("造兵"))!
    const blocker = putSpirit(s, "p1", golem.cardId, 1)

    const constraints = activeConstraints(s, "p1", blocker)
    assert(
        constraints.some((c) => c.type === "noRestWhenBlockingCost"),
        `系統「造兵」の${golem.name}に noRestWhenBlockingCost が付与されている`,
    )
    // 系統を持たないスピリットには付かない
    const other = CARDS.find((c) => c.type === "spirit" && !(c.family ?? []).includes("造兵"))!
    const plain = putSpirit(s, "p1", other.cardId, 1)
    assert(
        !activeConstraints(s, "p1", plain).some((c) => c.type === "noRestWhenBlockingCost"),
        "系統「造兵」を持たないスピリットには付与されない",
    )
}

console.log("=== lifeDamageToVoid：減らしたライフのコアはボイドへ（BS08倒逆ピラミッド群Lv2） ===")
{
    const pyramid = byId("BS08-058")
    const s = base("lifetovoid")
    s.phase = "attack"
    s.turnPlayer = "p1" // 『自分のアタックステップ』
    putNexus(s, "p1", pyramid.cardId, coresForConstraintLevel(pyramid, "BS08-058-e2"))
    const meishu = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes("冥主"))!
    const attacker = putSpirit(s, "p1", meishu.cardId, 1)

    assert(
        activeConstraints(s, "p1", attacker).some((c) => c.type === "lifeDamageToVoid"),
        `系統「冥主」の${meishu.name}に lifeDamageToVoid が付与されている`,
    )
    // 相手のターンでは付かない（『自分のアタックステップ』限定）
    s.turnPlayer = "p2"
    assert(
        !activeConstraints(s, "p1", attacker).some((c) => c.type === "lifeDamageToVoid"),
        "相手のアタックステップでは付与されない",
    )
}
