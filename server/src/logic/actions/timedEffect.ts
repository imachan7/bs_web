// 継続効果を期間つきで置く（ACTION_VOCABULARY §3「期間つきの継続効果」）
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, EffectAction } from "../../type"
import { getCard, log } from "../GameState"
import { pickEnemyCandidates, tryInteractiveTargetChoice } from "../EffectModules"
import { effectiveBp, matchesTarget } from "../../../../shared/rules"
import { normalizeFilter, SELF_REQUIRED } from "./filter"
import { countedAmount } from "../counted"

type TimedEffect = Extract<EffectAction, { type: "timedEffect" }>
type Content = TimedEffect["content"][number]

// 置き場はいまの印のまま。「このバトルの間アタックできない」を書くカードは無いので置き場も無い
function flagOf(content: Content, duration: TimedEffect["duration"]) {
    if (content.type === "cantBlock") return duration === "turn" ? "cantBlockThisTurn" : "cantBlockThisBattle"
    return duration === "turn" ? "cantAttackThisTurn" : null
}

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
    const what = action.content.map((c) => (c.type === "cantAttack" ? "アタック" : "ブロック")).join("も")
    return `${getCard(inst.cardId).name}は、${period}の間${what}できない。`
}

const timedEffectHandler: ActionHandler<"timedEffect"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) {
        log(state, `${sourceName}：対象がいなかった。`)
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
            `${sourceName}：${action.content.map((c) => (c.type === "cantAttack" ? "アタック" : "ブロック")).join("も")}できなくする相手のスピリットを選んでください${count > 1 ? `（残り${count}体）` : ""}`,
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
