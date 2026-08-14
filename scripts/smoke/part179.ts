// smoke パート179（【転召】の途中で誘発が選択待ちを立てたとき、対象の消滅がその選択の後まで待つか）
//
// 背景（2026-08-13）：中断ガード（BS_DEBUG_CHECKS=1）が実バグを検出した。
// dumpAllCoresTensho は『転召の対象になったとき』『転召が解決したとき』の誘発を呼んだあと、
// **中断したかを見ずに**コアを捨てて維持コア割れの破壊まで進んでいた。
// 呼び出し元の doSummon は resolveTensho の後にきちんと pendingChoice を見ているのに、
// その内側が見ていない＝「割り込まれる側が対応していない」形。
//
// 【転召】の手順（2026-08-13 ユーザー確認）:
//   コストの支払い → 転召（コアを外す＋対象スピリットの効果発揮）→ 対象スピリットの消滅 → 召喚時効果
// **消滅は効果の発揮が解決しきってから**でなければならない。
// 選択待ちのまま destroySpirit が走ると、その先の『破壊されたとき』の誘発が中断できなくなる。
//
// 対象カードは part144 と同じ「【転召】が解決したとき、相手の手札からスピリットを破棄させる」もの
// （BS08関将龍皇ドラグロン）。相手の手札に候補が2枚以上あると破棄がカード選択になり中断する。
import {
    act,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    family?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function coresFor(c: CardRow, level: number): number {
    return c.levels?.[level - 1]?.cores ?? 1
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== パート179：【転召】中に誘発が中断したら、対象の消滅は選択の後 ===")

{
    const dragron = CARDS.find((c) =>
        (c.effects ?? []).some((e) => e["kind"] === "fieldEvent" && e["event"] === "ownTensho"),
    )!
    const entry = (dragron.effects ?? []).find(
        (e) => e["kind"] === "fieldEvent" && e["event"] === "ownTensho",
    )!
    const family = String(entry["familyFilter"])
    const tenshoEntry = (dragron.effects ?? []).find(
        (e) => e["kind"] === "keyword" && e["keyword"] === "tensho",
    )!
    const minCost = Number(tenshoEntry["minCost"] ?? 0)

    // 【転召】の対象になれる（系統一致・コスト条件を満たす）犠牲スピリット
    const sacrifice = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            c.cardId !== dragron.cardId &&
            (c.family ?? []).includes(family) &&
            (c.cost ?? 0) >= minCost,
    )!

    const s = createGame("tensho-interrupt", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 40
    s.players.p2.reserve = 40
    // 実対戦と同じく選択を出す設定にする（既定の false のままだと中断そのものが起きない）
    s.interactiveTargets = true

    s.players.p1.hand = [dragron.cardId]
    const victim = put(s, "p1", sacrifice.cardId, coresFor(sacrifice, 1))

    // 相手の手札にスピリットを2枚置く → 破棄が「どれを捨てるか」の選択になり、そこで中断する
    const oppSpirits = CARDS.filter((c) => c.type === "spirit").slice(0, 2)
    s.players.p2.hand = oppSpirits.map((c) => c.cardId)

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, `${dragron.name}を召喚（【転召】の犠牲は${sacrifice.name}）`)

    // ここが本題：誘発（相手の手札破棄）の選択待ちが立っており、
    // **その時点では犠牲スピリットはまだ場に残っていて消滅していない**
    assert(s.pendingChoice !== null, "『転召が解決したとき』の誘発で選択待ちが立つ")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === victim.instanceId),
        "選択待ちの間、転召の対象はまだ場に残っている（消滅は誘発の解決後）",
    )
    assert(victim.cores > 0, "選択待ちの間、転召の対象のコアはまだ外されていない")

    // 選択に応答すると、そこで初めてコアが外れて維持コア割れで消滅する
    const chosen = s.pendingChoice?.cardIndices?.[0] ?? -1
    assert(chosen >= 0, "選択待ちは相手の手札からのカード選択")
    assert(act(s, "p2", { type: "resolveChoice", cardIndex: chosen }) === null, "相手が破棄するカードを選ぶ")

    assert(s.pendingChoice === null, "選択の解決後、選択待ちは残らない")
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === victim.instanceId),
        "選択の解決後、転召の対象が維持コア割れで消滅している",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === dragron.cardId),
        "召喚した本体は場に残っている",
    )
}

console.log("=== destroySpirit は「実際に破壊できたか」を返す ===")
{
    // ルール（CONJUNCTION.md／RESUME_STACK.md §7 ①）：
    // 別の効果として「破壊したとき〜する」がある場合、先に「フィールドに残る」を解決することで
    // それを阻止できる。＝**復活して場に残った個体は「破壊された」ことにならない**。
    // BS08ドラゴンスクランブル／X003D極帝龍騎ジーク・クリムゾンの
    // 「この効果で破壊したスピリット1体につき」も同じで、場に残った個体は数に入らない。
    // 以前は targets.length（＝破壊しようとした数）で数えており、数える手段そのものが無かった。
    const plain = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
    )!
    const s = createGame("destroy-returns", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    const victim = put(s, "p2", plain.cardId, coresFor(plain, 1))

    assert(
        destroySpirit(s, "p2", victim.instanceId, "destroy") === true,
        "実際に破壊できたら true を返す",
    )
    assert(
        destroySpirit(s, "p2", victim.instanceId, "destroy") === false,
        "すでに場にいない個体は false を返す（破壊していないので数に入らない）",
    )
}

console.log("=== 「この効果で破壊した1体につき」の枚数は、破壊できた数と一致する ===")
{
    const plain = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
    )!
    const s = createGame("destroyed-count", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 40
    s.players.p2.reserve = 40
    put(s, "p2", plain.cardId, coresFor(plain, 1))
    put(s, "p2", plain.cardId, coresFor(plain, 1))
    const handBefore = s.players.p1.hand.length
    const oppBefore = s.players.p2.field.spirits.length

    resolveAction(s, "p1", null, { type: "destroyAll", anySide: false, drawPerDestroyed: true })

    const actuallyDestroyed = oppBefore - s.players.p2.field.spirits.length
    const drawn = s.players.p1.hand.length - handBefore
    assert(actuallyDestroyed === 2, "対象2体が破壊された")
    assert(drawn === actuallyDestroyed, `ドロー枚数（${drawn}）が破壊できた体数（${actuallyDestroyed}）と一致する`)
}
