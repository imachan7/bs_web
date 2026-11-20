// ai-bench の棋譜出力（--kifu <dir>）。AI の手ごとに、候補の点数・先読みの試行値・直後のエンジンログを Markdown に残す。
// 候補は decideAiAction と同じ手順（列挙→pruneMoves→scoreMove）を外から再計算して出す。本番の手の選び方には何も足していない。
// 「AI が見た盤面」は手番側の視点：自分の手札はカード名、相手の手札は枚数だけ。ログは対局の外から見た公開情報なのでそのまま載せる
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { CardInstance, GameState, PlayerId } from "../server/src/type"
import { getCard, viewFor } from "../server/src/logic/GameState"
import { currentLevel } from "../shared/rules/level"
import { enumerateLegalMoves, type AiMove } from "../server/src/ai/legalMoves"
import { pruneMoves } from "../server/src/ai/moveTags"
import { scoreMove } from "../server/src/ai/evaluate"
import { evaluateBoard } from "../server/src/ai/boardEval"
import { LOOKAHEAD_KINDS, trialMove } from "../server/src/ai/lookahead"
import type { AiPolicy } from "../server/src/ai/policy"

type Hook = (move: AiMove, state: GameState) => ((error: string | null) => void) | void

export type KifuMeta = { id: string; decks: string; first: PlayerId; newPid?: PlayerId }
type IndexRow = KifuMeta & { winner: PlayerId | null; turns: number; file: string }

const logLine = (l: unknown): string => (typeof l === "string" ? l : JSON.stringify(l))
const opp = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1")

function findInst(state: GameState, id: string): CardInstance | undefined {
    for (const p of [state.players.p1, state.players.p2]) {
        const f = [...p.field.spirits, ...p.field.nexuses, ...p.field.combinedBraves, ...p.field.magics].find((i) => i.instanceId === id)
        if (f) return f
    }
}

// cardId だけにせず、手札の添字・個体 ID を名前に直して「種類 {…}」で出す
function describe(state: GameState, pid: PlayerId, a: Record<string, unknown>): string {
    const parts: string[] = []
    for (const [k, v] of Object.entries(a)) {
        if (k === "type" || v === undefined) continue
        if (k === "handIndex" && typeof v === "number") parts.push(`手札:${state.players[pid].hand[v] ? getCard(state.players[pid].hand[v]!).name : v}`)
        else if (/InstanceId$|^instanceId$/.test(k) && typeof v === "string") parts.push(`${k}:${findInst(state, v) ? getCard(findInst(state, v)!.cardId).name : v}`)
        else parts.push(`${k}:${JSON.stringify(v)}`)
    }
    const pc = state.pendingChoice
    return `${a.type}${parts.length ? ` ${parts.join(" ")}` : ""}${a.type === "resolveChoice" && pc ? `（${pc.kind ?? ""}）` : ""}`
}

function spiritLine(i: CardInstance): string {
    const { level, bp } = currentLevel(i)
    return `${getCard(i.cardId).name} Lv${level} BP${bp} ${i.isRested ? "疲労" : "回復"} コア${i.cores}`
}

function board(state: GameState, me: PlayerId): string {
    const names = (cs: string[]): string => `[${cs.map((c) => getCard(c).name).join("、")}]`
    const out = [`#### ターン${state.turn}（${state.turnPlayer} の番） 視点 ${me}`, "", "AI が見ていた情報（視点側の手札と、双方の場）:"]
    for (const pid of [me, opp(me)]) {
        const p = state.players[pid]
        out.push(`- ${pid}${pid === me ? "（視点側）" : ""}: ライフ${p.life} リザーブ${p.reserve} トラッシュコア${p.trashCores} 手札${p.hand.length}枚${pid === me ? names(p.hand) : ""} バースト${p.burstSet ? "あり" : "なし"}${pid === me && p.burst ? `（${getCard(p.burst).name}）` : ""}`)
        for (const s of p.field.spirits) out.push(`    - ${spiritLine(s)}`)
        for (const n of p.field.nexuses) out.push(`    - ネクサス ${getCard(n.cardId).name} Lv${currentLevel(n).level}`)
    }
    const o = state.players[opp(me)]
    out.push("", `外から見た情報（AI は見ていない）: ${opp(me)} の手札${names(o.hand)} 伏せたバースト${o.burst ? getCard(o.burst).name : "なし"}`)
    return out.join("\n")
}

export class KifuSet {
    rows: IndexRow[] = []
    constructor(readonly dir: string) {
        mkdirSync(dir, { recursive: true })
    }
    // 1局ぶんの記録。state は局の開始直後のもの
    start(meta: KifuMeta, policies?: Partial<Record<PlayerId, AiPolicy>>, label?: (p: PlayerId) => string): Recorder {
        return new Recorder(this, meta, policies, label)
    }
    writeIndex(): void {
        const head = "| 局 | デッキ | 先攻 | 勝者 | ターン | 負けた側が新 |\n| :-- | :-- | :-- | :-- | --: | :-- |"
        const body = this.rows.map((r) => `| [${r.id}](${r.file}) | ${r.decks} | ${r.first} | ${r.winner ?? "未決着"} | ${r.turns} | ${r.newPid && r.winner ? (r.winner !== r.newPid ? "はい" : "いいえ") : "-"} |`)
        writeFileSync(join(this.dir, "index.md"), `# 棋譜一覧（${this.rows.length}局）\n\n${head}\n${body.join("\n")}\n`)
    }
}

