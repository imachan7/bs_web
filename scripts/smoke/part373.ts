// smoke パート373（このバトルの間、相手はフラッシュで手札を使えない／バーストを発動できない：timedEffect の内容 battleLock）
import { assert, createGame, createInstance, getCard, resolveAction } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { ALL_CARDS } from "../../server/src/logic/GameState"

function collect(): { cardId: string; action: EffectAction; lock: string }[] {
    const out: { cardId: string; action: EffectAction; lock: string }[] = []
    const walk = (o: unknown, cardId: string): void => {
        if (Array.isArray(o)) return o.forEach((x) => walk(x, cardId))
        if (!o || typeof o !== "object") return
        const r = o as Record<string, unknown>
        const c = (r.content as { type: string; lock?: string }[] | undefined)?.find((x) => x.type === "battleLock")
        if (r.type === "timedEffect" && c) out.push({ cardId, action: r as unknown as EffectAction, lock: c.lock! })
        Object.values(r).forEach((v) => walk(v, cardId))
    }
    for (const card of ALL_CARDS) walk(card.effects, card.cardId)
    return out
}

console.log("=== 1. 移したカードデータ9か所：バトル中なら相手に印が付く ===")
{
    const entries = collect()
    assert(entries.length === 9, `battleLock は9か所（実際: ${entries.length}）`)
    for (const { cardId, action, lock } of entries) {
        const s = createGame("p373", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
        const attacker = createInstance("BS01-001", 1, 1)
        s.players.p1.field.spirits = [attacker]
        s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
        resolveAction(s, "p1", null, action)
        const got = lock === "flash" ? s.battle.flashLockedPlayer : s.battle.burstBlockedForPid
        assert(got === "p2", `${cardId} ${getCard(cardId).name}：相手（p2）に${lock === "flash" ? "フラッシュ" : "バースト"}の印`)
    }
}

console.log("=== 2. バトルが起きていなければ何もしない ===")
{
    const s = createGame("p373b", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "battleLock", lock: "flash" }], duration: "battle" })
    assert(s.battle === null && s.log.at(-1)?.includes("バトルが発生していない") === true, "バトルが無いときは使用できなかった")
}

console.log("すべてのチェックに合格しました 🎉（part373）")
