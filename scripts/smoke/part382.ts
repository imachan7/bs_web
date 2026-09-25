// smoke パート382（「〜のスピリットすべて」の期間つき効果はネクサスに当たらない。#131・#133 で入った不具合の再発防止）
import { assert, createGame, createInstance, currentLevel, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"
import { countSymbols, instanceSymbolCount } from "../../shared/rules"

function timedAction(cardId: string, contentType: string): EffectAction {
    let found: EffectAction | undefined
    const walk = (o: unknown): void => {
        if (found || !o || typeof o !== "object") return
        if (Array.isArray(o)) return o.forEach(walk)
        const r = o as Record<string, unknown>
        if (r.type === "timedEffect" && JSON.stringify(r.content).includes(`"${contentType}"`)) found = r as unknown as EffectAction
        Object.values(r).forEach(walk)
    }
    walk(getCard(cardId).effects)
    assert(found !== undefined, `${cardId}：カードデータに ${contentType} がある`)
    return found!
}

const CITY = "BS08-066" // 海底に眠りし古代都市（ネクサス・青シンボル1・Lv2 でコア3）
const DANSTON = "BS03-081" // 人馬巨兵ダンストン（系統：異合・青シンボル1）

function game(): { s: GameState; city: ReturnType<typeof createInstance>; spirit: ReturnType<typeof createInstance> } {
    const s = createGame("p382", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    const city = createInstance(CITY, 1, 3)
    const spirit = createInstance(DANSTON, 1, 3)
    s.players.p1.field.spirits = [spirit]
    s.players.p1.field.nexuses = [city]
    s.players.p2.field.spirits = []
    s.players.p2.field.nexuses = []
    refreshLevelAsOverrides(s)
    return { s, city, spirit }
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CITY).name === "海底に眠りし古代都市" && getCard(CITY).type === "nexus", "BS08-066 は海底に眠りし古代都市（ネクサス）")
    assert(getCard(DANSTON).name === "人馬巨兵ダンストン" && getCard(DANSTON).family.includes("異合"), "BS03-081 は異合のダンストン")
    assert(getCard("BS14-110").name === "天災之禍風", "BS14-110 は天災之禍風")
    assert(getCard("BS04-069").name === "幻影士のミラージ", "BS04-069 は幻影士のミラージ")
    assert(getCard("BS12-080").name === "バキュームシンボル", "BS12-080 はバキュームシンボル")
}

console.log("=== 1. 天災之禍風（相手のスピリットすべてを Lv1）：相手のネクサスの Lv は変わらない ===")
{
    const { s, city, spirit } = game()
    resolveAction(s, "p2", null, timedAction("BS14-110", "level"))
    assert(currentLevel(spirit).level === 1, "相手のスピリットは Lv1")
    assert(currentLevel(city).level === 2, "相手のネクサスは Lv2 のまま")
}

console.log("=== 2. 幻影士のミラージ（自分のスピリットすべてを最高Lv）：自分のネクサスの Lv は変わらない ===")
{
    const { s, city } = game()
    const low = createInstance(CITY, 1, 0) // Lv1 のネクサス
    s.players.p1.field.nexuses.push(low)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, timedAction("BS04-069", "level"))
    assert(currentLevel(low).level === 1 && currentLevel(city).level === 2, "ネクサスは最高Lvにならない")
}

console.log("=== 3. バキュームシンボル（相手のスピリットすべては指定色のシンボルを1つ失う）：相手のネクサスのシンボルは減らない ===")
{
    const { s, city, spirit } = game()
    const action = JSON.parse(JSON.stringify(timedAction("BS12-080", "symbolLoss"))) as { content: { color?: string }[] }
    action.content[0]!.color = "blue"
    resolveAction(s, "p2", null, action as unknown as EffectAction, undefined, undefined, "magic")
    assert(instanceSymbolCount(city) === 1, "古代都市のシンボルは1つのまま")
    assert(countSymbols(s.players.p1, ["blue"]) === instanceSymbolCount(spirit) + 1, "場の青シンボル＝スピリットの分＋古代都市の1つ")
}

console.log("すべてのチェックに合格しました 🎉（part382）")
