// ブロック宣言の後に誘発する効果を1つの列にして同時発揮として解決する
// （TIMING_CHART ＞３-2B・§0-3。2026-10-08 ユーザー確認：解決順はターンプレイヤーが選ぶ）。
// ブロッカーの疲労による「疲労したとき」も同じ列に入れる（2026-11-03 ユーザー確認。アタック側と同じ）
import type { CardInstance, EventBurstCheck, GameState, PlayerId, ResumeFrame } from "../type"
import { findSpirit, opponentOf, pushResumeFrames, resolveInOrder } from "./GameState"
import {
    battleOpponentConditionedOnBattleStartIds,
    fireEventBursts,
    fireFieldEventTriggers,
    fireTrigger,
    hasFunsaiOnBlock,
    instColors,
    resolveFunsai,
} from "./EffectModules"
import { exhaustedEvents } from "./state/exhaust"

// 収集モードで fireTrigger／fireFieldEventTriggers が積む1件。run は非対話時にその場で解決する用、
// frame は解決順を聞いたあと／中断したときに残りを再開スタックへ積む用
export type CollectedTrigger = {
    key: string
    label: string
    frame: ResumeFrame
    run: () => void
    skip?: () => boolean
}

// 非対話（テスト・AI）では収集順＝従来の発火順で解決する（ブロッカーの疲労による誘発が先頭）。
// directed：指定アタック（resolveDirectedBlock）経由のブロック確定。この場合アタッカーの
// 『バトル時』は resolveDirectedBlock が確定後に全件発火するため、ここではbattleOpponentMatches条件付きを発火しない
// exhausted：ブロック宣言で疲労した pid のスピリット（追加ブロッカーを含む）
export function resolveBlockDeclared(
    state: GameState,
    pid: PlayerId,
    blocker: CardInstance | undefined,
    instanceId: string,
    directed = false,
    exhausted: CardInstance[] = [],
): void {
    const battle = state.battle
    if (!battle) return
    const items: CollectedTrigger[] = []
    const checks: EventBurstCheck[] = []
    const attackerId = battle.attackerInstanceId
    for (const inst of exhausted) {
        const colors = instColors(inst)
        for (const ev of exhaustedEvents(pid, inst)) {
            fireFieldEventTriggers(state, ev.pid, ev.event, { pid, inst }, colors, undefined, undefined, ev.info, undefined, undefined, undefined, undefined, items)
            checks.push({ pid: ev.pid, event: ev.event, subject: { pid, cardId: inst.cardId }, colors, info: ev.info })
        }
    }
    const fieldEvent = (
        firePid: PlayerId,
        event: "ownSpiritDeclaredBlock" | "anySpiritDeclaredBlock" | "ownSpiritBlocked",
        self: CardInstance,
        selfPid: PlayerId,
        targetId: string,
    ) => {
        fireFieldEventTriggers(state, firePid, event, { pid: selfPid, inst: self }, instColors(self), targetId, undefined, undefined, undefined, undefined, undefined, undefined, items)
        checks.push({ pid: firePid, event, subject: { pid: selfPid, cardId: self.cardId }, colors: instColors(self), targetInstanceId: targetId })
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
    const attackerPid = state.turnPlayer // 強制ブロックではブロッカーの持ち主(pid)＝アタッカー側なので opponentOf(pid) は使えない
    const attacker = findSpirit(state.players[attackerPid], attackerId)
    // アタッカーの『このスピリットのバトル時』のうちバトル相手を条件に持つもの
    // （condition.battleOpponentMatches）は、アタック宣言の時点ではブロッカーがまだ
    // 決まっていないため条件不成立で見送られている。ブロックが確定したこの時点で
    // 改めて発火する（PX14 戦皇ゴッドスレイヤー・ドラゴン「名前に『神』を持つ相手の
    // スピリットとバトルしているとき BP+5000」）。無条件の『バトル時』はアタック宣言時に
    // すでに発火済みなので、ここでは条件付きだけを onlyEffectIds で絞って発火する
    if (!directed && !state.winner && attacker) {
        const conditionedIds = battleOpponentConditionedOnBattleStartIds(state, attackerPid, attacker)
        if (conditionedIds.length > 0) {
            fireTrigger(state, attackerPid, attacker, "onBattleStart", "attacker", instanceId, undefined, undefined, undefined, conditionedIds, items)
        }
    }
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
    if (state.winner) return
    if (state.pendingChoice) {
        pushResumeFrames(state, [{ kind: "eventBursts", checks }])
        return
    }
    fireEventBursts(state, checks)
}
