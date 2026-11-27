// smoke パート1072（アルティメットの土台 段3b：リフレッシュ・維持コア・アタック・ブロック・スピリット指定の効果。docs/design/ULTIMATE_STAGE3.md）
// field.ultimates に既存のスピリットの個体を直接入れた盤面で、実体として扱われることとスピリット指定の効果には当たらないことを確かめる
import { assert, act, createGame, endTurn, createInstance, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { sweepLevelCostDepletion } from "../../server/src/logic/EffectModules"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const GORADON = "BS01-001" // ゴラドン

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    return s
}

console.log("=== 1. リフレッシュステップで疲労状態から回復する ===")
{
    const s = game("ult3b-refresh")
    const ult = createInstance(VANILLA, s.turn, 2)
    const sp = createInstance(VANILLA, s.turn, 2)
    ult.isRested = true
    sp.isRested = true
    s.players.p2.field.ultimates.push(ult)
    s.players.p2.field.spirits.push(sp)
    // p1 のターンを終えると p2 のリフレッシュステップが来る
    endTurn(s)
    assert(s.turnPlayer === "p2", "p2 のターンになった")
    assert(!ult.isRested, "アルティメットが回復した")
    assert(!sp.isRested, "スピリットも回復した")
}

console.log("=== 2. コアが最低Lvの数に足りなければ消滅する ===")
{
    const s = game("ult3b-deplete")
    const ult = createInstance(VANILLA, s.turn, 1)
    const ok = createInstance(VANILLA, s.turn, 1)
    ult.levelCostBonusContinuous = 3
    s.players.p1.field.ultimates.push(ult)
    s.players.p1.field.spirits.push(ok)
    sweepLevelCostDepletion(s)
    assert(s.players.p1.field.ultimates.length === 0, "維持コアを割ったアルティメットが場から抜けた")
    assert(s.players.p1.trashCards.includes(ult.cardId), "トラッシュへ送られた")
    assert(s.players.p1.field.spirits.includes(ok), "維持コアを満たす個体は残る")
}

console.log("=== 3. アルティメットでアタックを宣言でき、相手のアルティメットがブロックできる ===")
{
    const s = game("ult3b-attack-block")
    const atk = createInstance(VANILLA, s.turn - 1, 1)
    const blk = createInstance(GORADON, s.turn - 1, 1)
    s.players.p1.field.ultimates.push(atk)
    s.players.p2.field.ultimates.push(blk)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アルティメットでアタックを宣言できる")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ終了）")
    assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "アルティメットでブロックを宣言できる")
    assert(s.battle?.blockerInstanceId === blk.instanceId, "ブロッカーとして記録された")
}

console.log("=== 3b. アルティメットのアタックがブロックされずにバトルが終わる ===")
{
    const s = game("ult3b-unblocked")
    const atk = createInstance(VANILLA, s.turn - 1, 1)
    s.players.p1.field.ultimates.push(atk)
    const life = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アルティメットでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受ける")
    assert(s.battle === null || s.battle === undefined, "バトルが終了した")
    assert(s.players.p2.life === life - 1, "ライフが1減った")
}

console.log("=== 4. 「相手のスピリットすべてを疲労させる」はアルティメットに当たらない ===")
{
    const s = game("ult3b-exhaust-spirit")
    const ult = createInstance(VANILLA, s.turn, 1)
    const sp = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.ultimates.push(ult)
    s.players.p2.field.spirits.push(sp)
    resolveAction(s, "p1", null, { type: "exhaust", count: 1, all: true })
    assert(sp.isRested, "スピリットは疲労した")
    assert(!ult.isRested, "アルティメットは疲労しない")
}

console.log("すべてのチェックに合格しました 🎉（part1072）")
