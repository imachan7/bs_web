// ブロック宣言の後に誘発する効果を1つの列にして同時発揮として解決する
// （TIMING_CHART ＞３-2B・§0-3。2026-10-08 ユーザー確認：解決順はターンプレイヤーが選ぶ）
import type { CardInstance, GameState, PlayerId, ResumeFrame } from "../type"
import { findSpirit, opponentOf, resolveInOrder } from "./GameState"
import {
    fireFieldEventTriggers,
    fireTrigger,
    hasFunsaiOnBlock,
    instColors,
    resolveFunsai,
} from "./EffectModules"
import { fireBurstOnEvent } from "./keywords/burst"

// 収集モードで fireTrigger／fireFieldEventTriggers が積む1件。run は非対話時にその場で解決する用、
// frame は解決順を聞いたあと／中断したときに残りを再開スタックへ積む用
export type CollectedTrigger = {
    key: string
    label: string
    frame: ResumeFrame
    run: () => void
    skip?: () => boolean
}

// 非対話（テスト・AI）では収集順＝従来の発火順で解決する。
// ⚠️ 解決で選択待ちが立って列が中断した場合、バースト判定は行わない（再開後に拾う仕組みが無い）
export function resolveBlockDeclared(state: GameState, pid: PlayerId, blocker: CardInstance | undefined, instanceId: string): void {
    const battle = state.battle
    if (!battle) return
    const items: CollectedTrigger[] = []
    const bursts: (() => void)[] = []
    const attackerId = battle.attackerInstanceId
    const fieldEvent = (
        firePid: PlayerId,
        event: "ownSpiritDeclaredBlock" | "anySpiritDeclaredBlock" | "ownSpiritBlocked",
        self: CardInstance,
        selfPid: PlayerId,
        targetId: string,
    ) => {
        fireFieldEventTriggers(state, firePid, event, { pid: selfPid, inst: self }, instColors(self), targetId, undefined, undefined, undefined, undefined, undefined, undefined, items)
        bursts.push(() =>
            fireBurstOnEvent(state, firePid, event, { pid: selfPid, cardId: self.cardId }, instColors(self), targetId, undefined),
        )
    }
    if (blocker) {
        fireTrigger(state, pid, blocker, "onBlock", undefined, attackerId, undefined, undefined, undefined, undefined, items)
        fieldEvent(pid, "ownSpiritDeclaredBlock", blocker, pid, attackerId)
        fieldEvent(pid, "anySpiritDeclaredBlock", blocker, pid, attackerId)
        fieldEvent(opponentOf(pid), "anySpiritDeclaredBlock", blocker, pid, attackerId)
        fireTrigger(state, pid, blocker, "onBattleStart", undefined, attackerId, undefined, undefined, undefined, undefined, items)
        if (hasFunsaiOnBlock(state, pid)) {
            items.push({
                key: `funsaiOnBlock:${pid}`,
                label: `${state.players[pid].name}の【粉砕】`,
                frame: { kind: "action", selfInstanceId: blocker.instanceId, action: { type: "funsaiOnBlock" }, actorPid: pid },
                run: () => resolveFunsai(state, pid, blocker),
            })
        }
    }
    const attackerPid = opponentOf(pid)
    const attacker = findSpirit(state.players[attackerPid], attackerId)
    if (attacker) {
        fireTrigger(state, attackerPid, attacker, "onBlocked", undefined, instanceId, undefined, undefined, undefined, undefined, items)
        fieldEvent(attackerPid, "ownSpiritBlocked", attacker, attackerPid, instanceId)
    }
    resolveInOrder(state, items, {
        skip: (i) => i.skip?.() === true,
        resolve: (i) => i.run(),
        frame: (i) => i.frame,
        askOrder: {
            pid: state.turnPlayer,
            label: (i) => i.label,
            key: (i) => i.key,
        },
    })
    if (state.winner || state.pendingChoice) return
    for (const burst of bursts) {
        burst()
        if (state.winner || state.pendingChoice) return
    }
}
