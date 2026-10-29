// BP修正系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance } from "../../type"
import { getCard, log } from "../GameState"
import { lastTargetsOf, recordTargets } from "../record"
import {
    countEffectCounter,
    effectiveBp,
    matchesFamilyFilter,
    findSpiritAny,
    pickAnySideByBp,
    pickEnemyByBp,
    pickEnemyCandidates,
    askPayToNegateIfNeeded,
    resistanceAgainst,
    tryInteractiveTargetChoice,
    recordBp,
    recordTimed,
} from "../EffectModules"
import { isBpBuffSuppressed, matchesTarget } from "../../../../shared/rules"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"


// スリーカード：対象スピリット1体に「このターンの間、使用者の効果では count 体分として数える」印を付ける。
// 対象未指定時は実効BP最大の1体（自動選択の簡略化。anySide 指定時は自分/相手どちらからも選ぶ）
const countAsMultipleThisTurnHandler: ActionHandler<"countAsMultipleThisTurn"> = (ctx, action) => {
    const { state, owner, opp, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const found = targetInstanceId
        ? findSpiritAny(state, targetInstanceId)
        : action.anySide
          ? pickAnySideByBp(state, owner, Infinity, () => true, srcColors, srcType)
          : (() => {
                const t = pickEnemyByBp(state, opp, Infinity, undefined, srcColors, srcType)
                return t ? { pid: opp, inst: t } : null
            })()
    if (!found) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    // sourceTypes（数える側の発生源種別の限定。スリーカード＝スピリット/ネクサスの効果のみ）は印へそのまま写す
    recordTimed(state, {
        content: [{ type: "countAs", count: action.count, ...(action.sourceTypes ? { sourceTypes: action.sourceTypes } : {}) }],
        target: { kind: "instance", instanceId: found.inst.instanceId },
        until: "turn",
        ownerPid: owner,
    })
    log(
        state,
        `${sourceName}：このターンの間、${getCard(found.inst.cardId).name}は${state.players[owner].name}の効果で${action.count}体分として数えられる。`,
    )
}

// BS08スナイピングブラスト：自分のスピリットすべてを、それぞれが持つ【暴風】の実効指定数×amountPerだけBP+
// （bpBuffAllByArmorColorsの暴風版。暴風を持たない個体は対象外）

// bpBuffAll（26系Re覚醒）：指定系統（familyFilter省略時は系統不問）を持つ自分のスピリットすべてを
// ターン終了時までBP+Nする（「このターン中、系統：「紅雲」を持つ自分のスピリットすべてをBP+1000する」）
const bpBuffAll: ActionHandler<"bpBuffAll"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const targets = state.players[owner].field.spirits.filter(
        (s) => (action.familyFilter === undefined || matchesFamilyFilter(state, owner, s, action.familyFilter)) && (action.teamFilter === undefined || (getCard(s.cardId).team ?? []).includes(action.teamFilter)),
    )
    if (targets.length === 0) {
        log(state, `${sourceName}のBP増加：対象がいなかった。`)
        return
    }
    for (const s of targets) recordBp(state, owner, s, action.amount, "turn")
    log(state, `${sourceName}：${targets.map((s) => getCard(s.cardId).name).join("、")}をBP+${action.amount}（ターン終了時まで）。`)
}

