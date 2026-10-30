// 疲労・回復系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, Color, EffectAction, GameState, Keyword, PlayerId, TargetFilter } from "../../type"
import { currentLevel, getCard, log, minLevelCores } from "../GameState"
import { resolveInOrder } from "../GameState"
import { lastTargetsOf, recordTargets } from "../record"
import {
    canExhaustNexus,
    bothSidesPids,
    countEffectCounter,
    destroySpirit,
    exhaustSpirit,
    exhaustNexus,
    heavyExhaustSpirit,
    refreshSpirit,
    findSpiritAny,
    isResisted,
    askPayToNegateIfNeeded,
    gateTargetedApply,
    resistanceAgainst,
    pickAnySideCandidates,
    pickEnemyByBp,
    pickEnemyCandidates,
    requestChoice,
    requestUpToChoice,
    returnSpiritToDeckTop,
    returnSpiritToHand,
    tryInteractiveTargetChoice,
    hasBofuChooserSelf,
    bofuCountFor,
    continuousKeywordGrantCount,
    recordTimed,
} from "../EffectModules"
import { KEYWORDS, timedContentsOn, cardNameContains, effectActiveAtLevel, effectiveBp, hasArmorAgainst, hasFullEffectImmunity, hasMagicImmunity, instColors, instHasColor, instHasCost, isVanillaCard, matchesFamilyFilter, matchesTarget, spiritHasFamily, spiritHasKeyword, instMatchesCostFilter, instIsCombined, bravesOf } from "../../../../shared/rules"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"
import { detachBraveByEffect } from "../brave"
import { COLOR_LABELS } from "../../../../data/constants"
import { countedAmount } from "../counted"
import { kyoshuLimitOf, kyoshuUsedOf } from "../keywords/kyoshu"

// 疲労させたときのログ。**どのカードの効果で疲労したのか**が対戦者に分かるように発生源を前に置く
// （2026-08-10 ユーザー要望。【暴風】由来のときはキーワード名まで出す＝颶風高原がどれを戻すのか追えるように）
function exhaustLog(sourceName: string, targetName: string, byBofu: boolean): string {
    return `${sourceName}${byBofu ? "の【暴風】" : ""}：${targetName}は疲労した。`
}

// count:"any" を解いたあとの形。本体は数値の count だけを扱う
type ExhaustNum = Omit<Extract<EffectAction, { type: "exhaust" }>, "count"> & { count: number }

