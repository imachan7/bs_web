// smoke パート199（カバレッジに残った誘発・制限・ボーナスを、カードごとに働かせる）
//
// part198 の続き。汎用の火入れでは条件を作れなかったものを個別に潰す:
//   誘発（対象の絞り込みが厳しいもの）／ステップ誘発／コアステップのボーナス／
//   【粉砕】の破棄枚数ボーナス／マジックの使用制限／バトル勝利誘発（マジックが貸すもの）
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveCost,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import {
    fireBattleWonTriggers,
    fireStepTriggers,
    fireTrigger,
    resolveAction,
    resolveFunsai,
    placeCoresOnSpirit,
} from "../../server/src/logic/EffectModules"
import { hasMagicCostLock, hasMagicRestriction } from "../../shared/cost"
import { loadAllCards } from "../../data/loadCards"
import type { Color } from "../../server/src/type"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    colors?: string[]
    family?: string[]
    effects?: Record<string, unknown>[]
    levels?: { cores: number; bp: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const byId = (id: string): CardRow => {
    const c = CARDS.find((x) => x.cardId === id)
    if (!c) throw new Error(`カードが見つかりません: ${id}`)
    return c
}
const coresFor = (c: CardRow, level: number): number => c.levels?.[level - 1]?.cores ?? 1
const topLevel = (c: CardRow): number => c.levels?.length ?? 1
function entryOf(card: CardRow, suffix: string): Record<string, unknown> {
    const e = (card.effects ?? []).find((x) => String(x["id"]).endsWith(`-${suffix}`))
    if (!e) throw new Error(`${card.name} に ${suffix} がありません`)
    return e
}
function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    return s
}
function put(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== パート199：残った誘発・制限・ボーナスを、カードごとに働かせる ===")

console.log("--- 誘発：対象の絞り込みが厳しいもの（キーワード／コスト／疲労） ---")
{
    // 晶輝龍ディアマット：『召喚時』【神速】を持つスピリット1体を破壊できる
    const card = byId("BS01-024")
    assert(card.name === "晶輝龍ディアマット", "前提: BS01-024 は晶輝龍ディアマット")
    const entry = entryOf(card, "e1")
    const kw = String(((entry["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>)["keyword"])
    const prey = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === kw),
    )!
    const s = base("bs01-024")
    const self = put(s, "p1", card, coresFor(card, 1))
    const target = put(s, "p2", prey, coresFor(prey, 1))
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", self, "onSummon")
    while (s.pendingChoice) {
        const pc = s.pendingChoice
        s.pendingChoice = null
        if (pc.action.type === "noop") break
    }
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === target.instanceId),
        `${card.name}：【${kw}】を持つスピリットを破壊する`,
    )
}
{
    // MCパンサー：『アタック時』コスト1以下の相手を破壊する
    const card = byId("BS05-050")
    assert(card.name === "MCパンサー", "前提: BS05-050 は MCパンサー")
    const entry = entryOf(card, "e1")
    const maxCost = Number(
        ((entry["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>)["cost"] &&
            (((entry["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>)["cost"] as Record<string, unknown>)["max"],
    )
    const cheap = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) <= maxCost)!
    const s = base("bs05-050")
    const self = put(s, "p1", card, coresFor(card, 1))
    const target = put(s, "p2", cheap, coresFor(cheap, 1))
    refreshLevelAsOverrides(s)
    assert(effectiveCost(s, "p2", getCard(cheap.cardId)) <= maxCost, `前提: コスト${maxCost}以下の相手がいる`)
    fireTrigger(s, "p1", self, "onAttack")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === target.instanceId),
        `${card.name}：コスト${maxCost}以下の相手を破壊する`,
    )
}
{
    // 吸血女王カーミラLv2：『アタック時』疲労状態でコスト3以下のスピリットすべてを破壊する
    const card = byId("BS05-016")
    assert(card.name === "吸血女王カーミラ", "前提: BS05-016 は吸血女王カーミラ")
    const entry = entryOf(card, "e2")
    const level = (entry["levels"] as number[])[0]!
    const filter = (entry["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>
    const maxCost = Number((filter["cost"] as Record<string, unknown>)["max"])
    const cheap = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) <= maxCost)!
    const s = base("bs05-016")
    const self = put(s, "p1", card, coresFor(card, level))
    const rested = put(s, "p2", cheap, coresFor(cheap, 1))
    rested.isRested = true
    const fresh = put(s, "p2", cheap, coresFor(cheap, 1))
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", self, "onAttack")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === rested.instanceId),
        `${card.name} Lv${level}：疲労状態でコスト${maxCost}以下は破壊される`,
    )
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === fresh.instanceId),
        `${card.name} Lv${level}：回復状態の同コストは破壊されない`,
    )
}

console.log("--- ステップ誘発：相手のアタックステップに働くもの ---")
{
    // 鋼に覆われた高空Lv1：『相手のアタックステップ』効果を持たないスピリット1体を回復させる
    const card = byId("BS03-108")
    assert(card.name === "鋼に覆われた高空", "前提: BS03-108 は鋼に覆われた高空")
    const entry = entryOf(card, "e1")
    const level = (entry["levels"] as number[])[0]!
    const vanilla = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!
    const s = base("bs03-108")
    s.turnPlayer = "p2" // 『相手のアタックステップ』
    s.phase = "attack"
    putNexus(s, "p1", card, coresFor(card, level))
    const tired = put(s, "p1", vanilla, coresFor(vanilla, 1))
    tired.isRested = true
    refreshLevelAsOverrides(s)
    fireStepTriggers(s, "attack")
    assert(!tired.isRested, `${card.name} Lv${level}：相手のアタックステップに、効果を持たない自分のスピリットが回復する`)
}

console.log("--- 効果でコアが置かれるとき、その数が増える ---")
{
    // セブンスポットLv2：このスピリット上に効果でコアが置かれるとき、その数を+1する
    // （コアステップで得られるコアの話ではない）
    const card = byId("BS04-028")
    assert(card.name === "セブンスポット", "前提: BS04-028 はセブンスポット")
    const entry = entryOf(card, "e2")
    const level = (entry["levels"] as number[])[0]!
    const amount = Number(entry["amount"])

    // 比較用：ボーナスを持たない駒に同じ数を置く
    const plain = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!
    const s = base("bs04-028")
    const bonusInst = put(s, "p1", card, coresFor(card, level))
    const plainInst = put(s, "p1", plain, coresFor(plain, 1))
    refreshLevelAsOverrides(s)
    const bonusBefore = bonusInst.cores
    const plainBefore = plainInst.cores

    placeCoresOnSpirit(s, bonusInst, 1, "p1")
    placeCoresOnSpirit(s, plainInst, 1, "p1")
    assert(
        plainInst.cores === plainBefore + 1,
        "前提: ボーナスを持たない駒には置いた数だけ乗る",
    )
    assert(
        bonusInst.cores === bonusBefore + 1 + amount,
        `${card.name} Lv${level}：効果で置かれるコアが+${amount}される（${bonusBefore}→${bonusInst.cores}）`,
    )
}

console.log("--- 【粉砕】の破棄枚数が増える ---")
{
    for (const [id, suffix] of [["BS04-071", "e2"], ["BS04-071", "e3"], ["BS07-053", "e3"]] as const) {
        const card = byId(id)
        const entry = entryOf(card, suffix)
        const levels = entry["levels"] as number[]
        const level = levels[0]!
        const amount = Number(entry["amount"])
        // 【粉砕】を持つスピリット（ボーナスの発生源とは別に用意する）
        const funsai = CARDS.find(
            (c) =>
                c.type === "spirit" &&
                c.cardId !== card.cardId &&
                (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "funsai"),
        )!
        const s = base(`funsai-${id}-${suffix}`)
        const attacker = put(s, "p1", funsai, coresFor(funsai, topLevel(funsai)))
        refreshLevelAsOverrides(s)
        const deckBefore = s.players.p2.deck.length
        resolveFunsai(s, "p1", attacker)
        const withoutBonus = deckBefore - s.players.p2.deck.length

        const s2 = base(`funsai-${id}-${suffix}-bonus`)
        const attacker2 = put(s2, "p1", funsai, coresFor(funsai, topLevel(funsai)))
        put(s2, "p1", card, coresFor(card, level))
        refreshLevelAsOverrides(s2)
        const deckBefore2 = s2.players.p2.deck.length
        resolveFunsai(s2, "p1", attacker2)
        const withBonus = deckBefore2 - s2.players.p2.deck.length

        assert(
            withBonus === withoutBonus + amount,
            `${card.name} Lv${level}：【粉砕】の破棄枚数が+${amount}される（${withoutBonus}→${withBonus}）`,
        )
    }
}

console.log("--- マジックの使用制限 ---")
{
    // 青嵐の虚空Lv2：【転召】を持つ自分のスピリットがいるとき、コスト4以下のマジックを使えない
    const card = byId("BS05-065")
    assert(card.name === "青嵐の虚空", "前提: BS05-065 は青嵐の虚空")
    const entry = entryOf(card, "e2")
    const level = (entry["levels"] as number[])[0]!
    const maxCost = Number(entry["maxCost"])
    const needKw = String(entry["requireOwnKeyword"])
    const magic = CARDS.find((c) => c.type === "magic" && (c.cost ?? 99) <= maxCost)!
    const tensho = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === needKw),
    )!
    const s = base("bs05-065")
    s.phase = String(entry["phase"]) as GameState["phase"]
    putNexus(s, "p1", card, coresFor(card, level))
    refreshLevelAsOverrides(s)
    assert(!hasMagicCostLock(s, getCard(magic.cardId)), `${card.name}：【${needKw}】持ちがいなければ制限は働かない`)
    put(s, "p1", tensho, coresFor(tensho, 1))
    refreshLevelAsOverrides(s)
    assert(
        hasMagicCostLock(s, getCard(magic.cardId)),
        `${card.name} Lv${level}：【${needKw}】持ちがいるとコスト${maxCost}以下のマジックが使えない`,
    )
}
{
    // 開かれし魔導書Lv2：『自分のアタックステップ』相手はリザーブからしかコストを払えない
    const card = byId("BS06-086")
    assert(card.name === "開かれし魔導書", "前提: BS06-086 は開かれし魔導書")
    const entry = entryOf(card, "e2")
    const level = (entry["levels"] as number[])[0]!
    const s = base("bs06-086")
    s.phase = String(entry["phase"]) as GameState["phase"]
    s.turnPlayer = "p1" // 『自分のターン』
    assert(!hasMagicRestriction(s, "p2", "reserveOnlyOpponent"), "前提: 置く前は制限が働かない")
    putNexus(s, "p1", card, coresFor(card, level))
    refreshLevelAsOverrides(s)
    assert(
        hasMagicRestriction(s, "p2", "reserveOnlyOpponent"),
        `${card.name} Lv${level}：相手はリザーブからしか支払えなくなる`,
    )
}

console.log("--- バトル勝利誘発（マジックが貸すもの） ---")
{
    const card = byId("BS09-074")
    assert(card.name === "フォレストチャージ", "前提: BS09-074 はフォレストチャージ")
    const entry = entryOf(card, "e2")
    const fams = entry["winnerFamilyFilter"] as string[]
    const winnerCard = CARDS.find((c) => c.type === "spirit" && fams.some((f) => (c.family ?? []).includes(f)))!
    const s = base("bs09-074")
    const winner = put(s, "p1", winnerCard, coresFor(winnerCard, topLevel(winnerCard)))
    winner.isRested = true
    refreshLevelAsOverrides(s)
    fireBattleWonTriggers(s, "p1", winner, "attacker")
    assert(winner.isRested, "前提: マジックを使う前は回復しない")

    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined,
        (card.colors ?? ["green"]) as Color[], "magic", undefined, undefined, card.cardId)
    refreshLevelAsOverrides(s)
    fireBattleWonTriggers(s, "p1", winner, "attacker")
    assert(!winner.isRested, `${card.name}：系統が合う自分のスピリットがバトルに勝つと回復する`)
}
