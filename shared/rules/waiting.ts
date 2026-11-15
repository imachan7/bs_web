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

// 誘発の種類が「場を離れること」に関係するか（PENDING_STATE §3 P4・P5 の「待機状態に関係する効果」）。
// 待機中のカードはこれ以外の誘発を発揮できず、これ以外で誘発した効果の対象にもならない。
// 誘発の名前（TriggerEvent・FieldEvent）で決める。新しい誘発を足したら、場を離れることに関係するものだけここへ足す
const LEAVE_RELATED_TRIGGERS = new Set<string>([
    // その個体自身の誘発
    "onDestroy",
    "onBattleWin", // 「BPを比べ相手のスピリットだけを破壊したとき」（破壊したとき。改訂文の例2）
    "onBattleDestroy",
    "onBattleLose",
    "onTenshoTarget",
    // フィールドの誘発
    "ownSpiritDestroyed",
    "opponentSpiritDestroyed",
    "anyNexusDestroyed",
    "ownNexusDestroyed",
    "ownBraveOnlyDestroyed",
    "ownSpiritBattleWon",
    "ownSpiritBattleLost",
    "anySpiritReturnedToHand",
    "ownSpiritReturnedToHand",
    "ownTensho",
])

export function isLeaveRelatedTrigger(trigger: string): boolean {
    return LEAVE_RELATED_TRIGGERS.has(trigger)
}

// 待機中の発生源がこの誘発を発揮できるか（P4）
export function canFireWhileWaiting(inst: MaybeInst, trigger: string): boolean {
    return !isWaiting(inst) || isLeaveRelatedTrigger(trigger)
}

// 効果の対象に取れるか（P5）。待機中のカードは、場を離れることに関係する誘発で発揮した効果の対象にだけなる。
// leaveRelated は「いま解決している効果がその種類か」（GameState.leaveRelated。誘発の入口が立てる）
export function canBeTargeted(board: { leaveRelated?: true }, inst: MaybeInst): boolean {
    return !isWaiting(inst) || board.leaveRelated === true
}

// 待機状態のカードが場にいるか（＝場を離れる誘発の列をまだ解決しきっていない）
export function anyWaiting(board: { players: Record<string, { field: { spirits: MaybeInst[]; nexuses: MaybeInst[] } }> }): boolean {
    return Object.values(board.players).some((p) => p.field.spirits.some(isWaiting) || p.field.nexuses.some(isWaiting))
}
