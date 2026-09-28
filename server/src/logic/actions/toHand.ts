// 手札に加える（トラッシュから）。オープンしたカードを加えるのは reveal の dest:"hand"（ACTION_VOCABULARY §3）
import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, log, suspend } from "../GameState"
import { notifyHandGained } from "../EffectModules"
import { hasGlobalConstraint, isTrashCardProtected, opponentCantReturnFromTrashToHand } from "../../../../shared/rules"
import { matchesPick } from "./revealAction"
import { recordMoved } from "../record"

// 選び終わるまでゾーンから抜かない（toDeck と同じ。インデックスで控える）
const toHandHandler: ActionHandler<"toHand"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    if (hasGlobalConstraint(state, "noTrashRecovery") || opponentCantReturnFromTrashToHand(state, owner)) {
        log(state, `${sourceName}：トラッシュからカードを手札に戻せないため発動しなかった。`)
        return
    }
    const player = state.players[owner]
    const zone = player.trashCards
    const picked = action.picked ?? []
    const choosable = (exclude: number[]): number[] =>
        zone
            .map((id, j) => ({ id, j }))
            .filter(({ id, j }) => !exclude.includes(j) && matchesPick(id, action.pick) && !isTrashCardProtected(id))
            .map(({ j }) => j)

    const finish = (order: number[]): void => {
        if (order.length === 0) {
            log(state, `${sourceName}：トラッシュに対象がなかった。`)
            return
        }
        const movedIds = order.map((j) => zone[j]!)
        for (const j of [...order].sort((a, b) => b - a)) zone.splice(j, 1)
        player.hand.push(...movedIds)
        recordMoved(state, movedIds)
        log(state, `${player.name}は「${movedIds.map((id) => getCard(id).name).join("、")}」をトラッシュから手札に戻した。`)
        notifyHandGained(state, owner, movedIds.length)
    }

    if (action.count === "all") {
        finish(choosable([]))
        return
    }
    if (chosenCardIndex !== undefined) {
        const next = [...picked, chosenCardIndex]
        if (next.length < action.count && choosable(next).length > 0) ctx.resolve({ ...action, picked: next })
        else finish(next)
        return
    }
    const candidates = choosable(picked)
    if (state.interactiveTargets && candidates.length >= 2 && candidates.length > action.count - picked.length) {
        suspend(state, {
            pid: owner,
            kind: "card",
            prompt: `${sourceName}：手札に戻すカードを選んでください（${picked.length + 1}/${action.count}枚目）`,
            candidates: [],
            cardZone: "trash",
            cardOwner: owner,
            cardIndices: candidates,
            optional: false,
            action: { ...action, picked },
            selfInstanceId: self ? self.instanceId : null,
        })
        return
    }
    // 非対話（テスト・AI）と、候補が戻す枚数以下のとき：末尾（新しい方）から。既に選んだぶんが先
    finish([...picked, ...candidates.reverse().slice(0, action.count - picked.length)])
}

const handlers = {
    toHand: toHandHandler,
} satisfies Partial<ActionRegistry>

export default handlers
