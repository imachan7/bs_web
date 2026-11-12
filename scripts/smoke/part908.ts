// smoke パート908（removeCores が1個ずつ選ぶ再入をはさんでも「この効果でコアが0個になった体数」を数え落とさない。#437 R8-4）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const VIPER = "BS23-X02" // 白蛇帝アルデウス・ヴァイパー（召喚時：相手のスピリットのコア3個→0個になった1体につきボイドから自分のリザーブへ1個）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VIPER).name === "白蛇帝アルデウス・ヴァイパー", "VIPER は白蛇帝アルデウス・ヴァイパー")
}

function run(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = interactive
    const viper = createInstance(VIPER, s.turn, 1)
    s.players.p1.field.spirits.push(viper)
    const a = createInstance(VANILLA, s.turn, 1)
    const b = createInstance(VANILLA, s.turn, 1)
    const c = createInstance(VANILLA, s.turn, 3)
    s.players.p2.field.spirits = [a, b, c]
    s.players.p1.reserve = 0
    refreshLevelAsOverrides(s)
    const entry = getCard(VIPER).effects.find((e) => e.id === "BS23-X02-e1") as { action: EffectAction }
    resolveAction(s, "p1", viper, entry.action)
    // 対話：a → b → c の順に1個ずつ取る（a・b が0個になる）
    for (const pick of [a, b, c]) {
        if (!s.pendingChoice) break
        handleAction(s, "p1", { type: "resolveChoice", instanceId: pick.instanceId })
    }
    return s
}

console.log("=== 対話で1個ずつ選んでも、0個になった2体ぶん、ボイドから2個置く ===")
{
    const s = run("p908-interactive", true)
    assert(s.pendingChoice === null, "選び終えた")
    assert(s.players.p1.reserve === 2, `自分のリザーブ +2（${s.players.p1.reserve}）`)
}

console.log("=== 対照：対話でないときも2個（以前から正しい） ===")
{
    const s = run("p908-auto", false)
    assert(s.players.p1.reserve === 2, `自分のリザーブ +2（${s.players.p1.reserve}）`)
}

console.log("すべてのチェックに合格しました 🎉（part908）")
