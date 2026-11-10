// 復活（reviveOnDestroy.pickMany）の複数選択：同時破壊グループの先頭で、戻す体と破棄する手札を持ち主に選ばせる。
// 選んだ結果は state.destroyGroup.pickMany に控え、各体の復活判定（revive.ts の tryReviveOnDestroy）が読む。
import { canDiscardHand } from "../../../shared/rules"
import type { CardInstance, DestroyContext, EffectDef, GameState, PendingChoice, PlayerId, ResumeFrame } from "../type"
import { findInstanceAnywhere, getCard, log, suspend } from "./GameState"
import { collectPickManyEntries } from "./revive"

type Target = { pid: PlayerId; instanceId: string; context?: DestroyContext }
type ReviveEffect = Extract<EffectDef, { kind: "reviveOnDestroy" }>
type Info = NonNullable<PendingChoice["revivePickMany"]>

interface Offer {
    pid: PlayerId
    source: CardInstance
    effect: ReviveEffect
    candidates: string[]
    handIdx: number[]
}

const keyOf = (sourceInstanceId: string, effectId: string): string => `${sourceInstanceId}:${effectId}`

function handIndices(state: GameState, pid: PlayerId, effect: ReviveEffect): number[] {
    if (!canDiscardHand(state, pid)) return []
    const cardType = effect.cost?.handDiscardCardType
    return state.players[pid].hand.flatMap((id, i) => (cardType === undefined || getCard(id).type === cardType ? [i] : []))
}

// 候補が2体以上ある発生源（1体だけなら従来の確認に任せる）のうち、まだ選んでいない最初の1つ。
// 手札に払えるカードが無い発生源は「戻さない」で記録して飛ばす
function nextOffer(state: GameState, targets: Target[], context?: DestroyContext): Offer | null {
    const group = state.destroyGroup
    if (!group) return null
    group.pickMany ??= {}
    const taken = new Set(Object.values(group.pickMany).flat())
    const found = new Map<string, { pid: PlayerId; sourceId: string; effectId: string; candidates: string[] }>()
    for (const t of targets) {
        if (taken.has(t.instanceId)) continue
        const inst = state.players[t.pid].field.spirits.find((s) => s.instanceId === t.instanceId)
        if (!inst) continue
        for (const e of collectPickManyEntries(state, t.pid, inst, t.context ?? context)) {
            const key = keyOf(e.sourceInstanceId, e.effectId)
            if (group.pickMany[key] !== undefined) continue
            const row = found.get(key) ?? { pid: t.pid, sourceId: e.sourceInstanceId, effectId: e.effectId, candidates: [] }
            row.candidates.push(t.instanceId)
            found.set(key, row)
        }
    }
    for (const [key, row] of found) {
        if (row.candidates.length < 2) continue
        const source = findInstanceAnywhere(state, row.sourceId)
        const effect = source ? getCard(source.cardId).effects.find((x): x is ReviveEffect => x.kind === "reviveOnDestroy" && x.id === row.effectId) : undefined
        if (!source || !effect) continue
        const handIdx = handIndices(state, row.pid, effect)
        if (handIdx.length === 0) {
            group.pickMany[key] = []
            continue
        }
        return { pid: row.pid, source, effect, candidates: row.candidates, handIdx }
    }
    return null
}

function discardHand(state: GameState, pid: PlayerId, indices: number[]): void {
    const player = state.players[pid]
    for (const i of [...indices].sort((a, b) => b - a)) player.trashCards.push(player.hand.splice(i, 1)[0]!)
}

function record(state: GameState, offer: { pid: PlayerId; source: CardInstance; effect: ReviveEffect }, bodies: string[]): void {
    state.destroyGroup!.pickMany![keyOf(offer.source.instanceId, offer.effect.id)] = bodies
    if (bodies.length > 0) log(state, `${state.players[offer.pid].name}は${getCard(offer.source.cardId).name}の効果で、破壊される${bodies.length}体を復活させることにした。`)
}

function suspendBodies(state: GameState, offer: Offer, chosen: string[], context?: DestroyContext): void {
    const max = Math.min(offer.candidates.length, offer.handIdx.length)
    suspend(state, {
        pid: offer.pid,
        kind: "target",
        prompt: `${getCard(offer.source.cardId).name}：復活させるスピリットを選んでください（選んだものをもう一度押すと外れます）`,
        candidates: offer.candidates,
        selectedIds: chosen,
        counter: { label: "戻す", current: chosen.length, max },
        skipLabel: chosen.length > 0 ? `これで戻す（${chosen.length}体）` : "戻さない",
        optional: true,
        revivePickMany: { pid: offer.pid, sourceInstanceId: offer.source.instanceId, effectId: offer.effect.id, phase: "bodies", ...(context ? { context } : {}) },
        action: { type: "noop" },
        selfInstanceId: offer.source.instanceId,
    })
}

