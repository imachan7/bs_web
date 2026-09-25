// smoke パート377（強制アタック：timedEffect の内容 mustAttack。移したカードデータを直接解決する）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"
import { mustAttackThisTurn } from "../../shared/rules"

function mustAttackAction(cardId: string): EffectAction {
    let found: EffectAction | undefined
    const walk = (o: unknown): void => {
        if (found || !o || typeof o !== "object") return
        if (Array.isArray(o)) return o.forEach(walk)
        const r = o as Record<string, unknown>
        if (r.type === "timedEffect" && JSON.stringify(r.content).includes('"mustAttack"')) found = r as unknown as EffectAction
        Object.values(r).forEach(walk)
    }
    walk(getCard(cardId).effects)
    assert(found !== undefined, `${cardId}：カードデータに mustAttack がある`)
    return found!
}

const VANILLA = "BS01-002" // ロクケラトプス（コスト1）
const BRAVE = "BS10-X04" // 月光龍ストライク・ジークヴルム

function game(): GameState {
    const s = createGame("p377", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1")
    assert(getCard(BRAVE).name === "月光龍ストライク・ジークヴルム", "BS10-X04 は月光龍ストライク・ジークヴルム")
    assert(getCard("BS08-076").name === "アンブッシュブロッカー", "BS08-076 はアンブッシュブロッカー")
    assert(getCard("SD01-032").name === "機械神の加護", "SD01-032 は機械神の加護")
}

console.log("=== 1. 1体：合体していないスピリットだけが候補（月光龍ストライク・ジークヴルム） ===")
{
    const s = game()
    const combined = createInstance(VANILLA, 1, 3)
    const plain = createInstance(VANILLA, 1, 1)
    s.players.p2.field.spirits = [combined, plain]
    const brave = createInstance(VANILLA, 1, 0)
    brave.braveCombined = true
    s.players.p2.field.combinedBraves.push(brave)
    combined.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, mustAttackAction(BRAVE))
    assert(plain.mustAttackThisTurn === true, "合体していない方に印が付く")
    assert(combined.mustAttackThisTurn !== true, "合体スピリットは選ばれない")
}

console.log("=== 2. 1体：既に掛かっている個体も選べる（機械神の加護を2回。2026-09-25 ユーザー確認） ===")
{
    const s = game()
    const strong = createInstance(VANILLA, 1, 3)
    const weak = createInstance(VANILLA, 1, 1)
    s.players.p2.field.spirits = [strong, weak]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, mustAttackAction("SD01-032"))
    resolveAction(s, "p1", null, mustAttackAction("SD01-032"))
    assert(strong.mustAttackThisTurn === true && weak.mustAttackThisTurn !== true, "自動選択では2回目も実効BP最大の同じ1体")
    s.interactiveTargets = true
    resolveAction(s, "p1", null, mustAttackAction("SD01-032"))
    assert(s.pendingChoice?.candidates.includes(strong.instanceId) === true, "対話では既に掛かっている個体も候補に出る")
}

console.log("=== 3. すべて：解決後に場に出たコスト3以下にも効く（アンブッシュブロッカー） ===")
{
    const s = game()
    resolveAction(s, "p1", null, mustAttackAction("BS08-076"), undefined, undefined, "magic")
    const later = createInstance(VANILLA, 1, 1)
    s.players.p2.field.spirits.push(later)
    assert(mustAttackThisTurn(s, "p2", later), "後から出たコスト1にも強制アタックが掛かる")
    const mine = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits.push(mine)
    assert(!mustAttackThisTurn(s, "p1", mine), "自分のスピリットには掛からない")
}

console.log("すべてのチェックに合格しました 🎉（part377）")
