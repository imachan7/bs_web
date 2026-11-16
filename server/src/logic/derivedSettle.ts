// 効果の中で待機に入った破壊・消滅・戻す待機の出口（docs/design/DERIVED_AFTER_EFFECT.md §8）。
// 効果の一番外側の出口（EffectModules.resolveAction）と、区切りの action settleDerived から呼ぶ。
// 誘発の収集・列の解決・確定・破壊後バーストはここから始まる。効果の外の破壊（バトル・維持コア割れ・召喚の支払いなど）はここを通らない
import type { ActionHandler } from "./actions/types"
import type { GameState, PlayerId, ResumeFrame } from "../type"
import type { DestroyEntry } from "./removal"
import { commitOrDefer, commitPendingDestruction, driveNexusDestruction, flushBounces, grantedFamilies, runDestroyQueue } from "./removal"
import { resumeBraveDestroy } from "./brave"
import { newRecordScope, recordDestroyedCount } from "./record"
import { isTrashWaiting } from "../../../shared/rules/waiting"

type DestroyBatchFrame = Extract<ResumeFrame, { kind: "destroyBatch" }>
const PIDS: PlayerId[] = ["p1", "p2"]

// この効果の続きがまだ再開スタックに残っているか（残っているあいだは効果が終わっていない）
export function hasPendingFramesOfEffect(state: GameState, effectId: string): boolean {
    return state.resumeStack.some((f) => (f.kind === "action" && f.effectId === effectId) || (f.kind === "destroyBatch" && f.context?.effectId === effectId))
}

// 待機に effectId が残っているカードの id を全部（安全網。resolveAction を通らなかった経路の取りこぼしを拾う）
export function pendingEffectIds(state: GameState): string[] {
    const ids = new Set<string>()
    for (const pid of PIDS) {
        const f = state.players[pid].field
        for (const inst of [...f.spirits, ...f.nexuses, ...f.combinedBraves]) {
            const w = inst.waiting
            if ((w?.kind === "destroy" || w?.kind === "vanish") && w.effectId !== undefined) ids.add(w.effectId)
        }
    }
    return [...ids]
}

export function settleAllDerived(state: GameState): void {
    for (const id of pendingEffectIds(state)) {
        if (state.pendingChoice) return
        settleDerived(state, id)
    }
    if (!state.pendingChoice) flushBounces(state)
}

// 戻り値は、列を解決し終えて実際にトラッシュに置かれたスピリットの数（列が選択待ちで止まったときは 0。区切りの後の数え直しは未対応）
export function settleDerived(state: GameState, effectId: string): number {
    // 列で解決される効果は元の効果とは別の効果。元の効果の記録（破壊した数・動かしたカード）に混ぜない
    const prevScope = state.recordScope
    state.recordScope = newRecordScope()
    try {
        return settleAll(state, effectId)
    } finally {
        // 選択待ちで止まったときは suspend が枠を控えているので、ここで戻してよい
        if (prevScope !== undefined) state.recordScope = prevScope
        else delete state.recordScope
    }
}

function settleAll(state: GameState, effectId: string): number {
    const trashed = settleSpirits(state, effectId)
    if (state.pendingChoice && !state.winner) return 0
    settleBraves(state, effectId)
    if (state.pendingChoice && !state.winner) return 0
    settleNexuses(state, effectId)
    // 戻す待機：入れ子の出口ごとではなく、効果の出口でまとめて流す
    if (!state.pendingChoice) flushBounces(state)
    return state.pendingChoice ? 0 : trashed
}

