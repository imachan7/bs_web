// 破壊系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, CardType, Color, EffectAction, GameState, PlayerId, ResolvedTargetFilter, TargetFilter } from "../../type"
import { createInstance, currentLevel, draw, findNexus, getCard, instMinLevelCores, log, minLevelCores, opponentOf, pushResumeFrames, suspend } from "../GameState"
import {
    applyBothSidesRedirectToCandidates,
    bothSidesPids,
    bothSidesRedirectKeepPid,
    countEffectCounter,
    destroyNexus,
    destroySpirit,
    destroySpiritsFrom,
    destroyTargetsBatch,
    applyReviveEntry,
    fushiSummonOrConfirm,
    applyDestroyBatchAfter,
    destroyBpThresholdBonusFor,
    fireTrigger,
    findSpiritAny,
    isResisted,
    askPayToNegateIfNeeded,
    resistanceAgainst,
    matchesFamilyFilter,
    notifyNexusDeployed,
    pickAnySideByBp,
    pickAnySideCandidates,
    millDeck,
    pickEnemyByBp,
    pickEnemyLowestCost,
    pickEnemyCandidates,
    requestChoice,
    requestUpToChoice,
    returnNexusToHand,
    returnNexusToDeckTop,
    tryInteractiveTargetChoice,
    voidCoreToOwnTrash,
    placeCoresOnSpirit,
} from "../EffectModules"
import { displayLevel, effectiveBp, instColors, instHasColor, instMatchesCostFilter, matchesTarget, spiritHasKeyword } from "../../../../shared/rules"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"
import { payCoresFromFieldOrReserveToTrash } from "./cores"
import { COLOR_LABELS } from "../../../../data/constants"
import { countedAmount } from "../counted"
import { recordDestroysOf } from "../removal"
import { currentRecordScope, recordMoved } from "../record"

type DestroyAction = Extract<EffectAction, { type: "destroy" }>
type DestroyNexusAction = Extract<EffectAction, { type: "destroyNexus" }>
type Counted<T> = T & { count: number }

// side:"own"（destroyの自分側対象）の候補列挙。ハンドラ本体とpayの判定表（CHECKERS）の両方から呼び、
// 判定と実際の対象がずれないようにする
export function ownSideDestroyCandidates(
    state: GameState,
    owner: PlayerId,
    selfInstanceId: string | undefined,
    filter: ResolvedTargetFilter,
): CardInstance[] {
    return state.players[owner].field.spirits.filter((s) => matchesTarget(state, owner, s, filter, selfInstanceId))
}

// ponytail: self相対フィルタ（maxBp:"selfBp"等）は解決せずに比べる。pay で使うカードが出たら normalizeFilter を通す
export function destroyCandidateCountForPay(
    state: GameState,
    owner: PlayerId,
    selfInstanceId: string | undefined,
    action: Extract<EffectAction, { type: "destroy" }>,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
): number {
    const opp = opponentOf(owner)
    const filter = { ...(action.filter ?? {}) } as unknown as ResolvedTargetFilter
    if (action.side === "own") return ownSideDestroyCandidates(state, owner, selfInstanceId, filter).length
    // ハンドラと同じ「BP◯以下」の閾値加算（destroyBpThresholdBonus）
    if (filter.maxBp !== undefined && (srcType === "spirit" || srcType === "magic")) filter.maxBp += destroyBpThresholdBonusFor(state, owner)
    const matches = (s: CardInstance) => matchesTarget(state, opp, s, filter, selfInstanceId)
    if (action.anySide) return pickAnySideCandidates(state, owner, matches, srcColors, srcType).length
    return pickEnemyCandidates(state, opp, Infinity, matches, srcColors, srcType).length
}

// pay の判定表（destroyNexus）が使う候補数。
// ponytail: filter は normalizeFilter を通さない（self 相対の BP 指定は見ない）。pay で使うカードが出たら通す
export function destroyNexusCandidateCountForPay(
    state: GameState,
    owner: PlayerId,
    action: Extract<EffectAction, { type: "destroyNexus" }>,
    srcType: CardType | undefined,
): number {
    const opp = opponentOf(owner)
    const sides: PlayerId[] = action.side === "both" ? bothSidesPids(state, srcType) : action.side === "own" ? [owner] : [opp]
    const matchesIn = (pid: PlayerId) => (n: CardInstance) =>
        (action.levelFilter === undefined || action.levelFilter.includes(displayLevel(n).level)) &&
        matchesTarget(state, pid, n, (action.filter ?? {}) as unknown as ResolvedTargetFilter)
    return sides.reduce((sum, pid) => sum + state.players[pid].field.nexuses.filter(matchesIn(pid)).length, 0)
}

// pay の判定表（nexusCoresToTrash）：対象側のネクサスのどれかにコアが1個以上あるか
export function nexusHasCoresForPay(
    state: GameState,
    owner: PlayerId,
    action: Extract<EffectAction, { type: "nexusCoresToTrash" }>,
    srcType: CardType | undefined,
): boolean {
    const opp = opponentOf(owner)
    const sides: PlayerId[] = action.side === "both" ? bothSidesPids(state, srcType) : [opp]
    return sides.some((pid) => state.players[pid].field.nexuses.some((n) => n.cores > 0))
}

// 相手のトラッシュにあるマジックカードの色の種類数（重複除く。BS05超獣王ベヒードス）
function distinctOpponentTrashMagicColors(state: GameState, opp: PlayerId): number {
    const colors = new Set<Color>()
    for (const cardId of state.players[opp].trashCards) {
        const card = getCard(cardId)
        if (card.type !== "magic") continue
        for (const c of card.colors) colors.add(c)
    }
    return colors.size
}




// 「残り N 体」を再開フレームに積むときは体数を固定する（countCounter を再開のたびに数え直さない）
function fixedCount(a: DestroyAction, count: number): DestroyAction {
    const { countCounter: _counted, ...rest } = a
    return { ...rest, count, countPerOpponentTrashMagicColors: false }
}

