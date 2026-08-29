// 破壊系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, Color, EffectAction, GameState, PlayerId } from "../../type"
import { createInstance, currentLevel, draw, getCard, instMinLevelCores, log, minLevelCores, pushResumeFrames, suspend } from "../GameState"
import {
    applyBothSidesRedirectToCandidates,
    bothSidesPids,
    bothSidesRedirectKeepPid,
    countEffectCounter,
    destroyCombinedBrave,
    destroyNexus,
    destroySpirit,
    destroySpiritsFrom,
    destroyTargetsBatch,
    applyDestroyBatchAfter,
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
    pickEnemyCandidates,
    requestChoice,
    returnNexusToHand,
    tryInteractiveTargetChoice,
    voidCoreToOwnTrash,
    placeCoresOnSpirit,
} from "../EffectModules"
import { effectiveCost } from "../../../../shared/cost"
import { bravesOf, displayLevel, effectiveBp, instColors, instHasColor, instMatchesCostFilter, matchesTarget, spiritHasKeyword } from "../../../../shared/rules"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"
import { payCoresFromFieldOrReserveToTrash } from "./cores"
import { COLOR_LABELS } from "../../../../data/constants"

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

// BS09-052フォレスト・ゴレム：「相手のコスト3/4のスピリット1体ずつを破壊する」＝
// コスト3から1体・コスト4から1体（計2体）。片方しかいなければその1体だけ（2026-08-14 ユーザー確認）
const destroyCostsEachOneHandler: ActionHandler<"destroyCostsEachOne"> = (ctx, action) => {
    const { state, sourceName, srcColors, srcType } = ctx
    for (const cost of action.costs) {
        if (state.pendingChoice || state.winner) return
        ctx.resolve({ type: "destroy", count: 1, filter: { cost: { min: cost, max: cost } } }, {
            sourceColors: srcColors,
            sourceType: srcType,
        })
    }
    void sourceName
}

// SD02-010 轟剣士レーヴェン：「コスト0/1/2/3/4の相手のスピリット1体ずつを破壊する」。
// コストごとに独立して destroy count:1 へ委譲する（装甲・効果耐性・選択・破壊待機の扱いを
// destroy 側の1箇所に残すため）。選択待ちで中断したら、残りのコストを再開フレームへ積む
// （Pattern C「体数で再入」の応用。docs/design/RESUME_STACK.md §7）
const destroyOnePerCostHandler: ActionHandler<"destroyOnePerCost"> = (ctx, action) => {
    const { state, owner, self, srcColors, srcType } = ctx
    for (let i = 0; i < action.costs.length; i++) {
        const cost = action.costs[i]
        if (cost === undefined) continue
        ctx.resolve(
            { type: "destroy", count: 1, filter: { cost: { min: cost, max: cost } } },
            { sourceColors: srcColors, sourceType: srcType },
        )
        if (state.winner) return
        if (state.pendingChoice) {
            const rest = action.costs.slice(i + 1)
            if (rest.length > 0) {
                pushResumeFrames(state, [{
                    kind: "action",
                    selfInstanceId: self ? self.instanceId : null,
                    actorPid: owner,
                    action: { ...action, costs: rest },
                }])
            }
            return
        }
    }
}

