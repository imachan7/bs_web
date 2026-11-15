// 待機状態（docs/design/PENDING_STATE.md）。破壊・消滅・手札/デッキに戻すなどで場を離れることになったカードが、
// その誘発を解決し終えて移動するまで場に残っている状態。印は CardInstance.waiting の1つだけで、読む側はここの関数を通す
import type { CardInstance } from "../../server/src/type"

type MaybeInst = Pick<CardInstance, "waiting"> | null | undefined

export function isWaiting(inst: MaybeInst): boolean {
    return inst?.waiting !== undefined
}

// 破壊か消滅で、トラッシュに置かれるのを待っている
export function isTrashWaiting(inst: MaybeInst): boolean {
    return inst?.waiting?.kind === "destroy" || inst?.waiting?.kind === "vanish"
}

export function isVanishWaiting(inst: MaybeInst): boolean {
    return inst?.waiting?.kind === "vanish"
}

// 手札・デッキ・バーストへ戻るのを待っている
export function isReturnWaiting(inst: MaybeInst): boolean {
    return inst?.waiting?.kind === "return"
}

// 待機状態のカードが場にいるか（＝場を離れる誘発の列をまだ解決しきっていない）
export function anyWaiting(board: { players: Record<string, { field: { spirits: MaybeInst[]; nexuses: MaybeInst[] } }> }): boolean {
    return Object.values(board.players).some((p) => p.field.spirits.some(isWaiting) || p.field.nexuses.some(isWaiting))
}
