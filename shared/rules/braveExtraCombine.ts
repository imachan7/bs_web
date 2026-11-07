// 「合体条件・ブレイヴ数を無視して追加で1つ合体できる」ブレイヴ（kind:"braveExtraCombine"。BS23-056。Q20340〜Q20342）
import type { CardInstance, PlayerId } from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { noteCoverage } from "../coverage"

function extraDef(braveCardId: string) {
    return card(braveCardId).effects.find((e) => e.kind === "braveExtraCombine")
}

function combinedBravesOf(board: Board, pid: PlayerId, host: CardInstance): CardInstance[] {
    const ids = (host.braveRefs ?? []).map((r) => r.instanceId)
    return board.players[pid].field.combinedBraves.filter((b) => ids.includes(b.instanceId))
}

// 追加枠を使っているブレイヴ（要求した名前のブレイヴが同じホストにいる、braveExtraCombine 持ち）
function extraBraveOf(board: Board, pid: PlayerId, host: CardInstance): CardInstance | undefined {
    const braves = combinedBravesOf(board, pid, host)
    return braves.find((b) => {
        const def = extraDef(b.cardId)
        return def !== undefined && def.kind === "braveExtraCombine" && braves.some((o) => card(o.cardId).name === def.requireHostBraveName)
    })
}

// 追加枠を除いた、通常の合体数。上限との比較はこちらで行う
// ponytail: 056 が先に通常枠で合体し、あとから 055 が合体した場合も追加枠として数える（X01 など上限2以上のホストだけで差が出る）
export function braveSlotsUsed(board: Board, pid: PlayerId, host: CardInstance): number {
    return (host.braveRefs ?? []).length - (extraBraveOf(board, pid, host) ? 1 : 0)
}

// このブレイヴを、条件・数を無視した追加の合体として受けられるホストか
export function extraCombineAllowed(board: Board, pid: PlayerId, host: CardInstance, braveCardId: string): boolean {
    const def = extraDef(braveCardId)
    if (def === undefined || def.kind !== "braveExtraCombine") return false
    if (extraBraveOf(board, pid, host)) return false
    const ok = combinedBravesOf(board, pid, host).some((b) => card(b.cardId).name === def.requireHostBraveName)
    if (ok) noteCoverage(def, "braveExtraCombine")
    return ok
}
