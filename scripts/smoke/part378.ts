// smoke パート378（トリガー抑止：timedEffect の内容 suppressTrigger。移したカードデータを直接解決する）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"
import { isTriggerSuppressed } from "../../server/src/logic/triggers"

function suppressAction(cardId: string): EffectAction {
    let found: EffectAction | undefined
    const walk = (o: unknown): void => {
        if (found || !o || typeof o !== "object") return
        if (Array.isArray(o)) return o.forEach(walk)
        const r = o as Record<string, unknown>
        if (r.type === "timedEffect" && JSON.stringify(r.content).includes('"suppressTrigger"')) found = r as unknown as EffectAction
        Object.values(r).forEach(walk)
    }
    walk(getCard(cardId).effects)
    assert(found !== undefined, `${cardId}：カードデータに suppressTrigger がある`)
    return found!
}

const VANILLA = "BS01-002" // ロクケラトプス

function game(): GameState {
    const s = createGame("p378", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS04-093").name === "ユーサネイジア", "BS04-093 はユーサネイジア")
    assert(getCard("BS14-043").name === "月光姫マーニ", "BS14-043 は月光姫マーニ")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
}

console.log("=== 1. すべて：ユーサネイジア＝相手のスピリットの『破壊時』が発揮されない ===")
{
    const s = game()
    resolveAction(s, "p1", null, suppressAction("BS04-093"), undefined, undefined, "magic")
    assert(isTriggerSuppressed(s, "p2", "onDestroy"), "相手の破壊時は抑止される")
    assert(!isTriggerSuppressed(s, "p1", "onDestroy"), "自分の破壊時は抑止されない")
    assert(!isTriggerSuppressed(s, "p2", "onAttack"), "ほかのトリガーは抑止されない")
}

console.log("=== 2. 1体：月光姫マーニ＝実効BP最大の相手1体の『アタック時』だけ ===")
{
    const s = game()
    const strong = createInstance(VANILLA, 1, 3)
    const weak = createInstance(VANILLA, 1, 1)
    s.players.p2.field.spirits = [strong, weak]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, suppressAction("BS14-043"))
    assert(strong.suppressedTriggersThisTurn?.includes("onAttack") === true, "実効BP最大の1体に印が付く")
    assert(weak.suppressedTriggersThisTurn === undefined, "もう1体には付かない")
    s.interactiveTargets = true
    resolveAction(s, "p1", null, suppressAction("BS14-043"))
    assert(s.pendingChoice?.candidates.includes(strong.instanceId) === true, "既に止められている個体も候補に出る（2026-09-25 ユーザー確認）")
}

console.log("すべてのチェックに合格しました 🎉（part378）")
