// smoke パート902（勝敗の確定を1か所に：lifeGate.settleLifeZero。#437 R10。デッキ切れはスタートステップで判定：公式マニュアル VICTORY CONDITIONS）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { payDeckMillNegateCost } from "../../server/src/logic/zones/mill"
import { draw } from "../../server/src/logic/GameState"

const SWORD = "BS08-064" // 鳳翼の聖剣（Lv2：相手のスピリットの効果によるデッキ破棄を、ライフ1個をリザーブに置いて無効）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SWORD).name === "鳳翼の聖剣", "SWORDは鳳翼の聖剣")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.players.p1.deck = Array.from({ length: 20 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 20 }, () => VANILLA)
    return s
}

console.log("=== R10-1. 相手のライフをリザーブへ置いて0にすると勝つ（ムサシードの opponentLifeToReserve） ===")
{
    const s = game("p902-1")
    s.players.p2.life = 2
    resolveAction(s, "p1", null, { type: "opponentLifeToReserve", count: 2 })
    assert(s.players.p2.life === 0 && s.winner === "p1", `p1 の勝利（ライフ${s.players.p2.life}・勝者${String(s.winner)}）`)
}

console.log("=== R10-2. 【聖命】の置き換え（相手のライフから直接取る removeCores）で0にすると勝つ ===")
{
    const s = game("p902-2")
    s.players.p2.life = 1
    resolveAction(s, "p1", null, { type: "removeCores", side: "opponent", from: ["life"], count: 1 } as Parameters<typeof resolveAction>[3])
    assert(s.players.p2.life === 0 && s.winner === "p1", `p1 の勝利（ライフ${s.players.p2.life}・勝者${String(s.winner)}）`)
}

console.log("=== R10-3. デッキ破棄の無効をライフで払って0になると負ける（鳳翼の聖剣） ===")
{
    const s = game("p902-3")
    const sword = createInstance(SWORD, s.turn, 2)
    s.players.p2.field.nexuses.push(sword)
    refreshLevelAsOverrides(s)
    s.players.p2.life = 1
    const effect = getCard(SWORD).effects.find((e) => e.kind === "deckMillNegate") as Parameters<typeof payDeckMillNegateCost>[3]
    payDeckMillNegateCost(s, "p2", sword, effect)
    assert(s.players.p2.life === 0 && s.winner === "p1", `払ってライフ0なら p2 の負け（ライフ${s.players.p2.life}・勝者${String(s.winner)}）`)
}

console.log("=== 最後の網：勝敗を確定しない経路でライフが0になっても、操作の終わりで負けにする ===")
{
    const s = game("p902-net")
    s.players.p2.life = 0 // どこかの経路が確定し忘れた状態
    handleAction(s, "p1", { type: "nextPhase" })
    assert(s.winner === "p1", `操作の終わりで p1 の勝利（${String(s.winner)}）`)
}

console.log("=== デッキ切れ：0枚から引こうとしても負けない（効果のドロー・お互いのドロー） ===")
{
    const s = game("p902-draw")
    s.players.p1.deck = []
    s.players.p2.deck = [VANILLA]
    const hand1 = s.players.p1.hand.length
    draw(s, "p1", 2)
    assert(s.winner === null && s.players.p1.hand.length === hand1, "0枚から引こうとしても負けず、手札も増えない")
    draw(s, "p2", 2)
    assert(s.winner === null && s.players.p2.deck.length === 0, "1枚だけ残っていれば1枚引いて終わる（負けない）")
}

console.log("=== デッキ切れ：自分のスタートステップ開始時にデッキが0枚なら負け ===")
{
    const s = game("p902-start")
    s.turnPlayer = "p2"
    s.players.p2.deck = []
    runTurnStart(s)
    assert(s.winner === "p1" && s.phase === "start", `p2 のスタートステップで p1 の勝利（${String(s.winner)}・${s.phase}）`)
}

console.log("すべてのチェックに合格しました 🎉（part902）")