const exhaustHandler: ActionHandler<"exhaust"> = (ctx, action) => {
    if (action.count !== "any") return exhaustCore(ctx, action as ExhaustNum)
    const { state, owner, opp, self, sourceName, srcType, targetInstanceId } = ctx
    // 好きなだけ（0体以上）。自分側は選ぶたびに残りの候補で聞き直し、非対話は候補すべて
    if (action.side === "own") {
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}の疲労付与：BP参照元がいなかった。`)
            return
        }
        // 疲労状態も対象に選べる（2026-10-22 ユーザー裁定）が、「好きなだけ」では選んでも何も起きず記録にも入らない
        // （BS18-080 の BP 合計は実際に疲労させた分だけ）。聞き直しで同じ個体を選び続けられるので、候補から外す
        const matches = (s: CardInstance) => matchesTarget(state, owner, s, filter, self?.instanceId) && !action.excludeIds?.includes(s.instanceId)
        const candidates = () => state.players[owner].field.spirits.filter((s) => matches(s) && !s.isRested)
        const ask = (picked?: string) =>
            requestUpToChoice(
                state,
                owner,
                `${sourceName}：疲労させる自分のスピリットを選んでください（好きなだけ）`,
                candidates().filter((s) => s.instanceId !== picked).map((s) => s.instanceId),
                { ...action, excludeIds: [...(action.excludeIds ?? []), ...(picked ? [picked] : [])] },
                self,
            )
        if (targetInstanceId !== undefined) {
            const found = candidates().find((s) => s.instanceId === targetInstanceId)
            if (!found) {
                log(state, `${sourceName}の疲労付与：対象がいなかった。`)
                return
            }
            // excludeIds は「この効果で疲労させた個体」だけを積む（選択の再入ごとに記録の枠が変わるため、記録の累積もここから作る）。
            // 疲労状態の個体は選べるが積まないので、聞き直しの候補に残る
            const sofar = action.excludeIds ?? []
            const exhaustedNow = !found.isRested
            if (exhaustedNow) {
                exhaustSpirit(state, owner, found, undefined, owner, srcType)
                log(state, exhaustLog(sourceName, getCard(found.cardId).name, false))
                recordTargets(state, [...sofar, found.instanceId])
            } else {
                recordTargets(state, sofar)
                log(state, `${getCard(found.cardId).name}はすでに疲労している。`)
            }
            if (state.interactiveTargets) ask(exhaustedNow ? found.instanceId : undefined)
            return
        }
        if (state.interactiveTargets) {
            ask()
            return
        }
        const all = candidates()
        for (const s of all) {
            exhaustSpirit(state, owner, s, undefined, owner, srcType)
            log(state, exhaustLog(sourceName, getCard(s.cardId).name, false))
        }
        if (all.length === 0) log(state, `${sourceName}の疲労付与：対象がいなかった。`)
        else recordTargets(state, all.map((s) => s.instanceId))
        return
    }
    // 相手側・anySide は「上限=その場のスピリット数」の upTo に畳む（絞り込みで候補が減る分は本体が見る）
    const n = state.players[opp].field.spirits.length + (action.anySide ? state.players[owner].field.spirits.length : 0)
    if (n === 0) {
        log(state, `${sourceName}の疲労付与：対象がいなかった。`)
        return
    }
    exhaustCore(ctx, { ...action, count: n, upTo: true })
}

const exhaustCore = (ctx: ActionCtx, action: ExhaustNum): void => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 回復状態の体数から逆算した count で既存の経路に合流する
        if (action.untilRefreshedCount !== undefined) {
            const side = action.side === "own" ? owner : opp
            const readyCount = state.players[side].field.spirits.filter((s) => !s.isRested).length
            const n = Math.max(0, readyCount - action.untilRefreshedCount)
            const { untilRefreshedCount: _urc, ...rest } = action
            if (n === 0) {
                log(state, `${sourceName}：すでに条件を満たしているため疲労させなかった。`)
                return
            }
            action = { ...rest, count: n }
        }
        if (action.nexusOnly) {
            exhaustOwnNexus(ctx, action)
            return
        }
        if (action.nexus) {
            exhaustNexusOrSpirit(ctx, action)
            return
        }
        if (action.all) {
            exhaustAllTargets(ctx, action)
            return
        }
        // target:"self"：発生源自身（スピリット／ネクサス）を疲労させる。pay のコストもデータ由来の「このスピリットを疲労させる」も同じ経路。
        // fieldEvent で self が相手側のイベント対象のときだけ、持ち主と実行者が異なり耐性を見る
        if (action.target === "self") {
            if (!self) {
                log(state, `${sourceName}：疲労対象がいなかった。`)
                return
            }
            if (self.isRested) {
                log(state, `${getCard(self.cardId).name}はすでに疲労状態のため何もしなかった。`)
                return
            }
            const selfPid = findSpiritAny(state, self.instanceId)?.pid ?? owner
            if (selfPid !== owner && isResisted(state, selfPid, self, attemptOf(ctx, "exhaust", "area"))) {
                log(state, `${getCard(self.cardId).name}は${sourceName}の効果を受けないため疲労しなかった。`)
                return
            }
            exhaustSpirit(state, selfPid, self, undefined, owner, srcType)
            log(state, exhaustLog(sourceName, getCard(self.cardId).name, false))
            return
        }
        // side:"own"（pay の cost 用）：相手ではなく自分のスピリットを疲労させる
        if (action.side === "own") {
            const filter = normalizeFilter(ctx, action)
            if (filter === SELF_REQUIRED) {
                log(state, `${sourceName}の疲労付与：BP参照元がいなかった。`)
                return
            }
            const matchesOwn = (s: CardInstance) => !s.isRested && matchesTarget(state, owner, s, filter, self?.instanceId)
            if (targetInstanceId !== undefined) {
                const found = state.players[owner].field.spirits.find((s) => s.instanceId === targetInstanceId)
                if (!found || !matchesOwn(found)) {
                    log(state, `${sourceName}の疲労付与：対象がいなかった。`)
                    return
                }
                exhaustSpirit(state, owner, found, undefined, owner, srcType)
                log(state, exhaustLog(sourceName, getCard(found.cardId).name, false))
                recordTargets(state, [found.instanceId])
                return
            }
            const candidates = state.players[owner].field.spirits.filter(matchesOwn)
            const { count: _ownCount, ...restForChoice } = action
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}：疲労させる自分のスピリットを選んでください`,
                    candidates,
                    { ...restForChoice, count: 1 },
                    action.count > 1 ? { ...restForChoice, count: action.count - 1 } : null,
                )
            ) {
                return
            }
            // 自動選択は実効BP最小（コストとして失う損が小さい方）。autoPickMaxBp は疲労させた個体のBPが
            // そのまま得になる効果（BP+(疲労させたスピリットのBP)）用で、BP最大を選ぶ
            const exhausted: string[] = []
            const better = (a: number, b: number) => (action.autoPickMaxBp ? a > b : a < b)
            for (let i = 0; i < action.count; i++) {
                const target = state.players[owner].field.spirits
                    .filter(matchesOwn)
                    .reduce<CardInstance | undefined>(
                        (worst, s) =>
                            !worst || better(effectiveBp(state, owner, s), effectiveBp(state, owner, worst)) ? s : worst,
                        undefined,
                    )
                if (!target) {
                    log(state, `${sourceName}の疲労付与：対象がいなかった。`)
                    break
                }
                exhaustSpirit(state, owner, target, undefined, owner, srcType)
                log(state, exhaustLog(sourceName, getCard(target.cardId).name, false))
                exhausted.push(target.instanceId)
            }
            recordTargets(state, exhausted)
            return
        }
        // countFromBofu（【暴風】の onBlocked エントリ）：カード側の固定 count ではなく、
        // 実効指定数（静的 count ＋ bofuCountBonus）で解決し直す。BS08ゲラン准将Lv2 の
        // 「自分のスピリットすべての【暴風】の指定数を+1する」はこの経路でだけ届く
        if (action.countFromBofu) {
            const bofu = self ? bofuCountFor(state, owner, self) : 0
            if (bofu === 0) {
                log(state, `${sourceName}：【暴風】を持たないため疲労させなかった。`)
                return
            }
            // フラグは**ここで落とす**。残したまま interactive の再入（count-1 の派生 action）へ
            // 引き継ぐと、再入のたびに実効指定数へ戻って疲労が止まらなくなる
            // bofuSource は落とさずに立てる：選択の再入（count-1 の派生 action や chooserIsTarget の
            // 差し替え）をまたいで「この疲労は【暴風】由来」を持ち回るため
            const { countFromBofu: _resolved, ...rest } = action
            action = { ...rest, count: bofu, bofuSourcePid: owner }
        }
        // countCounter（BS10-029木星神龍ノブナガード・ゼウシス「自分の合体スピリット1体につき」）：
        // count×EffectCounterの値を疲労させる体数として使う（coreRemove.countCounterと同型）
        if (action.countCounter !== undefined) {
            const n = countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
            const { countCounter: _cc, ...restCc } = action
            if (n === 0) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            action = { ...restCc, count: n }
        }
        // 絞り込みは共通の TargetFilter に一本化（level/cost の2軸）
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}の疲労付与：BP参照元がいなかった。`)
            return
        }
        // excludeTarget（BS01甲精ディース）：誘発から渡ってくる targetInstanceId（＝ブロッカー）は
        // 疲労させる対象ではなく**除外する**対象。以降の候補判定から外し、明示ターゲット扱いもしない
        const excludedId = action.excludeTarget ? targetInstanceId : undefined
        // BS07ワールウィンド：【暴風】で疲労させる対象を、疲労させられる側ではなく持ち主自身が選ぶ。
        // 以降は chooserIsTarget を落とした action として扱う（選択者と表示プロンプトが切り替わる）
        if (action.chooserIsTarget && hasBofuChooserSelf(state, owner)) {
            const { chooserIsTarget: _dropped, ...rest } = action
            log(state, `${sourceName}：【暴風】で疲労させる相手のスピリットを自分で指定する。`)
            // targetInstanceId（excludeTarget が除外に使うブロッカー）と発生源の色・種別は
            // 明示的に引き継ぐ（ctx.resolve は省略すると undefined を渡す設計のため）
            ctx.resolve(rest, { targetInstanceId, sourceColors: srcColors, sourceType: srcType })
            return
        }
        const matchesLevel = (s: CardInstance) =>
            s.instanceId !== excludedId && matchesTarget(state, opp, s, filter, self?.instanceId)
        // 未指定時（自動選択・対象choice共通）は対象が常に相手側（opp）のため、疲労免疫を無条件でフィルタする
        // 疲労耐性は候補列挙（pickEnemy*）へ op:"exhaust" を渡すことで効く
        const matchesCandidate = (s: CardInstance) => !s.isRested && matchesLevel(s) && !action.excludeIds?.includes(s.instanceId)
        // 対象指定時はその1体のみ処理（既に疲労済み・levelFilter不一致ならログを出して何もしない）
        if (targetInstanceId && !action.excludeTarget) {
            const found = findSpiritAny(state, targetInstanceId)
            if (!found) {
                log(state, `${sourceName}の疲労付与：対象がいなかった。`)
                return
            }
            const exhaustAttempt = attemptOf(ctx, "exhaust", "targeted")
            // excludeIds 付き＝count 体を1体ずつ選んでいる途中。この1体の処理が済んだら（受けなかった場合も含め）残りを選び直す
            const chainNext = (): void => {
                if (action.excludeIds === undefined || action.count <= 1) return
                ctx.resolve({ ...action, count: action.count - 1, excludeIds: [...action.excludeIds, found.inst.instanceId] }, { sourceColors: srcColors, sourceType: srcType })
            }
            // 「手札を破棄することで効果を受けない」は払うかを守る側に聞いてから判定する（BS08竜騎集う円卓Lv2）
            if (askPayToNegateIfNeeded(state, found.pid, found.inst, exhaustAttempt, action, self, sourceName)) return
            const resisted = resistanceAgainst(state, found.pid, found.inst, exhaustAttempt)
            if (resisted) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                chainNext()
                return
            }
            if (!matchesLevel(found.inst)) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の対象条件を満たさない。`)
                chainNext()
                return
            }
            if (found.inst.isRested) {
                log(
                    state,
                    `${getCard(found.inst.cardId).name}はすでに疲労している。`,
                )
                chainNext()
                return
            }
            exhaustSpirit(state, found.pid, found.inst, action.bofuSourcePid, action.bofuSourcePid ?? owner, action.bofuSourcePid !== undefined ? "spirit" : srcType, self?.instanceId)
            log(state, exhaustLog(sourceName, getCard(found.inst.cardId).name, action.bofuSourcePid !== undefined))
            // noRefreshUntilOwnEndSteps（BS12-078カシオペアシール）：疲労させた「そのスピリット」に立てる
            if (action.noRefreshUntilOwnEndSteps !== undefined) {
                found.inst.noRefreshUntilOwnEndSteps = action.noRefreshUntilOwnEndSteps
                log(state, `${getCard(found.inst.cardId).name}：『自分のエンドステップ』を${action.noRefreshUntilOwnEndSteps}回行うまで回復できない。`)
            }
            chainNext()
            // upTo：1体処理するたびに残数で聞き直す（再開スタックには積まない。2026-09-28）
            if (action.upTo) {
                recordTargets(state, [found.inst.instanceId])
                const remaining = action.count - 1
                if (remaining > 0) {
                    const nextCandidates = (
                        action.anySide
                            ? pickAnySideCandidates(state, owner, (sp) => !sp.isRested && matchesLevel(sp), srcColors, srcType, "exhaust")
                            : pickEnemyCandidates(state, opp, Infinity, matchesCandidate, srcColors, srcType, "exhaust")
                    ).map((s) => s.instanceId)
                    requestUpToChoice(
                        state,
                        owner,
                        action.anySide
                            ? `${sourceName}：疲労させるスピリットを選んでください（あと${remaining}体まで）`
                            : action.chooserIsTarget
                              ? `${sourceName}：疲労させる自分のスピリットを選んでください（あと${remaining}体まで）`
                              : `${sourceName}の疲労付与：対象を選んでください（あと${remaining}体まで）`,
                        nextCandidates,
                        { ...action, count: remaining },
                        self,
                        action.chooserIsTarget ? opp : undefined,
                    )
                }
            }
            return
        }
        // interactive の選択後に再入するときは excludeTarget を落とす。
        // 残したままだと、プレイヤーが選んだ instanceId を「除外する対象」と誤読して自動選択に落ちてしまう
        const { excludeTarget: _excludeTarget, ...actionForChoice } = action
        // anySide：「自分か相手のスピリット1体を疲労させる」（BS03-104 運命分かつ岐路／BS04-042 ドヴェルグ）。
        // 自分側は疲労免疫・装甲の対象外（既存の anySide 系と同じ非対称ルール）
        if (action.anySide) {
            const candidates = pickAnySideCandidates(
                state,
                owner,
                (sp) => !sp.isRested && matchesLevel(sp),
                srcColors,
                srcType,
                "exhaust",
            )
            if (action.upTo && state.interactiveTargets) {
                requestUpToChoice(
                    state,
                    owner,
                    `${sourceName}：疲労させるスピリットを選んでください（あと${action.count}体まで）`,
                    candidates.map((sp) => sp.instanceId),
                    actionForChoice,
                    self,
                )
                return
            }
            if (
                state.interactiveTargets &&
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}：疲労させるスピリットを選んでください`,
                    candidates,
                    { ...actionForChoice, count: 1 },
                    action.count > 1 ? { ...actionForChoice, count: action.count - 1 } : null,
                )
            ) {
                return
            }
            // 自動時は実効BP最大から順に count 体（相手側→自分側の順で同値は先勝ち）。
            // count を見ずに1体で打ち切ると「スピリット2体までを疲労させる」（BS01-036 シャ・ズー）が
            // 半分しか効かないため、選んだ個体を除きながら count 回繰り返す
            let exhausted = 0
            for (let i = 0; i < action.count; i++) {
                const target = candidates
                    .filter((sp) => !sp.isRested)
                    .reduce<CardInstance | undefined>(
                        (best, sp) =>
                            !best || effectiveBp(state, owner, sp) > effectiveBp(state, owner, best)
                                ? sp
                                : best,
                        undefined,
                    )
                if (!target) break
                // anySide なので疲労するのは自分か相手か分からない。「疲労したとき」の誘発を
                // 正しい持ち主のフィールドから発火させるため、どちらの場にいるかを引き直す
                const targetPid = state.players[owner].field.spirits.includes(target) ? owner : opp
                exhaustSpirit(state, targetPid, target, action.bofuSourcePid, action.bofuSourcePid ?? owner, action.bofuSourcePid !== undefined ? "spirit" : srcType, self?.instanceId)
                exhausted += 1
                log(state, exhaustLog(sourceName, getCard(target.cardId).name, action.bofuSourcePid !== undefined))
            }
            if (exhausted === 0) {
                log(state, `${sourceName}の疲労付与：対象がいなかった。`)
            }
            return
        }
        if (state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, Infinity, matchesCandidate, srcColors, srcType, "exhaust")
            if (action.upTo) {
                requestUpToChoice(
                    state,
                    owner,
                    action.chooserIsTarget
                        ? `${sourceName}：疲労させる自分のスピリットを選んでください（あと${action.count}体まで）`
                        : `${sourceName}の疲労付与：対象を選んでください（あと${action.count}体まで）`,
                    candidates.map((s) => s.instanceId),
                    actionForChoice,
                    self,
                    action.chooserIsTarget ? opp : undefined,
                )
                return
            }
            // chooserIsTarget（【暴風】）：疲労させられる側が自分で対象を選ぶ。
            // 解決は発生源の持ち主の効果として行う（tryInteractiveTargetChoice が actorPid を立てる）
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    action.chooserIsTarget
                        ? `${sourceName}：疲労させる自分のスピリットを選んでください`
                        : `${sourceName}の疲労付与：対象を選んでください`,
                    candidates,
                    action.count > 1 ? { ...actionForChoice, excludeIds: action.excludeIds ?? [] } : { ...actionForChoice, count: 1 },
                    null,
                    action.chooserIsTarget ? opp : undefined,
                )
            ) {
                return
            }
        }
        // 未指定時は相手フィールドの回復状態（かつlevelFilter一致）スピリットからBP最大をcount回自動選択。
        // 1体ごとに適用の直前で耐性（手札を破棄して受けない、を含む）を通す。
        // 受けなかった対象は回復状態のままなので、次の回で同じ対象を選び直さないよう除く。
        // 対話中にここへ来るのは候補が0〜1体のときだけ（2体以上は上の選択に回る）なので、
        // 聞いて中断しても再開スタックに積む残りは無い
        const handled = new Set<string>()
        let noTarget = false
        const oneAction = { ...actionForChoice, count: 1 }
        resolveInOrder(state, Array.from({ length: state.interactiveTargets ? Math.min(action.count, 1) : action.count }, (_, i) => i), {
            frame: () => ({ kind: "action", selfInstanceId: self ? self.instanceId : null, action: oneAction }),
            resolve: () => {
                const target = pickEnemyByBp(
                    state,
                    opp,
                    Infinity,
                    (s) => matchesCandidate(s) && !handled.has(s.instanceId),
                    srcColors,
                    srcType,
                    "exhaust",
                )
                if (!target) {
                    log(state, `${sourceName}の疲労付与：対象がいなかった。`)
                    noTarget = true
                    return
                }
                handled.add(target.instanceId)
                const resisted = gateTargetedApply(state, opp, target, attemptOf(ctx, "exhaust", "targeted"), oneAction, self, sourceName)
                if (resisted === "asked") return
                if (resisted) {
                    log(state, `${getCard(target.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                    return
                }
                exhaustSpirit(state, opp, target, action.bofuSourcePid, action.bofuSourcePid ?? owner, action.bofuSourcePid !== undefined ? "spirit" : srcType, self?.instanceId)
                log(state, exhaustLog(sourceName, getCard(target.cardId).name, action.bofuSourcePid !== undefined))
                // noRefreshUntilOwnEndSteps（BS12-078カシオペアシール）：疲労させた「そのスピリット」に立てる
                if (action.noRefreshUntilOwnEndSteps !== undefined) {
                    target.noRefreshUntilOwnEndSteps = action.noRefreshUntilOwnEndSteps
                    log(state, `${getCard(target.cardId).name}：『自分のエンドステップ』を${action.noRefreshUntilOwnEndSteps}回行うまで回復できない。`)
                }
            },
            skip: () => noTarget,
        })
        return
}

