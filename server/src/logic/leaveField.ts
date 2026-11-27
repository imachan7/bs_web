// 場を離れる手順のうち、スピリット・アルティメットの置き場から抜く所。呼び出し側ごとに違う「その後」（行き先・合体していたブレイヴの扱い）は呼び出し側に残す
import type { CardInstance, GameState, PlayerId } from "../type"
import { soulCoreLeavesField } from "./soulCore"
import { trashUnderCards } from "./zones/underCards"

// 場にいなければ false（何も動かさない）
export function removeFromField(state: GameState, pid: PlayerId, inst: CardInstance): boolean {
    const f = state.players[pid].field
    for (const zone of [f.spirits, f.ultimates]) {
        const i = zone.findIndex((x) => x.instanceId === inst.instanceId)
        if (i === -1) continue
        zone.splice(i, 1)
        return true
    }
    return false
}

// 抜く → 下のカードを破棄 → [ソウルコア]退避 → 乗っていたコアをリザーブへ。この順は既存の各所と同じ。
// trashUnder=false は下のカードを破棄しない呼び出し（破壊待機の発生源を手札・デッキへ戻す経路など。従来から破棄していない）
export function leaveField(state: GameState, pid: PlayerId, inst: CardInstance, trashUnder = true): boolean {
    if (!removeFromField(state, pid, inst)) return false
    const player = state.players[pid]
    if (trashUnder) trashUnderCards(state, pid, inst)
    soulCoreLeavesField(player, inst)
    player.reserve += inst.cores
    return true
}
