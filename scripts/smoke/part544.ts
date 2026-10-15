// smoke パート544
//   - reveal.dest "summonOrPlace"（ネクサスは配置、スピリットは召喚）
//   - pay の cost に手札からの toDeck（見せてデッキの下に戻す▶ドロー）
import { assert, createGame, resolveAction, legacy } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import type { GameState, PlayerId } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
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

console.log("=== 1. summonOrPlace ===")
{
    const nexusId = [...CARD_DB.values()].find((c) => c.type === "nexus" && c.cost <= 3)!.cardId
    const s = game("544a")
    s.players.p1.deck.unshift(nexusId)
    resolveAction(s, "p1", null, { type: "reveal", count: 1, pick: { cardType: "nexus" }, pickCount: 1, dest: "summonOrPlace", rest: "deckBottom" })
    assert(s.players.p1.field.nexuses.length === 1, "ネクサスは配置される")
}

console.log("=== 2. pay の toDeck コスト ===")
{
    const s = game("544b")
    s.players.p1.hand = ["BS01-002"]
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "pay", cost: legacy({ type: "toDeck", from: "hand", position: "bottom", count: 1, pick: { cardType: "spirit" }, revealed: true }), then: { type: "draw", count: 1 } })
    assert(s.players.p1.hand.length === 1 && s.players.p1.deck.length === deckBefore, "戻して1枚引いた")
    const t = game("544c")
    resolveAction(t, "p1", null, { type: "pay", cost: legacy({ type: "toDeck", from: "hand", position: "bottom", count: 1, pick: { cardType: "spirit" }, revealed: true }), then: { type: "draw", count: 1 } })
    assert(t.players.p1.hand.length === 0, "戻すカードがなければ引かない")
}