// 「すべて」の疲労は範囲の効果（attempt が "area"）。両陣営は bothSidesPids（封印された魔導書の片側への変更を見る）
function exhaustAllTargets(ctx: ActionCtx, action: { filter?: TargetFilter; anySide?: true }): void {
    const { state, owner, opp, self, sourceName, srcType } = ctx
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) {
        log(state, `${sourceName}：条件の参照元がいなかった。`)
        return
    }
    const sides: PlayerId[] = action.anySide ? bothSidesPids(state, srcType) : [opp]
    let exhausted = 0
    for (const pid of sides) {
        for (const s of [...state.players[pid].field.spirits]) {
            if (s.isRested) continue
            if (!matchesTarget(state, pid, s, filter, self?.instanceId)) continue
            if (isResisted(state, pid, s, attemptOf(ctx, "exhaust", "area"))) continue
            exhaustSpirit(state, pid, s, undefined, owner, srcType)
            exhausted++
        }
    }
    log(state, `${sourceName}：条件を満たす${exhausted}体を疲労させた。`)
}

// 対話時はスピリットとネクサスを同じ候補一覧に並べて使用者が1つずつ選ぶ（2026-09-27 ユーザー決定）。
// ネクサスには疲労の耐性を持つカードが無いので耐性判定をしない
// 自分のネクサス1つを疲労させるコスト（pay の cost 用。count は 1 のみ対応）。
// 2つ以上あるとき対話中は持ち主が選ぶ。非対話はコア数最少（同数はフィールドの先頭側）
function exhaustOwnNexus(ctx: ActionCtx, action: ExhaustNum): void {
    const { state, owner, self, sourceName, srcType, targetInstanceId } = ctx
    if (!canExhaustNexus(state, owner)) {
        log(state, `${sourceName}：ネクサスを疲労させられないため発動しなかった。`)
        return
    }
    const candidates = state.players[owner].field.nexuses.filter((n) => !n.isRested)
    if (candidates.length === 0) {
        log(state, `${sourceName}：疲労させられる自分のネクサスがなかった。`)
        return
    }
    let nexus = candidates.length === 1 ? candidates[0] : undefined
    if (nexus === undefined && targetInstanceId !== undefined) nexus = candidates.find((n) => n.instanceId === targetInstanceId)
    if (nexus === undefined && state.interactiveTargets) {
        requestChoice(state, owner, `${sourceName}：疲労させる自分のネクサスを選んでください`, candidates.map((n) => n.instanceId), false, action, self)
        return
    }
    if (nexus === undefined) nexus = [...candidates].sort((a, b) => a.cores - b.cores)[0]
    if (!nexus) return
    exhaustNexus(state, owner, nexus, owner, srcType)
    log(state, exhaustLog(sourceName, getCard(nexus.cardId).name, false))
    recordTargets(state, [nexus.instanceId])
}

