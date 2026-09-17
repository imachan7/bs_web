// smoke パート340（ブロッカーは**ブロック宣言の時点で**疲労する。2026-09-17）
//
// 公式のタイミングチャート（docs/design/TIMING_CHART.md §3「１Ｂ：ブロッカーを疲労してブロック宣言」→「２Ｂ：ブロック時効果発揮」）。
// 以前はバトル解決（resolveBattle）で疲労させていたため、ブロック後のフラッシュタイミングの間ずっと回復状態のままだった。
// 複数体ブロック（BS10-X03 巨蟹武神キャンサード）でバトルしない側のブロッカーは、一度も疲労していなかった。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, declareBlock, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

const vanilla = ALL_CARDS.find((c) => c.type === "spirit" && c.effect === "" && c.colors.length === 1 && c.colors[0] === "red" && c.levels.length > 0)!
assert(vanilla !== undefined, "テスト前提: 赤のバニラのスピリットがいる")

console.log("=== §A 通常のブロック：宣言の直後（フラッシュタイミング中）に疲労している ===")
{
    const s = game("p340-a")
    const attacker = put(s, "p1", vanilla.cardId, vanilla.levels[0]!.cores)
    const blocker = put(s, "p2", vanilla.cardId, vanilla.levels[0]!.cores)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(blocker.isRested === false, "前提：ブロック前は回復状態")
    const err = declareBlock(s, "p2", blocker.instanceId)
    assert(err === null, `ブロック宣言が通る（${String(err)}）`)
    assert(s.battle?.blockerInstanceId === blocker.instanceId, "ブロックが成立している（バトルはまだ解決していない）")
    assert(blocker.isRested === true, "ブロック宣言の時点で疲労している")
}

console.log("=== §B 複数体ブロック：バトルしない側のブロッカーも疲労する ===")
{
    const cancerd = byName("巨蟹武神キャンサード")
    const s = game("p340-b")
    const attacker = put(s, "p1", cancerd.cardId, cancerd.levels[0]!.cores)
    const b1 = put(s, "p2", vanilla.cardId, vanilla.levels[0]!.cores)
    const b2 = put(s, "p2", vanilla.cardId, vanilla.levels[0]!.cores)
    refreshLevelAsOverrides(s)
    act(s, "p1", { type: "nextPhase" })
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "キャンサードでアタック")
    assert(declareBlock(s, "p2", b1.instanceId) === null, "1体目の宣言")
    assert(act(s, "p2", { type: "block", instanceId: b2.instanceId }) === null, "2体目の宣言でブロックが成立")
    assert((s.battle?.extraBlockerIds ?? []).length === 1, "前提：1体はバトルしない側")
    assert(b1.isRested === true && b2.isRested === true, "ブロックを宣言した2体とも疲労している")
}

console.log("=== §C 「ブロックしても疲労しない」（BS02-X07 巨神機トール Lv2：赤のアタッカー）は宣言時点でも効く ===")
{
    const thor = byName("巨神機トール")
    const s = game("p340-c")
    const attacker = put(s, "p1", vanilla.cardId, vanilla.levels[0]!.cores)
    const blocker = put(s, "p2", thor.cardId, thor.levels[1]!.cores)
    refreshLevelAsOverrides(s)
    act(s, "p1", { type: "nextPhase" })
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "赤のスピリットでアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "トールでブロック")
    assert(blocker.isRested === false, "赤のアタッカーをブロックしたので疲労しない")
}

console.log("すべてのチェックに合格しました 🎉（part340）")
