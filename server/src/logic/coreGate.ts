// コアを取り除く問い合わせ：「取り除けない」系の禁止を1か所に集める（EFFECT_GATE.md §4 の 5c）
//
// 「取り除けない」は対象に取られることを防がない（10-30 ユーザー確認）。効果の候補には出し、取り除く時点で止める。
// コストと【転召】だけは、全部動かせるときだけ払える／対象にできるので、呼び出し側が amount に払う数を渡して比べる
import { activeConstraints, coresCantBeRemoved, coresCantBeRemovedByOpponent, globalCoresCantBeRemoved, hasGlobalConstraint } from "../../../shared/rules"
import type { CardInstance, CardType, GameState, PlayerId } from "../type"
import { coreFloorFor, isBattlingCoreProtected } from "./removal"
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
}

// 取り除いてよい数（0〜min(amount, target.cores)）
export function coreRemovalAllowed(state: GameState, a: CoreRemovalAttempt): number {
    const { ownerPid, target, cause, actorPid } = a
    const have = Math.min(a.amount, target.cores)
    if (a.pierce === "all" && cause === "effect") return have
    if (coresCantBeRemoved(state, ownerPid, target)) return 0
    // exceptOwnerEffects が通すのは持ち主自身の「効果」だけ（持ち主自身の支払い・コア移動は止まる）。
    // 【転召】は全体制約を通す（セフィロ・アリエスの「【転召】以外では」）
    if (cause !== "tensho" && globalCoresCantBeRemoved(state, ownerPid, cause === "effect" && actorPid === ownerPid)) return 0
    if (cause === "effect" && actorPid !== ownerPid) {
        if (activeConstraints(state, ownerPid, target).some((c) => c.type === "coresImmovableByOpponent")) return 0
        if (coresCantBeRemovedByOpponent(state, ownerPid, target, a.sourceType)) return 0
    }
    if (isBattlingCoreProtected(state, target)) return 0
    let allowed = Math.max(0, Math.min(have, target.cores - coreFloorFor(state, target, ownerPid, actorPid)))
    // noCoreZeroOutsideEffect（BS19-103）：効果以外の手段（コア移動・コスト・【転召】）ではスピリットのコアを0個にできない。
    // 効果によるコア除去（cause:"effect"）は従来どおり通る
    if (cause !== "effect" && getCard(target.cardId).type === "spirit" && hasGlobalConstraint(state, "noCoreZeroOutsideEffect")) {
        allowed = Math.min(allowed, Math.max(0, target.cores - 1))
    }
    return allowed
}
