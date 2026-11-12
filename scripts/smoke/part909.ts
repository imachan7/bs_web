// smoke パート909（ターン終了は、終了時の誘発が選択待ちを立てたらそこで止まり、解決後に続きから進む。#437 F1）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const ANDREALPHUS = "BS08-013" // アンドレアルファス（『自分のエンドステップ』トラッシュの「勇者」スピリット1枚を召喚できる）
const HERO = "BS07-021" // 天刃の勇者ヴォルザ（コスト3）

console.log("=== 前提: カードの機械確認 ===")
{
    const e = getCard(ANDREALPHUS).effects[0] as { kind: string; step?: string; optional?: boolean }
    assert(e.kind === "step" && e.step === "end" && e.optional === true, "アンドレアルファスは任意のエンドステップ誘発")
    assert(getCard(HERO).name.includes("勇者"), "ヴォルザは「勇者」")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.field.spirits.push(createInstance(ANDREALPHUS, s.turn, 1))
    s.players.p1.trashCards = [HERO]
    refreshLevelAsOverrides(s)
    return s
}
const confirmPending = (s: GameState) => s.pendingChoice?.pid === "p1" && (s.pendingChoice.prompt ?? "").includes("アンドレアルファスの効果を発動しますか")

console.log("=== エンドステップの発動確認が出たら、ターンはそこで止まる ===")
{
    const s = game("p909-stop")
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターン終了を宣言")
    assert(confirmPending(s), `アンドレアルファスの確認が出る（${s.pendingChoice?.prompt ?? "なし"}）`)
    assert(s.turnPlayer === "p1" && s.phase === "end", `まだ自分のエンドステップ（${s.turnPlayer}・${s.phase}）`)
}

console.log("=== 確認に答えて召喚したら、続きからターンが終わる（エンドステップの誘発は2回出ない） ===")
{
    const s = game("p909-resume")
    act(s, "p1", { type: "endTurn" })
    let confirms = 0
    for (let i = 0; i < 10 && s.pendingChoice?.pid === "p1"; i++) {
        if (confirmPending(s)) confirms++
        const pc = s.pendingChoice
        if (pc.kind === "option") act(s, "p1", { type: "resolveChoice", option: pc.options![0]! })
        else if (pc.kind === "card") act(s, "p1", { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
        else act(s, "p1", { type: "resolveChoice", instanceId: pc.candidates[0]! })
    }
    assert(confirms === 1, `確認は1回だけ（${confirms}回）`)
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === HERO), "ヴォルザが自分のターン中に召喚された")
    assert(s.turnPlayer === "p2", `そのあと相手のターンへ（${s.turnPlayer}）`)
}

console.log("=== ターン終了時に解決する効果（atTurnEnd）が選択待ちになっても、エンドステップの誘発はやり直さない ===")
{
    const s = game("p909-turnend")
    s.players.p2.field.spirits = [createInstance("BS01-002", s.turn, 1), createInstance("BS01-002", s.turn, 1)]
    // ターン終了時に「相手のスピリット1体を破壊する」（候補2体なので選択待ちになる）
    s.turnEndActions = [{ ownerPid: "p1", action: { type: "destroy", count: 1 } } as never]
    act(s, "p1", { type: "endTurn" })
    let confirms = 0
    for (let i = 0; i < 10 && s.pendingChoice?.pid === "p1"; i++) {
        if (confirmPending(s)) {
            confirms++
            act(s, "p1", { type: "resolveChoice" }) // 発動しない
        } else act(s, "p1", { type: "resolveChoice", instanceId: s.pendingChoice.candidates[0]! })
    }
    assert(confirms === 1, `エンドステップの確認は1回だけ（${confirms}回）`)
    assert(s.players.p2.field.spirits.length === 1, `ターン終了時の効果は解決した（相手のスピリット ${s.players.p2.field.spirits.length}体）`)
    assert(s.turnPlayer === "p2", `そのあと相手のターンへ（${s.turnPlayer}）`)
}

console.log("すべてのチェックに合格しました 🎉（part909）")