function settleSpirits(state: GameState, effectId: string): number {
    const entries: DestroyEntry[] = []
    const pickMany: Record<string, string[]> = {}
    for (const pid of PIDS) {
        for (const inst of state.players[pid].field.spirits) {
            const w = inst.waiting
            if ((w?.kind !== "destroy" && w?.kind !== "vanish") || w.effectId !== effectId || w.derived === undefined) continue
            const d = w.derived
            entries.push({
                pid,
                inst,
                cause: w.kind === "vanish" ? "deplete" : "destroy",
                context: d.context,
                options: d.options,
                byBattle: false,
                wasAttacker: d.wasAttacker,
                bySpiritEffect: d.bySpiritEffect,
                byOpponentEffect: d.byOpponentEffect,
                sourceInstanceId: d.sourceInstanceId,
            })
            Object.assign(pickMany, d.pickMany)
            delete w.effectId
            delete w.derived
        }
    }
    if (entries.length === 0) return 0
    if (state.winner) {
        for (const e of entries) commitPendingDestruction(state, e.pid, e.inst)
        return 0
    }
    const familiesByPid: Partial<Record<PlayerId, string[]>> = {}
    for (const e of entries) familiesByPid[e.pid] = [...new Set([...(familiesByPid[e.pid] ?? []), ...grantedFamilies(state, e.pid, e.inst)])]
    const prevGroup = state.destroyGroup
    // 全員ぶんを1つの同時破壊として1本の列に並べる。「1回」は待機の出来事ごと（groupOnce の鍵に出来事が入っている）
    state.destroyGroup = { id: crypto.randomUUID(), memberIds: entries.map((e) => e.inst.instanceId), used: [], familiesByPid, ...(Object.keys(pickMany).length > 0 ? { pickMany } : {}) }
    for (const e of entries) commitOrDefer(state, e.pid, e.inst)
    const frame: DestroyBatchFrame = { kind: "destroyBatch", ownerPid: state.turnPlayer, targets: [], phase: "start", settle: true, ...(prevGroup ? { prevGroup } : {}) }
    return runDestroyQueue(state, frame, entries)
}

// 合体中のブレイヴ：出来事（event）ごとに、いままでの braveDestroy の手順へ渡す
function settleBraves(state: GameState, effectId: string): void {
    for (const pid of PIDS) {
        const events: string[] = []
        for (const b of state.players[pid].field.combinedBraves) {
            const w = b.waiting
            if (w?.kind !== "destroy" || w.effectId !== effectId) continue
            delete w.effectId
            if (!events.includes(w.event)) events.push(w.event)
        }
        for (const event of events) {
            resumeBraveDestroy(state, { kind: "braveDestroy", ownerPid: pid, event, phase: "triggers" })
            if (state.pendingChoice && !state.winner) return
        }
    }
}

// ネクサス：1体ずつ、いままでの手順（列→確定→破壊した側の続き→バースト）
// ponytail: スピリットの列とは別の列。ネクサスとスピリットを同じ効果で同時に壊す札が出たら1本にまとめる
function settleNexuses(state: GameState, effectId: string): void {
    for (const pid of PIDS) {
        for (const inst of [...state.players[pid].field.nexuses]) {
            const w = inst.waiting
            if (w?.kind !== "destroy" || w.effectId !== effectId || w.nexus === undefined) continue
            const { byOpponentEffect, after } = w.nexus
            delete w.effectId
            delete w.nexus
            if (!isTrashWaiting(inst)) continue
            driveNexusDestruction(state, pid, inst, byOpponentEffect, after)
            if (state.pendingChoice && !state.winner) return
        }
    }
}

export const settleDerivedHandler: ActionHandler<"settleDerived"> = (ctx) => {
    const { state } = ctx
    const effectId = state.currentEffectSource?.effectId
    if (effectId === undefined) return
    // 列の項目は新しい効果として解決する（効果の出口と同じ。入れ子として扱うと、その派生が元の効果の最後まで待たされる）
    const saved = state.currentEffectSource
    delete state.currentEffectSource
    try {
        // 区切りの後で「この効果で破壊した数」を読む札（Q25205）のために、トラッシュに置かれた数を元の効果の記録へ渡す
        const trashed = settleDerived(state, effectId)
        if (!state.pendingChoice) recordDestroyedCount(state, trashed)
    } finally {
        if (saved !== undefined) state.currentEffectSource = saved
    }
}
