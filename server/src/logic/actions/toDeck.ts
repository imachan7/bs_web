// デッキに戻す（手札・トラッシュから）。フィールドからの「戻す」（バウンス待機がある）とは別のアクション（ACTION_VOCABULARY §3）
import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, log, suspend } from "../GameState"
import { isTrashCardProtected } from "../../../../shared/rules"
import { matchesPick } from "./revealAction"
import { recordMoved } from "../record"

// 「count枚まで」（BS15-082）でも途中でやめられず、候補が尽きるか count 枚まで選ばせる（途中でやめる UI は見送った）。
// upTo指定時は0〜count枚を選べる（2026-09-28ユーザー決定。途中で1枚も選ばずに終えられる）
// ⚠️ 選び終わるまでゾーンから抜かない（インデックスで控える）。途中で抜くと「どのゾーンにも無いカード」ができ、保存則の検査に引っかかる
const toDeckHandler: ActionHandler<"toDeck"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, chosenCardIndex } = ctx
    const zonePid = action.side === "opponent" ? opp : owner
    const player = state.players[zonePid]
    const zone = action.from === "hand" ? player.hand : player.trashCards
    const picked = action.picked ?? []
    const chooser = action.chooserIsTarget ? zonePid : owner
    // fromEvent：state.lastDeckMillが記録した直近の破棄ぶんだけを候補にする（BS16-039）。
    // 破棄は末尾へ連続してpushされるので、簡略化として**トラッシュ末尾のうち破棄枚数ぶん**を対象にする
    // （破棄からこのアクションまでの間に他の効果がトラッシュへ何も足していない前提。限界：割り込みで
    // 別のカードがトラッシュへ積まれた場合はずれうる）
    const eventTailStart =
        action.fromEvent && state.lastDeckMill?.pid === zonePid
            ? Math.max(0, zone.length - state.lastDeckMill.cardIds.length)
            : undefined
    const choosable = (exclude: number[]): number[] =>
        zone
            .map((id, j) => ({ id, j }))
            .filter(
                ({ id, j }) =>
                    !exclude.includes(j) &&
                    matchesPick(id, action.pick) &&
                    (action.from === "hand" || !isTrashCardProtected(id)) &&
                    (eventTailStart === undefined || j >= eventTailStart),
            )
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

    // upTo：候補があるかぎり1枚ずつ聞き直し、スキップ（resolveOnSkip）でその時点の枚数を確定する。
    // action.picked が既に定義されているかどうかで「初回の呼び出し」と「スキップで戻ってきた」を区別する
    // （どちらも picked=[] であり得るため、配列の中身では区別できない）
    const askUpTo = (soFar: number[]): void => {
        const candidates = choosable(soFar)
        if (candidates.length === 0) {
            finish(soFar)
            return
        }
        suspend(state, {
            pid: chooser,
            kind: "card",
            prompt: `${sourceName}：デッキの${action.position === "top" ? "上" : "下"}に戻すカードを選んでください（最大${action.count}枚。${soFar.length}枚選択済み）`,
            candidates: [],
            cardZone: action.from,
            cardOwner: zonePid,
            cardIndices: candidates,
            optional: true,
            resolveOnSkip: true,
            action: { ...action, picked: soFar },
            selfInstanceId: self ? self.instanceId : null,
            ...(chooser !== owner ? { actorPid: owner } : {}),
        })
    }

    if (chosenCardIndex !== undefined) {
        const next = [...picked, chosenCardIndex]
        if (action.upTo && state.interactiveTargets) {
            if (next.length >= action.count) {
                finish(next)
                return
            }
            askUpTo(next)
            return
        }
        if (next.length < action.count && choosable(next).length > 0) ctx.resolve({ ...action, picked: next })
        else finish(next)
        return
    }

    if (action.upTo && state.interactiveTargets) {
        // action.picked が定義済み＝askUpToのスキップから戻ってきた（もう聞かず確定する）
        if (action.picked !== undefined) {
            finish(picked)
            return
        }
        askUpTo(picked)
        return
    }

    const candidates = choosable(picked)
    if (state.interactiveTargets && candidates.length >= 2) {
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
