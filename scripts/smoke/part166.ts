// smoke パート166（「好きなだけ〜して、その枚数ぶんドローする」効果の順序）
//
//   BS08-X33 堕天使ミカファール（召喚時）  手札を好きなだけ破棄し、その枚数ぶんドロー
//   BS02-108 マジックブック（メイン）      手札のマジックを好きなだけ手元に置き、その枚数ぶんドロー
//
// 2026-08-10 に実対戦で「無限にカードを引ける」不具合として発覚したもの。
// 原因は **1枚破棄するたびに即ドローして、続けて破棄するか尋ねていた**こと。
// ドローで手札が補充されるので、引いたカードをそのまま次の破棄対象にでき、
// 手札3枚の状態からデッキ36枚を全部引き切れていた（デッキ切れまで到達する）。
//
// 正しい順序は「破棄をすべて決める → 破棄する → その枚数ぶんドロー」。
// **引いたカードを破棄対象にできないこと**が要点なので、そこを重点的に見る。
import { act, assert, createGame, createInstance } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireSummonTrigger, resolveMagic } from "../../server/src/logic/EffectModules"

// ミカファールを場に出して召喚時効果を発火させる（対話モード）
function summonMikafar(seed: string, hand: string[], interactive = true): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    s.interactiveTargets = interactive
    s.players.p1.hand = [...hand]
    const inst = createInstance("BS08-X33", s.turn, 3)
    s.players.p1.field.spirits.push(inst)
    fireSummonTrigger(s, "p1", inst)
    return s
}
// 破棄する手札を1枚選ぶ（先頭の候補）
function discardFirst(s: GameState): void {
    const idx = s.pendingChoice?.cardIndices?.[0]
    assert(idx !== undefined, "破棄候補が出ている")
    if (idx === undefined) return
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: idx }) === null, "手札を1枚選ぶ")
}
// 「これ以上破棄しない」を選ぶ
function stopDiscarding(s: GameState): void {
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "破棄をやめる（スキップ）")
}

console.log("=== 引いたカードは破棄できない（無限ドローの回帰テスト） ===")
{
    const s = summonMikafar("mikafar-no-infinite", ["BS02-049", "BS02-051", "BS02-053"])
    const deckBefore = s.players.p1.deck.length
    // 手札3枚を順に破棄していく。**3回で候補が尽きる**のが正しい
    let loops = 0
    while (s.pendingChoice && loops < 50) {
        loops++
        discardFirst(s)
    }
    assert(loops === 3, `破棄できるのは初期手札の3枚まで（実際は${loops}回）`)
    assert(s.pendingChoice === null, "手札を出し切ったら選択は終わる")
    assert(s.players.p1.trashCards.length === 3, "破棄されたのは3枚")
    assert(s.players.p1.hand.length === 3, "破棄した3枚ぶんドローして手札は3枚")
    assert(s.players.p1.deck.length === deckBefore - 3, "デッキは3枚しか減っていない")
    // 破棄した3枚はトラッシュに積まれている（デッキ側にも同名カードがあるので手札の中身では判定しない）
    assert(
        ["BS02-049", "BS02-051", "BS02-053"].every((c) => s.players.p1.trashCards.includes(c)),
        "破棄した3枚がトラッシュにある",
    )
}

console.log("=== 途中でやめれば、そこまでの枚数だけ引く ===")
{
    const s = summonMikafar("mikafar-partial", ["BS02-049", "BS02-051", "BS02-053"])
    const deckBefore = s.players.p1.deck.length
    discardFirst(s)
    assert(s.players.p1.hand.length === 2, "破棄した直後はまだドローしていない（手札は減ったまま）")
    discardFirst(s)
    assert(s.players.p1.hand.length === 1, "2枚目を破棄。この時点でもドローしていない")
    stopDiscarding(s)
    assert(s.pendingChoice === null, "選択は終わる")
    assert(s.players.p1.trashCards.length === 2, "破棄は2枚")
    assert(s.players.p1.hand.length === 1 + 2, "残り1枚＋破棄2枚ぶんのドローで手札は3枚")
    assert(s.players.p1.deck.length === deckBefore - 2, "ドローは2枚だけ")
}

