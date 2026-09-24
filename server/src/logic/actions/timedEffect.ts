// 継続効果を期間つきで置く（ACTION_VOCABULARY §3「期間つきの継続効果」）
import type { ActionHandler, ActionRegistry } from "./types"
import type { AuraCounter, CardInstance, Color, EffectAction, EffectCounter, GameState, PlayerId, ResolvedTargetFilter, TurnConstraintDef } from "../../type"
import { currentLevel, getCard, log } from "../GameState"
import { applyMagicBuffBonus, findSpiritAny, pickAnySideCandidates, pickEnemyByBp, pickEnemyCandidates, pickOwnKeywordTarget, refreshLevelAsOverrides, requestChoice, tryInteractiveTargetChoice } from "../EffectModules"
import { KEYWORDS, countAuraCounter, effectiveBp, isBpBuffSuppressed, matchesTarget } from "../../../../shared/rules"
import { normalizeFilter, SELF_REQUIRED } from "./filter"
import { countedAmount } from "../counted"
import { COLOR_LABELS } from "../../../../data/constants"

type TimedEffect = Extract<EffectAction, { type: "timedEffect" }>
type Content = TimedEffect["content"][number]

// 置き場はいまの印のまま。「このバトルの間アタックできない」を書くカードは無いので置き場も無い
function flagOf(content: Content, duration: TimedEffect["duration"]) {
    if (content.type !== "cantAttack" && content.type !== "cantBlock") return null
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
    "readyEnemies",
    "ownReserve",
    "ownNexuses",
    "allNexuses",
    "opponentTrashCores",
    "ownBraveSpirits",
    "selfCores",
    "battlingOpponentSymbols",
    "battlingOpponentCombinedSymbols",
    "opponentFieldColors",
    "opponentFieldSpiritColors",
] as const satisfies readonly (AuraCounter & EffectCounter)[]

// RULE_COUNTERS は文字列軸だけなので、オブジェクト形の軸（{ownFamily}等）はキー名で許可する
const RULE_COUNTER_KEYS = ["ownFamily", "ownNameIncludes", "anyNameIncludes", "ownColor", "ownNexusColor", "ownKeyword", "enemyCost"] as const

