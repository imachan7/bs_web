// コアを取り除く問い合わせ：「取り除けない」系の禁止を1か所に集める（EFFECT_GATE.md §4 の 5c）
//
// 「取り除けない」は対象に取られることを防がない（10-30 ユーザー確認）。効果の候補には出し、取り除く時点で止める。
// コストと【転召】だけは、全部動かせるときだけ払える／対象にできるので、呼び出し側が amount に払う数を渡して比べる
import { activeConstraints, currentLevel, effectSources, hasGlobalConstraint, matchesTarget, timedBattleContents } from "../../../shared/rules"
import { noteCoverage } from "../../../shared/coverage"
import type { CoresProtectedRule } from "../types/coresProtected"
import { entryActive } from "../../../shared/rules/effectStop"
import type { CardInstance, CardType, GameState, PlayerId } from "../type"
import { coreFloorFor, isInCurrentBattle } from "./removal"
import { getCard } from "./GameState"

export type CoreRemovalAttempt = {
    ownerPid: PlayerId
    target: CardInstance
    amount: number
    // player＝プレイヤーの操作（コア移動・ソウルコア交換・支払い元の指定）
    cause: "effect" | "cost" | "tensho" | "player"
    actorPid: PlayerId
    sourceType?: CardType | undefined
    pierce?: "all"
    // 取り除いたコアの行き先がリザーブか（coresImmovableByOpponent の toReserveOnly が見る）
    toReserve?: true
}

function ruleBlocks(r: CoresProtectedRule, a: CoreRemovalAttempt): boolean {
    if (r.causes !== undefined && !r.causes.includes(a.cause)) return false
    if (r.by === "opponent" && a.actorPid === a.ownerPid) return false
    if (r.exceptOwnerEffects && a.cause === "effect" && a.actorPid === a.ownerPid) return false
    if (r.sourceTypes !== undefined && (a.sourceType === undefined || !r.sourceTypes.includes(a.sourceType))) return false
    if (r.to === "reserve" && !a.toReserve) return false
    return true
}

// 個体の constraint・場全体の globalConstraint・このバトルのブロッカーへの期間つき効果のどれかが、この取り除きを止めるか
export function coreProtectedBy(state: GameState, a: CoreRemovalAttempt): boolean {
    const { ownerPid, target } = a
    if (activeConstraints(state, ownerPid, target).some((c) => c.type === "coresProtected" && ruleBlocks(c, a))) return true
    if (state.battle?.blockerInstanceId === target.instanceId
        && timedBattleContents(state).some((c) => c.type === "coresProtected" && ruleBlocks(c, a))) return true
    for (const sourcePid of ["p1", "p2"] as PlayerId[]) {
        for (const inst of effectSources(state, sourcePid)) {
            const level = currentLevel(inst).level
            for (const effect of getCard(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "coresProtected") continue
                const c = effect.constraint
                if (!entryActive(state, sourcePid, inst, effect, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && sourcePid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && sourcePid === state.turnPlayer) continue
                if (c.side === "own" && ownerPid !== sourcePid) continue
                if (c.side === "opponent" && ownerPid === sourcePid) continue
                if (c.battle === "participants" && !isInCurrentBattle(state, target)) continue
                if (c.filter !== undefined && !matchesTarget(state, sourcePid, target, c.filter, inst.instanceId)) continue
                if (!ruleBlocks(c, a)) continue
                noteCoverage(effect, "globalConstraint")
                return true
            }
        }
    }
    return false
}

// 取り除いてよい数（0〜min(amount, target.cores)）
export function coreRemovalAllowed(state: GameState, a: CoreRemovalAttempt): number {
    const { ownerPid, target, cause, actorPid } = a
    const have = Math.min(a.amount, target.cores)
    if (a.pierce === "all" && cause === "effect") return have
    if (coreProtectedBy(state, a)) return 0
    let allowed = Math.max(0, Math.min(have, target.cores - coreFloorFor(state, target, ownerPid, actorPid)))
    // noCoreZeroOutsideEffect（BS19-103）：効果以外の手段（コア移動・コスト・【転召】）ではスピリットのコアを0個にできない。
    // 効果によるコア除去（cause:"effect"）は従来どおり通る
    if (cause !== "effect" && getCard(target.cardId).type === "spirit" && hasGlobalConstraint(state, "noCoreZeroOutsideEffect")) {
        allowed = Math.min(allowed, Math.max(0, target.cores - 1))
    }
    return allowed
}
