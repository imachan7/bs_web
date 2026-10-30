// globalConstraint "coreGainCap"（BS17-063 黒き聖杯）。
// 2026-10-17 ユーザー確認：マジックの効果は数えない／累計は相手の効果すべての合計／
// コアステップ・コストの支払い（効果ではない）は対象外。
import { entryActive } from "../../../shared/rules/effectStop"
import type { CardType, GameState, PlayerId } from "../type"
import { currentLevel, getCard } from "./GameState"
import { effectSources, hasGlobalConstraint, isEndStepLocked } from "../../../shared/rules"
import { noteCoverage } from "../../../shared/coverage"

export type CoreGainFrom = "void" | "trash"
export type CoreGainTo = "life" | "field" | "reserve"

// pid が自分の from から自分の to へ、srcType の効果で置けるコアの残り個数（制限が無ければ Infinity）。
// 制限は pid の相手のフィールドの発生源が掛ける（side:"both" の発生源は自分側のものも掛かる）
export function coreGainAllowance(
    state: GameState,
    pid: PlayerId,
    srcType: CardType | undefined,
    from: string,
    to: string,
): number {
    if (srcType === undefined || (from !== "void" && from !== "trash")) return Infinity
    if (to !== "life" && to !== "field" && to !== "reserve") return Infinity
    let remaining = Infinity
    for (const sourcePid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, sourcePid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "coreGainCap") continue
                if (!entryActive(state, sourcePid, source, effect, level)) continue
                const c = effect.constraint
                if (c.side !== "both" && sourcePid === pid) continue
                if (!c.sourceTypes.includes(srcType as "spirit" | "brave" | "nexus")) continue
                if (!c.from.includes(from) || !c.to.includes(to)) continue
                noteCoverage(effect, "globalConstraint")
                remaining = Math.min(remaining, c.max - (state.coreGainCountThisTurn[pid] ?? 0))
            }
        }
    }
    return Math.max(remaining, 0)
}

// 実際に置けた個数を累計へ足す（制限が掛かる配置だけ呼べばよいが、掛からない配置で呼んでも無害ではないので
// allowance が有限のときだけ呼ぶこと）
export function recordCoreGain(state: GameState, pid: PlayerId, count: number): void {
    state.coreGainCountThisTurn[pid] = (state.coreGainCountThisTurn[pid] ?? 0) + count
}

// 配置1回ぶんの入口：requested のうち置いてよい個数を返し、累計に加える
export function takeCoreGainAllowance(
    state: GameState,
    pid: PlayerId,
    srcType: CardType | undefined,
    from: string,
    to: string,
    requested: number,
): number {
    const allowed = coreGainAllowance(state, pid, srcType, from, to)
    if (allowed === Infinity) return requested
    const n = Math.min(requested, allowed)
    recordCoreGain(state, pid, n)
    return n
}

// コアを置くの問い合わせ（EFFECT_GATE.md §4 の 5j）：止める禁止の理由（無ければ null）。原因を問わない
export function coreGainBlocked(state: GameState, from: string, to: string): string | null {
    if (to === "life") {
        if ((from === "void" || from === "reserve") && isEndStepLocked(state, "lifeChargeFromVoidOrReserve")) return "ボイド/リザーブからライフにコアを置けない"
        if (from === "void" && hasGlobalConstraint(state, "noVoidToLife")) return "ボイドからライフにコアを置けない"
    }
    if (from === "void" && (to === "field" || to === "reserve") && state.phase !== "core" && hasGlobalConstraint(state, "voidCoreBlockedOutsideCoreStep")) {
        return "コアステップ以外はボイドからコアを置けない"
    }
    return null
}

// 置いてよい個数（0〜count）。禁止と、黒き聖杯・魂の海塔の上限をまとめて見る。累計には足さない（足すのは takeCoreGainAllowance）
export function coreGainAllowed(state: GameState, a: { pid: PlayerId; from: string; to: string; count: number; srcType?: CardType | undefined }): number {
    if (coreGainBlocked(state, a.from, a.to)) return 0
    return Math.max(0, Math.min(a.count, coreGainAllowance(state, a.pid, a.srcType, a.from, a.to)))
}
