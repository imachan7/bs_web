// ランダム対戦ドライバ（fuzzer）。`npm run fuzz` で走る。
//
// **書いたテストでは踏めない盤面**を大量に作り、システムが壊れないことを確かめる。
// 2026-08-15 に対話モードの火入れで「選んでも破壊されず、同じ選択が立ち続けて
// **実プレイで進行不能**になる」バグ（BS06-088）が見つかったのを受けて新設した。
// smoke は「書いた期待どおりか」を見るのに対し、ここは**壊れ方**だけを見る:
//
//   1. 例外を投げない
//   2. 応答しても解消しない選択待ちにならない（＝進行不能にならない）
//   3. カードの総数が変わらない（保存則）
//   4. 打てる手が尽きて止まらない（デッドロック）
//
// 実サーバーと同じ interactiveTargets = true で走らせる。デッキは**全カードプールから
// ランダムに組む**（既定のレシピだと同じカードしか踏まないため）。
// シードを固定しているので、失敗したら同じシードで再現できる。
import { createGame } from "../server/src/logic/GameState"
import { handleAction } from "../server/src/logic/GameEngine"
import { runTurnStart } from "../server/src/logic/PhaseManager"
import type { GameAction, GameState, PlayerId } from "../server/src/type"
import { loadAllCards } from "../data/loadCards"
import { DECK_SIZE } from "../data/constants"

interface CardRow {
    cardId: string
    name: string
    type?: string
    banned?: boolean
}
const CARDS = (loadAllCards() as unknown as CardRow[]).filter((c) => !c.banned)

const arg = (name: string, def: number): number => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
    return hit ? Number(hit.split("=")[1]) : def
}
const GAMES = arg("games", 40)
const BASE_SEED = arg("seed", 1)
const MAX_STEPS = arg("steps", 2000)
// 同じ選択待ちがこの回数だけ応答しても消えなければ「進行不能」とみなす
const STUCK_LIMIT = 30

// シード付き乱数（xorshift32）。同じシードなら同じ対戦を再現できる
function makeRng(seed: number): () => number {
    let x = seed >>> 0 || 1
    return () => {
        x ^= x << 13
        x >>>= 0
        x ^= x >>> 17
        x ^= x << 5
        x >>>= 0
        return x / 0x100000000
    }
}
const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)]!
function shuffled<T>(rng: () => number, arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[a[i], a[j]] = [a[j]!, a[i]!]
    }
    return a
}

// 全カードプールからデッキを組む（同名3枚まで＝実際のデッキ制限に合わせる）
function randomDeck(rng: () => number): Record<string, number> {
    const deck: Record<string, number> = {}
    let n = 0
    let guard = 0
    while (n < DECK_SIZE && guard++ < 1000) {
        const c = pick(rng, CARDS)
        const cur = deck[c.cardId] ?? 0
        if (cur >= 3) continue
        deck[c.cardId] = cur + 1
        n++
    }
    return deck
}

function totalCards(s: GameState): number {
    let n = 0
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        n += p.deck.length + p.hand.length + p.trashCards.length + p.tegamoto.length
        n += p.field.spirits.length + p.field.nexuses.length
    }
    n += s.revealedCards?.cardIds.length ?? 0
    // 【転召】の対象選択で中断中の召喚は、カードが手札から出てフィールドにもまだ無い（RESUME_STACK.md §6）
    n += s.summoningInstanceId !== undefined ? 1 : 0
    return n
}

// いま手を打つべきプレイヤー
function actorOf(s: GameState): PlayerId {
    if (s.pendingChoice) return s.pendingChoice.pid
    if (s.battle || s.isFlashTiming) return s.priorityPlayer
    return s.turnPlayer
}

// 打てそうな手の候補（合法かどうかは handleAction が判定するので、ここでは形だけ並べる）
function candidateActions(s: GameState, pid: PlayerId): GameAction[] {
    const acts: GameAction[] = []
    const pc = s.pendingChoice
    if (pc) {
        if (pc.kind === "target") for (const id of pc.candidates) acts.push({ type: "resolveChoice", instanceId: id })
        else if (pc.kind === "option") for (const o of pc.options ?? []) acts.push({ type: "resolveChoice", option: o })
        else for (const i of pc.cardIndices ?? []) acts.push({ type: "resolveChoice", cardIndex: i })
        if (pc.optional) acts.push({ type: "resolveChoice" })
        return acts
    }
    const p = s.players[pid]
    for (let i = 0; i < p.hand.length; i++) {
        acts.push({ type: "summon", handIndex: i })
        acts.push({ type: "setNexus", handIndex: i })
        acts.push({ type: "castMagic", handIndex: i })
    }
    for (const sp of p.field.spirits) {
        acts.push({ type: "attack", instanceId: sp.instanceId })
        acts.push({ type: "block", instanceId: sp.instanceId })
        acts.push({ type: "moveCore", instanceId: sp.instanceId, direction: "add" })
    }
    acts.push({ type: "takeLife" }, { type: "pass" }, { type: "nextPhase" }, { type: "endTurn" })
    return acts
}