const destroyHandler: ActionHandler<"destroy"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 絞り込みは共通の TargetFilter に一本化（maxBp/keyword/cost と、self相対BP＝
        // maxBpFromSelf「召喚されたスピリットのBP以下」・bpEqualsSelf「selfと同BP」）。
        // self 相対BPは normalizeFilter が数値へ解決し、self 不在なら SELF_REQUIRED を返す
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}の破壊効果：BP参照元がいなかった。`)
            return
        }
        // BP上限も filter 側で判定するため、候補列挙には上限を渡さない（Infinity）
        const limitBp = Infinity
        // 「この効果で破壊したとき〜する」（drawPerDestroyed）は**実際に破壊できた数**が要るので、
        // destroyAll と同じバッチ経路（destroySpiritsFrom + after）へ載せる。
        // 復活の確認で中断しても、再開後に applyDestroyBatchAfter が適用される
        const destroyCountingOne = (pid: PlayerId, instanceId: string): void => {
            const batchTargets = [{ pid, instanceId }]
            const after = {
                drawPerDestroyed: true as const,
                ...(self ? { selfInstanceId: self.instanceId } : {}),
            }
            const { destroyed, stoppedAt } = destroySpiritsFrom(state, batchTargets, 0, 0, destroyContext)
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
        }

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
            if (action.drawPerDestroyed) destroyCountingOne(found.pid, found.inst.instanceId)
            else destroySpirit(state, found.pid, found.inst.instanceId, "destroy", destroyContext, { allowSuspend: true })
            return
        }
        // interactive の選択後に再入するときは excludeTarget を落とす。
        // 残したままだと、**プレイヤーが選んだ instanceId を「除外する対象」と誤読**して
        // 誰も破壊されず、同じ選択待ちが立ち続ける（＝実プレイで進行不能になる。
        // BS06-088 計画された場外乱闘Lv2 で再現。exhaustHandler は先に同じ対策をしていた）
        const { excludeTarget: _excludeTarget, ...actionForChoice } = action
        // countPerOpponentTrashMagicColors指定時はcountを無視し、相手のトラッシュのマジックカード
        // の色の種類数を対象数として使う（BS05超獣王ベヒードス）
        const resolvedCount = action.countPerOpponentTrashMagicColors
            ? distinctOpponentTrashMagicColors(state, opp)
            : action.count
        if (resolvedCount === 0) {
            log(state, `${sourceName}の破壊効果：カウントが0のため発動しなかった。`)
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
                        ? { ...actionForChoice, count: resolvedCount - 1, countPerOpponentTrashMagicColors: false }
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
                if (action.drawPerDestroyed) destroyCountingOne(target.pid, target.inst.instanceId)
                else destroySpirit(state, target.pid, target.inst.instanceId, "destroy", destroyContext, { allowSuspend: true })
                // 復活の確認で中断した。**残りの体数ぶん**を再開フレームに積んで抜ける
                // （対象は毎回その時点の盤面から選び直すので、体数だけ持ち回れば足りる）
                if (state.pendingChoice) {
                    const rest = resolvedCount - i - 1
                    if (rest > 0) {
                        pushResumeFrames(state, [{
                            kind: "action",
                            selfInstanceId: self ? self.instanceId : null,
                            actorPid: owner,
                            action: { ...action, count: rest, countPerOpponentTrashMagicColors: false },
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
                    resolvedCount > 1 ? { ...actionForChoice, count: resolvedCount - 1, countPerOpponentTrashMagicColors: false } : null,
                    // chooserIsTarget（BS10-101ハングドマン＝「相手は、相手のスピリット1体を破壊する」）：
                    // 破壊される側（相手＝opp）が対象を選ぶ。解決はowner（発生源の持ち主）の効果として続ける
                    action.chooserIsTarget ? opp : undefined,
                )
            ) {
                return
            }
        }
        for (let i = 0; i < resolvedCount; i++) {
            const target = pickEnemyByBp(state, opp, limitBp, matchesFilter, srcColors, srcType)
            if (!target) {
                log(state, `${sourceName}の破壊効果：対象がいなかった。`)
                break
            }
            if (action.drawPerDestroyed) destroyCountingOne(opp, target.instanceId)
            else destroySpirit(state, opp, target.instanceId, "destroy", destroyContext, { allowSuspend: true })
            // 復活の確認で中断した。残りの体数ぶんを再開フレームに積んで抜ける
            if (state.pendingChoice) {
                const rest = resolvedCount - i - 1
                if (rest > 0) {
                    pushResumeFrames(state, [{
                        kind: "action",
                        selfInstanceId: self ? self.instanceId : null,
                        actorPid: owner,
                        action: { ...action, count: rest, countPerOpponentTrashMagicColors: false },
                    }])
                }
                return
            }
            if (state.winner) return
        }
        return
}

const destroyAllHandler: ActionHandler<"destroyAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 範囲破壊。untargetable（ワルキューレ）は範囲に無力なので当たるが、
        // 全効果免疫（フェザーバリア）・装甲該当・マジック効果耐性該当のスピリットは除外する。
        // 絞り込み（maxBp / colorExclude）は共通の TargetFilter に一本化。
        // anySide は「どちらのフィールドを見るか」＝対象プールの選択なので filter には含めない
        const areaFilter = normalizeFilter(ctx, action)
        if (areaFilter === SELF_REQUIRED) {
            log(state, `${sourceName}：BP参照元がいなかった。`)
            return
        }
        const oppTargets = state.players[opp].field.spirits
            .filter(
                (s) =>
                    matchesTarget(state, opp, s, areaFilter, self?.instanceId) &&
                    !isResisted(state, opp, s, attemptOf(ctx, "destroy", "area")),
            )
            .map((s) => ({ pid: opp, inst: s }))
        // anySide 指定時は自分側も対象に含める（装甲・マジック効果耐性は既存のanySide系アクションと
        // 同様に自分側には適用しない非対称ルール。BS04魔龍帝ジークフリードLv3）
        const ownTargets = action.anySide
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
        const targets = [...oppTargets, ...ownTargets].filter((t) => keepPid === null || t.pid === keepPid)
        if (targets.length === 0) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        // **実際に破壊できた数**を数える（「この効果で破壊したスピリット1体につき」）。
        // 「破壊されるかわりにフィールドに残る」で残った個体は破壊されていないので数に入らない
        // （docs/design/RESUME_STACK.md §7 ①。別の効果としての「破壊したとき」は阻止できる）。
        //
        // バッチ経由なので、1体ごとに「復活しますか」の確認で**その場で中断できる**。
        // 中断したら destroyBatch フレームを積んで抜け、残りは drainResumeStack が続きを回す
        const batchTargets = targets.map((t) => ({ pid: t.pid, instanceId: t.inst.instanceId }))
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

// ストレートフラッシュ：指定系統を持つ自分のスピリットすべてを破壊してから、相手のスピリットすべてを破壊する。
// 自分側と相手側で絞り込みが違う（自分＝系統一致のみ／相手＝すべて）ため destroyAll では表現できない。
// 免疫まわりの扱いは destroyAll と揃える（自分側には装甲・マジック効果耐性を適用しない非対称ルール）
const destroyOwnByFamilyThenWipeEnemyHandler: ActionHandler<"destroyOwnByFamilyThenWipeEnemy"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext } = ctx
    const ownTargets = state.players[owner].field.spirits
        .filter(
            (s) =>
                matchesFamilyFilter(state, owner, s, action.family) &&
                !isResisted(state, owner, s, attemptOf(ctx, "destroy", "area")),
        )
        .map((s) => s.instanceId)
    // **対象は解決の開始時に確定させる**（自分側→相手側の順に1つのバッチで処理する）。
    // 復活の確認で中断しても、再開フレームが残りを同じ順で処理できるようにするため
    const oppTargets = state.players[opp].field.spirits
        .filter(
            (s) =>
                !isResisted(state, opp, s, attemptOf(ctx, "destroy", "area")),
        )
        .map((s) => s.instanceId)
    if (ownTargets.length === 0 && oppTargets.length === 0) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    destroyTargetsBatch(
        state,
        owner,
        [
            ...ownTargets.map((instanceId) => ({ pid: owner, instanceId })),
            ...oppTargets.map((instanceId) => ({ pid: opp, instanceId })),
        ],
        destroyContext,
    )
    void self
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

// タイダルタイド：自分のネクサスをすべて破壊し（「好きなだけ」の決定的簡略化）、
// 破壊できた数だけ相手が相手自身のスピリットを破壊する。
// 相手が選ぶ処理は、実効BPが低い方から機械的に破壊する簡略化にしてある（相手にとって被害が小さい選択）
// BS04タイダルタイド：自分のネクサスをすべて破壊し、その数だけ相手が相手自身のスピリットを破壊する。
// 効果文が「**相手は**、その破壊したネクサス1つにつき、相手のスピリット1体を破壊する」なので、
// **どれを破壊するかは相手が1体ずつ選ぶ**（CHOOSER_RULES.md §1）。
// ネクサスの破壊数は選択の再入時に数え直せないため、残り体数を action.remaining に持ち回る
const sacrificeOwnNexusesThenEnemyDestroysOwnHandler: ActionHandler<"sacrificeOwnNexusesThenEnemyDestroysOwn"> = (
    ctx,
    action,
) => {
    const { state, owner, opp, self, sourceName, srcType, destroyContext, targetInstanceId } = ctx
    // 相手が破壊する候補（破壊するのは**相手自身**なので、実行者を opp に差し替えて耐性を判定する）
    const enemyCandidates = (): CardInstance[] =>
        state.players[opp].field.spirits.filter(
            (s) => !isResisted(state, opp, s, { ...attemptOf(ctx, "destroy", "area"), actorPid: opp }),
        )
    // 残り remaining 体を相手に破壊させる。実対戦は1体ずつ選ばせ、非対話は実効BP最小から自動で
    const enemyDestroys = (remaining: number): void => {
        if (remaining <= 0 || state.winner) return
        const candidates = enemyCandidates()
        if (candidates.length === 0) return
        if (state.interactiveTargets) {
            requestChoice(
                state,
                owner,
                `${sourceName}：破壊する自分のスピリットを選んでください（あと${remaining}体）`,
                candidates.map((s) => s.instanceId),
                false,
                { ...action, remaining },
                self,
                "target",
                undefined,
                opp,
            )
            return
        }
        for (let i = 0; i < remaining; i++) {
            let weakest: CardInstance | undefined
            for (const s of enemyCandidates()) {
                if (!weakest || effectiveBp(state, opp, s) < effectiveBp(state, opp, weakest)) weakest = s
            }
            if (!weakest) break
            log(state, `${sourceName}：${state.players[opp].name}は${getCard(weakest.cardId).name}を破壊した。`)
            destroySpirit(state, opp, weakest.instanceId, "destroy", destroyContext, { allowSuspend: true })
            if (state.winner) return
            // 復活の確認で中断した。残りの体数を action.remaining に載せて再入する
            if (state.pendingChoice) {
                const rest = remaining - i - 1
                if (rest > 0) {
                    pushResumeFrames(state, [{
                        kind: "action",
                        selfInstanceId: self ? self.instanceId : null,
                        actorPid: owner,
                        action: { ...action, remaining: rest + 1 },
                    }])
                }
                return
            }
        }
    }
    // 選択の再開：相手が選んだ1体を破壊して、残りを続ける
    if (action.remaining !== undefined) {
        if (targetInstanceId !== undefined) {
            const chosen = state.players[opp].field.spirits.find((s) => s.instanceId === targetInstanceId)
            if (chosen) {
                log(state, `${sourceName}：${state.players[opp].name}は${getCard(chosen.cardId).name}を破壊した。`)
                destroySpirit(state, opp, chosen.instanceId, "destroy", destroyContext, { allowSuspend: true })
            }
        }
        if (state.pendingChoice) {
            // 復活の確認で中断した。残りは再入して続ける
            const rest = action.remaining - 1
            if (rest > 0) {
                pushResumeFrames(state, [{
                    kind: "action",
                    selfInstanceId: self ? self.instanceId : null,
                    actorPid: owner,
                    action: { ...action, remaining: rest },
                }])
            }
            return
        }
        enemyDestroys(action.remaining - 1)
        return
    }
    // 初回：自分のネクサスをすべて破壊して、破壊できた数を相手に渡す
    const ownNexusIds = state.players[owner].field.nexuses.map((n) => n.instanceId)
    if (ownNexusIds.length === 0) {
        log(state, `${sourceName}：自分のフィールドにネクサスがなかった。`)
        return
    }
    let destroyed = 0
    for (const instanceId of ownNexusIds) {
        if (destroyNexus(state, owner, instanceId, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })) destroyed++
    }
    log(
        state,
        `${sourceName}：自分のネクサス${destroyed}つを破壊した。（「好きなだけ」はすべて破壊として処理）`,
    )
    enemyDestroys(destroyed)
}

const destroyAllExceptChosenColorsHandler: ActionHandler<"destroyAllExceptChosenColors"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // お互い自分のフィールドで最多のスピリット色を1色ずつ自動指定する
        // （同数の場合はColor定義順=red,purple,green,white,yellow,blueの先頭を採用。
        // フィールドが空のプレイヤーは指定なし。プレイヤー選択の決定的簡略化）
        const colorOrder: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
        const pickChosenColor = (pid: PlayerId): Color | null => {
            const spirits = state.players[pid].field.spirits
            if (spirits.length === 0) return null
            const counts = new Map<Color, number>()
            for (const s of spirits) {
                // 多色スピリットはどちらの色にも1票を入れる
                for (const c of instColors(s)) counts.set(c, (counts.get(c) ?? 0) + 1)
            }
            let best: Color | null = null
            let bestCount = 0
            for (const c of colorOrder) {
                const n = counts.get(c) ?? 0
                if (n > bestCount) {
                    bestCount = n
                    best = c
                }
            }
            return best
        }
        // 実対戦では「お互い、自分のフィールドに出ているスピリットの色を1色指定する」を
        // **両プレイヤーが順に**選ぶ。進捗は action の chosenOwn / chosenOpp / awaiting に持たせて再入する。
        // 相手に選ばせる段では PendingChoice.actorPid で「選択者＝相手・実行者＝発生源の持ち主」にする
        const fieldColors = (pid: PlayerId): Color[] => {
            const set = new Set<Color>()
            for (const sp of state.players[pid].field.spirits) for (const c of instColors(sp)) set.add(c)
            return colorOrder.filter((c) => set.has(c))
        }
        const colorOf = (label: string | undefined): Color | undefined =>
            (Object.entries(COLOR_LABELS) as [Color, string][]).find(([, l]) => l === label)?.[0]

        let chosenOwn = action.chosenOwn
        let chosenOpp = action.chosenOpp
        if (state.interactiveTargets) {
            // 選択の応答を取り込む
            if (action.awaiting === "own") chosenOwn = colorOf(chosenOption) ?? chosenOwn
            if (action.awaiting === "opponent") chosenOpp = colorOf(chosenOption) ?? chosenOpp

            const ownColors = fieldColors(owner)
            if (chosenOwn === undefined && ownColors.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：自分のフィールドから残す色を1色指定してください`,
                    [],
                    false,
                    { ...action, awaiting: "own", ...(chosenOpp ? { chosenOpp } : {}) },
                    self,
                    "option",
                    ownColors.map((c) => COLOR_LABELS[c]),
                )
                return
            }
            if (chosenOwn === undefined) chosenOwn = ownColors[0]

            const oppColors = fieldColors(opp)
            if (chosenOpp === undefined && oppColors.length >= 2) {
                requestChoice(
                    state,
                    opp, // ← 選ぶのは相手
                    `${sourceName}：自分のフィールドから残す色を1色指定してください`,
                    [],
                    false,
                    { ...action, awaiting: "opponent", ...(chosenOwn ? { chosenOwn } : {}) },
                    self,
                    "option",
                    oppColors.map((c) => COLOR_LABELS[c]),
                )
                // 破壊は発生源の持ち主の効果として解決する
                if (state.pendingChoice) state.pendingChoice.actorPid = owner
                return
            }
            if (chosenOpp === undefined) chosenOpp = oppColors[0]
        }
        const chosenP1 = chosenOwn ?? chosenOpp ?? pickChosenColor("p1")
        const chosenP2 = state.interactiveTargets
            ? (chosenOpp ?? null)
            : pickChosenColor("p2")
        const safeColors = new Set(
            (state.interactiveTargets ? [chosenOwn, chosenOpp] : [chosenP1, chosenP2]).filter(
                (c): c is Color => c !== null && c !== undefined,
            ),
        )
        log(
            state,
            `${sourceName}：指定色は p1=${chosenP1 ?? "なし"}, p2=${chosenP2 ?? "なし"}。` +
                `いずれでもない色のスピリットを破壊する。`,
        )
        // 相手フィールドだけ耐性を判定する（自分の効果は自分のスピリットには効かないので、
        // 自分フィールドは素通し。この非対称は resistanceAgainst が actorPid で自動的に扱う）
        const oppTargets = state.players[opp].field.spirits.filter(
            (s) =>
                !instColors(s).some((c) => safeColors.has(c)) &&
                !isResisted(state, opp, s, attemptOf(ctx, "destroy", "area")),
        )
        const ownTargets = state.players[owner].field.spirits.filter(
            (s) => !instColors(s).some((c) => safeColors.has(c)),
        )
        destroyTargetsBatch(
            state,
            owner,
            [
                ...oppTargets.map((t) => ({ pid: opp, instanceId: t.instanceId })),
                ...ownTargets.map((t) => ({ pid: owner, instanceId: t.instanceId })),
            ],
            destroyContext,
        )
        return
}

