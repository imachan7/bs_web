// smoke パート545
//   - returnToDeckBottom target:"self"（このスピリットをデッキの下に戻す▶）
//   - soulCoreToTrash（自分の[ソウルコア]をトラッシュに置く▶）と pay での成否
//   - マジック使用の支払いに[ソウルコア]を使ったら summonPaidWithSoulCore が立つ
//   - AuraCondition.ownSpiritMatches
import { act, assert, createGame, createInstance, enableSoulCore, resolveAction } from "./helpers"
import { checkAuraCondition } from "../../shared/rules/bp"
import type { GameState, PlayerId } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        p.reserve = 20
        p.hand = []
        p.deck = Array.from({ length: 30 }, () => "BS01-002")
        p.field.spirits = []
        p.field.nexuses = []
    }
    return s
}

console.log("=== 1. returnToDeckBottom self ===")
{
    const s = game("545a")
    const me = createInstance("BS01-006", 1, 1)
    s.players.p1.field.spirits.push(me)
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", me, { type: "returnToDeckBottom", target: "self" })
    assert(s.players.p1.field.spirits.length === 0 && s.players.p1.deck.length === deckBefore + 1 && s.players.p1.deck.at(-1) === "BS01-006", "自身がデッキの下に戻る")
}

console.log("=== 2. soulCoreToTrash ===")
{
    const s = game("545b")
    enableSoulCore(s)
    resolveAction(s, "p1", null, { type: "pay", cost: { type: "soulCoreToTrash" }, then: { type: "draw", count: 1 } })
    assert(s.players.p1.soulCore?.zone === "trash" && s.players.p1.hand.length === 1, "リザーブの[ソウルコア]をトラッシュへ置いて引く")
    resolveAction(s, "p1", null, { type: "pay", cost: { type: "soulCoreToTrash" }, then: { type: "draw", count: 1 } })
    assert(s.players.p1.hand.length === 1, "すでにトラッシュなら払えず引かない")
}

console.log("=== 3. マジック使用で summonPaidWithSoulCore ===")
{
    const s = game("545c")
    enableSoulCore(s)
    s.players.p1.reserve = 2
    s.players.p1.hand = ["BS01-123"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, paySoulCoreFromReserve: true }) === null, "ソウルコアで使用")
    assert(s.summonPaidWithSoulCore === true, "ソウルコア支払いが記録される")
    s.players.p1.reserve = 5
    s.players.p1.hand = ["BS01-123"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "通常コアで使用")
    assert(s.summonPaidWithSoulCore !== true, "次の使用でリセットされる")
}

console.log("=== 4. ownSpiritMatches ===")
{
    const s = game("545d")
    assert(!checkAuraCondition(s, "p1", { ownSpiritMatches: { color: "red" } }), "スピリットがいなければ不成立")
    s.players.p1.field.spirits.push(createInstance("BS01-006", 1, 1))
    assert(checkAuraCondition(s, "p1", { ownSpiritMatches: { color: "red" } }), "赤のスピリットがいれば成立")
    assert(!checkAuraCondition(s, "p1", { ownSpiritMatches: { color: "blue" } }), "青のスピリットがいなければ不成立")
}
