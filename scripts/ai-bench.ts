// AI の強さの測定（npm run ai:bench [局数=3]）。定型の検証には入れない（自己対戦を数十局回すため）。
// 6色の総当たり（同色を含む21組）を各 N 局回し、詰まり・例外・手の種類・無意味手を数える。
// 無意味手の定義は docs/design/AI_OPPONENT.md §7。乱数は Math.random のままなので、比べるときは同じ N で。
import { createGame } from "../server/src/logic/GameState"
import { runTurnStart } from "../server/src/logic/PhaseManager"
import type { Color, DeckSpec, GameState, PlayerId } from "../server/src/type"
import { pumpAiSync } from "../server/src/ai/runner"
import { magicTags } from "../server/src/ai/moveTags"
import { CANDIDATE_POLICY, DEFAULT_POLICY, OLD_POLICY, type AiPolicy } from "../server/src/ai/policy"
import { LOOKAHEAD_KINDS, LOOKAHEAD_MARGIN, LOOKAHEAD_BUDGET_MS, setLookaheadTrace, type OverrideTrace } from "../server/src/ai/lookahead"
import { appendFileSync, writeFileSync } from "node:fs"
import { enumerateLegalMoves } from "../server/src/ai/legalMoves"
import { anyNode, burstKind, pruneMoves } from "../server/src/ai/moveTags"
import { viewFor, getCard } from "../server/src/logic/GameState"
import { validateCastMagic, validateSummon } from "../server/src/logic/RuleValidator"
import { loadAllCards } from "../data/loadCards"
import { createInstance } from "./smoke/helpers"
import { DECK_RECIPES } from "../data/constants"
import { KifuSet } from "./ai-kifu"

const args = process.argv.slice(2)
const VS_OLD = args.includes("--vs-old")
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 3) || 3
const COLORS: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
const MAX_ACTIONS = 6000
// --kifu <dir>：1局ごとの棋譜（scripts/ai-kifu.ts）。どのモードとも併用できる
const KIFU = args.includes("--kifu") ? new KifuSet(args[args.indexOf("--kifu") + 1]!) : null

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

