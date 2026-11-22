// smoke パート1046（AI：相手のアタックにだけ働くマジックを自分のターンに撃たない・シンボル0でアタックしない・支払いで味方を消滅させない。keepGuard.ts・attackPlan.ts・legalMoves.ts）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { decideAiAction } from "../../server/src/ai/index"
import { DEFAULT_POLICY } from "../../server/src/ai/policy"
import { instanceSymbolCount } from "../../shared/rules/symbols"
import { enumerateLegalMoves } from "../../server/src/ai/legalMoves"
import { act } from "./helpers"

const DELTA = "BS11-080" // デルタバリア
const ROKU = "BS01-002" // ロクケラトプス
const HERA = "BS01-058" // ヘラクレス・ジオ
assert(getCard(DELTA).name === "デルタバリア" && getCard(ROKU).name === "ロクケラトプス" && getCard(HERA).name === "ヘラクレス・ジオ", "cardId の機械確認")

function scene(phase: "main" | "attack", hand: string[], opp: string[]): GameState {
    const s = createGame("guard", { p1: "A", p2: "B" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 5
    s.turnPlayer = "p1"
    s.phase = phase
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.deck = Array.from({ length: 40 }, () => ROKU)
        p.hand = []
        p.burst = null
    }
    s.players.p1.field.spirits = [createInstance(ROKU, 1, 5), createInstance(ROKU, 1, 5)]
    s.players.p2.field.spirits = opp.map((id) => createInstance(id, 1, 3))
    s.players.p1.hand = hand
    s.players.p1.reserve = 6
    refreshLevelAsOverrides(s)
    return s
}
const decide = (s: GameState, policy = DEFAULT_POLICY) => decideAiAction(s, "p1", new Set(), policy)?.action

console.log("=== 1. デルタバリアを自分のメインステップで撃たない ===")
assert(decide(scene("main", [DELTA], [HERA]))?.type !== "castMagic", "既定は撃たずに相手のアタックまで持つ")

console.log("=== 2. シンボル0のスピリットでアタックしない ===")
{
    const s = scene("attack", [], [])
    assert(decide(s)?.type === "attack", "シンボルがあればアタックする（このテストが変更を検出できることの確認）")
}
{
    const s = scene("attack", [], [])
    for (const inst of s.players.p1.field.spirits) inst.timedSymbolsOverride = []
    assert(s.players.p1.field.spirits.every((i) => instanceSymbolCount(i) === 0), "前提：シンボルが0")
    assert(decide(s)?.type !== "attack", "シンボル0ならアタックしない")
}

console.log("=== 3. 効果の召喚で置くコアを、味方を消滅させて払う選択肢を出さない ===")
{
    // 相手のアタックで VICTIM が破壊され、トラッシュのベルドゴール（コスト3・Lv1=1/Lv2=3コア）を【不死】で召喚する。
    // リザーブ4＋破壊待機の VICTIM の1コア（場を離れるので払ってよい）＝コスト3＋2個。味方のロクケラトプス（1コア）を消滅させれば3個置ける
    const BELD = "BS09-X36", VICTIM = "BS10-007", BOSS = "BS10-028"
    assert(getCard(BELD).name === "魔界七将ベルドゴール" && getCard(VICTIM).name === "デュアルド" && getCard(BOSS).name === "マタンゴル", "cardId の機械確認（3）")
    const s = createGame("fushi-ai", { p1: "A", p2: "B" }, { p1: "red", p2: "green" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 4
    s.turnPlayer = "p2"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as const) s.players[pid].deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p1.reserve = 4
    s.players.p1.trashCards = [BELD]
    const victim = createInstance(VICTIM, 1, 1)
    const ally = createInstance(ROKU, 1, 1)
    const boss = createInstance(BOSS, 1, 1)
    s.players.p1.field.spirits = [victim, ally]
    s.players.p2.field.spirits = [boss]
    refreshLevelAsOverrides(s)
    act(s, "p2", { type: "nextPhase" })
    act(s, "p2", { type: "attack", instanceId: boss.instanceId })
    for (let i = 0; i < 3 && s.isFlashTiming; i++) act(s, s.priorityPlayer, { type: "pass" })
    act(s, "p1", { type: "block", instanceId: victim.instanceId })
    for (let i = 0; i < 6 && s.isFlashTiming && s.battle && !s.pendingChoice; i++) act(s, s.priorityPlayer, { type: "pass" })
    const yes = (s.pendingChoice as any)?.options?.find((o: string) => o.includes("召喚"))
    act(s, "p1", { type: "resolveChoice", option: yes })
    const pc: any = s.pendingChoice
    assert(pc?.effectCostPay?.keepByOption?.includes(3), `前提：サーバーは味方を消滅させて3個置く選択肢も出す（${JSON.stringify(pc?.options)}）`)
    const opts = enumerateLegalMoves(s, "p1").map((m: any) => m.action.option)
    assert(JSON.stringify(opts) === JSON.stringify(["コア1個（Lv1）", "コア2個（Lv1）"]), `AI の候補は消滅させない2個まで（${JSON.stringify(opts)}）`)
    act(s, "p1", enumerateLegalMoves(s, "p1").at(-1)!.action as any)
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === ally.instanceId), "味方のロクケラトプスは場に残る")
}

console.log("すべてのチェックに合格しました 🎉（part1046）")
