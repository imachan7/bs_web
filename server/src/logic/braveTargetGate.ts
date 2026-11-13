// ブレイヴの破壊・分離の耐性（2026-11-13 ユーザー裁定。#491）。
// 対象は合体スピリット（ホスト）なので、ホストの装甲・完全耐性・対象不可が効く。ブレイヴ自身の耐性も効く。
// ホストは破壊されないので、ホストは op:"other" で見る（ホストの「破壊されない」は効かない）

import type { CardInstance, EffectAction, PlayerId } from "../type"
import type { ActionCtx } from "./actions/types"
import { attemptOf } from "./actions/filter"
import { gateTargetedApply, isResisted } from "./EffectModules"
import { getCard, log } from "./GameState"
import { bravesOf } from "../../../shared/rules"

type BraveOp = "destroy" | "other"
type Scope = "targeted" | "area"

// 候補を数える用（probing）：ホストが受けるなら、受けるブレイヴを返す。ホストが受けなければ空
export function affectableBraves(ctx: ActionCtx, pid: PlayerId, host: CardInstance, op: BraveOp, scope: Scope, braves = bravesOf(ctx.state.players[pid], host)): CardInstance[] {
    const { state } = ctx
    if (isResisted(state, pid, host, { ...attemptOf(ctx, "other", scope), probing: true })) return []
    return braves.filter((b) => !isResisted(state, pid, b, { ...attemptOf(ctx, op, scope), probing: true }))
}

// 実際に適用する前の関所：ホスト→ブレイヴの順に耐性を通し、受けるブレイヴを返す。
// 手札を払って受けない確認（円卓など）を出したら null（resume から再開する）
export function gateBraveTargets(ctx: ActionCtx, pid: PlayerId, host: CardInstance, braves: CardInstance[], op: BraveOp, scope: Scope, resume: EffectAction): CardInstance[] | null {
    const { state, self, sourceName } = ctx
    const hostGate = gateTargetedApply(state, pid, host, attemptOf(ctx, "other", scope), resume, self, sourceName)
    if (hostGate === "asked") return null
    if (hostGate) {
        log(state, `${getCard(host.cardId).name}は${sourceName}の効果を受けなかった（${hostGate.label}）。`)
        return []
    }
    const passed: CardInstance[] = []
    for (const brave of braves) {
        const r = gateTargetedApply(state, pid, brave, attemptOf(ctx, op, scope), resume, self, sourceName)
        if (r === "asked") return null
        if (r) log(state, `${getCard(brave.cardId).name}は${sourceName}の効果を受けなかった（${r.label}）。`)
        else passed.push(brave)
    }
    return passed
}
