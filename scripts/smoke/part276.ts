// smoke パート276（BS11 グループC その5：リフレッシュステップの制限）
//
// docs/design/BS11_PLAN.md §1 の1（2026-09-02 ユーザー確認）:
// 「合体していないスピリットは1体しか回復できない」の**選択者はそのステップのプレイヤー**。
// リフレッシュステップに中断点を新設し、既存の refreshOne へ委譲する。
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave } from "../../server/src/logic/removal"
import { driveTurnStart } from "../../server/src/logic/PhaseManager"

const AQUA = "BS11-X04" // 宝瓶神機アクア・エリシオン
const JANOME = "BS11-055" // ジャノメ・シールダー（ブレイヴ）
const braveCard = ALL_CARDS.find(
    (c) => c.type === "brave" && JSON.stringify(c.braveCondition) === JSON.stringify({ vanilla: true }),
)
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
const anyNexus = ALL_CARDS.find((c) => c.type === "nexus")
assert(braveCard !== undefined && vanilla.length >= 2 && anyNexus !== undefined, "テスト前提: 必要なカードがいる")

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function rested(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    inst.isRested = true
    s.players[pid].field.spirits.push(inst)
    return inst
}
// リフレッシュステップだけを走らせる（ターン開始処理のステップ3＝refresh）
function runRefreshStep(s: GameState) {
    refreshLevelAsOverrides(s)
    driveTurnStart(s, 3)
}

console.log("=== §A BS11-X04：合体していないスピリットは1体しか回復しない（非対話は実効BP最大） ===")
{
    const s = game("aqua-one")
    const aqua = createInstance(AQUA, s.turn, 1)
    s.players.p1.field.spirits.push(aqua)
    const a = rested(s, "p1", vanilla[0]!.cardId, 2)
    const b = rested(s, "p1", vanilla[1]!.cardId, 2)
    runRefreshStep(s)
    const refreshed = [a, b].filter((x) => !x.isRested)
    assert(refreshed.length === 1, `回復したのは1体だけ（実際は${String(refreshed.length)}体）`)
}

console.log("=== §B BS11-X04：ネクサスは回復しない ===")
{
    const s = game("aqua-nexus")
    const aqua = createInstance(AQUA, s.turn, 1)
    s.players.p1.field.spirits.push(aqua)
    const nexus = createInstance(anyNexus!.cardId, s.turn, 1)
    nexus.isRested = true
    s.players.p1.field.nexuses.push(nexus)
    runRefreshStep(s)
    assert(nexus.isRested === true, "ネクサスは疲労したまま")
}

console.log("=== §C BS11-X04：合体スピリットは制限を受けずに回復する ===")
{
    const s = game("aqua-combined")
    const aqua = createInstance(AQUA, s.turn, 1)
    s.players.p1.field.spirits.push(aqua)
    const host = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(host)
    host.isRested = true
    attachBrave(s, "p1", host, createInstance(braveCard!.cardId, s.turn, 0))
    const lone = rested(s, "p1", vanilla[1]!.cardId, 2)
    runRefreshStep(s)
    assert(!(host.isRested as boolean), "合体スピリットは回復する")
    assert(lone.isRested === false, "合体していない1体も回復する（枠は1体ぶん）")
}

console.log("=== §D 対話：どれを回復させるかはそのステップのプレイヤーが選ぶ ===")
{
    const s = game("aqua-choice", true)
    const aqua = createInstance(AQUA, s.turn, 1)
    s.players.p1.field.spirits.push(aqua)
    const a = rested(s, "p1", vanilla[0]!.cardId, 2)
    const b = rested(s, "p1", vanilla[1]!.cardId, 2)
    runRefreshStep(s)
    assert(s.pendingChoice?.kind === "target", "回復させる1体の選択待ちが立つ")
    assert(s.pendingChoice?.pid === "p1", "選ぶのはそのステップのプレイヤー")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: b.instanceId }) === null, "2体目を選ぶ")
    assert(b.isRested === false && a.isRested === true, "選んだ側だけ回復する")
}

console.log("=== §E BS11-055：指定されたスピリットは次のリフレッシュステップで回復しない ===")
{
    const s = game("janome")
    const target = rested(s, "p1", vanilla[0]!.cardId, 2)
    const other = rested(s, "p1", vanilla[1]!.cardId, 2)
    // 相手（p2）のジャノメ・シールダーが、疲労状態のスピリット1体を指定する
    void JANOME
    other.isRested = false // 候補を1体に絞る（自動選択の対象を固定する）
    resolveAction(s, "p2", null, { type: "markSkipNextRefresh", filter: { rested: true } })
    assert(target.skipNextRefresh === true, "指定された側に印が付く")
    other.isRested = true
    runRefreshStep(s)
    assert(target.isRested === true, "指定されたスピリットは回復しない")
    assert(target.skipNextRefresh === undefined, "印はそのステップで消費される")
    assert(!(other.isRested as boolean), "他のスピリットは回復する")
    // 次のリフレッシュでは回復する
    runRefreshStep(s)
    assert(target.isRested === false, "次のリフレッシュステップでは回復する")
}

console.log("すべてのチェックに合格しました 🎉（part276）")
