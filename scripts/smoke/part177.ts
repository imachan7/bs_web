// smoke パート177（コストの犠牲を選ばせる4枚。COST_MODEL.md §2 の適用）
//
// 「〜することで」の任意コストで**何を犠牲にするか**は、候補が2つ以上ならプレイヤーが選ぶ
// （2026-08-13 ユーザー確定）。それまでは「実効BP最小」「コスト最小」「コア最少」などの
// 決定的な自動選択で、犠牲にしたくない個体が勝手に選ばれていた。
//
//   BS07-015 ブリュナグオン   costDestroyOwnKeyword（【呪撃】持ちを破壊）
//   BS02-098 キャストオフ     costDestroyOwnFamily（「怪虫」を破壊）
//   BS06-111 リクラメーション costDestroyOwnNexus（自分のネクサスを破壊）
//   BS07-063 秘密の花園       costExhaustFamily（「楽族」を疲労）
//
// 実装は「選ばせたら、そのコスト軸を落とした action で入り直す」形
// （exhaust の chooserIsTarget と同じ、解決済みの軸を落として再入する書き方）。
import { act, assert, createGame, createInstance, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    family?: string[]
    cost?: number
    effects?: Record<string, unknown>[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const hasJugeki = (c: CardRow): boolean =>
    (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "jugeki")
const byFamily = (family: string): CardRow[] =>
    CARDS.filter((c) => c.type === "spirit" && (c.family ?? []).includes(family))

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p1.reserve = 30
    return s
}
function put(s: GameState, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players.p1.field.spirits.push(inst)
    return inst.instanceId
}
const alive = (s: GameState, id: string): boolean =>
    s.players.p1.field.spirits.some((x) => x.instanceId === id)

console.log("=== ブリュナグオン：コストで破壊する【呪撃】持ちを選べる ===")
{
    const jugeki = CARDS.filter((c) => c.type === "spirit" && hasJugeki(c))
    assert(jugeki.length >= 2, "【呪撃】を持つスピリットが2枚以上ある")
    const recoverable = byFamily("虚神")[0] ?? byFamily("神将")[0]!

    const s = base("bryunaguon-cost-choice")
    const keep = put(s, jugeki[0]!.cardId, 3)
    const give = put(s, jugeki[1]!.cardId, 3)
    s.players.p1.trashCards = [recoverable.cardId]

    resolveAction(s, "p1", null, {
        type: "recoverSpiritFromTrash",
        count: 1,
        familyFilter: ["虚神", "神将"],
        costDestroyOwnKeyword: "jugeki",
    })
    assert(s.pendingChoice?.pid === "p1", "コストの犠牲を自分で選ぶ")
    assert(s.pendingChoice?.candidates.length === 2, "【呪撃】持ち2体が候補")

    assert(act(s, "p1", { type: "resolveChoice", instanceId: give }) === null, "犠牲を選ぶ")
    assert(!alive(s, give), "選んだほうが破壊される")
    assert(alive(s, keep), "選ばなかったほうは残る（以前は実効BP最小が勝手に選ばれた）")

    // コストを払ったあとは効果本体（トラッシュからの回収）へ進む
    while (s.pendingChoice) {
        const pc = s.pendingChoice
        assert(act(s, "p1", { type: "resolveChoice", cardIndex: pc.cardIndices?.[0] ?? 0 }) === null, "回収するカードを選ぶ")
    }
    assert(s.players.p1.hand.includes(recoverable.cardId), "コストを1回だけ払って効果が解決する")
    assert(s.players.p1.field.spirits.length === 1, "破壊されたのは1体だけ（二重払いしていない）")
}

console.log("=== キャストオフ：コストで破壊する「怪虫」を選べる ===")
{
    const kaichu = byFamily("怪虫")
    assert(kaichu.length >= 2, "「怪虫」を持つスピリットが2枚以上ある")
    const summonable = CARDS.find((c) => c.type === "spirit" && c.cost === 5)!

    const s = base("castoff-cost-choice")
    const keep = put(s, kaichu[0]!.cardId, 3)
    const give = put(s, kaichu[1]!.cardId, 3)
    s.players.p1.hand = [summonable.cardId]

    resolveAction(s, "p1", null, { type: "summonFromHandFree", costFilter: 5, costDestroyOwnFamily: "怪虫" })
    assert(s.pendingChoice?.pid === "p1", "コストの犠牲を自分で選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: give }) === null, "犠牲を選ぶ")
    assert(!alive(s, give), "選んだほうが破壊される")
    assert(alive(s, keep), "選ばなかったほうは残る")
    assert(
        s.players.p1.field.spirits.some((x) => x.cardId === summonable.cardId),
        "コストを1回だけ払って召喚まで進む",
    )
}

console.log("=== リクラメーション：コストで破壊するネクサスを選べる ===")
{
    const s = base("reclamation-cost-choice")
    const keep = createInstance("BS06-080", s.turn, 0)
    const give = createInstance("BS07-058", s.turn, 2)
    s.players.p1.field.nexuses.push(keep, give)
    const blue4 = CARDS.find(
        (c) => c.type === "spirit" && (c.cost ?? 99) <= 4 && (c as { colors?: string[] }).colors?.includes("blue"),
    )!
    s.players.p1.hand = [blue4.cardId]

    resolveAction(s, "p1", null, {
        type: "summonFromHandFree",
        colorFilter: "blue",
        costFilter: { max: 4 },
        costDestroyOwnNexus: true,
    })
    assert(s.pendingChoice?.pid === "p1", "コストの犠牲を自分で選ぶ")
    assert(s.pendingChoice?.candidates.length === 2, "自分のネクサス2つが候補")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: give.instanceId }) === null, "犠牲を選ぶ")
    assert(
        s.players.p1.field.nexuses.length === 1 && s.players.p1.field.nexuses[0]?.instanceId === keep.instanceId,
        "選んだネクサスだけが壊れる（以前はコア最少が勝手に選ばれた）",
    )
    assert(s.players.p1.field.spirits.length === 1, "召喚まで進む")
}

