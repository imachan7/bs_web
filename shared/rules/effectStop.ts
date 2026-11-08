// 効果1つ（エントリ）単位で「いま発揮されるか」を決める入口（docs/design/ENTRY_ACTIVE.md）。
import type { CardInstance, Phase, PlayerId } from "../../server/src/type"
import type { Board } from "../board"
import { effectActiveOn, instEffectsSuppressed, nexusEffectsDisabledFor, nexusEffectsStopped } from "./level"

// effectActiveOn（Lv＋【合体時】）に、「持つ効果すべては発揮されない」個体でないこと、場のネクサスなら「個体ごと止められていない」「エントリ単位の停止（targetEffectLevels）に当たらない」を足す。
// effectSources も同じ個体を外しているが、場を直接走査する呼び出し元（cost.ts の magicRestriction など）はここでしか止まらない
export function entryActive(
    board: Board,
    pid: PlayerId,
    source: CardInstance,
    // kind/trigger は combinedBraveEntryOk（合体中のブレイヴは【合体時】だけ。onSummon の誘発は例外）が見る
    effect: {
        levels: number[] | null
        whileCombined?: true
        kind?: string
        trigger?: string
        phaseTurn?: { phase?: Phase; turn?: TurnSide }
        phase?: Phase
        turn?: "own" | "opponent" | "both"
        step?: string
        aura?: { phaseTurn?: { phase?: Phase; turn?: TurnSide } }
    },
    level: number,
): boolean {
    if (!effectActiveOn(source, effect, level)) return false
    if (effect.phaseTurn && !inActivePeriod(board, pid, effect.phaseTurn)) return false
    if (instEffectsSuppressed(source)) return false
    if (source.timedAttackStepEffectsDisabled && isOwnAttackStepEntry(effect)) return false
    if (!board.players[pid].field.nexuses.includes(source)) return true
    return !nexusEffectsStopped(board, pid, source) && !nexusEffectsDisabledFor(board, pid, source, effect)
}

type TurnSide = "own" | "opponent" | "both"

// 見出しの『自分のメインステップ』などの「有効な時間帯」（phaseTurn）。2026-11-02 にここへ集めた（ハンドラが見ていない器で素通りしていた。SEMANTICS_AUDIT §2.4）。
// 直下の phase/turn は読まない：【氷壁】の turn は「持っているか」の判定には効かず（アイスバーグで置き換えも効く）、
// globalConstraint の phase は時間帯の前に先回りして見る（可能ならアタックする義務をメインステップの終わりに見る）ため、意味が器ごとに違う
function inActivePeriod(board: Board, pid: PlayerId, t: { phase?: Phase; turn?: TurnSide }): boolean {
    if (t.phase !== undefined && t.phase !== board.phase) return false
    if (t.turn === "own") return board.turnPlayer === pid
    if (t.turn === "opponent") return board.turnPlayer !== pid
    return true
}

// 見出し『自分のアタックステップ』のエントリ。aura は aura.phaseTurn、そのほかの継続は phaseTurn、誘発・ステップ誘発は直下の phase/turn（step 誘発は step）で書かれている
function isOwnAttackStepEntry(effect: { phaseTurn?: { phase?: Phase; turn?: TurnSide }; phase?: Phase; turn?: "own" | "opponent" | "both"; step?: string; aura?: { phaseTurn?: { phase?: Phase; turn?: TurnSide } } }): boolean {
    const t = effect.phaseTurn ?? effect.aura?.phaseTurn
    if (t?.phase === "attack" && t.turn === "own") return true
    return (effect.phase === "attack" || effect.step === "attack") && effect.turn === "own"
}
