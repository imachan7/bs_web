// smoke パート1032（AI 段階2・evaluateBoard の各項目。docs/design/AI_OPPONENT.md §8.2）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
    viewFor,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { BOARD_WEIGHTS as W, evaluateBoard } from "../../server/src/ai/boardEval"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const NEXUS = "BS01-098" // 燃えさかる戦場（赤のネクサス）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).type === "spirit", "VANILLAはスピリット")
    assert(getCard(NEXUS).name === "燃えさかる戦場" && getCard(NEXUS).type === "nexus", "NEXUSはネクサス")
}

// 両者の盤面を同じ素の状態にそろえる。以降の差分はテストごとに1点だけ足す
function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.life = 5
        p.reserve = 0
        p.hand = []
        p.deck = Array.from({ length: 20 }, () => VANILLA)
        p.field.spirits = []
        p.field.nexuses = []
    }
    return s
}

function putSpirit(s: GameState, pid: PlayerId, cores = 1, rested = false, tempBp = 0): void {
    const inst = createInstance(VANILLA, s.turn, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    // refreshLevelAsOverrides が作り直す写しなので、設定は最後に入れる
    inst.tempBpBuff = tempBp
}

function putNexus(s: GameState, pid: PlayerId, cores = 1): void {
    s.players[pid].field.nexuses.push(createInstance(NEXUS, s.turn, cores))
    refreshLevelAsOverrides(s)
}

// p1 視点の評価
function evalP1(s: GameState): number {
    return evaluateBoard(viewFor(s, "p1"), "p1")
}

console.log("=== 1. 同じ盤面の符号（自分−相手）と反転 ===")
{
    const s = base("sym1")
    s.players.p1.life = 4
    putSpirit(s, "p1", 1, false, 2000)
    putSpirit(s, "p2", 2, true)
    putNexus(s, "p2", 1)
    s.players.p2.reserve = 3
    const v = viewFor(s, "p1")
    const e1 = evaluateBoard(v, "p1")
    const e2 = evaluateBoard(v, "p2")
    assert(e1 === -e2, `p1視点とp2視点は符号が反転する（${e1} / ${e2}）`)
    assert(e1 !== 0, "非自明な盤面では0にならない")
}

console.log("=== 2. 同じ盤面を両側に置き換えると符号が反転する ===")
{
    const a = base("swapA")
    putSpirit(a, "p1", 1, false, 3000)
    const b = base("swapB")
    putSpirit(b, "p2", 1, false, 3000)
    assert(evalP1(a) === -evalP1(b), `自分に置いた盤面と相手に置いた盤面は符号が反転（${evalP1(a)} / ${evalP1(b)}）`)
}

console.log("=== 3. ライフ（ライフが多いほど高い。1以下で追加の減点） ===")
{
    const more = base("life1")
    more.players.p1.life = 5
    const less = base("life2")
    less.players.p1.life = 4
    assert(evalP1(more) - evalP1(less) === W.LIFE_PER, "ライフ1つ分は LIFE_PER")

    const two = base("life3")
    two.players.p1.life = 2
    const one = base("life4")
    one.players.p1.life = 1
    assert(evalP1(two) - evalP1(one) === W.LIFE_PER + W.LIFE_LOW_PENALTY, "ライフ2→1は LIFE_PER＋LIFE_LOW_PENALTY")
}

console.log("=== 4. スピリット（BP・シンボル・回復状態） ===")
{
    const strong = base("bp1")
    putSpirit(strong, "p1", 1, false, 2000)
    const weak = base("bp2")
    putSpirit(weak, "p1", 1, false, 0)
    assert(evalP1(strong) > evalP1(weak), "BPが高い（2000増えた）ほど高い")
    assert(evalP1(strong) - evalP1(weak) === 2 * W.SPIRIT_BP, "BP2000増は SPIRIT_BP×2")

    const untapped = base("rest1")
    putSpirit(untapped, "p1", 1, false)
    putSpirit(untapped, "p2", 1, false)
    const rested = base("rest2")
    putSpirit(rested, "p1", 1, true)
    putSpirit(rested, "p2", 1, false)
    assert(
        evalP1(untapped) - evalP1(rested) === W.SPIRIT_UNTAPPED - W.NO_UNTAPPED_THREAT,
        "回復状態の加点と、回復が0で相手に打点ありの減点の差",
    )
}

console.log("=== 5. 回復状態のスピリットが0・相手にスピリットあり（減点） ===")
{
    // 相手にスピリットがいないときは減点されない（回復1体の加点 SPIRIT_UNTAPPED だけ増える）
    const restedNoOpp = base("threat1")
    putSpirit(restedNoOpp, "p1", 1, true)
    const untappedNoOpp = base("threat2")
    putSpirit(untappedNoOpp, "p1", 1, false)
    assert(
        evalP1(untappedNoOpp) - evalP1(restedNoOpp) === W.SPIRIT_UNTAPPED,
        "相手にスピリットがいなければ、回復が0でも減点されない",
    )
    // 相手にスピリットがいるときは、回復が0だと NO_UNTAPPED_THREAT（上の§4と同じ差を、相手の盤面を揃えて確かめる）
    const restedOpp = base("threat3")
    putSpirit(restedOpp, "p1", 1, true)
    putSpirit(restedOpp, "p2", 1, true)
    const untappedOpp = base("threat4")
    putSpirit(untappedOpp, "p1", 1, false)
    putSpirit(untappedOpp, "p2", 1, true)
    assert(
        evalP1(untappedOpp) - evalP1(restedOpp) === W.SPIRIT_UNTAPPED - W.NO_UNTAPPED_THREAT,
        "相手にスピリットがいるとき、回復が0なら NO_UNTAPPED_THREAT",
    )
}

console.log("=== 6. ネクサス（置いてあると高い。レベルが高いほど高い） ===")
{
    const with1 = base("nexus1")
    putNexus(with1, "p1", 1)
    const without = base("nexus2")
    assert(evalP1(with1) > evalP1(without), "ネクサスがあると高い")
    assert(evalP1(with1) - evalP1(without) >= W.NEXUS_BASE, "ネクサス1つは最低 NEXUS_BASE 以上")
}

console.log("=== 7. 場のコア（スピリット・ネクサスの上） ===")
{
    const more = base("fcore1")
    putNexus(more, "p1", 2)
    const less = base("fcore2")
    putNexus(less, "p1", 1)
    assert(evalP1(more) > evalP1(less), "場のコアが多いほど高い")
}

console.log("=== 8. リザーブのコア（上限で頭打ち） ===")
{
    const more = base("res1")
    more.players.p1.reserve = 5
    const less = base("res2")
    less.players.p1.reserve = 3
    assert(evalP1(more) - evalP1(less) === 2 * W.RESERVE_CORE, "リザーブ2個ぶんは RESERVE_CORE×2")

    const capped = base("res3")
    capped.players.p1.reserve = W.RESERVE_CORE_CAP
    const over = base("res4")
    over.players.p1.reserve = W.RESERVE_CORE_CAP + 3
    assert(evalP1(capped) === evalP1(over), "上限を超えたリザーブは増えても値が変わらない")
}

console.log("=== 9. 手札（枚数のみ。上限で頭打ち） ===")
{
    const more = base("hand1")
    more.players.p1.hand = Array.from({ length: 3 }, () => VANILLA)
    const less = base("hand2")
    less.players.p1.hand = Array.from({ length: 2 }, () => VANILLA)
    assert(evalP1(more) - evalP1(less) === W.HAND_CARD, "手札1枚ぶんは HAND_CARD")

    const capped = base("hand3")
    capped.players.p1.hand = Array.from({ length: W.HAND_CARD_CAP }, () => VANILLA)
    const over = base("hand4")
    over.players.p1.hand = Array.from({ length: W.HAND_CARD_CAP + 2 }, () => VANILLA)
    assert(evalP1(capped) === evalP1(over), "上限を超えた手札は増えても値が変わらない")
}

console.log("=== 10. デッキ残り（5枚以下でデッキ切れの減点） ===")
{
    const safe = base("deck1")
    safe.players.p1.deck = Array.from({ length: 8 }, () => VANILLA)
    const low = base("deck2")
    low.players.p1.deck = Array.from({ length: 3 }, () => VANILLA)
    assert(evalP1(safe) > evalP1(low), "デッキ残りが少ないと低い")
    assert(evalP1(low) - evalP1(safe) === -(W.DECK_LOW_THRESHOLD - 3) * W.DECK_LOW_PER, "残り3は (5−3)×DECK_LOW_PER の減点")
    const five = base("deck4")
    five.players.p1.deck = Array.from({ length: W.DECK_LOW_THRESHOLD }, () => VANILLA)
    assert(evalP1(five) === evalP1(safe), "残り5ちょうどは減点なし（閾値の外）")
}

console.log("=== 11. 勝敗が決まっている局面は ±WIN ===")
{
    const s = base("win1")
    const v = { ...viewFor(s, "p1"), winner: "p1" as const }
    assert(evaluateBoard(v, "p1") === W.WIN, "自分の勝ちは +WIN")
    assert(evaluateBoard(v, "p2") === -W.WIN, "相手視点は −WIN")
    const lose = { ...viewFor(s, "p1"), winner: "p2" as const }
    assert(evaluateBoard(lose, "p1") === -W.WIN, "自分の負けは −WIN")
}

console.log("すべてのチェックに合格しました 🎉（part1032）")
