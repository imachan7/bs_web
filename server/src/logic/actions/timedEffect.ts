// 継続効果を期間つきで置く（ACTION_VOCABULARY §3「期間つきの継続効果」）
import type { ActionHandler, ActionRegistry } from "./types"
import type { AuraCounter, CardInstance, Color, EffectAction, EffectCounter, GameState, PlayerId, ResolvedTargetFilter } from "../../type"
import { currentLevel, getCard, log, suspend } from "../GameState"
import { applyMagicBuffBonus, recordBp, findSpiritAny, pickAnySideCandidates, pickEnemyByBp, pickEnemyCandidates, pickOwnKeywordTarget, recordTimed, refreshLevelAsOverrides, requestChoice, tryInteractiveTargetChoice } from "../EffectModules"
import { KEYWORDS, countAuraCounter, effectiveBp, instBaseCost, instHasColor, isBpBuffSuppressed, matchesTarget } from "../../../../shared/rules"
import { normalizeFilter, SELF_REQUIRED } from "./filter"
import { countedAmount } from "../counted"
import { bothSidesPids } from "../magic/redirect"
import { COLOR_LABELS } from "../../../../data/constants"
import { lastMovedOf, lastTargetsOf } from "../record"

type TimedEffect = Extract<EffectAction, { type: "timedEffect" }>

// 期間 nextRefresh は ONLY_NEXT_REFRESH の内容にしか書けない（ハンドラの入口で落とす）
const ONLY_NEXT_REFRESH = ["skipRefresh", "trashCoreReturnCap"] as const
const bpUntil = (action: TimedEffect): "turn" | "battle" => (action.duration === "battle" ? "battle" : "turn")
type Content = TimedEffect["content"][number]

// 一覧 state.timedEffects に記録する内容（docs/design/TIMED_EFFECTS.md。移し終えたものから増やす）
const RECORDED = ["cantAttack", "cantBlock", "mustAttack", "mustBlock", "canBlockWhileRested", "suppressTrigger", "grantTrigger", "keyword", "color", "level", "symbolAdd", "symbolSet", "symbolLoss", "cost", "unblockable", "triggerSwap", "compareBy", "swapBattleBp", "invertBattleWinner", "noBpCompareDestroy", "battleLock", "playerRule", "bp", "blockCost", "bpAs", "skipRefresh", "untargetableByOpponentMagic", "colorless"] as const
const isRecorded = (c: Content): boolean => (RECORDED as readonly string[]).includes(c.type)

function pushInstanceRecord(state: GameState, owner: PlayerId, inst: CardInstance, content: Content[], until: TimedEffect["duration"]): void {
    recordTimed(state, { content, target: { kind: "instance", instanceId: inst.instanceId }, until, ownerPid: owner })
}

// BP は重ねがけできるので「既に持つ」とは見ない
// 強制アタック・トリガー抑止は、既に掛かっている個体もそのまま選べる（2026-09-25 ユーザー確認）
function has(state: GameState, inst: CardInstance, action: TimedEffect): boolean {
    return action.content.every((c) => {
        if (c.type === "mustAttack" || c.type === "suppressTrigger" || c.type === "bp" || c.type === "bpAs") return false
        if (!isRecorded(c)) return false
        return state.timedEffects.some(
            (r) => r.target.kind === "instance" && r.target.instanceId === inst.instanceId && r.until === action.duration && r.content.some((x) => x.type === c.type),
        )
    })
}

function apply(state: GameState, owner: PlayerId, inst: CardInstance, action: TimedEffect): string {
    const recorded = action.content.filter(isRecorded)
    if (recorded.length > 0) pushInstanceRecord(state, owner, inst, recorded, action.duration)
    if (action.duration === "nextRefresh") return `${getCard(inst.cardId).name}は、次のリフレッシュステップで${contentLabel(action)}。`
    if (action.duration === "firstAttack") return `${getCard(inst.cardId).name}は、このステップの最初に${contentLabel(action)}。`
    const period = action.duration === "turn" ? "このターン" : "このバトル"
    return `${getCard(inst.cardId).name}は、${period}の間${contentLabel(action)}。`
}

function contentLabel(action: TimedEffect): string {
    const cant = action.content.filter((c) => c.type === "cantAttack" || c.type === "cantBlock").map((c) => (c.type === "cantAttack" ? "アタック" : "ブロック"))
    const bp = action.content.flatMap((c) => (c.type === "bp" ? [`BP${c.amount >= 0 ? "+" : ""}${c.amount}${c.amountCounter !== undefined ? "（数に応じて）" : ""}`] : []))
    const must = action.content.some((c) => c.type === "mustAttack") ? ["可能ならば必ずアタックする"] : []
    const suppress = action.content.some((c) => c.type === "suppressTrigger") ? ["効果が発揮されない"] : []
    const rested = action.content.some((c) => c.type === "canBlockWhileRested") ? ["疲労状態でもブロックできる"] : []
    const mustBlock = action.content.some((c) => c.type === "mustBlock") ? ["可能ならばブロックしなければならない"] : []
    const granted = action.content.some((c) => c.type === "grantTrigger") ? ["効果を持つ"] : []
    const keywords = action.content.flatMap((c) => (c.type === "keyword" ? [`【${KEYWORDS[c.keyword].label}】を持つ`] : []))
    const bpAs = action.content.flatMap((c) => (c.type === "bpAs" ? [`Lv${c.levels.join("/")}のBPを${c.amount}として扱う`] : []))
    const colorless = action.content.some((c) => c.type === "colorless") ? ["色を無いものとして扱う"] : []
    const blockCost = action.content.some((c) => c.type === "blockCost") ? ["ブロックするには支払いが要る"] : []
    const skipRefresh = action.content.some((c) => c.type === "skipRefresh") ? ["回復できない"] : []
    const untargetable = action.content.some((c) => c.type === "untargetableByOpponentMagic") ? ["相手のマジックの効果では指定されない"] : []
    return [...bp, ...untargetable, ...(cant.length > 0 ? [`${cant.join("と")}ができない`] : []), ...must, ...suppress, ...rested, ...mustBlock, ...granted, ...keywords, ...bpAs, ...blockCost, ...skipRefresh, ...colorless].join("、")
}

