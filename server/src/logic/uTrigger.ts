// 【Uトリガー】の手順（docs/design/ULTIMATE_STAGE6.md §2。規則は ULTIMATE_PLAN C1〜C13）。
// 段1 置く → 段2 判定 → 段3 窓 → 段4 ヒット効果 → 段5 派生。段1〜3 は同期。段4 以降の中断は sequence の再開スタックに乗る
import type { ActionCtx } from "./actions/types"
import type { CardInstance, EffectAction, FieldEvent, UTriggerProgress } from "../type"
import { getCard, log } from "./GameState"
import { fireFieldEventTriggers } from "./fieldEventTriggers"
import { isWaiting } from "../../../shared/rules/waiting"
import { instBaseCost } from "../../../shared/rules/level"
import { clearUTriggerHitter, isUTriggerGuard, uTriggerVerdict } from "../../../shared/rules/uTrigger"

type UTriggerAction = Extract<EffectAction, { type: "uTrigger" }>

export function resolveUTrigger(ctx: ActionCtx, action: UTriggerAction): void {
    if (action.progress !== undefined) uTriggerAfter(ctx, action, action.progress)
    else uTriggerStart(ctx, action)
}

function stillOnField(ctx: ActionCtx, ult: CardInstance | null): ult is CardInstance {
    if (ult === null || isWaiting(ult)) return false
    const f = ctx.state.players[ctx.owner].field
    return f.ultimates.includes(ult) || f.spirits.includes(ult)
}

// 段1：デッキ破棄ではないので millDeck を通さない（デッキ破棄無効・破棄の誘発・【強化】・破棄税は関係しない。C2）
function uTriggerPlace(ctx: ActionCtx, count: number): string[] {
    const opp = ctx.state.players[ctx.opp]
    const placed: string[] = []
    const n = Math.min(count, opp.deck.length)
    for (let i = 0; i < n; i++) placed.push(opp.deck.shift()!)
    opp.trashCards.push(...placed)
    log(ctx.state, `${ctx.sourceName}のUトリガー：${opp.name}のデッキの上から${placed.length}枚をトラッシュに置いた。`)
    return placed
}

// 段2：置いた札は印刷コストで見る（デッキのカードに軽減は効かない。C3）。判定は札ごと（C4・C5）
function uTriggerJudge(ult: CardInstance, placedIds: string[]): UTriggerProgress["placed"] {
    const cost = instBaseCost(ult)
    return placedIds.map((cardId) => {
        const c = getCard(cardId)
        return { cardId, verdict: uTriggerVerdict(c.cost, cost, isUTriggerGuard(c, ult)) }
    })
}

// 段3：【トリガーカウンター】の窓（C6）。BS26 を入れるとき、ここに選択待ちを足して再開フレームで続ける。ヒットのときだけ呼ぶ
// 全体がガードされたら clearUTriggerHitter(ctx.state, progress.ultimateInstanceId) で印を外す
function uTriggerWindow(_ctx: ActionCtx, _progress: UTriggerProgress): void {}

// 段4：ヒット効果とダブルヒット等を1本の列にし、その後ろに段5 を積む。同じ effectId のまま解決するので C11 の「1回」は出口の派生の列がまとめる
function uTriggerStart(ctx: ActionCtx, action: UTriggerAction): void {
    const { self } = ctx
    if (self === null) return
    const placed = uTriggerJudge(self, uTriggerPlace(ctx, action.count))
    const progress: UTriggerProgress = { stage: "after", ultimateInstanceId: self.instanceId, placed }
    const n = placed.filter((p) => p.verdict === "hit").length
    const battle = ctx.state.battle
    if (n >= 1 && battle) battle.uTriggerHitters = [...new Set([...(battle.uTriggerHitters ?? []), self.instanceId])]
    if (n >= 1) uTriggerWindow(ctx, progress)
    const actions: EffectAction[] = []
    if (n >= 1 && stillOnField(ctx, self)) {
        progress.hitFired = true
        actions.push(...action.hit)
        for (const b of action.hitBonus ?? []) if (b.need === "all" ? n === action.count : n >= b.need) actions.push(...b.actions)
        log(ctx.state, `${ctx.sourceName}のUトリガー：ヒット（${n}枚）。`)
    } else if (n === 0 && placed.length > 0) log(ctx.state, `${ctx.sourceName}のUトリガー：ヒットしなかった。`)
    ctx.resolve({ type: "sequence", actions: [...actions, { ...action, progress }] })
}

// 段5：派生の出来事。効果の中なら出口で1本の列にまとまり、ヒット効果で起きた破壊の誘発と同じ列で解決する（C12）
function uTriggerAfter(ctx: ActionCtx, action: UTriggerAction, progress: UTriggerProgress): void {
    const { state, owner, self } = ctx
    const onField = stillOnField(ctx, self)
    const fire = (event: FieldEvent, withExtra = false): void => {
        fireFieldEventTriggers(state, owner, event, self ? { pid: owner, inst: self } : undefined, undefined, undefined, undefined, undefined, withExtra && self ? [self] : undefined)
    }
    if (progress.hitFired === true && onField) fire("ownUTriggerHit")
    if ((progress.guardedAll === true || progress.placed.some((p) => p.verdict === "guard")) && onField) fire("ownUTriggerGuarded")
    fire("ownUTriggered", !onField)
    // 段6：XU（C14）は派生がすべて解決した後。ガードされていても、デッキが0枚でも行う（Q818・Q836）
    if (action.xu && action.xu.length > 0) ctx.resolve({ type: "sequence", actions: [{ type: "settleDerived" }, ...action.xu] })
}
