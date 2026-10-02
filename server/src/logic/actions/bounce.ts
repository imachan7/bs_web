import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, CardType, Color, EffectAction, GameState, PlayerId, ResolvedTargetFilter, TargetFilter } from "../../type"
import { getCard, log, opponentOf, pushResumeFrames } from "../GameState"
import { bothSidesPids, askPayToNegateIfNeeded, gateTargetedApply, resistanceAgainst, detachBravesOnLeave, findSpiritAny, isResisted, notifyHandGained, pickAnySideByBp, pickAnySideCandidates, pickEnemyByBp, pickEnemyCandidates, requestChoice, returnSpiritToDeckBottom, markBounce, flushBounces, returnSpiritToDeckTop, returnSpiritToHand, tryInteractiveTargetChoice } from "../EffectModules"
import { effectiveBp, heavyArmorColorsOf, instColors, hasGlobalConstraint, instMatchesCostFilter, matchesTarget } from "../../../../shared/rules"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"
import { recordMoved } from "../record"
import { countedAmount } from "../counted"

// side:"own"（returnToHand/returnToDeckTopの自分側対象）の候補列挙。ハンドラ本体とpayの判定表
// （CHECKERS）の両方から呼び、判定と実際の対象がずれないようにする
function ownSideBounceCandidates(
    state: GameState,
    owner: PlayerId,
    selfInstanceId: string | undefined,
    filter: ResolvedTargetFilter,
): CardInstance[] {
    return state.players[owner].field.spirits.filter((s) => !s.pendingBounce && matchesTarget(state, owner, s, filter, selfInstanceId))
}

// ponytail: self相対フィルタ（maxBp:"selfBp"等）は解決せずに比べる。pay で使うカードが出たら normalizeFilter を通す
export function returnToHandCandidateCountForPay(
    state: GameState,
    owner: PlayerId,
    selfInstanceId: string | undefined,
    action: Extract<EffectAction, { type: "returnToHand" }>,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
): number {
    const opp = opponentOf(owner)
    const filter = (action.filter ?? {}) as unknown as ResolvedTargetFilter
    if (action.side === "own") return ownSideBounceCandidates(state, owner, selfInstanceId, filter).length
    const matches = (s: CardInstance) => matchesTarget(state, opp, s, filter, selfInstanceId)
    if (action.anySide) return pickAnySideCandidates(state, owner, matches, srcColors, srcType, "bounce").length
    return pickEnemyCandidates(state, opp, Infinity, matches, srcColors, srcType, "bounce").length
}

// pay の判定表（returnToDeckTop）が使う候補数
export function returnToDeckTopCandidateCountForPay(
    state: GameState,
    owner: PlayerId,
    selfInstanceId: string | undefined,
    action: Extract<EffectAction, { type: "returnToDeckTop" | "returnToDeckBottom" }>,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
): number {
    const opp = opponentOf(owner)
    const filter = (action.filter ?? {}) as unknown as ResolvedTargetFilter
    if (action.side === "own") return ownSideBounceCandidates(state, owner, selfInstanceId, filter).length
    const matches = (s: CardInstance) => matchesTarget(state, opp, s, filter, selfInstanceId)
    return action.anySide
        ? pickAnySideCandidates(state, owner, matches, srcColors, srcType, "bounce").length
        : pickEnemyCandidates(state, opp, Infinity, matches, srcColors, srcType, "bounce").length
}

const RETURN_FIELD_COLORS: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]


