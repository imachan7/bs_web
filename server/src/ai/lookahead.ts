// 1手先読み（docs/design/AI_OPPONENT.md §9）。決定化した複製に手を打ち、次に自分が手を選ぶ番まで進めて採点する。
// 相手の応答は読まない。到達局面までの進行は旧方針で行う。
//
// index.ts は import しない（policy.ts → lookahead.ts → index.ts → policy.ts の循環になるため、列挙と選択をここで直接呼ぶ）。
import type { GameState, PlayerId } from "../type"
import { handleAction } from "../logic/GameEngine"
import { viewFor } from "../logic/GameState"
import { determinize } from "./determinize"
import { evaluateBoard } from "./boardEval"
import { pickBestMove } from "./evaluate"
import { enumerateLegalMoves, type AiMove } from "./legalMoves"
import { pruneMoves } from "./moveTags"

// 試行の中で進める手数の上限。超えたら「試行値なし」
const MAX_TRIAL_STEPS = 30

// AI はブラウザのワーカーでも動く（build-ai-worker）。そこには process が無いので環境変数は読まない
const env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env

// 試行値が基準値よりこれ以上高いときだけ旧方針を上書きする（置き値。ai:bench で調整）
const configuredMargin = env.BS_AI_LOOKAHEAD_MARGIN === undefined ? NaN : Number(env.BS_AI_LOOKAHEAD_MARGIN)
export const LOOKAHEAD_MARGIN = Number.isFinite(configuredMargin) ? configuredMargin : 10

const configuredBudget = Number(env.BS_AI_LOOKAHEAD_MS)
export const LOOKAHEAD_BUDGET_MS = Number.isFinite(configuredBudget) && configuredBudget > 0 ? configuredBudget : 50

// 先読みを使う手の種類（action.type）。種類ごとに ai:bench で測って足す
// BS_AI_LOOKAHEAD_KINDS（カンマ区切り）は ai:bench で種類を足して測るための上書き
export const LOOKAHEAD_KINDS: ReadonlySet<string> = new Set(
    env.BS_AI_LOOKAHEAD_KINDS ? env.BS_AI_LOOKAHEAD_KINDS.split(",") : ["resolveChoice"],
)

// 決め手を持つ側（選択待ちの回答者・フラッシュの優先権者・ブロック側）を旧方針で1手進める。進められなければ false
function advanceOnce(sim: GameState): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const view = viewFor(sim, pid)
        const moves = pruneMoves(view, pid, enumerateLegalMoves(sim, pid))
        const move = pickBestMove(view, pid, moves)
        if (!move) continue
        return handleAction(sim, pid, move.action) === null
    }
    return false
}

// 手を1つ打って採点する。拒否・上限・例外のときは null。state は変えない
export function trialMove(state: GameState, me: PlayerId, move: AiMove): number | null {
    try {
        const sim = determinize(state, me)
        if (handleAction(sim, me, move.action) !== null) return null
        for (let i = 0; sim.winner === null && (sim.battle || sim.pendingChoice); i++) {
            if (i >= MAX_TRIAL_STEPS || !advanceOnce(sim)) return null
        }
        return evaluateBoard(viewFor(sim, me), me)
    } catch {
        return null
    }
}

// 先読みで旧方針を上書きするときだけ手を返す。null なら旧方針に任せる
export function lookaheadPick(state: GameState, me: PlayerId, moves: AiMove[]): AiMove | null {
    const targets = moves.filter((m) => LOOKAHEAD_KINDS.has(m.action.type))
    if (targets.length === 0) return null
    const base = evaluateBoard(viewFor(state, me), me)
    const started = Date.now()
    let best: AiMove | null = null
    let bestValue = base + LOOKAHEAD_MARGIN - 1
    for (const m of targets) {
        if (Date.now() - started > LOOKAHEAD_BUDGET_MS) break
        const v = trialMove(state, me, m)
        if (v !== null && v > bestValue) {
            best = m
            bestValue = v
        }
    }
    return best
}