const destroyAllNexusesExceptChosenColorsHandler: ActionHandler<"destroyAllNexusesExceptChosenColors"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // destroyAllExceptChosenColorsのネクサス版。両者フィールドのネクサスの色数合計
        // （重複除く）がminTotalColors未満なら不発（ログのみ）。
        // お互い自分フィールドで最多のネクサス色を1色ずつ自動指定し（同数はcolorOrder先頭、
        // ネクサス0の側は指定なし）、どちらの指定色でもないネクサスをすべて破壊する
        // （色選択の決定的簡略化。溶海竜プレシオス）
        const colorOrder: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
        const pickChosenNexusColor = (pid: PlayerId): Color | null => {
            const nexuses = state.players[pid].field.nexuses
            if (nexuses.length === 0) return null
            const counts = new Map<Color, number>()
            for (const n of nexuses) {
                for (const c of instColors(n)) counts.set(c, (counts.get(c) ?? 0) + 1)
            }
            let best: Color | null = null
            let bestCount = 0
            for (const c of colorOrder) {
                const n = counts.get(c) ?? 0
                if (n > bestCount) {
                    bestCount = n
                    best = c
                }
            }
            return best
        }
        const allNexusColors = new Set<Color>()
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            for (const n of state.players[pid].field.nexuses) {
                for (const c of instColors(n)) allNexusColors.add(c)
            }
        }
        if (allNexusColors.size < action.minTotalColors) {
            log(
                state,
                `${sourceName}：両者のネクサスの色数合計が${action.minTotalColors}色未満のため発動しなかった。`,
            )
            return
        }
        const chosenP1 = pickChosenNexusColor("p1")
        const chosenP2 = pickChosenNexusColor("p2")
        const safeColors = new Set([chosenP1, chosenP2].filter((c): c is Color => c !== null))
        log(
            state,
            `${sourceName}：ネクサスの指定色は p1=${chosenP1 ?? "なし"}, p2=${chosenP2 ?? "なし"}。` +
                `いずれでもない色のネクサスを破壊する。`,
        )
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            const targets = state.players[pid].field.nexuses.filter(
                (n) => !instColors(n).some((c) => safeColors.has(c)),
            )
            for (const t of targets) destroyNexus(state, pid, t.instanceId, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })
        }
        return
}

