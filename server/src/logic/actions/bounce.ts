import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, Color, PlayerId } from "../../type"
import { getCard, log, pushResumeFrames } from "../GameState"
import { bothSidesPids, askPayToNegateIfNeeded, resistanceAgainst, detachBravesOnLeave, findSpiritAny, isResisted, notifyHandGained, pickAnySideByBp, pickAnySideCandidates, pickEnemyByBp, pickEnemyCandidates, requestChoice, returnSpiritToDeckBottom, markBounce, flushBounces, returnSpiritToDeckTop, returnSpiritToHand, tryInteractiveTargetChoice } from "../EffectModules"
import { effectiveBp, heavyArmorColorsOf, instColors, spiritHasKeyword, hasGlobalConstraint, instBaseCost, instMatchesCostFilter, matchesTarget } from "../../../../shared/rules"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"

// 相手のスピリット1体を手札に戻し、戻したコストが条件を満たしたときだけ味方1体を回復させる
// （BS11-032 天王神獣スレイ・ウラノスLv2-3）
const returnOneThenRefreshIfMaxCostHandler: ActionHandler<"returnOneThenRefreshIfMaxCost"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType } = ctx
    const candidates = pickEnemyCandidates(state, opp, Infinity, () => true, srcColors, srcType, "bounce")
    if (candidates.length === 0) {
        log(state, `${sourceName}：手札に戻せる相手のスピリットがいなかった。`)
        return
    }
    if (
        ctx.targetInstanceId === undefined &&
        tryInteractiveTargetChoice(
            state,
            owner,
            self,
            `${sourceName}：手札に戻す相手のスピリットを選んでください`,
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
    const returnedCost = instBaseCost(target)
    returnSpiritToHand(state, opp, target, sourceName)
    if (returnedCost > action.maxCost) {
        log(state, `${sourceName}：戻したスピリットのコストが${String(action.maxCost)}を超えるため回復しない。`)
        return
    }
    ctx.resolve(
        { type: "refreshOne", filter: { family: action.refreshFamilyFilter } },
        { sourceColors: srcColors, sourceType: srcType },
    )
}

// returnToHandの自陣専用版：自分のスピリット1体（filter絞り込み）を持ち主の手札へ戻す。
// 候補2体以上ならプレイヤーが選び、非対話は実効BP最大を自動選択する（BS13-002鎧竜人アンキロング：
// 【超覚醒】を持つ自分のスピリット1体を手札に戻すことができる）
const returnOwnSpiritToHandHandler: ActionHandler<"returnOwnSpiritToHand"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    const player = state.players[owner]
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) {
        log(state, `${sourceName}の手札戻し：BP参照元がいなかった。`)
        return
    }
    const candidates = player.field.spirits.filter((sp) => matchesTarget(state, owner, sp, filter, self?.instanceId))
    if (candidates.length === 0) {
        log(state, `${sourceName}：手札に戻せる自分のスピリットがいなかった。`)
        return
    }
    if (targetInstanceId !== undefined) {
        const chosen = candidates.find((s) => s.instanceId === targetInstanceId)
        if (!chosen) {
            log(state, `${sourceName}：指定されたスピリットは対象にできなかった。`)
            return
        }
        returnSpiritToHand(state, owner, chosen, sourceName)
        return
    }
    if (
        tryInteractiveTargetChoice(
            state,
            owner,
            self,
            `${sourceName}：手札に戻すスピリットを選んでください`,
            candidates,
            action,
            null,
        )
    ) {
        return
    }
    // 非対話：実効BP最大を自動選択
    const target = candidates.reduce((best, s) =>
        effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
    )
    returnSpiritToHand(state, owner, target, sourceName)
    return
}

