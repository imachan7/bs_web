// 効果1つ（エントリ）単位で「いま発揮されるか」を決める入口（docs/design/ENTRY_ACTIVE.md）。
import type { CardInstance, PlayerId } from "../../server/src/type"
import type { Board } from "../board"
import { effectActiveOn, instEffectsSuppressed, nexusEffectsDisabledFor, nexusEffectsStopped } from "./level"

// effectActiveOn（Lv＋【合体時】）に、「持つ効果すべては発揮されない」個体でないこと、場のネクサスなら「個体ごと止められていない」「エントリ単位の停止（targetEffectLevels）に当たらない」を足す。
// effectSources も同じ個体を外しているが、場を直接走査する呼び出し元（cost.ts の magicRestriction など）はここでしか止まらない
export function entryActive(
    board: Board,
    pid: PlayerId,
    source: CardInstance,
    effect: { levels: number[] | null; whileCombined?: true },
    level: number,
): boolean {
    if (!effectActiveOn(source, effect, level)) return false
    if (instEffectsSuppressed(source)) return false
    if (!board.players[pid].field.nexuses.includes(source)) return true
    return !nexusEffectsStopped(board, pid, source) && !nexusEffectsDisabledFor(board, pid, source, effect)
}