// 「相手のスピリット/ブレイヴ/ネクサス、どれか1つを破壊する」（BS11-X01）。
// ブレイヴは**合体中のものも単独で選べる**（ホストは場に残る。2026-08-29 ユーザー確認。BRAVE.md §12.8）。
// 合体中のブレイヴは field.spirits に居ないので kind:"target" では指せない。
// そこでブラッディレインの取り先選択と同じ kind:"option"（カード名＋種別のラベル）で選ばせる
const destroyOneAmongHandler: ActionHandler<"destroyOneAmong"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, chosenOption } = ctx
    const player = state.players[opp]
    type Cand = { label: string; kind: "spirit" | "brave" | "nexus"; instanceId: string; hostInstanceId?: string }
    const seen = new Map<string, number>()
    const labelFor = (name: string, suffix: string): string => {
        const base = `${name}${suffix}`
        const n = (seen.get(base) ?? 0) + 1
        seen.set(base, n)
        return n === 1 ? base : `${base}（${n}体目）`
    }
    const candidates: Cand[] = []
    for (const kind of action.types) {
        if (kind === "spirit") {
            for (const sp of player.field.spirits) {
                if (getCard(sp.cardId).type === "brave") continue // スピリット状態のブレイヴは "brave" 側で数える
                if (isResisted(state, opp, sp, attemptOf(ctx, "destroy", "targeted"))) continue
                candidates.push({ label: labelFor(getCard(sp.cardId).name, ""), kind, instanceId: sp.instanceId })
            }
        } else if (kind === "brave") {
            // combinedOnly（BS11-014「相手の**合体スピリットの**ブレイヴ1つ」）：
            // スピリット状態のブレイヴは候補に入れない
            for (const sp of action.combinedOnly ? [] : player.field.spirits) {
                if (getCard(sp.cardId).type !== "brave") continue // スピリット状態のブレイヴ
                if (isResisted(state, opp, sp, attemptOf(ctx, "destroy", "targeted"))) continue
                candidates.push({ label: labelFor(getCard(sp.cardId).name, "（ブレイヴ）"), kind, instanceId: sp.instanceId })
            }
            for (const host of player.field.spirits) {
                for (const brave of bravesOf(player, host)) {
                    candidates.push({
                        label: labelFor(getCard(brave.cardId).name, "（合体中のブレイヴ）"),
                        kind,
                        instanceId: brave.instanceId,
                        hostInstanceId: host.instanceId,
                    })
                }
            }
        } else {
            for (const nx of player.field.nexuses) {
                candidates.push({ label: labelFor(getCard(nx.cardId).name, "（ネクサス）"), kind, instanceId: nx.instanceId })
            }
        }
    }
    if (candidates.length === 0) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    // eachCombined（BS11-016 邪眼皇ゼナス「相手の合体スピリットすべてのブレイヴ1つずつ」）：
    // 選択は挟まず、合体スピリット1体につき先頭のブレイヴを1つ破壊する
    if (action.eachCombined) {
        for (const host of [...player.field.spirits]) {
            const brave = bravesOf(player, host)[0]
            if (!brave) continue
            destroyCombinedBrave(state, opp, host, brave)
            if (state.winner) return
        }
        return
    }
    const destroyOne = (c: Cand): void => {
        if (c.kind === "nexus") {
            destroyNexus(state, opp, c.instanceId, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })
            return
        }
        if (c.hostInstanceId !== undefined) {
            const host = player.field.spirits.find((sp) => sp.instanceId === c.hostInstanceId)
            const brave = bravesOf(player, host ?? ({} as CardInstance)).find((b) => b.instanceId === c.instanceId)
            if (host && brave) destroyCombinedBrave(state, opp, host, brave)
            return
        }
        destroySpirit(state, opp, c.instanceId, "destroy", destroyContext, { allowSuspend: true })
    }
    if (state.interactiveTargets) {
        if (chosenOption !== undefined) {
            const picked = candidates.find((c) => c.label === chosenOption)
            if (!picked) {
                log(state, `${sourceName}：選ばれた対象が見つからなかった。`)
                return
            }
            destroyOne(picked)
            const rest = action.count - 1
            if (rest > 0 && !state.pendingChoice) ctx.resolve({ ...action, count: rest })
            return
        }
        requestChoice(
            state,
            owner,
            `${sourceName}：破壊する対象を選んでください（残り${action.count}つ）`,
            [],
            false,
            action,
            self,
            "option",
            candidates.map((c) => c.label),
        )
        return
    }
    // 非対話（テスト・AI）：types に書かれた順で最初に見つかった陣を選ぶ決定的簡略化。
    // スピリットだけは実効BP最大を選ぶ（他のアクションの自動選択と揃える）
    for (let i = 0; i < action.count; i++) {
        const rest = candidates.filter((c) => {
            if (c.kind === "nexus") return player.field.nexuses.some((n) => n.instanceId === c.instanceId)
            if (c.hostInstanceId !== undefined) return player.field.combinedBraves.some((b) => b.instanceId === c.instanceId)
            return player.field.spirits.some((sp) => sp.instanceId === c.instanceId)
        })
        const kind = action.types.find((k) => rest.some((c) => c.kind === k))
        if (kind === undefined) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        const pool = rest.filter((c) => c.kind === kind)
        let picked = pool[0]!
        if (kind === "spirit") {
            const best = pool
                .map((c) => ({ c, inst: player.field.spirits.find((sp) => sp.instanceId === c.instanceId) }))
                .filter((x) => x.inst !== undefined)
                .sort((a, b) => effectiveBp(state, opp, b.inst!) - effectiveBp(state, opp, a.inst!))[0]
            if (best) picked = best.c
        }
        destroyOne(picked)
        if (state.pendingChoice || state.winner) return
    }
    void srcColors
}

