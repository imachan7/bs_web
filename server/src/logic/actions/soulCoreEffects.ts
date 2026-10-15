// [ソウルコア]を自分の個体に置く効果アクション（docs/design/SOULCORE.md 部品5）。
// 「自分のトラッシュの[ソウルコア]をそれに置く」等の26系文言の器。
// ソウルコアが指定元（リザーブ/トラッシュ）にないときは不発。
// 置いた個体にはコア増加の誘発（夢魔の寝所）が効く（ソウルコアもコアとして置かれたため）
import type { ActionRegistry, ActionHandler } from "./types"
import type { CardInstance, PlayerId, ResolvedTargetFilter } from "../../type"
import { findNexus, findSpirit, getCard, log } from "../GameState"
import { matchesTarget } from "../../../../shared/rules"
import { requestChoice } from "../targeting"
import { checkExhaustOnCoreChange } from "../state/exhaust"
import { moveSoulCore, soulCoreInReserve, soulCoreInTrash, soulCoreToTrashPossible, wouldDeplete } from "../soulCore"
import { destroySpirit } from "../removal"

const placeSoulCoreHandler: ActionHandler<"placeSoulCore"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    const player = state.players[owner]
    const from = action.from ?? "trash"
    if (from === "trash" ? !soulCoreInTrash(player) : !soulCoreInReserve(player)) {
        log(state, `${sourceName}：[ソウルコア]が${from === "trash" ? "トラッシュ" : "リザーブ"}にないため発揮しなかった。`)
        return
    }
    // 対象: target:"self"＝効果発生源自身。それ以外は filter に合う自分のスピリット/ネクサス1体
    const filter = (action.filter ?? {}) as unknown as ResolvedTargetFilter
    const ownInstances: CardInstance[] = [...player.field.spirits, ...player.field.nexuses]
    const candidates: CardInstance[] =
        action.target === "self"
            ? self
                ? [self]
                : []
            : ownInstances.filter((inst) => matchesTarget(state, owner, inst, filter, self?.instanceId))
    if (candidates.length === 0) {
        log(state, `${sourceName}：[ソウルコア]を置く対象がいなかった。`)
        return
    }
    let chosen: CardInstance | undefined
    if (action.target === "self") {
        chosen = candidates[0]
    } else if (targetInstanceId !== undefined) {
        chosen = candidates.find((inst) => inst.instanceId === targetInstanceId)
    } else if (state.interactiveTargets && candidates.length >= 2) {
        // 複数候補なら選ばせる（選択の再入は targetInstanceId で戻る）
        requestChoice(state, owner, `${sourceName}：[ソウルコア]を置く対象を選んでください`, candidates.map((c) => c.instanceId), false, action, self)
        return
    } else {
        chosen = candidates[0]
    }
    if (!chosen) {
        log(state, `${sourceName}：[ソウルコア]を置く対象がいなかった。`)
        return
    }
    moveSoulCore(player, { zone: "instance", instanceId: chosen.instanceId })
    log(state, `${sourceName}：${getCard(chosen.cardId).name}に[ソウルコア]を置いた。`)
    // [ソウルコア]もコアとして置かれたため、コア増加の誘発（夢魔の寝所）を通す
    checkExhaustOnCoreChange(state, owner, chosen)
}

// 場の個体から取るときは、コア減少の誘発と、維持コアを下回ったときの消滅を通す
const soulCoreToTrashHandler: ActionHandler<"soulCoreToTrash"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const soul = player.soulCore
    if (!soulCoreToTrashPossible(soul)) {
        log(state, `${sourceName}：トラッシュに置ける[ソウルコア]がなかった。`)
        return
    }
    const inst = soul!.zone === "instance" ? (findSpirit(player, soul!.instanceId) ?? findNexus(player, soul!.instanceId)) : undefined
    moveSoulCore(player, { zone: "trash" })
    log(state, `${sourceName}：[ソウルコア]をトラッシュに置いた。`)
    if (!inst) return
    checkExhaustOnCoreChange(state, owner, inst, { viaEffect: true, isRemoval: true })
    if (findSpirit(player, inst.instanceId) && wouldDeplete(state, owner, inst)) destroySpirit(state, owner, inst.instanceId, "deplete")
}

const handlers = { placeSoulCore: placeSoulCoreHandler, soulCoreToTrash: soulCoreToTrashHandler } satisfies Partial<ActionRegistry>

export default handlers
