// smoke パート926（BS23-026 ジライヤ：【分身】を発揮させるスピリットの選択に答えると、その【分身】が発揮される。#495）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const JIRAIYA = "BS23-026" // 剣聖仙忍ジライヤ
const HASHIBIROU = "BS23-022" // 火忍ハシビロウ（【分身：1】）
const JUICHI = "BS23-025" // 忍鳥ジューイチ（【分身：1】）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(JIRAIYA).name === "剣聖仙忍ジライヤ", "JIRAIYAはジライヤ")
    assert(getCard(HASHIBIROU).name === "火忍ハシビロウ", "HASHIBIROUはハシビロウ")
    assert(getCard(JUICHI).name === "忍鳥ジューイチ", "JUICHIはジューイチ")
}

function game(interactive: boolean): GameState {
    const s = createGame("bunshin-pick", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, 1)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const fireBunshin = getCard(JIRAIYA).effects.find((e) => e.kind === "triggered" && "action" in e && e.action.type === "fireEffect")
assert(fireBunshin !== undefined && fireBunshin.kind === "triggered", "ジライヤに【分身】を発揮させる効果がある")

console.log("=== 1. 候補2体：選んだスピリットの【分身】が発揮され、同じ選択が出直さない ===")
{
    const s = game(true)
    const jiraiya = put(s, "p1", JIRAIYA)
    put(s, "p1", JUICHI)
    const hashi = put(s, "p1", HASHIBIROU)
    if (fireBunshin?.kind === "triggered") resolveAction(s, "p1", jiraiya, fireBunshin.action)
    const ask = s.pendingChoice
    assert(ask?.prompt.includes("【分身】を発揮させるスピリット") === true && ask.candidates.length === 2, "候補2体の選択が出る")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: hashi.instanceId }) === null, "ハシビロウを選べる")
    assert(!(s.pendingChoice?.prompt.includes("【分身】を発揮させるスピリット") ?? false), "同じ選択が出直さない")
    assert(s.log.some((l) => l.includes("火忍ハシビロウの【分身】を発揮させる")), "選んだハシビロウの【分身】が発揮される")
}

console.log("すべてのチェックに合格しました 🎉（part926）")