// BS14-X04氷の覇王ミブロック・バラガンLv2-3：「自分のスピリット1体を手札に戻すことで、
// コスト合計(戻したスピリットのコスト)まで、相手のスピリットを好きなだけ手札に戻す」。
// コストにする自分のスピリットも、戻す相手のスピリットも**対戦者が選ぶ**。
// 残り予算を action.budget に載せて1体ずつ再入する（INTERRUPTION_POINTS.md パターンB）。
// 非対話時（interactiveTargets無効）は従来どおり貪欲（コスト最大から順に）で自動選択する
const returnToHandCostBudgetHandler: ActionHandler<"returnToHandCostBudget"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx

    // 段階1：コストにする自分のスピリットを決める（budget 未設定のとき）
    if (action.budget === undefined) {
        const ownField = state.players[owner].field.spirits
        if (ownField.length === 0) {
            log(state, `${sourceName}：コストにできる自分のスピリットがいなかった。`)
            return
        }
        const chosen = targetInstanceId !== undefined ? ownField.find((s) => s.instanceId === targetInstanceId) : undefined
        if (!chosen) {
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}：コストとして手札に戻す自分のスピリットを選んでください`,
                    ownField,
                    action,
                    null,
                )
            ) {
                return
            }
        }
        // 非対話・候補1体：コスト最大を選ぶ（予算が最大になる）
        let payer = chosen ?? ownField[0]!
        if (!chosen) {
            for (const s of ownField) {
                if (getCard(s.cardId).cost > getCard(payer.cardId).cost) payer = s
            }
        }
        const budget = getCard(payer.cardId).cost
        returnSpiritToHand(state, owner, payer, sourceName)
        if (state.winner) return
        log(state, `${sourceName}：コスト合計${budget}まで、相手のスピリットを手札に戻せる。`)
        ctx.resolve({ ...action, budget })
        return
    }

    // 段階2：予算内で相手のスピリットを1体ずつ戻す（対戦者が選ぶ）
    const remaining = action.budget
    if (remaining <= 0) return
    const candidates = pickEnemyCandidates(state, opp, Infinity, () => true, srcColors, srcType, "bounce").filter(
        (s) => getCard(s.cardId).cost <= remaining,
    )
    if (candidates.length === 0) return

    const picked = targetInstanceId !== undefined ? candidates.find((s) => s.instanceId === targetInstanceId) : undefined
    if (!picked) {
        // optional：予算が残っていても「もう戻さない」を選べる（「好きなだけ」なので0体でよい）
        if (state.interactiveTargets && candidates.length >= 2) {
            requestChoice(
                state,
                owner,
                `${sourceName}：手札に戻す相手のスピリットを選んでください（残りコスト${remaining}）`,
                candidates.map((s) => s.instanceId),
                true,
                action,
                self,
            )
            return
        }
        // 非対話／候補1体：貪欲（コスト最大）で1体戻して再入する
        let best = candidates[0]!
        for (const s of candidates) {
            if (getCard(s.cardId).cost > getCard(best.cardId).cost) best = s
        }
        returnSpiritToHand(state, opp, best, sourceName)
        if (state.winner) return
        ctx.resolve({ ...action, budget: remaining - getCard(best.cardId).cost })
        return
    }

    returnSpiritToHand(state, opp, picked, sourceName)
    if (state.winner) return
    ctx.resolve({ ...action, budget: remaining - getCard(picked.cardId).cost })
}

const RETURN_FIELD_COLORS: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]

// destroyFieldExceptOpponentChosenColorの手札バウンス版（BS15-035軍神機メガ・テュール）。
// 相手が相手自身のスピリットの色から1色指定し、指定外の色を1つでも持つ相手のスピリット（ネクサスは対象外）
// すべてを持ち主の手札に戻す。合体スピリットはinstColorsで合成色を見るため、該当すればホストごと（＝ブレイヴも）戻る
const returnFieldExceptOpponentChosenColorHandler: ActionHandler<"returnFieldExceptOpponentChosenColor"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, chosenOption } = ctx
    const targetsFor = (color: Color) => state.players[opp].field.spirits.filter((s) => instColors(s).some((c) => c !== color))
    const resolveWithColor = (color: Color): void => {
        const spirits = targetsFor(color)
        log(state, `${sourceName}：相手の指定色は${color}。それ以外の色を持つ相手のスピリット/ブレイヴを手札に戻す。`)
        for (const s of spirits) returnSpiritToHand(state, opp, s, sourceName)
    }
    if (chosenOption !== undefined && (RETURN_FIELD_COLORS as string[]).includes(chosenOption)) {
        resolveWithColor(chosenOption as Color)
        return
    }
    const oppSpirits = state.players[opp].field.spirits
    if (oppSpirits.length === 0) {
        log(state, `${sourceName}：色を指定するスピリットが相手にいないため発動しなかった。`)
        return
    }
    if (state.interactiveTargets) {
        requestChoice(
            state,
            owner,
            `${sourceName}：相手のスピリットの色を1色指定してください`,
            [],
            false,
            action,
            self,
            "option",
            RETURN_FIELD_COLORS,
            opp,
        )
        return
    }
    // 非対話：相手視点で戻る数が最小になる色を選ぶ（プレイヤー選択の決定的簡略化）
    const countFor = (color: Color): number => targetsFor(color).length
    const best = RETURN_FIELD_COLORS.reduce((a, b) => (countFor(b) < countFor(a) ? b : a))
    resolveWithColor(best)
}

const returnToHandHandler: ActionHandler<"returnToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // BS15共通器：globalConstraint "noHandGainByEffect" が効いている間は、バウンス効果自体が
        // 発揮されない＝戻すはずのスピリットは場に残る（お互い。BS15-052天蒼元帥チョウハッカイ）
        if (hasGlobalConstraint(state, "noHandGainByEffect")) {
            log(state, `${sourceName}：効果によって手札が増やせないため発動しなかった。`)
            return
        }
        // filter指定時は対象自動選択・明示ターゲット（誘発が渡すtargetInstanceId）の両方に絞り込みを適用する
        // （BS06レインディア：ブロックしたスピリットが系統「空牙」のときのみ手札に戻す）
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}の手札戻し：BP参照元がいなかった。`)
            return
        }
        // costExhaustSelf指定時は、発生源自身（ネクサス等）を疲労させることがコスト。
        // 対象はfieldEventが渡すtargetInstanceId固定（自由選択ではない）ため、それが定まらない／
        // 既に疲労済みなら不発（COST_MODEL.md §1。BS13-068遥かなる衛星砲Lv2）
        if (action.costExhaustSelf) {
            if (!self || self.isRested || targetInstanceId === undefined || !findSpiritAny(state, targetInstanceId)) {
                log(state, `${sourceName}：発動しなかった。`)
                return
            }
            self.isRested = true
            log(state, `${state.players[owner].name}は${sourceName}を疲労させた。`)
            const { costExhaustSelf: _paid, ...rest } = action
            ctx.resolve(rest, { targetInstanceId })
            return
        }
        // 器AE：costReturnOwnSpiritKeyword指定時は、指定キーワードを持つ自分のスピリット1体を
        // 手札に戻すことがコスト（COST_MODEL.md §1：AとBの両方が成立するときだけ払う）。
        // Bの候補（戻せる相手）が1体もいなければ不発。候補2体以上ならプレイヤーが選ぶ（§2）。
        // 支払った後は targetInstanceId を落として再入し、以降は通常の対象選択に合流する
        // （BS13-053モクバオー【合体時】：【神速】持ち1体を戻して相手1体を戻す）
        if (action.costReturnOwnSpiritKeyword !== undefined) {
            const kw = action.costReturnOwnSpiritKeyword
            const costCandidates = state.players[owner].field.spirits.filter((s) => spiritHasKeyword(state, owner, s, kw))
            const hasTarget =
                pickEnemyCandidates(
                    state,
                    opp,
                    Infinity,
                    (s) => matchesTarget(state, opp, s, filter, self?.instanceId),
                    srcColors,
                    srcType,
                    "bounce",
                ).length >= 1
            if (costCandidates.length === 0 || !hasTarget) {
                log(state, `${sourceName}：発動しなかった。`)
                return
            }
            const { costReturnOwnSpiritKeyword: _paid, costSacrificeChosen: _flag, ...rest } = action
            if (action.costSacrificeChosen && targetInstanceId !== undefined) {
                const chosen = costCandidates.find((s) => s.instanceId === targetInstanceId)
                if (!chosen) {
                    log(state, `${sourceName}：指定されたスピリットはコストにできなかった。`)
                    return
                }
                returnSpiritToHand(state, owner, chosen, sourceName)
                if (state.winner) return
                ctx.resolve(rest)
                return
            }
            if (state.interactiveTargets && costCandidates.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コストとして手札に戻す自分のスピリットを選んでください`,
                    costCandidates.map((s) => s.instanceId),
                    false,
                    { ...action, costSacrificeChosen: true },
                    self,
                )
                return
            }
            let victim = costCandidates[0]!
            for (const s of costCandidates) {
                if (getCard(s.cardId).cost < getCard(victim.cardId).cost) victim = s
            }
            returnSpiritToHand(state, owner, victim, sourceName)
            if (state.winner) return
            ctx.resolve(rest)
            return
        }
        // 「〜することで」の任意コスト（BS07剣王獣ビャク・ガロウLv2）。
        // **A（コスト）と B（効果）の両方が成立するときだけ払う**（COST_MODEL.md §1）。
        // 以前はここで払ってから対象を探していたため、戻せる相手がいなくてもコアを失っていた。
        // 体数のしきい値は「候補が1体以上」。B を体数ぶん満たせるかまで求めるかは保留中（COST_MODEL.md §1）
        if (action.costReserveToTrash !== undefined) {
            const player = state.players[owner]
            if (player.reserve < action.costReserveToTrash) {
                log(state, `${sourceName}：リザーブのコアが足りず発動しなかった。`)
                return
            }
            const costLimitBp = action.maxBpFromSelf && self ? effectiveBp(state, owner, self) : Infinity
            const costMatches = (s: CardInstance): boolean =>
                matchesTarget(state, opp, s, filter, self?.instanceId)
            const hasTarget =
                targetInstanceId !== undefined
                    ? findSpiritAny(state, targetInstanceId) !== undefined
                    : (action.anySide
                          ? pickAnySideCandidates(
                                state,
                                owner,
                                (s) => effectiveBp(state, owner, s) <= costLimitBp && costMatches(s),
                                srcColors,
                                srcType,
                                "bounce",
                            )
                          : pickEnemyCandidates(state, opp, costLimitBp, costMatches, srcColors, srcType, "bounce")
                      ).length >= 1
            if (!hasTarget) {
                log(state, `${sourceName}：手札に戻せる対象がいないため発動しなかった。`)
                return
            }
            player.reserve -= action.costReserveToTrash
            player.trashCores += action.costReserveToTrash
            log(state, `${player.name}はリザーブのコア${action.costReserveToTrash}個をトラッシュに置いた。`)
        }
        // 対象指定時はその1体のみ手札へ戻す
        if (targetInstanceId) {
            const found = findSpiritAny(state, targetInstanceId)
            if (!found) {
                log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                return
            }
            const bounceAttempt = attemptOf(ctx, "bounce", "targeted")
            // 「手札を破棄することで効果を受けない」は払うかを守る側に聞いてから判定する（BS08竜騎集う円卓Lv2）
            if (askPayToNegateIfNeeded(state, found.pid, found.inst, bounceAttempt, action, self, sourceName)) return
            const resisted = resistanceAgainst(state, found.pid, found.inst, bounceAttempt)
            if (resisted) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                return
            }
            if (!matchesTarget(state, found.pid, found.inst, filter, self?.instanceId)) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の対象条件を満たさない。`)
                return
            }
            returnSpiritToHand(state, found.pid, found.inst, sourceName)
            return
        }
        // maxBpFromSelf：selfの実効BP以下の相手のみ（selfが「召喚されたスピリット」になる
        // fieldEvent "ownSpiritSummoned" 用。BS04鋼葉の樹林Lv2）
        if (action.maxBpFromSelf && !self) {
            log(state, `${sourceName}の手札戻し：BP参照元がいなかった。`)
            return
        }
        const limitBp = action.maxBpFromSelf && self ? effectiveBp(state, owner, self) : Infinity
        // countPerOpponentNexus指定時はcountを無視し、相手のネクサス数を対象数として使う
        // （BS05幻獣王リーン：相手のネクサス1つにつき）
        const resolvedCount = action.countPerOpponentNexus
            ? state.players[opp].field.nexuses.length
            : action.count
        if (resolvedCount === 0) {
            log(state, `${sourceName}の手札戻し：相手にネクサスがなかった。`)
            return
        }
        // anySide：自分/相手どちらのスピリットも対象にできる（destroy等のanySideと同じ非対称ルール。
        // 相手側候補には装甲・マジック効果耐性を尊重し、自分側には適用しない）
        if (action.anySide) {
            const matchesBp = (s: CardInstance) =>
                effectiveBp(state, owner, s) <= limitBp && matchesTarget(state, opp, s, filter, self?.instanceId)
            const anySideCandidates = pickAnySideCandidates(state, owner, matchesBp, srcColors, srcType, "bounce")
            if (
                state.interactiveTargets &&
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}の手札戻し：対象を選んでください`,
                    anySideCandidates,
                    { ...action, count: 1 },
                    resolvedCount > 1
                        ? { ...action, count: resolvedCount - 1, countPerOpponentNexus: false }
                        : null,
                )
            ) {
                return
            }
            // **まとめて待機させてから一度に戻す**（Wiki「バウンスについて」）。
            // 1体ずつ戻すと、1体目の「戻ったとき」の誘発が2体目以降の対象を変えてしまう
            for (let i = 0; i < resolvedCount; i++) {
                const target = pickAnySideByBp(state, owner, limitBp, matchesBp, srcColors, srcType, "bounce")
                if (!target) {
                    log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                    break
                }
                markBounce(state, target.pid, target.inst, "hand", sourceName)
            }
            flushBounces(state)
            return
        }
        // バウンス耐性（against:"bounce"。BS06恐竜姫ジュラ）は、候補列挙へ op:"bounce" を渡すことで効く
        const matchesFilter = (s: CardInstance) => matchesTarget(state, opp, s, filter, self?.instanceId)
        if (state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, limitBp, matchesFilter, srcColors, srcType, "bounce")
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}の手札戻し：対象を選んでください`,
                    candidates,
                    { ...action, count: 1 },
                    resolvedCount > 1 ? { ...action, count: resolvedCount - 1, countPerOpponentNexus: false } : null,
                )
            ) {
                return
            }
        }
        // 未指定時は相手フィールドのBP最大をresolvedCount回自動選択
        for (let i = 0; i < resolvedCount; i++) {
            const target = pickEnemyByBp(state, opp, limitBp, matchesFilter, srcColors, srcType, "bounce")
            if (!target) {
                log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                break
            }
            returnSpiritToHand(state, opp, target, sourceName)
        }
        return
}