export function isAllowedRuleCounter(counter: EffectCounter): boolean {
    if (typeof counter === "string") return (RULE_COUNTERS as readonly string[]).includes(counter)
    return (RULE_COUNTER_KEYS as readonly string[]).some((k) => k in counter)
}

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
    // 解決時に数えて固定する：countOnce と、共有層で数えられない数え方（数え直せないので旧 bpBuff と同じ扱い）
    if (content.countOnce || !isAllowedRuleCounter(content.amountCounter)) {
        const amount = countedAmount(state, owner, self, content.amount, content.amountCounter, srcType, undefined, target)
        if (amount === 0) {
            log(state, `${sourceName}：カウントが0のため増加しなかった。`)
            return
        }
        if (action.duration === "battle") target.battleBpBuff = (target.battleBpBuff ?? 0) + amount
        else target.tempBpBuff += amount
        log(state, `${getCard(target.cardId).name}はBP+${amount}（${untilLabel}）。`)
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

// target:"self"：「このスピリット自身をBP+」（旧 selfBuff の置き換え。対象は常に発生源自身で、filter/side/count/targetInstanceIdは見ない）
function placeSelfBp(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect): void {
    const { state, owner, self, sourceName, srcType } = ctx
    const content = action.content.find((c): c is Extract<Content, { type: "bp" }> => c.type === "bp")
    if (!content || !self) return
    if (content.amount > 0 && isBpBuffSuppressed(state, owner)) {
        log(state, `${sourceName}：BPを+する効果は発揮されなかった。`)
        return
    }
    const untilLabel = action.duration === "battle" ? "このバトルの間" : "ターン終了時まで"
    const addBp = (amount: number) => {
        if (action.duration === "battle") self.battleBpBuff = (self.battleBpBuff ?? 0) + amount
        else self.tempBpBuff += amount
    }
    if (content.amountCounter === undefined) {
        addBp(content.amount)
        log(state, `${getCard(self.cardId).name}はBP+${content.amount}（${untilLabel}）。`)
        return
    }
    // countOnce：解決時に固定する（lastFunsaiSpirits のように数え直すと意味が変わるカウンタ用。旧 selfBuff と同じ挙動）
    if (content.countOnce || !isAllowedRuleCounter(content.amountCounter)) {
        const amount = countedAmount(state, owner, self, content.amount, content.amountCounter, srcType)
        if (amount === 0) {
            log(state, `${sourceName}：カウントが0のため増加しなかった。`)
            return
        }
        addBp(amount)
        log(state, `${getCard(self.cardId).name}はBP+${amount}（${untilLabel}）。`)
        return
    }
    // 可変：1体指定の timedRule と同じ器に積み、量は判定のたびに数え直す（2026-09-24 ユーザー確認）。解決時に0でも置く
    state.turnConstraints.push({
        type: "timedRule",
        content: [content],
        ownerPid: owner,
        instanceId: self.instanceId,
        filter: {},
        ...(action.duration === "battle" ? { until: "battle" as const } : {}),
    })
    const preview = content.amount * countAuraCounter(state, owner, content.amountCounter as AuraCounter, self)
    log(state, `${getCard(self.cardId).name}はBP+${preview}（${untilLabel}、数に応じて増減）。`)
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
        if (c.amountCounter !== undefined && !isAllowedRuleCounter(c.amountCounter)) {
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
    if (action.content.some((c) => c.type === "level")) {
        state.turnConstraints.push({
            type: "timedRule",
            content: action.content,
            ownerPid: owner,
            ...(pid !== undefined ? { pid } : {}),
            filter,
            ...(self ? { selfInstanceId: self.instanceId } : {}),
            appliedIds: [],
        })
        refreshLevelAsOverrides(state)
        const who = pid === undefined ? "お互いの" : `${state.players[pid].name}の`
        const lv = action.content.find((c): c is Extract<Content, { type: "level" }> => c.type === "level")!
        log(state, `${sourceName}：このターンの間、${who}スピリットすべてを${lv.max ? "最高Lv" : `Lv${lv.set}`}として扱う。`)
        return
    }
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

// 1体にキーワードを与える。対象の決め方は旧 grantKeyword と同じ（指定が無ければバトル中の自分のスピリット優先）
function placeKeyword(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect): void {
    const { state, owner, sourceName, targetInstanceId } = ctx
    const content = action.content.find((c): c is Extract<Content, { type: "keyword" }> => c.type === "keyword")
    if (!content) return
    if (action.duration !== "turn") {
        log(state, `${sourceName}：「このバトルの間」キーワードを与える効果は未対応のため発揮しなかった。`)
        return
    }
    const target = pickOwnKeywordTarget(state, owner, targetInstanceId)
    if (!target) {
        log(state, `${sourceName}：対象のスピリットがいなかった。`)
        return
    }
    target.tempKeywords.push({ keyword: content.keyword, ...(content.colors ? { colors: content.colors } : {}) })
    log(state, `${getCard(target.cardId).name}に【${KEYWORDS[content.keyword].label}】を付与した。`)
}

// 1体の Lv を「このターンの間」として扱う。自動選択は旧 type のまま2通り（set＝候補の先頭、up＝実効BP最大）
function placeLevel(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect, filter: ResolvedTargetFilter): void {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const content = action.content.find((c): c is Extract<Content, { type: "level" }> => c.type === "level")
    if (!content) return
    if (action.duration !== "turn") {
        log(state, `${sourceName}：「このバトルの間」Lvを変える効果は未対応のため発揮しなかった。`)
        return
    }
    const maxLevelOf = (s: CardInstance) => getCard(s.cardId).levels.reduce((m, l) => Math.max(m, l.level), 1)
    if (content.set !== undefined) {
        const level = content.set
        const pid = action.side === "own" ? owner : opp
        const passes = (s: CardInstance, sPid: PlayerId) =>
            matchesTarget(state, sPid, s, filter, self?.instanceId) &&
            (!content.requireLevelExists || getCard(s.cardId).levels.some((l) => l.level === level))
        const candidates = state.players[pid].field.spirits.filter((s) => passes(s, pid))
        if (
            targetInstanceId === undefined &&
            tryInteractiveTargetChoice(state, owner, self, `${sourceName}：Lv${level}として扱うスピリットを選んでください`, candidates, action, null)
        ) {
            return
        }
        const found = targetInstanceId !== undefined ? findSpiritAny(state, targetInstanceId) : candidates[0] ? { pid, inst: candidates[0] } : null
        if (!found) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        if (!passes(found.inst, found.pid)) {
            log(state, `${sourceName}：対象が条件を満たさなかった。`)
            return
        }
        found.inst.levelOverrideThisTurn = level
        log(state, `${sourceName}：${getCard(found.inst.cardId).name}はこのターンの間Lv${level}として扱われる。`)
        return
    }
    let target: CardInstance | undefined
    if (targetInstanceId !== undefined) {
        target = findSpiritAny(state, targetInstanceId)?.inst
    } else {
        const candidates =
            action.side === "both" ? pickAnySideCandidates(state, owner, () => true, srcColors, srcType) : state.players[owner].field.spirits.slice()
        if (tryInteractiveTargetChoice(state, owner, self, `${sourceName}：Lvを上げるスピリットを選んでください`, candidates, action, null)) return
        target = candidates.reduce<CardInstance | undefined>(
            (best, s) => (!best || effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best),
            undefined,
        )
    }
    if (!target) {
        log(state, `${sourceName}：Lvを上げる対象がいなかった。`)
        return
    }
    const next = Math.min(currentLevel(target).level + (content.up ?? 1), maxLevelOf(target))
    target.levelOverrideThisTurn = next
    log(state, `${sourceName}：${getCard(target.cardId).name}のLvを、このターンの間${next}として扱う。`)
}

const ALL_COLORS: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]

// 1体に色を与える（「〜としても扱う」。個体の tempColors に書く）。色を使う人が選ぶときは、対象を選ぶ→色を選ぶ、の2段階で、
// 選ばれた対象は次の選択の self として持ち回る（選択の再開は targetInstanceId を渡さず chosenOption だけを渡すため）
function placeColor(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect): void {
    const { state, owner, opp, self, sourceName, targetInstanceId, chosenOption } = ctx
    const content = action.content.find((c): c is Extract<Content, { type: "color" }> => c.type === "color")
    if (!content) return
    const give = (target: CardInstance, color: Color) => {
        if (!target.tempColors.includes(color)) target.tempColors.push(color)
        log(state, `${getCard(target.cardId).name}に色「${COLOR_LABELS[color]}」が与えられた（ターン終了時まで）。`)
    }
    if (content.color !== undefined) {
        const target = pickOwnKeywordTarget(state, owner, targetInstanceId)
        if (!target) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        give(target, content.color)
        return
    }
    const askColor = (target: CardInstance) =>
        requestChoice(state, owner, "与える色を選んでください", [], false, action, target, "option", ALL_COLORS.map((c) => COLOR_LABELS[c]))
    if (chosenOption !== undefined) {
        const color = ALL_COLORS.find((c) => COLOR_LABELS[c] === chosenOption)
        if (self && color) give(self, color)
        return
    }
    if (action.target === "self") {
        if (!self) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        askColor(self)
        return
    }
    if (targetInstanceId === undefined) {
        const candidates = (action.side === "both" ? [...state.players.p1.field.spirits, ...state.players.p2.field.spirits] : state.players[action.side === "own" ? owner : opp].field.spirits).map((s) => s.instanceId)
        if (candidates.length === 0) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        requestChoice(state, owner, "色を与える対象のスピリットを選んでください", candidates, false, action, self)
        return
    }
    const target = findSpiritAny(state, targetInstanceId)?.inst
    if (target) askColor(target)
}

// プレイヤーに掛かる制約を置く（ライフが減らない・手札を使えない など）。効くプレイヤーは side（既定は相手）
function placePlayerRule(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect): void {
    const { state, owner, opp, sourceName } = ctx
    if (action.duration !== "turn") {
        log(state, `${sourceName}：「このバトルの間」の制約は未対応のため発揮しなかった。`)
        return
    }
    const pids: PlayerId[] = action.side === "both" ? ["p1", "p2"] : [action.side === "own" ? owner : opp]
    for (const c of action.content) {
        if (c.type !== "playerRule") continue
        for (const pid of pids) state.turnConstraints.push({ ...c.rule, pid } as TurnConstraintDef)
    }
    log(state, `${sourceName}：このターンの間、${pids.map((p) => state.players[p].name).join("と")}に効果が掛かった。`)
}

// 1体を「ブロックされない」にする。期間 battle は次のバトルが終わると消える印（強者統べる大地の「ターンに1回」もこれ）、
// turn はターン終了まで何回アタックしても効く印。対象を選ぶときは自分のスピリットから、非対話は実効BP最大
function placeUnblockable(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect, filter: ResolvedTargetFilter): void {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    const content = action.content.find((c): c is Extract<Content, { type: "unblockable" }> => c.type === "unblockable")
    if (!content) return
    let target: CardInstance | undefined
    if (action.target === "self") {
        if (!self) return
        target = self
    } else {
        const candidates = state.players[owner].field.spirits.filter((s) => matchesTarget(state, owner, s, filter, self?.instanceId))
        if (candidates.length === 0) {
            log(state, `${sourceName}：条件に合う自分のスピリットがいなかった。`)
            return
        }
        if (targetInstanceId === undefined && state.interactiveTargets && candidates.length >= 2) {
            requestChoice(state, owner, `${sourceName}：ブロックされないスピリットを選んでください`, candidates.map((s) => s.instanceId), false, action, self)
            return
        }
        target =
            targetInstanceId !== undefined
                ? candidates.find((s) => s.instanceId === targetInstanceId)
                : candidates.reduce((best, s) => (effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best))
        if (!target) {
            log(state, `${sourceName}：指定されたスピリットは条件を満たさなかった。`)
            return
        }
    }
    const name = getCard(target.cardId).name
    if (content.fromMinBp !== undefined) {
        target.unblockableMinBpThisBattle = content.fromMinBp
        log(state, `${sourceName}：このバトルの間、BP${content.fromMinBp}以上のスピリットからブロックされない。`)
    } else if (action.duration === "battle") {
        target.unblockableOnceThisTurn = true
        log(state, `${sourceName}：${name}は、このターン1回だけ相手のスピリットにブロックされない。`)
    } else {
        target.unblockableThisTurn = true
        log(state, `${sourceName}：${name}は、このターンの間相手のスピリットにブロックされない。`)
    }
}

const timedEffectHandler: ActionHandler<"timedEffect"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    if (action.content.some((c) => c.type === "unblockable")) {
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) return
        placeUnblockable(ctx, action, filter)
        return
    }
    if (action.content.some((c) => c.type === "playerRule")) {
        placePlayerRule(ctx, action)
        return
    }
    if (action.content.some((c) => c.type === "color")) {
        placeColor(ctx, action)
        return
    }
    if (!action.all && action.content.some((c) => c.type === "level")) {
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) return
        placeLevel(ctx, action, filter)
        return
    }
    if (action.content.some((c) => c.type === "keyword")) {
        placeKeyword(ctx, action)
        return
    }
    if (action.target === "self") {
        placeSelfBp(ctx, action)
        return
    }
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