// 26系「相手のスピリット1体を指定する。このターン中、それをBP-2000する」。
// 非対話の自動選択は、この効果でBP0以下になる中で実効BP最大（続く「BP0なら破壊」を活かす）、いなければ実効BP最大
const bpMinus: ActionHandler<"bpMinus"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    delete state.lastBpBuffTargetId
    // 絞り込み（filter.lastTarget＝designate で指定した個体）を先に解いてから控えを空にする
    const filter = normalizeFilter(ctx, action)
    // 複数体のとき「それらがBP0なら」が読む控え。count 回の再帰の初回で空に戻し、BP-できた個体を足していく
    if (action.excludeIds === undefined) recordTargets(state, [])
    if (filter === SELF_REQUIRED) return
    const amount = action.amount + (action.per ? countEffectCounter(state, owner, self, action.per.counter, srcType) * action.per.amount : 0)
    if (action.all) {
        const hit = state.players[opp].field.spirits.filter((s) => matchesTarget(state, opp, s, filter, self?.instanceId))
        for (const t of hit) {
            const resisted = resistanceAgainst(state, opp, t, attemptOf(ctx, "other", "area"))
            if (resisted) {
                log(state, `${getCard(t.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                continue
            }
            recordTargets(state, [...lastTargetsOf(state), t.instanceId])
            recordBp(state, opp, t, -amount, action.scope === "battle" ? "battle" : "turn")
            log(state, `${sourceName}：${getCard(t.cardId).name}はBP-${amount}（${action.scope === "battle" ? "このバトルの間" : "ターン終了時まで"}）。`)
        }
        return
    }
    const excluded = action.excludeIds ?? []
    const list = pickEnemyCandidates(state, opp, Infinity, (s) => !excluded.includes(s.instanceId) && matchesTarget(state, opp, s, filter, self?.instanceId), srcColors, srcType)
    // count 体を1体ずつ、選んだ個体を除いて繰り返す（exhaust と同じ形）
    const next = (t: CardInstance): void => {
        const { chosenByPlayer: _c, ...rest } = action
        if ((action.count ?? 1) > 1) ctx.resolve({ ...rest, count: action.count! - 1, excludeIds: [...excluded, t.instanceId] }, { sourceColors: srcColors, sourceType: srcType })
    }
    let target = action.chosenByPlayer && targetInstanceId !== undefined ? list.find((s) => s.instanceId === targetInstanceId) : undefined
    if (target === undefined) {
        if (list.length === 0) {
            log(state, `${sourceName}のBP-：対象がいなかった。`)
            return
        }
        if (tryInteractiveTargetChoice(state, owner, self, `${sourceName}：BP-${amount}する相手のスピリットを選んでください`, list, { ...action, chosenByPlayer: true }, null)) return
        const bp = (s: CardInstance): number => effectiveBp(state, opp, s)
        const lethal = list.filter((s) => bp(s) <= amount)
        target = (lethal.length > 0 ? lethal : list).reduce((best, s) => (bp(s) > bp(best) ? s : best))
    }
    const attempt = attemptOf(ctx, "other", "targeted")
    if (askPayToNegateIfNeeded(state, opp, target, attempt, action, self, sourceName)) return
    const resisted = resistanceAgainst(state, opp, target, attempt)
    if (resisted) {
        log(state, `${getCard(target.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
        next(target)
        return
    }
    state.lastBpBuffTargetId = target.instanceId
    recordTargets(state, [...lastTargetsOf(state), target.instanceId])
    recordBp(state, opp, target, -amount, action.scope === "battle" ? "battle" : "turn")
    log(state, `${sourceName}：${getCard(target.cardId).name}はBP-${amount}（${action.scope === "battle" ? "このバトルの間" : "ターン終了時まで"}）。`)
    next(target)
}

const handlers = {
    countAsMultipleThisTurn: countAsMultipleThisTurnHandler,
    bpBuffAll,
    bpMinus,
} satisfies Partial<ActionRegistry>

// 古代闘技場Lv1（kind:"bpBuffSuppression"）：相手の「BPを+する」効果は発揮されない。
// BP増加アクションはこのモジュールに集約されているため、**レジストリを1箇所で包んで**ゲートする
// （8ハンドラそれぞれに早期returnを撒くと、将来アクションを足したときに素通りする）。
// BPを-する効果は抑止の対象外のため、amount/amountPer が負のものは通す
function isBpDecrease(action: { amount?: number; amountPer?: number }): boolean {
    const amount = action.amount ?? action.amountPer
    return typeof amount === "number" && amount < 0
}

type AnyBuffHandler = (ctx: ActionCtx, action: { amount?: number; amountPer?: number }) => void

const suppressed = Object.fromEntries(
    Object.entries(handlers).map(([type, handler]) => [
        type,
        ((ctx, action) => {
            if (!isBpDecrease(action) && isBpBuffSuppressed(ctx.state, ctx.owner)) {
                log(ctx.state, `${ctx.sourceName}：「BPを+する」効果は発揮されなかった。`)
                return
            }
            ;(handler as AnyBuffHandler)(ctx, action)
        }) as AnyBuffHandler,
    ]),
) as unknown as typeof handlers

export default suppressed
