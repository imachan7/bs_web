// smoke パート1035（AI 段階3 先読み lookahead。docs/design/AI_OPPONENT.md §9）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart, handleAction, viewFor } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { enumerateLegalMoves } from "../../server/src/ai/legalMoves"
import { evaluateBoard } from "../../server/src/ai/boardEval"
import { LOOKAHEAD_MARGIN, lookaheadPick, trialMove } from "../../server/src/ai/lookahead"
import { LOOKAHEAD_POLICY } from "../../server/src/ai/policy"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const THORN = "BS01-133" // ワイルドパワー（赤・マジック。スピリット1体にBP+2000。両陣営が対象）

assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(THORN).name === "ワイルドパワー", "cardId の機械確認")

function scene(): GameState {
    const s = createGame("la", { p1: "A", p2: "B" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = [THORN, VANILLA]
    s.players.p2.hand = []
    s.players.p1.field.spirits.push(createInstance(VANILLA, s.turn, 2))
    s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 2))
    refreshLevelAsOverrides(s)
    return s
}

// 選択待ちの場面：自分のスピリットにBPを足すほうが、相手に足すより良い
const choiceState = scene()
assert(handleAction(choiceState, "p1", { type: "castMagic", handIndex: 0 } as never) === null, "マジックを使えた")
assert(choiceState.pendingChoice?.kind === "target" && choiceState.pendingChoice.candidates.length === 2, "対象の選択待ち（候補は両陣営の2体）")
const choiceScenes = [{ s: choiceState, pid: "p1" as PlayerId }]
const mainScene = { s: scene(), pid: "p1" as PlayerId }

console.log("=== 1. 試行は元の state を変えず、値を返す ===")
{
        let valued = 0
    for (const { s, pid } of [...choiceScenes, mainScene]) {
        const before = JSON.stringify(s)
        for (const m of enumerateLegalMoves(s, pid)) {
            const v = trialMove(s, pid, m)
            if (v !== null) {
                valued++
                assert(Number.isFinite(v), "試行値は有限の数")
            }
        }
        assert(JSON.stringify(s) === before, "trialMove の前後で state が同じ")
    }
    assert(valued > 0, "試行値が返る手がある")
}

console.log("=== 2. 拒否・例外は「試行値なし」 ===")
{
    const { s, pid } = mainScene
    assert(trialMove(s, pid, { action: { type: "resolveChoice", instanceId: "none" }, reason: "x" }) === null, "選択待ちが無いのに回答すると拒否で null")
    assert(trialMove(s, pid, { action: { type: "summon", handIndex: 999 } as never, reason: "x" }) === null, "ありえない手は null")
    assert(trialMove(null as never, pid, { action: { type: "pass" }, reason: "x" }) === null, "例外でも null")
}

console.log("=== 3. 採否：基準値＋MARGIN 以上のときだけ上書き ===")
{
    const { s: cs, pid: cp } = choiceScenes[0]!
    const moves = enumerateLegalMoves(cs, cp)
    const oppSpirit = cs.players.p2.field.spirits[0]!.instanceId
    const own = moves.find((m) => m.action.type === "resolveChoice" && m.action.instanceId === cs.players.p1.field.spirits[0]!.instanceId)!
    const opp = moves.find((m) => m.action.type === "resolveChoice" && m.action.instanceId === oppSpirit)!
    const vOwn = trialMove(cs, cp, own)!
    const vOpp = trialMove(cs, cp, opp)!
    assert(vOwn > vOpp, "自分にBPを足す選択のほうが試行値が高い")
    const base = evaluateBoard(viewFor(cs, cp), cp)
    const pick = lookaheadPick(cs, cp, moves)
    // BP+2000 の差は評価で MARGIN（10）に届かないので上書きしない。届くときは自分の選択を返す
    assert(vOwn - base >= LOOKAHEAD_MARGIN ? pick !== null && JSON.stringify(pick.action) === JSON.stringify(own.action) : pick === null, "上書きは基準値+MARGIN以上のときだけ")
    // 選択待ち以外の種類は既定では試さない
    const { s, pid } = mainScene
    assert(lookaheadPick(s, pid, enumerateLegalMoves(s, pid).filter((m) => m.action.type !== "resolveChoice")) === null, "既定の対象外の手には null")
    assert(LOOKAHEAD_MARGIN > 0 && LOOKAHEAD_POLICY.pickState !== undefined, "MARGIN と pickState がある")
}

console.log("すべてのチェックに合格しました 🎉（part1035）")
