// 【強化】（BS19。色ごとに1種・同じ記述は重なる：Q754・Q755）。
// keyword エントリの kyoka 欄が効果の種類（赤=bpDestroy・紫=coreRemove・緑=exhaust・白=refresh・黄=bpMinus・青=deckMill）。
// カードの色ではなく効果の種類で効くので、既存の弾の効果（マジック・ネクサス・バーストも）にも乗る（Q758）
import { entryActive } from "../../../../shared/rules/effectStop"
import { noteCoverage } from "../../../../shared/coverage"
import type { GameState, PlayerId } from "../../type"
import { getCard } from "../GameState"
import { currentLevel, effectSources, hasGlobalConstraint } from "../../../../shared/rules"

// 【強化】の対象になる効果の種類（effectDef.ts の keyword エントリの kyoka 欄と同じ値）
export type KyokaKind = "bpDestroy" | "coreRemove" | "exhaust" | "refresh" | "bpMinus" | "deckMill"

// 効果の使用者（発生源の持ち主）pid の【強化】（種類 kind）の数。effectSources＝発生源のうち
// Lv・whileCombined を満たし、効果が止められていないもの（仮想発生源も含む）
export function kyokaBonus(state: GameState, pid: PlayerId, kind: KyokaKind): number {
    // BS21-053 Lv2：発生源の持ち主の相手の【強化】は発揮されない
    if (hasGlobalConstraint(state, "opponentKyokaSuppressed", (_e, srcPid) => srcPid !== pid)) return 0
    let total = 0
    for (const source of effectSources(state, pid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "keyword" || effect.keyword !== "kyoka" || effect.kyoka !== kind) continue
            if (!entryActive(state, pid, source, effect, level)) continue
            noteCoverage(effect, "keyword")
            total++
        }
    }
    return total
}
