// AI の強さの測定（npm run ai:bench [局数=3]）。定型の検証には入れない（自己対戦を数十局回すため）。
// 6色の総当たり（同色を含む21組）を各 N 局回し、詰まり・例外・手の種類・無意味手を数える。
// 無意味手の定義は docs/design/AI_OPPONENT.md §7。乱数は Math.random のままなので、比べるときは同じ N で。
import { createGame } from "../server/src/logic/GameState"
import { runTurnStart } from "../server/src/logic/PhaseManager"
import type { Color, DeckSpec, GameState, PlayerId } from "../server/src/type"
import { pumpAiSync } from "../server/src/ai/runner"
import { magicTags } from "../server/src/ai/moveTags"
import { DEFAULT_POLICY, LOOKAHEAD_POLICY, OLD_POLICY, type AiPolicy } from "../server/src/ai/policy"
import { LOOKAHEAD_KINDS, LOOKAHEAD_MARGIN, LOOKAHEAD_BUDGET_MS } from "../server/src/ai/lookahead"
import { DECK_RECIPES } from "../data/constants"

const args = process.argv.slice(2)
const VS_OLD = args.includes("--vs-old")
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 3) || 3
const COLORS: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
const MAX_ACTIONS = 6000

// --decks sd：構築済みデッキ（DECK_RECIPES の SD10 以降）で測る。既定は色デッキ6つの総当たり（同色を含む21組）。
// sd は乱数を固定してデッキを並べ、並びの上で d=1..K 個先のデッキと対戦させる（--k=K、既定4）。
// どのデッキも p1 側・p2 側を K 回ずつ持ち、毎回同じ組み合わせになる。N は1組あたりの局数
type Matchup = { a: DeckSpec; b: DeckSpec; label: string }
function matchups(): Matchup[] {
    if (!args.includes("--decks") || args[args.indexOf("--decks") + 1] !== "sd") {
        const out: Matchup[] = []
        for (let i = 0; i < COLORS.length; i++) for (let j = i; j < COLORS.length; j++) out.push({ a: COLORS[i]!, b: COLORS[j]!, label: `${COLORS[i]}-${COLORS[j]}` })
        return out
    }
    // 初期の SD は効果のかみ合いが少ないので、SD10 以降と SJ13 だけを使う（2026-11-20 ユーザー指示）
    const keys = Object.keys(DECK_RECIPES).filter((key) => /^(SD1\d|SJ13)\b/.test(DECK_RECIPES[key]!.label))
    let seed = 20261120
    const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    for (let i = keys.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [keys[i], keys[j]] = [keys[j]!, keys[i]!]
    }
    const k = Math.min(Number(args.find((a) => a.startsWith("--k="))?.slice(4)) || 4, keys.length - 1)
    const out: Matchup[] = []
    for (let i = 0; i < keys.length; i++) for (let d = 1; d <= k; d++) out.push({ a: keys[i]!, b: keys[(i + d) % keys.length]!, label: `${keys[i]}-${keys[(i + d) % keys.length]}` })
    return out
}
const MATCHUPS = matchups()

// 新（本番の既定）対 旧（OLD_POLICY）。先後を入れ替えて同数回し、色の偏りと先手有利を消す。
// 引き分け＝手数上限・詰まり・例外で決着しなかった局
function vsOld(): void {
    const NEW: AiPolicy = process.env.BS_AI_LOOKAHEAD_KINDS ? LOOKAHEAD_POLICY : DEFAULT_POLICY
    let win = 0, lose = 0, draw = 0, errs = 0, turnSum = 0, played = 0
    const t0 = Date.now()
    console.log(`新側: ${NEW === LOOKAHEAD_POLICY ? "LOOKAHEAD_POLICY" : "DEFAULT_POLICY"} / KINDS=${[...LOOKAHEAD_KINDS].join(",")} / MARGIN=${LOOKAHEAD_MARGIN} / BUDGET_MS=${LOOKAHEAD_BUDGET_MS} / 組=${MATCHUPS.length} × N=${N}`)
    for (let i = 0; i < MATCHUPS.length; i++) {
        {
            for (let n = 0; n < N; n++) {
                const newIsP1 = n % 2 === 0
                const policies: Record<PlayerId, AiPolicy> = newIsP1 ? { p1: NEW, p2: OLD_POLICY } : { p1: OLD_POLICY, p2: NEW }
                const newPid: PlayerId = newIsP1 ? "p1" : "p2"
                try {
                    const s: GameState = createGame(`vs-${i}-${n}`, { p1: "A", p2: "B" }, { p1: MATCHUPS[i]!.a, p2: MATCHUPS[i]!.b })
                    runTurnStart(s)
                    s.interactiveTargets = true
                    let total = 0
                    let stuck = false
                    while (!s.winner && total < MAX_ACTIONS) {
                        const acted = (["p1", "p2"] as PlayerId[]).reduce((sum, pid) => sum + pumpAiSync(s, pid, 60, undefined, policies), 0)
                        if (acted === 0) {
                            stuck = true
                            break
                        }
                        total += acted
                    }
                    played++
                    turnSum += s.turn
                    if (!s.winner || stuck) draw++
                    else if (s.winner === newPid) win++
                    else lose++
                } catch (e) {
                    errs++
                    console.error(`例外 ${MATCHUPS[i]!.label}#${n}:`, (e as Error).message)
                }
            }
        }
    }
    const decided = win + lose
    const p = decided ? win / decided : 0.5
    const se = decided ? Math.sqrt((p * (1 - p)) / decided) : 0
    const pct = (x: number) => `${(100 * x).toFixed(1)}%`
    console.log(`| 項目 | 値 |\n| :-- | --: |`)
    console.log(`| 局数 | ${played + errs} |`)
    console.log(`| 新の勝ち | ${win} |`)
    console.log(`| 旧の勝ち | ${lose} |`)
    console.log(`| 引き分け（未決着・詰まり） | ${draw} |`)
    console.log(`| 新の勝率（引き分け除く） | ${pct(p)}（95%区間 ${pct(Math.max(0, p - 1.96 * se))}〜${pct(Math.min(1, p + 1.96 * se))}） |`)
    console.log(`| 平均ターン | ${(turnSum / Math.max(1, played)).toFixed(1)} |`)
    console.log(`| 例外 | ${errs} |`)
    console.log(`| 所要時間 | ${((Date.now() - t0) / 1000).toFixed(0)}秒 |`)
}
if (VS_OLD) {
    vsOld()
    process.exit(0)
}

