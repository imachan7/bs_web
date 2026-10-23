// smoke パート665（BS14-070 ダイヤドカリ：【合体時】の aura target:"self" は合体スピリット（ホスト）に掛かる。BRAVE.md §12.3）
import { assert, act, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const DIAMOND = "BS14-070" // ダイヤドカリ（ブレイヴ）
const DOUBLE = "BS04-010" // 雷帝エール・クレル（効果は【転召】のみ）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(DIAMOND).name === "ダイヤドカリ" && getCard(DIAMOND).type === "brave", "DIAMONDはダイヤドカリ（ブレイヴ）")
    assert(getCard(DOUBLE).name === "雷帝エール・クレル" && getCard(DOUBLE).type === "spirit", "DOUBLEは雷帝エール・クレル")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, 1)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function bpGainedByBlocking(combined: boolean): number {
    const s = game(`p665-${combined}`)
    const host = put(s, "p1", DOUBLE)
    if (combined) {
        const brave = put(s, "p1", DIAMOND)
        s.turnPlayer = "p1"
        s.priorityPlayer = "p1"
        assert(act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, "合体が通る")
    }
    const foe = put(s, "p2", VANILLA)
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    assert(act(s, "p2", { type: "nextPhase" }) === null, "相手がアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: foe.instanceId }) === null, "相手のアタック")
    while (s.isFlashTiming && s.battle) assert(act(s, s.priorityPlayer, { type: "pass" }) === null, "フラッシュを閉じる")
    const before = effectiveBp(s, "p1", host)
    assert(act(s, "p1", { type: "block", instanceId: host.instanceId }) === null, "ブロック")
    return effectiveBp(s, "p1", host) - before
}

console.log("=== 1. 合体中、ブロック時に合体スピリットが BP+5000 ===")
assert(bpGainedByBlocking(true) === 5000, "ダイヤドカリ合体中：ブロック時にBP+5000")
assert(bpGainedByBlocking(false) === 0, "合体していなければ変わらない")

console.log("すべてのチェックに合格しました 🎉（part665）")
