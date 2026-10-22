// smoke パート643（マジックの useWindow:"beforeBlock"／cantUseHandCardsForPid.minCost／期間 beforeBlock。BS18-082・BS18-X06 型）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { validateCastMagic } from "../../server/src/logic/RuleValidator"
import { clearBattle } from "../../server/src/logic/GameState"

const MAGIC = "BS04-110" // レッドウォール（赤・コスト2・フラッシュ）
const VANILLA = "BS01-002"

console.log("=== 前提 ===")
{
    assert(getCard(MAGIC).name === "レッドウォール" && getCard(MAGIC).cost === 2, "MAGICはコスト2のレッドウォール")
}

function game(): GameState {
    const s = createGame("p643", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    const atk = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    refreshLevelAsOverrides(s)
    s.players.p2.hand = [MAGIC]
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.battle = { attackerInstanceId: atk.instanceId, blockerInstanceId: null, directed: false }
    s.isFlashTiming = true
    s.priorityPlayer = "p2"
    return s
}

function withUseWindow(fn: () => void): void {
    const entry = getCard(MAGIC).effects.find((e) => e.kind === "magic")
    if (!entry || entry.kind !== "magic") throw new Error("magic entry なし")
    entry.useWindow = "beforeBlock"
    try {
        fn()
    } finally {
        delete entry.useWindow
    }
}

console.log("=== 1. useWindow:beforeBlock ===")
{
    withUseWindow(() => {
        const s = game()
        assert(validateCastMagic(s, "p2", 0) === null, "相手のアタックのブロック前フラッシュ：使える")
        s.battle!.blockerInstanceId = s.players.p1.field.spirits[0]!.instanceId
        assert(validateCastMagic(s, "p2", 0) !== null, "ブロック宣言後のフラッシュ：使えない")

        const own = game()
        own.turnPlayer = "p2"
        own.players.p2.field.spirits.push(own.players.p1.field.spirits.pop()!)
        own.priorityPlayer = "p2"
        assert(validateCastMagic(own, "p2", 0) !== null, "自分のアタックステップ：使えない")

        const main = game()
        main.battle = null
        main.isFlashTiming = false
        main.turnPlayer = "p2"
        main.phase = "main"
        assert(validateCastMagic(main, "p2", 0) !== null, "メインステップ：使えない")
    })
    const s = game()
    assert(validateCastMagic(s, "p2", 0) === null, "useWindow が無ければ制限なし（後始末の確認）")
    s.battle!.blockerInstanceId = s.players.p1.field.spirits[0]!.instanceId
    assert(validateCastMagic(s, "p2", 0) === null, "useWindow が無ければブロック後も使える")
}

console.log("=== 2. minCost ＋ 期間 beforeBlock ===")
{
    const rule = (minCost: number) => ({
        content: [{ type: "playerRule" as const, rule: { type: "cantUseHandCardsForPid" as const, minCost } }],
        target: { kind: "player" as const, pid: "p2" as const },
        until: "beforeBlock" as const,
        ownerPid: "p1" as const,
    })
    const s = game()
    s.timedEffects.push(rule(2))
    assert(validateCastMagic(s, "p2", 0) === "効果により、このカードは使えません", "コスト2以上：ブロック前は使えない")
    s.battle!.blockerInstanceId = s.players.p1.field.spirits[0]!.instanceId
    assert(validateCastMagic(s, "p2", 0) === null, "ブロック宣言後は効かない")
    clearBattle(s)
    assert(!s.timedEffects.some((r) => r.until === "beforeBlock"), "バトル終了で記録が消える")

    const t = game()
    t.timedEffects.push(rule(3))
    assert(validateCastMagic(t, "p2", 0) === null, "コスト3以上：コスト2のカードは止めない（境界）")
    clearBattle(t)
    assert(t.timedEffects.length === 0, "ブロックされないままバトルが終わっても消える")
}

console.log("すべてのチェックに合格しました 🎉（part643）")
