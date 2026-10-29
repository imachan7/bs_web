// ライフを減らす処理の入口。制限の判定本体は shared/rules/constraints.ts の lifeLossAllowed（クライアントのアタック判定と共有するため）
import type { CardInstance, GameState, PlayerId } from "../type"
import { lifeLossAllowed } from "../../../shared/rules"
import type { LifeLossQuery } from "../../../shared/rules"
import { recordLifeLost } from "./record"
import { getCard } from "./GameState"

export { lifeLossAllowed }
export type { LifeLossQuery }

// コストは全部払えるときだけ払える（COST_MODEL §1）
export const canPayLife = (state: GameState, q: LifeLossQuery): boolean => lifeLossAllowed(state, q) >= q.amount

// 発生源の効果のコストでライフを払う問い合わせ。actorPid は効果の持ち主（相手のライフを払わせるときだけ pid と違う）
export const lifeCostQuery = (pid: PlayerId, amount: number, source: CardInstance | null, actorPid: PlayerId = pid): LifeLossQuery => ({
    pid,
    amount,
    cause: "cost",
    actorPid,
    sourceType: source ? getCard(source.cardId).type : undefined,
    sourceInstance: source ?? undefined,
})

// 減らしたあとの記録。「スピリット×減らされた側」の組ごとに累計する
export function recordLifeLoss(state: GameState, pid: PlayerId, amount: number, sourceInstance?: CardInstance | null): void {
    recordLifeLost(state, pid, amount)
    if (sourceInstance) addLifeDealt(sourceInstance, pid, amount)
}

// ライフ置換（コアが別の経路で動いた）のときだけ、グローバルな記録なしで累計だけ足す
export function addLifeDealt(source: CardInstance, pid: PlayerId, amount: number): void {
    if (amount <= 0) return
    const dealt = (source.lifeDealtThisTurn ??= {})
    dealt[pid] = (dealt[pid] ?? 0) + amount
}