interface Anomaly {
    seed: number
    kind: string
    detail: string
}
const anomalies: Anomaly[] = []
let finished = 0
let totalSteps = 0

for (let g = 0; g < GAMES; g++) {
    const seed = BASE_SEED + g
    const rng = makeRng(seed)
    let s: GameState
    try {
        s = createGame(`fuzz-${seed}`, { p1: "アキラ", p2: "ユウキ" }, { p1: randomDeck(rng), p2: randomDeck(rng) })
    } catch (e) {
        anomalies.push({ seed, kind: "ゲーム開始で例外", detail: (e as Error).message })
        continue
    }
    s.interactiveTargets = true // 実サーバーと同じ経路
    runTurnStart(s) // スタートステップ（実サーバーもゲーム開始時に呼ぶ）
    let expected = totalCards(s)
    let stuck = 0
    let lastPending: unknown = null
    let steps = 0

    for (; steps < MAX_STEPS && !s.winner; steps++) {
        const pid = actorOf(s)
        const before = s.pendingChoice
        // 同じ選択待ちが延々と残っていないか（＝実プレイなら何度選んでも進めない）
        if (before && before === lastPending) {
            if (++stuck >= STUCK_LIMIT) {
                anomalies.push({
                    seed,
                    kind: "選択待ちが解消しない（進行不能）",
                    detail: `${STUCK_LIMIT}回応答しても同じ選択待ちのまま: ${before.prompt}`,
                })
                break
            }
        } else {
            stuck = 0
        }
        lastPending = before

        let acted = false
        let crashed = false
        const rejected: string[] = []
        // **両プレイヤーぶん試す**：実サーバーではどちらの操作も受け付けるので、
        // 「動くべき側」を読み違えただけでデッドロックと誤判定しないようにする
        const actors: PlayerId[] = pid === "p1" ? ["p1", "p2"] : ["p2", "p1"]
        for (const actor of actors) {
            for (const a of shuffled(rng, candidateActions(s, actor))) {
                let err: string | null
                try {
                    err = handleAction(s, actor, a)
                } catch (e) {
                    anomalies.push({
                        seed,
                        kind: "例外",
                        detail: `${a.type}（${actor}／turn=${s.turn} phase=${s.phase}）: ${(e as Error).message}`,
                    })
                    crashed = true
                    break
                }
                if (err === null) {
                    acted = true
                    break
                }
                if (rejected.length < 6) rejected.push(`${actor}:${a.type}→${err}`)
            }
            if (acted || crashed) break
        }
        if (crashed) {
            steps = MAX_STEPS // このゲームは打ち切る
            break
        }
        if (!acted) {
            anomalies.push({
                seed,
                kind: "デッドロック",
                detail: `打てる手が無い（turn=${s.turn} phase=${s.phase} battle=${s.battle ? "有" : "無"} flash=${s.isFlashTiming}）／断られた例: ${rejected.join(" | ")}`,
            })
            break
        }
        // 保存則（カードが増減していないか）。**増減した時点**で止めて原因の手を残す
        const now = totalCards(s)
        if (now !== expected) {
            anomalies.push({ seed, kind: "保存則違反", detail: `カード総数が ${expected} → ${now}` })
            expected = now // 同じゲームで何度も報告しない
        }
    }
    totalSteps += steps
    if (s.winner) finished++
}

console.log(`\nランダム対戦 ${GAMES}戦（seed ${BASE_SEED}〜${BASE_SEED + GAMES - 1}／${totalSteps}手）`)
console.log(`  決着まで進んだ対戦: ${finished}戦`)
if (anomalies.length === 0) {
    console.log("  異常なし ✅（例外なし・進行不能なし・保存則を維持・デッドロックなし）")
    process.exit(0)
}
const byKind = new Map<string, Anomaly[]>()
for (const a of anomalies) {
    const arr = byKind.get(a.kind) ?? []
    arr.push(a)
    byKind.set(a.kind, arr)
}
console.log(`  ❌ 異常 ${anomalies.length}件`)
for (const [kind, arr] of byKind) {
    console.log(`  [${kind}] ${arr.length}件`)
    for (const a of arr.slice(0, 8)) console.log(`    seed=${a.seed} ${a.detail}`)
    if (arr.length > 8) console.log(`    …ほか${arr.length - 8}件`)
}
console.log(`\n  再現: npx tsx scripts/fuzz.ts --games=1 --seed=<上のseed>`)
process.exit(1)