function exhaustNexusOrSpirit(ctx: ActionCtx, action: ExhaustNum): void {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const oppField = state.players[opp].field
    const nexusCandidates = () => oppField.nexuses.filter((n) => !n.isRested)
    const spiritCandidates = () =>
        action.nexus === "also"
            ? oppField.spirits.filter((s) => !s.isRested && !isResisted(state, opp, s, { ...attemptOf(ctx, "exhaust", action.all ? "area" : "targeted"), probing: true }))
            : []
    const label = action.nexus === "also" ? "スピリット/ネクサス" : "ネクサス"

    if (action.all) {
        let exhausted = 0
        for (const s of spiritCandidates()) {
            if (exhaustSpirit(state, opp, s, undefined, owner, srcType)) exhausted++
        }
        for (const n of nexusCandidates()) {
            if (exhaustNexus(state, opp, n, owner, srcType)) exhausted++
        }
        log(state, `${sourceName}：相手の${label}${exhausted}個を疲労させた。`)
        return
    }

    const askNext = (remaining: number): void => {
        if (remaining <= 0) return
        requestUpToChoice(
            state,
            owner,
            `${sourceName}：疲労させる相手の${label}を選んでください（あと${remaining}つまで）`,
            [...spiritCandidates(), ...nexusCandidates()].map((c) => c.instanceId),
            { ...action, count: remaining },
            self,
        )
    }

    if (targetInstanceId !== undefined) {
        const nexus = nexusCandidates().find((n) => n.instanceId === targetInstanceId)
        const spirit = nexus ? undefined : spiritCandidates().find((s) => s.instanceId === targetInstanceId)
        if (spirit) {
            // 候補の列挙は数えるだけ（probing）。払う耐性の確認と判定は、適用するこの1体で行う
            const gate = gateTargetedApply(state, opp, spirit, attemptOf(ctx, "exhaust", "targeted"), action, self, sourceName)
            if (gate === "asked") return
            if (gate) {
                log(state, `${getCard(spirit.cardId).name}は${sourceName}の効果を受けなかった（${gate.label}）。`)
                askNext(action.count - 1)
                return
            }
        }
        if (nexus) exhaustNexus(state, opp, nexus, owner, srcType)
        else if (spirit) exhaustSpirit(state, opp, spirit, undefined, owner, srcType)
        else {
            log(state, `${sourceName}の疲労付与：対象がいなかった。`)
            return
        }
        const picked = (nexus ?? spirit)!
        log(state, exhaustLog(sourceName, getCard(picked.cardId).name, false))
        recordTargets(state, [picked.instanceId])
        askNext(action.count - 1)
        return
    }

    const count = action.count
    if (state.interactiveTargets && action.upTo) {
        askNext(count)
        return
    }
    // 非対話：スピリットを実効BP最大から優先し、残り枠をネクサスへ場の並び順で充てる
    let remaining = count
    let exhausted = 0
    const handled = new Set<string>()
    while (remaining > 0) {
        const target = spiritCandidates().filter((s) => !handled.has(s.instanceId)).reduce<CardInstance | undefined>(
            (best, s) => (!best || effectiveBp(state, opp, s) > effectiveBp(state, opp, best) ? s : best),
            undefined,
        )
        if (!target) break
        handled.add(target.instanceId)
        // 非対話では聞かない（払えるなら払う）ので "asked" は返らない
        const gate = gateTargetedApply(state, opp, target, attemptOf(ctx, "exhaust", "targeted"), action, self, sourceName)
        if (gate === "asked") return
        if (gate) {
            log(state, `${getCard(target.cardId).name}は${sourceName}の効果を受けなかった（${gate.label}）。`)
            remaining--
            continue
        }
        if (exhaustSpirit(state, opp, target, undefined, owner, srcType)) exhausted++
        remaining--
    }
    for (const n of nexusCandidates()) {
        if (remaining <= 0) break
        if (exhaustNexus(state, opp, n, owner, srcType)) exhausted++
        remaining--
    }
    if (exhausted === 0) {
        log(state, `${sourceName}：疲労させる対象がいなかった。`)
        return
    }
    log(state, `${sourceName}：相手の${label}${exhausted}個を疲労させた。`)
}

