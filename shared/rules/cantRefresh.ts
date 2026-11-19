// 「回復できない」の判定（globalConstraint／期間つき playerRule の cantRefresh）。
// リフレッシュステップ（PhaseManager）と効果による回復（refreshSpirit）が、経路つきでここを呼ぶ
import type { CantRefreshDef, CardInstance, CardType, EffectDef, PlayerId } from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { hasGlobalConstraint, timedPlayerRules, timedRecordsOn } from "./constraints"
import { matchesTarget } from "./targetFilter"

export type RefreshPath = { by: "step" } | { by: "effect"; sourceType: CardType }

// side は呼び出し側が見る（globalConstraint だけが持つ）
function pathAndInstMatch(def: CantRefreshDef, board: Board, ownerPid: PlayerId, inst: CardInstance, path: RefreshPath): boolean {
    if (def.by !== undefined && def.by !== path.by) return false
    if (path.by === "effect" && def.effectSource?.types && !def.effectSource.types.includes(path.sourceType)) return false
    if ((def.cardType ?? "spirit") !== (card(inst.cardId).type === "nexus" ? "nexus" : "spirit")) return false
    return matchesTarget(board, ownerPid, inst, def.target)
}

export function refreshBlockedByRule(board: Board, ownerPid: PlayerId, inst: CardInstance, path: RefreshPath): boolean {
    const fromField = hasGlobalConstraint(board, "cantRefresh", (effect: Extract<EffectDef, { kind: "globalConstraint" }>, sourcePid) => {
        const c = effect.constraint
        if (c.type !== "cantRefresh") return false
        if (c.side === "opponent" && ownerPid === sourcePid) return false
        if (c.side === "own" && ownerPid !== sourcePid) return false
        // エントリ直下の phase/turn は hasGlobalConstraint が見ない軸なのでここで見る
        if (effect.phase !== undefined && effect.phase !== board.phase) return false
        if (effect.turn === "own" && board.turnPlayer !== sourcePid) return false
        if (effect.turn === "opponent" && board.turnPlayer === sourcePid) return false
        return pathAndInstMatch(c, board, ownerPid, inst, path)
    })
    // このターンの間、個体に付いた「回復できない」（グラストラップ）。until:"nextRefresh" の記録はリフレッシュステップ専用なので含めない
    const onInst = timedRecordsOn(board, inst, false, (r) => r.until === "turn" && r.content.some((c) => c.type === "cantRefresh")).some((r) =>
        r.content.some((c) => c.type === "cantRefresh" && pathAndInstMatch(c, board, ownerPid, inst, path)),
    )
    return fromField || onInst || timedPlayerRules(board, ownerPid).some((r) => r.type === "cantRefresh" && pathAndInstMatch(r, board, ownerPid, inst, path))
}
