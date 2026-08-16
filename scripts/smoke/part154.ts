// smoke パート154（範囲コア奪取が耐性・保護を尊重する）
//
// 「1体ずつ選んで取る」効果（coreRemove 等）は候補選び（pickEnemy*）が装甲・免疫を弾いてくれるが、
// 「範囲でまとめて奪う」効果は候補を自前で走査するため **【装甲】もバトル中のコア保護も
// コア下限も素通り**していた（2026-08-10 修正）。共通ヘルパー
// removeCores / removeCoresToTrash / removeCoresToVoid 経由に寄せ、
// 手前に canTakeCoresFrom（returnAllToHand と同じ判定軸）を置いた。
//
// これで BS05茨の決戦地Lv1（バトル中のコアは取り除けない）も範囲効果に効くようになる。
import { assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    colors?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function findByEffect(pred: (e: Record<string, unknown>, c: CardRow) => boolean): CardRow {
    const found = CARDS.find((c) => (c.effects ?? []).some((e) => pred(e, c)))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}
function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// 十分なコアを載せられる、効果を持たないスピリット
const FILLER = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!

console.log("=== 範囲のコア圧搾（coreSqueezeAll）は【装甲】を尊重する ===")
{
    // 赤の発生源に対する【装甲：赤】持ちを選ぶ
    const armored = CARDS.find((c) =>
        (c.effects ?? []).some(
            (e) =>
                e["kind"] === "keyword" &&
                e["keyword"] === "armor" &&
                ((e["colors"] as string[] | undefined) ?? []).includes("red") &&
                (((e["levels"] as number[] | null) ?? [1])[0] === 1),
        ),
    )!
    const s = base("squeeze-armor")
    const guarded = put(s, "p2", armored.cardId, 4)
    const plain = put(s, "p2", FILLER.cardId, 4)
    resolveAction(s, "p1", null, { type: "coreSqueezeAll" }, undefined, ["red"] as never, "magic")
    assert(guarded.cores === 4, `【装甲：赤】を持つ${armored.name}はコアを取られない`)
    assert(plain.cores === 1, `装甲を持たない${FILLER.name}はコア1個だけ残る（実際: ${String(plain.cores)}個）`)
}

console.log("=== BS05茨の決戦地Lv1：バトル中のスピリットのコアは範囲効果でも取り除けない ===")
{
    const thorn = findByEffect(
        (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "battlingCoresProtected",
    )
    const entry = (thorn.effects ?? []).find(
        (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "battlingCoresProtected",
    )!
    const level = (entry["levels"] as number[])[0]!
    const phaseTurn = { phase: String(entry["phase"]), turn: String(entry["turn"]) }

    const s = base("thorn-range")
    // 発生源は p1（turn:"own" なので p1 がターンプレイヤーである必要がある）
    putNexus(s, "p1", thorn.cardId, thorn.levels?.[level - 1]?.cores ?? 0)
    const battling = put(s, "p2", FILLER.cardId, 4)
    const bench = put(s, "p2", FILLER.cardId, 4)
    s.phase = phaseTurn.phase as GameState["phase"]
    s.turnPlayer = "p1"
    // バトル中の状態を作る（battling がブロッカー）
    const attacker = put(s, "p1", FILLER.cardId, 1)
    s.battle = {
        attackerInstanceId: attacker.instanceId,
        blockerInstanceId: battling.instanceId,
        flashLockedPlayer: null,
        directed: false,
    }
    resolveAction(s, "p1", null, { type: "coreSqueezeAll" }, undefined, ["red"] as never, "magic")
    assert(battling.cores === 4, "バトル中のスピリットはコアを取り除かれない")
    assert(bench.cores === 1, "バトルしていないスピリットは通常どおり取り除かれる")
}

console.log("=== 相手のコアをトラッシュへ送る範囲効果（氷の女神フリッグ）も同様 ===")
{
    const frigg = findByEffect((e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "opponentCoresToTrash")
    const action = (frigg.effects ?? []).find(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "opponentCoresToTrash",
    )!["action"] as Record<string, unknown>
    const armored = CARDS.find((c) =>
        (c.effects ?? []).some(
            (e) =>
                e["kind"] === "keyword" &&
                e["keyword"] === "armor" &&
                ((e["colors"] as string[] | undefined) ?? []).includes("red") &&
                (((e["levels"] as number[] | null) ?? [1])[0] === 1),
        ),
    )!

    const s = base("frigg-armor")
    s.players.p2.reserve = 0 // リザーブから取られると盤面に届かないので空にする
    const guarded = put(s, "p2", armored.cardId, 5)
    const trashBefore = s.players.p2.trashCores
    resolveAction(s, "p1", null, action as never, undefined, ["red"] as never, "magic")
    assert(guarded.cores === 5, `【装甲：赤】を持つ${armored.name}からはコアを取れない`)
    assert(s.players.p2.trashCores === trashBefore, "トラッシュにも移っていない")

    // 対照：装甲を持たなければ取られる
    const s2 = base("frigg-plain")
    s2.players.p2.reserve = 0
    const plain = put(s2, "p2", FILLER.cardId, 5)
    resolveAction(s2, "p1", null, action as never, undefined, ["red"] as never, "magic")
    assert(plain.cores < 5, `装甲が無ければコアを取られる（残り${String(plain.cores)}個）`)
}