// 器AJ：BS13-030リーサルウェポンドラゴン【合体時】Lv2「このスピリットが持つ【重装甲】と同じ色の相手のスピリット1体ずつを手札に戻す」。
// selfが実際に持つ【重装甲】の色（heavyArmorColorsOf。後天的な付与も含む）ごとに、その色を持つ相手のスピリット
// 1体を手札に戻す。destroyCostsEachOneHandlerと同じ「色ごとにreturnToHand count:1へ委譲」の形
// （装甲・効果耐性・対象選択・バウンス待機の扱いをreturnToHand側の1箇所に保つため）
const returnToHandEachHeavyArmorColorHandler: ActionHandler<"returnToHandEachHeavyArmorColor"> = (ctx, action) => {
    const { state, owner, self, srcColors, srcType } = ctx
    if (!self) return
    // remainingColors：選択待ちで中断したときの再開スタック用（cards.jsonには書かない。destroyOnePerCostと同型）
    const colors = action.remainingColors ?? heavyArmorColorsOf(self)
    for (let i = 0; i < colors.length; i++) {
        const color = colors[i]
        if (color === undefined) continue
        ctx.resolve({ type: "returnToHand", count: 1, filter: { color } }, {
            sourceColors: srcColors,
            sourceType: srcType,
        })
        if (state.winner) return
        if (state.pendingChoice) {
            const rest = colors.slice(i + 1)
            if (rest.length > 0) {
                pushResumeFrames(state, [{
                    kind: "action",
                    selfInstanceId: self.instanceId,
                    actorPid: owner,
                    action: { type: "returnToHandEachHeavyArmorColor", remainingColors: rest },
                }])
            }
            return
        }
    }
}