// 指定色のスピリットすべてを疲労させる（exhaustAllByColor の共通部分。自動選択・色choiceの双方から使う）
function exhaustSpiritsOfColor(ctx: ActionCtx, chosen: Color, side?: "opponent"): void {
    const { state, owner, opp, sourceName, srcColors, srcType } = ctx
    let exhausted = 0
    // side:"opponent" 指定時は相手のスピリットだけ（BS07大風車の丘。既定は両陣営）
    const pids: PlayerId[] = side === "opponent" ? [opp] : (["p1", "p2"] as PlayerId[])
    for (const pid of pids) {
        for (const s of [...state.players[pid].field.spirits]) {
            if (!instHasColor(s, chosen)) continue
            // 装甲・疲労免疫・範囲免疫は「相手の効果」を防ぐものなので、自分側のスピリットには適用しない
            if (isResisted(state, pid, s, attemptOf(ctx, "exhaust", "area"))) continue
            exhaustSpirit(state, pid, s, undefined, owner, srcType)
            exhausted++
        }
    }
    log(
        state,
        `${sourceName}：色「${COLOR_LABELS[chosen]}」を選び、${exhausted}体を疲労させた。`,
    )
}

// refresh の「own側・疲労状態・filter一致」の候補集め（all/eventTargetOnly/anySideは含まない、
// pay の then で使う既定経路のみ）。pay の checker（pay.ts）とこのハンドラで共有する
export function refreshOneOwnCandidates(
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    filter: import("../../type").ResolvedTargetFilter,
): CardInstance[] {
    return state.players[owner].field.spirits.filter(
        (s) => s.isRested && matchesTarget(state, owner, s, filter, self?.instanceId),
    )
}

