// バウンス（手札・デッキ上へ戻す）アクションのハンドラと候補数の判定
import { isReturnWaiting, isTrashWaiting } from "../../../../shared/rules/waiting"
import { takeFromTrash } from "../zones/trash"
import { handGainDenial } from "../handGate"
import { bounceDenial } from "../bounceGate"
import { gatePickedTargets, pickTargets } from "../pickTargets"
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, CardType, Color, EffectAction, GameState, PlayerId, ResolvedTargetFilter, TargetFilter } from "../../type"
import { getCard, log, opponentOf, pushResumeFrames } from "../GameState"
import { applyBothSidesRedirectToCandidates, returnNexusToDeckTop, voidCoreToOwnTrash, bothSidesPids, askPayToNegateIfNeeded, gateTargetedApply, resistanceAgainst, detachBravesOnLeave, findSpiritAny, isResisted, notifyHandGained, pickAnySideByBp, pickAnySideCandidates, pickEnemyByBp, pickEnemyCandidates, requestActivationConfirm, requestChoice, requestUpToChoice, returnNexusToHand, returnSpiritToDeckBottom, markBounce, flushBounces, returnSpiritToDeckTop, returnSpiritToHand, tryInteractiveTargetChoice } from "../EffectModules"
import { bravesOf, effectiveBp, heavyArmorColorsOf, instColors, hasGlobalConstraint, instMatchesCostFilter, matchesTarget } from "../../../../shared/rules"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"
import { lastMovedOf, recordMoved } from "../record"
import { detachBraveByEffect, returnCombinedBraveToHand } from "../brave"
import { withBounceBraveCantRemain } from "../removal"
import { countedAmount } from "../counted"
import { soulCoreLeavesField } from "../soulCore"

type HandReturn = Extract<EffectAction, { type: "return"; to: "hand" }>

// side:"own"（return の to:"hand"／"deckTop" の自分側対象）の候補列挙。ハンドラ本体とpayの判定表
// （CHECKERS）の両方から呼び、判定と実際の対象がずれないようにする
function ownSideBounceCandidates(
    state: GameState,
    owner: PlayerId,
    selfInstanceId: string | undefined,
    filter: ResolvedTargetFilter,
    to: "hand" | "deckTop",
): CardInstance[] {
    return state.players[owner].field.spirits.filter((s) => !isReturnWaiting(s) && matchesTarget(state, owner, s, filter, selfInstanceId) && bounceDenial(state, owner, s, to, true) === null)
}

// ponytail: self相対フィルタ（maxBp:"selfBp"等）は解決せずに比べる。pay で使うカードが出たら normalizeFilter を通す
export function returnToHandCandidateCountForPay(
    state: GameState,
    owner: PlayerId,
    selfInstanceId: string | undefined,
    action: HandReturn,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
): number {
    const opp = opponentOf(owner)
    const filter = (action.filter ?? {}) as unknown as ResolvedTargetFilter
    if (action.side === "own") return ownSideBounceCandidates(state, owner, selfInstanceId, filter, "hand").length
    const matches = (s: CardInstance) => matchesTarget(state, opp, s, filter, selfInstanceId)
    if (action.anySide) return pickAnySideCandidates(state, owner, matches, srcColors, srcType, "bounce").length
    return pickEnemyCandidates(state, opp, Infinity, matches, srcColors, srcType, "bounce").length
}

// pay の判定表（return の to:"deckTop"／"deckBottom"）が使う候補数
export function returnToDeckTopCandidateCountForPay(
    state: GameState,
    owner: PlayerId,
    selfInstanceId: string | undefined,
    action: Extract<EffectAction, { type: "return"; to: "deckTop" | "deckBottom" }>,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
): number {
    const opp = opponentOf(owner)
    const filter = (action.filter ?? {}) as unknown as ResolvedTargetFilter
    if (action.side === "own") return ownSideBounceCandidates(state, owner, selfInstanceId, filter, "deckTop").length
    const matches = (s: CardInstance) => matchesTarget(state, opp, s, filter, selfInstanceId)
    return action.anySide
        ? pickAnySideCandidates(state, owner, matches, srcColors, srcType, "bounce").length
        : pickEnemyCandidates(state, opp, Infinity, matches, srcColors, srcType, "bounce").length
}