function suspendCards(state: GameState, offer: Offer, bodies: string[], chosen: number[], context?: DestroyContext): void {
    suspend(state, {
        pid: offer.pid,
        kind: "card",
        prompt: `${getCard(offer.source.cardId).name}：破棄する手札を選んでください（選んだものをもう一度押すと外れます）`,
        candidates: [],
        cardZone: "hand",
        cardOwner: offer.pid,
        cardIndices: offer.handIdx,
        selectedCardIndices: chosen,
        counter: { label: "捨てる", current: chosen.length, max: bodies.length },
        skipLabel: `これで捨てる（${chosen.length}枚）`,
        optional: true,
        revivePickMany: { pid: offer.pid, sourceInstanceId: offer.source.instanceId, effectId: offer.effect.id, phase: "cards", chosenIds: bodies, ...(context ? { context } : {}) },
        action: { type: "noop" },
        selfInstanceId: offer.source.instanceId,
    })
}

// 選択待ちを立てたら true（呼び出し元は destroyBatch フレームを積んで止まる）。
// 非対話は、候補の先頭から可能な限りの体数を選び、手札の該当カードは末尾から破棄する（簡略化）
export function askNextPickMany(state: GameState, targets: Target[], context?: DestroyContext): boolean {
    for (;;) {
        const offer = nextOffer(state, targets, context)
        if (!offer) return false
        if (state.interactiveTargets) {
            suspendBodies(state, offer, [], context)
            return true
        }
        const k = Math.min(offer.candidates.length, offer.handIdx.length)
        discardHand(state, offer.pid, offer.handIdx.slice(-k))
        record(state, offer, offer.candidates.slice(0, k))
    }
}

// 選ばれた体を先に処理する（発生源自身が選ばれていないと、先に破壊されて他の体の復活が効かなくなるため）
export function selectedFirst(state: GameState, targets: Target[]): Target[] {
    const picked = new Set(Object.values(state.destroyGroup?.pickMany ?? {}).flat())
    if (picked.size === 0) return targets
    return [...targets.filter((t) => picked.has(t.instanceId)), ...targets.filter((t) => !picked.has(t.instanceId))]
}

// 選択待ちへの応答。選択中はエラーなら選択待ちを残し、確定したら次の発生源へ進む（無ければ破壊バッチの再開に任せる）
export function resolveRevivePickMany(state: GameState, pending: PendingChoice, instanceId?: string, cardIndex?: number): string | null {
    const info = pending.revivePickMany!
    const source = findInstanceAnywhere(state, info.sourceInstanceId)
    const effect = source ? getCard(source.cardId).effects.find((x): x is ReviveEffect => x.kind === "reviveOnDestroy" && x.id === info.effectId) : undefined
    const max = pending.counter?.max ?? 0
    if (!source || !effect) return "選択できません"
    const offer: Offer = { pid: info.pid, source, effect, candidates: pending.candidates, handIdx: handIndices(state, info.pid, effect) }

    if (info.phase === "bodies") {
        const chosen = pending.selectedIds ?? []
        if (instanceId !== undefined) {
            if (!pending.candidates.includes(instanceId)) return "選択できない対象です"
            if (!chosen.includes(instanceId) && chosen.length >= max) return `これ以上選べません（上限${max}体）`
            suspendBodies(state, offer, chosen.includes(instanceId) ? chosen.filter((id) => id !== instanceId) : [...chosen, instanceId], info.context)
            return null
        }
        if (chosen.length === 0) {
            state.pendingChoice = null
            record(state, offer, [])
            return proceed(state)
        }
        suspendCards(state, offer, chosen, [], info.context)
        return null
    }

    const bodies = info.chosenIds ?? []
    const chosen = pending.selectedCardIndices ?? []
    if (cardIndex !== undefined) {
        if (!(pending.cardIndices ?? []).includes(cardIndex)) return "選択できない対象です"
        if (!chosen.includes(cardIndex) && chosen.length >= bodies.length) return `これ以上選べません（${bodies.length}枚）`
        suspendCards(state, offer, bodies, chosen.includes(cardIndex) ? chosen.filter((i) => i !== cardIndex) : [...chosen, cardIndex], info.context)
        return null
    }
    if (chosen.length !== bodies.length) return `破棄する手札を${bodies.length}枚選んでください`
    state.pendingChoice = null
    discardHand(state, info.pid, chosen)
    log(state, `${state.players[info.pid].name}は手札${chosen.length}枚を破棄した。`)
    record(state, offer, bodies)
    return proceed(state)
}

function proceed(state: GameState): null {
    // 選択を出した破壊バッチの続き（いちばん内側＝先頭に近いもの）。入れ子の処理で先頭が別のフレームでも拾えるよう探す
    const batch = state.resumeStack.find((f): f is Extract<ResumeFrame, { kind: "destroyBatch" }> => f.kind === "destroyBatch")
    if (!batch) return null
    if (askNextPickMany(state, batch.targets, batch.context)) return null
    batch.targets = selectedFirst(state, batch.targets)
    return null
}