const refreshOwnNexusHandler: ActionHandler<"refreshOwnNexus"> = (ctx, action) => {
    const { state, owner, self, sourceName, srcType, targetInstanceId } = ctx
    const candidates = state.players[owner].field.nexuses.filter((n) => n.isRested && !n.pendingDestruction)
    if (candidates.length === 0) {
        log(state, `${sourceName}の回復：回復できる自分のネクサスがなかった。`)
        return
    }
    let nexus: CardInstance | undefined
    if (action.chosenByPlayer && targetInstanceId !== undefined) nexus = candidates.find((n) => n.instanceId === targetInstanceId)
    else if (state.interactiveTargets) {
        const prompt = `${sourceName}：回復させる自分のネクサスを選んでください`
        const ids = candidates.map((n) => n.instanceId)
        if (action.upTo) requestUpToChoice(state, owner, prompt, ids, { ...action, chosenByPlayer: true }, self)
        else requestChoice(state, owner, prompt, ids, false, { ...action, chosenByPlayer: true }, self)
        return
    } else nexus = [...candidates].sort((a, b) => b.cores - a.cores)[0]
    if (!nexus) return
    nexus.isRested = false
    log(state, `${getCard(nexus.cardId).name}は回復した。`)
    recordTargets(state, [nexus.instanceId])
}

