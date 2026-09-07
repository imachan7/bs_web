// smoke パート297（簡略化5件を原作どおりにする。2026-09-07 ユーザー指示）
//   #1 BS11-036 冥土の魔女ヘレン: handMagicToTegamotoDraw に max:3 の上限を足す（既存カードは無制限のまま）
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { fireSummonTrigger } from "../../server/src/logic/EffectModules"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

console.log("=== #1 BS11-036 冥土の魔女ヘレン：手元に置けるのは3枚まで（非対話） ===")
{
    const s = game("helen-max3-auto")
    s.players.p1.hand = ["BS01-114", "BS01-115", "BS02-108", "BS02-109"] // 手札にマジックを4枚（非マジック混在なし）
    const deckBefore = s.players.p1.deck.length
    const inst = createInstance("BS11-036", s.turn, 3)
    s.players.p1.field.spirits.push(inst)
    fireSummonTrigger(s, "p1", inst)
    assert(s.players.p1.tegamoto.length === 3, `手元に置けるのは3枚まで（実際は${s.players.p1.tegamoto.length}枚）`)
    assert(s.players.p1.deck.length === deckBefore - 3, "ドローも3枚まで")
    assert(s.players.p1.hand.length === 4, "手札は置かれなかった1枚＋ドローした3枚の4枚になる")
}

console.log("=== #1 BS11-036：対話モードでも3枚で打ち切ってドローに移る ===")
{
    const s = game("helen-max3-interactive")
    s.interactiveTargets = true
    s.players.p1.hand = ["BS01-114", "BS01-115", "BS02-108", "BS02-109"]
    const deckBefore = s.players.p1.deck.length
    const inst = createInstance("BS11-036", s.turn, 3)
    s.players.p1.field.spirits.push(inst)
    fireSummonTrigger(s, "p1", inst)
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "任意効果の発動を確認する")
    let loops = 0
    while (s.pendingChoice && loops < 10) {
        loops++
        const idx = s.pendingChoice.cardIndices?.[0]
        if (idx === undefined) break
        assert(act(s, "p1", { type: "resolveChoice", cardIndex: idx }) === null, "手元に1枚置く")
    }
    assert(loops === 3, `選択は3回で自動的に打ち切られる（実際は${loops}回）`)
    assert(s.pendingChoice === null, "3枚に達したら選択待ちにならない")
    assert(s.players.p1.tegamoto.length === 3, "手元は3枚")
    assert(s.players.p1.deck.length === deckBefore - 3, "ドローは3枚")
}

console.log("=== #1 上限を指定しない既存カード（マジックブック）は従来どおり無制限 ===")
{
    const s = createGame("magicbook-still-unlimited", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "white" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 30
    // マジック4枚 + マジックブック自身
    s.players.p1.hand = ["BS01-114", "BS01-115", "BS02-108", "BS02-109", "BS02-108"]
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "castMagic", handIndex: 4 }) === null, "マジックブックを使用できる")
    assert(s.players.p1.tegamoto.length === 4, "手札にあったマジック4枚すべてを手元へ置ける（上限なし）")
    assert(s.players.p1.deck.length === deckBefore - 4, "4枚ぶんドローする")
}

console.log("すべてのチェックに合格しました 🎉（part297）")
