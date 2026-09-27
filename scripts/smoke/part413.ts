// smoke パート413（五輪転生炎：系統を指定し、「このターンの間…すべて」は解決後に場に出た個体にも効く。SEMANTICS_AUDIT §3.12）
import { act, assert, createGame, createInstance, effectiveBp, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance, EffectAction } from "../../server/src/type"

const GORIN = "BS15-073" // 五輪転生炎
const RED = "BS01-001" // ゴラドン（爬獣）
const PURPLE = "BS01-031" // デス・ハーデス（呪鬼）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(GORIN).name === "五輪転生炎", "GORIN")
    assert(getCard(RED).family.join() === "爬獣" && getCard(PURPLE).family.join() === "呪鬼", "RED／PURPLE の系統")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    return s
}
function put(s: GameState, cardId: string): CardInstance {
    const inst = createInstance(cardId, s.turn, 1)
    s.players.p1.field.spirits.push(inst)
    return inst
}
const flash = (getCard(GORIN).effects!.find((e) => e.id === "BS15-073-e2") as { action: EffectAction }).action

console.log("=== 1. 自分の場の系統から指定し、その系統の自分のスピリットすべてを BP+4000 ===")
{
    const s = game("gorin")
    const a = put(s, RED)
    const b = put(s, PURPLE)
    const bpA = effectiveBp(s, "p1", a)
    const bpB = effectiveBp(s, "p1", b)
    resolveAction(s, "p1", null, flash)
    assert(s.pendingChoice?.options?.join() === "爬獣,呪鬼", "自分の場の系統が候補")
    act(s, "p1", { type: "resolveChoice", option: "爬獣" })
    assert(effectiveBp(s, "p1", a) === bpA + 4000 && effectiveBp(s, "p1", b) === bpB, "爬獣だけ BP+4000")

    console.log("--- 解決後に場に出た爬獣にも効く（このターンの間続く継続効果） ---")
    const late = put(s, RED)
    assert(effectiveBp(s, "p1", late) === bpA + 4000, "後から出た爬獣も BP+4000")
}

console.log("すべてのチェックに合格しました 🎉（part413）")