// 好きなだけ・コスト合計が予算まで：1体ずつ選ばせ、残り予算を budgetLeft に載せて再入する（INTERRUPTION_POINTS.md パターンB）。
// 非対話・候補1体はコスト最大から
function returnToHandByBudget(ctx: ActionCtx, action: Extract<EffectAction, { type: "returnToHand" }>): void {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const remaining = action.budgetLeft ?? countedAmount(state, owner, self, 1, action.costBudget!, srcType)
    if (action.budgetLeft === undefined) log(state, `${sourceName}：コスト合計${remaining}まで、相手のスピリットを手札に戻せる。`)
    const candidates = pickEnemyCandidates(state, opp, Infinity, () => true, srcColors, srcType, "bounce").filter(
        (s) => getCard(s.cardId).cost <= remaining,
    )
    if (candidates.length === 0) return
    let picked = targetInstanceId !== undefined ? candidates.find((s) => s.instanceId === targetInstanceId) : undefined
    if (!picked) {
        if (state.interactiveTargets && candidates.length >= 2) {
            requestChoice(
                state,
                owner,
                `${sourceName}：手札に戻す相手のスピリットを選んでください（残りコスト${remaining}）`,
                candidates.map((s) => s.instanceId),
                true,
                { ...action, budgetLeft: remaining },
                self,
            )
            return
        }
        picked = candidates.reduce((best, s) => (getCard(s.cardId).cost > getCard(best.cardId).cost ? s : best))
    }
    returnSpiritToHand(state, opp, picked, sourceName)
    if (state.winner) return
    ctx.resolve({ ...action, budgetLeft: remaining - getCard(picked.cardId).cost })
}

