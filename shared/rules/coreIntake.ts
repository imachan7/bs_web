// 概念: 「このカードには、このカード自身の効果以外ではコアを置けない」（globalConstraint "coreIntakeSelfOnly"）
import type { CardInstance } from "../../server/src/type"
import { card } from "../cardDb"
import { noteCoverage } from "../coverage"

// 置く側の発生源が inst 自身なら false（自分の効果なので置ける）
export function coreIntakeRefused(inst: CardInstance, sourceInstanceId?: string): boolean {
    if (sourceInstanceId === inst.instanceId) return false
    const effect = card(inst.cardId).effects.find((e) => e.kind === "globalConstraint" && e.constraint.type === "coreIntakeSelfOnly")
    if (effect) noteCoverage(effect, "globalConstraint")
    return effect !== undefined
}
