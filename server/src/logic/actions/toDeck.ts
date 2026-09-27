// デッキに戻す（手札・トラッシュから）。フィールドからの「戻す」（バウンス待機がある）とは別のアクション（ACTION_VOCABULARY §3）
import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, log, suspend } from "../GameState"
import { isTrashCardProtected } from "../../../../shared/rules"
import { matchesPick } from "./revealAction"
import { recordMoved } from "../record"

// 「count枚まで」（BS15-082）でも途中でやめられず、候補が尽きるか count 枚まで選ばせる（途中でやめる UI は見送った）。
// ⚠️ 選び終わるまでゾーンから抜かない（インデックスで控える）。途中で抜くと「どのゾーンにも無いカード」ができ、保存則の検査に引っかかる
const toDeckHandler: ActionHandler<"toDeck"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, chosenCardIndex } = ctx
    const zonePid = action.side === "opponent" ? opp : owner
    const player = state.players[zonePid]
    const zone = action.from === "hand" ? player.hand : player.trashCards
    const picked = action.picked ?? []
    const choosable = (exclude: number[]): number[] =>
        zone
            .map((id, j) => ({ id, j }))
            .filter(({ id, j }) => !exclude.includes(j) && matchesPick(id, action.pick) && (action.from === "hand" || !isTrashCardProtected(id)))
            .map(({ j }) => j)

    const finish = (order: number[]): void => {
        if (order.length === 0) {
            log(state, `${sourceName}：デッキに戻せるカードがなかった。`)
            return
        }
        const movedIds = order.map((j) => zone[j]!)
        for (const j of [...order].sort((a, b) => b - a)) zone.splice(j, 1)
        for (const id of movedIds) {
            if (action.position === "top") player.deck.unshift(id)
            else player.deck.push(id)
        }
        recordMoved(state, movedIds)
        const where = action.position === "top" ? "上" : "下"
        // 手札は非公開なので名前を出さない
        const what = action.from === "hand" ? `手札${movedIds.length}枚` : `トラッシュの「${movedIds.map((id) => getCard(id).name).join("、")}」`
        log(state, `${player.name}は${what}をデッキの${where}に戻した。`)
    }

    if (chosenCardIndex !== undefined) {
        const next = [...picked, chosenCardIndex]
        if (next.length < action.count && choosable(next).length > 0) ctx.resolve({ ...action, picked: next })
        else finish(next)
        return
    }
    const candidates = choosable(picked)
    if (state.interactiveTargets && candidates.length >= 2) {
        const chooser = action.chooserIsTarget ? zonePid : owner
        suspend(state, {
            pid: chooser,
            kind: "card",
            prompt: `${sourceName}：デッキの${action.position === "top" ? "上" : "下"}に戻すカードを選んでください（${picked.length + 1}/${action.count}枚目）`,
            candidates: [],
            cardZone: action.from,
            cardOwner: zonePid,
            cardIndices: candidates,
            optional: false,
            action: { ...action, picked },
            selfInstanceId: self ? self.instanceId : null,
            ...(chooser !== owner ? { actorPid: owner } : {}),
        })
        return
    }
    // 非対話（テスト・AI）と候補1枚のとき：末尾（新しい方）から。既に選んだぶんが先
    finish([...picked, ...candidates.reverse().slice(0, action.count - picked.length)])
}

const handlers = {
    toDeck: toDeckHandler,
} satisfies Partial<ActionRegistry>

export default handlers