console.log("=== 秘密の花園：コストで疲労させる「楽族」を選べる ===")
{
    const gakuzoku = byFamily("楽族")
    assert(gakuzoku.length >= 2, "「楽族」を持つスピリットが2枚以上ある")

    const s = base("garden-cost-choice")
    const keep = put(s, gakuzoku[0]!.cardId, 3)
    const give = put(s, gakuzoku[1]!.cardId, 3)

    resolveAction(s, "p1", null, { type: "protectLifeByCostThisTurn", maxCost: 3, costExhaustFamily: "楽族" })
    assert(s.pendingChoice?.pid === "p1", "コストの犠牲を自分で選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: give }) === null, "犠牲を選ぶ")

    const rested = (id: string): boolean =>
        s.players.p1.field.spirits.find((x) => x.instanceId === id)?.isRested === true
    assert(rested(give), "選んだほうが疲労する")
    assert(!rested(keep), "選ばなかったほうは疲労しない")
    assert(
        s.turnConstraints.some((c) => c.type === "noLifeDamageByCostForPid"),
        "コストを払ったので効果（ライフ保護）が付く",
    )
}

console.log("=== 非対話（smokeの既定）では従来どおり自動で選ぶ ===")
{
    const gakuzoku = byFamily("楽族")
    const s = base("garden-auto")
    s.interactiveTargets = false
    put(s, gakuzoku[0]!.cardId, 3)
    put(s, gakuzoku[1]!.cardId, 3)
    resolveAction(s, "p1", null, { type: "protectLifeByCostThisTurn", maxCost: 3, costExhaustFamily: "楽族" })
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(s.players.p1.field.spirits.filter((x) => x.isRested).length === 1, "1体だけが自動で疲労する")
}