// BS11-076 シェアリングペイン：「自分のスピリット1体を破壊することで、相手は、コスト合計が
// その破壊したスピリットのコスト以上になるように、相手のスピリットを好きなだけ破壊する」。
// **選ぶのは相手**（CHOOSER_RULES.md §1）で、対話では1体ずつ選ばせる（coresDownToLimit と同じ形）。
// COST_MODEL.md §1：破壊できる自分のスピリットがいなければ不発
const costDestroyOwnThenOpponentDestroysToCostHandler: ActionHandler<"costDestroyOwnThenOpponentDestroysToCost"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcType, chosenOption } = ctx
    const me = state.players[owner]
    const foe = state.players[opp]

    // ---- 後半：相手がコスト合計 needCost 以上になるまで自分のスピリットを破壊する
    if (action.needCost !== undefined) {
        const need = action.needCost
        const paid = (): number => 0 // 破壊済みの合計は「残り必要コスト」を持ち回るので都度は数えない
        void paid
        const candidates = foe.field.spirits.filter(
            (sp) => !isResisted(state, opp, sp, attemptOf(ctx, "destroy", "targeted")),
        )
        if (need <= 0 || candidates.length === 0) {
            if (need > 0) log(state, `${sourceName}：${foe.name}に破壊できるスピリットがいなかった。`)
            return
        }
        const labelOf = (sp: CardInstance): string => `${getCard(sp.cardId).name}（コスト${effectiveCost(state, opp, getCard(sp.cardId))}）`
        if (state.interactiveTargets) {
            if (chosenOption !== undefined) {
                const picked = candidates.find((sp) => labelOf(sp) === chosenOption)
                if (!picked) {
                    log(state, `${sourceName}：選ばれた対象が見つからなかった。`)
                    return
                }
                const paidCost = effectiveCost(state, opp, getCard(picked.cardId))
                destroySpirit(state, opp, picked.instanceId, "destroy", undefined, { allowSuspend: true })
                const rest = need - paidCost
                if (rest > 0 && !state.pendingChoice) ctx.resolve({ ...action, needCost: rest })
                return
            }
            requestChoice(
                state,
                owner,
                `${sourceName}：${foe.name}は破壊するスピリットを選んでください（コスト合計であと${need}必要）`,
                [],
                false,
                action,
                self,
                "option",
                candidates.map(labelOf),
                opp, // 選ぶのは破壊される側
            )
            return
        }
        // 非対話（テスト・AI）：**コストの大きい方から**破壊する決定的簡略化（体数が少なく済む）
        let remaining = need
        for (const sp of [...candidates].sort(
            (a, b) => effectiveCost(state, opp, getCard(b.cardId)) - effectiveCost(state, opp, getCard(a.cardId)),
        )) {
            if (remaining <= 0) break
            remaining -= effectiveCost(state, opp, getCard(sp.cardId))
            destroySpirit(state, opp, sp.instanceId, "destroy", undefined, { allowSuspend: true })
            if (state.pendingChoice || state.winner) return
        }
        return
    }

    // ---- 前半：コストとして自分のスピリット1体を破壊する
    const own = me.field.spirits.filter((sp) => self === null || sp.instanceId !== self.instanceId || true)
    if (own.length === 0) {
        log(state, `${sourceName}：コストにできる自分のスピリットがいないため発動しなかった。`)
        return
    }
    if (state.interactiveTargets && chosenOption === undefined && own.length >= 2) {
        requestChoice(
            state,
            owner,
            `${sourceName}：コストとして破壊する自分のスピリットを選んでください`,
            own.map((sp) => sp.instanceId),
            false,
            action,
            self,
        )
        return
    }
    // 対象選択から戻ったときは ctx.targetInstanceId に入る
    const chosen =
        ctx.targetInstanceId !== undefined
            ? own.find((sp) => sp.instanceId === ctx.targetInstanceId)
            : // 非対話（テスト・AI）：実効BP最小を選ぶ決定的簡略化
              [...own].sort((a, b) => effectiveBp(state, owner, a) - effectiveBp(state, owner, b))[0]
    if (!chosen) {
        log(state, `${sourceName}：コストにできる自分のスピリットがいなかった。`)
        return
    }
    const need = effectiveCost(state, owner, getCard(chosen.cardId))
    destroySpirit(state, owner, chosen.instanceId, "destroy", undefined, { allowSuspend: true })
    log(state, `${sourceName}：${getCard(chosen.cardId).name}（コスト${need}）を破壊した。${foe.name}はコスト合計${need}以上になるように破壊する。`)
    ctx.resolve({ ...action, needCost: need })
    void srcType
}

