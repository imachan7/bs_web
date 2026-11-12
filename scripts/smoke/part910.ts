// smoke パート910（誘発が選択待ちを立てても、その事象のバースト判定を捨てずに、誘発を解決し終えてから行う。#437 F2）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState } from "./helpers"

const ROULETTE = "BS14-086" // 運命のルーレット（自分のライフが減らされたとき、〜できる）
const SHIELD = "SD06-016" // 絶甲氷盾（バースト：自分のライフ減少後）
const ATTACKER = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ROULETTE).effects.some((e) => e.kind === "fieldEvent" && e.event === "ownLifeDamaged" && e.optional === true), "運命のルーレットはライフ減少時の任意の誘発")
    assert(getCard(SHIELD).effects.some((e) => e.kind === "burst" && e.event === "ownLifeDamaged"), "絶甲氷盾はライフ減少後のバースト")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = [createInstance(ATTACKER, s.turn, 1)]
    s.players.p2.field.spirits = []
    s.players.p2.field.nexuses = [createInstance(ROULETTE, s.turn, 0)]
    s.players.p2.burst = SHIELD
    s.players.p2.burstSet = true
    s.players.p2.reserve = 10
    refreshLevelAsOverrides(s)
    return s
}
const prompt = (s: GameState) => s.pendingChoice?.prompt ?? ""

console.log("=== ライフ減少時の誘発の確認を断ったあとも、ライフ減少後のバーストの確認が出る ===")
{
    const s = game("p910-burst")
    assert(act(s, "p1", { type: "nextPhase" }) === null && act(s, "p1", { type: "attack", instanceId: s.players.p1.field.spirits[0]!.instanceId }) === null, "アタック")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(prompt(s).includes("運命のルーレット"), `先に運命のルーレットの確認（${prompt(s)}）`)
    act(s, "p2", { type: "resolveChoice" }) // 発動しない
    assert(s.pendingChoice?.pid === "p2" && prompt(s).includes("絶甲氷盾"), `続いて絶甲氷盾の確認が出る（${prompt(s) || "なし"}）`)
}

console.log("すべてのチェックに合格しました 🎉（part910）")
