// 「直前のアクションで動いたカード」の記録（if の cond.last・カウンタ lastMoved/lastCost・sameCostAsLast が読む）。
// 効果ごとの枠（recordScope）に分けて持つ。中断しても、ステップの間に別の効果が挟まっても混ざらないため（IF_UNIFY.md §6）
import { randomUUID } from "node:crypto"
import type { GameState } from "../type"

export function newRecordScope(): string {
    return randomUUID()
}

export function currentRecordScope(state: GameState): string {
    return state.recordScope ?? ""
}

// scope は書く側が**開始時に控えた**枠を渡す（途中の誘発が recordScope を変えても自分の枠に書くため）
export function recordMoved(state: GameState, cardIds: string[], scope: string = currentRecordScope(state)): void {
    state.lastMoved = { ...(state.lastMoved ?? {}), [scope]: cardIds }
}

export function lastMovedOf(state: GameState): string[] {
    return state.lastMoved?.[currentRecordScope(state)] ?? []
}

// pay が「好きなだけ払う」の上限を探すときだけ、カウンタ lastMoved に仮の値を入れて then を判定する（COST_MODEL §1。2026-09-27 ユーザー確認：後半が解決しきれない数は選べない）
let probe: number | undefined
export function withMovedProbe<T>(n: number, f: () => T): T {
    probe = n
    try {
        return f()
    } finally {
        probe = undefined
    }
}

export function lastMovedCount(state: GameState): number {
    return probe ?? lastMovedOf(state).length
}
