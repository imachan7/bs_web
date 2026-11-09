// 概念: kind:"summonPayOff"（自分のカードを破壊することで、召喚コストを払ったものとして扱う）の候補と、その場合の支払うコスト。
// サーバーの validateSummon／doSummon とクライアントの支払いUIが共用する
import type { Color, PlayerId } from "../server/src/type"
import type { Board } from "./board"
import { card } from "./cardDb"
import { cardMatchesSummonPick, effectiveCost } from "./cost"
import { bravesOf, currentLevel, effectSources } from "./rules/level"
import { entryActive } from "./rules/effectStop"

export type SummonPayOffOption = {
    targetInstanceId: string // 破壊する個体（treatAs:"braveCost" ならブレイヴ、"fullReduction" なら発生源自身）
    sourceInstanceId: string
    treatAs: "braveCost" | "fullReduction"
}

// 破壊は召喚コストの支払いの一部なので、手札の cardId を召喚するときに使える個体を列挙する。
// 同じ個体が複数のエントリで候補になっても1つずつ（発生源×破壊対象）
export function summonPayOffOptions(board: Board, pid: PlayerId, cardId: string): SummonPayOffOption[] {
    const player = board.players[pid]
    const summoned = card(cardId)
    const result: SummonPayOffOption[] = []
    for (const source of effectSources(board, pid)) {
        if (!player.field.spirits.includes(source)) continue
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "summonPayOff") continue
            if (!entryActive(board, pid, source, effect, level)) continue
            if (effect.whileCombined === true && bravesOf(player, source).length === 0) continue
            if (effect.phaseTurn && (effect.phaseTurn.phase !== board.phase || (effect.phaseTurn.turn === "own" && pid !== board.turnPlayer))) continue
            if (!cardMatchesSummonPick(summoned, effect.pick)) continue
            const targets = effect.destroy === "self" ? [source] : bravesOf(player, source)
            for (const t of targets) {
                if (!result.some((r) => r.targetInstanceId === t.instanceId)) result.push({ targetInstanceId: t.instanceId, sourceInstanceId: source.instanceId, treatAs: effect.treatAs })
            }
        }
    }
    return result
}

// 軽減・追加コストを適用した後の支払うコスト（option が無ければ通常どおり）。
// 「ブレイヴのコストだけ」は印刷コスト（Q4477）。残りは通常どおり払う
export function summonCostWithPayOff(board: Board, pid: PlayerId, cardId: string, option: SummonPayOffOption | undefined, exReductionSymbols: Color[] = []): number {
    const cardData = card(cardId)
    if (option?.treatAs === "fullReduction") return effectiveCost(board, pid, cardData, false, exReductionSymbols, false, true, true)
    const base = effectiveCost(board, pid, cardData, false, exReductionSymbols)
    if (option?.treatAs !== "braveCost") return base
    const brave = board.players[pid].field.combinedBraves.find((b) => b.instanceId === option.targetInstanceId)
    return Math.max(0, base - (brave ? card(brave.cardId).cost : 0))
}
