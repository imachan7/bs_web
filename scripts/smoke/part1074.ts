// smoke パート1074（アルティメットの土台 段3d：AI の盤面の見方にアルティメットを含める。docs/design/ULTIMATE_STAGE3.md）
// コアを外す手・盤面評価・手の選択はアルティメットを実体として数える（スピリットを狙う効果の予測は対象外）
import { assert, createGame, createInstance, runTurnStart, viewFor } from "./helpers"
import type { GameState } from "./helpers"
import { enumerateLegalMoves } from "../../server/src/ai/legalMoves"
import { evaluateBoard } from "../../server/src/ai/boardEval"
import { pickBestMove } from "../../server/src/ai/evaluate"
import { validateMoveCore } from "../../server/src/logic/RuleValidator"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

function scene(withUlt: boolean): GameState {
    const s = createGame("ult3d", { p1: "A", p2: "B" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    if (withUlt) s.players.p1.field.ultimates.push(createInstance(VANILLA, s.turn, 3))
    return s
}

console.log("=== 1. コアを外す手・置く手がアルティメットに出る ===")
{
    const s = scene(true)
    const ult = s.players.p1.field.ultimates[0]!
    assert(validateMoveCore(s, "p1", ult.instanceId, "remove") === null, "検証がアルティメットのコア移動を受ける")
    const moves = enumerateLegalMoves(s, "p1")
    const mine = (dir: string) => moves.some((m) => m.action.type === "moveCore" && m.action.instanceId === ult.instanceId && m.action.direction === dir)
    assert(mine("remove"), "アルティメットのコアを外す手が出る")
    assert(mine("add"), "アルティメットにコアを置く手が出る")
}

console.log("=== 2. 盤面評価がアルティメットを数える ===")
{
    const base = evaluateBoard(viewFor(scene(false), "p1"), "p1")
    const withUlt = evaluateBoard(viewFor(scene(true), "p1"), "p1")
    assert(withUlt > base, `アルティメットぶん評価が上がる（${base} → ${withUlt}）`)
}

console.log("=== 3. アルティメットがいる盤面で1手選べる ===")
{
    const s = scene(true)
    const moves = enumerateLegalMoves(s, "p1")
    const picked = pickBestMove(viewFor(s, "p1"), "p1", moves)
    assert(picked !== null, "手を1つ選べる")
}

console.log("すべてのチェックに合格しました 🎉（part1074）")
