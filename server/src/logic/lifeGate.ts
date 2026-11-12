// ライフを減らす処理の入口。制限の判定本体は shared/rules/constraints.ts の lifeLossAllowed（クライアントのアタック判定と共有するため）
import type { CardInstance, GameState, PlayerId } from "../type"
import { lifeLossAllowed } from "../../../shared/rules"
import type { LifeLossQuery } from "../../../shared/rules"
import { recordLifeLost } from "./record"
import { getCard, log, opponentOf } from "./GameState"
import { tryOwnLifeFloorByCost } from "./EffectModules"

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

// ライフが0以下になったときの勝敗の確定。勝敗はここでだけ決める（各経路に散らばっていて、書き忘れた経路で負けにならなかった。#437 R10）。
// 王都（BS14-084：ネクサスをトラッシュに置いて0を回避）を払えれば "saved"。原因は問わない（2026-09-13 ユーザー判断）。
// ライフを減らした経路は直後にこれを呼ぶ。呼び忘れても handleAction の最後（settleAllLifeZero）が拾う
export function settleLifeZero(state: GameState, pid: PlayerId): "alive" | "saved" | "lost" {
    if (state.winner || state.players[pid].life > 0) return "alive"
    if (tryOwnLifeFloorByCost(state, pid)) return "saved"
    const winner = opponentOf(pid)
    state.winner = winner
    log(state, `${state.players[winner].name}の勝利！`)
    return "lost"
}

// 1つの操作の最後の網：ターンプレイヤーから順に見る
export function settleAllLifeZero(state: GameState): void {
    for (const pid of [state.turnPlayer, opponentOf(state.turnPlayer)]) settleLifeZero(state, pid)
}