const destroyNexusHandler: ActionHandler<"destroyNexus"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcType, chosenOption } = ctx
        // side指定時は破壊対象の陣営を切り替える（省略時はopponent＝従来どおり。BS01バスターファランクス＝both）
        const sides: PlayerId[] = action.side === "both" ? bothSidesPids(state, srcType) : [opp]
        // chosenColor（BS11-073バスターハンマー）：「色1色を指定する。指定した色のネクサスすべてを破壊する」。
        // 色を選ぶのは効果の持ち主（CHOOSER_RULES.md §1）。非対話は破壊できる数が最も多い色に倒す
        let chosenColor: Color | undefined
        if (action.chosenColor && chosenColor === undefined) {
            const countFor = (c: Color): number =>
                sides.reduce((n, pid) => n + state.players[pid].field.nexuses.filter((x) => instColors(x).includes(c)).length, 0)
            const colors = Object.keys(COLOR_LABELS) as Color[]
            if (state.interactiveTargets) {
                if (chosenOption === undefined) {
                    requestChoice(
                        state,
                        owner,
                        `${sourceName}：破壊するネクサスの色を1色指定してください`,
                        [],
                        false,
                        action,
                        self,
                        "option",
                        colors.map((c) => COLOR_LABELS[c]),
                    )
                    return
                }
                chosenColor = (Object.entries(COLOR_LABELS) as [Color, string][]).find(([, l]) => l === chosenOption)?.[0]
                if (chosenColor === undefined) {
                    log(state, `${sourceName}：色を解釈できなかった。`)
                    return
                }
            } else {
                // 非対話（テスト・AI）：破壊できるネクサスが最も多い色に倒す決定的簡略化
                chosenColor = [...colors].sort((a, b) => countFor(b) - countFor(a))[0]
            }
            if (chosenColor === undefined) return
            log(state, `${sourceName}：色は${COLOR_LABELS[chosenColor]}が指定された。`)
        }
        // levelFilter指定時はこれに含まれるレベルのネクサスのみ対象（BS03バスターランス＝Lv1のみ）。
        // **他のカードから見えるレベル（displayLevel）で判定する**：ウッド・ゴレムの
        // 「相手のネクサスすべてのLv2効果は発揮されない」は効果の発揮判定にだけ効く置き換えなので、
        // それでLv1に見えるようになったネクサスをバスターランスが破壊できてはいけない
        const matchesLevel = (n: CardInstance) =>
            (action.levelFilter === undefined || action.levelFilter.includes(displayLevel(n).level)) &&
            (chosenColor === undefined || instColors(n).includes(chosenColor))
        let destroyed = 0
        for (const pid of sides) {
            // all指定時はcountを無視し、開始時点で条件に一致するネクサス数ぶん繰り返して全破壊する（BS04風龍王フージャオス）
            const iterations = action.all
                ? state.players[pid].field.nexuses.filter(matchesLevel).length
                : action.count
            for (let i = 0; i < iterations; i++) {
                const nexus =
                    action.levelFilter || chosenColor !== undefined
                        ? state.players[pid].field.nexuses.find(matchesLevel)
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
        // budgetFromSelfBp（BS08太陽石の神殿）：予算はselfの実効BP（＝バトルに勝利したアタッカーのBP）
        let remaining = action.budgetFromSelfBp && self ? effectiveBp(state, owner, self) : (action.budget ?? 0)
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

// BS08魔帝龍騎ダーク・クリムゾン：カウント値の体数ぶん、相手スピリットを1体ずつ実効BP最大から繰り返し破壊する
const destroyPerHandler: ActionHandler<"destroyPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext } = ctx
        const count = countEffectCounter(state, owner, self, action.counter, srcType)
        if (count <= 0) {
            log(state, `${sourceName}：カウントが0のため発動しなかった。`)
            return
        }
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}の破壊効果：BP参照元がいなかった。`)
            return
        }
        // 先に選び切ってからまとめて破壊する（destroyByBpBudget と同じ理由）
        const chosenIds: string[] = []
        for (let i = 0; i < count; i++) {
            const target = pickEnemyByBp(
                state,
                opp,
                Infinity,
                (s) =>
                    matchesTarget(state, opp, s, filter, self?.instanceId) &&
                    !chosenIds.includes(s.instanceId),
                srcColors,
                srcType,
            )
            if (!target) break
            chosenIds.push(target.instanceId)
        }
        const destroyedCount = chosenIds.length
        if (destroyedCount > 0) {
            destroyTargetsBatch(state, owner, chosenIds.map((instanceId) => ({ pid: opp, instanceId })), destroyContext)
        }
        if (destroyedCount === 0) {
            log(state, `${sourceName}：破壊できる対象がいなかった。`)
        }
        return
}

// BS08ジャッジメントフレア：相手のスピリットを、自分のフィールドのスピリット数と同じになるまで破壊する。
// 効果文は「**相手は**、相手のスピリットを自分のスピリットと同じ体数になるように破壊する」なので、
// **どれを破壊するかは相手が1体ずつ選ぶ**（CHOOSER_RULES.md §1。解決は発生源の持ち主の効果として行う）。
// 残り体数は毎回「相手の体数 − 自分の体数」で数え直すため、選択の再入をまたぐ内部フィールドは要らない
const destroyDownToOwnCountHandler: ActionHandler<"destroyDownToOwnCount"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId } = ctx
        // 選択の再開：相手が選んだ1体を破壊してから、残りを数え直す
        if (targetInstanceId !== undefined) {
            const chosen = state.players[opp].field.spirits.find((s) => s.instanceId === targetInstanceId)
            if (chosen) destroySpirit(state, opp, chosen.instanceId, "destroy", destroyContext, { allowSuspend: true })
            if (state.winner) return
            // 復活の確認で中断した。残り体数は「相手の体数−自分の体数」で数え直すので、
            // 同じアクションをもう一度積むだけでよい（内部フィールドは不要）
            if (state.pendingChoice) {
                pushResumeFrames(state, [{
                    kind: "action",
                    selfInstanceId: self ? self.instanceId : null,
                    actorPid: owner,
                    action: { ...action },
                }])
                return
            }
        }
        const need = state.players[opp].field.spirits.length - state.players[owner].field.spirits.length
        if (need <= 0) {
            // 初回だけ「発動しなかった」を出す（再入時は破壊し終えただけなので黙って終わる）
            if (targetInstanceId === undefined) {
                log(state, `${sourceName}：相手のスピリットは既に自分と同数以下のため発動しなかった。`)
            }
            return
        }
        const candidates = pickEnemyCandidates(state, opp, Infinity, () => true, srcColors, srcType)
        if (candidates.length === 0) {
            log(state, `${sourceName}：破壊できる対象がいなかった。`)
            return
        }
        if (state.interactiveTargets) {
            // 候補1体なら requestChoice が即解決して上の再入経路へ戻る（0体は上で弾いてある）
            requestChoice(
                state,
                owner,
                `${sourceName}：破壊する自分のスピリットを選んでください（あと${need}体）`,
                candidates.map((s) => s.instanceId),
                false,
                action,
                self,
                "target",
                undefined,
                opp,
            )
            return
        }
        // 非対話：相手が選ぶなら差し出すであろう実効BP**最小**から破壊する（CHOOSER_RULES.md §2）
        // 先に選び切ってからまとめて破壊する（実効BP最小から順に）
        const chosenIds: string[] = []
        for (let i = 0; i < need; i++) {
            const remaining = pickEnemyCandidates(state, opp, Infinity, () => true, srcColors, srcType)
            let weakest: CardInstance | undefined
            for (const s of remaining) {
                if (chosenIds.includes(s.instanceId)) continue
                if (!weakest || effectiveBp(state, opp, s) < effectiveBp(state, opp, weakest)) weakest = s
            }
            if (!weakest) break
            chosenIds.push(weakest.instanceId)
        }
        destroyTargetsBatch(state, owner, chosenIds.map((instanceId) => ({ pid: opp, instanceId })), destroyContext)
        return
}

const destroyByCostBudgetHandler: ActionHandler<"destroyByCostBudget"> = (ctx, action) => {
    const { state, owner, opp, sourceName, srcColors, srcType, destroyContext } = ctx
        // 聖皇ジークフリーデン：相手スピリットをコスト合計がbudgetを超えない範囲で好きなだけ破壊する。
        // 対話モードは「好きなだけ」をトグルで選ばせる（非対話は下の貪欲＝残り予算内でコスト最大から。
        // 同コストは実効BP最大を優先）
        if (budgetToggleDestroy(ctx, action, action.budget, "コスト", (sp) => getCard(sp.cardId).cost)) return
        let remaining = action.budget
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
            `${sourceName}：コスト合計${action.budget}まで「${destroyedNames.join("、")}」を破壊した。`,
        )
        return
}

// BS07巨人大帝アレクサンダーLv2：相手のスピリット1体を破壊し、
// **破壊したスピリットのコストと同じ枚数**だけ相手のデッキを上から破棄する。
// 「破壊した対象のコスト」を後段で使うため、汎用 destroy のオプションにせず専用ハンドラにする
// （destroy は出口が複数あり、どこで破壊が確定したかを一箇所に集約できないため）
const destroyThenMillByCostHandler: ActionHandler<"destroyThenMillByCost"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId } = ctx
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) {
        log(state, `${sourceName}：BP参照元がいなかった。`)
        return
    }
    const matches = (sp: CardInstance) => matchesTarget(state, opp, sp, filter, self?.instanceId)
    // pendingChoice 解決時は選ばれた1体、それ以外は実効BP最大を自動選択（既存の破壊系と同じ簡略化）
    const chosen = targetInstanceId
        ? state.players[opp].field.spirits.find((sp) => sp.instanceId === targetInstanceId && matches(sp))
        : undefined
    if (!chosen && targetInstanceId === undefined && state.interactiveTargets) {
        const candidates = pickEnemyCandidates(state, opp, Infinity, matches, srcColors, srcType)
        if (
            tryInteractiveTargetChoice(
                state,
                ctx.owner,
                self,
                `${sourceName}：破壊する相手のスピリットを選んでください`,
                candidates,
                action,
                null,
            )
        ) {
            return
        }
    }
    const target = chosen ?? pickEnemyByBp(state, opp, Infinity, matches, srcColors, srcType)
    if (!target) {
        log(state, `${sourceName}：破壊できる対象がいなかった。`)
        return
    }
    // コストは破壊前に読む（破壊後はフィールドから消えるため）。
    // 「破壊した相手のスピリットのコスト」なので付与コストではなくカード本来のコストを使う
    const cost = getCard(target.cardId).cost
    const name = getCard(target.cardId).name
    destroySpirit(state, opp, target.instanceId, "destroy", destroyContext)
    if (cost <= 0) {
        log(state, `${sourceName}：${name}のコストが0のため、デッキは破棄しなかった。`)
        return
    }
    log(state, `${sourceName}：破壊した${name}のコストと同じ${cost}枚を相手のデッキから破棄する。`)
    millDeck(state, opp, cost, owner, srcType ? { sourceType: srcType } : undefined)
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

// BS07女教皇リル・サキュバス：自分のスピリットすべての『このスピリットの破壊時』効果を、
// **破壊させずに**発揮させる。フィールドからは取り除かないので、コアも場に残ったまま
const fireOwnDestroyTriggersHandler: ActionHandler<"fireOwnDestroyTriggers"> = (ctx) => {
    const { state, owner, sourceName } = ctx
        // 解決中に破壊・召喚で並びが変わりうるので、開始時点のスナップショットに対して回す
        const targets = [...state.players[owner].field.spirits]
        let fired = 0
        for (const inst of targets) {
            // 途中で場を離れた個体（自身の破壊時効果で消えた等）は飛ばす
            if (!state.players[owner].field.spirits.some((s) => s.instanceId === inst.instanceId)) continue
            if (!getCard(inst.cardId).effects.some((e) => e.kind === "triggered" && e.trigger === "onDestroy")) {
                continue
            }
            fireTrigger(state, owner, inst, "onDestroy")
            fired++
            if (state.winner) break
        }
        if (fired === 0) {
            log(state, `${sourceName}：『破壊時』効果を持つ自分のスピリットがいなかった。`)
            return
        }
        log(state, `${sourceName}：自分のスピリット${fired}体の『破壊時』効果を、破壊させずに発揮した。`)
        return
}

const destroySelfHandler: ActionHandler<"destroySelf"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // このスピリット（self）を破壊する（onDestroy誘発あり。selfがnull/不在ならno-op。コリスタル）
        if (!self) {
            log(state, `${sourceName}：selfが不在のため何も起こらなかった。`)
            return
        }
        destroySpirit(state, owner, self.instanceId, "destroy", undefined, { allowSuspend: true })
        return
}

const destroyAllNexusesWithCoresHandler: ActionHandler<"destroyAllNexusesWithCores"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // コアが1個以上置かれている両陣営のネクサスをすべて破壊する（フレイム・エルク）。
        // 破壊耐性（nexusIndestructible）はdestroyNexus内で尊重される
        let destroyed = 0
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            const targets = state.players[pid].field.nexuses
                .filter((n) => n.cores >= 1)
                .map((n) => n.instanceId)
            for (const instanceId of targets) {
                if (destroyNexus(state, pid, instanceId, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })) destroyed++
            }
        }
        if (destroyed === 0) {
            log(state, `${sourceName}：コアが置かれているネクサスがなかった。`)
        }
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

const sacrificeNexusThenWipeEnemyNexusCoresHandler: ActionHandler<"sacrificeNexusThenWipeEnemyNexusCores"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // サクリファイス：自分のネクサス1つを破壊し、相手の全ネクサス上のコアを相手のトラッシュへ置く。
        // 実対戦（interactiveTargets）では破壊するネクサスをプレイヤーが選び、
        // 非対話時はコア数最小（同数は配列先頭）を自動選択する
        const mine = state.players[owner].field.nexuses
        if (mine.length === 0) {
            log(state, `${sourceName}：自分のネクサスがなかった。`)
            return
        }
        const chosenNexus = targetInstanceId
            ? mine.find((n) => n.instanceId === targetInstanceId)
            : undefined
        if (!chosenNexus && targetInstanceId === undefined && state.interactiveTargets) {
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}：破壊する自分のネクサスを選んでください`,
                    mine,
                    action,
                    null,
                )
            ) {
                return
            }
        }
        const sacrifice = chosenNexus ?? mine.reduce((best, n) => (n.cores < best.cores ? n : best))
        const destroyed = destroyNexus(state, owner, sacrifice.instanceId, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })
        if (!destroyed) {
            log(state, `${sourceName}：ネクサスを破壊できなかったため効果は発動しなかった。`)
            return
        }
        const oppPlayer = state.players[opp]
        let total = 0
        for (const nexus of oppPlayer.field.nexuses) {
            if (nexus.cores <= 0) continue
            total += nexus.cores
            oppPlayer.trashCores += nexus.cores
            nexus.cores = 0
        }
        if (total === 0) {
            log(state, `${sourceName}：${oppPlayer.name}のネクサスにコアがなかった。`)
            return
        }
        log(
            state,
            `${sourceName}：${oppPlayer.name}のネクサス上のコア合計${total}個をトラッシュに置いた。`,
        )
        return
}