// 全体ルールの「1体につき」は共有層（countAuraCounter）で計算のたびに数えるので、そこで数えられるものだけ受ける
// ponytail: 必要になったカウンタだけ並べている。足すときは countAuraCounter が数えられるか確かめてからここへ
const RULE_COUNTERS = [
    "ownExhausted",
    "ownLife",
    "opponentHand",
    "exhaustedEnemies",
    "targetSymbols",
    "targetBofuCount",
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
// 「すべて」をルールとして置くときの陣営。両陣営は封印された魔導書Lv1で片側に変わりうる（bothSidesPids）。
// 置いた時点の答えをルールに書き込むので、ターン中ずっとその側だけに効く（2026-08-16 ユーザー確認）
function rulePid(ctx: Parameters<ActionHandler<"timedEffect">>[0], side: TimedEffect["side"]): PlayerId | undefined {
    if (side === "both") {
        const sides = bothSidesPids(ctx.state, ctx.srcType)
        return sides.length === 1 ? sides[0] : undefined
    }
    return side === "own" ? ctx.owner : ctx.opp
}

function pickOwnBpTarget(state: GameState, owner: PlayerId, filter: ResolvedTargetFilter, selfInstanceId?: string): CardInstance | null {
    const mine = state.players[owner].field.spirits.filter((s) => matchesTarget(state, owner, s, filter, selfInstanceId))
    if (state.battle) {
        const battling = mine.find((s) => s.instanceId === state.battle?.attackerInstanceId || s.instanceId === state.battle?.blockerInstanceId)
        if (battling) return battling
    }
    return mine[0] ?? null
}

// 1体を指定するBP変更。対象選択の優先順：
// 1.targetInstanceId指定 2.side:"both"かつ対話ならプレイヤーが選ぶ 3.それ以外は自動選択（既定=相手は実効BP最大、own/bothの非対話フォールバックは自分の場から）
function placeBp(ctx: Parameters<ActionHandler<"timedEffect">>[0], inAction: TimedEffect, filter: ResolvedTargetFilter): void {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    // countCounter＝指定する体数を解決時に数える（「指定する体数を+1体する」26RBS02-012）。以降は count の固定値として扱う
    let action = inAction
    if (action.countCounter !== undefined) {
        const { countCounter, ...rest } = action
        const n = countedAmount(state, owner, self, 1, countCounter, srcType)
        action = { ...rest, count: n }
        if (n <= 0) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
    }
    const content = action.content.find((c): c is Extract<Content, { type: "bp" }> => c.type === "bp")
    if (!content) return
    // 「BPを+する効果は発揮されない」（古代闘技場）は発揮する時点でだけ見る（2026-09-24 ユーザー確認）。全体ルール版と同じ判定
    if (content.amount > 0 && isBpBuffSuppressed(state, owner)) {
        log(state, `${sourceName}：BPを+する効果は発揮されなかった。`)
        return
    }
    // 「自分のスピリットN体（まで）を指定する。それらをBP+」：1体ずつ選ぶ（選んだ個体は chosenIds で除く）。
    // ponytail: 「まで」も常に N 体まで選ぶ（BP+ は減らす理由が無い）。途中で止めさせるなら skip 付きの選択にする
    if (action.side === "own" && typeof action.count === "number" && action.count > 1 && content.amountCounter === undefined) {
        const chosen = action.chosenIds ?? []
        const candidates = state.players[owner].field.spirits.filter((s) => !chosen.includes(s.instanceId) && matchesTarget(state, owner, s, filter, self?.instanceId))
        if (targetInstanceId === undefined && tryInteractiveTargetChoice(state, owner, self, `${sourceName}：BPを増加するスピリットを選んでください（残り${action.count - chosen.length}体）`, candidates, action, null)) return
        const t = targetInstanceId !== undefined ? candidates.find((s) => s.instanceId === targetInstanceId) : [...candidates].sort((a, b) => effectiveBp(state, owner, b) - effectiveBp(state, owner, a))[0]
        if (!t) {
            if (chosen.length === 0) log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        recordBp(state, owner, t, content.amount, bpUntil(action))
        log(state, `${getCard(t.cardId).name}はBP+${content.amount}（${action.duration === "battle" ? "このバトルの間" : "ターン終了時まで"}）。`)
        if (chosen.length + 1 < action.count) ctx.resolve({ ...action, chosenIds: [...chosen, t.instanceId] })
        return
    }
    // 「そのスピリットが」の控えは今回のBP増加の結果でなければならない（直前の BP 増加の結果でなければ控えは残さない）
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
    } else if (action.side === "own" && state.interactiveTargets && !filter.lastTarget && !filter.lastBpBuffTarget) {
        // 自分のスピリットが2体以上なら選ばせる（移行で自動選択に落ちていた。2026-10-22 発見）
        const candidates = state.players[owner].field.spirits.filter((s) => matchesTarget(state, owner, s, filter, self?.instanceId))
        if (tryInteractiveTargetChoice(state, owner, self, `${sourceName}：BPを増加するスピリットを選んでください`, candidates, action, null)) return
    }
    if (!target && targetInstanceId === undefined) {
        target =
            action.side === undefined
                ? pickEnemyByBp(state, opp, Infinity, (s) => matchesTarget(state, opp, s, filter, self?.instanceId), srcColors, srcType)
                : pickOwnBpTarget(state, owner, filter, self?.instanceId)
        // 自動で選ぶときは自分のスピリットを優先し、いなければ相手のスピリットから選ぶ
        if (!target && action.side === "both") {
            target = pickAnySideCandidates(state, owner, (s) => matchesTarget(state, owner, s, filter, self?.instanceId), srcColors, srcType)[0] ?? null
        }
    }
    if (!target) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    state.lastBpBuffTargetId = target.instanceId
    // bp と同じ timedEffect に並んだ色つきシンボル追加は、BP を上げる個体と同じ個体に付く
    for (const c of action.content) {
        if (c.type !== "symbolAdd" || !c.color) continue
        recordTimed(state, { content: [c], target: { kind: "instance", instanceId: target.instanceId }, until: action.duration, ownerPid: owner })
        log(state, `${getCard(target.cardId).name}は${COLOR_LABELS[c.color]}のシンボルを${c.count ?? 1}つ追加した（${action.duration === "battle" ? "このバトルの間" : "ターン終了時まで"}）。`)
    }
    const untilLabel = action.duration === "battle" ? "このバトルの間" : "ターン終了時まで"
    if (content.amountCounter === undefined) {
        recordBp(state, owner, target, content.amount, bpUntil(action))
        log(state, `${getCard(target.cardId).name}はBP+${content.amount}（${untilLabel}）。`)
        applyMagicBuffBonus(state, target, srcType, srcColors)
        return
    }
    // 解決時に数えて固定する：countOnce と、共有層で数えられない数え方（数え直せない）
    if (content.countOnce || !isAllowedRuleCounter(content.amountCounter)) {
        const amount = countedAmount(state, owner, self, content.amount, content.amountCounter, srcType, undefined, target)
        if (amount === 0) {
            log(state, `${sourceName}：カウントが0のため増加しなかった。`)
            return
        }
        recordBp(state, owner, target, amount, bpUntil(action))
        log(state, `${getCard(target.cardId).name}はBP+${amount}（${untilLabel}）。`)
        applyMagicBuffBonus(state, target, srcType, srcColors)
        return
    }
    // 量が可変（amountCounter あり）：「1体につき」の数は計算のたびに数え直す（timedRuleBp。2026-09-24 ユーザー確認）。解決時に0でも置く
    recordTimed(state, { content: [content], target: { kind: "instance", instanceId: target.instanceId }, until: action.duration, ownerPid: owner })
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
    const addBp = (amount: number) => recordBp(state, owner, self, amount, bpUntil(action))
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
    // 可変：量は判定のたびに数え直す（2026-09-24 ユーザー確認）。解決時に0でも置く
    recordTimed(state, { content: [content], target: { kind: "instance", instanceId: self.instanceId }, until: action.duration, ownerPid: owner })
    const preview = content.amount * countAuraCounter(state, owner, content.amountCounter as AuraCounter, self)
    log(state, `${getCard(self.cardId).name}はBP+${preview}（${untilLabel}、数に応じて増減）。`)
}

// 直前に BP を上げた個体へ足す。量は解決時に数えて固定する（lastCores は取り除いた直後にしか数えられない）
function placeLastBuffed(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect): void {
    const { state, owner, self, sourceName, srcType } = ctx
    const content = action.content.find((c): c is Extract<Content, { type: "bp" }> => c.type === "bp")
    const found = state.lastBpBuffTargetId !== undefined ? findSpiritAny(state, state.lastBpBuffTargetId) : null
    if (!content || !found) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    const amount = content.amountCounter !== undefined ? countedAmount(state, owner, self, content.amount, content.amountCounter, srcType, undefined, found.inst) : content.amount
    if (amount === 0) {
        log(state, `${sourceName}：カウントが0のため増加しなかった。`)
        return
    }
    recordBp(state, owner, found.inst, amount, bpUntil(action))
    log(state, `${getCard(found.inst.cardId).name}はさらにBP+${amount}（${action.duration === "battle" ? "このバトルの間" : "ターン終了時まで"}）。`)
}

// target:"lastTargets"：直前の効果が実際に対象にした個体それぞれに置く（「この効果で回復したスピリットは〜」）。
// all と違ってルールにしないので、後から場に出たスピリットには効かない。filter はいま判定する
function placeLastTargets(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect): void {
    const { state, owner, self, sourceName } = ctx
    const { lastTarget: _lt, ...rest } = action.filter ?? {}
    const filter = rest as unknown as ResolvedTargetFilter
    let n = 0
    for (const id of lastTargetsOf(state)) {
        const found = findSpiritAny(state, id)
        if (!found || !matchesTarget(state, found.pid, found.inst, filter, self?.instanceId)) continue
        for (const c of action.content) {
            if (c.type === "bp") recordBp(state, owner, found.inst, c.amount, bpUntil(action))
            else recordTimed(state, { content: [c], target: { kind: "instance", instanceId: found.inst.instanceId }, until: action.duration, ownerPid: owner })
        }
        n++
    }
    if (n === 0) log(state, `${sourceName}：対象がいなかった。`)
}

// all:true：個体を選ばず、条件をルールとして置く（判定は shared/rules.ts の cantActByTimedRule）
function placeRule(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect, filter: ResolvedTargetFilter): void {
    const { state, owner, opp, self, sourceName } = ctx
    const skipOnly = action.duration === "nextRefresh" && action.content.every((c) => c.type === "skipRefresh")
    // バトル期間のルールとして置けるのは Lv の置き換えだけ（ほかの content は期間切れの扱いを確かめていない）
    if (action.duration !== "turn" && !skipOnly && !action.content.some((c) => c.type === "level")) {
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
    const pid = rulePid(ctx, action.side)
    // 寿命 nextRefresh の記録はプレイヤーごとのリフレッシュで使い切るので、お互いに掛けるものは置けない
    if (skipOnly && pid === undefined) {
        log(state, `${sourceName}：お互いの「次のリフレッシュステップで回復できない」は未対応のため発揮しなかった。`)
        return
    }
    if (action.content.some((c) => c.type === "level")) {
        recordTimed(state, {
            content: action.content,
            target: { kind: "rule", ...(pid !== undefined ? { pid } : {}), filter, ...(self ? { selfInstanceId: self.instanceId } : {}) },
            until: bpUntil(action),
            ownerPid: owner,
        })
        const who = pid === undefined ? "お互いの" : `${state.players[pid].name}の`
        const lv = action.content.find((c): c is Extract<Content, { type: "level" }> => c.type === "level")!
        log(state, `${sourceName}：${action.duration === "battle" ? "このバトルの間" : "このターンの間"}、${who}スピリットすべてを${lv.max ? "最高Lv" : `Lv${lv.set}`}として扱う。`)
        return
    }
    recordTimed(state, {
        content: action.content,
        target: { kind: "rule", ...(pid !== undefined ? { pid } : {}), filter, ...(self ? { selfInstanceId: self.instanceId } : {}) },
        until: action.duration,
        ownerPid: owner,
    })
    const who = pid === undefined ? "" : `${state.players[pid].name}の`
    if (skipOnly) {
        log(state, `${sourceName}：${who}スピリットすべては、次のリフレッシュステップで回復できない。`)
        return
    }
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
    pushInstanceRecord(state, owner, target, [content], "turn")
    log(state, `${getCard(target.cardId).name}に【${KEYWORDS[content.keyword].label}】を付与した。`)
}

// 1体の Lv を「このターンの間」として扱う。自動選択は旧 type のまま2通り（set＝候補の先頭、up＝実効BP最大）
function placeLevel(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect, filter: ResolvedTargetFilter): void {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const content = action.content.find((c): c is Extract<Content, { type: "level" }> => c.type === "level")
    if (!content) return
    // 「このバトル中、Lv◯として扱う」(set) は期間を battle で記録する。上げる(up)はターン限定
    if (action.duration !== "turn" && !(action.duration === "battle" && (content.set !== undefined || content.max === true))) {
        log(state, `${sourceName}：「このバトルの間」Lvを変える効果は未対応のため発揮しなかった。`)
        return
    }
    const until = action.duration === "battle" ? "battle" : "turn"
    const maxLevelOf = (s: CardInstance) => getCard(s.cardId).levels.reduce((m, l) => Math.max(m, l.level), 1)
    if (content.set !== undefined || content.max === true) {
        // max＝そのスピリットのカードの最高Lv（個体ごとに違うので、選んだ個体で決める）
        const levelOf = (s: CardInstance) => content.max ? maxLevelOf(s) : content.set!
        const pids: PlayerId[] = action.side === "own" ? [owner] : action.side === "both" ? [owner, opp] : [opp]
        const passes = (s: CardInstance, sPid: PlayerId) =>
            matchesTarget(state, sPid, s, filter, self?.instanceId) &&
            (!content.requireLevelExists || getCard(s.cardId).levels.some((l) => l.level === levelOf(s)))
        const candidates = pids.flatMap((p) => state.players[p].field.spirits.filter((s) => passes(s, p)))
        if (
            targetInstanceId === undefined &&
            tryInteractiveTargetChoice(state, owner, self, `${sourceName}：${content.max ? "最高Lv" : `Lv${content.set}`}として扱うスピリットを選んでください`, candidates, action, null)
        ) {
            return
        }
        const found = findSpiritAny(state, targetInstanceId ?? candidates[0]?.instanceId ?? "")
        if (!found) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        if (!passes(found.inst, found.pid)) {
            log(state, `${sourceName}：対象が条件を満たさなかった。`)
            return
        }
        const level = levelOf(found.inst)
        recordTimed(state, { content: [{ type: "level", set: level }], target: { kind: "instance", instanceId: found.inst.instanceId }, until, ownerPid: owner })
        log(state, `${sourceName}：${getCard(found.inst.cardId).name}はこの${until === "battle" ? "バトル" : "ターン"}の間Lv${level}として扱われる。`)
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
    recordTimed(state, { content: [{ type: "level", set: next }], target: { kind: "instance", instanceId: target.instanceId }, until: "turn", ownerPid: owner })
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
        recordTimed(state, { content: [{ type: "color", color }], target: { kind: "instance", instanceId: target.instanceId }, until: "turn", ownerPid: owner })
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

// bannedColors:"last" を、直前に動いたカード（lastMovedOf）の色の和集合へ解決する
// （多色なら全色＝どれか1色でも一致すれば「同じ色」。記録が空なら null）
function resolvePlayerRuleContent(state: GameState, c: Extract<Content, { type: "playerRule" }>): Extract<Content, { type: "playerRule" }> | null {
    if (c.rule.type === "cantUseMagicForPid" && c.rule.colors === "event") {
        const colors = [...new Set(state.burstEventColors ?? [])]
        return colors.length === 0 ? null : { ...c, rule: { ...c.rule, colors } }
    }
    if (c.rule.type !== "cantUseHandCardsForPid" || c.rule.bannedColors !== "last") return c
    const colors = [...new Set(lastMovedOf(state).flatMap((id) => getCard(id).colors))]
    if (colors.length === 0) return null
    return { ...c, rule: { ...c.rule, bannedColors: colors } }
}

// プレイヤーに掛かる制約を置く（ライフが減らない・手札を使えない など）。効くプレイヤーは side（既定は相手）
function placePlayerRule(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect): void {
    const { state, owner, opp, sourceName } = ctx
    if (action.duration !== "turn" && action.duration !== "battle" && action.duration !== "beforeBlock" && !(action.duration === "nextRefresh" && action.content.every((c) => c.type === "playerRule" && c.rule.type === "skipMainStep"))) {
        log(state, `${sourceName}：この期間の制約は未対応のため発揮しなかった。`)
        return
    }
    const pids: PlayerId[] = action.side === "both" ? bothSidesPids(state, ctx.srcType) : [action.side === "own" ? owner : opp]
    const rules = action.content
        .filter((c): c is Extract<Content, { type: "playerRule" }> => c.type === "playerRule")
        .map((c) => resolvePlayerRuleContent(state, c))
        .filter((c): c is Extract<Content, { type: "playerRule" }> => c !== null)
        .map((c) => (c.rule.type === "effectTaxForPid" && c.rule.source === undefined ? { ...c, rule: { ...c.rule, source: sourceName } } : c))
    if (rules.length === 0) return
    for (const pid of pids) recordTimed(state, { content: rules, target: { kind: "player", pid }, until: action.duration, ownerPid: owner })
    const period = action.duration === "battle" ? "このバトルの間" : action.duration === "beforeBlock" ? "ブロック前のフラッシュタイミングの間" : action.duration === "nextRefresh" ? "次のターンの間" : "このターンの間"
    log(state, `${sourceName}：${period}、${pids.map((p) => state.players[p].name).join("と")}に効果が掛かった。`)
}

// 「ブロックされない」を置く。期間 battle で from なしは強者統べる大地の「ターンに1回」＝そのスピリットのアタックの終了で消える（until:"attack"）。
// すべて（all）は自分のスピリットすべてに掛かる記録。1体は自分のスピリットから選び、非対話は実効BP最大
function placeUnblockable(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect, filter: ResolvedTargetFilter): void {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    const found = action.content.find((c): c is Extract<Content, { type: "unblockable" }> => c.type === "unblockable")
    if (!found) return
    const { fromMaxBpSelf, ...rest } = found
    if (fromMaxBpSelf && !self) return
    const content: typeof found = fromMaxBpSelf && self ? { ...rest, from: { ...rest.from, maxBp: effectiveBp(state, owner, self) } } : rest
    const until = action.duration === "battle" && content.from === undefined ? "attack" : action.duration
    const period = until === "attack" ? "このターン1回だけ" : action.duration === "turn" ? "このターンの間" : "このバトルの間"
    const fromLabel = content.from === undefined ? "相手のスピリット" : "条件に合う相手のスピリット"
    if (action.all) {
        recordTimed(state, { content: [content], target: { kind: "rule", pid: owner, filter, ...(self ? { selfInstanceId: self.instanceId } : {}) }, until, ownerPid: owner })
        log(state, `${sourceName}：${period}、自分のスピリットすべては${fromLabel}にブロックされない。`)
        return
    }
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
    recordTimed(state, { content: [content], target: { kind: "instance", instanceId: target.instanceId }, until, ownerPid: owner })
    log(state, `${sourceName}：${getCard(target.cardId).name}は、${period}${fromLabel}にブロックされない。`)
}

// このバトルの間、プレイヤーに掛ける（フラッシュで手札を使えない／バーストを発動できない）
function placeBattleLock(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect): void {
    const { state, owner, opp, sourceName } = ctx
    if (!state.battle) {
        log(state, `${sourceName}：バトルが発生していないため使用できなかった。`)
        return
    }
    if (action.duration !== "battle" || action.side === "both") {
        log(state, `${sourceName}：この期間・陣営の指定は未対応のため発揮しなかった。`)
        return
    }
    const pid = action.side === "own" ? owner : opp
    const locks = action.content.filter((c) => c.type === "battleLock")
    recordTimed(state, { content: locks, target: { kind: "player", pid }, until: "battle", ownerPid: owner })
    for (const c of locks) {
        if (c.lock === "flash") log(state, `${sourceName}：このバトルの間、${state.players[pid].name}はフラッシュで手札のカードを使用できない。`)
        else log(state, `${sourceName}：このバトルの間、${state.players[pid].name}はバーストを発動できない。`)
    }
}

// 自分のスピリット1体に置く（疲労状態でもブロックできる・誘発効果を与える）。対話なら選ばせ、非対話は実効BP最大
function placeOwnOne(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect, filter: ResolvedTargetFilter): void {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    if (action.duration === "turn" && action.target === "self") {
        if (!self) return
        pushInstanceRecord(state, owner, self, action.content.filter(isRecorded), action.duration)
        log(state, `${sourceName}：このターンの間、${getCard(self.cardId).name}に効果を付与した。`)
        return
    }
    // 相手のスピリット1体を「このバトル中、疲労状態でもブロックできる」にする（26RBS01-109/X01）。相手側は耐性を通す
    const enemy = action.side === undefined && action.content.every((c) => c.type === "canBlockWhileRested" || c.type === "mustBlock")
    const okDuration = action.duration === "turn" || (action.duration === "battle" && (enemy || action.content.some((c) => c.type === "grantTrigger" || c.type === "untargetableByOpponentMagic")))
    if (!okDuration || (action.side !== "own" && !enemy)) {
        log(state, `${sourceName}：この期間・陣営の指定は未対応のため発揮しなかった。`)
        return
    }
    const candidates = enemy
        ? pickEnemyCandidates(state, ctx.opp, Infinity, (s) => matchesTarget(state, ctx.opp, s, filter, self?.instanceId), ctx.srcColors, ctx.srcType)
        : state.players[owner].field.spirits.filter((s) => matchesTarget(state, owner, s, filter, self?.instanceId))
    if (candidates.length === 0) {
        log(state, `${sourceName}：対象のスピリットがいなかった。`)
        return
    }
    const prompt = action.content.some((c) => c.type === "grantTrigger" || c.type === "untargetableByOpponentMagic" || c.type === "noBpCompareDestroy") ? "効果を付与する" : "疲労状態でブロックできるようにする"
    if (
        targetInstanceId === undefined &&
        tryInteractiveTargetChoice(state, owner, self, `${sourceName}：${prompt}スピリットを選んでください`, candidates, action, null)
    ) {
        return
    }
    const target =
        (targetInstanceId !== undefined && candidates.find((s) => s.instanceId === targetInstanceId)) ||
        candidates.reduce((best, s) => (effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best))
    const name = getCard(target.cardId).name
    pushInstanceRecord(state, owner, target, action.content.filter(isRecorded), action.duration)
    for (const c of action.content) {
        if (c.type === "canBlockWhileRested") log(state, `${sourceName}：${action.duration === "battle" ? "このバトルの間" : "このターンの間"}、${name}は疲労状態でもブロックできる。`)
        else if (c.type === "mustBlock") log(state, `${sourceName}：このバトルの間、${name}は可能ならばブロックしなければならない。`)
        else if (c.type === "grantTrigger" || c.type === "untargetableByOpponentMagic" || c.type === "noBpCompareDestroy") log(state, `${sourceName}：${action.duration === "battle" ? "このバトルの間" : "このターンの間"}、${name}に効果を付与した。`)
    }
}

// 陣営の指定トリガーすべてを発揮させない（そのプレイヤーに掛かる記録）。絞り込みは持たない
function placeTriggerSuppressionRule(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect): void {
    const { state, owner, opp, sourceName } = ctx
    if (action.duration !== "turn" || action.filter !== undefined) {
        log(state, `${sourceName}：この期間・絞り込みの指定は未対応のため発揮しなかった。`)
        return
    }
    const pids: PlayerId[] = action.side === "both" ? bothSidesPids(state, ctx.srcType) : [action.side === "own" ? owner : opp]
    for (const pid of pids) recordTimed(state, { content: action.content, target: { kind: "player", pid }, until: "turn", ownerPid: owner })
    const who = action.side === "both" ? "お互い" : state.players[pids[0]!].name
    log(state, `${sourceName}：このターンの間、${who}のスピリットの誘発効果は発揮されない。`)
}

// このバトルの解決方法を変える（一覧の target.kind:"battle"）
function placeBattleCompare(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect): void {
    const { state, owner, sourceName } = ctx
    if (!state.battle) {
        log(state, `${sourceName}：バトル外のため不発。`)
        return
    }
    const usedInBattle = [state.battle.attackerInstanceId, state.battle.blockerInstanceId].some((id) => id !== null && state.players[owner].field.spirits.some((sp) => sp.instanceId === id))
    const contents = action.content.filter((c) => c.type !== "swapBattleBp" || usedInBattle).filter((c) => c.type === "compareBy" || c.type === "swapBattleBp" || c.type === "invertBattleWinner" || c.type === "restedNexusEffectsDisabled")
    recordTimed(state, { content: contents, target: { kind: "battle" }, until: "battle", ownerPid: owner })
    const label = { level: "Lv", cores: "コアの数", cost: "コスト" }
    for (const c of contents) {
        if (c.type === "compareBy") {
            log(state, `${sourceName}：バトル解決時、BPの代わりに${label[c.by]}を比較する。`)
        } else if (c.type === "swapBattleBp") {
            log(state, `${sourceName}：このバトルの間、BPを比べるとき、バトルしている2体のBPを入れ替える。`)
        } else if (c.type === "restedNexusEffectsDisabled") {
            log(state, `${sourceName}：このバトルの間、疲労状態のネクサスすべての効果は発揮されない。`)
        } else {
            log(state, `${sourceName}：バトル解決時、BPの高い方が破壊される。`)
        }
    }
}

// 1体のシンボル・コストを変える。対象の決め方は旧 type のまま（symbolAdd＝陣営を問わず実効BP最大、cost＝自分のスピリットから、
// symbolSet＝filter に合う自分のスピリットでバトル中の個体優先）
function placeSymbolOrCost(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect, filter: ResolvedTargetFilter): void {
    const { state, owner, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const content = action.content.find((c): c is Extract<Content, { type: "symbolAdd" | "symbolSet" | "cost" }> =>
        c.type === "symbolAdd" || c.type === "symbolSet" || c.type === "cost")
    if (!content) return
    if (content.type === "symbolAdd" && content.color && action.target === "self") {
        // 発生源自身（ネクサスでもよい。26RBS01-105「このターン中、このネクサスに黄シンボル1つを追加する」）
        if (!self) {
            log(state, `${sourceName}：シンボルを追加する対象がいなかった。`)
            return
        }
        recordTimed(state, { content: [content], target: { kind: "instance", instanceId: self.instanceId }, until: "turn", ownerPid: owner })
        log(state, `${sourceName}：${getCard(self.cardId).name}に、このターンの間${content.color}シンボル${content.count ?? 1}つを追加した。`)
        return
    }
    if (content.type === "symbolAdd" && content.color) {
        // count 体に1体ずつ（選んだ個体は chosenIds で除く）
        const total = typeof action.count === "number" ? action.count : 1
        const chosen = action.chosenIds ?? []
        const candidates = state.players[owner].field.spirits.filter((s) => !chosen.includes(s.instanceId) && matchesTarget(state, owner, s, filter, self?.instanceId))
        if (targetInstanceId === undefined && tryInteractiveTargetChoice(state, owner, self, `${sourceName}：シンボルを追加するスピリットを選んでください`, candidates, action, null)) return
        const target = targetInstanceId !== undefined ? candidates.find((s) => s.instanceId === targetInstanceId) : candidates[0]
        if (!target) {
            log(state, `${sourceName}：シンボルを追加する対象がいなかった。`)
            return
        }
        recordTimed(state, { content: [content], target: { kind: "instance", instanceId: target.instanceId }, until: "turn", ownerPid: owner })
        log(state, `${sourceName}：${getCard(target.cardId).name}に、このターンの間${content.color}シンボル${content.count ?? 1}つを追加した。`)
        if (chosen.length + 1 < total) ctx.resolve({ ...action, chosenIds: [...chosen, target.instanceId] })
        return
    }
    if (content.type === "symbolAdd") {
        let target: CardInstance | undefined
        if (targetInstanceId !== undefined) target = findSpiritAny(state, targetInstanceId)?.inst
        else {
            const candidates =
                action.side === "both" ? pickAnySideCandidates(state, owner, () => true, srcColors, srcType) : state.players[owner].field.spirits.slice()
            if (tryInteractiveTargetChoice(state, owner, self, `${sourceName}：シンボルを追加するスピリットを選んでください`, candidates, action, null)) return
            target = candidates.reduce<CardInstance | undefined>(
                (best, s) => (!best || effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best),
                undefined,
            )
        }
        if (!target) {
            log(state, `${sourceName}：シンボルを追加する対象がいなかった。`)
            return
        }
        recordTimed(state, { content: [{ type: "symbolAdd" }], target: { kind: "instance", instanceId: target.instanceId }, until: "turn", ownerPid: owner })
        log(state, `${sourceName}：${getCard(target.cardId).name}に、このターンの間シンボル1つを追加した。`)
        return
    }
    if (content.type === "cost") {
        if (
            targetInstanceId === undefined &&
            tryInteractiveTargetChoice(state, owner, self, `${sourceName}：コストを変えるスピリットを選んでください`, state.players[owner].field.spirits, action, null)
        ) {
            return
        }
        const target = pickOwnKeywordTarget(state, owner, targetInstanceId)
        if (!target) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        recordTimed(state, { content: [content], target: { kind: "instance", instanceId: target.instanceId }, until: "turn", ownerPid: owner })
        log(state, `${getCard(target.cardId).name}は、このターンの間コスト${instBaseCost(target)}になる。（コスト${content.amount >= 0 ? "+" : ""}${content.amount}）`)
        return
    }
    let target: CardInstance | null = null
    if (targetInstanceId !== undefined) {
        const found = findSpiritAny(state, targetInstanceId)
        if (found && matchesTarget(state, found.pid, found.inst, filter, self?.instanceId)) target = found.inst
    } else target = pickOwnBpTarget(state, owner, filter, self?.instanceId)
    if (!target) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    recordTimed(state, { content: [content], target: { kind: "instance", instanceId: target.instanceId }, until: "battle", ownerPid: owner })
    log(state, `${getCard(target.cardId).name}は、このバトルの間シンボルを${content.color ? COLOR_LABELS[content.color] : ""}${content.count}つとして扱う。`)
}

// 「色1色を指定できる」＝色を選ばずに終えられる（2026-10-11 ユーザー確認）。選ばなければ何もしない
const NO_COLOR = "指定しない"

// 「このターンの間、〜のスピリットすべては指定した色のシンボル1つを失う」。色を使う人が選ぶときは選んでからルールを置く。
// 非対話は相手のフィールドに最も多い色（旧 grantSymbolLossThisTurn と同じ）
function placeSymbolLossRule(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect, filter: ResolvedTargetFilter): void {
    const { state, owner, opp, self, sourceName, chosenOption } = ctx
    const content = action.content.find((c): c is Extract<Content, { type: "symbolLoss" }> => c.type === "symbolLoss")
    if (!content) return
    const pid = rulePid(ctx, action.side)
    let color = content.color
    if (color === undefined) {
        if (state.interactiveTargets) {
            if (chosenOption === undefined) {
                requestChoice(state, owner, "指定する色を選んでください", [], false, action, null, "option", [...ALL_COLORS.map((c) => COLOR_LABELS[c]), ...(action.colorOptional ? [NO_COLOR] : [])])
                return
            }
            color = ALL_COLORS.find((c) => COLOR_LABELS[c] === chosenOption)
            if (color === undefined) {
                if (chosenOption === NO_COLOR) log(state, `${sourceName}：色を指定しなかった。`)
                return
            }
        } else {
            const targets = pid === undefined ? [...state.players.p1.field.spirits, ...state.players.p2.field.spirits] : state.players[pid].field.spirits
            const counts = ALL_COLORS.map((c) => [c, targets.filter((sp) => instHasColor(sp, c)).length] as const)
            color = counts.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
        }
    }
    recordTimed(state, {
        content: [{ type: "symbolLoss", color }],
        target: { kind: "rule", ...(pid !== undefined ? { pid } : {}), filter, ...(self ? { selfInstanceId: self.instanceId } : {}) },
        until: action.duration === "step" ? "step" : "turn",
        ownerPid: owner,
    })
    const who = pid === undefined ? "お互いの" : `${state.players[pid].name}の`
    log(state, `${sourceName}：色「${COLOR_LABELS[color]}」を指定した。${action.duration === "step" ? "このステップ" : "このターン"}の間、${who}スピリットすべてはそのシンボル1つを失う。`)
}

// アタック時⇔ブロック時の効果の付け替え。「すべて」は置き場が判定のたびに見られるので後から出たスピリットにも効く
function placeTriggerSwap(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect): void {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    const content = action.content.find((c): c is Extract<Content, { type: "triggerSwap" }> => c.type === "triggerSwap")
    if (!content) return
    const fromLabel = content.from === "onAttack" ? "アタック時" : "ブロック時"
    const toLabel = content.from === "onAttack" ? "ブロック時" : "アタック時"
    if (action.all) {
        if (content.from !== "onBlock") {
            log(state, `${sourceName}：この付け替えは未対応のため発揮しなかった。`)
            return
        }
        const pid = action.side === "both" ? rulePid(ctx, "both") : owner
        recordTimed(state, { content: [content], target: { kind: "rule", ...(pid !== undefined ? { pid } : {}), filter: {} }, until: "turn", ownerPid: owner })
        const who = pid === undefined ? "お互いの" : `${state.players[owner].name}の`
        log(state, `${sourceName}：このターンの間、${who}スピリットの『ブロック時』効果は『アタック時』に発揮される。`)
        return
    }
    // ブロック時→アタック時は『ブロック時』効果を持つスピリットだけが候補で、候補が2体以上なら選ばせる（旧と同じ）
    const mine =
        content.from === "onBlock"
            ? state.players[owner].field.spirits.filter((s) => getCard(s.cardId).effects.some((e) => e.kind === "triggered" && e.trigger === "onBlock"))
            : state.players[owner].field.spirits
    if (
        content.from === "onBlock" &&
        targetInstanceId === undefined &&
        tryInteractiveTargetChoice(state, owner, self, `${sourceName}：『ブロック時』効果を『アタック時』に変えるスピリットを選んでください`, mine, action, null)
    ) {
        return
    }
    const target =
        targetInstanceId !== undefined
            ? mine.find((s) => s.instanceId === targetInstanceId)
            : mine.reduce<CardInstance | undefined>((best, s) => (!best || effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best), undefined)
    if (!target) {
        log(state, `${sourceName}：${content.from === "onBlock" ? "『ブロック時』効果を持つ" : "対象の"}自分のスピリットがいなかった。`)
        return
    }
    recordTimed(state, { content: [content], target: { kind: "instance", instanceId: target.instanceId }, until: "turn", ownerPid: owner })
    log(state, `${sourceName}：このターンの間、${getCard(target.cardId).name}の『${fromLabel}』効果は『${toLabel}』に発揮される。`)
}

// 「次の相手のリフレッシュステップで、トラッシュのコアを◯個しか戻せない」：そのプレイヤーに掛かる記録
function placeTrashCoreReturnCap(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect): void {
    const { state, owner, opp, sourceName } = ctx
    const content = action.content.find((c): c is Extract<Content, { type: "trashCoreReturnCap" }> => c.type === "trashCoreReturnCap")
    if (!content) return
    if (action.duration !== "nextRefresh") {
        log(state, `${sourceName}：この期間の指定は未対応のため発揮しなかった。`)
        return
    }
    const pids: PlayerId[] = action.side === "both" ? bothSidesPids(state, ctx.srcType) : [action.side === "own" ? owner : opp]
    for (const pid of pids) {
        recordTimed(state, { content: [content], target: { kind: "player", pid }, until: "nextRefresh", ownerPid: owner })
        log(state, `${sourceName}：次の${state.players[pid].name}のリフレッシュステップでは、トラッシュのコアは${content.max}個までしかリザーブに戻せない。`)
    }
}

const timedEffectHandler: ActionHandler<"timedEffect"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    if ((action.duration === "nextRefresh") !== action.content.every((c) => (ONLY_NEXT_REFRESH as readonly string[]).includes(c.type) || (c.type === "playerRule" && c.rule.type === "skipMainStep"))) {
        log(state, `${sourceName}：この期間と内容の組み合わせは未対応のため発揮しなかった。`)
        return
    }
    // 「このステップ中」はシンボル喪失のルールだけ対応（2026-10-11 ユーザー確認）
    if (action.duration === "step" && !action.content.every((c) => c.type === "symbolLoss")) {
        log(state, `${sourceName}：この期間と内容の組み合わせは未対応のため発揮しなかった。`)
        return
    }
    if (action.content.some((c) => c.type === "trashCoreReturnCap")) {
        placeTrashCoreReturnCap(ctx, action)
        return
    }
    if (action.content.some((c) => c.type === "triggerSwap")) {
        placeTriggerSwap(ctx, action)
        return
    }
    if (!action.content.some((c) => c.type === "bp") && action.content.some((c) => c.type === "symbolAdd" || c.type === "symbolSet" || c.type === "cost" || c.type === "symbolLoss")) {
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) return
        if (action.all && action.content.some((c) => c.type === "symbolLoss")) placeSymbolLossRule(ctx, action, filter)
        else placeSymbolOrCost(ctx, action, filter)
        return
    }
    // 「このターン中、〜のスピリットすべてに“誘発”を与える」＝rule 記録（誘発の側が判定のたびに照合するので、後から出たスピリットにも付く）。
    // 見出しのステップ限定を持つ付与は effectGrant で書く
    if (action.all && action.content.some((c) => c.type === "grantTrigger")) {
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) return
        if (action.duration !== "turn" || action.side !== "own") {
            log(state, `${sourceName}：この期間・陣営の指定は未対応のため発揮しなかった。`)
            return
        }
        recordTimed(state, { content: action.content.filter((c) => c.type === "grantTrigger"), target: { kind: "rule", pid: owner, filter, ...(self ? { selfInstanceId: self.instanceId } : {}) }, until: "turn", ownerPid: owner })
        log(state, `${sourceName}：このターンの間、条件に合う自分のスピリットすべてに効果を付与した。`)
        return
    }
    if (!action.all && action.content.some((c) => c.type === "canBlockWhileRested" || c.type === "grantTrigger" || c.type === "untargetableByOpponentMagic" || (c.type === "noBpCompareDestroy" && action.target !== "self"))) {
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) return
        placeOwnOne(ctx, action, filter)
        return
    }
    if (action.all && action.content.some((c) => c.type === "suppressTrigger")) {
        placeTriggerSuppressionRule(ctx, action)
        return
    }
    if (action.content.some((c) => c.type === "compareBy" || c.type === "swapBattleBp" || c.type === "invertBattleWinner" || c.type === "restedNexusEffectsDisabled")) {
        placeBattleCompare(ctx, action)
        return
    }
    if (action.content.some((c) => c.type === "battleLock")) {
        placeBattleLock(ctx, action)
        return
    }
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
    if (!action.all && action.content.some((c) => c.type === "color")) {
        placeColor(ctx, action)
        return
    }
    if (!action.all && action.content.some((c) => c.type === "level")) {
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) return
        placeLevel(ctx, action, filter)
        return
    }
    if (!action.all && action.content.some((c) => c.type === "keyword")) {
        placeKeyword(ctx, action)
        return
    }
    if (action.target === "lastBuffed") {
        placeLastBuffed(ctx, action)
        return
    }
    if (action.target === "lastTargets") {
        placeLastTargets(ctx, action)
        return
    }
    if (action.target === "self" && !action.content.some((c) => c.type === "bp")) {
        if (!self) return
        log(state, apply(state, owner, self, action))
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
        (s) => !has(state, s, action) && matchesTarget(state, opp, s, filter, self?.instanceId),
        srcColors,
        srcType,
    )
    if (action.count === "any") {
        placeAny(ctx, action, candidates)
        return
    }
    // 選択の再開：1体ぶんの action（count:1）が選ばれた個体つきで戻ってくる
    if (targetInstanceId !== undefined) {
        const found = candidates.find((s) => s.instanceId === targetInstanceId)
        log(state, found ? apply(state, owner, found, action) : `${sourceName}：対象がいなかった。`)
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
    for (const s of picked) log(state, apply(state, owner, s, action))
}

// 「好きなだけ指定する」：候補を押すたびに選ぶ／外すを切り替え、確定で掛ける。非対話は候補すべてに掛ける
function placeAny(ctx: Parameters<ActionHandler<"timedEffect">>[0], action: TimedEffect, candidates: CardInstance[]): void {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    const ids = candidates.map((s) => s.instanceId)
    let chosen = (action.chosenIds ?? []).filter((id) => ids.includes(id))
    if (action.choosing && targetInstanceId !== undefined) {
        chosen = chosen.includes(targetInstanceId) ? chosen.filter((id) => id !== targetInstanceId) : [...chosen, targetInstanceId]
    }
    if (!state.interactiveTargets) {
        chosen = ids
    } else if (!(action.choosing && targetInstanceId === undefined) && candidates.length > 0) {
        suspend(state, {
            pid: owner,
            kind: "target",
            prompt: `${sourceName}：${contentLabel(action)}ようにする相手のスピリットを選んでください（選んだものをもう一度押すと外れます）`,
            candidates: ids,
            selectedIds: chosen,
            skipLabel: chosen.length > 0 ? `これで確定する（${chosen.length}体）` : "指定しない",
            optional: true,
            resolveOnSkip: true,
            action: { ...action, choosing: true, chosenIds: chosen },
            selfInstanceId: self ? self.instanceId : null,
        })
        return
    }
    if (chosen.length === 0) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    for (const id of chosen) log(state, apply(state, owner, candidates.find((s) => s.instanceId === id)!, action))
}

// atTurnEnd（BS16-068）：解決した時点ではactionを実行せず、state.turnEndActionsへ記録するだけ。
// 実際の解決はPhaseManager.endTurnが「エンドステップの誘発の後・timedEffectsのuntil:"turn"を消す前」で行う
const atTurnEndHandler: ActionHandler<"atTurnEnd"> = (ctx, action) => {
    const { state, owner, sourceName, sourceCardId } = ctx
    state.turnEndActions = [
        ...(state.turnEndActions ?? []),
        { ownerPid: owner, action: action.action, ...(sourceCardId !== undefined ? { sourceCardId } : {}) },
    ]
    log(state, `${sourceName}：このターン終了時に効果を発揮する。`)
}

const handlers = {
    timedEffect: timedEffectHandler,
    atTurnEnd: atTurnEndHandler,
} satisfies Partial<ActionRegistry>

export default handlers
