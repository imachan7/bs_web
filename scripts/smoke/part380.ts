// smoke パート380（誘発効果の付与：timedEffect の内容 grantTrigger。移したカードデータを直接解決する）
import { assert, createGame, createInstance, fireTrigger, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"

function grantAction(cardId: string): Extract<EffectAction, { type: "timedEffect" }> {
    let found: EffectAction | undefined
    const walk = (o: unknown): void => {
        if (found || !o || typeof o !== "object") return
        if (Array.isArray(o)) return o.forEach(walk)
        const r = o as Record<string, unknown>
        if (r.type === "timedEffect" && JSON.stringify(r.content).includes('"grantTrigger"')) found = r as unknown as EffectAction
        Object.values(r).forEach(walk)
    }
    walk(getCard(cardId).effects)
    assert(found !== undefined, `${cardId}：カードデータに grantTrigger がある`)
    return found as Extract<EffectAction, { type: "timedEffect" }>
}

const VANILLA = "BS01-002" // ロクケラトプス
const YATSU = "BS14-032" // ヤツノカンゾウ（【暴風】）
const HAOU = "BS14-010" // 皇牙獣キンタローグ・ベアー（系統：覇皇）

function game(): GameState {
    const s = createGame("p380", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS08-068").name === "メテオストーム", "BS08-068 はメテオストーム")
    assert(getCard(YATSU).name === "ヤツノカンゾウ", "BS14-032 はヤツノカンゾウ")
    assert(getCard("BS15-077").name === "ヒートライド", "BS15-077 はヒートライド")
    assert(getCard("BS16-074").name === "爆覇炎神剣", "BS16-074 は爆覇炎神剣")
    assert(getCard(HAOU).family.includes("覇皇"), "HAOU は覇皇")
}

console.log("=== 1. 1体：ヒートライド＝実効BP最大の自分のスピリットに『ライフを減らしたとき』 ===")
{
    const s = game()
    const weak = createInstance(VANILLA, 1, 1)
    const strong = createInstance(VANILLA, 1, 3)
    s.players.p1.field.spirits = [weak, strong]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, grantAction("BS15-077"), undefined, undefined, "magic")
    assert(strong.tempGrantedTriggers?.length === 1 && weak.tempGrantedTriggers === undefined, "実効BP最大の1体にだけ付く")
    const before = s.players.p1.reserve
    fireTrigger(s, "p1", strong, "onLifeDealt")
    assert(s.players.p1.reserve === before + 1, "付与した効果でボイドからコア1個")
}

console.log("=== 2. 1体：爆覇炎神剣＝系統：覇皇だけが候補 ===")
{
    const s = game()
    const other = createInstance(VANILLA, 1, 5)
    const haou = createInstance(HAOU, 1, 1)
    s.players.p1.field.spirits = [other, haou]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, grantAction("BS16-074"), undefined, undefined, "magic")
    assert(haou.tempGrantedTriggers?.[0]?.trigger === "onBattleWin", "覇皇に『アタック時・BP比較で破壊したとき』が付く")
    assert(other.tempGrantedTriggers === undefined, "覇皇でない方には付かない")
}

console.log("=== 3. すべて：ヤツノカンゾウ＝解決後に出た【暴風】持ちにも付く（timedRule） ===")
{
    const s = game()
    const action = grantAction(YATSU)
    assert(action.all === true && action.side === "own", "カードデータは all・自分")
    resolveAction(s, "p1", null, action)
    assert(s.turnConstraints.some((c) => c.type === "timedRule" && c.content.some((x) => x.type === "grantTrigger")), "全体ルールが積まれる")
    // 仕組みの確認：同じ全体ルールに観測しやすい効果を載せ、後から出た【暴風】持ちで発火させる
    const probe = { ...action, content: [{ type: "grantTrigger" as const, trigger: "onLifeDealt" as const, action: { type: "voidCoreToReserve", count: 1 } as EffectAction }] }
    resolveAction(s, "p1", null, probe)
    const later = createInstance(YATSU, 1, 3)
    const plain = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits.push(later, plain)
    refreshLevelAsOverrides(s)
    const before = s.players.p1.reserve
    fireTrigger(s, "p1", later, "onLifeDealt")
    assert(s.players.p1.reserve === before + 1, "後から出た【暴風】持ちで付与した効果が発火する")
    fireTrigger(s, "p1", plain, "onLifeDealt")
    assert(s.players.p1.reserve === before + 1, "【暴風】を持たないスピリットでは発火しない")
}

console.log("すべてのチェックに合格しました 🎉（part380）")
