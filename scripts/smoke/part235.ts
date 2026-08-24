// smoke パート235（コア下限は「コアの動かし方」を問わず効く。2026-08-24 ユーザー確認）
//
// BS08-059 聖なる柱状彫刻「スピリットすべての上のコアの数はLv1コストより少なくならない」は、
// 「少なくならない」という**結果の状態を縛る書き方**なので、コアを取り除く効果だけでなく
// **移動・入れ替え**にも効く。これまでは removeCores 系（単体除去の共通処理）だけが尊重し、
// .cores を直接書き換える3種（coreSqueezeOne／moveCoresLeavingOne／swapOpponentCores）は素通りしていた。
//
// 影響するのは11枚（コブライガ／デスペラード／人狼ルー・ガウル／ボーギー／ウィークネス／
// 要塞龍ギガ／チェンジングコア／天使スローン／メタルディー・バグ／マインドコントロール／
// インフェルノアイズ）。うち bothSidesCoreToTrash/Void は既に共通処理を通っていたので、
// ここで直したのは上の3種。
//
// 入れ替え（天使スローン）は**同時に起きる1つの動き**なので、片側だけ下限で止めるとコアが増減する。
// そのため「どちらかが下限を割るなら入れ替え自体を行わない」とした。
import { assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const PILLAR = "BS08-059" // 聖なる柱状彫刻：Lv1から『お互いのアタックステップ』にコア下限

// 下限＝Lv1に必要なコア数なので、Lv1が2コア以上のスピリットでないと差が出ない
const HEAVY = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 0) >= 2,
)!

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack" // 柱状彫刻は『お互いのアタックステップ』
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
// 柱状彫刻を p1 のフィールドへ（Lv1は0コア）
function putPillar(s: GameState): void {
    s.players.p1.field.nexuses.push(createInstance(PILLAR, s.turn, 0))
    refreshLevelAsOverrides(s)
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    const pillar = CARDS.find((c) => c.cardId === PILLAR)!
    assert(pillar.name === "聖なる柱状彫刻" && pillar.type === "nexus", "BS08-059 は聖なる柱状彫刻（ネクサス）")
    assert(
        (pillar.effects ?? []).some(
            (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "coreFloorByCost",
        ),
        "コア下限（coreFloorByCost）を持つ",
    )
    assert((HEAVY.levels?.[0]?.cores ?? 0) >= 2, `検証にはLv1が2コア以上のスピリットが要る（${HEAVY.name}）`)
}

console.log("=== コア圧縮（coreSqueezeOne）：下限があるとLv1コストぶんまでしか減らない ===")
{
    const floor = HEAVY.levels?.[0]?.cores ?? 0

    // 対照：柱状彫刻が無ければ従来どおりコア1個まで減る（維持コア割れで消滅する）
    const bare = base("p235-squeeze-bare")
    const victimBare = put(bare, "p2", HEAVY.cardId, 5)
    resolveAction(bare, "p1", null, { type: "coreSqueezeOne", count: 1 }, undefined, ["red"] as never, "magic")
    assert(
        !bare.players.p2.field.spirits.some((s) => s.instanceId === victimBare.instanceId),
        "柱状彫刻が無ければコア1個まで減り、維持コア割れで消滅する",
    )

    const s = base("p235-squeeze")
    putPillar(s)
    const victim = put(s, "p2", HEAVY.cardId, 5)
    const reserveBefore = s.players.p2.reserve
    resolveAction(s, "p1", null, { type: "coreSqueezeOne", count: 1 }, undefined, ["red"] as never, "magic")
    assert(victim.cores === floor, `下限（${String(floor)}個）で止まる（実際: ${String(victim.cores)}個）`)
    assert(
        s.players.p2.reserve === reserveBefore + (5 - floor),
        `取り除けた分だけ持ち主のリザーブへ（実際: ${String(s.players.p2.reserve - reserveBefore)}個）`,
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === victim.instanceId),
        "下限で守られるので消滅しない",
    )
}

console.log("=== コアの移動（moveCoresLeavingOne）：下限を割ってまで移せない ===")
{
    const floor = HEAVY.levels?.[0]?.cores ?? 0
    const s = base("p235-move")
    putPillar(s)
    const from = put(s, "p2", HEAVY.cardId, 5)
    const to = put(s, "p2", HEAVY.cardId, 2)
    resolveAction(s, "p1", null, { type: "moveCoresLeavingOne" }, from.instanceId, ["red"] as never, "magic")
    assert(from.cores === floor, `移し元は下限（${String(floor)}個）で止まる（実際: ${String(from.cores)}個）`)
    assert(to.cores === 2 + (5 - floor), `移せた分だけ移し先へ（実際: ${String(to.cores)}個）`)

    // すでに下限ちょうどなら1個も移せない
    const s2 = base("p235-move-none")
    putPillar(s2)
    const exact = put(s2, "p2", HEAVY.cardId, floor)
    const dest2 = put(s2, "p2", HEAVY.cardId, 2)
    resolveAction(s2, "p1", null, { type: "moveCoresLeavingOne" }, exact.instanceId, ["red"] as never, "magic")
    assert(exact.cores === floor, `下限ちょうどなら動かない（実際: ${String(exact.cores)}個）`)
    assert(dest2.cores === 2, `移し先も増えない（実際: ${String(dest2.cores)}個）`)
}

console.log("=== コアの入れ替え（swapOpponentCores）：下限を割るなら入れ替え自体を行わない ===")
{
    const floor = HEAVY.levels?.[0]?.cores ?? 0

    // 対照：柱状彫刻が無ければ入れ替わる
    const bare = base("p235-swap-bare")
    const a0 = put(bare, "p2", HEAVY.cardId, 5)
    const b0 = put(bare, "p2", HEAVY.cardId, floor)
    resolveAction(bare, "p1", null, { type: "swapOpponentCores" }, undefined, ["red"] as never, "magic")
    assert(a0.cores === floor && b0.cores === 5, `柱状彫刻が無ければ入れ替わる（実際: ${String(a0.cores)}/${String(b0.cores)}）`)

    // 下限を割る側が出る組み合わせ（1個 ← 下限未満）は入れ替えない
    const s = base("p235-swap")
    putPillar(s)
    const a = put(s, "p2", HEAVY.cardId, 5)
    const b = put(s, "p2", HEAVY.cardId, 1)
    resolveAction(s, "p1", null, { type: "swapOpponentCores" }, undefined, ["red"] as never, "magic")
    assert(a.cores === 5 && b.cores === 1, `下限を割るので入れ替わらない（実際: ${String(a.cores)}/${String(b.cores)}）`)

    // どちらも下限を満たすなら従来どおり入れ替わる
    const ok = base("p235-swap-ok")
    putPillar(ok)
    const c = put(ok, "p2", HEAVY.cardId, 5)
    const d = put(ok, "p2", HEAVY.cardId, floor)
    resolveAction(ok, "p1", null, { type: "swapOpponentCores" }, undefined, ["red"] as never, "magic")
    assert(c.cores === floor && d.cores === 5, `下限を満たすなら入れ替わる（実際: ${String(c.cores)}/${String(d.cores)}）`)
}
