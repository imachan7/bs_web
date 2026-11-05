// 使用中のマジック：効果と派生効果を解決し終えるまで、使ったマジックは手札にもトラッシュにも無い
// （Wiki「マジック」の使用手順④〜⑥。2026-11-05 ユーザー確認。RULES_BATSPI_WIKI のマジックの行）
import type { GameState, PlayerId } from "../../type"
import type { ActionHandler } from "../actions/types"
import { getCard, log, pushResumeFrames } from "../GameState"
import { notifyHandGained } from "../fieldEventTriggers"

export function beginMagicUse(state: GameState, pid: PlayerId, cardId: string): void {
    ;(state.magicsInUse ??= []).push({ pid, cardId })
}

// 解決が選択待ちで止まっていれば、トラッシュへ置くのを再開スタックに積む（使用は解決の外側の層なので、
// 残りのエントリ・派生効果のフレームより後に解決される。RESUME_STACK §3）
export function finishMagicUseOrDefer(state: GameState): void {
    if (state.pendingChoice) {
        pushResumeFrames(state, [{ kind: "action", selfInstanceId: null, action: { type: "finishMagicUse" } }])
        return
    }
    finishMagicUse(state)
}

// いちばん新しい使用中のマジックを、行き先（既定はトラッシュ）へ置く。場に置かれたもの（dest:"field"）は置き済み
function finishMagicUse(state: GameState): void {
    const entry = state.magicsInUse?.pop()
    if (state.magicsInUse?.length === 0) delete state.magicsInUse
    if (!entry) return
    const player = state.players[entry.pid]
    if (entry.dest === "field") return
    if (entry.dest === "hand") {
        player.hand.push(entry.cardId)
        log(state, `${getCard(entry.cardId).name}は手札に戻った。`)
        notifyHandGained(state, entry.pid, 1)
        return
    }
    player.trashCards.push(entry.cardId)
}

// 使用中のこのマジックの行き先を変える（「このマジックカードは手札に戻る」・場に残るマジック）。使用中でなければ false
export function redirectMagicInUse(state: GameState, pid: PlayerId, cardId: string, dest: "hand" | "field"): boolean {
    const entry = [...(state.magicsInUse ?? [])].reverse().find((e) => e.pid === pid && e.cardId === cardId && e.dest === undefined)
    if (!entry) return false
    entry.dest = dest
    return true
}

export const finishMagicUseHandler: ActionHandler<"finishMagicUse"> = (ctx) => {
    finishMagicUse(ctx.state)
}
