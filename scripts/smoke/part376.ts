// smoke パート376（バトルの比較基準・勝敗反転：timedEffect の内容 compareBy／invertBattleWinner。移したカードデータを直接解決する）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"

function timedAction(cardId: string): EffectAction {
    let found: EffectAction | undefined
    const walk = (o: unknown): void => {
        if (found || !o || typeof o !== "object") return
        if (Array.isArray(o)) return o.forEach(walk)
        const r = o as Record<string, unknown>
        if (r.type === "timedEffect" && /"(compareBy|invertBattleWinner)"/.test(JSON.stringify(r.content))) found = r as unknown as EffectAction
        Object.values(r).forEach(walk)
    }
    walk(getCard(cardId).effects)
    assert(found !== undefined, `${cardId}：カードデータに compareBy／invertBattleWinner がある`)
    return found!
}

function game(inBattle: boolean): GameState {
    const s = createGame("p376", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    const a = createInstance("BS01-002", 1, 1)
    const b = createInstance("BS01-002", 1, 1)
    s.players.p1.field.spirits = [a]
    s.players.p2.field.spirits = [b]
    refreshLevelAsOverrides(s)
    if (inBattle) s.battle = { attackerInstanceId: a.instanceId, blockerInstanceId: b.instanceId, flashLockedPlayer: null, directed: false }
    return s
}

console.log("=== 1. バトル中：移した6か所がそれぞれの印を立てる ===")
{
    const cases: [string, string, "compareByLevel" | "compareByCores" | "compareByCost" | "invertBpWinner"][] = [
        ["BS02-109", "エンジェルボイス", "compareByLevel"],
        ["BS06-110", "イマジンフィールド", "compareByCores"],
        ["BS10-073", "エンジェドール", "compareByLevel"],
        ["BS10-110", "ノックアウト", "compareByCost"],
        ["BS14-087", "ペンタン帝国：帝都アンプルール", "compareByLevel"],
        ["P070", "カオティック・リクゴー", "invertBpWinner"],
    ]
    for (const [cardId, name, flag] of cases) {
        assert(getCard(cardId).name === name, `${cardId} は${name}`)
        const s = game(true)
        resolveAction(s, "p1", null, timedAction(cardId))
        assert(s.battle?.[flag] === true, `${name}：${flag} が立つ`)
        const others = (["compareByLevel", "compareByCores", "compareByCost", "invertBpWinner"] as const).filter((f) => f !== flag)
        assert(others.every((f) => !s.battle?.[f]), `${name}：ほかの印は立たない`)
    }
}

console.log("=== 2. バトル外では不発 ===")
{
    const s = game(false)
    resolveAction(s, "p1", null, timedAction("BS02-109"))
    assert(s.battle === null || s.battle === undefined, "バトル外：バトルは作られない")
}

console.log("すべてのチェックに合格しました 🎉（part376）")