const returnToHandHandler: ActionHandler<"returnToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (action.all) {
            returnAllTargetsToHand(ctx, { side: action.anySide ? "both" : "opponent", ...(action.filter ? { filter: action.filter } : {}) })
            return
        }
        // BS15共通器：globalConstraint "noHandGainByEffect" が効いている間は、バウンス効果自体が
        // 発揮されない＝戻すはずのスピリットは場に残る（お互い。BS15-052天蒼元帥チョウハッカイ）
        if (hasGlobalConstraint(state, "noHandGainByEffect")) {
            log(state, `${sourceName}：効果によって手札が増やせないため発動しなかった。`)
            return
        }
        if (action.costBudget !== undefined) {
            returnToHandByBudget(ctx, action)
            return
        }
        // filter指定時は対象自動選択・明示ターゲット（誘発が渡すtargetInstanceId）の両方に絞り込みを適用する
        // （BS06レインディア：ブロックしたスピリットが系統「空牙」のときのみ手札に戻す）
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}の手札戻し：BP参照元がいなかった。`)
            return
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
            recordMoved(state, [found.inst.cardId])
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
        // side:"own"：自分側のスピリットだけが対象（pay { cost: returnToHand{side:"own"} } の器。
        // 自分の効果は自分のスピリットに免疫が働かないためisResistedは挟まない＝anySideの自分側と同じ扱い）
        if (action.side === "own") {
            const ownMatchesBp = (s: CardInstance) =>
                effectiveBp(state, owner, s) <= limitBp && !s.pendingBounce && matchesTarget(state, owner, s, filter, self?.instanceId)
            const ownCandidates = state.players[owner].field.spirits.filter(ownMatchesBp)
            if (
                state.interactiveTargets &&
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}の手札戻し：手札に戻す自分のスピリットを選んでください`,
                    ownCandidates,
                    { ...action, count: 1 },
                    resolvedCount > 1 ? { ...action, count: resolvedCount - 1, countPerOpponentNexus: false } : null,
                )
            ) {
                return
            }
            const moved: string[] = []
            for (let i = 0; i < resolvedCount; i++) {
                const pool = state.players[owner].field.spirits.filter(ownMatchesBp)
                if (pool.length === 0) {
                    log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                    break
                }
                const target = pool.reduce((best, s) => (effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best))
                markBounce(state, owner, target, "hand", sourceName)
                moved.push(target.cardId)
            }
            flushBounces(state)
            recordMoved(state, moved)
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
            const moved: string[] = []
            // 受けなかった対象は場に残るので、次の回で選び直さないよう除く。
            // 対話中にここへ来るのは候補が0〜1体のときだけなので、聞いて中断しても積む残りは無い
            const handledAny = new Set<string>()
            for (let i = 0; i < resolvedCount; i++) {
                const target = pickAnySideByBp(state, owner, limitBp, (s) => matchesBp(s) && !handledAny.has(s.instanceId), srcColors, srcType, "bounce")
                if (!target) {
                    log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                    break
                }
                handledAny.add(target.inst.instanceId)
                // 自分側の対象には耐性を挟まない（このアクションの anySide の非対称ルール）
                const resisted = target.pid === owner
                    ? null
                    : gateTargetedApply(state, target.pid, target.inst, attemptOf(ctx, "bounce", "targeted"), { ...action, count: 1 }, self, sourceName)
                if (resisted === "asked") return
                if (resisted) {
                    log(state, `${getCard(target.inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                    continue
                }
                markBounce(state, target.pid, target.inst, "hand", sourceName)
                moved.push(target.inst.cardId)
            }
            flushBounces(state)
            recordMoved(state, moved)
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
        const moved: string[] = []
        // 受けなかった対象は場に残るので、次の回で選び直さないよう除く。
        // 対話中にここへ来るのは候補が0〜1体のときだけなので、聞いて中断しても積む残りは無い
        const handled = new Set<string>()
        for (let i = 0; i < resolvedCount; i++) {
            const target = pickEnemyByBp(state, opp, limitBp, (s) => matchesFilter(s) && !handled.has(s.instanceId), srcColors, srcType, "bounce")
            if (!target) {
                log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                break
            }
            handled.add(target.instanceId)
            const resisted = gateTargetedApply(state, opp, target, attemptOf(ctx, "bounce", "targeted"), { ...action, count: 1 }, self, sourceName)
            if (resisted === "asked") return
            if (resisted) {
                log(state, `${getCard(target.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                continue
            }
            returnSpiritToHand(state, opp, target, sourceName)
            moved.push(target.cardId)
        }
        recordMoved(state, moved)
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

// 「すべて」を戻すのは範囲の効果（attempt が "area"）。returnToHand{all} もここを通す
function returnAllTargetsToHand(
    ctx: ActionCtx,
    action: { side: "opponent" | "both"; costFilter?: { max?: number; min?: number }; filter?: TargetFilter },
): void {
    const { state, opp, self, sourceName, srcType } = ctx
        // 1体版と同じく、手札を増やせない間は発揮しない（全員が場に残る。2026-09-24 ユーザー確認）
        if (hasGlobalConstraint(state, "noHandGainByEffect")) {
            log(state, `${sourceName}：効果によって手札が増やせないため発動しなかった。`)
            return
        }
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

// 戻す順番は持ち主が選ぶ（2026-08-24）。選び終えてから markBounce→flushBounces でまとめて戻すのは、1体ずつ即座に戻すと
// 誘発（「戻ったとき」等）が後続の対象選びに割り込んでしまうため（flushBouncesのコメント参照）
// all版の本体。returnToDeckTop/returnToDeckBottom共通（positionだけが違う）
function returnAllMatchingToDeck(ctx: ActionCtx, action: DeckReturnAction, position: "top" | "bottom"): void {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
        const posLabel = position === "top" ? "上" : "下"
        const resolvedFilter = action.filter === undefined ? undefined : normalizeFilter(ctx, { filter: action.filter })
        if (resolvedFilter === SELF_REQUIRED) {
            log(state, `${sourceName}：デッキの${posLabel}に戻す対象がいなかった。`)
            return
        }
        const targetPid = action.side === "own" ? owner : opp
        const pool = state.players[targetPid].field.spirits.filter((s) =>
            resolvedFilter === undefined || matchesTarget(state, targetPid, s, resolvedFilter, self?.instanceId),
        )
        const ordered = action.orderedIds ?? []
        // まだ順番を決めていない対象を集める。耐性の判定とログは**1周目だけ**行う
        // （判定結果は途中で変わらないので、選ぶたびに同じログを出さない）
        const firstPass = action.orderedIds === undefined
        const remaining: CardInstance[] = []
        for (const s of pool) {
            if (ordered.includes(s.instanceId)) continue
            const resisted = resistanceAgainst(state, targetPid, s, attemptOf(ctx, "bounce", "area"))
            if (resisted) {
                if (firstPass) {
                    log(state, `${getCard(s.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                }
                continue
            }
            remaining.push(s)
        }
        // 選択から戻ってきた：選ばれた1体を順番の末尾に積んで、残りを聞き直す
        if (targetInstanceId !== undefined && remaining.some((s) => s.instanceId === targetInstanceId)) {
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
                `${sourceName}：デッキの${posLabel}に戻す順番を選んでください（残り${remaining.length}体）`,
                remaining.map((s) => s.instanceId),
                false,
                { ...action, orderedIds: ordered },
                self,
            )
            return
        }
        const finalOrder = [...ordered, ...remaining.map((s) => s.instanceId)]
        let returned = 0
        for (const id of finalOrder) {
            const found = findSpiritAny(state, id)
            if (!found) continue
            markBounce(state, found.pid, found.inst, position === "top" ? "deckTop" : "deckBottom", sourceName)
            returned += 1
        }
        // 全部を待機させてから、選ばれた順に一度に戻す
        flushBounces(state, finalOrder)
        if (returned === 0) {
            log(state, `${sourceName}：デッキの${posLabel}に戻せるスピリットがいなかった。`)
        }
        return
}

type DeckReturnAction = Extract<EffectAction, { type: "returnToDeckTop" | "returnToDeckBottom" }>

const returnToDeckTopHandler: ActionHandler<"returnToDeckTop"> = (ctx, action) =>
    action.all ? returnAllMatchingToDeck(ctx, action, "top") : returnToDeck(ctx, action, "top")
const returnToDeckBottomHandler: ActionHandler<"returnToDeckBottom"> = (ctx, action) =>
    action.all ? returnAllMatchingToDeck(ctx, action, "bottom") : returnToDeck(ctx, action, "bottom")

function returnToDeck(ctx: ActionCtx, action: DeckReturnAction, position: "top" | "bottom"): void {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // count 指定（BS07ブリシンガメンの首飾り＝3体）：1体ずつ選ぶ連鎖にする。
        // 選ばれた順に一番上へ積むので、**最後に選んだものがデッキの一番上**になる
        //（＝「好きな順番で戻す」を1体ずつの選択で表現している）。
        // 残りは再開スタックではなく、1体の処理が済んだ所（chainNext）が excludeIds つきで次の1体を始める。
        // 聞く（払う確認）で中断しても、再開で同じ所を通るので残りが落ちない
        if (action.count !== undefined && action.count > 1 && targetInstanceId === undefined && action.excludeIds === undefined) {
            ctx.resolve({ ...action, excludeIds: [] }, { sourceColors: srcColors, sourceType: srcType })
            return
        }
        // filter（BS09-X38要塞騎神オーディーンType-X＝【転召】を持たない相手3体）：候補の絞り込み。
        // 自動選択・明示ターゲットの両方に効かせる
        const resolvedFilter = action.filter === undefined ? undefined : normalizeFilter(ctx, { filter: action.filter })
        const filterOk = (pid: PlayerId, s: CardInstance): boolean =>
            action.excludeIds?.includes(s.instanceId) !== true &&
            (resolvedFilter === undefined ||
                (resolvedFilter !== SELF_REQUIRED && matchesTarget(state, pid, s, resolvedFilter, self?.instanceId)))
        // anySide：自分/相手どちらのスピリットも対象にできる（destroy等のanySideと同じ非対称ルール。
        // 相手側候補には装甲・マジック効果耐性を尊重し、自分側には適用しない）
        if (targetInstanceId === undefined && state.interactiveTargets) {
            const candidates = action.side === "own"
                ? state.players[owner].field.spirits.filter((s) => filterOk(owner, s))
                : (action.anySide
                      ? pickAnySideCandidates(state, owner, (s) => action.excludeIds?.includes(s.instanceId) !== true, srcColors, srcType, "bounce")
                      : pickEnemyCandidates(state, opp, Infinity, (s) => filterOk(opp, s), srcColors, srcType, "bounce")
                  ).filter((s) => action.anySide === undefined || filterOk(opp, s))
            if (candidates.length >= 2) {
                // chooserIsTarget（BS07ブリシンガメンの首飾り）：「**相手は**、相手のスピリット3体を〜戻す」。
                // 選ぶのは戻される側だが、解決は発生源の持ち主の効果として行う（actorPid）
                requestChoice(
                    state,
                    owner,
                    action.chooserIsTarget
                        ? `${sourceName}：デッキの${position === "top" ? "上" : "下"}に戻す自分のスピリットを選んでください`
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
            : action.side === "own"
              ? (() => {
                    const pool = state.players[owner].field.spirits.filter((s) => filterOk(owner, s))
                    if (pool.length === 0) return null
                    const t = pool.reduce((best, s) => (effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best))
                    return { pid: owner, inst: t }
                })()
              : action.anySide
                ? pickAnySideByBp(state, owner, Infinity, (s) => action.excludeIds?.includes(s.instanceId) !== true, srcColors, srcType, "bounce")
                : (() => {
                      const t = pickEnemyByBp(state, opp, Infinity, (sp) => filterOk(opp, sp), srcColors, srcType, "bounce")
                      return t ? { pid: opp, inst: t } : null
                  })()
        if (!found) {
            log(state, `${sourceName}のデッキ戻し：対象がいなかった。`)
            return
        }
        // 1体の処理が済んだら（受けなかった場合も含め）残りの体数ぶんを次の1体として始める
        const chainNext = (): void => {
            if (action.excludeIds === undefined || action.count === undefined || action.count <= 1) return
            ctx.resolve(
                { ...action, count: action.count - 1, excludeIds: [...action.excludeIds, found.inst.instanceId] },
                { sourceColors: srcColors, sourceType: srcType },
            )
        }
        // 自分側の対象には耐性を挟まない（自動選択は従来どおり。明示された対象だけ改めて見る）。
        // 相手側は、選び方（明示／自動）に関わらず適用の直前に耐性を通す
        const deckTopResisted =
            targetInstanceId || found.pid !== owner
                ? gateTargetedApply(state, found.pid, found.inst, attemptOf(ctx, "bounce", "targeted"), action, self, sourceName)
                : null
        if (deckTopResisted === "asked") return
        if (deckTopResisted) {
            log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${deckTopResisted.label}）。`)
            chainNext()
            return
        }
        if (position === "top") returnSpiritToDeckTop(state, found.pid, found.inst, sourceName)
        else returnSpiritToDeckBottom(state, found.pid, found.inst, sourceName)
        recordMoved(state, [found.inst.cardId])
        chainNext()
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

const returnSelfToDeckTopHandler: ActionHandler<"returnSelfToDeckTop"> = (ctx) => {
    const { state, owner, self } = ctx
        if (!self) return
        const player = state.players[owner]
        // returnSelfToHandHandler と同じ形：破壊待機状態ならそこからデッキトップへ、既にトラッシュならそこから
        if (self.pendingDestruction) {
            const fieldIdx = player.field.spirits.findIndex((s) => s.instanceId === self.instanceId)
            if (fieldIdx >= 0) {
                player.field.spirits.splice(fieldIdx, 1)
                player.reserve += self.cores
                detachBravesOnLeave(state, owner, self)
            }
            delete self.pendingDestruction
            player.deck.unshift(self.cardId)
            log(state, `${getCard(self.cardId).name}はデッキの一番上に戻った。`)
            return
        }
        const idx = player.trashCards.lastIndexOf(self.cardId)
        if (idx >= 0) {
            player.trashCards.splice(idx, 1)
            player.deck.unshift(self.cardId)
            log(state, `${getCard(self.cardId).name}はデッキの一番上に戻った。`)
        }
        return
}

const handlers = {
    returnToHand: returnToHandHandler,
    returnToHandEachHeavyArmorColor: returnToHandEachHeavyArmorColorHandler,
    returnToDeckTop: returnToDeckTopHandler,
    returnToDeckBottom: returnToDeckBottomHandler,
    returnSelfToHand: returnSelfToHandHandler,
    returnSelfToDeckTop: returnSelfToDeckTopHandler,
} satisfies Partial<ActionRegistry>

export default handlers
