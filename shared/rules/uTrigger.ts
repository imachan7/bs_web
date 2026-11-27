// 【Uトリガー】の判定（docs/design/ULTIMATE_STAGE6.md §2・ULTIMATE_PLAN C3・C4）。クライアントの表示からも読めるよう shared に置く
import type { CardData, CardInstance } from "../../server/src/type"
import { noteCoverage } from "../coverage"
import { instBaseCost } from "./level"

export type UTriggerVerdict = "hit" | "miss" | "guard"

// placedPrintedCost は置かれた札の印刷コスト（デッキのカードに軽減は効かない。C3）。ultimateCost は合体・コスト増減を反映した今のコスト。
// 「同じ」はヒットしない（Q803）
export function uTriggerVerdict(placedPrintedCost: number, ultimateCost: number, guarded: boolean): UTriggerVerdict {
    if (guarded) return "guard"
    return placedPrintedCost < ultimateCost ? "hit" : "miss"
}

// 置かれた札が、このアルティメットのUトリガーをガードするか（札側の静的な性質。コスト上限つきはアルティメットの今のコストで見る。C4）
export function isUTriggerGuard(placed: CardData, ultimate: CardInstance): boolean {
    for (const e of placed.effects ?? []) {
        if (e.kind !== "uTriggerGuard") continue
        if (e.ultimateMaxCost !== undefined && instBaseCost(ultimate) > e.ultimateMaxCost) continue
        noteCoverage(e, "uTriggerGuard")
        return true
    }
    return false
}
