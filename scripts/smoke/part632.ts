// smoke パート632（BS18 部品5〜6：onBlock／onBlocked の targetMinCost、burst の burstDestroyed 条件）
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { assert, createGame, createInstance, fireTrigger, getCard, placeBurst, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const HOLDER = "BS01-001" // ゴラドン（赤・コスト0）。テスト中だけ効果を差し込む
const COST1 = "BS01-002" // ロクケラトプス（赤・コスト1・系統「地竜」）
const COST2 = "BS01-003" // テラノセイバー（赤・コスト2・系統「空牙」）
const BLUE0 = "BS15-046" // ランマー・ゴレム（青・コスト0）
const BURST_MAGIC = "BS15-084" // 爆砕轟神掌（バースト効果は mill。条件だけ差し替える）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HOLDER).name === "ゴラドン" && getCard(HOLDER).cost === 0, "HOLDERはゴラドン")
    assert(getCard(COST1).cost === 1 && getCard(COST1).family.includes("地竜"), "COST1は地竜のコスト1")
    assert(getCard(COST2).cost === 2 && getCard(COST2).family.includes("空牙"), "COST2は空牙のコスト2")
    assert(getCard(BLUE0).name === "ランマー・ゴレム" && getCard(BLUE0).colors.includes("blue") && getCard(BLUE0).cost === 0, "BLUE0は青コスト0")
    assert(getCard(BURST_MAGIC).effects.some((e) => e.kind === "burst"), "爆砕轟神掌はバーストを持つ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => COST1)
    s.players.p2.deck = Array.from({ length: 40 }, () => COST1)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 5. targetMinCost（onBlock＝アタッカー／onBlocked＝ブロッカーのコスト以上） ===")
{
    const effects = getCard(HOLDER).effects as unknown[]
    const added = [
        { id: "t-block", kind: "triggered", trigger: "onBlock", levels: [1], condition: { targetMinCost: 2 }, action: { type: "draw", count: 1 }, optional: false },
        { id: "t-blocked", kind: "triggered", trigger: "onBlocked", levels: [1], condition: { targetMinCost: 2 }, action: { type: "draw", count: 1 }, optional: false },
    ]
    effects.push(...added)
    try {
        for (const [trigger, evt] of [["onBlock", "t-block"], ["onBlocked", "t-blocked"]] as const) {
            const s = game(`min-cost-${trigger}`)
            const me = put(s, "p1", HOLDER)
            const big = put(s, "p2", COST2)
            const small = put(s, "p2", COST1)
            const before = s.players.p1.hand.length
            fireTrigger(s, "p1", me, trigger, undefined, big.instanceId, undefined, undefined, undefined, [evt])
            assert(s.players.p1.hand.length === before + 1, `${trigger}：相手のコスト2（しきい値ちょうど）で発火する`)
            fireTrigger(s, "p1", me, trigger, undefined, small.instanceId, undefined, undefined, undefined, [evt])
            assert(s.players.p1.hand.length === before + 1, `${trigger}：相手のコスト1では発火しない`)
        }
    } finally {
        effects.splice(effects.length - added.length, added.length)
    }
}

console.log("=== 6. burst の burstDestroyed 条件（同時破壊のうち1体でも全指定を満たせば真） ===")
{
    const burst = getCard(BURST_MAGIC).effects.find((e) => e.kind === "burst") as { condition?: unknown }
    const original = burst.condition
    const run = (seed: string, ids: string[], cond: unknown): number => {
        burst.condition = cond
        const s = game(seed)
        placeBurst(s, "p1", BURST_MAGIC)
        const targets = ids.map((c) => put(s, "p1", c))
        const before = s.players.p2.deck.length
        destroyTargetsBatch(s, "p2", targets.map((t) => ({ pid: "p1" as PlayerId, instanceId: t.instanceId })), { sourcePid: "p2", sourceType: "spirit" })
        return before - s.players.p2.deck.length
    }
    try {
        // 発動するとコストぶんだけ mill される（コスト0なら0枚で区別できないため、判定にコスト1以上の個体を混ぜる）
        const c1 = { burstDestroyed: { colors: ["red"], minCost: 1, family: ["地竜"] } }
        assert(run("bd-all", [COST1], c1) === 1, "赤・コスト1以上・地竜をすべて満たす1体で真")
        assert(run("bd-family", [COST2], c1) === 0, "系統が違えば偽")
        assert(run("bd-cost", [COST1], { burstDestroyed: { minCost: 2 } }) === 0, "コストが足りなければ偽")
        assert(run("bd-color", [COST1], { burstDestroyed: { colors: ["blue", "green"] } }) === 0, "色がどれも合わなければ偽")
        assert(run("bd-or-color", [COST1], { burstDestroyed: { colors: ["blue", "red"] } }) === 1, "色は配列のどれかでよい")
        assert(run("bd-any-one", [COST1, BLUE0], { burstDestroyed: { colors: ["red"], minCost: 1 } }) === 1, "同時破壊のうち1体が満たせば真")
        // 別々の個体で満たした組み合わせは偽（赤だけ=コスト1、コスト2以上だけ=空牙の赤…ここでは赤&コスト2以上を満たす個体がいない）
        assert(run("bd-split", [BLUE0, COST1], { burstDestroyed: { colors: ["blue"], minCost: 1 } }) === 0, "色は青の個体、コストは赤の個体で満たしても偽（個体ごとに判定）")
        assert(run("bd-color-old", [COST1], { burstDestroyedColor: "red" }) === 1, "既存の burstDestroyedColor も破壊メンバーの色で評価される")
        assert(run("bd-color-old-ng", [COST1], { burstDestroyedColor: "blue" }) === 0, "含まれない色なら偽")
        assert(run("bd-none", [COST1], undefined) === 1, "条件なしは従来どおり発動")
    } finally {
        if (original === undefined) delete burst.condition
        else burst.condition = original
    }
}

console.log("すべてのチェックに合格しました 🎉（part632）")
