// smoke パート176（「相手は、〜する」の選択者を相手に移す3枚）
//
// docs/design/CHOOSER_RULES.md を書いて22枚を機械的に照合したときに出た残り3枚。
// 効果文の主語が「相手は」なのに、どれを破壊するか／どのスピリットからコアを置くかを
// 発生源の持ち主側が自動選択していた。うち2枚は**相手にとって最も痛い選択**を自動でしており、
// 印刷されたカードより強い状態だった（ブリシンガメン・ダークスカルデーモンと同じ穴）。
//
//   BS08-069 ジャッジメントフレア    実効BP最大から破壊 → 相手が1体ずつ選ぶ
//   BS08-072 マインドブレイク        コア最多から5個    → 前半は支払う本人、後半は相手が選ぶ
//   BS04-114 タイダルタイド          実効BP最小から破壊 → 相手が1体ずつ選ぶ（ほぼ等価だが選択は本人へ）
import { act, assert, createGame, createInstance, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    effects?: Record<string, unknown>[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
// カードデータとアクションの結び付きが切れていないことを確かめる（ID直書きの保険）
function usesAction(cardId: string, actionType: string): boolean {
    const card = CARDS.find((c) => c.cardId === cardId)
    const walk = (o: unknown): boolean => {
        if (Array.isArray(o)) return o.some(walk)
        if (o !== null && typeof o === "object") {
            const rec = o as Record<string, unknown>
            if (rec["type"] === actionType) return true
            return Object.values(rec).some(walk)
        }
        return false
    }
    return walk(card?.effects ?? [])
}

function base(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}
const alive = (s: GameState, pid: PlayerId, id: string): boolean =>
    s.players[pid].field.spirits.some((x) => x.instanceId === id)

console.log("=== ジャッジメントフレア：破壊する1体は相手が選ぶ ===")
{
    assert(usesAction("BS08-069", "destroyDownToOwnCount"), "BS08-069 が destroyDownToOwnCount を使っている")

    const s = base("judgment-chooser", true)
    put(s, "p1", "BS01-003", 1) // 自分1体 → 相手は1体になるまで破壊される
    const strong = put(s, "p2", "BS01-020", 1) // 翼刃竜スティラノドン（BP高）
    const weakA = put(s, "p2", "BS01-003", 1)
    const weakB = put(s, "p2", "BS01-002", 1)

    resolveAction(s, "p1", null, { type: "destroyDownToOwnCount" })
    assert(s.pendingChoice?.pid === "p2", "選ぶのは破壊される側（p2）")
    assert(s.pendingChoice?.actorPid === "p1", "解決は発生源の持ち主（p1）の効果として行う")
    assert(s.pendingChoice?.candidates.length === 3, "相手のスピリット3体が候補")

    // 相手は自分にとって損の小さい2体を差し出し、強い1体を残せる
    assert(act(s, "p2", { type: "resolveChoice", instanceId: weakA }) === null, "1体目を相手が選ぶ")
    assert(s.pendingChoice?.pid === "p2", "残りぶんも相手が選ぶ")
    assert(act(s, "p2", { type: "resolveChoice", instanceId: weakB }) === null, "2体目を相手が選ぶ")
    assert(s.pendingChoice === null, "自分と同数になったので選択が終わる")
    assert(alive(s, "p2", strong), "強いスピリットを残せる（以前は実効BP最大から自動で壊されていた）")
    assert(s.players.p2.field.spirits.length === 1, "相手は自分と同じ1体になる")
}

console.log("=== ジャッジメントフレア：発生源の持ち主は選べない ===")
{
    const s = base("judgment-not-owner", true)
    put(s, "p1", "BS01-003", 1)
    put(s, "p2", "BS01-020", 1)
    put(s, "p2", "BS01-003", 1)
    put(s, "p2", "BS01-002", 1)
    resolveAction(s, "p1", null, { type: "destroyDownToOwnCount" })
    const pick = s.pendingChoice?.candidates[0] ?? ""
    assert(act(s, "p1", { type: "resolveChoice", instanceId: pick }) !== null, "p1が選ぼうとしても拒否される")
}

console.log("=== ジャッジメントフレア：非対話では相手が差し出すであろうBP最小から ===")
{
    const s = base("judgment-auto", false)
    put(s, "p1", "BS01-003", 1)
    const strong = put(s, "p2", "BS01-020", 1)
    const weak = put(s, "p2", "BS01-002", 1)
    resolveAction(s, "p1", null, { type: "destroyDownToOwnCount" })
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(alive(s, "p2", strong), "実効BP最大は残る")
    assert(!alive(s, "p2", weak), "実効BP最小が破壊される")
}

console.log("=== タイダルタイド：破壊する相手スピリットは相手が選ぶ ===")
{
    assert(
        usesAction("BS04-114", "sacrificeOwnNexusesThenEnemyDestroysOwn"),
        "BS04-114 が sacrificeOwnNexusesThenEnemyDestroysOwn を使っている",
    )

    const s = base("tidal-chooser", true)
    s.players.p1.field.nexuses.push(createInstance("BS06-080", s.turn, 0))
    s.players.p1.field.nexuses.push(createInstance("BS06-080", s.turn, 0))
    const keep = put(s, "p2", "BS01-020", 1)
    const giveA = put(s, "p2", "BS01-003", 1)
    const giveB = put(s, "p2", "BS01-002", 1)

    resolveAction(s, "p1", null, { type: "sacrificeOwnNexusesThenEnemyDestroysOwn" })
    assert(s.players.p1.field.nexuses.length === 0, "自分のネクサスはすべて破壊される")
    assert(s.pendingChoice?.pid === "p2", "破壊する1体を選ぶのは相手")
    assert(s.pendingChoice?.actorPid === "p1", "解決は発生源の持ち主の効果として行う")

    assert(act(s, "p2", { type: "resolveChoice", instanceId: giveA }) === null, "1体目を相手が選ぶ")
    assert(s.pendingChoice?.pid === "p2", "ネクサス2つぶんなので、もう1体選ばせる")
    assert(act(s, "p2", { type: "resolveChoice", instanceId: giveB }) === null, "2体目を相手が選ぶ")
    assert(s.pendingChoice === null, "2体で終わる（破壊したネクサス数と同じ）")
    assert(alive(s, "p2", keep), "残す1体は相手が決められる")
}

console.log("=== マインドブレイク：前半は支払う本人、後半は相手が選ぶ ===")
{
    assert(
        usesAction("BS08-072", "costOwnSpiritCoresToTrashThenOpponent"),
        "BS08-072 が costOwnSpiritCoresToTrashThenOpponent を使っている",
    )

    const s = base("mindbreak-chooser", true)
    const mine = put(s, "p1", "BS01-020", 3)
    put(s, "p1", "BS01-003", 3)
    const theirs = put(s, "p2", "BS01-020", 3)
    put(s, "p2", "BS01-003", 3)

    resolveAction(s, "p1", null, { type: "costOwnSpiritCoresToTrashThenOpponent", count: 2 })
    // 前半：コストなので支払う本人（p1）が選ぶ
    assert(s.pendingChoice?.pid === "p1", "前半（コストの支払い）は自分が選ぶ")
    assert(s.pendingChoice?.actorPid === undefined, "自分の効果なので actorPid は入らない")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: mine }) === null, "自分のコア1個目")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: mine }) === null, "自分のコア2個目")

    // 後半：効果文が「相手は」なので相手が選ぶ
    assert(s.pendingChoice?.pid === "p2", "後半は相手が選ぶ")
    assert(s.pendingChoice?.actorPid === "p1", "解決は発生源の持ち主の効果として行う")
    assert(act(s, "p2", { type: "resolveChoice", instanceId: theirs }) === null, "相手のコア1個目")
    assert(act(s, "p2", { type: "resolveChoice", instanceId: theirs }) === null, "相手のコア2個目")

    assert(s.pendingChoice === null, "両者2個ずつで終わる")
    assert(s.players.p1.trashCores === 2, "自分のトラッシュにコア2個")
    assert(s.players.p2.trashCores === 2, "相手のトラッシュにコア2個")
    assert(
        s.players.p2.field.spirits.find((x) => x.instanceId === theirs)?.cores === 1,
        "相手は自分で選んだスピリットからコアを出す",
    )
}

console.log("=== マインドブレイク：自分のコアが足りなければ発揮できない ===")
{
    const s = base("mindbreak-cannot-pay", true)
    put(s, "p1", "BS01-003", 1)
    put(s, "p2", "BS01-020", 3)
    const oppTrashBefore = s.players.p2.trashCores
    resolveAction(s, "p1", null, { type: "costOwnSpiritCoresToTrashThenOpponent", count: 5 })
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(s.players.p1.trashCores === 0, "自分のコアは減らない")
    assert(s.players.p2.trashCores === oppTrashBefore, "相手のコアも減らない")
}
