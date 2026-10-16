// smoke パート420（王蛇ケツァルカトル：手札を好きなだけ破棄し、破棄した枚数と同じ数の相手のスピリットから1個ずつ。removeCores の targetsCounter）
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart, answerPayConfirm } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const KETSU = "BS04-022" // 王蛇ケツァルカトル
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(KETSU).name === "王蛇ケツァルカトル" && getCard(VANILLA).effects.length === 0, "カード名")
}

console.log("=== 手札を2枚選んで破棄し、別々の相手のスピリット2体から1個ずつトラッシュへ ===")
{
    const s = createGame("ketsu", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    const k = createInstance(KETSU, s.turn, 3)
    s.players.p1.field.spirits.push(k)
    s.players.p1.hand = [VANILLA, VANILLA, VANILLA]
    const foes = [0, 1, 2].map(() => createInstance(VANILLA, s.turn, 3))
    s.players.p2.field.spirits.push(...foes)
    const trash = s.players.p2.trashCores
    resolveAction(s, "p1", k, (getCard(KETSU).effects.find((e) => e.id === "BS04-022-e2") as { action: EffectAction }).action)
    answerPayConfirm(s, "p1")
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    act(s, "p1", { type: "resolveChoice" }) // これで破棄を終える
    assert(s.players.p1.hand.length === 1, "2枚破棄した")
    assert(s.pendingChoice?.candidates.length === 3, "1体目は相手の3体から選ぶ")
    act(s, "p1", { type: "resolveChoice", instanceId: foes[0]!.instanceId })
    assert(s.pendingChoice?.candidates.length === 2 && !s.pendingChoice.candidates.includes(foes[0]!.instanceId), "2体目は別のスピリットから選ぶ")
    act(s, "p1", { type: "resolveChoice", instanceId: foes[1]!.instanceId })
    assert(foes[0]!.cores === 2 && foes[1]!.cores === 2 && foes[2]!.cores === 3, "選んだ2体から1個ずつ")
    assert(s.players.p2.trashCores === trash + 2, "相手のトラッシュへ")
}

console.log("すべてのチェックに合格しました 🎉（part420）")
