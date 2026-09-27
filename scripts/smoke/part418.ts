// smoke パート418（fireEffect：効果を発揮させる。タイムリープで相手の召喚時発揮後バーストが起きる・イビルグライダーで効果を1つ選ぶ）
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance, EffectAction, PlayerId } from "../../server/src/type"

const TIMELEAP = "BS02-107" // タイムリープ
const GLIDER = "BS13-052" // イビルグライダー
const PEGASIDA = "BS11-038" // 天星馬ペガシーダ（破壊時：Lv2 で3枚ドロー／Lv1･Lv2 で出るまで破棄）
const DRAWER = "BS01-030" // グリプ・ハンズ（召喚時：1枚ドロー）
const SENGEKKA = "BS15-082" // 神閃月下（バースト：相手の『召喚時』発揮後）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TIMELEAP).name === "タイムリープ" && getCard(GLIDER).name === "イビルグライダー", "カード名")
    assert(getCard(PEGASIDA).name === "天星馬ペガシーダ" && getCard(DRAWER).name === "グリプ・ハンズ", "カード名2")
    assert(getCard(SENGEKKA).effects.some((e) => e.kind === "burst" && (e as { event?: string }).event === "opponentSummonEffectResolved"), "神閃月下は召喚時発揮後のバースト")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "yellow" })
    s.interactiveTargets = true
    runTurnStart(s)
    return s
}
function put(s: GameState, pid: PlayerId, id: string, cores = 1): CardInstance {
    const inst = createInstance(id, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}
const actionOf = (cardId: string, eid: string): EffectAction => (getCard(cardId).effects.find((e) => e.id === eid) as { action: EffectAction }).action

console.log("=== 1. タイムリープ：召喚時効果を持つ自分のスピリットを選んで発揮し、相手の召喚時発揮後バーストが起きる ===")
{
    const s = game("timeleap")
    const drawer = put(s, "p1", DRAWER)
    put(s, "p1", DRAWER)
    put(s, "p1", VANILLA) // 召喚時効果を持たないので候補にならない
    s.players.p2.burst = SENGEKKA
    s.players.p2.burstSet = true
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, actionOf(TIMELEAP, "BS02-107-e2"), undefined, undefined, "magic")
    assert(s.pendingChoice?.pid === "p1" && s.pendingChoice.candidates.length === 2, "召喚時効果を持つ2体から選ぶ")
    act(s, "p1", { type: "resolveChoice", instanceId: drawer.instanceId })
    assert(s.players.p1.hand.length === hand + 1, "選んだスピリットの召喚時効果で1枚引く")
    assert(s.pendingChoice?.pid === "p2", "相手に召喚時発揮後バーストの確認が出る")
}

console.log("=== 2. イビルグライダー：破壊時効果を持つスピリットを選び、効果を1つ選ぶ ===")
{
    const s = game("glider")
    const glider = put(s, "p1", GLIDER)
    const pegasida = put(s, "p1", PEGASIDA, 3) // Lv2
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", glider, actionOf(GLIDER, "BS13-052-e1"))
    assert(s.pendingChoice?.options?.join() === "Lv2の効果,Lv1･Lv2の効果", "効果を見出しのレベルで選ぶ")
    act(s, "p1", { type: "resolveChoice", option: "Lv2の効果" })
    assert(s.players.p1.hand.length === hand + 3, "Lv2の効果（3枚ドロー）だけを発揮する")
    assert(s.players.p1.field.spirits.includes(pegasida), "ペガシーダは破壊されない")
}

console.log("すべてのチェックに合格しました 🎉（part418）")
