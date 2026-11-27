// 【Uトリガー】の判定（docs/design/ULTIMATE_STAGE6.md §2・ULTIMATE_PLAN C3・C4）。クライアントの表示からも読めるよう shared に置く
import type { CardData, CardInstance, PlayerId, ResolvedTargetFilter } from "../../server/src/type"
import type { Board } from "../board"
import { fieldCandidates, matchesTarget } from "./targetFilter"
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

// 条件 uTriggerHitting：このバトルでヒットしている pid のアルティメットのうち、絞り込みに合うものがあるか
export function uTriggerHittingNow(board: Board, pid: PlayerId, filter: ResolvedTargetFilter): boolean {
    const hitters = board.battle?.uTriggerHitters
    if (!hitters || hitters.length === 0) return false
    // 絞り込みの kinds はほかの絞り込みと同じ読み方（省略はスピリットだけ）。データ側で kinds:["ultimate"] を書く（validate:cards が見る）
    return fieldCandidates(board.players[pid], { kinds: ["ultimate", "spirit"] }).some((i) => hitters.includes(i.instanceId) && matchesTarget(board, pid, i, filter))
}

// 段3 の窓でUトリガー全体がガードされたら呼ぶ（窓は未実装なので呼び出し元は uTriggerWindow の印だけ）
export function clearUTriggerHitter(board: Board, instanceId: string): void {
    const b = board.battle
    if (b?.uTriggerHitters) b.uTriggerHitters = b.uTriggerHitters.filter((id) => id !== instanceId)
}
