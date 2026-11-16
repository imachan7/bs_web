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

// 効果の対象に取れるか（P5・C2）。待機中のカードは、その待機の出来事で誘発した効果の対象にだけなる。
// waitingEvent は「いま解決している効果を誘発した待機の出来事」（GameState.waitingEvent。誘発の入口が立てる）
export function canBeTargeted(board: { waitingEvent?: string }, inst: MaybeInst): boolean {
    return !isWaiting(inst) || (board.waitingEvent !== undefined && inst?.waiting?.event === board.waitingEvent)
}

// 破壊の待機が持つ、その破壊の発生源などの控え（待機でなければ無い）
export function destroyContextOf(inst: MaybeInst) {
    return inst?.waiting?.kind === "destroy" ? inst.waiting.context : undefined
}

// 破壊・消滅の待機が持つ、破壊後バースト用の控え
export function destroyBurstInfoOf(inst: MaybeInst) {
    const w = inst?.waiting
    return w?.kind === "destroy" || w?.kind === "vanish" ? w.burstInfo : undefined
}

// 誘発の入口が立てる値。related＝場を離れることに関係する誘発か。subject＝その誘発が見ているカード（破壊されたスピリットなど）。
// 主語が待機中ならその出来事。待機中でなければ外側の値のまま（勝敗の誘発は主語の勝者が待機していないので、敗者の出来事を外側が渡す）
export function waitingEventFor(related: boolean, subject: MaybeInst, outer: string | undefined): string | undefined {
    if (!related) return undefined
    return subject?.waiting?.event ?? outer
}

// 上と同じ値をフレームの欄にする。null＝無しと明示。欄なし＝積む時点の値を引き継ぐ
export function frameWaitingEvent(related: boolean, subject: MaybeInst): { waitingEvent?: string | null } {
    if (!related) return { waitingEvent: null }
    return subject?.waiting ? { waitingEvent: subject.waiting.event } : {}
}

// 待機状態のカードが場にいるか（＝場を離れる誘発の列をまだ解決しきっていない）
export function anyWaiting(board: { players: Record<string, { field: { spirits: MaybeInst[]; nexuses: MaybeInst[] } }> }): boolean {
    return Object.values(board.players).some((p) => p.field.spirits.some(isWaiting) || p.field.nexuses.some(isWaiting))
}
