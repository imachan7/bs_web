// 手札のマジックのバースト効果を発揮する操作（kind:"handBurstEffectGrant"）の可否。サーバーの検証とクライアントのボタン出し分けが共有する
import type { PlayerId } from "../server/src/type"
import type { Board } from "./board"
import { card } from "./cardDb"
import { noteCoverage } from "./coverage"
import { effectActiveAtLevel, currentLevel, effectSources, isFlashLockedFor, spiritHasKeyword } from "./rules"

// 使えない理由（使えるなら null）。コストを払えるかは含まない。
// マジックの「使用」ではないので、マジックの使用禁止（battleLock "magic" や色指定の使用禁止）は掛からない
export function handBurstEffectDenial(board: Board, pid: PlayerId, cardId: string | undefined): string | null {
    if (cardId === undefined) return "手札にカードがありません"
    const data = card(cardId)
    if (data.type !== "magic" || !data.effects.some((e) => e.kind === "burst")) return "バースト効果を持つマジックカードではありません"
    if (!board.battle || !board.isFlashTiming) return "フラッシュタイミングではありません"
    if (board.priorityPlayer !== pid) return "現在フラッシュの優先権がありません"
    if (isFlashLockedFor(board, pid)) return "効果により、フラッシュで手札のカードを使用できません"
    const attackerId = board.battle.attackerInstanceId
    const attacker = board.players[pid].field.spirits.find((s) => s.instanceId === attackerId)
    if (!attacker) return "自分のスピリットがアタックしていません"
    for (const src of effectSources(board, pid)) {
        const level = currentLevel(src).level
        for (const e of card(src.cardId).effects) {
            if (e.kind !== "handBurstEffectGrant" || !effectActiveAtLevel(e.levels, level)) continue
            if (e.attackerKeyword.some((k) => spiritHasKeyword(board, pid, attacker, k))) return null
        }
    }
    return "手札のバースト効果を発揮できる効果がありません"
}

// 計測点（サーバーが実際に発揮したときだけ呼ぶ。判定関数はクライアントからも呼ばれるため noteCoverage をここに置かない）
export function noteHandBurstEffectUsed(board: Board, pid: PlayerId): void {
    for (const src of effectSources(board, pid)) {
        const level = currentLevel(src).level
        for (const e of card(src.cardId).effects) {
            if (e.kind === "handBurstEffectGrant" && effectActiveAtLevel(e.levels, level)) noteCoverage(e, "handBurstEffectGrant")
        }
    }
}