const returnAllToHandHandler: ActionHandler<"returnAllToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // filter指定時はさらにTargetFilterの軸で絞り込む（既存costFilterは残す。BS06鎧神機ヴァルハランスLv3＝BP4000以下）
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}：BP参照元がいなかった。`)
            return
        }
        // 指定側のスピリットのうちコスト条件を満たすものすべてを各持ち主の手札へ戻す（相手側のみ装甲・免疫を尊重）
        const sides: PlayerId[] = action.side === "both" ? bothSidesPids(state, srcType) : [opp]
        let returned = 0
        for (const pid of sides) {
            // returnSpiritToHand が field.spirits を破壊的に変更するため、対象をスナップショットしてから戻す
            const targets = state.players[pid].field.spirits.filter((s) => {
                // 場のスピリットのコストを条件にする判定なので、道化師クランの付与コストも見る
                if (!instMatchesCostFilter(s, action.costFilter)) return false
                if (!matchesTarget(state, pid, s, filter, self?.instanceId)) return false
                if (isResisted(state, pid, s, attemptOf(ctx, "bounce", "area"))) return false
                return true
            })
            for (const s of targets) {
                markBounce(state, pid, s, "hand", sourceName)
                returned++
            }
        }
        // 全部を待機させてから一度に戻す（「戻ったとき」の誘発は全部戻ってからまとめて発揮する）
        flushBounces(state)
        if (returned === 0) log(state, `${sourceName}：手札に戻す対象がいなかった。`)
        return
}

// グラシアルブレス：自分のスピリットcount体をデッキの下へ戻すことをコストに、
// 相手のスピリットcount体もデッキの下へ戻す。自分がcount体戻せないなら不発。
// 「好きな順番で」はコスト最小から（自分）／実効BP上位から（相手）の決定的簡略化
const returnBothSidesToDeckBottomHandler: ActionHandler<"returnBothSidesToDeckBottom"> = (ctx, action) => {
    const { state, owner, opp, sourceName, srcColors, srcType } = ctx
    const ownSpirits = [...state.players[owner].field.spirits]
    if (ownSpirits.length < action.count) {
        log(state, `${sourceName}：自分のスピリットが${action.count}体いないため発動しなかった。`)
        return
    }
    ownSpirits.sort((a, b) => getCard(a.cardId).cost - getCard(b.cardId).cost)
    for (const inst of ownSpirits.slice(0, action.count)) {
        returnSpiritToDeckBottom(state, owner, inst, sourceName)
    }
    let returned = 0
    for (let i = 0; i < action.count; i++) {
        const target = pickEnemyByBp(state, opp, Infinity, undefined, srcColors, srcType, "bounce")
        if (!target) break
        returnSpiritToDeckBottom(state, opp, target, sourceName)
        returned++
    }
    if (returned === 0) {
        log(state, `${sourceName}：相手のスピリットがいなかった。`)
    }
}

// BS06颶風高原Lv2：このバトル中に自分の【暴風】で疲労させた相手のスピリットすべてをデッキの下へ。
// 効果文どおり**戻す順番は持ち主（発揮した側）が選ぶ**（2026-08-24。それまでは記録順の簡略化）。
// orderedIds に選んだ順を積んで再入し、選び終わってからまとめて戻す
const returnBofuExhaustedToDeckBottomHandler: ActionHandler<"returnBofuExhaustedToDeckBottom"> = (ctx, action) => {
    const { state, owner, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
        const records = state.bofuExhaustedThisBattle
        if (records.length === 0) {
            log(state, `${sourceName}：【暴風】で疲労させた相手のスピリットがいなかった。`)
            return
        }
        const ordered = action.orderedIds ?? []
        // まだ順番を決めていない対象を集める。耐性の判定とログは**1周目だけ**行う
        //（判定結果は途中で変わらないので、選ぶたびに同じログを出さない）
        const firstPass = action.orderedIds === undefined
        const remaining: { pid: PlayerId; inst: CardInstance }[] = []
        for (const rec of [...records]) {
            if (rec.pid === owner) continue // 自分側が疲労した記録は対象外（「相手のスピリット」）
            if (ordered.includes(rec.instanceId)) continue
            const inst = state.players[rec.pid].field.spirits.find((sp) => sp.instanceId === rec.instanceId)
            if (!inst) continue // 既に場から居ない個体は飛ばす
            // **対象を記録から引いているので、他のハンドラのように候補選びの中で耐性を弾けない**。
            // 相手側スピリットへの範囲効果として、returnAllToHand と同じ耐性判定をここで行う
            const resisted = resistanceAgainst(state, rec.pid, inst, attemptOf(ctx, "bounce", "area"))
            if (resisted) {
                if (firstPass) {
                    log(state, `${getCard(inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                }
                continue
            }
            remaining.push({ pid: rec.pid, inst })
        }
        // 選択から戻ってきた：選ばれた1体を順番の末尾に積んで、残りを聞き直す
        if (targetInstanceId !== undefined && remaining.some((r) => r.inst.instanceId === targetInstanceId)) {
            ctx.resolve(
                { ...action, orderedIds: [...ordered, targetInstanceId] },
                { sourceColors: srcColors, sourceType: srcType },
            )
            return
        }
        // 2体以上残っているうちは順番を聞く（1体なら聞くまでもない）
        if (state.interactiveTargets && remaining.length >= 2) {
            requestChoice(
                state,
                owner,
                `${sourceName}：デッキの下に戻す順番を選んでください（残り${remaining.length}体）`,
                remaining.map((r) => r.inst.instanceId),
                false,
                { ...action, orderedIds: ordered },
                self,
            )
            return
        }
        const finalOrder = [...ordered, ...remaining.map((r) => r.inst.instanceId)]
        let returned = 0
        for (const id of finalOrder) {
            const found = findSpiritAny(state, id)
            if (!found) continue
            markBounce(state, found.pid, found.inst, "deckBottom", sourceName)
            returned += 1
        }
        // 全部を待機させてから、選ばれた順に一度に戻す
        flushBounces(state, finalOrder)
        if (returned === 0) {
            log(state, `${sourceName}：デッキの下に戻せるスピリットがいなかった。`)
        }
        return
}

