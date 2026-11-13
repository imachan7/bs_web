// smoke パート933（効果で使うマジックも「使用」：使用の制限・無効化・使用回数の記録が掛かる。#510・#511。RULES_BATSPI_WIKI §6）
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { attachBrave } from "../../server/src/logic/brave"

const MIKAFAL = "BS08-X33" // 堕天使ミカファール：Lv2-3 アタック時、トラッシュの黄のマジック1枚を手札にあるときと同様に使用できる
const PERYTON = "BS11-058" // 神弓鳥ペリュトーン：合体アタック時、デッキの上をオープンし、マジックならフラッシュ効果をコストを支払わずに即時に使用できる
const FOXIN = "BS03-079" // 作戦参謀フォクシン：お互い、ターンに1回しかマジックの効果を使用できない
const MIRROR = "BS02-083" // 鏡の回廊：Lv2『お互いのアタックステップ』マジックの効果を無効にできる
const DELIVERY = "BS11-081" // ライトニングデリバリー（黄・コスト3・フラッシュ：1枚ドロー）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(MIKAFAL).name === "堕天使ミカファール", "MIKAFAL")
assert(getCard(PERYTON).name === "神弓鳥ペリュトーン" && getCard(PERYTON).type === "brave", "PERYTON")
assert(getCard(FOXIN).name === "作戦参謀フォクシン", "FOXIN")
assert(getCard(MIRROR).name === "鏡の回廊", "MIRROR")
assert(getCard(DELIVERY).name === "ライトニングデリバリー", "DELIVERY")

const actionOf = (cardId: string, effectId: string) => (getCard(cardId).effects.find((e) => e.id === effectId) as { action: unknown }).action as never

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.reserve = 10
    s.players.p1.hand = []
    s.players.p1.deck = Array.from({ length: 20 }, () => VANILLA)
    return s
}

console.log("=== #510 ミカファール：トラッシュからの使用も「使用」。記録され、フォクシンの制限を受ける ===")
{
    const s = game("t933-mika")
    const mika = createInstance(MIKAFAL, s.turn, 2)
    s.players.p1.field.spirits.push(mika)
    s.players.p1.trashCards = [DELIVERY]
    resolveAction(s, "p1", mika, actionOf(MIKAFAL, "BS08-X33-e2"))
    assert(s.players.p1.hand.length === 1, "使用できて効果（1枚ドロー）が解決した")
    assert((s.magicUsedThisTurn.p1 ?? 0) === 1, "使用回数に数える")
}
{
    const s = game("t933-mika-foxin")
    const mika = createInstance(MIKAFAL, s.turn, 2)
    s.players.p1.field.spirits.push(mika, createInstance(FOXIN, s.turn, 1))
    s.players.p1.trashCards = [DELIVERY]
    s.magicUsedThisTurn.p1 = 1
    resolveAction(s, "p1", mika, actionOf(MIKAFAL, "BS08-X33-e2"))
    assert(s.players.p1.hand.length === 0, "このターンすでに使っていれば使用できない（フォクシン）")
    assert(s.players.p1.trashCards.includes(DELIVERY), "カードはトラッシュに残る")
}

function perytonGame(seed: string): { s: GameState; host: ReturnType<typeof createInstance> } {
    const s = game(seed)
    const host = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(host)
    attachBrave(s, "p1", host, createInstance(PERYTON, s.turn, 0))
    s.players.p1.deck = [DELIVERY, ...Array.from({ length: 20 }, () => VANILLA)]
    return { s, host }
}

console.log("=== #511 ペリュトーン：オープンしたマジックの使用も「使用」 ===")
{
    const { s, host } = perytonGame("t933-pery")
    resolveAction(s, "p1", host, actionOf(PERYTON, "BS11-058-e1"))
    assert((s.magicUsedThisTurn.p1 ?? 0) === 1, "使用回数に数える")
    assert(s.players.p1.trashCards.includes(DELIVERY), "使用後はトラッシュへ")
    assert(s.players.p1.hand.length === 1 && !s.players.p1.hand.includes(DELIVERY), "効果（1枚ドロー）が解決した")
}
{
    const { s, host } = perytonGame("t933-pery-mirror")
    s.players.p2.field.nexuses.push(createInstance(MIRROR, s.turn, 5))
    resolveAction(s, "p1", host, actionOf(PERYTON, "BS11-058-e1"))
    assert(s.players.p1.hand.length === 0, "鏡の回廊で無効にされ、ドローしない")
}
{
    const { s, host } = perytonGame("t933-pery-foxin")
    s.players.p1.field.spirits.push(createInstance(FOXIN, s.turn, 1))
    s.magicUsedThisTurn.p1 = 1
    resolveAction(s, "p1", host, actionOf(PERYTON, "BS11-058-e1"))
    assert(s.players.p1.hand.includes(DELIVERY), "使用できなければ「使用しない」として手札に加える")
    assert(s.players.p1.hand.length === 1, "効果は解決しない")
}

console.log("すべてのチェックに合格しました 🎉（part933）")