console.log("=== 1枚も破棄しなければ1枚も引かない ===")
{
    const s = summonMikafar("mikafar-skip", ["BS02-049", "BS02-051"])
    const deckBefore = s.players.p1.deck.length
    assert(s.pendingChoice !== null, "選択待ちになっている")
    stopDiscarding(s)
    assert(s.players.p1.hand.length === 2, "手札は減っていない")
    assert(s.players.p1.deck.length === deckBefore, "デッキも減っていない")
    assert(s.players.p1.trashCards.length === 0, "トラッシュも空のまま")
}

console.log("=== 手札が1枚でも「破棄しない」を選べる ===")
{
    const s = summonMikafar("mikafar-one-card", ["BS02-049"])
    assert(s.pendingChoice !== null, "候補が1枚でも選択が出る（勝手に破棄されない）")
    stopDiscarding(s)
    assert(s.players.p1.hand.length === 1, "手札はそのまま")
    assert(s.players.p1.trashCards.length === 0, "破棄されていない")
}

console.log("=== 手札が0枚なら何も起きない ===")
{
    const s = summonMikafar("mikafar-empty", [])
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(s.players.p1.hand.length === 0, "手札は0枚のまま")
}

console.log("=== 非対話（smokeの既定）では従来どおり一括で破棄→ドロー ===")
{
    const s = summonMikafar("mikafar-auto", ["BS02-049", "BS02-051", "BS02-053"], false)
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(s.players.p1.trashCards.length === 3, "手札3枚をすべて破棄")
    assert(s.players.p1.hand.length === 3, "同じ枚数を引く")
}

console.log("=== BS02-108 マジックブック：置いたカードを置き直せない（同型の不具合） ===")
{
    // ミカファールと同じ作りで、こちらは「手札のマジックを手元に置く→置いた枚数ぶんドロー」。
    // 1枚ごとに引くと、引いたマジックカードをそのまま次に置けてしまう
    const s = createGame("magicbook-no-infinite", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "white" })
    s.interactiveTargets = true
    s.players.p1.deck = new Array(30).fill("BS02-108") // デッキをマジックだらけにする
    s.players.p1.hand = ["BS02-108", "BS02-108"]
    const deckBefore = s.players.p1.deck.length
    resolveMagic(s, "p1", "BS02-108", "main", undefined)

    let loops = 0
    while (s.pendingChoice && loops < 50) {
        loops++
        const idx = s.pendingChoice.cardIndices?.[0]
        if (idx === undefined) break
        assert(act(s, "p1", { type: "resolveChoice", cardIndex: idx }) === null, "手札のマジックを1枚置く")
    }
    assert(loops === 2, `置けるのは手札にあった2枚まで（実際は${loops}回）`)
    assert(s.players.p1.tegamoto.length === 2, "手元に置かれたのは2枚")
    assert(s.players.p1.hand.length === 2, "置いた2枚ぶん引いて手札は2枚")
    assert(s.players.p1.deck.length === deckBefore - 2, "デッキは2枚しか減っていない")
}

console.log("--- マジックブック：途中でやめれば、そこまでの枚数だけ引く ---")
{
    const s = createGame("magicbook-partial", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "white" })
    s.interactiveTargets = true
    s.players.p1.hand = ["BS02-108", "BS02-108", "BS02-108"]
    const deckBefore = s.players.p1.deck.length
    resolveMagic(s, "p1", "BS02-108", "main", undefined)
    const idx = s.pendingChoice?.cardIndices?.[0]
    assert(idx !== undefined, "候補が出ている")
    if (idx !== undefined) {
        assert(act(s, "p1", { type: "resolveChoice", cardIndex: idx }) === null, "1枚だけ置く")
    }
    assert(s.players.p1.deck.length === deckBefore, "置いた直後はまだ引いていない")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "そこでやめる")
    assert(s.players.p1.tegamoto.length === 1, "手元は1枚")
    assert(s.players.p1.deck.length === deckBefore - 1, "引いたのは1枚だけ")
}
