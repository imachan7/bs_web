// 効果の中で待機に入った破壊・消滅・戻す待機の出口（docs/design/DERIVED_AFTER_EFFECT.md §8）。
// 効果の一番外側の出口（EffectModules.resolveAction）と、区切りの action settleDerived から呼ぶ。
// 誘発の収集・列の解決・確定・破壊後バーストはここから始まる。効果の外の破壊（バトル・維持コア割れ・召喚の支払いなど）はここを通らない
import type { ActionHandler } from "./actions/types"
import type { GameState, PlayerId, ResumeFrame } from "../type"
import type { CollectedTrigger } from "./blockDeclared"
import { pushResumeFrames, resolveInOrder, setWaitingEvent } from "./GameState"
import { runActionFrame } from "./choice"
import type { DestroyEntry } from "./removal"
import { collectNexusDestructionItems, commitOrDefer, commitPendingDestruction, driveNexusDestruction, flushBounces, grantedFamilies, resumeDestroyNexusCommit, runDestroyQueue } from "./removal"
import { collectBraveDestroyItems, resumeBraveDestroy } from "./brave"
import { currentRecordScope, newRecordScope, recordDestroyedCount } from "./record"
import { isTrashWaiting } from "../../../shared/rules/waiting"
import { randomId } from "../../../shared/randomId"
import { battlers } from "../../../shared/rules"

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
    for (const d of state.derivedItems ?? []) ids.add(d.effectId)
    return [...ids]
}

// 効果の中で起きたら、出来事の時点で誘発を集めて効果の出口まで遅らせる出来事（待機を持たない出来事。DERIVED_AFTER_EFFECT §10）。
// 破壊・戻すは別の経路なので入れない。召喚は fireSummonSequence が自分の『召喚時』と一緒に積む
const HELD_EVENTS = new Set<string>([
    "ownSpiritExhausted", "anySpiritExhausted", "ownNexusExhausted", "ownBofuExhausted", "opponentSpiritExhaustedByOwnSpiritEffect",
    "onRefreshed", "ownSpiritRefreshed", "anySpiritRefreshed",
    "opponentDrew", "opponentDrewByEffect", "opponentHandAdded",
    "opponentCorePlaced", "coresGainedFromVoid", "lifeCorePlaced", "ownSeimeiLifeCharged", "opponentLifeCoreFromVoid",
    "opponentSpiritCoresEmptied", "ownSpiritCoresRemovedByOpponent", "opponentSpiritCoresToReserve",
    "ownLifeLost", "ownChimeiMilled", "ownSpiritReducedLife",
    "opponentDeckMilled", "ownDeckMilled", "ownDeckMillPrevented",
    "ownSpiritSummoned", "anySpiritSummoned", "anyBraveSummoned", "anySpiritCombined",
    "ownBurstSet", "ownTensho", "ownUTriggerHit", "ownUTriggerGuarded", "ownUTriggered", "ownNexusDeployed", "ownKeywordActivated", "ownHyohekiUsed", "ownBunshinPlaced",
])

// 効果の中なら、いま解決している効果の id（効果の外・勝敗決定後は undefined ＝その場で解決する）
export function heldEffectId(state: GameState): string | undefined {
    return state.winner ? undefined : state.currentEffectSource?.effectId
}

// 遅らせる出来事なら、それを起こした効果の id
export function derivedHoldId(state: GameState, event: string): string | undefined {
    return HELD_EVENTS.has(event) ? heldEffectId(state) : undefined
}

export function holdDerived(state: GameState, effectId: string, items: CollectedTrigger[]): void {
    const frames = items.map((i) => {
        if (i.frame.kind !== "action") throw new Error(`派生の項目が action フレームでない: ${i.frame.kind}`)
        return { key: i.key, label: i.label, frame: i.frame }
    })
    if (frames.length === 0) return
    const list = (state.derivedItems ??= [])
    const slot = list.find((d) => d.effectId === effectId)
    if (slot) slot.items.push(...frames)
    else list.push({ effectId, items: frames })
}

