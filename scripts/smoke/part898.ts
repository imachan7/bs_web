// smoke パート898（選択待ちに発生源のカードを載せ、選ぶ本人にだけ送る。画面で効果文を見られるようにするため。2026-11-12 ユーザー要望）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, viewFor } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const FLAMEGUST = "BS09-069" // フレイムガスト（赤・マジック・フラッシュ：BP6000以下のスピリット1体を破壊）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const BELD = "BS09-X36" // 魔界七将ベルドゴール（【不死：コスト4/5】）
const DUALD = "BS10-007" // デュアルド（赤・コスト5・Lv1 BP5000）
const MATAN = "BS10-028" // マタンゴル（緑・コスト5・Lv1 BP6000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(FLAMEGUST).name === "フレイムガスト" && getCard(FLAMEGUST).type === "magic", "FLAMEGUSTはフレイムガスト")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).type === "spirit", "VANはロクケラトプス")
    assert(getCard(BELD).name === "魔界七将ベルドゴール" && getCard(BELD).effect.includes("【不死：コスト4/5】"), "BELDはベルドゴール（【不死：コスト4/5】）")
    assert(getCard(DUALD).name === "デュアルド" && getCard(DUALD).cost === 5 && getCard(DUALD).levels[0]!.bp === 5000, "DUALDはデュアルド（コスト5・BP5000）")
    assert(getCard(MATAN).name === "マタンゴル" && getCard(MATAN).levels[0]!.bp === 6000, "MATANはマタンゴル（BP6000）")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        p.reserve = 10
        p.hand = []
        p.burst = null
        p.field.spirits = []
        p.field.nexuses = []
    }
    return s
}

console.log("=== 1. マジックの対象を選ぶ待ち：選ぶ本人にはマジックのカードが届き、相手には届かない ===")
{
    const s = game("source-magic")
    s.players.p1.hand = [FLAMEGUST]
    for (let i = 0; i < 2; i++) s.players.p2.field.spirits.push(createInstance(VAN, s.turn, 1))
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フレイムガストを使える")
    assert(s.pendingChoice?.kind === "target", "対象を選ぶ待ちが立つ")
    assert(viewFor(s, "p1").pendingChoice?.sourceCardId === FLAMEGUST, "選ぶ本人の画面にはフレイムガストが届く")
    assert(viewFor(s, "p2").pendingChoice?.sourceCardId === undefined, "相手の画面には届かない")
}

console.log("=== 2. 【不死】の確認：トラッシュのカードが届く ===")
{
    const s = game("source-fushi")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.phase = "attack"
    s.players.p1.trashCards = [BELD]
    const blocker = createInstance(DUALD, s.turn, 1)
    s.players.p1.field.spirits.push(blocker)
    const attacker = createInstance(MATAN, s.turn, 1)
    s.players.p2.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    act(s, "p2", { type: "attack", instanceId: attacker.instanceId })
    act(s, "p1", { type: "pass" })
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "block", instanceId: blocker.instanceId })
    for (let i = 0; i < 5 && !s.pendingChoice; i++) act(s, s.priorityPlayer, { type: "pass" })
    assert(s.pendingChoice?.fushiSummon !== undefined, "【不死】の確認が出る")
    assert(viewFor(s, "p1").pendingChoice?.sourceCardId === BELD, "選ぶ本人の画面にはベルドゴールが届く")
    assert(viewFor(s, "p2").pendingChoice?.sourceCardId === undefined, "相手の画面には届かない")
}

console.log("すべてのチェックに合格しました 🎉（part898）")
