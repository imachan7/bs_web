// smoke パート637（BS18 部品：noLifeDamageByCost.attackerCores／canDirectAttack.targetFilter:"hasSummonTrigger"／coreGainCap の side:"both" と max:0）
// 効果エントリは BS01-007 / BS01-102 に一時的に載せて確かめる（終わりに必ず戻す）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { EffectDef } from "../../server/src/type"
import { directAttackFilter, noLifeDamageByCost } from "../../shared/rules"
import { matchesDirectedAttackFilter } from "../../shared/block"

const HOST = "BS01-007" // ハンマドレイク（赤・『召喚時』あり）
const PLAIN = "BS01-002" // ロクケラトプス（赤・効果なし）
const CUP = "BS01-102" // 主無き古城（ネクサス）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HOST).name === "ハンマドレイク", "HOSTはハンマドレイク")
    assert(getCard(HOST).effects.some((e) => e.kind === "triggered" && e.trigger === "onSummon"), "HOSTは『召喚時』を持つ")
    assert(getCard(PLAIN).name === "ロクケラトプス" && getCard(PLAIN).effects.length === 0, "PLAINは効果なし")
    assert(getCard(CUP).name === "主無き古城" && getCard(CUP).type === "nexus", "CUPは主無き古城（ネクサス）")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const noLife: EffectDef = { id: "part637-nl", kind: "globalConstraint", levels: null, constraint: { type: "noLifeDamageByCost", attackerCores: 2 } }
const noLifeOwn: EffectDef = { id: "part637-nlo", kind: "globalConstraint", levels: null, constraint: { type: "noLifeDamageByCost", attackerCores: 2, ownOnly: true } }
const direct: EffectDef = { id: "part637-da", kind: "constraint", levels: null, constraint: { type: "canDirectAttack", targetFilter: "hasSummonTrigger" } }
const cap0: EffectDef = { id: "part637-cap0", kind: "globalConstraint", levels: null, constraint: { type: "coreGainCap", max: 0, sourceTypes: ["spirit", "brave", "nexus"], from: ["void", "trash"], to: ["life", "field", "reserve"], side: "both" } }
const host = getCard(HOST)
const cup = getCard(CUP)
try {
    console.log("=== 1. noLifeDamageByCost.attackerCores：コアがちょうどその数のアタッカーだけ ===")
    {
        host.effects.push(noLife)
        const s = game("nl1")
        put(s, "p1", HOST, 1)
        const two = put(s, "p1", PLAIN, 2)
        const three = put(s, "p1", PLAIN, 3)
        const one = put(s, "p1", PLAIN, 1)
        assert(noLifeDamageByCost(s, "p2", two), "コア2個のアタックではライフが減らない")
        assert(!noLifeDamageByCost(s, "p2", three), "コア3個は対象外")
        assert(!noLifeDamageByCost(s, "p2", one), "コア1個は対象外")
        const oppTwo = put(s, "p2", PLAIN, 2)
        assert(noLifeDamageByCost(s, "p1", oppTwo), "両陣営：相手側のコア2個のアタックでも減らない")
        host.effects.splice(host.effects.indexOf(noLife), 1)
    }
    console.log("=== 2. attackerCores と ownOnly：発生源の持ち主のライフだけ守る ===")
    {
        host.effects.push(noLifeOwn)
        const s = game("nl2")
        put(s, "p1", HOST, 1)
        const myTwo = put(s, "p1", PLAIN, 2)
        const oppTwo = put(s, "p2", PLAIN, 2)
        assert(noLifeDamageByCost(s, "p1", oppTwo), "相手のコア2個のアタックから、持ち主(p1)のライフは守られる")
        assert(!noLifeDamageByCost(s, "p2", myTwo), "自分のアタックで相手(p2)のライフは守られない")
        host.effects.splice(host.effects.indexOf(noLifeOwn), 1)
    }
    console.log("=== 3. canDirectAttack.targetFilter:hasSummonTrigger ===")
    {
        host.effects.push(direct)
        const s = game("da1")
        const me = put(s, "p1", HOST, 1)
        const withTrig = put(s, "p2", HOST, 1)
        const plain = put(s, "p2", PLAIN, 1)
        const f = directAttackFilter(s, "p1", me)
        assert(f !== null && f.targetFilter === "hasSummonTrigger", "指定アタックの条件が取れる")
        assert(matchesDirectedAttackFilter(f!, withTrig, s, "p2") === null, "『召喚時』持ちは指定できる")
        assert(matchesDirectedAttackFilter(f!, plain, s, "p2") !== null, "効果なしのスピリットは指定できない")
        host.effects.splice(host.effects.indexOf(direct), 1)
    }
    console.log("=== 4. coreGainCap：side:both と max:0 ===")
    {
        cup.effects.push(cap0)
        const s = game("cap1")
        s.players.p1.field.nexuses.push(createInstance(CUP, s.turn, 1))
        const mine = put(s, "p1", PLAIN, 1)
        const theirs = put(s, "p2", PLAIN, 1)
        const r1 = s.players.p1.reserve
        resolveAction(s, "p1", mine, { type: "placeCores", from: "void", to: "reserve", count: 2 })
        assert(s.players.p1.reserve === r1, "発生源の持ち主自身にも掛かる（side:both）")
        const r2 = s.players.p2.reserve
        resolveAction(s, "p2", theirs, { type: "placeCores", from: "void", to: "reserve", count: 2 })
        assert(s.players.p2.reserve === r2, "相手にも掛かり、max:0 でコアが1個も増えない")
        const life0 = s.players.p2.life
        resolveAction(s, "p2", theirs, { type: "placeCores", from: "void", to: "life", count: 1 })
        assert(s.players.p2.life === life0, "ボイドからライフへも増えない")
        const c0 = theirs.cores
        resolveAction(s, "p2", theirs, { type: "placeCores", from: "reserve", to: "spirit", target: "self", count: 1 })
        assert(theirs.cores === c0 + 1, "リザーブからの移動は対象外")
        cup.effects.splice(cup.effects.indexOf(cap0), 1)
        // 対照：side省略は従来どおり相手だけ
        const capOpp: EffectDef = { ...cap0, id: "part637-capopp", constraint: { ...(cap0 as any).constraint, side: undefined } }
        cup.effects.push(capOpp)
        const s2 = game("cap2")
        s2.players.p1.field.nexuses.push(createInstance(CUP, s2.turn, 1))
        const m2 = put(s2, "p1", PLAIN, 1)
        const t2 = put(s2, "p2", PLAIN, 1)
        const a = s2.players.p1.reserve
        resolveAction(s2, "p1", m2, { type: "placeCores", from: "void", to: "reserve", count: 2 })
        assert(s2.players.p1.reserve === a + 2, "side省略：持ち主自身には掛からない")
        const b = s2.players.p2.reserve
        resolveAction(s2, "p2", t2, { type: "placeCores", from: "void", to: "reserve", count: 2 })
        assert(s2.players.p2.reserve === b, "side省略：相手には掛かる")
        cup.effects.splice(cup.effects.indexOf(capOpp), 1)
    }
} finally {
    for (const [c, e] of [[host, noLife], [host, noLifeOwn], [host, direct], [cup, cap0]] as const) {
        const i = c.effects.indexOf(e)
        if (i >= 0) c.effects.splice(i, 1)
    }
    cup.effects = cup.effects.filter((e) => e.id !== "part637-capopp")
}

console.log("すべてのチェックに合格しました 🎉（part637）")
