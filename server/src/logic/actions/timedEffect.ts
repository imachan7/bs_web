// 継続効果を期間つきで置く（ACTION_VOCABULARY §3「期間つきの継続効果」）
import type { ActionHandler, ActionRegistry } from "./types"
import type { AuraCounter, CardInstance, EffectAction, EffectCounter, ResolvedTargetFilter } from "../../type"
import { getCard, log } from "../GameState"
import { pickEnemyCandidates, tryInteractiveTargetChoice } from "../EffectModules"
import { effectiveBp, matchesTarget } from "../../../../shared/rules"
import { normalizeFilter, SELF_REQUIRED } from "./filter"
import { countedAmount } from "../counted"

type TimedEffect = Extract<EffectAction, { type: "timedEffect" }>
type Content = TimedEffect["content"][number]

// 置き場はいまの印のまま。「このバトルの間アタックできない」を書くカードは無いので置き場も無い
function flagOf(content: Content, duration: TimedEffect["duration"]) {
    if (content.type === "bp") return null
    if (content.type === "cantBlock") return duration === "turn" ? "cantBlockThisTurn" : "cantBlockThisBattle"
    return duration === "turn" ? "cantAttackThisTurn" : null
}

// BP は重ねがけできるので「既に持つ」とは見ない
function has(inst: CardInstance, action: TimedEffect): boolean {
    return action.content.every((c) => {
        const flag = flagOf(c, action.duration)
        return flag !== null && inst[flag] === true
    })
}

function apply(inst: CardInstance, action: TimedEffect): string {
    for (const c of action.content) {
        const flag = flagOf(c, action.duration)
        if (flag !== null) inst[flag] = true
    }
    const period = action.duration === "turn" ? "このターン" : "このバトル"
    return `${getCard(inst.cardId).name}は、${period}の間${contentLabel(action)}。`
}

function contentLabel(action: TimedEffect): string {
    const cant = action.content.filter((c) => c.type !== "bp").map((c) => (c.type === "cantAttack" ? "アタック" : "ブロック"))
    const bp = action.content.flatMap((c) => (c.type === "bp" ? [`BP${c.amount >= 0 ? "+" : ""}${c.amount}${c.amountCounter !== undefined ? "（数に応じて）" : ""}`] : []))
    return [...bp, ...(cant.length > 0 ? [`${cant.join("と")}ができない`] : [])].join("、")
}

// 全体ルールの「1体につき」は共有層（countAuraCounter）で計算のたびに数えるので、そこで数えられるものだけ受ける
// ponytail: 必要になったカウンタだけ並べている。足すときは countAuraCounter が数えられるか確かめてからここへ
const RULE_COUNTERS = ["ownExhausted", "ownLife"] as const satisfies readonly (AuraCounter & EffectCounter)[]

// all:true：個体を選ばず、条件をルールとして置く（判定は shared/rules.ts の cantActByTimedRule）
function placeRule(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect, filter: ResolvedTargetFilter): void {
    const { state, owner, opp, self, sourceName } = ctx
    if (action.duration !== "turn") {
        log(state, `${sourceName}：「このバトルの間、〜すべて」は未対応のため発揮しなかった。`)
        return
    }
    for (const c of action.content) {
        if (c.type !== "bp") continue
        // BP を条件にした絞り込みは effectiveBp → matchesTarget → effectiveBp と循環する
        if (filter.maxBp !== undefined || filter.minBp !== undefined || filter.exactBp !== undefined) {
            log(state, `${sourceName}：BPを条件にしたBP変更は未対応のため発揮しなかった。`)
            return
        }
        if (c.amountCounter !== undefined && !(RULE_COUNTERS as readonly unknown[]).includes(c.amountCounter)) {
            log(state, `${sourceName}：この数え方は未対応のため発揮しなかった。`)
            return
        }
    }
    const pid = action.side === "both" ? undefined : action.side === "own" ? owner : opp
    state.turnConstraints.push({
        type: "timedRule",
        content: action.content,
        ownerPid: owner,
        ...(pid !== undefined ? { pid } : {}),
        filter,
        ...(self ? { selfInstanceId: self.instanceId } : {}),
    })
    const who = pid === undefined ? "" : `${state.players[pid].name}の`
    log(state, `${sourceName}：このターンの間、条件に合う${who}スピリットすべては${contentLabel(action)}。`)
}

const timedEffectHandler: ActionHandler<"timedEffect"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    if (action.all) {
        placeRule(ctx, action, filter)
        return
    }
    if (action.content.some((c) => c.type === "bp")) {
        log(state, `${sourceName}：1体を指定するBP変更は未対応のため発揮しなかった。`)
        return
    }
    const candidates = pickEnemyCandidates(
        state,
        opp,
        Infinity,
        (s) => !has(s, action) && matchesTarget(state, opp, s, filter, self?.instanceId),
        srcColors,
        srcType,
    )
    // 選択の再開：1体ぶんの action（count:1）が選ばれた個体つきで戻ってくる
    if (targetInstanceId !== undefined) {
        const found = candidates.find((s) => s.instanceId === targetInstanceId)
        log(state, found ? apply(found, action) : `${sourceName}：対象がいなかった。`)
        return
    }
    const count =
        action.countCounter !== undefined
            ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
            : (action.count ?? 1)
    if (count <= 0 || candidates.length === 0) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    const { countCounter: _cc, ...rest } = action
    if (
        tryInteractiveTargetChoice(
            state,
            owner,
            self,
            `${sourceName}：${contentLabel(action)}ようにする相手のスピリットを選んでください${count > 1 ? `（残り${count}体）` : ""}`,
            candidates,
            { ...rest, count: 1 },
            count > 1 ? { ...rest, count: count - 1 } : null,
        )
    ) {
        return
    }
    // 非対話時は実効BP最大から順に選ぶ
    const picked = [...candidates]
        .sort((a, b) => effectiveBp(state, opp, b) - effectiveBp(state, opp, a))
        .slice(0, count)
    for (const s of picked) log(state, apply(s, action))
}

const handlers = {
    timedEffect: timedEffectHandler,
} satisfies Partial<ActionRegistry>

export default handlers