const heavyExhaustHandler: ActionHandler<"heavyExhaust"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    if (action.countCounter !== undefined) {
        const { countCounter, ...rest } = action
        const n = countEffectCounter(state, owner, self, countCounter, srcType)
        if (n <= 0) {
            log(state, `${sourceName}の重疲労：指定できる数が0だった。`)
            return
        }
        heavyExhaustHandler(ctx, { ...rest, count: n })
        return
    }
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) return
    const count = action.count ?? 1
    const candidates = (): CardInstance[] =>
        pickEnemyCandidates(state, opp, Infinity, (s) => !s.heavyRested && matchesTarget(state, opp, s, filter, self?.instanceId), srcColors, srcType, "exhaust")
    const apply = (target: CardInstance): void => {
        const resisted = resistanceAgainst(state, opp, target, attemptOf(ctx, "exhaust", "targeted"))
        if (resisted) {
            log(state, `${getCard(target.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
            return
        }
        if (action.escalate && !target.isRested) {
            exhaustSpirit(state, opp, target, undefined, owner, srcType)
            log(state, exhaustLog(sourceName, getCard(target.cardId).name, false))
            return
        }
        heavyExhaustSpirit(state, opp, target, owner, srcType)
        if (target.heavyRested) log(state, `${sourceName}の効果で、${getCard(target.cardId).name}は重疲労した。`)
    }
    const prompt = (n: number): string =>
        `${sourceName}：重疲労させる${action.chooserIsTarget ? "自分" : "相手"}のスピリットを選んでください（あと${n}体${action.upTo ? "まで" : ""}）`
    const chooser = action.chooserIsTarget ? opp : undefined
    // 選択の解決として再入した（upTo は1体ずつ残数で聞き直す。それ以外の残りは resume スタックが持つ）
    if (action.chosenByPlayer && targetInstanceId !== undefined) {
        const chosen = candidates().find((s) => s.instanceId === targetInstanceId)
        if (chosen) apply(chosen)
        if (action.upTo && count > 1) {
            requestUpToChoice(state, owner, prompt(count - 1), candidates().map((s) => s.instanceId), { ...action, count: count - 1 }, self, chooser)
        }
        return
    }
    const list = candidates()
    if (list.length === 0) {
        log(state, `${sourceName}の重疲労：対象がいなかった。`)
        return
    }
    if (state.interactiveTargets) {
        if (action.upTo) {
            requestUpToChoice(state, owner, prompt(count), list.map((s) => s.instanceId), { ...action, chosenByPlayer: true }, self, chooser)
            return
        }
        if (tryInteractiveTargetChoice(state, owner, self, prompt(count), list, { ...action, count: 1, chosenByPlayer: true }, count > 1 ? { ...action, count: count - 1 } : null, chooser)) return
    }
    // 非対話（と候補1体）：実効BP最大から count 体（相手が選ぶときは最小から）
    const sign = action.chooserIsTarget ? -1 : 1
    const ordered = [...list].sort((a, b) => sign * (effectiveBp(state, opp, b) - effectiveBp(state, opp, a)))
    for (const target of ordered.slice(0, count)) apply(target)
}

const refreshOneHandler = (ctx: ActionCtx, action: Extract<EffectAction, { type: "refresh" }>): void => {
    const { state, owner, self, sourceName , srcType, targetInstanceId } = ctx
        // countCounter：解決時点の数で count を決める（0体なら何もしない）
        if (action.countCounter !== undefined) {
            const { countCounter, ...rest } = action
            const n = countEffectCounter(state, owner, self, countCounter, srcType)
            if (n <= 0) {
                log(state, `${sourceName}の回復：回復できる数が0だった。`)
                return
            }
            refreshOneHandler(ctx, { ...rest, count: n })
            return
        }
        // eventTargetOnly（BS15-067雪の結晶樹Lv2）：誘発が渡すtargetInstanceIdだけを対象にする
        // （selfMode:"source"＋attackerAsTarget等でtargetを固定するfieldEvent用。選択の余地なし）
        if (action.eventTargetOnly) {
            const chosen = targetInstanceId !== undefined
                ? state.players[owner].field.spirits.find((s) => s.instanceId === targetInstanceId)
                : undefined
            if (!chosen || !chosen.isRested) {
                log(state, `${sourceName}の回復：対象がいなかった。`)
                return
            }
            refreshSpirit(state, owner, chosen, srcType)
            log(state, `${getCard(chosen.cardId).name}は回復した。`)
            return
        }
        // 絞り込みは共通の TargetFilter に一本化（keyword/color/vanilla/family/excludeSelf の5軸。
        // 旧フィールドは normalizeFilter が畳み込むためデータは無変更）
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}の回復：BP参照元がいなかった。`)
            return
        }
        // all 指定時は候補すべてを回復する（cantAttackThisTurnは付与しない。決闘台地Lv2）。
        // anySide は両陣営。封印された魔導書の片側への変更に従い、回復は得な効果として扱う（2026-09-24 ユーザー確認）
        if (action.all) {
            let refreshed = 0
            const ids: string[] = []
            for (const pid of action.anySide ? bothSidesPids(state, srcType, true) : [owner]) {
                for (const s of [...state.players[pid].field.spirits]) {
                    if (!s.isRested || !matchesTarget(state, pid, s, filter, self?.instanceId)) continue
                    if (refreshSpirit(state, pid, s, srcType)) ids.push(s.instanceId)
                    refreshed++
                }
            }
            // 「この効果で回復したスピリットは〜」が target:"lastTargets" で引く
            recordTargets(state, ids)
            log(state, refreshed === 0 ? `${sourceName}の回復：対象がいなかった。` : `${sourceName}：条件を満たすスピリット${refreshed}体を回復させた。`)
            return
        }
        const candidates = refreshOneOwnCandidates(state, owner, self, filter)
        if (candidates.length === 0) {
            log(state, `${sourceName}の回復：対象がいなかった。`)
            return
        }
        // 選択の解決：選ばれた1体だけ回復する（count 指定の残りは resume スタックが持っている）。
        // **chosenByPlayer が付いているときだけ** targetInstanceId を回復対象として読む。
        // 素の targetInstanceId は誘発が渡すイベント対象（BS03ベル・ダンディアの onBlock なら
        // 相手のアタッカー）なので、これを回復対象と誤読すると候補外で不発になる
        if (action.chosenByPlayer && targetInstanceId !== undefined) {
            const chosen = candidates.find((s) => s.instanceId === targetInstanceId)
            if (!chosen) {
                log(state, `${sourceName}の回復：対象がいなかった。`)
                return
            }
            refreshSpirit(state, owner, chosen, srcType)
            if (action.thenLevelUpThisTurn) applyLevelUpThisTurn(state, chosen)
            if (action.thenCantAttackThisTurn) {
                recordTimed(state, { content: [{ type: "cantAttack" }], target: { kind: "instance", instanceId: chosen.instanceId }, until: "turn", ownerPid: owner })
                recordTargets(state, [chosen.instanceId]) // 続く「そのスピリットをBP+」が filter.lastTarget で引く
            }
            log(state, `${getCard(chosen.cardId).name}は回復した。`)
            // upTo：1体処理するたびに残数で聞き直す（再開スタックには積まない。2026-09-28）
            if (action.upTo) {
                const remaining = (action.count ?? 1) - 1
                if (remaining > 0) {
                    const nextCandidates = refreshOneOwnCandidates(state, owner, self, filter).map((s) => s.instanceId)
                    requestUpToChoice(
                        state,
                        owner,
                        `${sourceName}：回復させるスピリットを選んでください（あと${remaining}体まで）`,
                        nextCandidates,
                        { ...action, count: remaining },
                        self,
                    )
                }
            }
            return
        }
        // upTo（0〜count の好きな数を選べる）：既存の tryInteractiveTargetChoice（強制count体選択）とは
        // 分けて、聞くたびに「選ばない」を残す requestUpToChoice を使う
        if (action.upTo && state.interactiveTargets) {
            requestUpToChoice(
                state,
                owner,
                `${sourceName}：回復させるスピリットを選んでください（あと${action.count ?? 1}体まで）`,
                candidates.map((s) => s.instanceId),
                { ...action, chosenByPlayer: true },
                self,
            )
            return
        }
        // 実対戦では**どれを回復させるかはプレイヤーが選ぶ**（2026-08-23）。
        // count 指定は1体ぶんずつ選ばせ、残りを resume スタックへ積んで繰り返す（exhaust と同じ形）。
        // 候補が1体しかないときは tryInteractiveTargetChoice が false を返し、下の自動選択に落ちる
        const { count: _count, ...single } = action
        if (
            tryInteractiveTargetChoice(
                state,
                owner,
                self,
                `${sourceName}：回復させるスピリットを選んでください`,
                candidates,
                { ...single, chosenByPlayer: true },
                action.count !== undefined && action.count > 1 ? { ...action, count: action.count - 1 } : null,
            )
        ) {
            return
        }
        // 以下は非対話（テスト・自動解決）と、候補が1体しかないときの経路。
        // count指定時はその体数まで回復する（実効BP最大から順に。cantAttackThisTurn は付与しない。
        // BS09-033槍戦騎ガウト＝黄3体／BS09-X37終焉の騎神ラグナ・ロック＝コスト8以下3体）
        if (action.count !== undefined) {
            const ordered = [...candidates].sort((a, b) => effectiveBp(state, owner, b) - effectiveBp(state, owner, a))
            const picked = ordered.slice(0, action.count)
            for (const c of picked) {
                refreshSpirit(state, owner, c, srcType)
                if (action.thenCantAttackThisTurn) {
                    recordTimed(state, { content: [{ type: "cantAttack" }], target: { kind: "instance", instanceId: c.instanceId }, until: "turn", ownerPid: owner })
                    recordTargets(state, [c.instanceId])
                }
            }
            log(state, `${sourceName}：スピリット${String(picked.length)}体を回復させた。`)
            return
        }
        const target = candidates.reduce((best, s) =>
            effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
        )
        refreshSpirit(state, owner, target, srcType)
        if (action.thenLevelUpThisTurn) applyLevelUpThisTurn(state, target)
        if (action.thenCantAttackThisTurn) {
            recordTimed(state, { content: [{ type: "cantAttack" }], target: { kind: "instance", instanceId: target.instanceId }, until: "turn", ownerPid: owner })
            recordTargets(state, [target.instanceId]) // 続く「そのスピリットをBP+」が filter.lastTarget で引く
        }
        log(state, `${getCard(target.cardId).name}は回復した。`)
        return
}