const destroyHandler = (ctx: ActionCtx, action: Counted<DestroyAction>): void => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption } = ctx
        if (action.all) {
            destroyAllTargets(ctx, action)
            return
        }
        // 絞り込みは共通の TargetFilter に一本化（maxBp/keyword/cost と、self相対BP＝
        // maxBpFromSelf「召喚されたスピリットのBP以下」・bpEqualsSelf「selfと同BP」）。
        // self 相対BPは normalizeFilter が数値へ解決し、self 不在なら SELF_REQUIRED を返す
        const filter = normalizeFilter(ctx, action)
        // 器BS16：destroyBpThresholdBonus（BS16-061暗雲射す鬼ヶ島）。自分のスピリット/マジックの
        // 効果による破壊のときだけ、「BP◯以下を破壊する」の閾値に加算する（ブレイヴ・ネクサスの効果には効かない）
        if (filter !== SELF_REQUIRED && filter.maxBp !== undefined && (srcType === "spirit" || srcType === "magic")) {
            const bonus = destroyBpThresholdBonusFor(state, owner)
            if (bonus > 0) filter.maxBp += bonus
        }
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}の破壊効果：BP参照元がいなかった。`)
            return
        }
        // BP上限も filter 側で判定するため、候補列挙には上限を渡さない（Infinity）
        const limitBp = Infinity
        // excludeTarget（BS06計画された場外乱闘Lv2）：誘発から渡ってくる targetInstanceId（＝ブロッカー）は
        // 破壊する対象ではなく**除外する**対象。exhaustHandlerのexcludeTargetと同じ考え方
        const excludedId = action.excludeTarget ? targetInstanceId : undefined
        const matchesFilter = (s: CardInstance) =>
            s.instanceId !== excludedId && matchesTarget(state, opp, s, filter, self?.instanceId)
        if (targetInstanceId !== undefined && !action.excludeTarget) {
            // pendingChoice解決：選ばれた1体のみ破壊する。
            // 候補列挙（pickEnemyCandidates）では除外済みでも、この経路はここで改めて免疫を判定する
            // （coreRemove / returnToHand と同じ考え方。選択の提示から解決までの間に状態が変わりうる）。
            // anySide対応のためfindSpiritAnyで両陣営から検索する（instanceIdはゲーム内で一意）
            const found = findSpiritAny(state, targetInstanceId)
            if (!found) {
                log(state, `${sourceName}の破壊効果：対象がいなかった。`)
                return
            }
            // 対象指定なので scope は "targeted"（「相手の効果の対象にならない」がここでは効く）
            const destroyAttempt = attemptOf(ctx, "destroy", "targeted")
            // 「手札を破棄することで効果を受けない」は**払うかを守る側に聞いてから**判定する
            // （BS08竜騎集う円卓Lv2。聞いたら中断し、応答後にこのアクションが解決し直される）
            if (askPayToNegateIfNeeded(state, found.pid, found.inst, destroyAttempt, action, self, sourceName)) return
            const resisted = resistanceAgainst(state, found.pid, found.inst, destroyAttempt)
            if (resisted) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                return
            }
            // 明示ターゲット（誘発が渡す対象・選択の再開）にも filter を適用する。
            // ここを飛ばすと「BP3000以下を破壊」のような条件が、対象を渡された経路でだけ無視される
            // （2026-08-10、destroyExhausted を filter.rested へ畳んだときに判明。あちらは見ていた）
            if (!matchesTarget(state, found.pid, found.inst, filter, self?.instanceId)) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の対象条件を満たさない。`)
                return
            }
            // drawPerDestroyed（BS11-006）は「実際に破壊できた数」を数える必要があるので、
            // 数え方と中断の扱いを持っている destroyTargetsBatch を通す
            if (action.drawPerDestroyed || action.thenDrawFixed) {
                destroyTargetsBatch(
                    state,
                    owner,
                    [{ pid: found.pid, instanceId: found.inst.instanceId }],
                    destroyContext,
                    {
                        ...(action.drawPerDestroyed ? { drawPerDestroyed: true as const } : {}),
                        ...(action.thenDrawFixed ? { thenDrawFixed: action.thenDrawFixed } : {}),
                        ...(self ? { selfInstanceId: self.instanceId } : {}),
                    },
                )
                return
            }
            destroySpirit(state, found.pid, found.inst.instanceId, "destroy", destroyContext, { allowSuspend: true })
            return
        }
        // interactive の選択後に再入するときは excludeTarget を落とす。
        // 残したままだと、**プレイヤーが選んだ instanceId を「除外する対象」と誤読**して
        // 誰も破壊されず、同じ選択待ちが立ち続ける（＝実プレイで進行不能になる。
        // BS06-088 計画された場外乱闘Lv2 で再現。exhaustHandler は先に同じ対策をしていた）
        const { excludeTarget: _excludeTarget, ...actionForChoice } = action
        // countPerOpponentTrashMagicColors指定時はcountを無視し、相手のトラッシュのマジックカード
        // の色の種類数を対象数として使う（BS05超獣王ベヒードス）
        // countCounter指定時はcount×EffectCounterの値を破壊数として使う
        const resolvedCount = action.countCounter !== undefined
            ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
            : action.countPerOpponentTrashMagicColors
            ? distinctOpponentTrashMagicColors(state, opp)
            : action.count
        if (resolvedCount === 0) {
            log(state, `${sourceName}の破壊効果：カウントが0のため発動しなかった。`)
            return
        }
        // side:"own"：自分側のスピリットだけが対象（選択肢は候補全部＝pay { cost: destroy{side:"own"} } の器。
        // 自分の効果は自分のスピリットに免疫が働かないため isResisted は挟まない＝anySideの自分側と同じ扱い）
        if (action.side === "own") {
            if (state.interactiveTargets) {
                const candidates = ownSideDestroyCandidates(state, owner, self?.instanceId, filter)
                if (
                    tryInteractiveTargetChoice(
                        state,
                        owner,
                        self,
                        `${sourceName}の破壊効果：破壊する自分のスピリットを選んでください`,
                        candidates,
                        { ...actionForChoice, count: 1 },
                        resolvedCount > 1 ? fixedCount(actionForChoice, resolvedCount - 1) : null,
                    )
                ) {
                    return
                }
            }
            for (let i = 0; i < resolvedCount; i++) {
                const candidates = ownSideDestroyCandidates(state, owner, self?.instanceId, filter)
                if (candidates.length === 0) {
                    log(state, `${sourceName}の破壊効果：対象がいなかった。`)
                    break
                }
                const target = candidates.reduce((best, s) => (effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best))
                destroySpirit(state, owner, target.instanceId, "destroy", destroyContext, { allowSuspend: true })
                if (state.pendingChoice) {
                    const rest = resolvedCount - i - 1
                    if (rest > 0) {
                        pushResumeFrames(state, [{
                            kind: "action",
                            selfInstanceId: self ? self.instanceId : null,
                            actorPid: owner,
                            action: fixedCount(action, rest),
                        }])
                    }
                    return
                }
                if (state.winner) return
            }
            return
        }
        // anySide：自分/相手どちらのスピリットも対象にできる（destroyExhaustedのanySideと同じ非対称ルール。
        // 相手側候補には装甲・マジック効果耐性を尊重し、自分側には適用しない）
        if (action.anySide) {
            const anySideCandidates = pickAnySideCandidates(state, owner, matchesFilter, srcColors, srcType)
            if (
                state.interactiveTargets &&
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}の破壊効果：破壊するスピリットを選んでください`,
                    anySideCandidates,
                    { ...actionForChoice, count: 1 },
                    resolvedCount > 1
                        ? fixedCount(actionForChoice, resolvedCount - 1)
                        : null,
                )
            ) {
                return
            }
            for (let i = 0; i < resolvedCount; i++) {
                const target = pickAnySideByBp(state, owner, limitBp, matchesFilter, srcColors, srcType)
                if (!target) {
                    log(state, `${sourceName}の破壊効果：対象がいなかった。`)
                    break
                }
                destroySpirit(state, target.pid, target.inst.instanceId, "destroy", destroyContext, { allowSuspend: true })
                // 復活の確認で中断した。**残りの体数ぶん**を再開フレームに積んで抜ける
                // （対象は毎回その時点の盤面から選び直すので、体数だけ持ち回れば足りる）
                if (state.pendingChoice) {
                    const rest = resolvedCount - i - 1
                    if (rest > 0) {
                        pushResumeFrames(state, [{
                            kind: "action",
                            selfInstanceId: self ? self.instanceId : null,
                            actorPid: owner,
                            action: fixedCount(action, rest),
                        }])
                    }
                    return
                }
                if (state.winner) return
            }
            return
        }
        if (state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, limitBp, matchesFilter, srcColors, srcType)
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    action.chooserIsTarget
                        ? `${sourceName}：破壊する自分のスピリットを選んでください`
                        : `${sourceName}の破壊効果：破壊するスピリットを選んでください`,
                    candidates,
                    { ...actionForChoice, count: 1 },
                    resolvedCount > 1 ? fixedCount(actionForChoice, resolvedCount - 1) : null,
                    // chooserIsTarget（BS10-101ハングドマン＝「相手は、相手のスピリット1体を破壊する」）：
                    // 破壊される側（相手＝opp）が対象を選ぶ。解決はowner（発生源の持ち主）の効果として続ける
                    action.chooserIsTarget ? opp : undefined,
                )
            ) {
                return
            }
        }
        // drawPerDestroyed（BS11-006）：候補を先に選び切ってからバッチで破壊する
        // （数え方と中断の扱いを destroyTargetsBatch に任せる）
        if (action.drawPerDestroyed || action.thenDrawFixed) {
            const picked: { pid: PlayerId; instanceId: string }[] = []
            for (let i = 0; i < resolvedCount; i++) {
                const target = pickEnemyByBp(state, opp, limitBp, (s) => matchesFilter(s) && !picked.some((p) => p.instanceId === s.instanceId), srcColors, srcType)
                if (!target) break
                picked.push({ pid: opp, instanceId: target.instanceId })
            }
            if (picked.length === 0) {
                // thenDrawFixed（BS14-010）：対象0体でも「その後」のドローは発火する
                if (action.thenDrawFixed) draw(state, owner, action.thenDrawFixed)
                log(state, `${sourceName}の破壊効果：対象がいなかった。`)
                return
            }
            destroyTargetsBatch(state, owner, picked, destroyContext, {
                ...(action.drawPerDestroyed ? { drawPerDestroyed: true as const } : {}),
                ...(action.thenDrawFixed ? { thenDrawFixed: action.thenDrawFixed } : {}),
                ...(self ? { selfInstanceId: self.instanceId } : {}),
            })
            return
        }
        for (let i = 0; i < resolvedCount; i++) {
            // 相手が選ぶ（chooserIsTarget）なら、相手が差し出すであろう実効BP最小から（CHOOSER_RULES.md §2）
            const target = action.lowestCost
                ? pickEnemyLowestCost(state, opp, matchesFilter, srcColors, srcType)
                : action.chooserIsTarget
                  ? pickEnemyCandidates(state, opp, limitBp, matchesFilter, srcColors, srcType).reduce<CardInstance | null>(
                        (min, s) => (min === null || effectiveBp(state, opp, s) < effectiveBp(state, opp, min) ? s : min),
                        null,
                    )
                  : pickEnemyByBp(state, opp, limitBp, matchesFilter, srcColors, srcType)
            if (!target) {
                log(state, `${sourceName}の破壊効果：対象がいなかった。`)
                break
            }
            destroySpirit(state, opp, target.instanceId, "destroy", destroyContext, { allowSuspend: true })
            // 復活の確認で中断した。残りの体数ぶんを再開フレームに積んで抜ける
            if (state.pendingChoice) {
                const rest = resolvedCount - i - 1
                if (rest > 0) {
                    pushResumeFrames(state, [{
                        kind: "action",
                        selfInstanceId: self ? self.instanceId : null,
                        actorPid: owner,
                        action: fixedCount(action, rest),
                    }])
                }
                return
            }
            if (state.winner) return
        }
        return
}

type AllTargetsSpec = { filter?: TargetFilter; anySide?: boolean; side?: "own" }

// destroy{all} の対象（破壊はしない）。simultaneous が複数の destroy{all} の対象をまとめるときにも使う。
// 範囲破壊。untargetable（ワルキューレ）は範囲に無力なので当たるが、
// 全効果免疫（フェザーバリア）・装甲該当・マジック効果耐性該当のスピリットは除外する。
// anySide／side は「どちらのフィールドを見るか」＝対象プールの選択なので filter には含めない
export function destroyAllTargetList(ctx: ActionCtx, action: AllTargetsSpec): { pid: PlayerId; instanceId: string }[] | typeof SELF_REQUIRED {
    const { state, owner, opp, self, srcType } = ctx
        const areaFilter = normalizeFilter(ctx, action)
        if (areaFilter === SELF_REQUIRED) return SELF_REQUIRED
        const oppTargets = action.side === "own" ? [] : state.players[opp].field.spirits
            .filter(
                (s) =>
                    matchesTarget(state, opp, s, areaFilter, self?.instanceId) &&
                    !isResisted(state, opp, s, attemptOf(ctx, "destroy", "area")),
            )
            .map((s) => ({ pid: opp, inst: s }))
        // anySide 指定時は自分側も対象に含める（装甲・マジック効果耐性は既存のanySide系アクションと
        // 同様に自分側には適用しない非対称ルール。BS04魔龍帝ジークフリードLv3）
        const ownTargets = action.anySide || action.side === "own"
            ? state.players[owner].field.spirits
                  .filter(
                      (s) =>
                          matchesTarget(state, owner, s, areaFilter, self?.instanceId) &&
                          !isResisted(state, owner, s, attemptOf(ctx, "destroy", "area")),
                  )
                  .map((s) => ({ pid: owner, inst: s }))
            : []
        // 封印された魔導書Lv1：マジックで「スピリットすべて」を対象にしたとき、
        // 片側だけに変更する選択が済んでいればその側に絞る（anySide の単体対象と同じ扱い）
        const keepPid = bothSidesRedirectKeepPid(state, srcType)
        return [...oppTargets, ...ownTargets]
            .filter((t) => keepPid === null || t.pid === keepPid)
            .map((t) => ({ pid: t.pid, instanceId: t.inst.instanceId }))
}

// 「すべて」の破壊は範囲の効果（attempt が "area"）。1体を対象に取る destroy とは耐性の判定が違うので、destroy{all} もここを通す
function destroyAllTargets(
    ctx: ActionCtx,
    action: AllTargetsSpec & { drawPerDestroyed?: true; voidCoreToSelfPerDestroyed?: true },
): void {
    const { state, sourceName } = ctx
        const list = destroyAllTargetList(ctx, action)
        if (list === SELF_REQUIRED) {
            log(state, `${sourceName}：BP参照元がいなかった。`)
            return
        }
        destroyTargetList(ctx, list, action)
}

// まとめた破壊。1体ごとに「復活しますか」で中断できる（中断したら destroyBatch フレームを積んで抜ける）
export function destroyTargetList(
    ctx: ActionCtx,
    batchTargets: { pid: PlayerId; instanceId: string }[],
    action: { drawPerDestroyed?: true; voidCoreToSelfPerDestroyed?: true } = {},
): void {
    const { state, owner, self, sourceName, destroyContext } = ctx
        if (batchTargets.length === 0) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        // **実際に破壊できた数**を数える（「この効果で破壊したスピリット1体につき」）。
        // 「破壊されるかわりにフィールドに残る」で残った個体は破壊されていないので数に入らない
        // （docs/design/RESUME_STACK.md §7 ①。別の効果としての「破壊したとき」は阻止できる）。
        //
        // バッチ経由なので、1体ごとに「復活しますか」の確認で**その場で中断できる**。
        // 中断したら destroyBatch フレームを積んで抜け、残りは drainResumeStack が続きを回す
        const after = {
            ...(action.drawPerDestroyed ? { drawPerDestroyed: true as const } : {}),
            ...(action.voidCoreToSelfPerDestroyed ? { voidCoreToSelfPerDestroyed: true as const } : {}),
            ...(self ? { selfInstanceId: self.instanceId } : {}),
        }
        const { destroyed, stoppedAt } = destroySpiritsFrom(
            state,
            batchTargets,
            0,
            0,
            destroyContext,
        )
        if (stoppedAt < batchTargets.length) {
            pushResumeFrames(state, [{
                kind: "destroyBatch",
                ownerPid: owner,
                targets: batchTargets,
                index: stoppedAt,
                destroyed,
                ...(destroyContext ? { context: destroyContext } : {}),
                after,
            }])
            return
        }
        if (state.winner) return
        applyDestroyBatchAfter(state, owner, destroyed, after)
        return
}

// マインドフレア：相手のフィールドに同じカード名のスピリットが2体以上いるとき、
// カード名1つにつき1体だけ残して残りを破壊する。残すのはフィールドの先頭側（決定的簡略化）
const destroyDuplicateNamesHandler: ActionHandler<"destroyDuplicateNames"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId } = ctx
    // カード名ごとにまとめる（2体以上いる名前だけが対象）
    const groups = new Map<string, CardInstance[]>()
    for (const s of state.players[opp].field.spirits) {
        const name = getCard(s.cardId).name
        groups.set(name, [...(groups.get(name) ?? []), s])
    }
    const dupGroups = [...groups.values()].filter((list) => list.length >= 2)
    if (dupGroups.length === 0) {
        log(state, `${sourceName}：同じカード名のスピリットが2体以上いなかった。`)
        return
    }
    // **どれを残すかは持ち主が選ぶ**（効果文「カード名1つにつきスピリット1体ずつを残し」に
    // 主語が無いので発生源の持ち主。2026-08-24）。重複する名前が複数あれば1つずつ聞く。
    // choosing が付いているときだけ targetInstanceId を選択結果として読む
    // （素の targetInstanceId は誘発が渡すイベント対象）
    const kept = [...(action.keptIds ?? [])]
    if (action.choosing && targetInstanceId !== undefined) kept.push(targetInstanceId)
    for (const list of dupGroups) {
        if (list.some((s) => kept.includes(s.instanceId))) continue // この名前は決定済み
        if (
            tryInteractiveTargetChoice(
                state,
                owner,
                self,
                `${sourceName}：${getCard(list[0]!.cardId).name}のうち残す1体を選んでください`,
                list,
                { ...action, choosing: true, keptIds: kept },
                null,
            )
        ) {
            return
        }
        // 非対話（テスト・自動解決）は従来どおりフィールドの先頭側を残す
        kept.push(list[0]!.instanceId)
    }
    const doomed: string[] = []
    for (const list of dupGroups) {
        for (const s of list) {
            if (kept.includes(s.instanceId)) continue
            if (isResisted(state, opp, s, attemptOf(ctx, "destroy", "area"))) continue
            doomed.push(s.instanceId)
        }
    }
    if (doomed.length === 0) {
        log(state, `${sourceName}：破壊できるスピリットがいなかった。`)
        return
    }
    destroyTargetsBatch(state, opp, doomed.map((instanceId) => ({ pid: opp, instanceId })), destroyContext)
}



const ALL_COLORS: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]



const destroyNexusHandler = (ctx: ActionCtx, action: Counted<DestroyNexusAction>): void => {
    const { state, owner, opp, self, sourceName, srcType, chosenOption, targetInstanceId } = ctx
        // side指定時は破壊対象の陣営を切り替える（省略時はopponent＝従来どおり。BS01バスターファランクス＝both。
        // "own"は自分側のネクサスだけが対象＝pay { cost: destroyNexus{side:"own"} } の器）
        const sides: PlayerId[] = action.side === "both" ? bothSidesPids(state, srcType) : action.side === "own" ? [owner] : [opp]
        // levelFilter指定時はこれに含まれるレベルのネクサスのみ対象（BS03バスターランス＝Lv1のみ）。
        // **他のカードから見えるレベル（displayLevel）で判定する**：ウッド・ゴレムの
        // 「相手のネクサスすべてのLv2効果は発揮されない」は効果の発揮判定にだけ効く置き換えなので、
        // それでLv1に見えるようになったネクサスをバスターランスが破壊できてはいけない
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}のネクサス破壊：対象がいなかった。`)
            return
        }
        const matchesIn = (pid: PlayerId) => (n: CardInstance) =>
            (action.levelFilter === undefined || action.levelFilter.includes(displayLevel(n).level)) &&
            matchesTarget(state, pid, n, filter, self?.instanceId)
        // chooserIsTarget（BS14-111エクスキューションデストロイ＝「相手は、相手のネクサス1つを破壊する」）：
        // 破壊される側（opp）が対象を選ぶ。解決はowner（発生源の持ち主）の効果として続ける
        if (action.chooserIsTarget && action.count === 1) {
            const pid = opp
            if (targetInstanceId !== undefined) {
                const nexus = state.players[pid].field.nexuses.find((n) => n.instanceId === targetInstanceId)
                if (nexus) destroyNexus(state, pid, nexus.instanceId, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })
                else log(state, `${sourceName}のネクサス破壊：対象がいなかった。`)
                return
            }
            const candidates = state.players[pid].field.nexuses.filter(matchesIn(pid)).map((n) => n.instanceId)
            if (state.interactiveTargets) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：破壊する自分のネクサスを選んでください`,
                    candidates,
                    false,
                    action,
                    self,
                    "target",
                    undefined,
                    pid,
                )
                return
            }
            const nexus = state.players[pid].field.nexuses.find(matchesIn(pid))
            if (!nexus) {
                log(state, `${sourceName}のネクサス破壊：対象がいなかった。`)
                return
            }
            destroyNexus(state, pid, nexus.instanceId, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })
            return
        }
        // side:"own" の1つ破壊は持ち主が選ぶ。非対話は旧サクリファイスと同じくコア最少（同数は先頭）
        if (action.side === "own" && action.count === 1 && !action.all) {
            const candidates = state.players[owner].field.nexuses.filter(matchesIn(owner))
            const chosen = targetInstanceId !== undefined
                ? candidates.find((n) => n.instanceId === targetInstanceId)
                : undefined
            if (chosen === undefined && targetInstanceId === undefined && state.interactiveTargets && candidates.length >= 2) {
                requestChoice(state, owner, `${sourceName}：破壊する自分のネクサスを選んでください`, candidates.map((n) => n.instanceId), false, action, self)
                return
            }
            const victim = chosen ?? candidates.reduce<CardInstance | undefined>((a, n) => (a === undefined || n.cores < a.cores ? n : a), undefined)
            if (!victim) {
                log(state, `${sourceName}のネクサス破壊：対象がいなかった。`)
                return
            }
            // 破壊したネクサスを lastMoved に書く（「破壊したネクサスのコストと同じ枚数」＝カウンタlastCostが読む。060）
            const scope = currentRecordScope(state)
            if (destroyNexus(state, owner, victim.instanceId, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })) {
                recordMoved(state, [victim.cardId], scope)
            }
            return
        }
        // upTo（0〜count の好きな数を選べる）：既存の自動選択ループは聞かずに先頭から決め打ちするため、
        // 対話時はここで分岐する。side:both との組み合わせは使用例が無いため sides[0] のみ扱う。
        // drawPerDestroyed／discardOpponentPerDestroyed は upTo と組み合わせて使うカードが無いため、
        // 対話の再入をまたいで合計を持ち回る仕組みは未対応（必要になったら action に合計を載せる）
        if (action.upTo && state.interactiveTargets) {
            const pid = sides[0]
            if (pid === undefined) {
                log(state, `${sourceName}のネクサス破壊：対象がいなかった。`)
                return
            }
            if (targetInstanceId !== undefined) {
                const nexus = state.players[pid].field.nexuses.find((n) => n.instanceId === targetInstanceId)
                if (!nexus) {
                    log(state, `${sourceName}のネクサス破壊：対象がいなかった。`)
                    return
                }
                destroyNexus(state, pid, nexus.instanceId, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })
                const remaining = action.count - 1
                if (remaining > 0) {
                    const nextCandidates = state.players[pid].field.nexuses.filter(matchesIn(pid)).map((n) => n.instanceId)
                    requestUpToChoice(
                        state,
                        owner,
                        `${sourceName}：破壊するネクサスを選んでください（あと${remaining}つまで）`,
                        nextCandidates,
                        { ...action, count: remaining },
                        self,
                    )
                }
                return
            }
            const candidates = state.players[pid].field.nexuses.filter(matchesIn(pid)).map((n) => n.instanceId)
            requestUpToChoice(
                state,
                owner,
                `${sourceName}：破壊するネクサスを選んでください（あと${action.count}つまで）`,
                candidates,
                action,
                self,
            )
            return
        }
        let destroyed = 0
        for (const pid of sides) {
            // all指定時はcountを無視し、開始時点で条件に一致するネクサス数ぶん繰り返して全破壊する（BS04風龍王フージャオス）
            const iterations = action.all
                ? state.players[pid].field.nexuses.filter(matchesIn(pid)).length
                : action.count
            for (let i = 0; i < iterations; i++) {
                const nexus =
                    action.levelFilter !== undefined || action.filter !== undefined
                        ? state.players[pid].field.nexuses.find(matchesIn(pid))
                        : state.players[pid].field.nexuses[0]
                if (!nexus) {
                    log(state, `${sourceName}のネクサス破壊：対象がいなかった。`)
                    break
                }
                const ok = destroyNexus(state, pid, nexus.instanceId, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })
                if (!ok) break // 破壊耐性で不発：同じネクサスを再試行しても結果は変わらないため打ち切る
                destroyed++
            }
        }
        // 実際に破壊できたネクサス1つにつきdrawPerDestroyed枚ドロー（バスタースピア）
        if (action.drawPerDestroyed && destroyed > 0) {
            draw(state, owner, destroyed * action.drawPerDestroyed)
        }
        // 実際に破壊できたネクサス1つにつき相手の手札を破棄させる（BS05鉄槌のオズワルドLv2）
        if (action.discardOpponentPerDestroyed && destroyed > 0) {
            ctx.resolve({
                type: "discardOpponent",
                count: destroyed * action.discardOpponentPerDestroyed,
            })
        }
        return
}


// 「予算の範囲で**好きなだけ**破壊する」のトグル選択（2026-08-24 ユーザー確定）。
// クリックで選択、もう一度クリックで選択解除。選んだ合計は prompt に出し、「これで破壊する」で確定する。
//
// 「好きなだけ」は途中でやめられる効果なので、選び終わりの合図が要る。
// **選択済みも候補に残す**（＝もう一度押すと外れる）ことでトグルにし、スキップボタンを
// 「中止」ではなく「確定」として使う（PendingChoice.resolveOnSkip / skipLabel）。
// 破壊は従来どおり選び切ってから destroyTargetsBatch へまとめる（復活の確認で中断しても
// バッチが続きを回せるため）。
//
// 選択の途中経過は action.choosing / action.chosenIds で持ち回る（cards.jsonには書かない）。
// **choosing が付いているときだけ targetInstanceId を選択結果として読む**
// （素の targetInstanceId は誘発が渡すイベント対象。part230 の refreshOne で踏んだ罠）。
//
// 戻り値 false は「トグル選択に載せなかった」＝呼び出し側が従来の自動選択を続ける合図
type BudgetDestroyAction =
    | Extract<EffectAction, { type: "destroyByCostBudget" }>
    | Extract<EffectAction, { type: "destroyByBpBudget" }>

function budgetToggleDestroy(
    ctx: ActionCtx,
    action: BudgetDestroyAction,
    budget: number,
    unitLabel: string, // 「コスト」／「BP」
    weightOf: (s: CardInstance) => number,
): boolean {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId } = ctx
    if (!action.choosing && !state.interactiveTargets) return false

    const onField = (id: string): CardInstance | undefined =>
        state.players[opp].field.spirits.find((sp) => sp.instanceId === id)
    let chosen = [...(action.chosenIds ?? [])]
    if (action.choosing && targetInstanceId !== undefined) {
        chosen = chosen.includes(targetInstanceId)
            ? chosen.filter((id) => id !== targetInstanceId)
            : [...chosen, targetInstanceId]
    }
    chosen = chosen.filter((id) => onField(id) !== undefined) // 解決中に居なくなった個体は落とす
    const used = chosen.reduce((sum, id) => sum + weightOf(onField(id)!), 0)
    const left = budget - used

    // スキップ（＝「これで破壊する」）で戻ってきたときだけ、聞き直さずに確定する
    if (!(action.choosing && targetInstanceId === undefined)) {
        // 選べるのは「選択済み（＝解除できる）」と「残り予算に収まる未選択」
        const candidates = pickEnemyCandidates(
            state,
            opp,
            Infinity,
            (sp) => chosen.includes(sp.instanceId) || weightOf(sp) <= left,
            srcColors,
            srcType,
        )
        if (candidates.length > 0) {
            suspend(state, {
                pid: owner,
                kind: "target",
                prompt: `${sourceName}：破壊するスピリットを選んでください（${unitLabel}合計 ${used}／${budget}。選んだものをもう一度押すと外れます）`,
                candidates: candidates.map((sp) => sp.instanceId),
                selectedIds: chosen,
                skipLabel: chosen.length > 0 ? `これで破壊する（${chosen.length}体）` : "破壊しない",
                optional: true,
                resolveOnSkip: true,
                action: { ...action, choosing: true as const, chosenIds: chosen },
                selfInstanceId: self ? self.instanceId : null,
            })
            return true
        }
    }
    if (chosen.length === 0) {
        log(state, `${sourceName}：破壊できる対象がいなかった。`)
        return true
    }
    const names = chosen.map((id) => getCard(onField(id)!.cardId).name)
    destroyTargetsBatch(state, owner, chosen.map((instanceId) => ({ pid: opp, instanceId })), destroyContext)
    log(state, `${sourceName}：${unitLabel}合計${budget}まで「${names.join("、")}」を破壊した。`)
    return true
}

// BS07剣龍皇エクス・キャリバス：相手スピリットを**実効BP合計**がbudgetを超えない範囲で好きなだけ破壊する。
// destroyByCostBudget のBP版で、選び方の簡略化も同じ（残り予算内でBP最大から貪欲に選ぶ）
const destroyByBpBudgetHandler: ActionHandler<"destroyByBpBudget"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext } = ctx
        // budgetFromSelfBp（BS08太陽石の神殿）：予算はselfの実効BP（＝バトルに勝利したアタッカーのBP）。
        // budgetFromFamilyBpSum（BS13-008恐竜王メガロ・ザウル）：予算は指定系統を持つ自分のスピリットの実効BP合計
        let remaining = action.budgetFromSelfBp && self
            ? effectiveBp(state, owner, self)
            : action.budgetFromFamilyBpSum !== undefined
                ? state.players[owner].field.spirits
                    .filter((s) => matchesFamilyFilter(state, owner, s, action.budgetFromFamilyBpSum!))
                    .reduce((sum, s) => sum + effectiveBp(state, owner, s), 0)
                : (action.budget ?? 0)
        const budgetForLog = remaining
        // 対話モードは「好きなだけ」をトグルで選ばせる（非対話は下の貪欲へ落ちる）
        if (budgetToggleDestroy(ctx, action, budgetForLog, "BP", (sp) => effectiveBp(state, opp, sp))) return
        let destroyedCount = 0
        const destroyedNames: string[] = []
        // **先に選び切ってから、まとめて破壊する**。貪欲な選び方（残り予算内でBP最大から）は
        // 破壊そのものに依存しないので事前に確定でき、こうしておくと
        // 復活の確認で中断してもバッチ（destroyBatch フレーム）が続きを回せる
        const chosenIds: string[] = []
        while (remaining > 0) {
            const candidates = pickEnemyCandidates(
                state,
                opp,
                Infinity,
                (s) => effectiveBp(state, opp, s) <= remaining && !chosenIds.includes(s.instanceId),
                srcColors,
                srcType,
            )
            if (candidates.length === 0) break
            const target = candidates.reduce((best, s) =>
                effectiveBp(state, opp, s) > effectiveBp(state, opp, best) ? s : best,
            )
            remaining -= effectiveBp(state, opp, target)
            destroyedNames.push(getCard(target.cardId).name)
            chosenIds.push(target.instanceId)
            destroyedCount++
        }
        if (destroyedCount > 0) {
            destroyTargetsBatch(state, owner, chosenIds.map((instanceId) => ({ pid: opp, instanceId })), destroyContext)
        }
        if (destroyedCount === 0) {
            log(state, `${sourceName}：破壊できる対象がいなかった。`)
            return
        }
        log(
            state,
            `${sourceName}：BP合計${budgetForLog}まで「${destroyedNames.join("、")}」を破壊した。`,
        )
        return
}


const destroyByCostBudgetHandler: ActionHandler<"destroyByCostBudget"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext } = ctx
        // 聖皇ジークフリーデン：相手スピリットをコスト合計がbudgetを超えない範囲で好きなだけ破壊する。
        // 対話モードは「好きなだけ」をトグルで選ばせる（非対話は下の貪欲＝残り予算内でコスト最大から。
        // 同コストは実効BP最大を優先）
        // budgetCounter指定時（083）：実際の予算はbudget×counter値（burstEventCost等）で算出する
        const budget = action.budgetCounter !== undefined
            ? countedAmount(state, owner, self, action.budget, action.budgetCounter, srcType)
            : action.budget
        if (budgetToggleDestroy(ctx, action, budget, "コスト", (sp) => getCard(sp.cardId).cost)) return
        let remaining = budget
        let destroyedCount = 0
        const destroyedNames: string[] = []
        // 先に選び切ってからまとめて破壊する（destroyByBpBudget と同じ理由）
        const chosenIds: string[] = []
        while (remaining > 0) {
            const candidates = pickEnemyCandidates(
                state,
                opp,
                Infinity,
                (s) => getCard(s.cardId).cost <= remaining && !chosenIds.includes(s.instanceId),
                srcColors,
                srcType,
            )
            if (candidates.length === 0) break
            const target = candidates.reduce((best, s) => {
                const sCost = getCard(s.cardId).cost
                const bestCost = getCard(best.cardId).cost
                if (sCost !== bestCost) return sCost > bestCost ? s : best
                return effectiveBp(state, opp, s) > effectiveBp(state, opp, best) ? s : best
            })
            remaining -= getCard(target.cardId).cost
            destroyedNames.push(getCard(target.cardId).name)
            chosenIds.push(target.instanceId)
            destroyedCount++
        }
        if (destroyedCount > 0) {
            destroyTargetsBatch(state, owner, chosenIds.map((instanceId) => ({ pid: opp, instanceId })), destroyContext)
        }
        if (destroyedCount === 0) {
            log(state, `${sourceName}：破壊できる対象がいなかった。`)
            return
        }
        log(
            state,
            `${sourceName}：コスト合計${budget}まで「${destroyedNames.join("、")}」を破壊した。`,
        )
        return
}

const destroyOwnByCostHandler: ActionHandler<"destroyOwnByCost"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 自分のフィールドからself以外でコスト<=maxCostの1体を破壊する。
        // 実対戦（interactiveTargets）ではプレイヤーが選び、非対話時はコスト最大を自動選択する。
        // 候補の絞り込みは「場のスピリットのコストを条件にする判定」なので、道化師クランの
        // 付与コストも見る instMatchesCostFilter を使う
        const candidates = state.players[owner].field.spirits.filter(
            (s) =>
                (!self || s.instanceId !== self.instanceId) &&
                instMatchesCostFilter(s, { max: action.maxCost }),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        // pendingChoice 解決時は選ばれた1体を使う
        const chosenTarget = targetInstanceId
            ? candidates.find((s) => s.instanceId === targetInstanceId)
            : undefined
        if (!chosenTarget && targetInstanceId === undefined && state.interactiveTargets) {
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}：破壊する自分のスピリットを選んでください`,
                    candidates,
                    action,
                    null,
                )
            ) {
                return
            }
        }
        // 自動選択の「コスト最大」／gainCoresEqualCostで得るコア数は、複数コストを持つ状態では
        // 「最大」を定義できないため、道化師クラン等の付与コストではなくカード本来のコストのまま比較する
        const target =
            chosenTarget ??
            candidates.reduce((best, s) =>
                getCard(s.cardId).cost > getCard(best.cardId).cost ? s : best,
            )
        const targetCost = getCard(target.cardId).cost
        const targetName = getCard(target.cardId).name
        destroySpirit(state, owner, target.instanceId)
        if (action.gainCoresEqualCost) {
            const player = state.players[owner]
            player.reserve += targetCost
            log(
                state,
                `${sourceName}：破壊した${targetName}のコストと同じ数のコア${targetCost}個をボイドから自分のリザーブに置いた。（リザーブ${player.reserve}）`,
            )
        }
        // thenDestroyEnemyByCostBudget（BS07アームズインパクト）：破壊した自分のスピリットのコストを
        // 予算として、相手のスピリットを合計コストがその範囲に収まるだけ破壊する。
        // 選び方は destroyByCostBudget と同じ貪欲（残り予算内でコスト最大→同コストは実効BP最大）
        if (action.thenDestroyEnemyByCostBudget) {
            ctx.resolve({ type: "destroyByCostBudget", budget: targetCost })
        }
        return
}