const RETURN_FIELD_COLORS: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]


// 好きなだけ・コスト/BP合計が予算まで：1体ずつ選ばせ、残り予算を budgetLeft に載せて再入する（INTERRUPTION_POINTS.md パターンB）。
// 非対話・候補1体はコスト最大から
function returnToHandByBudget(ctx: ActionCtx, action: HandReturn): void {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    // budget は静的な数値上限（by:"bp" の重みは実効BP）、costBudget は EffectCounter で決まる値
    const byBp = action.budget?.by === "bp"
    const weightOf = (s: CardInstance): number => (byBp ? effectiveBp(state, opp, s) : getCard(s.cardId).cost)
    const unit = byBp ? "BP" : "コスト"
    const remaining =
        action.budgetLeft ??
        (action.budget !== undefined
            ? action.budget.counter !== undefined
                ? countedAmount(state, owner, self, action.budget.amount ?? 1, action.budget.counter, srcType)
                : (action.budget.amount ?? 0)
            : countedAmount(state, owner, self, 1, action.costBudget!, srcType))
    if (action.budgetLeft === undefined) log(state, `${sourceName}：${unit}合計${remaining}まで、相手のスピリットを手札に戻せる。`)
    const candidates = pickEnemyCandidates(state, opp, Infinity, () => true, srcColors, srcType, "bounce").filter(
        (s) => weightOf(s) <= remaining,
    )
    if (candidates.length === 0) return
    let picked = targetInstanceId !== undefined ? candidates.find((s) => s.instanceId === targetInstanceId) : undefined
    if (!picked) {
        // 「好きなだけ」は0体でやめることもできるので、候補が1体でも対話時は確認を出す
        if (state.interactiveTargets) {
            requestUpToChoice(
                state,
                owner,
                `${sourceName}：手札に戻す相手のスピリットを選んでください（残り${unit}${remaining}）`,
                candidates.map((s) => s.instanceId),
                { ...action, budgetLeft: remaining },
                self,
            )
            return
        }
        picked = candidates.reduce((best, s) => (weightOf(s) > weightOf(best) ? s : best))
    }
    returnSpiritToHand(state, opp, picked, sourceName)
    if (state.winner) return
    ctx.resolve({ ...action, budgetLeft: remaining - weightOf(picked) })
}

// target:"self"／"selfBrave"：自分のコストとして戻すので、耐性・装甲は見ない。
// selfBrave は合体中のブレイヴを外してから手札へ（2体以上なら持ち主が選ぶ。再入は costSacrificeChosen＋targetInstanceId）
function returnOwnAsCost(ctx: ActionCtx, action: HandReturn, target: "self" | "selfBrave"): void {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    if (!self || !state.players[owner].field.spirits.some((s) => s.instanceId === self.instanceId)) {
        log(state, `${sourceName}：手札に戻す自分のスピリットがいなかった。`)
        return
    }
    if (target === "self") {
        returnSpiritToHand(state, owner, self, sourceName)
        recordMoved(state, [self.cardId])
        return
    }
    const refs = self.braveRefs ?? []
    if (refs.length === 0) {
        log(state, `${sourceName}：手札に戻せるブレイヴがいなかった。`)
        return
    }
    let chosenId: string | undefined
    if (action.costSacrificeChosen && targetInstanceId !== undefined) {
        chosenId = refs.find((r) => r.instanceId === targetInstanceId)?.instanceId
    } else if (state.interactiveTargets && refs.length >= 2) {
        requestChoice(state, owner, `${sourceName}：手札に戻すブレイヴを選んでください`, refs.map((r) => r.instanceId), false, { ...action, costSacrificeChosen: true }, self)
        return
    } else {
        chosenId = refs[0]!.instanceId
    }
    const brave = state.players[owner].field.combinedBraves.find((b) => b.instanceId === chosenId)
    if (!brave) {
        log(state, `${sourceName}：指定されたブレイヴは戻せなかった。`)
        return
    }
    detachBraveByEffect(state, owner, self, brave)
    returnSpiritToHand(state, owner, brave, sourceName)
    recordMoved(state, [brave.cardId])
}

