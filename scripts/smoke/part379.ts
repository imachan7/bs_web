// smoke パート379（疲労状態でもブロック：timedEffect の内容 canBlockWhileRested。移したカードデータを直接解決する）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, timedHas } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"
import { canBlockWhileRestedThisTurn } from "../../shared/rules"

function restedBlockAction(cardId: string): EffectAction {
    let found: EffectAction | undefined
    const walk = (o: unknown): void => {
        if (found || !o || typeof o !== "object") return
        if (Array.isArray(o)) return o.forEach(walk)
        const r = o as Record<string, unknown>
        if (r.type === "timedEffect" && JSON.stringify(r.content).includes('"canBlockWhileRested"')) found = r as unknown as EffectAction
        Object.values(r).forEach(walk)
    }
    walk(getCard(cardId).effects)
    assert(found !== undefined, `${cardId}：カードデータに canBlockWhileRested がある`)
    return found!
}

const GREEN = "BS01-050" // ビートビートル（緑・殻虫）
const KIJU = "BS07-029" // キグナ・スワン（白・機獣）
const RED = "BS01-002" // ロクケラトプス（赤）

function game(): GameState {
    const s = createGame("p379", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS08-077").name === "インフィニティシールド", "BS08-077 はインフィニティシールド")
    assert(getCard("BS14-101").name === "仁王壁", "BS14-101 は仁王壁")
    assert(getCard(GREEN).name === "ビートビートル" && getCard(GREEN).colors[0] === "green", "GREENは緑")
    assert(getCard(KIJU).name === "キグナ・スワン" && getCard(KIJU).family.includes("機獣"), "KIJUは機獣")
    assert(getCard(RED).name === "ロクケラトプス" && getCard(RED).colors[0] === "red", "REDは赤")
}

console.log("=== 1. 1体：仁王壁＝自分の緑のスピリットのうち実効BP最大 ===")
{
    const s = game()
    const weak = createInstance(GREEN, 1, 1)
    const strong = createInstance(GREEN, 1, 3)
    const red = createInstance(RED, 1, 5)
    s.players.p1.field.spirits = [weak, strong, red]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, restedBlockAction("BS14-101"), undefined, undefined, "magic")
    assert(timedHas(s, strong, "canBlockWhileRested"), "緑で実効BP最大の1体に付く")
    assert(!timedHas(s, weak, "canBlockWhileRested") && !timedHas(s, red, "canBlockWhileRested"), "ほかの緑・緑以外には付かない")
}

console.log("=== 2. すべて：インフィニティシールド＝系統一致の自分のスピリット（後から出たものにも） ===")
{
    const s = game()
    resolveAction(s, "p1", null, restedBlockAction("BS08-077"), undefined, undefined, "magic")
    const later = createInstance(KIJU, 1, 1)
    const other = createInstance(RED, 1, 1)
    s.players.p1.field.spirits.push(later, other)
    const opp = createInstance(KIJU, 1, 1)
    s.players.p2.field.spirits.push(opp)
    assert(canBlockWhileRestedThisTurn(s, "p1", later), "後から出た機獣にも効く")
    assert(!canBlockWhileRestedThisTurn(s, "p1", other), "系統が違うものには効かない")
    assert(!canBlockWhileRestedThisTurn(s, "p2", opp), "相手の機獣には効かない")
}

console.log("すべてのチェックに合格しました 🎉（part379）")
