// 「ターンに1回」の記録。誘発・ステップ・起動・マジック無効・マジックで共有する。
// 「ターンに1回、Aする。」は個体ごと（既定）、「Aする。この効果はターンに1回しか使えない。」は
// プレイヤーごと・カード名ごと（onceScope:"name"。2026-10-01 ユーザー提供のルール）
import type { CardInstance, GameState, PlayerId } from "../type"
import { getCard } from "./GameState"

export type OnceSlot = "triggeredUsedTurn" | "stepUsedTurn" | "activatedUsedTurn" | "magicNegateUsedTurn"
type OnceEffect = { id: string; onceScope?: "name" }

// 同じカードの別個体・再召喚・別版でも同名なら同じ枠になるよう、cardId でなく名前で引く
export function onceNameKey(cardId: string, effectId: string): string {
    return getCard(cardId).name + effectId.slice(effectId.lastIndexOf("-e"))
}

// 個体を持たないマジック用。常に名前で数える
export function isOnceNameUsed(state: GameState, pid: PlayerId, cardId: string, effectId: string): boolean {
    return state.players[pid].onceByNameUsed?.[onceNameKey(cardId, effectId)] === state.turn
}

export function markOnceNameUsed(state: GameState, pid: PlayerId, cardId: string, effectId: string): void {
    ;(state.players[pid].onceByNameUsed ??= {})[onceNameKey(cardId, effectId)] = state.turn
}

export function ownerPidOfInstance(state: GameState, inst: CardInstance): PlayerId | undefined {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const f = state.players[pid].field
        if (f.spirits.includes(inst) || f.nexuses.includes(inst) || f.combinedBraves.includes(inst)) return pid
        const id = inst.instanceId
        if ([...f.spirits, ...f.nexuses, ...f.combinedBraves].some((x) => x.instanceId === id)) return pid
    }
    return undefined
}

export function isOnceUsed(state: GameState, pid: PlayerId, inst: CardInstance, effect: OnceEffect, slot: OnceSlot): boolean {
    if (effect.onceScope === "name") return state.players[pid].onceByNameUsed?.[onceNameKey(inst.cardId, effect.id)] === state.turn
    if (slot === "magicNegateUsedTurn") return inst.magicNegateUsedTurn === state.turn
    return inst[slot]?.[effect.id] === state.turn
}

export function markOnceUsed(state: GameState, pid: PlayerId, inst: CardInstance, effect: OnceEffect, slot: OnceSlot): void {
    if (effect.onceScope === "name") {
        ;(state.players[pid].onceByNameUsed ??= {})[onceNameKey(inst.cardId, effect.id)] = state.turn
    } else if (slot === "magicNegateUsedTurn") {
        inst.magicNegateUsedTurn = state.turn
    } else {
        inst[slot] = { ...(inst[slot] ?? {}), [effect.id]: state.turn }
    }
}

// 解決の直前に枠を取る。名前スコープの効果は集める時点では記録せず、ここで取る
// （同名の1体目が払えず不発なら枠を戻し、2体目が使えるようにするため）
export function claimOnce(state: GameState, pid: PlayerId, inst: CardInstance, effect: OnceEffect, slot: OnceSlot): boolean {
    if (isOnceUsed(state, pid, inst, effect, slot)) return false
    markOnceUsed(state, pid, inst, effect, slot)
    return true
}

// 発揮しなかったと分かったときの巻き戻し。発生源が場を離れて持ち主を引けない場合は戻せない（名前の枠は消費されたまま）
export function revertOnceUsed(state: GameState, inst: CardInstance, effectId: string, slot: OnceSlot): void {
    const effect = getCard(inst.cardId).effects.find((e) => e.id === effectId)
    if (effect && "onceScope" in effect && effect.onceScope === "name") {
        const pid = ownerPidOfInstance(state, inst)
        const used = pid && state.players[pid].onceByNameUsed
        if (used) delete used[onceNameKey(inst.cardId, effectId)]
    } else if (slot === "magicNegateUsedTurn") {
        delete inst.magicNegateUsedTurn
    } else if (inst[slot]) {
        const rest = { ...inst[slot] }
        delete rest[effectId]
        inst[slot] = rest
    }
}