function takeDerived(state: GameState, effectId: string): { items: CollectedTrigger[] } {
    const list = state.derivedItems
    const i = list?.findIndex((d) => d.effectId === effectId) ?? -1
    if (!list || i < 0) return { items: [] }
    const [d] = list.splice(i, 1)
    if (list.length === 0) delete state.derivedItems
    const items: CollectedTrigger[] = d!.items.map((x) => ({
        key: x.key,
        label: x.label,
        frame: x.frame,
        run: () => {
            runActionFrame(state, x.frame.actorPid ?? state.turnPlayer, x.frame)
            setWaitingEvent(state, undefined)
        },
    }))
    return { items }
}

// 破壊の列が無い効果の派生：派生だけで1本の列にして、列の後にイベントバースト
function settleDerivedOnly(state: GameState, derived: { items: CollectedTrigger[] }): void {
    resolveInOrder(state, derived.items, {
        resolve: (i) => i.run(),
        frame: (i) => i.frame,
        askOrder: { pid: state.turnPlayer, label: (i) => i.label, key: (i) => i.key },
    })
}

export function settleAllDerived(state: GameState): void {
    for (const id of pendingEffectIds(state)) {
        if (state.pendingChoice) return
        settleDerived(state, id)
    }
    if (!state.pendingChoice) flushBounces(state)
}

// 戻り値は、列を解決し終えて実際にトラッシュに置かれたスピリットの数（列が選択待ちで止まったときは 0。区切りの後の数え直しは未対応）
// recordTo：区切りの action から呼ぶとき、列で確定した数を書く元の効果の記録の枠
export function settleDerived(state: GameState, effectId: string, recordTo?: string): number {
    // 列で解決される効果は元の効果とは別の効果。元の効果の記録（破壊した数・動かしたカード）に混ぜない
    const prevScope = state.recordScope
    state.recordScope = newRecordScope()
    try {
        return settleAll(state, effectId, recordTo)
    } finally {
        // 選択待ちで止まったときは suspend が枠を控えているので、ここで戻してよい
        if (prevScope !== undefined) state.recordScope = prevScope
        else delete state.recordScope
    }
}

function settleAll(state: GameState, effectId: string, recordTo?: string): number {
    const derived = takeDerived(state, effectId)
    if (state.winner) derived.items.length = 0
    const entries = collectSpiritEntries(state, effectId)
    if (state.winner) {
        for (const e of entries.list) commitPendingDestruction(state, e.pid, e.inst)
        settleBraves(state, effectId)
        settleNexuses(state, effectId)
        return 0
    }
    // スピリット・合体中のブレイヴ・ネクサスの破壊と派生を、1本の列で解決する（2026-11-17 ユーザー決定）。
    // 確定（トラッシュに置く・「残る」の解除・破壊した側の続き・バースト）は列の後で、それぞれの今の手順のまま行う
    const items: CollectedTrigger[] = [...derived.items.splice(0)]
    const tail = collectBraveNexusItems(state, effectId, items)
    let trashed = 0
    if (entries.list.length === 0 && tail.length === 0) {
        // 破壊が無い効果の派生は、単独の列にする
        if (items.length > 0) settleDerivedOnly(state, { items })
    } else {
        trashed = settleQueue(state, entries, items, tail, recordTo)
        // 選択待ちで止まったときは tail を再開スタックへ預け済み。止まらなければ settleQueue が流し終えている
        if (state.pendingChoice && !state.winner) return 0
    }
    // 戻す待機：入れ子の出口ごとではなく、効果の出口でまとめて流す
    if (!state.pendingChoice) flushBounces(state)
    return state.pendingChoice ? 0 : trashed
}

