// smoke パート361（2026-09-24 ユーザー確認の2点：①手札を増やせない間は「すべて手札に戻す」も発揮しない
// ②両陣営の回復も封印された魔導書の片側への変更に従い、非対話では得な効果として相手を外す）
import { assert, createGame, createInstance, getCard, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const CHOHAKKAI = "BS15-052" // 天蒼元帥チョウハッカイ（globalConstraint noHandGainByEffect）
const GRIMOIRE = "BS02-087" // 封印された魔導書（bothSidesTargetRedirect・自分のターンのみ）
const VANILLA2 = "BS01-005" // コスト2のバニラ

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CHOHAKKAI).name === "天蒼元帥チョウハッカイ", "CHOHAKKAIはチョウハッカイ")
    assert(getCard(GRIMOIRE).name === "封印された魔導書" && getCard(GRIMOIRE).type === "nexus", "GRIMOIREは封印された魔導書")
    assert(getCard(VANILLA2).cost === 2 && getCard(VANILLA2).effects.length === 0, "VANILLA2はコスト2のバニラ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        s.players[pid].field.spirits = []
        s.players[pid].field.nexuses = []
        s.players[pid].hand = []
    }
    return s
}
const put = (s: GameState, pid: PlayerId, cardId: string, cores: number, rested = false) => {
    const inst = createInstance(cardId, s.turn, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== 1. 手札を増やせない間は「すべて手札に戻す」も発揮しない ===")
for (const withChohakkai of [true, false]) {
    const s = game(`bounce-all-${withChohakkai}`)
    if (withChohakkai) put(s, "p2", CHOHAKKAI, 1)
    put(s, "p2", VANILLA2, 1)
    put(s, "p1", VANILLA2, 1)
    resolveAction(s, "p1", null, { type: "returnToHand", count: 1, all: true, anySide: true, filter: { cost: { max: 2 } } }, undefined, undefined, "magic")
    const handGained = s.players.p1.hand.length + s.players.p2.hand.length
    if (withChohakkai) assert(handGained === 0, "チョウハッカイがいる間は誰も手札に戻らない")
    else assert(handGained === 2, "対照：チョウハッカイがいなければ両陣営のコスト2が戻る")
}

console.log("=== 2. 両陣営の回復は封印された魔導書に従い、非対話では持ち主側だけ ===")
for (const withGrimoire of [true, false]) {
    const s = game(`refresh-redirect-${withGrimoire}`)
    if (withGrimoire) s.players.p1.field.nexuses.push(createInstance(GRIMOIRE, s.turn, 0))
    const mine = put(s, "p1", VANILLA2, 1, true)
    const theirs = put(s, "p2", VANILLA2, 1, true)
    resolveAction(s, "p1", null, { type: "refreshOne", all: true, anySide: true, filter: { cost: { min: 2, max: 2 } } }, undefined, undefined, "magic")
    if (withGrimoire) assert(!mine.isRested && theirs.isRested, "魔導書の持ち主側だけ回復し、相手側は疲労のまま")
    else assert(!mine.isRested && !theirs.isRested, "対照：魔導書が無ければ両陣営が回復する")
}

console.log("すべてのチェックに合格しました 🎉（part361）")