const destroySelfHandler: ActionHandler<"destroySelf"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // このスピリット（self）を破壊する（onDestroy誘発あり。selfがnull/不在ならno-op。コリスタル）
        if (!self) {
            log(state, `${sourceName}：selfが不在のため何も起こらなかった。`)
            return
        }
        // fieldEvent で相手側のスピリットがイベント対象のとき、self の持ち主は実行者（owner）と異なる
        const selfPid = findSpiritAny(state, self.instanceId)?.pid ?? owner
        if (selfPid !== owner && isResisted(state, selfPid, self, attemptOf(ctx, "destroy", "area"))) {
            log(state, `${getCard(self.cardId).name}は${sourceName}の効果を受けないため破壊されなかった。`)
            return
        }
        destroySpirit(state, selfPid, self.instanceId, "destroy", selfPid !== owner ? destroyContext : undefined, { allowSuspend: true })
        return
}


const nexusCoresToTrashHandler: ActionHandler<"nexusCoresToTrash"> = (ctx, action) => {
    const { state, opp, sourceName, srcType } = ctx
        // フォールダウン：指定側のネクサスすべての上のコアすべてを、各持ち主のトラッシュへ。
        // ネクサスはコア0になっても消滅しない
        const sides: PlayerId[] = action.side === "both" ? bothSidesPids(state, srcType) : [opp]
        let total = 0
        for (const pid of sides) {
            const player = state.players[pid]
            for (const nexus of player.field.nexuses) {
                if (nexus.cores <= 0) continue
                total += nexus.cores
                player.trashCores += nexus.cores
                nexus.cores = 0
            }
        }
        if (total === 0) {
            log(state, `${sourceName}：コアが置かれているネクサスがなかった。`)
            return
        }
        log(state, `${sourceName}：ネクサスの上のコア合計${total}個を持ち主のトラッシュに置いた。`)
        return
}


