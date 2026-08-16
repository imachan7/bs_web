// smoke パート194（バウンス待機状態：まとめて戻す効果は、全部戻ってから誘発する）
//
// バトスピ Wiki「バウンスについて」（2020年5月のルール改定）:
//   手札／デッキに戻す効果を解決すると、対象は一旦「バウンスの待機状態」になってフィールドに留まり、
//   「フィールドを離れるとき」「手札／デッキに戻るとき」の効果は**解決が終わってから**発揮される。
//
// つまり「コスト1以下のスピリットすべてを手札に戻す」のような**まとめ戻し**では、
// 1体目が戻った時点の誘発が2体目以降の対象を変えてはいけない。
// ここでは「地竜が手札に戻ったとき、BP3000以下の相手1体を破壊する」（紅玉の火山弾）と
// 組み合わせて、**破壊の対象になるはずだった相手も先に手札へ戻っている**ことを確かめる。
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
        return a?.["type"] === "returnAllToHand" && a["side"] === "both" && a["costFilter"] !== undefined
    }),
)
if (!VOLCANO || !SWEEP) throw new Error("検証用のカード（手札戻し誘発ネクサス／まとめ戻しマジック）が見つかりません")

const SWEEP_ENTRY = (SWEEP.effects ?? []).find(
    (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "returnAllToHand",
)!
const SWEEP_MAX_COST = Number(
    ((SWEEP_ENTRY["action"] as Record<string, unknown>)["costFilter"] as Record<string, unknown>)["max"],
)
const VOLCANO_ENTRY = (VOLCANO.effects ?? []).find((e) => e["event"] === "ownSpiritReturnedToHand")!
const VOLCANO_FAMILY = String(VOLCANO_ENTRY["familyFilter"])
const VOLCANO_MAX_BP = Number(
    ((VOLCANO_ENTRY["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>)["maxBp"],
)

console.log(`=== パート194：まとめ戻しは全部戻ってから誘発する（${SWEEP.name} × ${VOLCANO.name}）===`)

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
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, `${SWEEP.name}を使用`)

    assert(s.players.p1.field.spirits.length === 0, "自分のスピリットは全部手札に戻る")
    assert(s.players.p2.field.spirits.length === 0, "相手のスピリットも全部手札に戻る")
    // ここが本題：1体ずつ戻していた頃は、1体目が戻った時点の誘発で相手が**破壊されて**いた
    // （破壊された相手は手札に戻らずトラッシュへ行っていた）
    assert(
        s.players.p2.trashCards.length === oppTrashBefore,
        `相手のスピリットは1体も破壊されない（トラッシュ ${oppTrashBefore}→${s.players.p2.trashCards.length}）`,
    )
    assert(
        s.players.p2.hand.length === oppHandBefore + 2,
        `相手の2体は手札に戻る（手札 ${oppHandBefore}→${s.players.p2.hand.length}）`,
    )
    assert(
        ![opp1, opp2].some((x) => s.players.p2.trashCards.includes(x.cardId)),
        "破壊されてトラッシュに送られた個体がいない",
    )
}
