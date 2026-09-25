// smoke パート372（ブロックされない：timedEffect の内容 unblockable。天使長トロンはターン終了まで＝2026-09-24 効果文どおりに修正）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, giveBp } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"
import { canBlock } from "../../shared/block"
import { clearBattle } from "../../server/src/logic/GameState"

const TRON = "BS07-044" // 天使長トロン：召喚時、このターンの間、このスピリットはブロックされない
const EARTH = "BS04-081" // 強者統べる大地 Lv2：BP10000以上の自分のスピリット1体は、ターンに1回、ブロックされない
const HERMOD = "BS13-032" // 光速の騎士ヘルモード：このバトルの間、BP6000以上の相手からブロックされない
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TRON).name === "天使長トロン", "TRON")
    assert(getCard(EARTH).name === "強者統べる大地", "EARTH")
    assert(getCard(HERMOD).name === "光速の騎士ヘルモード", "HERMOD")
}

function unblockAction(cardId: string): EffectAction {
    let found: EffectAction | undefined
    const walk = (o: unknown): void => {
        if (found || !o || typeof o !== "object") return
        if (Array.isArray(o)) return o.forEach(walk)
        const r = o as Record<string, unknown>
        if (r.type === "timedEffect" && JSON.stringify(r.content).includes('"unblockable"')) found = r as unknown as EffectAction
        Object.values(r).forEach(walk)
    }
    walk(getCard(cardId).effects)
    assert(found !== undefined, `${cardId}：カードデータに unblockable がある`)
    return found!
}

function game(): GameState {
    const s = createGame("p372", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.turnPlayer = "p1"
    s.phase = "attack"
    return s
}

function battle(s: GameState, attackerId: string): void {
    s.battle = { attackerInstanceId: attackerId, blockerInstanceId: null, directed: false }
}

console.log("=== 1. 天使長トロン：バトルが終わっても2回目のアタックもブロックされない ===")
{
    const s = game()
    const tron = createInstance(TRON, 1, 1)
    const blocker = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits = [tron]
    s.players.p2.field.spirits = [blocker]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", tron, unblockAction(TRON))
    battle(s, tron.instanceId)
    assert(canBlock(s, "p2", blocker, "p1", tron) !== null, "1回目のアタックはブロックできない")
    clearBattle(s)
    battle(s, tron.instanceId)
    assert(canBlock(s, "p2", blocker, "p1", tron) !== null, "同じターンの2回目のアタックもブロックできない")
}

console.log("=== 2. 強者統べる大地：アタックしたバトルが終わると消える（ターンに1回） ===")
{
    const s = game()
    const big = createInstance(VANILLA, 1, 1)
    giveBp(s, big, 20000)
    const blocker = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits = [big]
    s.players.p2.field.spirits = [blocker]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, unblockAction(EARTH))
    battle(s, big.instanceId)
    assert(canBlock(s, "p2", blocker, "p1", big) !== null, "1回目のアタックはブロックできない")
    clearBattle(s)
    battle(s, big.instanceId)
    assert(canBlock(s, "p2", blocker, "p1", big) === null, "2回目のアタックはブロックできる")
}

console.log("=== 3. 光速の騎士ヘルモード：BP6000以上の相手からだけブロックされない ===")
{
    const s = game()
    const hermod = createInstance(HERMOD, 1, 1)
    const weak = createInstance(VANILLA, 1, 1)
    const strong = createInstance(VANILLA, 1, 1)
    giveBp(s, strong, 10000)
    s.players.p1.field.spirits = [hermod]
    s.players.p2.field.spirits = [weak, strong]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", hermod, unblockAction(HERMOD))
    battle(s, hermod.instanceId)
    assert(canBlock(s, "p2", strong, "p1", hermod) !== null, "BP6000以上の相手はブロックできない")
    assert(canBlock(s, "p2", weak, "p1", hermod) === null, "BPの低い相手はブロックできる")
}

console.log("すべてのチェックに合格しました 🎉（part372）")