const returnNexusToHandHandler: ActionHandler<"returnNexusToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcType, targetInstanceId } = ctx
        // 1件戻すたびの共通処理：voidCoreToOwnTrashIfOpponent指定時、戻したネクサスが
        // 相手のものだったときのみボイドからその数のコアを自分のトラッシュへ（BS03メビウスリング）
        const bounceOne = (pid: PlayerId, nexus: CardInstance): void => {
            returnNexusToHand(state, pid, nexus.instanceId)
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

// BS01-104 千本槍の古戦場Lv2：このネクサス上のコア1個をトラッシュに置くことで、
// 相手のブロックしたスピリット1体を「バトル終了後に破壊する」予約を立てる（BattleState.endBattleDestroy）。
// **ここでは破壊しない**。実際の破壊は GameEngine のバトル解決＞７（【呪撃】の直後）で
// 通常の destroy 経路を通すので、装甲・効果耐性はその時点で判定される。
// self は発生源のネクサス自身（データ側で fieldEvent.selfMode:"source" を指定する）
const destroyBlockerAfterBattleHandler: ActionHandler<"destroyBlockerAfterBattle"> = (ctx, action) => {
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
    const cost = action.costSelfCoresToTrash
    if (self.cores < cost) {
        log(state, `${sourceName}：置くコアが足りなかった。`)
        return
    }
    // ネクサスのコアはレベルが下がるだけで消滅しない。**支払いでLv2を割っても予約は残る**
    // （発揮はコストを払った時点で成立している。2026-08-16 ユーザー確認）
    self.cores -= cost
    state.players[owner].trashCores += cost
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
        `${sourceName}：コア${cost}個をトラッシュに置き、${getCard(found.inst.cardId).name}をバトル終了後に破壊する。`,
    )
}

