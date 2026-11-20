// 1手先読み（docs/design/AI_OPPONENT.md §9）。決定化した複製に手を打ち、次に自分が手を選ぶ番まで進めて採点する。
// 相手の応答は読まない。到達局面までの進行は旧方針で行う。
//
// index.ts は import しない（policy.ts → lookahead.ts → index.ts → policy.ts の循環になるため、列挙と選択をここで直接呼ぶ）。
import type { GameState, GameView, PlayerId } from "../type"
import { handleAction } from "../logic/GameEngine"
import { getCard, viewFor } from "../logic/GameState"
import { currentLevel } from "../../../shared/rules"
import { determinize } from "./determinize"
import { evaluateBoard, evaluateBreakdown } from "./boardEval"
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

// 先読みを使う手の種類（action.type）。構築済みデッキ 1200局の新旧対戦（2026-11-20）：アタック 53.5%（50.7〜56.3）、のち再測 52.7%（49.8〜55.5）。
// 召喚・配置・コア 45.1%、マジック・起動 52.7%、全部 51.5% は区間が50%を跨ぐか下回った
// BS_AI_LOOKAHEAD_KINDS（カンマ区切り）は ai:bench で種類を足して測るための上書き
export const LOOKAHEAD_KINDS: ReadonlySet<string> = new Set(
    env.BS_AI_LOOKAHEAD_KINDS ? env.BS_AI_LOOKAHEAD_KINDS.split(",") : ["attack"],
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

// 手を1つ打って、次に自分が手を選ぶ番の局面を返す。拒否・上限・例外のときは null。state は変えない
function trialView(state: GameState, me: PlayerId, move: AiMove): GameView | null {
    try {
        const sim = determinize(state, me)
        if (handleAction(sim, me, move.action) !== null) return null
        for (let i = 0; sim.winner === null && (sim.battle || sim.pendingChoice); i++) {
            if (i >= MAX_TRIAL_STEPS || !advanceOnce(sim)) return null
        }
        return viewFor(sim, me)
    } catch {
        return null
    }
}

// 手を1つ打って採点する。拒否・上限・例外のときは null。state は変えない
export function trialMove(state: GameState, me: PlayerId, move: AiMove): number | null {
    const view = trialView(state, me, move)
    return view ? evaluateBoard(view, me) : null
}

// ai:bench の分析用。設定されているときだけ、旧方針を上書きした決断を渡す（本番では未設定で何もしない）
export type OverrideTrace = {
    turn: number
    phase: string
    me: PlayerId
    summary: unknown
    old: { type: string; reason: string; trial: number | null; parts: Record<string, number> | null }
    chosen: { type: string; reason: string; trial: number; parts: Record<string, number> | null }
    base: number
    baseParts: Record<string, number> | null
}
let traceSink: ((t: OverrideTrace) => void) | null = null
export function setLookaheadTrace(fn: ((t: OverrideTrace) => void) | null): void {
    traceSink = fn
}

function summarize(view: GameView, me: PlayerId): unknown {
    const side = (pid: PlayerId) => {
        const p = view.players[pid]
        return {
            life: p.life,
            reserve: p.reserve,
            hand: p.handCount,
            spirits: p.field.spirits.map((s) => `${getCard(s.cardId).name}/Lv${currentLevel(s).level}${s.isRested ? "(疲)" : ""}`),
            nexuses: p.field.nexuses.map((s) => getCard(s.cardId).name),
        }
    }
    return { me: side(me), opp: side(me === "p1" ? "p2" : "p1") }
}

// 先読みで旧方針を上書きするときだけ手を返す。null なら旧方針に任せる
export function lookaheadPick(state: GameState, me: PlayerId, moves: AiMove[]): AiMove | null {
    const targets = moves.filter((m) => LOOKAHEAD_KINDS.has(m.action.type))
    if (targets.length === 0) return null
    // 試行値は相手の手札が空の複製で測るので、基準も同じ複製で測る（実局面で測ると試行側だけ手札の項で +15〜20 有利になる。分析 2026-11-20）。
    // 旧方針の手は先読みの対象外の種類でも必ず試行し、上書きは旧の手の試行値＋MARGIN 以上のときだけ（同点・僅差は旧に任せる）
    const old = pickBestMove(viewFor(state, me), me, moves)
    const oldValue = old ? trialMove(state, me, old) : null
    const base = oldValue ?? evaluateBoard(viewFor(determinize(state, me), me), me)
    const started = Date.now()
    let best: AiMove | null = null
    let bestValue = base + LOOKAHEAD_MARGIN - 1
    for (const m of targets) {
        if (m === old) continue
        if (Date.now() - started > LOOKAHEAD_BUDGET_MS) break
        const v = trialMove(state, me, m)
        if (v !== null && v > bestValue) {
            best = m
            bestValue = v
        }
    }
    if (best && traceSink) {
        try {
            const view = viewFor(state, me)
            const info = (m: AiMove) => {
                const v = trialView(state, me, m)
                return { type: m.action.type, reason: m.reason, trial: v ? evaluateBoard(v, me) : null, parts: v ? evaluateBreakdown(v, me) : null }
            }
            const c = info(best)
            traceSink({
                turn: state.turn,
                phase: String(state.phase),
                me,
                summary: summarize(view, me),
                old: old ? info(old) : { type: "none", reason: "", trial: null, parts: null },
                chosen: { ...c, trial: bestValue },
                base,
                baseParts: evaluateBreakdown(view, me),
            })
        } catch {}
    }
    return best
}