// BS15共通器：refresh.thenLevelUpThisTurn用（BS15-084爆砕轟神掌）。levelUpThisTurnと同じ計算
function applyLevelUpThisTurn(state: GameState, target: CardInstance): void {
    const maxLevel = getCard(target.cardId).levels.reduce((max, lv) => Math.max(max, lv.level), 0)
    const nextLevel = Math.min(currentLevel(target).level + 1, maxLevel)
    recordTimed(state, { content: [{ type: "level", set: nextLevel }], target: { kind: "instance", instanceId: target.instanceId }, until: "turn", ownerPid: state.players.p1.field.spirits.includes(target) ? "p1" : "p2" })
    log(state, `${getCard(target.cardId).name}のLvを、このターンの間${nextLevel}として扱う。`)
}

const markNoRefreshTargetHandler: ActionHandler<"markNoRefreshTarget"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName , srcType } = ctx
        // スクルディア：このスピリットが疲労したとき、相手の疲労状態のスピリット1体を指定する。
        // 指定は発生源（self）に記録し、self が疲労状態で持ち主のフィールドにいる間だけ効く
        // （判定は EffectModules.isRefreshBlockedByMark。リフレッシュステップのみが見る）。
        // どれを指定するかは発生源の持ち主が選ぶ（2026-09-02。PROCEDURES_AUDIT §5 の一般則）。
        // 非対話（テスト・AI）と候補1体のときは実効BP最大を自動選択する
        if (!self) return
        const candidates = state.players[opp].field.spirits.filter(
            (s) => s.isRested && !isResisted(state, opp, s, { ...attemptOf(ctx, "other", "targeted"), probing: true }),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：相手に疲労状態のスピリットがいなかった。`)
            return
        }
        if (
            ctx.targetInstanceId === undefined &&
            tryInteractiveTargetChoice(
                state,
                owner,
                self,
                `${sourceName}：回復できなくするスピリットを選んでください`,
                candidates,
                action,
                null,
            )
        ) {
            return
        }
        const target =
            (ctx.targetInstanceId !== undefined
                ? candidates.find((s) => s.instanceId === ctx.targetInstanceId)
                : undefined) ??
            candidates.reduce((best, s) => (effectiveBp(state, opp, s) > effectiveBp(state, opp, best) ? s : best))
        const gate = gateTargetedApply(state, opp, target, attemptOf(ctx, "other", "targeted"), action, self, sourceName)
        if (gate === "asked") return
        if (gate) {
            log(state, `${getCard(target.cardId).name}は${sourceName}の効果を受けなかった（${gate.label}）。`)
            return
        }
        self.noRefreshTargetInstanceId = target.instanceId
        log(
            state,
            `${sourceName}は${getCard(target.cardId).name}を指定した。（${sourceName}が疲労状態でフィールドにいる間、回復できない）`,
        )
        return
}

const refreshSelfHandler = (ctx: ActionCtx): void => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 「相手だけ破壊したとき、このスピリットは回復する」等のバトル勝利時効果
        if (!self) {
            log(state, `${sourceName}：回復対象がいなかった。`)
            return
        }
        if (!self.isRested) {
            log(state, `${getCard(self.cardId).name}はすでに回復状態のため何もしなかった。`)
            return
        }
        refreshSpirit(state, owner, self, srcType)
        log(state, `${getCard(self.cardId).name}は回復した。`)
        return
}

// 指定系統の疲労スピリットを最大count体回復させる（refreshByFamilyAuto の共通部分）。
// 回復させる個体の選択は実効BP降順の簡略化のまま（「3体」の内訳までは選ばせない）
function refreshSpiritsOfFamily(ctx: ActionCtx, count: number, family: string): void {
    const { state, owner, sourceName , srcType } = ctx
    const candidates = state.players[owner].field.spirits
        .filter((s) => s.isRested && spiritHasFamily(state, owner, s, family))
        .sort((a, b) => effectiveBp(state, owner, b) - effectiveBp(state, owner, a))
        .slice(0, count)
    for (const s of candidates) refreshSpirit(state, owner, s, srcType)
    log(
        state,
        `${sourceName}：系統「${family}」を選び、${candidates.length}体を回復させた。`,
    )
}

// 相手のスピリット1体を指定し、次の相手のリフレッシュステップで回復できなくする（BS11-055 ジャノメ・シールダー）。
// 「自分のネクサスを好きなだけ指定する。それらを疲労させる」。対話時は1つずつ選び直し（選ばずに終えられる）、非対話は回復状態のすべて
const exhaustOwnNexusesHandler: ActionHandler<"exhaustOwnNexuses"> = (ctx, action) => {
    const { state, owner, self, sourceName, srcType, targetInstanceId } = ctx
    if (!action.started) recordTargets(state, [])
    if (targetInstanceId !== undefined) {
        const picked = state.players[owner].field.nexuses.find((n) => n.instanceId === targetInstanceId && !n.isRested)
        if (picked) {
            exhaustNexus(state, owner, picked, owner, srcType)
            log(state, exhaustLog(sourceName, getCard(picked.cardId).name, false))
            recordTargets(state, [...lastTargetsOf(state), picked.instanceId])
        }
    }
    if (!canExhaustNexus(state, owner)) return
    const open = state.players[owner].field.nexuses.filter((n) => !n.isRested)
    if (state.interactiveTargets) {
        if (open.length > 0) requestUpToChoice(state, owner, `${sourceName}：疲労させる自分のネクサスを選んでください`, open.map((n) => n.instanceId), { ...action, started: true }, self)
        return
    }
    for (const n of open) {
        exhaustNexus(state, owner, n, owner, srcType)
        log(state, exhaustLog(sourceName, getCard(n.cardId).name, false))
    }
    recordTargets(state, [...lastTargetsOf(state), ...open.map((n) => n.instanceId)])
}

const handlers = {
    exhaustOwnNexuses: exhaustOwnNexusesHandler,
    exhaust: exhaustHandler,
    refresh: (ctx, action) => (action.target === "self" ? refreshSelfHandler(ctx) : refreshOneHandler(ctx, action)),
    refreshOwnNexus: refreshOwnNexusHandler,
    heavyExhaust: heavyExhaustHandler,
    markNoRefreshTarget: markNoRefreshTargetHandler,
} satisfies Partial<ActionRegistry>

export default handlers