// 相手の合体スピリットのブレイヴ1つを手札に戻す。ホストは場に残る（BS22-034 Lv2）。
// 2つ以上いるときは戻す側の使用者が選ぶ。ブレイヴ個々の耐性は見ない（removeOneOfAnyType と同じ）
function returnOpponentBrave(ctx: ActionCtx, action: HandReturn): void {
    const { state, owner, opp, self, sourceName, targetInstanceId } = ctx
    const oppPlayer = state.players[opp]
    const battlingIds = state.battle ? [state.battle.attackerInstanceId, state.battle.blockerInstanceId] : []
    const pairs = oppPlayer.field.spirits
        .filter((sp) => !action.battlingOnly || battlingIds.includes(sp.instanceId))
        .flatMap((host) => bravesOf(oppPlayer, host).map((brave) => ({ host, brave })))
    if (pairs.length === 0) {
        log(state, `${sourceName}：手札に戻せる相手のブレイヴがいなかった。`)
        return
    }
    let chosen = targetInstanceId !== undefined ? pairs.find((p) => p.brave.instanceId === targetInstanceId) : undefined
    if (!chosen) {
        if (state.interactiveTargets && pairs.length >= 2) {
            requestChoice(state, owner, `${sourceName}：手札に戻す相手のブレイヴを選んでください`, pairs.map((p) => p.brave.instanceId), false, action, self)
            return
        }
        chosen = pairs[0]!
    }
    returnCombinedBraveToHand(state, opp, chosen.host, chosen.brave)
    recordMoved(state, [chosen.brave.cardId])
}

