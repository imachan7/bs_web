// smoke パート416（「〜1体ずつ」を sequence で書いた3枚：選択で中断しても残りが続く）
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance, EffectAction, PlayerId } from "../../server/src/type"

const LEVEN = "SD02-010" // 轟剣士レーヴェン
const JUMON = "SD06-014" // 爆烈十紋刃
const C0 = "BS01-001" // ゴラドン（コスト0）
const C3 = "BS01-031" // デス・ハーデス（コスト3）
const NEXUS = "BS01-098" // 燃えさかる戦場

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(LEVEN).name === "轟剣士レーヴェン" && getCard(JUMON).name === "爆烈十紋刃", "カード名")
    assert(getCard(C0).cost === 0 && getCard(C3).cost === 3 && getCard(NEXUS).type === "nexus", "コスト0・3とネクサス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    return s
}
function put(s: GameState, pid: PlayerId, id: string): CardInstance {
    const inst = createInstance(id, s.turn, 1)
    s.players[pid].field.spirits.push(inst)
    return inst
}
const alive = (s: GameState, i: CardInstance): boolean => s.players.p2.field.spirits.some((x) => x.instanceId === i.instanceId)
const actionOf = (cardId: string, eid: string): EffectAction => (getCard(cardId).effects.find((e) => e.id === eid) as { action: EffectAction }).action

console.log("=== 1. レーヴェン：コストごとに1体ずつ選び、選択をまたいでも次のコストへ続く ===")
{
    const s = game("leven")
    const a0 = put(s, "p2", C0)
    const b0 = put(s, "p2", C0)
    const a3 = put(s, "p2", C3)
    const b3 = put(s, "p2", C3)
    resolveAction(s, "p1", null, actionOf(LEVEN, "SD02-010-e1"))
    assert(s.pendingChoice?.candidates.length === 2, "まずコスト0の2体から選ぶ")
    act(s, "p1", { type: "resolveChoice", instanceId: b0.instanceId })
    assert(s.pendingChoice?.candidates.length === 2, "続けてコスト3の2体から選ぶ")
    act(s, "p1", { type: "resolveChoice", instanceId: a3.instanceId })
    assert(s.pendingChoice === null, "コスト1・2・4はいないので終わる")
    assert(alive(s, a0) && !alive(s, b0) && !alive(s, a3) && alive(s, b3), "各コスト1体ずつだけ破壊")
}

console.log("=== 2. 爆烈十紋刃：スピリット1体とネクサス1つを破壊（ブレイヴがいなくても他は成立） ===")
{
    const s = game("jumon")
    s.interactiveTargets = false
    const sp = put(s, "p2", C3)
    const nx = createInstance(NEXUS, s.turn, 0)
    s.players.p2.field.nexuses.push(nx)
    resolveAction(s, "p1", null, actionOf(JUMON, "SD06-014-e1"))
    assert(!alive(s, sp) && !s.players.p2.field.nexuses.includes(nx), "スピリットとネクサスを破壊")
}

console.log("すべてのチェックに合格しました 🎉（part416）")
