// BP 比較で片方だけが破壊されたバトルの、勝敗を条件にする誘発（「BPを比べ相手のスピリットだけを破壊したとき／に破壊されたとき」）。
// どれも敗者の破壊を条件にするので、敗者の破壊待機の列に並べる。解決する時点で敗者が破壊待機状態でなければ発揮しない
// （「残る／戻る」が先に解決したとき。2026-11-14 ユーザー確認。#554。docs/design/TIMING_CHART.md §2）。
// 「だけ」は BP 比較の結果で決まる：相打ちではここを通らず、片方が残っても発揮しない
import { isTrashWaiting } from "../../../shared/rules/waiting"
import type { CardInstance, GameState, PlayerId } from "../type"
import type { CollectedTrigger } from "./blockDeclared"
import { instColors } from "../../../shared/rules"
import { fireFieldEventTriggers } from "./fieldEventTriggers"
import { fireBattleWonTriggers } from "./stepTriggers"
import { fireTrigger } from "./triggers"

export type BattleWinner = { pid: PlayerId; instanceId: string; role: "attacker" | "blocker" }

export function collectBattleOutcomeTriggers(
    state: GameState,
    loserPid: PlayerId,
    loser: CardInstance,
    winner: BattleWinner,
    collect: CollectedTrigger[],
): void {
    const winnerInst = state.players[winner.pid].field.spirits.find((s) => s.instanceId === winner.instanceId)
    if (!winnerInst) return
    const raw: CollectedTrigger[] = []
    fireTrigger(state, winner.pid, winnerInst, "onBattleWin", winner.role, undefined, undefined, undefined, undefined, undefined, raw)
    fireTrigger(state, winner.pid, winnerInst, "onBattleDestroy", winner.role, undefined, undefined, undefined, undefined, undefined, raw)
    fireBattleWonTriggers(state, winner.pid, winnerInst, winner.role, raw)
    fireFieldEventTriggers(state, winner.pid, "ownSpiritBattleWon", { pid: winner.pid, inst: winnerInst }, instColors(winnerInst), undefined, undefined, undefined, undefined, undefined, undefined, undefined, raw)
    fireFieldEventTriggers(state, loserPid, "ownSpiritBattleLost", { pid: loserPid, inst: loser }, instColors(loser), undefined, undefined, undefined, undefined, undefined, undefined, undefined, raw)
    for (const item of raw) {
        collect.push({
            ...item,
            skip: () => !isTrashWaiting(loser) || item.skip?.() === true,
            frame: item.frame.kind === "action" ? { ...item.frame, requiresPendingDestructionOf: loser.instanceId } : item.frame,
        })
    }
}
