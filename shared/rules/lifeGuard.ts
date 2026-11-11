// ライフを減らす処理への制限 lifeGuard（server/src/types/lifeGuard.ts）の判定。
// 出口は constraints.ts の lifeLossAllowed（原因を問わない）と lifeDamageLimit（アタック）の2つで、どちらもここで集めた結果を畳む
import { noteCoverage } from "../coverage"

import type { CardInstance, LifeGuardDef, PlayerId } from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { entryActive } from "./effectStop"
import { spiritHasFamily } from "./keywordState"
import { currentLevel, effectSources } from "./level"
import { matchesTarget } from "./targetFilter"
import { timedPlayerRules } from "./constraints"
import type { LifeLossQuery } from "./constraints"

// 場にいる発生源の lifeGuard で、pid のライフを守る側に立つもの＋pid に積まれた期間つきの lifeGuard
function guardsProtecting(board: Board, pid: PlayerId): { guard: LifeGuardDef; effect?: Parameters<typeof noteCoverage>[0] }[] {
    const found: { guard: LifeGuardDef; effect?: Parameters<typeof noteCoverage>[0] }[] = []
    for (const owner of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, owner)) {
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "lifeGuard") continue
                const guard = effect.constraint
                if (guard.side === "own" && owner !== pid) continue
                if (guard.side === "opponent" && owner === pid) continue
                if (!entryActive(board, owner, source, effect, currentLevel(source).level)) continue
                if (effect.whileOwnBurstSet === true && !board.players[owner].burstSet) continue
                if (effect.phase !== undefined && board.phase !== effect.phase) continue
                if (effect.turn === "own" && owner !== board.turnPlayer) continue
                if (effect.turn === "opponent" && owner === board.turnPlayer) continue
                const fam = effect.condition?.ownFamilyCountAtLeast
                if (fam !== undefined) {
                    const wanted = Array.isArray(fam.family) ? fam.family : [fam.family]
                    const count = board.players[owner].field.spirits.filter((s) => wanted.some((f) => spiritHasFamily(board, owner, s, f))).length
                    if (count < fam.count) continue
                }
                found.push({ guard, effect })
            }
        }
    }
    for (const rule of timedPlayerRules(board, pid)) if (rule.type === "lifeGuard") found.push({ guard: rule })
    return found
}

function appliesTo(board: Board, g: LifeGuardDef, q: LifeLossQuery, spirit: CardInstance | undefined): boolean {
    if (g.from === "attack" && q.cause !== "attack") return false
    if (g.from === "effect" && q.cause !== "effect") return false
    if (g.byOpponentOnly && q.actorPid === q.pid) return false
    if (g.effectSource?.sourceTypes && !(q.sourceType !== undefined && g.effectSource.sourceTypes.includes(q.sourceType))) return false
    if (g.per === "spirit" && !spirit) return false
    // 持ち主の引き方：付与キーワード（keywordExclude）は持ち主基準で見るので、減らす側（actorPid）を渡す
    if (g.source && !(q.sourceInstance && matchesTarget(board, q.actorPid, q.sourceInstance, g.source))) return false
    return true
}

// この減少に当たる lifeGuard を集める。アタックでは sourceInstance がアタッカー
export function lifeGuardsApplying(board: Board, q: LifeLossQuery): LifeGuardDef[] {
    const spirit = q.sourceInstance && card(q.sourceInstance.cardId).type === "spirit" ? q.sourceInstance : undefined
    const hits: LifeGuardDef[] = []
    for (const { guard, effect } of guardsProtecting(board, q.pid)) {
        if (!appliesTo(board, guard, q, spirit)) continue
        if (effect) noteCoverage(effect, "globalConstraint")
        hits.push(guard)
    }
    return hits
}

// 当たった lifeGuard 全部を畳んだ「減らせる量」の上限と、下回れない値
export function lifeGuardBounds(board: Board, q: LifeLossQuery): { max: number; floor: number } {
    let max = Number.POSITIVE_INFINITY
    let floor = 0
    for (const g of lifeGuardsApplying(board, q)) {
        if (g.max !== undefined) {
            const dealt = g.total ? (g.used ?? 0) : g.per === "spirit" ? (q.sourceInstance?.lifeDealtThisTurn?.[q.pid] ?? 0) : 0
            max = Math.min(max, Math.max(0, g.max - dealt))
        }
        if (g.floor !== undefined) floor = Math.max(floor, g.floor)
    }
    return { max, floor }
}

// アタックで実際に減ったぶんを、記録してからの合計（total）の lifeGuard に足す。通常のアタック以外の減少で total を使うカードは無いので、呼ぶのはアタックの解決だけ。
// 足すのは期間つきの記録だけ（場のカードの lifeGuard はカードデータそのものなので書き換えない）
export function noteLifeGuardTotal(board: Board, q: LifeLossQuery, dealt: number): void {
    if (dealt <= 0) return
    const spirit = q.sourceInstance && card(q.sourceInstance.cardId).type === "spirit" ? q.sourceInstance : undefined
    for (const rule of timedPlayerRules(board, q.pid)) {
        if (rule.type === "lifeGuard" && rule.total && appliesTo(board, rule, q, spirit)) rule.used = (rule.used ?? 0) + dealt
    }
}