const returnNexusToHandHandler: ActionHandler<"returnNexusToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcType, targetInstanceId } = ctx
        // 1件戻すたびの共通処理：voidCoreToOwnTrashIfOpponent指定時、戻したネクサスが
        // 相手のものだったときのみボイドからその数のコアを自分のトラッシュへ（BS03メビウスリング）
        const bounceOne = (pid: PlayerId, nexus: CardInstance): void => {
            if (action.dest === "deckTop") {
                returnNexusToDeckTop(state, pid, nexus.instanceId)
            } else {
                returnNexusToHand(state, pid, nexus.instanceId)
            }
            if (pid !== owner && action.voidCoreToOwnTrashIfOpponent) {
                voidCoreToOwnTrash(state, owner, action.voidCoreToOwnTrashIfOpponent)
                log(
                    state,
                    `${sourceName}：相手のネクサスを手札に戻したため、ボイドからコア${action.voidCoreToOwnTrashIfOpponent}個を自分のトラッシュに置いた。`,
                )
            }
        }
        // all：countを無視し、side（省略時はopponent）が指すネクサスすべてを戻す。
        // side:"both"は両陣営すべて（bothSidesPidsで封印された魔導書系の対象片側化にも対応。BS06ホワイトホール）
        if (action.all) {
            const sides: PlayerId[] = action.side === "both" ? bothSidesPids(state, srcType) : [opp]
            let bounced = 0
            for (const pid of sides) {
                // bounceOne が field.nexuses を破壊的に変更するため、対象をスナップショットしてから戻す
                for (const nexus of [...state.players[pid].field.nexuses]) {
                    bounceOne(pid, nexus)
                    bounced++
                }
            }
            if (bounced === 0) log(state, `${sourceName}のネクサス手札戻し：対象がいなかった。`)
            return
        }
        // anySide：自分/相手どちらのネクサスも対象にできる。
        // targetInstanceId優先→interactiveTargets時はrequestChoiceで両陣営から選択→
        // それも無ければ既存どおり相手の先頭ネクサスを自動選択（下のループへフォールスルー）
        if (action.anySide) {
            if (targetInstanceId !== undefined) {
                let found: { pid: PlayerId; inst: CardInstance } | null = null
                for (const pid of ["p1", "p2"] as PlayerId[]) {
                    const nexus = state.players[pid].field.nexuses.find((n) => n.instanceId === targetInstanceId)
                    if (nexus) {
                        found = { pid, inst: nexus }
                        break
                    }
                }
                if (!found) {
                    log(state, `${sourceName}のネクサス手札戻し：対象がいなかった。`)
                    return
                }
                bounceOne(found.pid, found.inst)
                return
            }
            if (state.interactiveTargets) {
                // 封印された魔導書Lv1：片側だけに変更する選択が済んでいればその側のネクサスに絞る
                const candidates = applyBothSidesRedirectToCandidates(state, srcType, [
                    ...state.players[opp].field.nexuses,
                    ...state.players[owner].field.nexuses,
                ])
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：手札に戻すネクサスを選んでください`,
                    candidates.map((n) => n.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
        }
        for (let i = 0; i < action.count; i++) {
            const nexus = state.players[opp].field.nexuses[0]
            if (!nexus) {
                log(state, `${sourceName}のネクサス手札戻し：対象がいなかった。`)
                break
            }
            bounceOne(opp, nexus)
        }
        return
}

const reviveLastDestroyedNexusHandler: ActionHandler<"reviveLastDestroyedNexus"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 戦闘獣ジャッカー：self上のコアすべてをトラッシュに置くことで、直近に破壊された自分のネクサスを戻す
        // BS05ブロンズ・ゴレム：coreCost指定時はその数だけを支払う（不足なら不発）
        const last = state.lastDestroyedNexus
        const requiredCost = action.coreCost
        // costFrom:"ownFieldOrReserve"（SD02-014 魔法監視塔Lv1）：コストを self 上ではなく
        // 自分のフィールド/リザーブのコアから払う。**リザーブを優先**して場のスピリットを崩さない
        const fromFieldOrReserve = action.costFrom === "ownFieldOrReserve"
        if (!fromFieldOrReserve && (!self || self.cores <= 0 || (requiredCost !== undefined && self.cores < requiredCost))) {
            log(state, `${sourceName}：支払えるコアがなかった。`)
            return
        }
        if (!last || last.pid !== owner) {
            log(state, `${sourceName}：戻せるネクサスがなかった。`)
            return
        }
        const player = state.players[owner]
        // 「フィールドに戻す」は**破壊待機状態から戻す**という意味で、トラッシュからの回収ではない
        // （docs/design/TIMING_CHART.md §1.5）。したがって破壊待機状態のネクサスを探し、
        // 待機を解除する。コアも乗ったまま・レベルもそのままでフィールドにとどまる
        const pending = player.field.nexuses.find((n) => n.pendingDestruction)
        const trashIndex = pending ? -1 : player.trashCards.lastIndexOf(last.cardId)
        if (!pending && trashIndex === -1) {
            log(state, `${sourceName}：戻せるネクサスがなかった。`)
            return
        }
        // 支払える総量を先に確かめる（払えないなら何も起こさない。「〜することで」は任意コスト）
        if (fromFieldOrReserve) {
            const need = requiredCost ?? 1
            const available = player.reserve + player.field.spirits.reduce((n, sp) => n + sp.cores, 0)
            if (available < need) {
                log(state, `${sourceName}：支払えるコアがなかった。`)
                return
            }
        }
        // コストの支払い：coreCost指定時はその数、省略時はself上のコアすべてを自分のトラッシュへ（維持コア割れで消滅する）
        let paid: number
        if (fromFieldOrReserve) {
            // リザーブ優先で払う共通処理（cores.payCoresFromFieldOrReserveToTrash）。
            // 2026-08-27 に、ここに直接書いてあった同じ処理を BS10-103 グロウイングソードと
            // 共通化した（**挙動は変えていない**。維持コア割れの消滅は元から removal.ts 側の
            // 掃除が拾っていて、共通処理は destroySpirit を明示的に呼ぶだけの違い）
            paid = payCoresFromFieldOrReserveToTrash(state, owner, requiredCost ?? 1)
        } else {
            paid = requiredCost ?? self!.cores
            self!.cores -= paid
            player.trashCores += paid
        }
        const revivedName = getCard(pending ? pending.cardId : last.cardId).name
        if (pending) {
            delete pending.pendingDestruction
        } else {
            // 破壊が確定した後（既にトラッシュへ行っている）経路への保険
            player.trashCards.splice(trashIndex, 1)
            player.field.nexuses.push(createInstance(last.cardId, state.turn, 0))
            notifyNexusDeployed(state, owner)
        }
        state.lastDestroyedNexus = null
        log(
            state,
            `${sourceName}：コア${paid}個をトラッシュに置き、${revivedName}をフィールドに戻した。`,
        )
        if (fromFieldOrReserve) {
            // 場から取った結果、維持コア割れになったスピリットを消滅させる
            for (const sp of [...player.field.spirits]) {
                if (sp.cores < instMinLevelCores(sp)) destroySpirit(state, owner, sp.instanceId, "deplete")
            }
        } else if (self && self.cores < instMinLevelCores(self)) {
            destroySpirit(state, owner, self.instanceId, "deplete")
        }
        return
}

// 「お互い、フィールドのスピリット1体を選び、破壊する」（BS05吸血女王カーミラLv3）。
// destroyAllExceptChosenColorsHandlerと同じ二段階choiceパターン：発生源の持ち主（own）→相手（opponent）の
// 順に、フィールド（両陣営どちらでも可）から1体を指定させる。進捗はaction.chosenOwn/chosenOpp/awaitingで持ち回る。
// 二段階目の選択はrequestChoiceのpidに相手を渡すが、実行者（resolveActionのowner引数）は
// 発生源の持ち主のまま解決する（destroyAllExceptChosenColorsと同じ「相手に選ばせて自分の効果として解決する」形）
const mutualDestroyChoiceHandler: ActionHandler<"mutualDestroyChoice"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, targetInstanceId, destroyContext } = ctx
    // keywordExclude（BS09-016闇騎士モルドレッド＝【転召】を持たない）：候補から除外する。
    // 一時付与・継続付与も見るので spiritHasKeyword で判定する
    const eligible = (pid: PlayerId, s: CardInstance): boolean =>
        action.keywordExclude === undefined || !spiritHasKeyword(state, pid, s, action.keywordExclude)
    const allSpiritIds = (): string[] => [
        ...state.players.p1.field.spirits.filter((s) => eligible("p1", s)).map((s) => s.instanceId),
        ...state.players.p2.field.spirits.filter((s) => eligible("p2", s)).map((s) => s.instanceId),
    ]

    let chosenOwn = action.chosenOwn
    let chosenOpp = action.chosenOpp

    if (state.interactiveTargets) {
        if (action.awaiting === "own" && targetInstanceId !== undefined) chosenOwn = targetInstanceId
        if (action.awaiting === "opponent" && targetInstanceId !== undefined) chosenOpp = targetInstanceId

        if (chosenOwn === undefined) {
            requestChoice(
                state,
                owner,
                `${sourceName}：破壊するスピリットを選んでください`,
                allSpiritIds(),
                false,
                { ...action, awaiting: "own", ...(chosenOpp !== undefined ? { chosenOpp } : {}) },
                self,
            )
            return
        }
        if (chosenOpp === undefined) {
            requestChoice(
                state,
                opp,
                `${sourceName}：破壊するスピリットを選んでください`,
                allSpiritIds(),
                false,
                { ...action, awaiting: "opponent", chosenOwn },
                self,
            )
            // 選ぶのは相手だが、実行者は発生源の持ち主のまま（destroyAllExceptChosenColorsと同じ）
            if (state.pendingChoice) state.pendingChoice.actorPid = owner
            return
        }
    } else {
        // 非対話時：各プレイヤーが「相手フィールドの実効BP最大」を自動選択する
        // （プレイヤー選択の決定的簡略化。pickEnemyByBpと同じ考え方。相手フィールドが空なら自分フィールドから選ぶ）
        const pickMaxBp = (fromPid: PlayerId, viewerPid: PlayerId): string | undefined => {
            const spirits = state.players[fromPid].field.spirits.filter((s) => eligible(fromPid, s))
            if (spirits.length === 0) return undefined
            return spirits.reduce((best, s) =>
                effectiveBp(state, fromPid, s) > effectiveBp(state, fromPid, best) ? s : best,
            ).instanceId
        }
        if (chosenOwn === undefined) chosenOwn = pickMaxBp(opp, owner) ?? pickMaxBp(owner, owner)
        if (chosenOpp === undefined) chosenOpp = pickMaxBp(owner, opp) ?? pickMaxBp(opp, opp)
    }

    const destroyedIds = new Set<string>()
    const batch: { pid: PlayerId; instanceId: string }[] = []
    for (const id of [chosenOwn, chosenOpp]) {
        if (id === undefined || destroyedIds.has(id)) continue
        const found = findSpiritAny(state, id)
        if (!found) continue
        if (!eligible(found.pid, found.inst)) continue
        destroyedIds.add(id)
        batch.push({ pid: found.pid, instanceId: found.inst.instanceId })
    }
    if (batch.length > 0) destroyTargetsBatch(state, owner, batch, destroyContext)
    if (destroyedIds.size === 0) log(state, `${sourceName}：対象がいなかった。`)
    return
}

// mutualDestroyChoiceの否定版（BS12-015冥王神龍クロノ・ハデス【合体時】『破壊時』）：
// 「お互い、それぞれのスピリット1体を指定する。指定されなかったスピリットすべてを破壊する」。
// 二段階choiceパターンは同じだが、各自は**自分の**フィールドから1体だけを指定できる
// （mutualDestroyChoiceは相手フィールドも選べる点が違う）。破壊待機中の発生源自身（self）は
// 指定候補に含めない（2026-09-06ユーザー確認：クロノ・ハデス自身は既に破壊待機中でこの効果を解決している）。
// 指定された2体を除く両陣営のスピリットすべてを破壊する
const mutualKeepChoiceHandler: ActionHandler<"mutualKeepChoice"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, targetInstanceId, destroyContext } = ctx
    const candidatesOf = (pid: PlayerId): string[] =>
        state.players[pid].field.spirits
            .filter((s) => !self || s.instanceId !== self.instanceId)
            .map((s) => s.instanceId)

    let chosenOwn = action.chosenOwn
    let chosenOpp = action.chosenOpp

    if (state.interactiveTargets) {
        if (action.awaiting === "own" && targetInstanceId !== undefined) chosenOwn = targetInstanceId
        if (action.awaiting === "opponent" && targetInstanceId !== undefined) chosenOpp = targetInstanceId

        if (chosenOwn === undefined) {
            requestChoice(
                state,
                owner,
                `${sourceName}：残す自分のスピリットを指定してください`,
                candidatesOf(owner),
                false,
                { ...action, awaiting: "own", ...(chosenOpp !== undefined ? { chosenOpp } : {}) },
                self,
            )
            return
        }
        if (chosenOpp === undefined) {
            requestChoice(
                state,
                opp,
                `${sourceName}：残す自分のスピリットを指定してください`,
                candidatesOf(opp),
                false,
                { ...action, awaiting: "opponent", chosenOwn },
                self,
            )
            // 選ぶのは相手だが、実行者は発生源の持ち主のまま（mutualDestroyChoiceと同じ）
            if (state.pendingChoice) state.pendingChoice.actorPid = owner
            return
        }
    } else {
        // 非対話時：各自が自分のフィールドの実効BP最大を自動選択（決定的簡略化）
        const pickMaxBp = (pid: PlayerId): string | undefined => {
            const spirits = state.players[pid].field.spirits.filter((s) => !self || s.instanceId !== self.instanceId)
            if (spirits.length === 0) return undefined
            return spirits.reduce((best, s) =>
                effectiveBp(state, pid, s) > effectiveBp(state, pid, best) ? s : best,
            ).instanceId
        }
        if (chosenOwn === undefined) chosenOwn = pickMaxBp(owner)
        if (chosenOpp === undefined) chosenOpp = pickMaxBp(opp)
    }

    const keep = new Set([chosenOwn, chosenOpp].filter((id): id is string => id !== undefined))
    const batch: { pid: PlayerId; instanceId: string }[] = []
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const sp of state.players[pid].field.spirits) {
            if (self && sp.instanceId === self.instanceId) continue // 破壊待機中の発生源自身は対象外
            if (keep.has(sp.instanceId)) continue
            batch.push({ pid, instanceId: sp.instanceId })
        }
    }
    if (batch.length > 0) destroyTargetsBatch(state, owner, batch, destroyContext)
    else log(state, `${sourceName}：破壊されるスピリットがいなかった。`)
    return
}

// BS01-104 千本槍の古戦場Lv2：このネクサス上のコア1個をトラッシュに置くことで、
// 相手のブロックしたスピリット1体を「バトル終了後に破壊する」予約を立てる（BattleState.endBattleDestroy）。
// **ここでは破壊しない**。実際の破壊は GameEngine のバトル解決＞７（【呪撃】の直後）で
// 通常の destroy 経路を通すので、装甲・効果耐性はその時点で判定される。
// self は発生源のネクサス自身（データ側で fieldEvent.selfMode:"source" を指定する）
const destroyBlockerAfterBattleHandler: ActionHandler<"destroyBlockerAfterBattle"> = (ctx) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    const battle = state.battle
    if (!self) return
    const blockerId = targetInstanceId ?? battle?.blockerInstanceId ?? undefined
    if (!battle || blockerId === undefined) {
        log(state, `${sourceName}：ブロックしたスピリットがいなかった。`)
        return
    }
    const found = findSpiritAny(state, blockerId)
    if (!found || found.pid === owner) {
        log(state, `${sourceName}：ブロックしたスピリットがいなかった。`)
        return
    }
    // コスト（ネクサスのコアをトラッシュへ）は pay の cost 側。**支払いでLv2を割っても予約は残る**
    // （発揮はコストを払った時点で成立している。2026-08-16 ユーザー確認）
    const list = battle.endBattleDestroy ?? []
    list.push({
        targetInstanceId: found.inst.instanceId,
        sourceInstanceId: self.instanceId,
        sourcePid: owner,
        sourceColors: instColors(self),
    })
    battle.endBattleDestroy = list
    log(
        state,
        `${sourceName}：${getCard(found.inst.cardId).name}をバトル終了後に破壊する。`,
    )
}

// 破壊で誘発した効果を1列に並べたときの、「破壊されたカード自身の『破壊時』ぜんぶ」1グループ分。
// 同じカードの複数エントリはテキスト順で解決する（＝同時発揮ではない。TIMING_CHART.md §0-3 の粒度）
const resolveOwnDestroyTriggersHandler: ActionHandler<"resolveOwnDestroyTriggers"> = (ctx, action) => {
    const { state } = ctx
    const found = findSpiritAny(state, action.instanceId)
    // 列に並べたあとで場から消えた／破壊が無かったことになった個体は発揮しない
    if (!found || found.inst.pendingDestruction !== true) return
    fireTrigger(state, found.pid, found.inst, "onDestroy", undefined, undefined, undefined, action.byOpponent === true)
}

// 同じ列の「フィールドに残る／戻る」1グループ分。適用できたらその破壊は無かったことになり、
// 列に残っている項目は requiresPendingDestructionOf のガードで空振りする
const applyReviveOnDestroyHandler: ActionHandler<"applyReviveOnDestroy"> = (ctx, action) => {
    const { state } = ctx
    const found = findSpiritAny(state, action.instanceId)
    if (!found || found.inst.pendingDestruction !== true) return
    applyReviveEntry(state, found.pid, found.inst, action.effectId, found.inst.pendingDestroyContext)
}

// 同じ列の【不死】1枚分。トラッシュの位置ではなくカードIDで引き直す
// （先に別の【不死】が召喚されているとトラッシュがずれるため）
const resolveFushiSummonHandler: ActionHandler<"resolveFushiSummon"> = (ctx, action) => {
    const { state } = ctx
    const trashIndex = state.players[action.pid].trashCards.indexOf(action.cardId)
    if (trashIndex < 0) return
    fushiSummonOrConfirm(state, action.pid, trashIndex)
}

// 破壊したカードを lastMoved に残す（if の cond.last・カウンタ lastCost が読む。IF_UNIFY.md §5）
const destroyRecordedHandler: ActionHandler<"destroy"> = (ctx, action) => {
    const { count } = action
    const scope = currentRecordScope(ctx.state)
    const ids = recordDestroysOf(ctx.destroyContext, () =>
        count === "any" ? destroyOwnSpiritsAny(ctx, action) : destroyHandler(ctx, { ...action, count }),
    )
    recordMoved(ctx.state, ids, scope)
}

const destroyNexusEntryHandler: ActionHandler<"destroyNexus"> = (ctx, action) => {
    const { count } = action
    if (count === "any") destroyOwnNexusesAny(ctx, action)
    else destroyNexusHandler(ctx, { ...action, count })
}

// count:"any"（「自分の〜を好きなだけ」）の選び方。対話は複数選んで確定（選び直し可）、非対話は候補すべて。
// 途中経過は action.chosenIds／choosing で持ち回る。選択待ちを立てたら null
function chooseOwnAny(ctx: ActionCtx, action: DestroyAction | DestroyNexusAction, candidates: string[], noun: string): string[] | null {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    if (!state.interactiveTargets) return candidates
    let chosen = [...(action.chosenIds ?? [])]
    if (action.choosing && targetInstanceId !== undefined) {
        chosen = chosen.includes(targetInstanceId) ? chosen.filter((id) => id !== targetInstanceId) : [...chosen, targetInstanceId]
    }
    chosen = chosen.filter((id) => candidates.includes(id))
    // スキップ（＝「これで破壊する」）で戻ってきたときだけ、聞き直さずに確定する
    if (action.choosing && targetInstanceId === undefined) return chosen
    if (candidates.length === 0) return []
    suspend(state, {
        pid: owner,
        kind: "target",
        prompt: `${sourceName}：破壊する自分の${noun}を選んでください（選んだものをもう一度押すと外れます）`,
        candidates,
        selectedIds: chosen,
        skipLabel: chosen.length > 0 ? `これで破壊する（${chosen.length}）` : "破壊しない",
        optional: true,
        resolveOnSkip: true,
        action: { ...action, choosing: true as const, chosenIds: chosen },
        selfInstanceId: self ? self.instanceId : null,
    })
    return null
}

// 選んだスピリットは同時に破壊する（同時破壊グループ。他カードの「破壊されたとき」はグループで1回）
function destroyOwnSpiritsAny(ctx: ActionCtx, action: DestroyAction): void {
    const { state, owner, self, sourceName, destroyContext } = ctx
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) return
    const candidates = state.players[owner].field.spirits
        .filter((sp) => !sp.pendingDestruction && matchesTarget(state, owner, sp, filter, self?.instanceId))
        .map((sp) => sp.instanceId)
    const chosen = chooseOwnAny(ctx, action, candidates, "スピリット")
    if (chosen === null) return
    if (chosen.length === 0) {
        log(state, `${sourceName}：スピリットを破壊しなかった。`)
        return
    }
    if (action.suppressOnDestroy) destroyContext.suppressOnDestroy = true
    destroyTargetsBatch(state, owner, chosen.map((instanceId) => ({ pid: owner, instanceId })), destroyContext)
}

// 破壊したネクサスを lastMoved に書く（「その破壊したネクサス1つにつき」）
function destroyOwnNexusesAny(ctx: ActionCtx, action: DestroyNexusAction): void {
    const { state, owner, sourceName, srcType } = ctx
    const scope = currentRecordScope(state)
    const candidates = state.players[owner].field.nexuses.map((n) => n.instanceId)
    const chosen = chooseOwnAny(ctx, action, candidates, "ネクサス")
    if (chosen === null) {
        recordMoved(state, [], scope)
        return
    }
    const destroyed: string[] = []
    for (const id of chosen) {
        const nexus = state.players[owner].field.nexuses.find((n) => n.instanceId === id)
        if (nexus && destroyNexus(state, owner, id, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })) destroyed.push(nexus.cardId)
    }
    recordMoved(state, destroyed, scope)
    log(state, destroyed.length > 0 ? `${sourceName}：自分のネクサス${destroyed.length}つを破壊した。` : `${sourceName}：ネクサスを破壊しなかった。`)
}

const handlers = {
    resolveFushiSummon: resolveFushiSummonHandler,
    resolveOwnDestroyTriggers: resolveOwnDestroyTriggersHandler,
    applyReviveOnDestroy: applyReviveOnDestroyHandler,
    destroyBlockerAfterBattle: destroyBlockerAfterBattleHandler,
    destroy: destroyRecordedHandler,
    mutualDestroyChoice: mutualDestroyChoiceHandler,
    mutualKeepChoice: mutualKeepChoiceHandler,
    destroyDuplicateNames: destroyDuplicateNamesHandler,
    destroyNexus: destroyNexusEntryHandler,
    destroyByCostBudget: destroyByCostBudgetHandler,
    destroyByBpBudget: destroyByBpBudgetHandler,
    destroyOwnByCost: destroyOwnByCostHandler,
    destroySelf: destroySelfHandler,
    nexusCoresToTrash: nexusCoresToTrashHandler,
    returnNexusToHand: returnNexusToHandHandler,
    reviveLastDestroyedNexus: reviveLastDestroyedNexusHandler,
} satisfies Partial<ActionRegistry>

export default handlers
