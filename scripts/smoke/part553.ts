// smoke パート553
//   - TargetFilter orMinBp（26RBS02-045「5000以下か8000以上」）
//   - reveal countPer keishoExcluded＋dest trash（26RBS02-018）／dest placeNexus（26RBS02-064）
//   - AuraCondition ownAttacksAtLeast＋unblockableBy noSoulCore（26RBS02-057）
//   - bpMinus.per keishoExcludedCount（26RBS02-053）
import { assert, createGame, createInstance, resolveAction } from "./helpers"
import { getCard } from "../../server/src/logic/GameState"
import { matchesTarget, effectiveBp, checkAuraCondition } from "../../shared/rules"
import { canBlock } from "../../shared/block"
import type { GameState, PlayerId } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        s.players[pid].field.spirits = []
        s.players[pid].field.nexuses = []
    }
    return s
}

console.log("=== 1. orMinBp：以下か以上のどちらかに合えばよい ===")
{
    const s = game("553a")
    const a = createInstance("BS01-006", 1, 1)
    s.players.p2.field.spirits.push(a)
    const bp = effectiveBp(s, "p2", a)
    assert(!matchesTarget(s, "p2", a, { maxBp: bp - 1000 }), "以下だけなら外れる")
    assert(matchesTarget(s, "p2", a, { maxBp: bp - 1000, orMinBp: bp }), "以上側に合えば対象")
    assert(!matchesTarget(s, "p2", a, { maxBp: bp - 1000, orMinBp: bp + 1000 }), "どちらにも合わなければ外れる")
}

console.log("=== 2. 継召で除外した数だけオープンして1枚破棄 ===")
{
    const s = game("553b")
    s.keishoExcludedCardIds = ["BS01-001", "BS01-002"]
    s.players.p1.deck = ["BS01-003", "BS01-004", "BS01-005", "BS01-006"]
    const trashBefore = s.players.p1.trashCards.length
    resolveAction(s, "p1", null, { type: "reveal", countPer: { keishoExcluded: true }, pick: {}, pickCount: 1, dest: "trash", rest: "deckBottom" })
    assert(s.players.p1.trashCards.length === trashBefore + 1, "オープンした2枚のうち1枚を破棄した")
    assert(s.players.p1.deck.length === 3, "残り1枚はデッキの下に戻り、2枚ぶん減る")
    s.keishoExcludedCardIds = []
    resolveAction(s, "p1", null, { type: "reveal", countPer: { keishoExcluded: true }, pick: {}, pickCount: 1, dest: "trash", rest: "deckBottom" })
    assert(s.players.p1.deck.length === 3, "継召していなければ0枚＝オープンしない")
}

console.log("=== 3. オープンしたネクサスをコストを支払わずに配置 ===")
{
    const s = game("553c")
    const nexusId = "BS01-098"
    assert(getCard(nexusId).type === "nexus", "テスト用カードがネクサス")
    s.players.p1.reserve = 5
    s.players.p1.deck = ["BS01-001", nexusId, "BS01-002"]
    resolveAction(s, "p1", null, { type: "reveal", count: 3, pick: { cardType: "nexus" }, pickCount: 1, dest: "placeNexus", rest: "deckBottom" })
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === nexusId), "ネクサスが配置された")
    assert(s.players.p1.deck.length === 2, "残りはデッキの下に戻った")
}

console.log("=== 4. ターンN回目以降のアタックなら[ソウルコア]なしからブロックされない ===")
{
    const s = game("553d")
    s.phase = "attack"
    const effects = getCard("BS01-006").effects as unknown as object[]
    effects.push({ id: "t-ub", kind: "constraint", levels: [1], condition: { ownAttacksAtLeast: 2 }, constraint: { type: "unblockableBy", noSoulCore: true } })
    try {
        const atk = createInstance("BS01-006", 1, 1)
        const blocker = createInstance("BS01-001", 1, 1)
        s.players.p1.field.spirits.push(atk)
        s.players.p2.field.spirits.push(blocker)
        s.attacksThisTurn = 1
        assert(!checkAuraCondition(s, "p1", { ownAttacksAtLeast: 2 }), "1回目のアタックでは成立しない")
        assert(canBlock(s, "p2", blocker, "p1", atk) === null, "1回目はブロックできる")
        s.attacksThisTurn = 2
        assert(canBlock(s, "p2", blocker, "p1", atk) !== null, "2回目は[ソウルコア]なしのスピリットがブロックできない")
        blocker.soulCoreOn = true
        assert(canBlock(s, "p2", blocker, "p1", atk) === null, "[ソウルコア]が載っていればブロックできる")
    } finally {
        effects.pop()
    }
}

console.log("=== 5. BP-の加算（継召で除外した数） ===")
{
    const s = game("553e")
    const foe = createInstance("BS01-006", 1, 1)
    s.players.p2.field.spirits.push(foe)
    s.keishoExcludedCardIds = ["BS01-001", "BS01-002"]
    const bp0 = effectiveBp(s, "p2", foe)
    resolveAction(s, "p1", null, { type: "bpMinus", amount: 2000, per: { counter: "keishoExcludedCount", amount: 1000 } })
    assert(effectiveBp(s, "p2", foe) === bp0 - 4000, "2000＋1000×2枚＝4000下がる")
}