class Recorder {
    private out: string[] = []
    private lastTurn = -1
    private n = 0
    constructor(private set: KifuSet, private meta: KifuMeta, private policies?: Partial<Record<PlayerId, AiPolicy>>, private label: (p: PlayerId) => string = (p) => (p === meta.newPid ? "新" : meta.newPid ? "旧" : "既定")) {
        this.out.push(`# ${meta.id}\n\nデッキ ${meta.decks} / 先攻 ${meta.first} / ${meta.newPid ? `新=${meta.newPid}` : "新旧なし"}\n`)
    }

    // pumpAiSync の onMove に渡す。existing は元からあるフック（あれば先に呼び、戻り値を合成する）
    hook(pid: PlayerId, existing?: Hook): Hook {
        return (move, state) => {
            if (state.turn !== this.lastTurn) {
                this.lastTurn = state.turn
                this.out.push(board(state, state.turnPlayer))
            }
            const policy = this.policies?.[pid]
            const view = viewFor(state, pid)
            let moves = enumerateLegalMoves(state, pid)
            if (policy && policy.pickState === undefined && this.label(pid) === "旧") moves = moves.filter((m) => m.action.type !== "setBurst")
            moves = pruneMoves(view, pid, moves)
            const scored = moves.map((m) => ({ m, s: scoreMove(view, pid, m) })).sort((x, y) => y.s - x.s)
            const chosenKey = JSON.stringify(move.action)
            const chosen = scored.find((x) => JSON.stringify(x.m.action) === chosenKey)
            // 先読みの方針だけ、対象の種類の手に試行値（評価の差し引き。点だけで内訳は無い）を付ける
            const trial = (m: AiMove): string => {
                if (!policy?.pickState || !LOOKAHEAD_KINDS.has(m.action.type)) return ""
                const v = trialMove(state, pid, m)
                return v === null ? " 試行不可" : ` 先読み${v.toFixed(1)}（現在${evaluateBoard(view, pid).toFixed(1)}）`
            }
            const d = (m: AiMove): string => describe(state, pid, m.action as unknown as Record<string, unknown>)
            const mark = (m: AiMove): string => ((m.action as { handIndex?: number }).handIndex !== undefined ? "★手札 " : "")
            this.n++
            this.out.push(`${this.n}. **${pid}（${this.label(pid)}）** ${d(move)} — 点${chosen ? chosen.s.toFixed(1) : "?"}${trial(move)} 〔${move.reason}〕`)
            // 合法手を全部（点の高い順）。20を超えたら、手札のカード・種類ごとに対象違いをまとめる
            this.out.push(`    - 合法手${scored.length}件（★＝手札のカードを使う手）:`)
            if (scored.length <= 20) for (const x of scored) this.out.push(`        - ${x === chosen ? "→" : "　"}${mark(x.m)}${d(x.m)} 点${x.s.toFixed(1)}${trial(x.m)}`)
            else {
                const g = new Map<string, { n: number; hi: number; lo: number; any: AiMove; hasChosen: boolean }>()
                for (const x of scored) {
                    const hi = (x.m.action as { handIndex?: number }).handIndex
                    const key = `${x.m.action.type}|${hi ?? ""}`
                    const e = g.get(key)
                    if (e) { e.n++; e.lo = x.s; e.hasChosen ||= x === chosen }
                    else g.set(key, { n: 1, hi: x.s, lo: x.s, any: x.m, hasChosen: x === chosen })
                }
                for (const e of g.values()) this.out.push(`        - ${e.hasChosen ? "→" : "　"}${mark(e.any)}${e.any.action.type}${(e.any.action as { handIndex?: number }).handIndex !== undefined ? ` 手札:${getCard(state.players[pid].hand[(e.any.action as { handIndex: number }).handIndex]!).name}` : ""} ×${e.n} 点${e.hi.toFixed(1)}〜${e.lo.toFixed(1)}`)
            }
            const usable = new Set(scored.flatMap((x) => ((x.m.action as { handIndex?: number }).handIndex !== undefined ? [(x.m.action as { handIndex: number }).handIndex] : [])))
            const idle = state.players[pid].hand.filter((_, i) => !usable.has(i)).map((c) => getCard(c).name)
            if (idle.length) this.out.push(`    - 合法手に入らなかった手札: ${idle.join("、")}`)
            const logBefore = state.log.length
            const after = existing?.(move, state)
            return (error) => {
                after?.(error)
                if (error) this.out.push(`    - 拒否: ${error}`)
                const fresh = state.log.length >= logBefore ? state.log.slice(logBefore) : state.log
                for (const l of fresh) this.out.push(`    - ログ: ${logLine(l)}`)
            }
        }
    }

    finish(state: GameState): void {
        this.out.push(`\n## 終局\n\n勝者 ${state.winner ?? "未決着"} / ターン${state.turn}`)
        const file = `${this.meta.id.replace(/[^\w.-]/g, "_")}.md`
        writeFileSync(join(this.set.dir, file), this.out.join("\n") + "\n")
        this.set.rows.push({ ...this.meta, winner: state.winner, turns: state.turn, file })
    }
}
