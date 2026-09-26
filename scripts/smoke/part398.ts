// smoke パート398（M2 if の器：cond.last／cond.count・カウンタ lastMoved・sequence 開始時の記録の消去。docs/design/IF_UNIFY.md §5）
import {
    assert,
    createGame,
    getCard,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"

const MAGIC = "BS01-114" // バスタースピア（赤・マジック・コスト3）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(MAGIC).name === "バスタースピア" && getCard(MAGIC).type === "magic", "MAGICはバスタースピア")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).type === "spirit", "VANILLAはロクケラトプス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

const ifMilledMagicDraw = { type: "if", cond: { last: { cardType: "magic" } }, then: { type: "draw", count: 1 } } as const

console.log("=== 1. mill → if last：破棄したカードが条件を満たせば then ===")
{
    const s = game("hit")
    s.players.p1.deck[1] = MAGIC
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "sequence", actions: [{ type: "mill", count: 2, side: "own" }, ifMilledMagicDraw] })
    assert(s.lastMoved?.length === 2 && s.lastMoved.includes(MAGIC), "破棄した2枚が lastMoved に記録される")
    assert(s.players.p1.hand.length === hand + 1, "マジックを破棄したので1枚引く")
}

console.log("=== 2. mill → if last：条件を満たさなければ else／else が無ければ何もしない ===")
{
    const s = game("miss")
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "sequence", actions: [{ type: "mill", count: 2, side: "own" }, ifMilledMagicDraw] })
    assert(s.players.p1.hand.length === hand, "マジックが無いので引かない")
    resolveAction(s, "p1", null, {
        type: "sequence",
        actions: [{ type: "mill", count: 1, side: "own" }, { ...ifMilledMagicDraw, else: { type: "draw", count: 2 } }],
    })
    assert(s.players.p1.hand.length === hand + 2, "else 側で2枚引く")
}

console.log("=== 3. sequence の開始時に前の効果の記録を消す（前半をしなかったら後半も起きない＝Q4） ===")
{
    const s = game("stale")
    s.lastMoved = [MAGIC]
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "sequence", actions: [ifMilledMagicDraw] })
    assert(s.players.p1.hand.length === hand, "前の効果で動いたマジックを見ない")
}

console.log("=== 4. reveal → if last：オープンしたカードで判定する ===")
{
    const s = game("reveal")
    s.players.p1.deck[0] = MAGIC
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, {
        type: "sequence",
        actions: [{ type: "reveal", count: 1, pickCount: 0, rest: "deckBottom" }, ifMilledMagicDraw],
    })
    assert(s.players.p1.hand.length === hand + 1, "オープンしたマジックで条件成立")
}

console.log("=== 5. cond.count：既存カウンタとの比較 ===")
{
    const s = game("count")
    const act = { type: "if", cond: { count: "ownLife", atMost: 3 }, then: { type: "draw", count: 1 } } as const
    s.players.p1.life = 4
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, act)
    assert(s.players.p1.hand.length === hand, "ライフ4では引かない")
    s.players.p1.life = 3
    resolveAction(s, "p1", null, act)
    assert(s.players.p1.hand.length === hand + 1, "ライフ3で引く")
}

console.log("=== 6. カウンタ lastMoved：「破棄したカード1枚につき」 ===")
{
    const s = game("per")
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, {
        type: "sequence",
        actions: [{ type: "mill", count: 3, side: "own" }, { type: "draw", count: 1, countCounter: "lastMoved" }],
    })
    assert(s.players.p1.hand.length === hand + 3, "破棄した3枚ぶん引く")
    s.players.p1.deck = [VANILLA]
    const hand2 = s.players.p1.hand.length
    resolveAction(s, "p1", null, {
        type: "sequence",
        actions: [{ type: "mill", count: 3, side: "own" }, { type: "draw", count: 1, countCounter: "lastMoved" }],
    })
    assert(s.lastMoved?.length === 1 && s.players.p1.hand.length === hand2, "デッキが1枚なら破棄できた1枚で数える（引くデッキは0枚）")
}

console.log("すべてのチェックに合格しました 🎉（part398）")
