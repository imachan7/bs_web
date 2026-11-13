// smoke パート943（プロボケイションと「コストを支払わずに使用できる」も「使用」：使用の制限・使用回数の記録を受ける。#525・#526）
import { assert, createGame, createInstance, getCard, handleAction, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const PROVOCATION = "BS15-079" // プロボケイション（相手のメインステップ終了時に使用できる）
const FOXIN = "BS03-079" // 作戦参謀フォクシン：お互い、ターンに1回しかマジックの効果を使用できない
const GEMINI = "BS11-X05" // 魔導双神ジェミナイズ
const DELIVERY = "BS11-081" // ライトニングデリバリー（黄・フラッシュ：1枚ドロー）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(PROVOCATION).name === "プロボケイション", "PROVOCATION")
assert(getCard(FOXIN).name === "作戦参謀フォクシン", "FOXIN")
assert(getCard(GEMINI).name === "魔導双神ジェミナイズ", "GEMINI")

function provocation(seed: string, foxin: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p2"
    s.phase = "main"
    s.players.p1.hand = [PROVOCATION]
    s.players.p1.reserve = 10
    s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    if (foxin) {
        s.players.p2.field.spirits.push(createInstance(FOXIN, s.turn, 1))
        s.magicUsedThisTurn.p1 = 1
    }
    return s
}

console.log("=== #525 プロボケイション：使用回数に数える ===")
{
    const s = provocation("t943-prov", false)
    assert(handleAction(s, "p2", { type: "nextPhase" }) === null, "相手がメインステップを終える")
    assert(!s.players.p1.hand.includes(PROVOCATION), "使用した")
    assert((s.magicUsedThisTurn.p1 ?? 0) === 1, "使用回数に数える")
    assert(s.players.p1.trashCards.includes(PROVOCATION), "使用後はトラッシュへ")
}
console.log("=== #525 プロボケイション：フォクシンの制限を受ける ===")
{
    const s = provocation("t943-prov-foxin", true)
    assert(handleAction(s, "p2", { type: "nextPhase" }) === null, "相手がメインステップを終える")
    assert(s.players.p1.hand.includes(PROVOCATION), "このターンすでに使っていれば使用できない")
}

console.log("=== #526 ジェミナイズ：コストを支払わない使用も、フォクシンの制限を受ける ===")
{
    const s = createGame("t943-gemini", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    const gemini = createInstance(GEMINI, s.turn, 5)
    s.players.p1.field.spirits.push(gemini, createInstance(FOXIN, s.turn, 1))
    s.players.p1.hand = [DELIVERY]
    s.magicUsedThisTurn.p1 = 1
    resolveAction(s, "p1", gemini, { type: "magicFreeUseFromHandOrTegamoto" } as never)
    assert(s.players.p1.hand.includes(DELIVERY), "このターンすでに使っていれば使用できない")
    assert((s.magicUsedThisTurn.p1 ?? 0) === 1, "使用回数は増えない")
}

console.log("すべてのチェックに合格しました 🎉（part943）")
