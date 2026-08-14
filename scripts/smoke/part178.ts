// smoke パート178（「Aすることで、Bする」で B が成立しないならコストを払わない。COST_MODEL.md §1）
//
// 「A することで、B する」は **A と B の両方が完全に解決できる場合にだけ発揮できる**
// 任意発揮の効果（2026-08-13 ユーザー確定）。
// それまでは7アクション中5つが「先に払ってから対象を探す」形で、対象がいないときに払い損していた。
//
//   BS07-X26 剣王獣ビャク・ガロウLv2  戻せる相手がいなくてもコアを失う
//   BS07-015 ブリュナグオン            トラッシュに戻せるカードが無くても自分のスピリットが死ぬ
//   BS02-098 キャストオフ              召喚できる手札が無くても自分のスピリットが死ぬ
//   BS06-111 リクラメーション          同上（自分のネクサスが壊れる）
//   BS04-X15 カイザーアトラス皇帝      減らせるライフが無くてもコアを失う
//   BS02-073 皇帝アンプルール          相手にネクサスが無くてもコアを失う
//
// 体数のしきい値は「候補1体以上」。「2体戻す」で1体しかいないときに発揮できるかは保留中
// （COST_MODEL.md §1 の保留節。現状は1体だけ戻してコストも払う）。
import { assert, createGame, createInstance, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    family?: string[]
    colors?: string[]
    effects?: Record<string, unknown>[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const hasJugeki = (c: CardRow): boolean =>
    (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "jugeki")

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.spirits = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 10
    return s
}

console.log("=== ビャク・ガロウ：手札に戻せる相手がいなければコアを払わない ===")
{
    const s = base("byakugarou-no-target")
    const before = s.players.p1.reserve
    // 相手のフィールドは空
    resolveAction(s, "p1", null, {
        type: "returnToHand",
        count: 2,
        costReserveToTrash: 1,
        filter: { keywordExclude: "tensho" },
    })
    assert(s.players.p1.reserve === before, "リザーブのコアが減らない")
    assert(s.players.p1.trashCores === 0, "トラッシュにも増えない")

    // 対象がいれば従来どおり払って戻す
    const s2 = base("byakugarou-with-target")
    s2.players.p2.field.spirits.push(createInstance("BS01-003", s2.turn, 1))
    const before2 = s2.players.p1.reserve
    resolveAction(s2, "p1", null, {
        type: "returnToHand",
        count: 2,
        costReserveToTrash: 1,
        filter: { keywordExclude: "tensho" },
    })
    assert(s2.players.p1.reserve === before2 - 1, "対象がいればコアを払う")
    assert(s2.players.p2.field.spirits.length === 0, "相手のスピリットが手札に戻る")
}

console.log("=== ブリュナグオン：トラッシュに戻せるカードが無ければ自分のスピリットを壊さない ===")
{
    const jugeki = CARDS.find((c) => c.type === "spirit" && hasJugeki(c))!
    const s = base("bryunaguon-no-recover")
    s.players.p1.field.spirits.push(createInstance(jugeki.cardId, s.turn, 3))
    s.players.p1.trashCards = [] // 戻せるカードが無い
    resolveAction(s, "p1", null, {
        type: "recoverSpiritFromTrash",
        count: 1,
        familyFilter: ["虚神", "神将"],
        costDestroyOwnKeyword: "jugeki",
    })
    assert(s.players.p1.field.spirits.length === 1, "自分のスピリットは破壊されない")
}

console.log("=== キャストオフ：召喚できる手札が無ければ自分のスピリットを壊さない ===")
{
    const kaichu = CARDS.filter((c) => c.type === "spirit" && (c.family ?? []).includes("怪虫"))
    const s = base("castoff-no-summonable")
    s.players.p1.field.spirits.push(createInstance(kaichu[0]!.cardId, s.turn, 3))
    s.players.p1.hand = [] // 召喚できるカードが無い
    resolveAction(s, "p1", null, { type: "summonFromHandFree", costFilter: 5, costDestroyOwnFamily: "怪虫" })
    assert(s.players.p1.field.spirits.length === 1, "自分のスピリットは破壊されない")
}

console.log("=== リクラメーション：召喚できる手札が無ければ自分のネクサスを壊さない ===")
{
    const s = base("reclamation-no-summonable")
    s.players.p1.field.nexuses.push(createInstance("BS06-080", s.turn, 0))
    s.players.p1.hand = []
    resolveAction(s, "p1", null, {
        type: "summonFromHandFree",
        colorFilter: "blue",
        costFilter: { max: 4 },
        costDestroyOwnNexus: true,
    })
    assert(s.players.p1.field.nexuses.length === 1, "自分のネクサスは破壊されない")
}

console.log("=== カイザーアトラス皇帝：減らせるライフが無ければコアを払わない ===")
{
    const s = base("kaiser-no-life")
    s.players.p2.life = 0
    const before = s.players.p1.reserve
    resolveAction(s, "p1", null, { type: "lifeCrush", count: 2, costReserveToVoid: 1 })
    assert(s.players.p1.reserve === before, "リザーブのコアが減らない")

    const s2 = base("kaiser-with-life")
    s2.players.p2.life = 3
    const before2 = s2.players.p1.reserve
    resolveAction(s2, "p1", null, { type: "lifeCrush", count: 2, costReserveToVoid: 1 })
    assert(s2.players.p1.reserve === before2 - 1, "ライフがあればコアを払う")
    assert(s2.players.p2.life === 1, "相手のライフが2つ減る")
}

console.log("=== 皇帝アンプルール：相手のネクサスが無ければコアを払わない ===")
{
    const s = base("emperor-no-nexus")
    const before = s.players.p1.reserve
    resolveAction(s, "p1", null, { type: "levelOverrideOpponentNexuses", level: 1, costReserveToVoid: 1 })
    assert(s.players.p1.reserve === before, "リザーブのコアが減らない")

    const s2 = base("emperor-with-nexus")
    s2.players.p2.field.nexuses.push(createInstance("BS06-080", s2.turn, 0))
    const before2 = s2.players.p1.reserve
    resolveAction(s2, "p1", null, { type: "levelOverrideOpponentNexuses", level: 1, costReserveToVoid: 1 })
    assert(s2.players.p1.reserve === before2 - 1, "相手のネクサスがあればコアを払う")
    assert(s2.players.p2.field.nexuses[0]?.levelOverrideThisTurn === 1, "相手のネクサスがLv1として扱われる")
}

console.log("=== 保留中：体数が足りなくても発揮できる（現状の挙動を固定） ===")
{
    // 「2体戻す」で相手が1体しかいないとき。いまは1体だけ戻してコストも払う。
    // 「2体いなければ発揮できない」へ切り替えるかは保留（COST_MODEL.md §1 の保留節）
    const s = base("byakugarou-shortfall")
    s.players.p2.field.spirits.push(createInstance("BS01-003", s.turn, 1))
    const before = s.players.p1.reserve
    resolveAction(s, "p1", null, {
        type: "returnToHand",
        count: 2,
        costReserveToTrash: 1,
        filter: { keywordExclude: "tensho" },
    })
    assert(s.players.p1.reserve === before - 1, "候補1体でもコストを払う（現状の挙動）")
    assert(s.players.p2.field.spirits.length === 0, "いる分（1体）だけ手札に戻る")
}
