// 数え上げの統一（M3）：「〜1体につき」の量は countCounter/amountCounter のどちらでも
// 「base × カウンタ値」で計算する（countCounter指定時のbaseはcount??1、amountCounter指定時はamount）。
// 各ハンドラはここを呼ぶだけにして、EffectCounter の判定式を個別実装しない。
import type { CardInstance, CardType, EffectCounter, GameState, PlayerId } from "../type"
import { countEffectCounter } from "./EffectModules"
import { instFamilies, instanceSymbolCount, spiritHasFamily } from "../../../shared/rules"

// 対象に依存するカウンタ。countEffectCounter は対象を知らないので、対象を選んだ後にここで数える
function countForTarget(state: GameState, owner: PlayerId, counter: EffectCounter, target: CardInstance): number | undefined {
    if (counter === "targetSymbols") return instanceSymbolCount(target)
    if (counter === "targetSameFamilyOwn") {
        const families = instFamilies(target)
        return state.players[owner].field.spirits.filter((s) => families.some((f) => spiritHasFamily(state, owner, s, f))).length
    }
    return undefined
}

export function countedAmount(
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    base: number,
    counter: EffectCounter,
    srcType: CardType | undefined,
    max?: number,
    target?: CardInstance,
): number {
    const raw = (target && countForTarget(state, owner, counter, target)) ?? countEffectCounter(state, owner, self, counter, srcType)
    const amount = base * raw
    return max !== undefined ? Math.min(amount, max) : amount
}