// BS14-032ヤツノカンゾウLv2が付与する誘発効果の本体：このバトル中に**self自身の【暴風】の効果で**
// 疲労させた相手のスピリットすべてを手札に戻す（returnBofuExhaustedToDeckBottomと違い、
// 発生源をselfに絞り込み・順番選択は行わない＝効果文に「好きな順番で」の記載が無いため）
const returnBofuExhaustedToHandHandler: ActionHandler<"returnBofuExhaustedToHand"> = (ctx) => {
    const { state, self, sourceName } = ctx
        if (!self) {
            log(state, `${sourceName}：発生源がいなかった。`)
            return
        }
        const records = state.bofuExhaustedThisBattle.filter((r) => r.bofuSourceInstanceId === self.instanceId)
        if (records.length === 0) {
            log(state, `${sourceName}：【暴風】で疲労させた相手のスピリットがいなかった。`)
            return
        }
        const ids: string[] = []
        let returned = 0
        for (const rec of records) {
            const found = findSpiritAny(state, rec.instanceId)
            if (!found) continue
            const resisted = resistanceAgainst(state, found.pid, found.inst, attemptOf(ctx, "bounce", "area"))
            if (resisted) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                continue
            }
            markBounce(state, found.pid, found.inst, "hand", sourceName)
            ids.push(found.inst.instanceId)
            returned += 1
        }
        flushBounces(state, ids)
        if (returned === 0) {
            log(state, `${sourceName}：手札に戻せるスピリットがいなかった。`)
        }
        return
}