// 旧側（基準）は本番の既定 DEFAULT_POLICY。BS_AI_OLD=stage1 で段階1の OLD_POLICY と比べる
const OLD_SIDE: AiPolicy = process.env.BS_AI_OLD === "stage1" ? OLD_POLICY : DEFAULT_POLICY
// 新（CANDIDATE_POLICY）対 旧（基準）。先後を入れ替えて同数回し、色の偏りと先手有利を消す。
// 引き分け＝手数上限・詰まり・例外で決着しなかった局
function vsOld(): void {
    const NEW: AiPolicy = CANDIDATE_POLICY
    const burstCount = { セット: 0, 発動: 0, 断った: 0 }
    // BS_AI_BURST_TRACE=1：新側のバーストの決断（セット・入れ替え・断り）を局ごとに記録し、勝敗と並べて出す
    type Dec = { bk: string; turn: number; kind: string; card: string; ctype: string; usable: boolean; altOld: string; summonsAvail: number; replaced: boolean }
    let decs: Dec[] = []
    const allGames: { decs: Dec[]; won: boolean; label: string; log: string[] }[] = []
    const burstHook = (pid: PlayerId) => (move: { action: { type: string; option?: string; handIndex?: number } }, state: GameState): void => {
        const a = move.action
        const decide = (kind: string, cardId: string, usable: boolean, replaced: boolean): void => {
            const view = viewFor(state, pid)
            const moves = pruneMoves(view, pid, enumerateLegalMoves(state, pid))
            const alt = OLD_POLICY.pick(view, pid, moves)
            decs.push({ bk: burstKind(cardId), turn: state.turn, kind, card: getCard(cardId).name, ctype: getCard(cardId).type, usable, altOld: alt?.reason ?? "-", summonsAvail: moves.filter((m) => m.action.type === "summon").length, replaced })
        }
        if (a.type === "setBurst") {
            burstCount.セット++
            const p = state.players[pid]
            const cardId = p.hand[a.handIndex!]!
            const c = getCard(cardId)
            const usable = c.type === "magic" ? validateCastMagic(state, pid, a.handIndex!) === null : c.type === "spirit" || c.type === "brave" ? c.levels.some((l) => validateSummon(state, pid, a.handIndex!, undefined, l.level) === null) : false
            decide(p.burst ? "入れ替え" : "セット", cardId, usable, !!p.burst)
        } else if (a.type === "resolveChoice" && state.pendingChoice?.burstActivate) {
            if (a.option !== undefined) burstCount.発動++
            else {
                burstCount.断った++
                decide("断り", state.pendingChoice.burstActivate.cardId, false, false)
            }
        }
    }
    let win = 0, lose = 0, draw = 0, errs = 0, turnSum = 0, played = 0
    const breakdown: Record<string, [number, number]> = {}
    const t0 = Date.now()
    // BS_AI_TRACE=path：先読みが旧方針を上書きした決断と対局の結果・ログを1局1行の JSON Lines で書く
    const tracePath = process.env.BS_AI_TRACE
    let overrides: OverrideTrace[] = []
    if (tracePath) {
        writeFileSync(tracePath, "")
        setLookaheadTrace((t) => overrides.push(t))
    }
    console.log(`新側: CANDIDATE_POLICY / 旧側: ${OLD_SIDE === OLD_POLICY ? "OLD_POLICY（段階1）" : "DEFAULT_POLICY（基準）"} / KINDS=${[...LOOKAHEAD_KINDS].join(",")} / MARGIN=${LOOKAHEAD_MARGIN} / BUDGET_MS=${LOOKAHEAD_BUDGET_MS} / 組=${MATCHUPS.length} × N=${N}`)
    for (let i = 0; i < MATCHUPS.length; i++) {
        {
            for (let n = 0; n < N; n++) {
                const newIsP1 = n % 2 === 0
                const policies: Record<PlayerId, AiPolicy> = newIsP1 ? { p1: NEW, p2: OLD_SIDE } : { p1: OLD_SIDE, p2: NEW }
                const newPid: PlayerId = newIsP1 ? "p1" : "p2"
                try {
                    const s: GameState = createGame(`vs-${i}-${n}`, { p1: "A", p2: "B" }, { p1: MATCHUPS[i]!.a, p2: MATCHUPS[i]!.b })
                    runTurnStart(s)
                    const firstPid = s.turnPlayer
                    s.interactiveTargets = true
                    const rec = KIFU?.start({ id: `${MATCHUPS[i]!.label}#${n}`, decks: MATCHUPS[i]!.label, first: s.turnPlayer, newPid }, policies)
                    let total = 0
                    let stuck = false
                    decs = []
                    while (!s.winner && total < MAX_ACTIONS) {
                        const acted = (["p1", "p2"] as PlayerId[]).reduce((sum, pid) => sum + pumpAiSync(s, pid, 60, rec ? rec.hook(pid, pid === newPid ? burstHook(pid) : undefined) : pid === newPid ? burstHook(pid) : undefined, policies), 0)
                        if (acted === 0) {
                            stuck = true
                            break
                        }
                        total += acted
                    }
                    rec?.finish(s)
                    played++
                    allGames.push({ decs, won: s.winner === newPid, log: s.log.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).filter((l) => /バースト|ライフ/.test(l)).slice(-40), label: `${MATCHUPS[i]!.label}#${n}(${newPid})` })
                    decs = []
                    turnSum += s.turn
                    if (tracePath) {
                        const result = !s.winner || stuck ? "draw" : s.winner === newPid ? "newWin" : "oldWin"
                        appendFileSync(tracePath, JSON.stringify({ game: `${i}-${n}`, matchup: MATCHUPS[i]!.label, newPid, result, turns: s.turn, overrides, log: s.log }) + "\n")
                        overrides = []
                    }
                    if (!s.winner || stuck) draw++
                    else {
                        // 内訳：新のデッキ別・先後別（新が勝った数／決着した数）
                        const won = s.winner === newPid
                        const newDeck = newIsP1 ? MATCHUPS[i]!.a : MATCHUPS[i]!.b
                        for (const k of [`新が${newPid === firstPid ? "先攻" : "後攻"}`, `新のデッキ ${newDeck}`]) {
                            breakdown[k] ??= [0, 0]
                            breakdown[k]![1]++
                            if (won) breakdown[k]![0]++
                        }
                        if (won) win++
                        else lose++
                    }
                } catch (e) {
                    errs++
                    console.error(`例外 ${MATCHUPS[i]!.label}#${n}:`, (e as Error).stack?.split("\n").slice(0, 5).join(" | "))
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
    if (args.includes("--breakdown")) {
        console.log(`\n| 内訳 | 新の勝ち／決着 | 勝率 |\n| :-- | --: | --: |`)
        for (const [k, [w, n]] of Object.entries(breakdown).sort()) console.log(`| ${k} | ${w}／${n} | ${pct(w / Math.max(1, n))} |`)
    }
    console.log(`| 例外 | ${errs} |`)
    console.log(`| 新のバースト（セット／発動／断った） | ${burstCount.セット} / ${burstCount.発動} / ${burstCount.断った} |`)
    if (process.env.BS_AI_BURST_TRACE) {
        const rate = (g: typeof allGames): string => `${g.filter((x) => x.won).length}/${g.length}（${((100 * g.filter((x) => x.won).length) / Math.max(1, g.length)).toFixed(1)}%）`
        const withSet = allGames.filter((g) => g.decs.some((d) => d.kind !== "断り"))
        console.log(`セットした局 ${rate(withSet)} / しなかった局 ${rate(allGames.filter((g) => !withSet.includes(g)))}`)
        const sets = allGames.flatMap((g) => g.decs.filter((d) => d.kind !== "断り"))
        const by = (f: (d: Dec) => string): string => Object.entries(sets.reduce<Record<string, number>>((m, d) => ((m[f(d)] = (m[f(d)] ?? 0) + 1), m), {})).map(([k, v]) => `${k}=${v}`).join(" ")
        for (const k of ["removal", "guard", "buffOwn", "draw", "other"]) {
            const g = allGames.filter((x) => x.decs.some((d) => d.kind !== "断り" && d.bk === k))
            console.log(`バーストの種類 ${k}: セット ${sets.filter((d) => d.bk === k).length}回 / 局の勝率 ${rate(g)}`)
        }
        console.log("種類:", by((d) => d.ctype), "| 手札で使えた:", by((d) => String(d.usable)), "| 入れ替え:", by((d) => String(d.replaced)), "| ターン:", by((d) => String(d.turn)))
        console.log("旧が打った手:", by((d) => d.altOld.replace(/^.*?を/, "…を").replace(/Lv\d/, "Lv")), "| 召喚できたのにセット:", sets.filter((d) => d.summonsAvail > 0).length)
        for (const g of allGames.filter((x) => !x.won && x.decs.length > 0).slice(0, Number(process.env.BS_AI_BURST_TRACE_N) || 3)) console.log("負け", g.label, JSON.stringify(g.decs), "\n  " + g.log.join("\n  "))
    }
    console.log(`| 所要時間 | ${((Date.now() - t0) / 1000).toFixed(0)}秒 |`)
}
// --scenario low-life：開始局面を固定した計測（局面の組み方は lowLife のコメント）。--vs-old と同じ新旧の組
function lowLife(): void {
    const NEW: AiPolicy = CANDIDATE_POLICY
    // thenPay でアタックステップを終える守りのバースト（効果データから選ぶ）。手札に1枚持たせる
    const guard = loadAllCards().find((c) => c.type === "magic" && burstKind(c.cardId) === "guard" && c.effects.some((e) => e.kind === "burst" && e.thenPay === "flash") && c.effects.some((e) => e.kind === "magic" && e.timing === "flash" && anyNode(e.action, (x) => x.type === "endAttackStepAfterBattle")))
    if (!guard) throw new Error("守りのバーストが見つからない")
    type Row = { lowIsNew: boolean; won: boolean; set: boolean; fired: boolean; paid: number; declinedReady: number; declinedIdle: number; paidIdle: number }
    const rows: Row[] = []
    const t0 = Date.now()
    console.log(`新側: CANDIDATE_POLICY / 守りのバースト=${guard.name} / 組=${MATCHUPS.length} × N=${N}`)
    for (let i = 0; i < MATCHUPS.length; i++) {
        for (let n = 0; n < N; n++) {
            // 偶数＝新がライフ2の側。ライフ2の側が先攻（ターン4）。ライフ2の側の色デッキは組の a／b を交互に
            const lowIsNew = n % 2 === 0
            const lowPid: PlayerId = (n >> 1) % 2 === 0 ? "p1" : "p2"
            const newPid: PlayerId = lowIsNew ? lowPid : lowPid === "p1" ? "p2" : "p1"
            const oppPid: PlayerId = lowPid === "p1" ? "p2" : "p1"
            const policies: Record<PlayerId, AiPolicy> = { p1: newPid === "p1" ? NEW : OLD_SIDE, p2: newPid === "p2" ? NEW : OLD_SIDE }
            const row: Row = { lowIsNew, won: false, set: false, fired: false, paid: 0, declinedReady: 0, declinedIdle: 0, paidIdle: 0 }
            try {
                const decks = { p1: MATCHUPS[i]!.a, p2: MATCHUPS[i]!.b }
                const s: GameState = createGame(`low-${i}-${n}`, { p1: "A", p2: "B" }, decks, lowPid)
                s.turn = 4
                runTurnStart(s)
                s.interactiveTargets = true
                const low = s.players[lowPid]
                const rec = KIFU?.start({ id: `low-${MATCHUPS[i]!.label}#${n}`, decks: MATCHUPS[i]!.label, first: lowPid, newPid }, policies)
                low.life = 2
                low.reserve = 10
                low.hand = [guard.cardId, ...low.hand.filter((c) => getCard(c).type !== "magic").slice(0, 2)]
                low.burst = null
                const oppDeck = Object.keys(DECK_RECIPES[decks[oppPid] as string]?.cards ?? {}).filter((c) => getCard(c).type === "spirit" && getCard(c).cost <= 3)
                for (let k = 0; k < 3 && oppDeck.length > 0; k++) s.players[oppPid].field.spirits.push(createInstance(oppDeck[k % oppDeck.length]!, 1, 1))
                // ライフ2の側にもスピリットを2体（相手の攻撃を受け止めうる・反撃しうる）
                const lowDeck = Object.keys(DECK_RECIPES[decks[lowPid] as string]?.cards ?? {}).filter((c) => getCard(c).type === "spirit" && getCard(c).cost <= 3)
                for (let k = 0; k < 2 && lowDeck.length > 0; k++) low.field.spirits.push(createInstance(lowDeck[k % lowDeck.length]!, 1, 1))
                const hook = (move: { action: { type: string; option?: string; handIndex?: number } }, st: GameState): void => {
                    const a = move.action
                    if (a.type === "setBurst" && a.handIndex !== undefined && st.players[newPid].hand[a.handIndex] === guard.cardId) row.set = true
                    if (a.type !== "resolveChoice") return
                    const pc = st.pendingChoice
                    if (pc?.burstActivate?.cardId === guard.cardId && a.option !== undefined) row.fired = true
                    if (pc?.burstThenPay) {
                        const ready = st.players[oppPid].field.spirits.some((sp) => !sp.isRested)
                        if (a.option !== undefined) (ready ? (row.paid++, 0) : row.paidIdle++)
                        else ready ? row.declinedReady++ : row.declinedIdle++
                    }
                }
                let total = 0
                while (!s.winner && total < MAX_ACTIONS) {
                    const acted = (["p1", "p2"] as PlayerId[]).reduce((sum, pid) => sum + pumpAiSync(s, pid, 60, rec ? rec.hook(pid, pid === lowPid && lowIsNew ? hook : undefined) : pid === lowPid && lowIsNew ? hook : undefined, policies), 0)
                    if (acted === 0) break
                    total += acted
                }
                rec?.finish(s)
                row.won = s.winner === lowPid
                if (s.winner) rows.push(row)
            } catch (e) {
                console.error(`例外 ${MATCHUPS[i]!.label}#${n}:`, (e as Error).stack?.split("\n").slice(0, 5).join(" | "))
            }
        }
    }
    const pct = (w: number, n: number): string => {
        const p = n ? w / n : 0, se = n ? Math.sqrt((p * (1 - p)) / n) : 0
        return `${(100 * p).toFixed(1)}%（95%区間 ${(100 * Math.max(0, p - 1.96 * se)).toFixed(1)}〜${(100 * Math.min(1, p + 1.96 * se)).toFixed(1)}、${w}/${n}）`
    }
    const newLow = rows.filter((r) => r.lowIsNew), oldLow = rows.filter((r) => !r.lowIsNew)
    console.log(`| 項目 | 値 |\n| :-- | --: |`)
    console.log(`| 決着した局 | ${rows.length} |`)
    console.log(`| ライフ2の側が新のとき、ライフ2の側の勝率 | ${pct(newLow.filter((r) => r.won).length, newLow.length)} |`)
    console.log(`| ライフ2の側が旧のとき、ライフ2の側の勝率 | ${pct(oldLow.filter((r) => r.won).length, oldLow.length)} |`)
    console.log(`| 新が守りをセットした局 | ${newLow.filter((r) => r.set).length}/${newLow.length} |`)
    console.log(`| 守りのバーストを発動した局 | ${newLow.filter((r) => r.fired).length} |`)
    console.log(`| 発動した局の勝率／しなかった局の勝率 | ${pct(newLow.filter((r) => r.fired && r.won).length, newLow.filter((r) => r.fired).length)} ／ ${pct(newLow.filter((r) => !r.fired && r.won).length, newLow.filter((r) => !r.fired).length)} |`)
    const sum = (f: (r: Row) => number): number => newLow.reduce((a, r) => a + f(r), 0)
    console.log(`| thenPay を払った（相手に回復スピリットあり） | ${sum((r) => r.paid)} |`)
    console.log(`| 払えたのに払わなかった（相手に回復スピリットあり） | ${sum((r) => r.declinedReady)} |`)
    console.log(`| 払わなかった（相手の回復スピリットなし） | ${sum((r) => r.declinedIdle)} |`)
    console.log(`| 払った（相手の回復スピリットなし） | ${sum((r) => r.paidIdle)} |`)
    console.log(`| 所要時間 | ${((Date.now() - t0) / 1000).toFixed(0)}秒 |`)
}
if (args.includes("--scenario") && args[args.indexOf("--scenario") + 1] === "low-life") {
    lowLife()
    KIFU?.writeIndex()
    process.exit(0)
}
if (VS_OLD) {
    vsOld()
    KIFU?.writeIndex()
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
                const rec = KIFU?.start({ id: `bench-${MATCHUPS[i]!.label}#${n}`, decks: MATCHUPS[i]!.label, first: s.turnPlayer })
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
                    const acted = (["p1", "p2"] as PlayerId[]).reduce((sum, pid) => sum + pumpAiSync(s, pid, 60, rec ? rec.hook(pid, hook) : hook), 0)
                    if (acted === 0) {
                        stalled++
                        break
                    }
                    total += acted
                }
                rec?.finish(s)
                if (!s.winner && total >= MAX_ACTIONS) unfinished++
                turns += s.turn
            } catch (e) {
                errors++
                console.error(`例外 ${MATCHUPS[i]!.label}#${n}:`, (e as Error).stack?.split("\n").slice(0, 5).join(" | "))
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
KIFU?.writeIndex()
console.log(`| 所要時間 | ${((Date.now() - t1) / 1000).toFixed(0)}秒 |`)
for (const k of Object.keys(counts).sort()) console.log(`| ${k} | ${counts[k]} |`)
