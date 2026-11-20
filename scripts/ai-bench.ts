// AI の強さの測定（npm run ai:bench [局数=3]）。定型の検証には入れない（自己対戦を数十局回すため）。
// 6色の総当たり（同色を含む21組）を各 N 局回し、詰まり・例外・手の種類・無意味手を数える。
// 無意味手の定義は docs/design/AI_OPPONENT.md §7。乱数は Math.random のままなので、比べるときは同じ N で。
import { createGame } from "../server/src/logic/GameState"
import { runTurnStart } from "../server/src/logic/PhaseManager"
import type { Color, GameState, PlayerId } from "../server/src/type"
import { pumpAiSync } from "../server/src/ai/runner"
import { magicTags } from "../server/src/ai/moveTags"

const N = Number(process.argv[2] ?? 3) || 3
const COLORS: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
const MAX_ACTIONS = 6000

const counts: Record<string, number> = {}
const bump = (k: string): void => {
    counts[k] = (counts[k] ?? 0) + 1
}

let games = 0
let turns = 0
let stalled = 0
let errors = 0
let unfinished = 0

for (let i = 0; i < COLORS.length; i++) {
    for (let j = i; j < COLORS.length; j++) {
        for (let n = 0; n < N; n++) {
            games++
            try {
                const s: GameState = createGame(`bench-${i}-${j}-${n}`, { p1: "A", p2: "B" }, { p1: COLORS[i]!, p2: COLORS[j]! })
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
                console.error(`例外 ${COLORS[i]}-${COLORS[j]}#${n}:`, (e as Error).message)
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
for (const k of Object.keys(counts).sort()) console.log(`| ${k} | ${counts[k]} |`)