const returnToDeckTopHandler: ActionHandler<"returnToDeckTop"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // count 指定（BS07ブリシンガメンの首飾り＝3体）：1体ぶんの処理を count 回繰り返す。
        // 選ばれた順に一番上へ積むので、**最後に選んだものがデッキの一番上**になる
        //（＝「好きな順番で戻す」を1体ずつの選択で表現している）。
        // ⚠️ 選択で中断したら残りの体数を再開スタックへ積むこと。積まないと1体戻したところで
        // ループが終わり、**3体のはずが1体しか戻らない**（2026-08-24 修正）
        if (action.count !== undefined && action.count > 1 && targetInstanceId === undefined) {
            const { count: _n, ...single } = action
            for (let i = 0; i < action.count; i++) {
                ctx.resolve(single, { sourceColors: srcColors, sourceType: srcType })
                if (state.winner) return
                if (state.pendingChoice) {
                    const rest = action.count - i - 1
                    if (rest > 0) {
                        pushResumeFrames(state, [
                            {
                                kind: "action",
                                selfInstanceId: self ? self.instanceId : null,
                                action: { ...single, count: rest },
                                // chooserIsTarget では選択者が相手なので、再開を駆動する側から
                                // owner を逆算できない。実行者を明示しておく
                                actorPid: owner,
                                ...(srcColors ? { sourceColors: srcColors } : {}),
                                ...(srcType ? { sourceType: srcType } : {}),
                            },
                        ])
                    }
                    return
                }
            }
            return
        }
        // filter（BS09-X38要塞騎神オーディーンType-X＝【転召】を持たない相手3体）：候補の絞り込み。
        // 自動選択・明示ターゲットの両方に効かせる
        const resolvedFilter = action.filter === undefined ? undefined : normalizeFilter(ctx, { filter: action.filter })
        const filterOk = (pid: PlayerId, s: CardInstance): boolean =>
            resolvedFilter === undefined ||
            (resolvedFilter !== SELF_REQUIRED && matchesTarget(state, pid, s, resolvedFilter, self?.instanceId))
        // anySide：自分/相手どちらのスピリットも対象にできる（destroy等のanySideと同じ非対称ルール。
        // 相手側候補には装甲・マジック効果耐性を尊重し、自分側には適用しない）
        if (targetInstanceId === undefined && state.interactiveTargets) {
            const candidates = (action.anySide
                ? pickAnySideCandidates(state, owner, () => true, srcColors, srcType, "bounce")
                : pickEnemyCandidates(state, opp, Infinity, (s) => filterOk(opp, s), srcColors, srcType, "bounce")
            ).filter((s) => action.anySide === undefined || filterOk(opp, s))
            if (candidates.length >= 2) {
                // chooserIsTarget（BS07ブリシンガメンの首飾り）：「**相手は**、相手のスピリット3体を〜戻す」。
                // 選ぶのは戻される側だが、解決は発生源の持ち主の効果として行う（actorPid）
                requestChoice(
                    state,
                    owner,
                    action.chooserIsTarget
                        ? `${sourceName}：デッキの上に戻す自分のスピリットを選んでください`
                        : `${sourceName}のデッキ戻し：対象を選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                    "target",
                    undefined,
                    action.chooserIsTarget ? opp : undefined,
                )
                return
            }
        }
        const found = targetInstanceId
            ? findSpiritAny(state, targetInstanceId)
            : action.anySide
              ? pickAnySideByBp(state, owner, Infinity, () => true, srcColors, srcType, "bounce")
              : (() => {
                    const t = pickEnemyByBp(state, opp, Infinity, (sp) => filterOk(opp, sp), srcColors, srcType, "bounce")
                    return t ? { pid: opp, inst: t } : null
                })()
        if (!found) {
            log(state, `${sourceName}のデッキ戻し：対象がいなかった。`)
            return
        }
        // targetInstanceId 指定（＝明示的に選ばれた対象）のときだけ改めて耐性を見る。
        // 自動選択の経路は候補選びの中で既に弾かれている
        const deckTopResisted = targetInstanceId
            ? resistanceAgainst(state, found.pid, found.inst, attemptOf(ctx, "bounce", "targeted"))
            : null
        if (deckTopResisted) {
            log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${deckTopResisted.label}）。`)
            return
        }
        returnSpiritToDeckTop(state, found.pid, found.inst, sourceName)
        return
}