const counts: Record<string, number> = {}
const bump = (k: string): void => {
    counts[k] = (counts[k] ?? 0) + 1
}

let games = 0
let turns = 0
let stalled = 0
let errors = 0
let unfinished = 0

const t1 = Date.now()
for (let i = 0; i < MATCHUPS.length; i++) {
    {
        {
        for (let n = 0; n < N; n++) {
            games++
            try {
                const s: GameState = createGame(`bench-${i}-${n}`, { p1: "A", p2: "B" }, { p1: MATCHUPS[i]!.a, p2: MATCHUPS[i]!.b })
                runTurnStart(s)
                s.interactiveTargets = true
                let total = 0
                const hook = (move: { action: { type: string; timing?: "main" | "flash"; handIndex?: number } }, state: GameState) => {
                    const a = move.action
                    bump(`手:${a.type}`)
                    if (a.type !== "castMagic" && a.type !== "activateAbility") return
                    const wasBattle = !!state.battle
                    const logLen = state.log.length
                    if (a.type === "castMagic") {
                        const cardId = state.players[state.priorityPlayer && state.isFlashTiming ? state.priorityPlayer : state.turnPlayer].hand[a.handIndex!]
                        if (cardId) {
                            const timing = a.timing ?? (wasBattle ? "flash" : "main")
                            const tags = magicTags(cardId, timing).tags
                            for (const t of tags) bump(`マジックのタグ:${t}`)
                            if (tags.length === 1 && tags[0] === "battleOnly" && !wasBattle) {
                                bump("無意味:バトル外でバトル限定のマジック")
                                if (a.timing === "flash") bump("無意味:メインでフラッシュの守りのマジック")
                            }
                        }
                    }
                    return (error: string | null) => {
                        if (error) return
                        if (state.log.slice(logLen).some((l) => l.includes("対象がいなかった"))) bump("無意味:対象がいなかった")
                    }
                }
                while (!s.winner && total < MAX_ACTIONS) {
                    const acted = (["p1", "p2"] as PlayerId[]).reduce((sum, pid) => sum + pumpAiSync(s, pid, 60, hook), 0)
                    if (acted === 0) {
                        stalled++
                        break
                    }
                    total += acted
                }
                if (!s.winner && total >= MAX_ACTIONS) unfinished++
                turns += s.turn
            } catch (e) {
                errors++
                console.error(`例外 ${MATCHUPS[i]!.label}#${n}:`, (e as Error).message)
            }
        }
        }
    }
}

console.log(`| 項目 | 値 |\n| :-- | --: |`)
console.log(`| 局数 | ${games} |`)
console.log(`| 平均ターン | ${(turns / Math.max(1, games - errors)).toFixed(1)} |`)
console.log(`| 詰まり | ${stalled} |`)
console.log(`| 手数上限で未決着 | ${unfinished} |`)
console.log(`| 例外 | ${errors} |`)
console.log(`| 所要時間 | ${((Date.now() - t1) / 1000).toFixed(0)}秒 |`)
for (const k of Object.keys(counts).sort()) console.log(`| ${k} | ${counts[k]} |`)
