// 概念: 自分のブレイヴ（合体中／スピリット状態）を1つ選んで破壊するアクション
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, GameState, PlayerId } from "../../type"
import { getCard, log } from "../GameState"
import { requestChoice } from "../EffectModules"
import { destroySpirit } from "../removal"
import { destroyCombinedBrave } from "../brave"
import { currentRecordScope, recordMoved } from "../record"

// 自分のブレイヴ1つ＝合体スピリットに合体しているブレイヴか、スピリット状態のブレイヴ（BS23-075）
export function ownBraveCandidates(state: GameState, pid: PlayerId): CardInstance[] {
    const f = state.players[pid].field
    return [...f.spirits.filter((s) => getCard(s.cardId).type === "brave"), ...f.combinedBraves]
}

// 破壊したブレイヴは lastMoved に書く（直後の maxCostAsLast が、そのブレイヴの印刷コストを読む）
const destroyOwnBraveHandler: ActionHandler<"destroyOwnBrave"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId, destroyContext } = ctx
    // hostSelf：発生源（合体スピリットのホスト）に合体しているブレイヴだけを候補にする（BS23-052「このスピリットのブレイヴ1つ」）
    const braves = action.hostSelf
        ? state.players[owner].field.combinedBraves.filter((b) => (self?.braveRefs ?? []).some((r) => r.instanceId === b.instanceId))
        : ownBraveCandidates(state, owner)
    if (braves.length === 0) {
        log(state, `${sourceName}：破壊できる自分のブレイヴがいなかった。`)
        return
    }
    const chosen = braves.find((b) => b.instanceId === targetInstanceId) ?? (state.interactiveTargets && braves.length >= 2 ? undefined : braves[0])
    if (!chosen) {
        requestChoice(state, owner, `${sourceName}：破壊する自分のブレイヴを選んでください`, braves.map((b) => b.instanceId), false, action, self)
        return
    }
    const scope = currentRecordScope(state)
    const host = state.players[owner].field.spirits.find((s) => (s.braveRefs ?? []).some((r) => r.instanceId === chosen.instanceId))
    if (host) destroyCombinedBrave(state, owner, host, chosen, destroyContext)
    else destroySpirit(state, owner, chosen.instanceId, "destroy", destroyContext)
    recordMoved(state, [chosen.cardId], scope)
}

export default { destroyOwnBrave: destroyOwnBraveHandler } satisfies Partial<ActionRegistry>