// 対象の相手スピリット1体を持ち主のデッキの下に戻す（returnToHandの単体版・bounce系。
// returnToDeckTopと違いcount/anySide/chooserIsTargetは持たない。BS10-042カラドリアス＝【強襲】を持つ相手のスピリット1体）
const returnToDeckBottomHandler: ActionHandler<"returnToDeckBottom"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
        const resolvedFilter = action.filter === undefined ? undefined : normalizeFilter(ctx, { filter: action.filter })
        const filterOk = (pid: PlayerId, s: CardInstance): boolean =>
            resolvedFilter === undefined ||
            (resolvedFilter !== SELF_REQUIRED && matchesTarget(state, pid, s, resolvedFilter, self?.instanceId))
        if (targetInstanceId === undefined && state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, Infinity, (s) => filterOk(opp, s), srcColors, srcType, "bounce")
            if (candidates.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}のデッキ下戻し：対象を選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                    "target",
                )
                return
            }
        }
        const found = targetInstanceId
            ? findSpiritAny(state, targetInstanceId)
            : (() => {
                  const t = pickEnemyByBp(state, opp, Infinity, (sp) => filterOk(opp, sp), srcColors, srcType, "bounce")
                  return t ? { pid: opp, inst: t } : null
              })()
        if (!found) {
            log(state, `${sourceName}のデッキ下戻し：対象がいなかった。`)
            return
        }
        const deckBottomResisted = targetInstanceId
            ? resistanceAgainst(state, found.pid, found.inst, attemptOf(ctx, "bounce", "targeted"))
            : null
        if (deckBottomResisted) {
            log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${deckBottomResisted.label}）。`)
            return
        }
        returnSpiritToDeckBottom(state, found.pid, found.inst, sourceName)
        return
}

const returnSelfToHandHandler: ActionHandler<"returnSelfToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (!self) return
        const player = state.players[owner]
        // 破壊時に呼ばれる。このとき自分のカードは**破壊待機状態でまだフィールドにいる**ので、
        // そこから手札へ移す（TIMING_CHART.md §1.5。乗っていたコアはリザーブへ）。
        // 破壊待機状態を解いてから抜けるので、あとで commitPendingDestruction がトラッシュへ送ることはない
        if (self.pendingDestruction) {
            const fieldIdx = player.field.spirits.findIndex((s) => s.instanceId === self.instanceId)
            if (fieldIdx >= 0) {
                player.field.spirits.splice(fieldIdx, 1)
                player.reserve += self.cores
                detachBravesOnLeave(state, owner, self) // 合体していたブレイヴを外す（§6.1.1。コアを移した後。§6.3.1）
            }
            delete self.pendingDestruction
            player.hand.push(self.cardId)
            log(state, `${getCard(self.cardId).name}は手札に戻った。`)
            notifyHandGained(state, owner, 1)
            return
        }
        // 破壊以外の経路（既にトラッシュへ送られている場合）への保険
        const idx = player.trashCards.lastIndexOf(self.cardId)
        if (idx >= 0) {
            player.trashCards.splice(idx, 1)
            player.hand.push(self.cardId)
            log(state, `${getCard(self.cardId).name}は手札に戻った。`)
            notifyHandGained(state, owner, 1)
        }
        return
}

const handlers = {
    returnOneThenRefreshIfMaxCost: returnOneThenRefreshIfMaxCostHandler,
    returnToHand: returnToHandHandler,
    returnFieldExceptOpponentChosenColor: returnFieldExceptOpponentChosenColorHandler,
    returnToHandCostBudget: returnToHandCostBudgetHandler,
    returnToHandEachHeavyArmorColor: returnToHandEachHeavyArmorColorHandler,
    returnOwnSpiritToHand: returnOwnSpiritToHandHandler,
    returnAllToHand: returnAllToHandHandler,
    returnToDeckTop: returnToDeckTopHandler,
    returnToDeckBottom: returnToDeckBottomHandler,
    returnBofuExhaustedToDeckBottom: returnBofuExhaustedToDeckBottomHandler,
    returnBofuExhaustedToHand: returnBofuExhaustedToHandHandler,
    returnBothSidesToDeckBottom: returnBothSidesToDeckBottomHandler,
    returnSelfToHand: returnSelfToHandHandler,
} satisfies Partial<ActionRegistry>

export default handlers
