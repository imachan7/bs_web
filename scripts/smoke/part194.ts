// smoke パート194（戻す待機：まとめて戻す効果は、全員を待機にしてから誘発を解決し、その後で移す）
//
// 待機状態のルール改訂（docs/design/PENDING_STATE.md §3。2026-11-15 ユーザー確認の C3・C4）:
//   手札／デッキに戻す効果を受けたスピリットは、戻す待機になって場に残る。「手札に戻るとき／戻ったとき」の効果を
//   1本の列で解決し、その後で移す（破壊の待機と違うのは行き先だけ）。
//   戻す待機のスピリットが、その待機で誘発した効果で破壊されたら、破壊の待機に変わり、トラッシュへ行く。
//
// ここでは「コスト◯以下のスピリットすべてを手札に戻す」と「地竜が手札に戻ったとき、BP3000以下の相手1体を破壊する」
// （紅玉の火山弾）を組み合わせて、**同時に戻す待機に入った相手のスピリットが、火山弾で破壊されてトラッシュへ行く**ことを確かめる。
// 2026-11-15 までは改訂前の裁定（先に全員を移してから誘発。相手は破壊されず手札に戻る）を期待値にしていた
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    family?: string[]
    effects?: Record<string, unknown>[]
    levels?: { cores: number; bp: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const maxCores = (c: CardRow): number => (c.levels ?? []).reduce((m, lv) => Math.max(m, lv.cores), 1)

// 「自分のスピリットが手札に戻ったとき」に相手を破壊するネクサス（紅玉の火山弾）
const VOLCANO = CARDS.find((c) =>
    (c.effects ?? []).some(
        (e) =>
            e["kind"] === "fieldEvent" &&
            e["event"] === "ownSpiritReturnedToHand" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "destroy",
    ),
)
// 「コスト◯以下のスピリットすべてを持ち主の手札に戻す」マジック（ドリームハンド）
const SWEEP = CARDS.find((c) =>
    (c.effects ?? []).some((e) => {
        const a = e["action"] as Record<string, unknown> | undefined
        return a?.["type"] === "return" && a["to"] === "hand" && a["all"] === true && a["anySide"] === true && (a["filter"] as Record<string, unknown> | undefined)?.["cost"] !== undefined
    }),
)
if (!VOLCANO || !SWEEP) throw new Error("検証用のカード（手札戻し誘発ネクサス／まとめ戻しマジック）が見つかりません")

const SWEEP_ENTRY = (SWEEP.effects ?? []).find(
    (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "return" && (e["action"] as Record<string, unknown>)["to"] === "hand" && (e["action"] as Record<string, unknown>)["all"] === true,
)!
const SWEEP_MAX_COST = Number(
    (((SWEEP_ENTRY["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>)["cost"] as Record<string, unknown>)["max"],
)
const VOLCANO_ENTRY = (VOLCANO.effects ?? []).find((e) => e["event"] === "ownSpiritReturnedToHand")!
const VOLCANO_FAMILY = String((VOLCANO_ENTRY["subjectFilter"] as Record<string, unknown>)["family"])
const VOLCANO_MAX_BP = Number(
    ((VOLCANO_ENTRY["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>)["maxBp"],
)

console.log(`=== パート194：まとめ戻しは、全員を待機にして誘発を解決してから移す（${SWEEP.name} × ${VOLCANO.name}）===`)

// 誘発の条件になる系統を持ち、まとめ戻しの対象になる（コストが上限以下の）スピリット
const OWN = CARDS.find(
    (c) =>
        c.type === "spirit" &&
        (c.family ?? []).includes(VOLCANO_FAMILY) &&
        (c.cost ?? 99) <= SWEEP_MAX_COST,
)
// まとめ戻しの対象になり、かつ火山弾の破壊対象（BP上限以下）にもなる相手のスピリット
const OPP = CARDS.find(
    (c) =>
        c.type === "spirit" &&
        (c.cost ?? 99) <= SWEEP_MAX_COST &&
        (c.levels?.[0]?.bp ?? 99999) <= VOLCANO_MAX_BP,
)
if (!OWN || !OPP) throw new Error("検証用のスピリットが見つかりません")

function put(s: GameState, pid: PlayerId, card: CardRow): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, 1)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

{
    const s = createGame("part194", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30

    const nexus = createInstance(VOLCANO.cardId, s.turn, maxCores(VOLCANO))
    s.players.p1.field.nexuses.push(nexus)
    // 自分：誘発の条件になる系統を2体（＝誘発は2回起きる）
    put(s, "p1", OWN)
    put(s, "p1", OWN)
    // 相手：まとめ戻しの対象であり、火山弾の破壊対象にもなる2体
    const opp1 = put(s, "p2", OPP)
    const opp2 = put(s, "p2", OPP)
    refreshLevelAsOverrides(s)

    const oppTrashBefore = s.players.p2.trashCards.length
    const oppHandBefore = s.players.p2.hand.length

    s.players.p1.hand[0] = SWEEP.cardId
    const ownInHandBefore = s.players.p1.hand.filter((c) => c === OWN.cardId).length
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, `${SWEEP.name}を使用`)

    assert(s.players.p1.field.spirits.length === 0 && s.players.p1.hand.filter((c) => c === OWN.cardId).length === ownInHandBefore + 2, "自分のスピリット2体は手札に戻る")
    assert(s.players.p2.field.spirits.length === 0, "相手のスピリットも場に残らない")
    // 火山弾は、戻るスピリット1体につき1回誘発する（2回）。同時に戻す待機に入った相手のスピリットを対象に取れ、
    // 破壊されたスピリットは破壊の待機に変わってトラッシュへ行く（手札には戻らない）
    assert(
        s.players.p2.trashCards.length === oppTrashBefore + 2 && [opp1, opp2].every((x) => s.players.p2.trashCards.includes(x.cardId)),
        `相手の2体は火山弾で破壊されてトラッシュへ行く（トラッシュ ${oppTrashBefore}→${s.players.p2.trashCards.length}）`,
    )
    assert(
        s.players.p2.hand.length === oppHandBefore,
        `破壊された相手のスピリットは手札に戻らない（手札 ${oppHandBefore}→${s.players.p2.hand.length}）`,
    )
    assert([opp1, opp2].every((x) => x.waiting === undefined), "待機の印は残らない")
}
