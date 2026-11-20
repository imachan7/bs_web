// smoke パート1040（AI がアタックステップを終わらせる守りのマジックを自分のターンに撃たない。server/src/ai/keepGuard.ts）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import { decideAiAction } from "../../server/src/ai/index"
import { BLOCK_POLICY, DEFAULT_POLICY } from "../../server/src/ai/policy"

const WALL = "SD11-014" // ウィンドウォール（コスト4。フラッシュ：このバトルが終了したとき、アタックステップを終了する＋【連鎖】で相手1体を疲労）
const ROKU = "BS01-002" // ロクケラトプス
const HERA = "BS01-058" // ヘラクレス・ジオ（3コア=BP6000。除去の的として点が高い）
assert(getCard(WALL).name === "ウィンドウォール" && getCard(ROKU).name === "ロクケラトプス" && getCard(HERA).name === "ヘラクレス・ジオ", "cardId の機械確認")

const s = createGame("guard", { p1: "A", p2: "B" }, { p1: "red", p2: "purple" })
runTurnStart(s)
s.turn = 5
s.turnPlayer = "p1"
s.phase = "main"
for (const pid of ["p1", "p2"] as const) {
    const p = s.players[pid]
    p.deck = Array.from({ length: 40 }, () => ROKU)
    p.hand = []
    p.burst = null
    p.field.spirits = [createInstance(ROKU, 1, 2)]
}
s.players.p2.field.spirits = [createInstance(HERA, 1, 3)]
// 最高レベルを超えるコアを乗せ、コアを置く手（点75）を消す。残る手はマジック（点25）・アタックステップへ（20）・ターン終了
s.players.p1.field.spirits = [createInstance(ROKU, 1, 5)]
s.players.p1.hand = [WALL]
s.players.p1.reserve = 6
refreshLevelAsOverrides(s)

console.log("=== 自分のメインステップでは撃たない ===")
const old = decideAiAction(s, "p1", new Set(), BLOCK_POLICY)
assert(old?.action.type === "castMagic", `変更前の方針はメインステップで撃つ（このテストが変更を検出できることの確認。実際=${old?.action.type}）`)
const now = decideAiAction(s, "p1", new Set(), DEFAULT_POLICY)
assert(now !== null && now.action.type !== "castMagic", `既定は撃たずに残す（実際=${now?.action.type}）`)

console.log("すべてのチェックに合格しました 🎉（part1040）")