const returnToHandHandler = (ctx: ActionCtx, action: HandReturn): void => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // target:"self" の入口は2つ。破壊待機中・場にいない個体は破壊時の誘発（returnDestroyedSelfToHand）、
        // 場に健在な個体は pay のコスト（returnOwnAsCost）。データ側のどちらも onDestroy でしか使われないので状態で見分ける
        if (action.target === "self" && (isTrashWaiting(self) || !self || !state.players[owner].field.spirits.some((s) => s.instanceId === self.instanceId))) {
            returnDestroyedSelfToHand(ctx)
            return
        }
        if (action.countCounter !== undefined) {
            const n = countedAmount(state, owner, self, action.count, action.countCounter, srcType)
            if (n <= 0) {
                log(state, `${sourceName}：カウントが0のため手札に戻さなかった。`)
                return
            }
            const { countCounter: _cc, ...rest } = action
            action = { ...rest, count: n }
        }
        if (action.nexus === "only") {
            bounceNexusOnly(ctx, action)
            return
        }
        if (action.nexus) {
            returnToHandNexusOrSpirit(ctx, action)
            return
        }
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
        if (action.costBudget !== undefined || action.budget !== undefined) {
            returnToHandByBudget(ctx, action)
            return
        }
        if (action.target === "opponentBrave") {
            returnOpponentBrave(ctx, action)
            return
        }
        if (action.target !== undefined) {
            returnOwnAsCost(ctx, action, action.target)
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
        if (targetInstanceId && !action.choosing && !action.picked) {
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
        // 複数は全部選んでから一度に戻す（2026-11-12 ユーザー決定。pickTargets.ts。Wiki「バウンスについて」：
        // 1体ずつ戻すと、1体目の「戻ったとき」の誘発が2体目以降の対象を変えてしまう）。
        // side:"own"＝自分側（pay のコストの器。自分の効果なので耐性は挟まない）／anySide＝両陣営（相手側だけ耐性を見る）
        const own = action.side === "own"
        const matchesBp = (s: CardInstance) => effectiveBp(state, owner, s) <= limitBp && matchesTarget(state, opp, s, filter, self?.instanceId)
        const ownMatchesBp = (s: CardInstance) =>
            effectiveBp(state, owner, s) <= limitBp && !isReturnWaiting(s) && matchesTarget(state, owner, s, filter, self?.instanceId) && bounceDenial(state, owner, s, "hand") === null
        // バウンス耐性（against:"bounce"。BS06恐竜姫ジュラ）は、候補列挙へ op:"bounce" を渡すことで効く
        const matchesFilter = (s: CardInstance) => matchesTarget(state, opp, s, filter, self?.instanceId)
        const pool = own
            ? state.players[owner].field.spirits.filter(ownMatchesBp)
            : action.anySide
              ? pickAnySideCandidates(state, owner, matchesBp, srcColors, srcType, "bounce")
              : pickEnemyCandidates(state, opp, limitBp, matchesFilter, srcColors, srcType, "bounce")
        const { countPerOpponentNexus: _cpn, ...actionForChoice } = action
        let ids: string[] | null
        if (state.interactiveTargets) {
            ids = pickTargets(ctx, { ...actionForChoice, count: resolvedCount }, {
                candidates: pool.map((sp) => sp.instanceId),
                count: resolvedCount,
                upTo: false,
                prompt: own ? `${sourceName}の手札戻し：手札に戻す自分のスピリットを選んでください` : `${sourceName}の手札戻し：対象を選んでください`,
                verb: "手札に戻す",
            })
            if (ids === null) return
        } else {
            // 自動は実効BP最大から
            ids = []
            for (let i = 0; i < resolvedCount; i++) {
                const fresh = (s: CardInstance) => !ids!.includes(s.instanceId)
                const target = own
                    ? pool.filter(fresh).reduce<CardInstance | null>((b, s) => (b === null || effectiveBp(state, owner, s) > effectiveBp(state, owner, b) ? s : b), null)
                    : action.anySide
                      ? pickAnySideByBp(state, owner, limitBp, (s) => matchesBp(s) && fresh(s), srcColors, srcType, "bounce", true)?.inst ?? null
                      : pickEnemyByBp(state, opp, limitBp, (s) => matchesFilter(s) && fresh(s), srcColors, srcType, "bounce")
                if (!target) break
                ids.push(target.instanceId)
            }
        }
        const passed = gatePickedTargets(
            ctx,
            { ...actionForChoice, count: resolvedCount },
            ids,
            (id) => findSpiritAny(state, id) ?? undefined,
            attemptOf(ctx, "bounce", "targeted"),
            (inst, r) => log(state, `${getCard(inst.cardId).name}は${sourceName}の効果を受けなかった（${r.label}）。`),
            (pid) => pid === owner && (own || action.anySide === true),
        )
        if (passed === null) return
        if (ids.length === 0) log(state, `${sourceName}の手札戻し：対象がいなかった。`)
        const moved: string[] = []
        for (const id of passed) {
            const found = findSpiritAny(state, id)
            if (!found) continue
            markBounce(state, found.pid, found.inst, "hand", sourceName)
            moved.push(found.inst.cardId)
        }
        flushBounces(state)
        recordMoved(state, moved)
}

type NexusBounceAction = Extract<EffectAction, { type: "return"; to: "hand" | "deckTop" }>

// nexus:"only" の入口（return の to:"hand"／"deckTop"）
function bounceNexusOnly(ctx: ActionCtx, action: NexusBounceAction): void {
    const { state, owner, opp, self, sourceName, srcType, targetInstanceId } = ctx
    const toDeck = action.to === "deckTop"
        // bounceProgress は選択の再入をまたぐ「戻した回数」（内部用）。再入時は戻した記録を消さない
        if (action.bounceProgress === undefined) recordMoved(state, []) // 戻したカードの記録（「ネクサスを戻したなら」が読む）。何も戻せなかった道筋でも空にする
        // voidCoreToOwnTrashIfOpponent は「戻したカードが相手のもの」を if で書けないので軸のまま持つ
        const voidCore = action.to === "hand" ? action.voidCoreToOwnTrashIfOpponent : undefined
        const bounceOne = (pid: PlayerId, nexus: CardInstance): void => {
            recordMoved(state, [...lastMovedOf(state), nexus.cardId])
            if (toDeck) {
                returnNexusToDeckTop(state, pid, nexus.instanceId)
            } else {
                returnNexusToHand(state, pid, nexus.instanceId)
            }
            if (pid !== owner && voidCore) {
                voidCoreToOwnTrash(state, owner, voidCore)
                log(
                    state,
                    `${sourceName}：相手のネクサスを手札に戻したため、ボイドからコア${voidCore}個を自分のトラッシュに置いた。`,
                )
            }
        }
        // all：countを無視し、side（省略時はopponent）が指すネクサスすべてを戻す。
        // side:"both"は両陣営すべて（bothSidesPidsで封印された魔導書系の対象片側化にも対応。BS06ホワイトホール）
        if (action.all) {
            const sides: PlayerId[] = action.to === "hand" && action.side === "both" ? bothSidesPids(state, srcType) : [opp]
            let bounced = 0
            const nexusFilter = action.filter ? normalizeFilter(ctx, action) : undefined
            for (const pid of sides) {
                // bounceOne が field.nexuses を破壊的に変更するため、対象をスナップショットしてから戻す
                for (const nexus of [...state.players[pid].field.nexuses]) {
                    // 指定した色のネクサスだけ戻す（BS22-052 連鎖[白]）
                    if (nexusFilter && nexusFilter !== SELF_REQUIRED && !matchesTarget(state, pid, nexus, nexusFilter, self?.instanceId)) continue
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
        let picked = action.bounceProgress !== undefined ? targetInstanceId : undefined
        for (let i = action.bounceProgress ?? 0; i < (action.count ?? 1); i++) {
            const cands = state.players[opp].field.nexuses
            let nexus: CardInstance | undefined
            if (picked !== undefined) {
                nexus = cands.find((n) => n.instanceId === picked)
                picked = undefined
            } else if (state.interactiveTargets && cands.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：${toDeck ? "デッキの上" : "手札"}に戻すネクサスを選んでください`,
                    cands.map((n) => n.instanceId),
                    false,
                    { ...action, bounceProgress: i },
                    self,
                    "target",
                )
                return
            } else nexus = cands[0]
            if (!nexus) {
                log(state, `${sourceName}のネクサス手札戻し：対象がいなかった。`)
                break
            }
            bounceOne(opp, nexus)
        }
        return
}

// nexus:"also" 版：スピリットとネクサスを1つの一覧から選び、全部選んでから一度に戻す（returnToHand と同じ。2026-11-13 ユーザー決定）。
// 非対話は実効BP最大のスピリット優先→残り枠を場の並び順のネクサスへ
function returnToHandNexusOrSpirit(ctx: ActionCtx, action: HandReturn): void {
    const { state, opp, self, sourceName, srcColors, srcType } = ctx
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) {
        log(state, `${sourceName}の手札戻し：BP参照元がいなかった。`)
        return
    }
    const oppField = state.players[opp].field
    const spirits = action.nexus === "also"
        ? pickEnemyCandidates(state, opp, Infinity, (s) => matchesTarget(state, opp, s, filter, self?.instanceId), srcColors, srcType, "bounce")
        : []
    const nexuses = [...oppField.nexuses]
    const count = action.count
    let ids: string[] | null
    if (state.interactiveTargets) {
        ids = pickTargets(ctx, action, {
            candidates: [...spirits, ...nexuses].map((c) => c.instanceId),
            count,
            upTo: false,
            prompt: `${sourceName}：手札に戻す相手の${action.nexus === "also" ? "スピリット/ネクサス" : "ネクサス"}を選んでください`,
            verb: "手札に戻す",
        })
        if (ids === null) return
    } else {
        const bySpirit = [...spirits].sort((x, y) => effectiveBp(state, opp, y) - effectiveBp(state, opp, x))
        ids = [...bySpirit, ...nexuses].slice(0, count).map((c) => c.instanceId)
    }
    const nexusOf = (id: string) => oppField.nexuses.find((n) => n.instanceId === id)
    const passed = gatePickedTargets(
        ctx,
        action,
        ids,
        (id) => {
            const n = nexusOf(id)
            return n ? { pid: opp, inst: n } : findSpiritAny(state, id) ?? undefined
        },
        attemptOf(ctx, "bounce", "targeted"),
        (inst, r) => log(state, `${getCard(inst.cardId).name}は${sourceName}の効果を受けなかった（${r.label}）。`),
        (_pid, inst) => nexusOf(inst.instanceId) !== undefined,
    )
    if (passed === null) return
    if (passed.length === 0) {
        log(state, `${sourceName}の手札戻し：対象がいなかった。`)
        return
    }
    const moved: string[] = []
    for (const id of passed) {
        const n = nexusOf(id)
        if (n) continue
        const found = findSpiritAny(state, id)
        if (found && markBounce(state, found.pid, found.inst, "hand", sourceName)) moved.push(found.inst.cardId)
    }
    for (const id of passed) {
        const n = nexusOf(id)
        if (!n) continue
        returnNexusToHand(state, opp, n.instanceId)
        moved.push(n.cardId)
    }
    flushBounces(state)
    recordMoved(state, moved)
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
        ctx.resolve({ type: "return", to: "hand", count: 1, filter: { color } }, {
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
        const moved: string[] = []
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
                moved.push(s.cardId)
                returned++
            }
        }
        // 全部を待機させてから一度に戻す（「戻ったとき」の誘発は全部戻ってからまとめて発揮する）
        flushBounces(state)
        // 戻したカードを lastMoved に書く（「この効果で手札に戻した1体につき」が読む。1体版と同じ）
        recordMoved(state, moved)
        if (returned === 0) log(state, `${sourceName}：手札に戻す対象がいなかった。`)
        return
}

// 戻す順番は持ち主が選ぶ（2026-08-24）。選び終えてから markBounce→flushBounces でまとめて戻すのは、1体ずつ即座に戻すと
// 誘発（「戻ったとき」等）が後続の対象選びに割り込んでしまうため（flushBouncesのコメント参照）
// all版の本体。to:"deckTop"／"deckBottom" 共通（positionだけが違う）
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

type DeckReturnAction = Extract<EffectAction, { type: "return"; to: "deckTop" | "deckBottom" }>

function returnSelfToDeckBottomAsCost(ctx: ActionCtx): void {
    const { state, owner, self, sourceName } = ctx
    if (!self || !state.players[owner].field.spirits.some((s) => s.instanceId === self.instanceId)) {
        log(state, `${sourceName}：デッキの下に戻す自分のスピリットがいなかった。`)
        return
    }
    returnSpiritToDeckBottom(state, owner, self, sourceName)
    recordMoved(state, [self.cardId])
}

const returnToDeckTopHandler = (ctx: ActionCtx, action: Extract<EffectAction, { type: "return"; to: "deckTop" }>): void =>
    action.nexus === "only" ? bounceNexusOnly(ctx, action) : action.target === "self" ? returnDestroyedSelfToDeckTop(ctx) : action.all ? returnAllMatchingToDeck(ctx, action, "top") : returnToDeck(ctx, action, "top")
const returnToDeckBottomHandler = (ctx: ActionCtx, action: DeckReturnAction): void =>
    action.target === "self" ? returnSelfToDeckBottomAsCost(ctx) : action.all ? returnAllMatchingToDeck(ctx, action, "bottom") : returnToDeck(ctx, action, "bottom")

function returnToDeck(ctx: ActionCtx, action: DeckReturnAction, position: "top" | "bottom"): void {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // filter（BS09-X38要塞騎神オーディーンType-X＝【転召】を持たない相手3体）：候補の絞り込み。
        // 自動選択・明示ターゲットの両方に効かせる
        const resolvedFilter = action.filter === undefined ? undefined : normalizeFilter(ctx, { filter: action.filter })
        const filterOk = (pid: PlayerId, s: CardInstance): boolean =>
            action.excludeIds?.includes(s.instanceId) !== true &&
            (resolvedFilter === undefined ||
                (resolvedFilter !== SELF_REQUIRED && matchesTarget(state, pid, s, resolvedFilter, self?.instanceId)))
        // 明示された1体（誘発が渡す対象・クライアントが先に選んだ対象）
        if (targetInstanceId !== undefined && !action.choosing && !action.picked) {
            const found = findSpiritAny(state, targetInstanceId)
            if (!found) {
                log(state, `${sourceName}のデッキ戻し：対象がいなかった。`)
                return
            }
            const r = gateTargetedApply(state, found.pid, found.inst, attemptOf(ctx, "bounce", "targeted"), action, self, sourceName)
            if (r === "asked") return
            if (r) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${r.label}）。`)
                return
            }
            if (position === "top") returnSpiritToDeckTop(state, found.pid, found.inst, sourceName)
            else returnSpiritToDeckBottom(state, found.pid, found.inst, sourceName)
            recordMoved(state, [found.inst.cardId])
            return
        }
        // 複数は全部選んでから一度に戻す（2026-11-12 ユーザー決定。pickTargets.ts）。
        // 選んだ順に積むので、**最後に選んだものがデッキの一番上**になる（「好きな順番で戻す」を選ぶ順で表す）。
        // anySide は自分側に耐性を挟まない。chooserIsTarget（BS07ブリシンガメンの首飾り）は戻される側が選び、解決は発生源の持ち主の効果
        const own = action.side === "own"
        const pool = own
            ? state.players[owner].field.spirits.filter((s) => filterOk(owner, s))
            : (action.anySide
                  ? pickAnySideCandidates(state, owner, (s) => action.excludeIds?.includes(s.instanceId) !== true, srcColors, srcType, "bounce")
                  : pickEnemyCandidates(state, opp, Infinity, (s) => filterOk(opp, s), srcColors, srcType, "bounce")
              ).filter((s) => action.anySide === undefined || filterOk(opp, s))
        const count = action.count ?? 1
        let ids: string[] | null
        if (state.interactiveTargets) {
            ids = pickTargets(ctx, action, {
                candidates: pool.map((sp) => sp.instanceId),
                count,
                upTo: false,
                prompt: action.chooserIsTarget
                    ? `${sourceName}：デッキの${position === "top" ? "上" : "下"}に戻す自分のスピリットを選んでください`
                    : `${sourceName}のデッキ戻し：対象を選んでください`,
                verb: `デッキの${position === "top" ? "上" : "下"}に戻す`,
                ordered: true,
                ...(action.chooserIsTarget ? { chooserPid: opp } : {}),
            })
            if (ids === null) return
        } else {
            ids = []
            for (let i = 0; i < count; i++) {
                const fresh = (s: CardInstance) => !ids!.includes(s.instanceId)
                const t = own
                    ? pool.filter(fresh).reduce<CardInstance | null>((b, s) => (b === null || effectiveBp(state, owner, s) > effectiveBp(state, owner, b) ? s : b), null)
                    : action.anySide
                      ? pickAnySideByBp(state, owner, Infinity, (s) => action.excludeIds?.includes(s.instanceId) !== true && fresh(s), srcColors, srcType, "bounce", true)?.inst ?? null
                      : pickEnemyByBp(state, opp, Infinity, (sp) => filterOk(opp, sp) && fresh(sp), srcColors, srcType, "bounce")
                if (!t) break
                ids.push(t.instanceId)
            }
        }
        if (ids.length === 0) {
            log(state, `${sourceName}のデッキ戻し：対象がいなかった。`)
            return
        }
        const passed = gatePickedTargets(
            ctx,
            action,
            ids,
            (id) => findSpiritAny(state, id) ?? undefined,
            attemptOf(ctx, "bounce", "targeted"),
            (inst, r) => log(state, `${getCard(inst.cardId).name}は${sourceName}の効果を受けなかった（${r.label}）。`),
            (pid) => pid === owner,
        )
        if (passed === null) return
        const moved: string[] = []
        for (const id of passed) {
            const found = findSpiritAny(state, id)
            if (!found) continue
            markBounce(state, found.pid, found.inst, position === "top" ? "deckTop" : "deckBottom", sourceName)
            moved.push(found.inst.cardId)
        }
        flushBounces(state, passed)
        recordMoved(state, moved)
}

// 場を離れる手順はバウンスと同じ（markBounce → flushBounces）。持ち主のバーストエリアへ置く点だけが違う
const returnToBurstHandler: ActionHandler<"returnToBurst"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    const player = state.players[owner]
    if (player.burstSet) {
        log(state, `${sourceName}：バーストが既にセットされているため、発動しなかった。`)
        return
    }
    const filter = action.filter === undefined ? undefined : normalizeFilter(ctx, { filter: action.filter })
    const candidates = player.field.spirits.filter(
        (s) => !isReturnWaiting(s) && (filter === undefined || (filter !== SELF_REQUIRED && matchesTarget(state, owner, s, filter, self?.instanceId))),
    )
    const picked = targetInstanceId !== undefined ? candidates.find((s) => s.instanceId === targetInstanceId) : candidates[0]
    if (!picked) {
        log(state, `${sourceName}：バーストとしてセットするスピリットがいなかった。`)
        return
    }
    if (targetInstanceId === undefined && candidates.length >= 2 && state.interactiveTargets) {
        requestChoice(state, owner, `${sourceName}：バーストとしてセットするスピリットを選んでください`, candidates.map((s) => s.instanceId), false, action, self, "target")
        return
    }
    markBounce(state, owner, picked, "burst", sourceName)
    flushBounces(state)
    recordMoved(state, [picked.cardId])
}

// 破壊時の誘発で「このスピリットを手札に戻す」。破壊待機中かトラッシュにいる個体が対象で、耐性は見ない
function returnDestroyedSelfToHand(ctx: ActionCtx): void {
    const { state, owner, self, sourceName } = ctx
        if (!self) return
        const player = state.players[owner]
        const blocked = (from: "field" | "trash"): boolean => {
            if (!handGainDenial(state, { pid: owner, from, cause: "effect" })) return false
            log(state, `${sourceName}：手札に加えられないため発動しなかった。`)
            return true
        }
        // 破壊時に呼ばれる。このとき自分のカードは**破壊待機状態でまだフィールドにいる**ので、
        // そこから手札へ移す（TIMING_CHART.md §1.5。乗っていたコアはリザーブへ）。
        // 破壊待機状態を解いてから抜けるので、あとで commitPendingDestruction がトラッシュへ送ることはない
        if (isTrashWaiting(self)) {
            if (blocked("field")) return
            const fieldIdx = player.field.spirits.findIndex((s) => s.instanceId === self.instanceId)
            if (fieldIdx >= 0) {
                player.field.spirits.splice(fieldIdx, 1)
                soulCoreLeavesField(player, self) // 案B-inside: 先に[ソウルコア]退避
                player.reserve += self.cores
                detachBravesOnLeave(state, owner, self, false, "hand") // 合体していたブレイヴを外す（§6.1.1。コアを移した後。§6.3.1。残さないなら手札へ §6.3.2）
            }
            delete self.waiting
            player.hand.push(self.cardId)
            log(state, `${getCard(self.cardId).name}は手札に戻った。`)
            notifyHandGained(state, owner, 1)
            return
        }
        // 破壊以外の経路（既にトラッシュへ送られている場合）への保険
        const idx = player.trashCards.lastIndexOf(self.cardId)
        if (idx >= 0) {
            if (blocked("trash")) return
            if (takeFromTrash(state, owner, idx, "effect") === null) return
            player.hand.push(self.cardId)
            log(state, `${getCard(self.cardId).name}は手札に戻った。`)
            notifyHandGained(state, owner, 1)
        }
        return
}

function returnDestroyedSelfToDeckTop(ctx: ActionCtx): void {
    const { state, owner, self } = ctx
        if (!self) return
        const player = state.players[owner]
        // returnDestroyedSelfToHand と同じ形：破壊待機状態ならそこからデッキトップへ、既にトラッシュならそこから
        if (isTrashWaiting(self)) {
            const fieldIdx = player.field.spirits.findIndex((s) => s.instanceId === self.instanceId)
            if (fieldIdx >= 0) {
                player.field.spirits.splice(fieldIdx, 1)
                soulCoreLeavesField(player, self) // 案B-inside: 先に[ソウルコア]退避
                player.reserve += self.cores
                detachBravesOnLeave(state, owner, self, false, "deckTop")
            }
            delete self.waiting
            player.deck.unshift(self.cardId)
            log(state, `${getCard(self.cardId).name}はデッキの一番上に戻った。`)
            return
        }
        const idx = player.trashCards.lastIndexOf(self.cardId)
        if (idx >= 0 && takeFromTrash(state, owner, idx, "effect") !== null) {
            player.deck.unshift(self.cardId)
            log(state, `${getCard(self.cardId).name}はデッキの一番上に戻った。`)
        }
        return
}

const handlers = {
    return: (ctx, action) =>
        action.to === "hand" ? withBounceBraveCantRemain(action.braveCantRemain === true, () => returnToHandHandler(ctx, action)) : action.to === "deckTop" ? returnToDeckTopHandler(ctx, action) : returnToDeckBottomHandler(ctx, action),
    returnToHandEachHeavyArmorColor: returnToHandEachHeavyArmorColorHandler,
    returnToBurst: returnToBurstHandler,
} satisfies Partial<ActionRegistry>

export default handlers
