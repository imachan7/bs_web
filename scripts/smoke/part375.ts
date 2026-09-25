// smoke パート375（アタック時⇔ブロック時の効果の付け替え：timedEffect の内容 triggerSwap。移したカードデータを直接解決する）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, timedHas } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"
import { ALL_CARDS } from "../../server/src/logic/GameState"

function swapAction(cardId: string): EffectAction {
    let found: EffectAction | undefined
    const walk = (o: unknown): void => {
        if (found || !o || typeof o !== "object") return
        if (Array.isArray(o)) return o.forEach(walk)
        const r = o as Record<string, unknown>
        if (r.type === "timedEffect" && JSON.stringify(r.content).includes('"triggerSwap"')) found = r as unknown as EffectAction
        Object.values(r).forEach(walk)
    }
    walk(getCard(cardId).effects)
    assert(found !== undefined, `${cardId}：カードデータに triggerSwap がある`)
    return found!
}

const blockTriggerCard = ALL_CARDS.find((c) => c.type === "spirit" && c.effects.some((e) => e.kind === "triggered" && e.trigger === "onBlock"))!

function game(): { s: GameState; a: ReturnType<typeof createInstance> } {
    const s = createGame("p375", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    const a = createInstance(blockTriggerCard.cardId, 1, 1)
    s.players.p1.field.spirits = [a]
    refreshLevelAsOverrides(s)
    return { s, a }
}

console.log("=== 1. 1体：ブレイブチャージ（アタック時→ブロック時）・マクラーンスラッシュ（ブロック時→アタック時） ===")
{
    const { s, a } = game()
    resolveAction(s, "p1", null, swapAction("BS05-075"), a.instanceId, undefined, "magic")
    assert(timedHas(s, a, "triggerSwap"), "ブレイブチャージ：指定した1体のアタック時効果がブロック時に")
    const t = game()
    resolveAction(t.s, "p1", null, swapAction("BS07-078"), undefined, undefined, "magic")
    assert(timedHas(t.s, t.a, "triggerSwap"), "マクラーンスラッシュ：ブロック時効果を持つ1体がアタック時に")
}

console.log("=== 2. すべて：アタックシフト（両陣営）・セイバーシャーク（自分） ===")
{
    const { s } = game()
    resolveAction(s, "p1", null, swapAction("BS01-149"), undefined, undefined, "magic")
    assert(s.timedEffects.some((r) => r.target.kind === "rule" && r.target.pid === undefined && r.content.some((c) => c.type === "triggerSwap")), "アタックシフト：両陣営すべて")
    const t = game()
    resolveAction(t.s, "p1", null, swapAction("BS10-072"))
    assert(t.s.timedEffects.some((r) => r.target.kind === "rule" && r.target.pid === "p1" && r.content.some((c) => c.type === "triggerSwap")), "セイバーシャーク：自分のスピリットすべて")
}

console.log("すべてのチェックに合格しました 🎉（part375）")