const handlers = {
    destroyBlockerAfterBattle: destroyBlockerAfterBattleHandler,
    destroyOnePerCost: destroyOnePerCostHandler,
    destroyCostsEachOne: destroyCostsEachOneHandler,
    destroy: destroyHandler,
    mutualDestroyChoice: mutualDestroyChoiceHandler,
    destroyAll: destroyAllHandler,
    destroyOwnByFamilyThenWipeEnemy: destroyOwnByFamilyThenWipeEnemyHandler,
    destroyDuplicateNames: destroyDuplicateNamesHandler,
    sacrificeOwnNexusesThenEnemyDestroysOwn: sacrificeOwnNexusesThenEnemyDestroysOwnHandler,
    destroyAllExceptChosenColors: destroyAllExceptChosenColorsHandler,
    destroyAllNexusesExceptChosenColors: destroyAllNexusesExceptChosenColorsHandler,
    costDestroyOwnThenOpponentDestroysToCost: costDestroyOwnThenOpponentDestroysToCostHandler,
    destroyNexus: destroyNexusHandler,
    destroyOneAmong: destroyOneAmongHandler,
    destroyByCostBudget: destroyByCostBudgetHandler,
    destroyByBpBudget: destroyByBpBudgetHandler,
    destroyPer: destroyPerHandler,
    destroyDownToOwnCount: destroyDownToOwnCountHandler,
    destroyThenMillByCost: destroyThenMillByCostHandler,
    destroyOwnByCost: destroyOwnByCostHandler,
    destroySelf: destroySelfHandler,
    fireOwnDestroyTriggers: fireOwnDestroyTriggersHandler,
    destroyAllNexusesWithCores: destroyAllNexusesWithCoresHandler,
    nexusCoresToTrash: nexusCoresToTrashHandler,
    sacrificeNexusThenWipeEnemyNexusCores: sacrificeNexusThenWipeEnemyNexusCoresHandler,
    returnNexusToHand: returnNexusToHandHandler,
    reviveLastDestroyedNexus: reviveLastDestroyedNexusHandler,
} satisfies Partial<ActionRegistry>

export default handlers