function collectSpiritEntries(state: GameState, effectId: string): { list: DestroyEntry[]; pickMany: Record<string, string[]> } {
    const list: DestroyEntry[] = []
    const pickMany: Record<string, string[]> = {}
    for (const pid of PIDS) {
        for (const inst of battlers(state.players[pid])) {
            const w = inst.waiting
            if ((w?.kind !== "destroy" && w?.kind !== "vanish") || w.effectId !== effectId || w.derived === undefined) continue
            const d = w.derived
            list.push({
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
    return { list, pickMany }
}

// 合体中のブレイヴとネクサスの誘発を items へ集め、列の後に確定する手順（既存の再開フレーム）を返す。ブレイヴ→ネクサスの順
function collectBraveNexusItems(state: GameState, effectId: string, items: CollectedTrigger[]): ResumeFrame[] {
    const tail: ResumeFrame[] = []
    for (const pid of PIDS) {
        const events: string[] = []
        for (const b of state.players[pid].field.combinedBraves) {
            const w = b.waiting
            if (w?.kind !== "destroy" || w.effectId !== effectId) continue
            delete w.effectId
            if (!events.includes(w.event)) events.push(w.event)
        }
        for (const event of events) {
            const braves = state.players[pid].field.combinedBraves.filter((b) => b.waiting?.kind === "destroy" && b.waiting.event === event)
            collectBraveDestroyItems(state, pid, braves, items)
            tail.push({ kind: "braveDestroy", ownerPid: pid, event, phase: "commit" })
        }
    }
    for (const pid of PIDS) {
        for (const inst of [...state.players[pid].field.nexuses]) {
            const w = inst.waiting
            if (w?.kind !== "destroy" || w.effectId !== effectId || w.nexus === undefined) continue
            const { byOpponentEffect, after } = w.nexus
            delete w.effectId
            delete w.nexus
            if (!isTrashWaiting(inst)) continue
            collectNexusDestructionItems(state, pid, inst, byOpponentEffect, items)
            tail.push({ kind: "destroyNexusCommit", pid, instanceId: inst.instanceId, byOpponentEffect, ...(after ? { after } : {}) })
        }
    }
    return tail
}

// 列の後の確定を順に行う。選択待ちが立っていたら、残りは再開スタックへ（先に積まれた列の続き・スピリットの確定より後ろに入る）
function runTail(state: GameState, tail: ResumeFrame[]): void {
    while (tail.length > 0) {
        if (state.pendingChoice && !state.winner) {
            pushResumeFrames(state, tail)
            return
        }
        const f = tail.shift()!
        if (f.kind === "braveDestroy") resumeBraveDestroy(state, f)
        else if (f.kind === "destroyNexusCommit") resumeDestroyNexusCommit(state, f)
    }
}

function settleQueue(state: GameState, collected: { list: DestroyEntry[]; pickMany: Record<string, string[]> }, items: CollectedTrigger[], tail: ResumeFrame[], recordTo?: string): number {
    const entries = collected.list
    const prevGroup = state.destroyGroup
    if (entries.length > 0) {
        const familiesByPid: Partial<Record<PlayerId, string[]>> = {}
        for (const e of entries) familiesByPid[e.pid] = [...new Set([...(familiesByPid[e.pid] ?? []), ...grantedFamilies(state, e.pid, e.inst)])]
        // 全員ぶんを1つの同時破壊として1本の列に並べる。「1回」は待機の出来事ごと（groupOnce の鍵に出来事が入っている）
        state.destroyGroup = { id: randomId(), memberIds: entries.map((e) => e.inst.instanceId), used: [], familiesByPid, ...(Object.keys(collected.pickMany).length > 0 ? { pickMany: collected.pickMany } : {}) }
        for (const e of entries) commitOrDefer(state, e.pid, e.inst)
    }
    const frame: DestroyBatchFrame = { kind: "destroyBatch", ownerPid: state.turnPlayer, targets: [], phase: "start", settle: true, ...(recordTo !== undefined ? { recordTo } : {}), ...(prevGroup ? { prevGroup } : {}) }
    const trashed = runDestroyQueue(state, frame, entries, { items })
    runTail(state, tail)
    return trashed
}

// 勝敗決定後だけ使う、ブレイヴ・ネクサスの個別の破壊手順（通常は settleAll が1本の列にまとめる）
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
        // 区切りの後で「この効果で破壊した数」を読む札（Q25205）のために、列で確定した数を元の効果の記録へ渡す。
        // 列が選択待ちで止まったときも、再開して確定した時点で destroyBatch の recordTo が書く。破壊が無ければ 0 のまま
        const scope = currentRecordScope(state)
        recordDestroyedCount(state, 0, scope)
        settleDerived(state, effectId, scope)
    } finally {
        if (saved !== undefined) state.currentEffectSource = saved
    }
}
