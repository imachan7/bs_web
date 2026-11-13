// smoke パート939（手札の使用禁止の範囲。#528。2026-11-14 ユーザー確認）
//   - 「手札の〜を使えない」は手元からの使用・召喚には掛からない（ミカファール Q2592 と同じ考え方）
//   - 封渦斬「相手はマジックカードを使用できない」は手札に限らないので、手元からの使用も止める
import { assert, createGame, getCard, handleAction, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const FUUZAN = "BS14-112" // 封渦斬（バースト：このターンの間、相手はマジックカードを使用できない）
const DELIVERY = "BS11-081" // ライトニングデリバリー（黄・コスト3のマジック）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(FUUZAN).name === "封渦斬", "FUUZAN")
assert(getCard(DELIVERY).type === "magic", "DELIVERY はマジック")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "yellow" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    return s
}

console.log("=== 封渦斬：手元のマジックも使用できない ===")
{
    const s = game("t939-fuuzan")
    const burst = (getCard(FUUZAN).effects.find((e) => e.id === "BS14-112-e1") as { action: unknown }).action as never
    resolveAction(s, "p2", null, burst, undefined, undefined, "magic")
    s.players.p1.hand = [DELIVERY]
    s.players.p1.tegamoto = [DELIVERY]
    s.players.p1.tegamotoPlayable = [DELIVERY]
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, fromTegamoto: true, timing: "flash" }) !== null, "手元からも使用できない")
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) !== null, "手札からも使用できない")
}

console.log("=== 「黄以外の手札のカードを使えない」：手元からの召喚には掛からない ===")
{
    const s = game("t939-handban")
    resolveAction(s, "p2", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "cantUseHandCardsForPid", allowedColor: "yellow" } }], duration: "turn" } as never, undefined, undefined, "magic")
    s.players.p1.hand = [VANILLA]
    s.players.p1.tegamoto = [VANILLA]
    s.players.p1.tegamotoPlayable = [VANILLA]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) !== null, "テスト前提: 手札からは召喚できない")
    const err = handleAction(s, "p1", { type: "summon", handIndex: 0, fromTegamoto: true })
    assert(err === null, `手元からは召喚できる（${err}）`)
}

console.log("すべてのチェックに合格しました 🎉（part939）")
