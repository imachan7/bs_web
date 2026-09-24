// 継続効果を期間つきで置く（ACTION_VOCABULARY §3「期間つきの継続効果」）
import type { ActionHandler, ActionRegistry } from "./types"
import type { AuraCounter, CardInstance, EffectAction, EffectCounter, GameState, PlayerId, ResolvedTargetFilter } from "../../type"
import { getCard, log } from "../GameState"
import { applyMagicBuffBonus, findSpiritAny, pickAnySideCandidates, pickEnemyByBp, pickEnemyCandidates, requestChoice, tryInteractiveTargetChoice } from "../EffectModules"
import { countAuraCounter, effectiveBp, isBpBuffSuppressed, matchesTarget } from "../../../../shared/rules"
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
const RULE_COUNTERS = [
    "ownExhausted",
    "ownLife",
    "exhaustedEnemies",
    "targetSymbols",
    "ownRestedNexuses",
    "targetSameFamilyOwn",
] as const satisfies readonly (AuraCounter & EffectCounter)[]

// 1体指定モードの対象選択：battle中は対象を持つ battling 個体を優先し、無ければ先頭（旧 pickBpBuffTarget と同じ順序）
function pickOwnBpTarget(state: GameState, owner: PlayerId, filter: ResolvedTargetFilter, selfInstanceId?: string): CardInstance | null {
    const mine = state.players[owner].field.spirits.filter((s) => matchesTarget(state, owner, s, filter, selfInstanceId))
    if (state.battle) {
        const battling = mine.find((s) => s.instanceId === state.battle?.attackerInstanceId || s.instanceId === state.battle?.blockerInstanceId)
        if (battling) return battling
    }
    return mine[0] ?? null
}

// 1体を指定するBP変更（旧 bpBuff の単純形を置き換える経路）。対象選択の優先順は旧 bpBuff と同じ：
// 1.targetInstanceId指定 2.side:"both"かつ対話ならプレイヤーが選ぶ 3.それ以外は自動選択（既定=相手は実効BP最大、own/bothの非対話フォールバックは自分の場から）
function placeBp(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect, filter: ResolvedTargetFilter): void {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const content = action.content.find((c): c is Extract<Content, { type: "bp" }> => c.type === "bp")
    if (!content) return
    // 「BPを+する効果は発揮されない」（古代闘技場）は発揮する時点でだけ見る（2026-09-24 ユーザー確認）。全体ルール版と同じ判定
    if (content.amount > 0 && isBpBuffSuppressed(state, owner)) {
        log(state, `${sourceName}：BPを+する効果は発揮されなかった。`)
        return
    }
    // 「そのスピリットが」の控えは今回のBP増加の結果でなければならない（旧 bpBuff と同じ）
    delete state.lastBpBuffTargetId
    let target: CardInstance | null = null
    if (targetInstanceId !== undefined) {
        const found = findSpiritAny(state, targetInstanceId)
        if (found && matchesTarget(state, found.pid, found.inst, filter, self?.instanceId)) target = found.inst
    } else if (action.side === "both" && state.interactiveTargets) {
        const candidates = pickAnySideCandidates(state, owner, (s) => matchesTarget(state, owner, s, filter, self?.instanceId), srcColors, srcType)
        if (candidates.length >= 2) {
            requestChoice(
                state,
                owner,
                `${sourceName}：BPを増加するスピリットを選んでください`,
                candidates.map((s) => s.instanceId),
                false,
                action,
                self,
            )
            return
        }
        target = candidates[0] ?? null
    }
    if (!target && targetInstanceId === undefined) {
        target =
            action.side === undefined
                ? pickEnemyByBp(state, opp, Infinity, (s) => matchesTarget(state, opp, s, filter, self?.instanceId), srcColors, srcType)
                : pickOwnBpTarget(state, owner, filter, self?.instanceId)
    }
    if (!target) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    state.lastBpBuffTargetId = target.instanceId
    const untilLabel = action.duration === "battle" ? "このバトルの間" : "ターン終了時まで"
    if (content.amountCounter === undefined) {
        if (action.duration === "battle") target.battleBpBuff = (target.battleBpBuff ?? 0) + content.amount
        else target.tempBpBuff += content.amount
        log(state, `${getCard(target.cardId).name}はBP+${content.amount}（${untilLabel}）。`)
        applyMagicBuffBonus(state, target, srcType, srcColors)
        return
    }
    // 量が可変（amountCounter あり）：個体には書かず全体ルールと同じ器（turnConstraints）に積み、
    // 「1体につき」の数は計算のたびに数え直す（timedRuleBp。2026-09-24 ユーザー確認）。解決時に0でも置く
    state.turnConstraints.push({
        type: "timedRule",
        content: [content],
        ownerPid: owner,
        instanceId: target.instanceId,
        filter: {},
        ...(action.duration === "battle" ? { until: "battle" as const } : {}),
    })
    const preview = content.amount * countAuraCounter(state, owner, content.amountCounter as AuraCounter, target)
    log(state, `${getCard(target.cardId).name}はBP+${preview}（${untilLabel}、数に応じて増減）。`)
    applyMagicBuffBonus(state, target, srcType, srcColors)
}

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
    // 「BPを+する効果は発揮されない」（古代闘技場）は発揮する時点でだけ見る（2026-09-24 ユーザー確認）
    if (action.content.some((c) => c.type === "bp" && c.amount > 0) && isBpBuffSuppressed(state, owner)) {
        log(state, `${sourceName}：BPを+する効果は発揮されなかった。`)
        return
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
        placeBp(ctx, action, filter)
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
