// マジックをどのタイミングの効果として使うか。メインステップではメイン効果とフラッシュ効果のどちらも使える
// （requested で選ぶ。省略時はメイン効果を優先する）。バトル中のフラッシュタイミングではフラッシュ効果だけ
import type { CardData } from "../server/src/type"

type Timing = "main" | "flash"

const hasTiming = (card: CardData, timing: Timing): boolean => card.effects.some((e) => e.kind === "magic" && e.timing === timing)

// 使えないタイミングを求められたら null
export function magicUseTiming(card: CardData, inBattle: boolean, requested?: Timing): Timing | null {
    if (inBattle) return requested === "main" ? null : "flash"
    if (requested !== undefined) return hasTiming(card, requested) ? requested : null
    return hasTiming(card, "main") ? "main" : "flash"
}

// メインステップで「メイン効果／フラッシュ効果」を選ばせるか。フラッシュ側がすべて「メインステップでは使えない」なら選ばせない
export function magicTimingChoosable(card: CardData): boolean {
    return (
        hasTiming(card, "main") &&
        card.effects.some((e) => e.kind === "magic" && e.timing === "flash" && !e.mainForbidden)
    )
}
