// 「〜することで〜する」の汎用の器（COST_MODEL.md §1）。cost・thenとも書いてある数どおりに
// 解決できるときだけ発揮する。判定を通すのはこのファイルだけの責務で、実際の解決は
// 各typeの既存ハンドラへ resolveInOrder 経由でそのまま委譲する（sequenceと同じ frame の作り方）。
import { bounceDenial } from "../bounceGate"
import { entryActive } from "../../../../shared/rules/effectStop"
import { noteKeyword } from "../../../../shared/coverage"
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import { millAllowed } from "../zones/mill"
import { coreGainAllowed } from "../coreGainCap"
import type { CardData, CardInstance, CardType, Color, EffectAction, GameState, PlayerId, ResolvedTargetFilter } from "../../type"
import { findInstanceAnywhere, getCard, log, minLevelCores, opponentOf, resolveInOrder } from "../GameState"
import { revertDestroyGroupUsage, revertOncePerTurn } from "../triggers"
import { isOnceUsed, markOnceUsed } from "../oncePerTurn"
import { autoPayPlan, canExhaustNexus, payCost } from "../EffectModules"
import { currentLevel } from "../GameState"
import { burstTenshoUnpayable } from "../keywords/tensho"
import { suspend } from "../GameState"
import { exhaustNexus, exhaustSpirit } from "../state/exhaust"
import { kyoshuLimitOf, kyoshuSelfExhaustSources, kyoshuUsedOf } from "../keywords/kyoshu"
import { lifeLossAllowed } from "../lifeGate"
import { canDiscardHand, effectiveBp, hasGlobalConstraint, isEndStepLocked, instColors, matchesFamilyFilter, matchesTarget, noteHeldKeyword, bravesOf } from "../../../../shared/rules"
import { budgetDestroyHasTarget, destroyCandidateCountForPay, destroyNexusCandidateCountForPay, reviveLastDestroyedNexusBlockReason } from "./destroy"
import { returnToDeckTopCandidateCountForPay, returnToHandCandidateCountForPay } from "./bounce"
import { removeCoresAchievableCountForPay, removeCoresKyokaBonus } from "./removeCores"
import { kyokaBonus } from "../keywords/kyoka"
import { availableFromSource, isLegacyPlaceCores, gainTo, placeCoresPoolCandidates } from "./placeCores"
import { gatherPayable } from "./placeCoresGather"
import { refreshOneOwnCandidates } from "./exhaustRefresh"
import { summonFromHandFreeCandidateMatches } from "../summon"
import { fieldCoresSpendable, moveCardCandidates, moveCardsPayable } from "./moveCards"
import { canPayFreeSummonSurcharge } from "../summonSurcharge"
import { normalReserveOf } from "../soulCore"
import { bofuCountFor, findSpiritAny, millCapBonusFor } from "../EffectModules"
import { pickEnemyByBp, pickEnemyCandidates, requestActivationConfirm, requestChoice } from "../targeting"
import { countedAmount } from "../counted"
import { normalizeFilter, SELF_REQUIRED } from "./filter"
import { newRecordScope, withMovedProbe } from "../record"
import { matchesPick } from "./revealAction"
import { deckDiscardKyokaCount } from "./mill"
import { soulCoreToTrashPossible } from "../soulCore"
import { lastBurstAction } from "./repeatBurst"

// 手札・バースト・手元の破棄が払えるか（判定表の discard から呼ぶ）
function discardPayable(state: GameState, owner: PlayerId, action: Extract<EffectAction, { type: "discard"; from: "hand" | "burst" | "tegamoto" }>): boolean {
    const pids: PlayerId[] =
        action.side === "both" ? [owner, opponentOf(owner)] : [action.forcedTargetPid ?? (action.side === "own" ? owner : opponentOf(owner))]
    return pids.every((pid) => {
        const p = state.players[pid]
        if (action.from === "burst") return p.burst !== null
        if (action.from === "tegamoto") return p.tegamoto.length >= 1
        if (action.count === "all") return p.hand.length >= 1 && canDiscardHand(state, pid)
        const n = action.cardTypeFilter ? p.hand.filter((id) => getCard(id).type === action.cardTypeFilter).length : p.hand.length
        return n >= (action.count ?? 1)
    })
}

// 判定表に載っている type だけが pay の cost/then に書ける（scripts/validate-cards.ts が突き合わせる）
export const PAYABLE_TYPES = [
    "draw", "discard", "setBurstFromHand", "timedEffect",
    "destroy", "return", "removeCores", "refresh",
    "exhaust",
    "placeCores", "summon",
    "moveCards", "destroyBlockerAfterBattle",
    "lifeCrush", "levelOverrideOpponentNexuses", "protectLifeByCostThisTurn",
    "negateLifeDamageFromTarget", "toTegamoto", "lendSelfThisTurn",
    "peekOpponentHand", "revealHandCard", "sequence", "if", "simultaneous", "soulCoreToTrash", "treatAsUnblocked", "heavyExhaust", "peekOpponentBurst", "repeatBurstEffect",
    "discardUnder", "endAttackStepAfterBattle", "destroyBrave",
] as const

type Checker = (state: GameState, owner: PlayerId, self: CardInstance | null, action: EffectAction, srcColors: Color[] | undefined, srcType: CardType | undefined, eventTarget?: string) => boolean

function summonFromHandPayable(state: GameState, owner: PlayerId, self: CardInstance | null, action: Extract<EffectAction, { type: "summon"; from: "hand" }>, srcType: CardType | undefined): boolean {
    const candidates = state.players[owner].hand.filter((id) => summonFromHandFreeCandidateMatches(state, owner, self, action, id))
    if (action.countCounter === undefined) return candidates.length > 0
    // 払ったコアの数ぶん召喚できるか。召喚先に置くコアは、払った後に残るリザーブから出す（記録は pay の探索中の仮の値）
    const n = countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
    if (n === 0) return false
    if (candidates.length < n) return false
    const maintain = candidates.map((id) => minLevelCores(getCard(id))).sort((a, b) => a - b).slice(0, n).reduce((a, b) => a + b, 0)
    return state.players[owner].reserve - n >= maintain
}

const CHECKERS: Partial<Record<EffectAction["type"], Checker>> = {
    draw: (state, owner, self, action, _srcColors, srcType) => {
        if (action.type !== "draw") return false
        const count =
            action.countCounter !== undefined
                ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
                : action.count
        return state.players[owner].deck.length >= count
    },
    toTegamoto: (state, owner, _self, action) => {
        if (action.type !== "toTegamoto") return false
        return action.count === "any" || state.players[owner].hand.filter((id) => matchesPick(id, action.pick)).length >= action.count
    },
    lendSelfThisTurn: () => true,
    // 「このバトルが終了したとき、アタックステップを終了する」は予約するだけなので、いつでも成立する（SD10-015）
    endAttackStepAfterBattle: () => true,
    // peekOpponentHand：相手の手札が1枚以上あるか
    peekOpponentHand: (state, owner) => state.players[opponentOf(owner)].hand.length >= 1,
    peekOpponentBurst: (state, owner) => state.players[opponentOf(owner)].burst !== null,
    revealHandCard: (state, owner, self, action) => action.type === "revealHandCard" && state.players[owner].hand.some((id) => matchesPick(id, action.pick, undefined, self?.cardId)),
    // 繰り返すバースト効果の中身が、いま解決できるとき（選べる対象がなければ偽）
    repeatBurstEffect: (state, owner, self, _action, srcColors, srcType) => {
        const last = lastBurstAction(state, owner)
        return last !== null && canPayResolve(state, owner, null, last.action, srcColors, srcType)
    },
    // if：条件が成り立たないことは「解決できない」ではない（then の中身は条件が成り立ったときだけ見る側の責任）
    if: () => true,
    // destroyBrave：side:"own" は発生源（self＝ホスト）に cardId のブレイヴが合体していれば支払える。
    // 相手側（省略形）はブレイヴを壊せる相手の合体スピリットがいるか
    destroyBrave: (state, owner, self, action) => {
        if (action.type !== "destroyBrave") return false
        if (action.side === "own") {
            return self !== null && bravesOf(state.players[owner], self).some((b) => b.cardId === action.cardId)
        }
        const oppPlayer = state.players[opponentOf(owner)]
        return oppPlayer.field.spirits.some((sp) => bravesOf(oppPlayer, sp).length > 0)
    },
    // sequence：中身のアクションすべてが成立するときだけ成立（一般則どおり「書いてある数どおり」全部）
    sequence: (state, owner, self, action, srcColors, srcType, eventTarget) => {
        if (action.type !== "sequence") return false
        return action.actions.every((a) => canPayResolve(state, owner, self, a, srcColors, srcType, eventTarget))
    },
    // simultaneous：中の全部が成立するとき。自分自身を壊す組では、同じ個体を相手方の destroy の候補に数えない
    simultaneous: (state, owner, self, action, srcColors, srcType, eventTarget) => {
        if (action.type !== "simultaneous") return false
        const withSelf = action.actions.some((a) => a.type === "destroy" && a.target === "self")
        return action.actions.every((a) => {
            if (withSelf && a.type === "destroy" && a.side === "own" && a.count !== "any" && self) {
                const filter = { ...(a.filter ?? {}) } as unknown as ResolvedTargetFilter
                const n = state.players[owner].field.spirits.filter((s) => s.instanceId !== self.instanceId && matchesTarget(state, owner, s, filter, self.instanceId)).length
                return n >= a.count
            }
            return canPayResolve(state, owner, self, a, srcColors, srcType, eventTarget)
        })
    },
    soulCoreToTrash: (state, owner) => soulCoreToTrashPossible(state.players[owner].soulCore),
    // discardUnder：発生源のスピリットの下に count 枚あること（BS19-X02）
    discardUnder: (state, owner, self, action) => action.type === "discardUnder" && self !== null && (self.underCards?.length ?? 0) >= action.count,
    setBurstFromHand: (state, owner) => {
        return state.players[owner].hand.some((cardId) => getCard(cardId).effects.some((e) => e.kind === "burst"))
    },
    // 自分自身に置くものは自分が場にいること。プレイヤーに掛ける制約（playerRule／battleLock）は対象を要らないので常に成立
    // target 未指定（相手のスピリットを1体指定する書き方）は、filter に合う相手のスピリットが1体以上いること
    timedEffect: (state, owner, self, action) => {
        if (action.type !== "timedEffect") return false
        if (action.target === "self") return self !== null
        if (action.target === "lastBuffed") return state.lastBpBuffTargetId !== undefined && findSpiritAny(state, state.lastBpBuffTargetId) !== null
        if (action.content.every((c) => c.type === "playerRule" || c.type === "battleLock" || c.type === "braveBpBonusZero" || c.type === "braveCostZero")) return true
        const filter = { ...(action.filter ?? {}) } as unknown as ResolvedTargetFilter
        const pids = action.side === "own" ? [owner] : action.side === "both" ? [owner, opponentOf(owner)] : [opponentOf(owner)]
        return pids.some((pid) => state.players[pid].field.spirits.some((s) => matchesTarget(state, pid, s, filter, self?.instanceId)))
    },
    destroy: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "destroy") return false
        // 予算つきは、予算に収まる相手のスピリットが1体以上いること
        if (action.budget) return budgetDestroyHasTarget(state, owner, self, action, srcColors, srcType)
        // ネクサス自身も自分自身として払える
        if (action.target === "self") return self !== null && [...state.players[owner].field.spirits, ...state.players[owner].field.nexuses].some((s) => s.instanceId === self.instanceId)
        if (action.nexus === "only") return action.count === "any" || destroyNexusCandidateCountForPay(state, owner, action, srcType) >= action.count
        return action.count === "any" || destroyCandidateCountForPay(state, owner, self?.instanceId, action, srcColors, srcType) >= action.count
    },
    return: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "return") return false
        if (action.to !== "hand") {
            if (action.to === "deckBottom" && action.target === "self") return self !== null && state.players[owner].field.spirits.some((s) => s.instanceId === self.instanceId) && bounceDenial(state, owner, self, "deckBottom", true) === null
            return returnToDeckTopCandidateCountForPay(state, owner, self?.instanceId, action, srcColors, srcType) >= (action.count ?? 1)
        }
        if (action.costBudget !== undefined) return true
        // 戻らないスピリットは戻すコストの候補から外す（cantBounce）。この表はマジックの対象の有無にも使うので、相手を戻す形には掛けない
        if (action.target === "self") return self !== null && state.players[owner].field.spirits.some((s) => s.instanceId === self.instanceId) && bounceDenial(state, owner, self, "hand", true) === null
        if (action.target === "selfBrave") return self !== null && (self.braveRefs?.length ?? 0) >= 1
        return returnToHandCandidateCountForPay(state, owner, self?.instanceId, action, srcColors, srcType) >= action.count
    },
    returnOwnNexusToDeckBottom: (state, owner, self, action) => {
        if (action.type !== "returnOwnNexusToDeckBottom") return false
        const filter = (action.filter ?? {}) as unknown as ResolvedTargetFilter
        return state.players[owner].field.nexuses.some((n) => matchesTarget(state, owner, n, filter, self?.instanceId))
    },
    // removeCores.ts の removeCoresAchievableCountForPay に判定を委譲（候補の集め方は本ハンドラと共用）
    removeCores: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "removeCores") return false
        if (action.count === "any") return true
        const achievable = removeCoresAchievableCountForPay(state, owner, self, action, srcColors, srcType)
        if (typeof action.count !== "number") {
            // targets 体ぶんの「すべて」は、その体数がいなければ払えない
            const spirits = state.players[action.side === "own" ? owner : opponentOf(owner)].field.spirits.length
            return achievable >= 1 && (action.targets === undefined || spirits >= action.targets)
        }
        const need = (action.countCounter !== undefined ? countedAmount(state, owner, self, action.count, action.countCounter, srcType) : action.count) + removeCoresKyokaBonus(state, owner, action)
        return achievable >= need
    },
    treatAsUnblocked: (state) => (state.battle?.blockerInstanceId ?? null) !== null,
    // exhaust：target:"self"（発生源自身が回復状態か）／side:"own"（自分の場に条件に合う回復状態の個体がcount体以上いるか）
    exhaust: (state, owner, self, action, _srcColors, srcType) => {
        if (action.type !== "exhaust") return false
        if (action.target === "self") return self !== null && !self.isRested
        if (action.count === "any") return true
        if (action.nexusOnly) {
            return canExhaustNexus(state, owner) && state.players[owner].field.nexuses.filter((n) => !n.isRested).length >= action.count
        }
        if (action.side === "own") {
            const filter = (action.filter ?? {}) as unknown as ResolvedTargetFilter
            const count = state.players[owner].field.spirits.filter(
                (s) => !s.isRested && matchesTarget(state, owner, s, filter, self?.instanceId),
            ).length
            return count >= action.count
        }
        // 相手を疲労させる（then に置く書き方）：回復状態の相手が数どおりいなければ発揮しない（COST_MODEL §1）。
        // 疲労耐性は見ない（耐性で減る分は解決時に任せる）
        const need = action.countFromBofu
            ? (self ? bofuCountFor(state, owner, self) : 0)
            : (action.countCounter !== undefined
              ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
              : action.count) + (action.anySide || action.nexus || action.all ? 0 : kyokaBonus(state, owner, "exhaust"))
        if (need <= 0) return false
        const filter = (action.filter ?? {}) as unknown as ResolvedTargetFilter
        const opp = opponentOf(owner)
        return state.players[opp].field.spirits.filter((s) => !s.isRested && matchesTarget(state, opp, s, filter, self?.instanceId)).length >= need
    },
    // discard：from ごとに「破棄できるものがあるか」（COST_MODEL §1。手札が0枚なら不発）。デッキは side 側に count 枚（countCounter があれば数えた値）以上あり、止められていないか
    discard: (state, owner, self, action, _srcColors, srcType) => {
        if (action.type !== "discard") return false
        if (action.from !== "deck") return discardPayable(state, owner, action)
        const count = deckDiscardKyokaCount(
            state, owner, action,
            action.countCounter !== undefined
                ? countedAmount(
                      state, owner, self, action.count ?? 1, action.countCounter, srcType,
                      action.countMax !== undefined ? action.countMax + millCapBonusFor(state, owner) : undefined,
                  )
                : action.count,
        )
        const targetPid = action.side === "own" ? owner : opponentOf(owner)
        return state.players[targetPid].deck.length >= count && millAllowed(state, { pid: targetPid, count, actorPid: owner, sourceType: srcType }) >= count
    },
    // refresh：条件に合う疲労状態の自分のスピリットが1体以上（exhaustRefresh.ts の既定経路のみ。
    // eventTargetOnly／all／anySide を pay の then に書くケースは想定しない）
    // heavyExhaust：重疲労させられる相手のスピリット（重疲労でない・絞り込みに合う・耐性で弾かれない）が1体以上いるか
    heavyExhaust: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "heavyExhaust") return false
        const ctx = { state, owner, self, targetInstanceId: undefined } as ActionCtx
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) return false
        const opp = opponentOf(owner)
        return pickEnemyCandidates(state, opp, Infinity, (s) => !s.heavyRested && matchesTarget(state, opp, s, filter, self?.instanceId), srcColors, srcType, "exhaust").length >= 1
    },
    refresh: (state, owner, self, action, _srcColors, _srcType, eventTarget) => {
        if (action.type !== "refresh") return false
        if (action.target === "self") return self !== null && self.isRested
        if (action.eventTargetOnly) {
            return eventTarget !== undefined && state.players[owner].field.spirits.some((s) => s.instanceId === eventTarget && s.isRested)
        }
        if (action.all) return false
        const ctx = { state, owner, self, targetInstanceId: undefined } as ActionCtx
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) return false
        return refreshOneOwnCandidates(state, owner, self, filter).length >= 1
    },
    // placeCores：置き先（target self/one/all）があり、止める効果（coreGainAllowed・
    // ライフ専用ガード）に当たらず、取り元（reserve/trash/self/field）にcount個以上あるか
    placeCores: (state, owner, self, action, _srcColors, srcType) => {
        if (action.type !== "placeCores") return false
        if (!isLegacyPlaceCores(action)) return gatherPayable({ state, owner, self } as ActionCtx, action)
        // 置く数が決まる形は、黒き聖杯・魂の海塔の上限まで含めて全部置けるときだけ（Q3721・Q22432）
        const need = action.to === "life" && action.fillTo !== undefined ? Math.max(0, action.fillTo - state.players[owner].life) : typeof action.count === "number" ? action.count : 1
        if (coreGainAllowed(state, { pid: owner, from: action.from, to: gainTo(action.to), count: need, srcType }) < need) return false
        if (action.to === "spirit" || action.to === "nexus") {
            if (action.target === "self") {
                if (!self) return false
                const onField = [...state.players[owner].field.spirits, ...state.players[owner].field.nexuses].includes(self)
                if (!onField) return false
            } else {
                const ctx = { state, owner, self, targetInstanceId: undefined } as ActionCtx
                const candidates = placeCoresPoolCandidates(ctx, action)
                if (candidates === SELF_REQUIRED || candidates.length === 0) return false
            }
        }
        if (action.from === "reserve" || action.from === "trash" || action.from === "self" || action.from === "field") {
            if (typeof action.count === "number" && availableFromSource(state, owner, action.from, self) < action.count) return false
        }
        return true
    },
    // summon{from:"hand"}：条件に合い実際に召喚できる（payCost指定時は支払い可否も含む）手札のスピリットが1枚以上
    // summon{from:"burst"}：発動中のバーストが召喚できる種類で、召喚に必要なコアがある。バースト以外の文脈では常に偽
    // （payCost 付きの追加コストはここでは見ない簡略化）
    summon: (state, owner, self, action, srcColors, srcType) => {
        if (action.type !== "summon") return false
        if (action.from === "hand") return summonFromHandPayable(state, owner, self, action, srcType)
        const cardId = state.players[owner].burst
        if (cardId === null) return false
        const card = getCard(cardId)
        if (card.type === "nexus") return true
        if (card.type !== "spirit" && card.type !== "brave") return false
        return !burstTenshoUnpayable(state, owner, card) && canPayFreeSummonSurcharge(state, owner, card, minLevelCores(card), true)
    },
    moveCards: (state, owner, self, action, _srcColors, srcType) => action.type === "moveCards" && moveCardsPayable(state, owner, self, action, srcType),
    // destroyBlockerAfterBattle：バトル中でブロックしたスピリットが場にいる（ハンドラの前提と揃える）
    destroyBlockerAfterBattle: (state, owner, self, action) => {
        if (action.type !== "destroyBlockerAfterBattle") return false
        if (!self) return false
        const battle = state.battle
        const blockerId = battle?.blockerInstanceId ?? undefined
        if (!battle || blockerId === undefined) return false
        const found = findSpiritAny(state, blockerId)
        if (!found || found.pid === owner) return false
        return true
    },
    // lifeCrush：相手のライフがcount以上で、ライフを減らす制限（lifeLossAllowed）に全部は止められない
    lifeCrush: (state, owner, self, action, _srcColors, srcType) => {
        if (action.type !== "lifeCrush") return false
        const opp = opponentOf(owner)
        const count =
            action.countCounter !== undefined
                ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
                : action.count
        return count > 0 && state.players[opp].life >= count && lifeLossAllowed(state, { pid: opp, amount: count, cause: "effect", actorPid: owner, sourceType: srcType, sourceInstance: self ?? undefined, floor: action.neverZero ? 1 : 0 }) > 0
    },
    // levelOverrideOpponentNexuses：対象の相手ネクサスが1つ以上
    levelOverrideOpponentNexuses: (state, owner, _self, action) => {
        if (action.type !== "levelOverrideOpponentNexuses") return false
        return state.players[opponentOf(owner)].field.nexuses.length >= 1
    },
    // negateLifeDamageFromTarget：印を置く相手（対象未指定なら pickEnemyByBp の自動選択と同じ候補）が存在する
    negateLifeDamageFromTarget: (state, owner, _self, action, srcColors, srcType) => {
        if (action.type !== "negateLifeDamageFromTarget") return false
        if (action.filter !== undefined) {
            const f = { ...action.filter } as unknown as ResolvedTargetFilter
            return state.players[opponentOf(owner)].field.spirits.some((s) => matchesTarget(state, owner, s, f, _self?.instanceId))
        }
        return pickEnemyByBp(state, opponentOf(owner), Infinity, undefined, srcColors, srcType) !== null
    },
}

// cost が「好きなだけ」のとき払える最大数（それ以外は undefined）
const anyCapacity = (state: GameState, owner: PlayerId, self: CardInstance | null, cost: EffectAction): number | undefined => {
    if (cost.type === "removeCores" && cost.count === "any") {
        return removeCoresAchievableCountForPay(state, owner, self, cost, undefined, undefined)
    }
    // moveCards の「好きなだけ」（count:"all"＋upTo）：いま動かせる枚数
    if (cost.type === "moveCards" && cost.upTo && typeof cost.count === "number" && cost.from === "hand" && cost.dest === "trash") {
        if (!canDiscardHand(state, owner)) return 0
        return Math.min(cost.count, moveCardCandidates(state, owner, cost, undefined, self?.cardId).length)
    }
    if (cost.type === "moveCards" && cost.count === "all" && cost.upTo) {
        if (cost.from === "hand" && cost.dest === "trash" && !canDiscardHand(state, owner)) return 0
        return moveCardCandidates(state, owner, cost, undefined, self?.cardId).length
    }
    if (cost.type === "toTegamoto" && cost.count === "any") {
        return Math.min(state.players[owner].hand.filter((id) => matchesPick(id, cost.pick)).length, cost.upTo ?? Infinity)
    }
    return undefined
}

// 判定表に無い type、または判定に落ちた場合は false
export const canPayResolve = (
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    action: EffectAction,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
    eventTarget?: string,
): boolean => {
    const checker = CHECKERS[action.type]
    if (!checker) return false
    return checker(state, owner, self, action, srcColors, srcType, eventTarget)
}

// 成立しなかった cost／then の種類ごとの理由（不発ログ用。表に無い type は汎用文）。revive.ts・burst.ts からも使う
const UNPAYABLE_REASONS: Partial<Record<EffectAction["type"], string>> = {
    toTegamoto: "手札に手元へ置けるカードがない",
    draw: "ドローできるデッキの枚数がない",
    discard: "破棄できるカードが足りない",
    setBurstFromHand: "手札にセットできるバーストがない",
    peekOpponentHand: "相手の手札がない",
    peekOpponentBurst: "相手がバーストをセットしていない",
    timedEffect: "指定できるスピリットがいない",
    destroy: "破壊するスピリットがいない",
    simultaneous: "破壊するスピリットがいない",
    soulCoreToTrash: "トラッシュに置ける[ソウルコア]がない",
    discardUnder: "このスピリットの下のカードが足りない",
    destroyBlockerAfterBattle: "破壊できるブロックしたスピリットがいない",
    return: "デッキに戻すカードがない",
    removeCores: "移せるコアが足りない",
    placeCores: "置けるコアが足りない",
    refresh: "回復させる対象がいない",
    heavyExhaust: "重疲労させる対象がいない",
    summon: "バーストのカードを召喚できない",
    lifeCrush: "相手のライフを減らせない",
    treatAsUnblocked: "ブロックしたスピリットがいない",
    destroyBrave: "破壊できる合体中のブレイヴがない",
    repeatBurstEffect: "もう1度発揮できるバースト効果がない",
}

// 成立しない最初の cost／then の理由を「〜ため」に続く形で返す。全部成立するなら null
export function unpayableReason(
    state: GameState, owner: PlayerId, self: CardInstance | null, action: EffectAction,
    srcColors: Color[] | undefined, srcType: CardType | undefined, eventTarget?: string,
): string | null {
    if (canPayResolve(state, owner, self, action, srcColors, srcType, eventTarget)) return null
    if (action.type === "sequence" || (action.type === "simultaneous" && !action.actions.some((a) => a.type === "destroy" && a.target === "self"))) {
        for (const a of action.actions) {
            const r = unpayableReason(state, owner, self, a, srcColors, srcType, eventTarget)
            if (r !== null) return r
        }
    }
    if (action.type === "exhaust") {
        if (action.target === "self") return "このスピリットが疲労している"
        if (action.nexusOnly) return "疲労させられる自分のネクサスがない"
        return action.side === "own" ? "疲労させられる自分のスピリットがいない" : "疲労させられる相手のスピリットが指定数いない"
    }
    if (action.type === "moveCards") return moveCardsUnpayableReason(action)
    if (action.type === "destroy") return destroyUnpayableReason(action)
    if (action.type === "return" && action.to === "hand") return "手札に戻すスピリットがいない"
    if (action.type === "summon" && action.from === "hand") return "手札に召喚できるカードがない"
    return UNPAYABLE_REASONS[action.type] ?? "条件を満たさない"
}

function destroyUnpayableReason(a: Extract<EffectAction, { type: "destroy" }>): string {
    if (a.target === "self") return "このスピリットがフィールドにいない"
    return a.nexus === "only" ? "破壊するネクサスがない" : "破壊するスピリットがいない"
}

function costReasonOf(action: EffectAction): string {
    if (action.type === "moveCards") return moveCardsUnpayableReason(action)
    if (action.type === "destroy") return destroyUnpayableReason(action)
    if (action.type === "return" && action.to === "hand") return "手札に戻すスピリットがいない"
    if (action.type === "summon" && action.from === "hand") return "手札に召喚できるカードがない"
    return UNPAYABLE_REASONS[action.type]!
}

// 旧 type ごとの理由の文言を、どこから・どこへで引き継ぐ
function moveCardsUnpayableReason(a: Extract<EffectAction, { type: "moveCards" }>): string {
    const zone = a.from === "hand" ? "手札" : a.from === "trash" ? "トラッシュ" : "オープンしたカード"
    if (a.dest === "trash") return `${zone}に破棄できるカードがない`
    if (a.dest === "summon") return `${zone}に召喚できるカードがない`
    if (a.dest === "hand") return `${zone}に回収できるカードがない`
    if (a.dest === "deckTop" || a.dest === "deckBottom") return `${zone}にデッキへ戻せるカードがない`
    return `${zone}に動かせるカードがない`
}

export const unpayableLine = (sourceName: string, reason: string): string => `${sourceName}：${reason}ため発動しなかった。`

// 【強襲】のネクサス疲労のコストを、kyoshuSelfExhaustGrant（P055）の疲労で代わりに払えるか
function kyoshuSelfPayable(state: GameState, owner: PlayerId, action: Extract<EffectAction, { type: "pay" }>): boolean {
    return action.limitByKeyword === "kyoshu" && action.cost.type === "exhaust" && action.cost.nexusOnly === true && kyoshuSelfExhaustSources(state, owner).length > 0
}

// then が cost で動いたカードのコスト（sameCostAsLast／maxCostAsLast）を読むとき、cost で選べるカードを then が解決できるものに絞る
// （COST_MODEL §1：両方が完全に解決できるときだけ。cost を払った後でないと記録が無いので、then の判定は記録なしでは通らない）。
// 対応は then が相手のスピリットを destroy する形、cost が手札を見せる／自分のスピリットを破壊する形だけ
function narrowCostByLastRecord(state: GameState, owner: PlayerId, self: CardInstance | null, action: Extract<EffectAction, { type: "pay" }>, cost: EffectAction): EffectAction | "none" | null {
    const then = action.then
    if (then.type !== "destroy" || then.side === "own" || then.filter === undefined) return null
    const same = then.filter.sameCostAsLast === true
    if (!same && then.filter.maxCostAsLast !== true) return null
    const opp = opponentOf(owner)
    const costs = state.players[opp].field.spirits
        .filter((s) => matchesTarget(state, opp, s, then.filter as unknown as ResolvedTargetFilter, self?.instanceId))
        .map((s) => getCard(s.cardId).cost)
    if (costs.length === 0) return "none"
    const axis = same ? { in: [...new Set(costs)] } : { min: Math.min(...costs) }
    if (cost.type === "revealHandCard") {
        const pick = cost.pick ?? {}
        return { ...cost, pick: same ? { ...pick, costIn: axis.in! } : { ...pick, cost: { ...(typeof pick.cost === "object" ? pick.cost : {}), min: axis.min! } } }
    }
    if (cost.type === "destroy" && cost.side === "own") {
        return { ...cost, filter: { ...cost.filter, cost: { ...cost.filter?.cost, ...axis } } }
    }
    return null
}

// pay の成立判定の本体（payHandler と skipUnpayablePay が共有する）。好きなだけ払う cost は then を解決しきれる最大数までしか選べない
// （2026-09-27 ユーザー確認）。skipThen：then を見ない（イベント対象が呼び出し側で分からないとき）
function judgePay(
    state: GameState, owner: PlayerId, self: CardInstance | null, action: Extract<EffectAction, { type: "pay" }>,
    srcColors: Color[] | undefined, srcType: CardType | undefined, eventTargetId?: string, skipThen = false,
): { cost: EffectAction; reason: string | null } {
    // コストの破壊は、破壊されないネクサスを候補から外す（Q1711）。印は払う側のハンドラも読む
    let c: EffectAction = action.cost.type === "destroy" && action.cost.nexus === "only" ? { ...action.cost, asCost: true } : action.cost
    const narrowed = narrowCostByLastRecord(state, owner, self, action, c)
    if (narrowed !== null) {
        if (narrowed === "none") return { cost: c, reason: "破壊する相手のスピリットがいない" }
        c = narrowed
        skipThen = true
    }
    if (action.costOnly) skipThen = true
    // 「Nコスト支払う」はリザーブ＋フィールドのコアから払える。疲労で肩代わりできるネクサスがあれば、その分は払う数から引く
    if (isReserveToll(c)) {
        const assist = effectCostDiscountNexus(state, owner, self?.cardId)
        if (autoPayPlan(state, owner, Math.max(0, c.count - (assist?.amount ?? 0)), true) === null) return { cost: c, reason: UNPAYABLE_REASONS.removeCores ?? "コアが足りない" }
    } else if (!kyoshuSelfPayable(state, owner, action)) {
        const costReason = unpayableReason(state, owner, self, c, srcColors, srcType)
        if (costReason !== null) return { cost: c, reason: costReason }
    }
    const thenReason = (): string | null => skipThen ? null : unpayableReason(state, owner, self, action.then, srcColors, srcType, eventTargetId)
    const capacity = anyCapacity(state, owner, self, c)
    if (capacity === undefined) return { cost: c, reason: thenReason() }
    if (skipThen) return { cost: c, reason: null }
    const thenOk = (): boolean => canPayResolve(state, owner, self, action.then, srcColors, srcType, eventTargetId)
    let max = capacity
    while (max >= 0 && !withMovedProbe(max, thenOk)) max--
    if (max < 0) return { cost: c, reason: thenReason() ?? "条件を満たさない" }
    c = c.type === "moveCards" ? { ...c, count: max } : ({ ...c, anyMax: max } as EffectAction)
    return { cost: c, reason: null }
}

// 使用・起動の前に、最上位の pay が成立するかを見る（理由は「〜ため」に続く形。成立するなら null）。self はマジックなら null
export function unpayablePayReason(state: GameState, owner: PlayerId, action: Extract<EffectAction, { type: "pay" }>, source: CardData, self: CardInstance | null = null): string | null {
    const skipThen = JSON.stringify(action.then).includes('"eventTargetOnly"')
    return judgePay(state, owner, self, action, source.colors, source.type, undefined, skipThen).reason
}

// 任意（optional）の誘発が出す「発動しますか？」の前に呼ぶ。最上位が pay で成立しないなら、確認を出さずに理由つきで不発にして true を返す
// （2026-10-02 ユーザー確認）。イベント対象を then に使う書き方は対象がここでは分からないので、cost だけを見る
export function skipUnpayablePay(state: GameState, owner: PlayerId, self: CardInstance | null, action: EffectAction, sourceName: string): boolean {
    // コストを中で払う action（pay に移していないもの）も、払えないなら確認を出さない
    if (action.type === "reviveLastDestroyedNexus") {
        const reason = reviveLastDestroyedNexusBlockReason(state, owner, self, action)
        if (reason === null) return false
        log(state, unpayableLine(sourceName, reason))
        state.effectFizzled = true
        const once = (action as { onceRevert?: { instanceId: string; effectId: string } }).onceRevert
        if (once) {
            const src = findInstanceAnywhere(state, once.instanceId)
            if (src) revertOncePerTurn(state, src, once.effectId)
            revertDestroyGroupUsage(state, once.instanceId, once.effectId)
        }
        return true
    }
    // 「〜できる」の召喚は、召喚できるカードが1枚もないなら確認を出さない（2026-10-02 ユーザー決定の「発動できないなら聞かない」。
    // 判定を書いたのはこの2種と pay だけ）
    if ((action.type === "summon" && action.from === "hand") || (action.type === "moveCards" && action.dest === "summon")) {
        const srcType = self ? getCard(self.cardId).type : undefined
        if (canPayResolve(state, owner, self, action, undefined, srcType)) return false
        log(state, unpayableLine(sourceName, costReasonOf(action)))
        state.effectFizzled = true
        return true
    }
    if (action.type !== "pay" || action.confirmed) return false
    const skipThen = JSON.stringify(action.then).includes('"eventTargetOnly"')
    const srcColors = self ? instColors(self) : undefined
    const srcType = self ? getCard(self.cardId).type : undefined
    const reason = judgePay(state, owner, self, action, srcColors, srcType, undefined, skipThen).reason
    if (reason === null) return false
    log(state, unpayableLine(sourceName, reason))
    state.effectFizzled = true
    if (action.onceRevert) {
        const src = findInstanceAnywhere(state, action.onceRevert.instanceId)
        if (src) revertOncePerTurn(state, src, action.onceRevert.effectId)
        revertDestroyGroupUsage(state, action.onceRevert.instanceId, action.onceRevert.effectId)
    }
    return true
}

// 木の中の pay すべてに内部欄を付けた写しを返す（元は変えない）。
// confirmed：発動の確認（マジック使用・起動・バースト・任意効果）を済ませた経路から入る action に掛け、二重に聞かないようにする（COST_MODEL.md §10）
// onceRevert：確認を断った／押したが不発のとき「ターンに1回」の消費を戻す先（2026-10-01 ユーザー確認）。消費した側（誘発の解決）が付ける
export function markPays(action: EffectAction, fields: { confirmed?: true; onceRevert?: { instanceId: string; effectId: string } }): EffectAction {
    const walk = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(walk)
        if (v !== null && typeof v === "object") {
            const out: Record<string, unknown> = {}
            for (const [k, x] of Object.entries(v)) out[k] = walk(x)
            if (out.type === "pay" && (out.tax === undefined || out.confirmed === true)) Object.assign(out, fields)
            return out
        }
        return v
    }
    return walk(action) as EffectAction
}

export function markPayConfirmed(action: EffectAction): EffectAction {
    return markPays(action, { confirmed: true })
}

// 発生源（sourceCardId）が team を持つ効果の「Nコスト支払う」を、疲労して肩代わりできるネクサス（〔重複不可〕なので回復状態の先頭の1つだけ）
export function effectCostDiscountNexus(state: GameState, owner: PlayerId, sourceCardId: string | undefined): { nexus: CardInstance; amount: number } | null {
    if (sourceCardId === undefined || !canExhaustNexus(state, owner)) return null
    const teams = getCard(sourceCardId).team ?? []
    for (const nexus of state.players[owner].field.nexuses) {
        if (nexus.isRested) continue
        const level = currentLevel(nexus).level
        for (const e of getCard(nexus.cardId).effects) {
            if (e.kind === "effectCostExhaustDiscount" && teams.includes(e.team) && entryActive(state, owner, nexus, e, level)) return { nexus, amount: e.amount }
        }
    }
    return null
}

// 「Nコスト支払う」の形（リザーブからトラッシュへ決まった数）だけが肩代わりの対象
const isReserveToll = (a: EffectAction): a is Extract<EffectAction, { type: "removeCores" }> & { count: number } =>
    a.type === "removeCores" && a.from?.length === 1 && a.from[0] === "reserve" && a.to === "trash" && typeof a.count === "number" && a.countCounter === undefined && a.chooser === undefined && a.reserveOnly === undefined

// pay.oncePerTurn の枠の键となる効果 idを、発生源カードの効果木からこの pay と同じ cost/then の節を探して得る
function oncePayEffectId(cardId: string | undefined, action: Extract<EffectAction, { type: "pay" }>): string | undefined {
    if (cardId === undefined) return undefined
    const shape = JSON.stringify({ cost: action.cost, then: action.then })
    for (const effect of getCard(cardId).effects) {
        let hit = false
        const walk = (v: unknown): void => {
            if (hit || v === null || typeof v !== "object") return
            if (Array.isArray(v)) {
                for (const x of v) walk(x)
                return
            }
            const o = v as Record<string, unknown>
            if (o["type"] === "pay" && o["oncePerTurn"] === true && JSON.stringify({ cost: o["cost"], then: o["then"] }) === shape) {
                hit = true
                return
            }
            for (const x of Object.values(o)) walk(x)
        }
        walk(effect)
        if (hit) return effect.id
    }
    return undefined
}

const payHandler: ActionHandler<"pay"> = (ctx, action) => {
    const { state, owner, self, srcColors, srcType, sourceName } = ctx
    // 「そのスピリット」＝イベント対象は then にだけ渡す（cost は自分の場から払うもの）。確認で止まると ctx から落ちるので行動に持たせる
    const kyoshuAlt = kyoshuSelfPayable(state, owner, action)
    const eventTargetId = action.eventTargetId ?? (kyoshuAlt ? undefined : ctx.targetInstanceId)
    const fizzle = (message: string): void => {
        log(state, message)
        state.effectFizzled = true
        // 確認を挟んで再開した後の不発は、誘発側の effectFizzled の巻き戻しが既に通り過ぎているのでここで戻す
        if (action.onceRevert) {
            const src = findInstanceAnywhere(state, action.onceRevert.instanceId)
            if (src) revertOncePerTurn(state, src, action.onceRevert.effectId)
            revertDestroyGroupUsage(state, action.onceRevert.instanceId, action.onceRevert.effectId)
        }
    }
    // 【強襲】：回数切れは確認も出さず何も起きない。払えない場合は一般則（下の judge）で確認の前に不発にする
    let kyoshuUsed = 0
    if (action.limitByKeyword === "kyoshu") {
        const limit = self ? kyoshuLimitOf(state, owner, self) : 0
        kyoshuUsed = self ? kyoshuUsedOf(state, self) : 0
        if (!self || kyoshuUsed >= limit) {
            log(state, `${sourceName}：【強襲】を発動できる状態でないため何もしなかった。`)
            return
        }
    }
    // pay.oncePerTurn（BS21_PLAN §2 の5）：【強襲】と同じ中身だが【強襲】として数えない回数制限。
    // 枠は発生源の個体×効果 id で数える。効果 id は action には載らないので、カードの効果木から
    // この pay と同じ cost/then の節を探して得る（確認の再入や markPays で action は写しになるが
    // cost/then の中身と键順は変わらない）
    let payOnceKey: string | undefined
    if (action.oncePerTurn === true) {
        payOnceKey = oncePayEffectId(ctx.sourceCardId ?? self?.cardId, action)
        if (!self || payOnceKey === undefined || isOnceUsed(state, owner, self, { id: payOnceKey }, "triggeredUsedTurn")) {
            log(state, `${sourceName}：ターンに1回までのため発動しなかった。`)
            return
        }
    }
    // 確認で「発動する」を押した後の不発は、発動した扱い（【相手の『召喚時』発揮後】が反応する。2026-10-03 ユーザー確認）
    if (action.confirmed && self && state.summonEffectSource?.instanceId === self.instanceId) state.summonEffectSource.resolved = true
    // 税（effectTax.ts）の確認文・不発ログは、税の発生源と、効果を止められるカードの名前で出す
    const unpaidLine = (reason: string): string =>
        action.tax ? `${action.tax.source}：${reason}ため、${action.tax.target}の効果を発揮できなかった。` : unpayableLine(sourceName, reason)
    let cost = action.cost
    const judge = () => judgePay(state, owner, self, action, srcColors, srcType, eventTargetId)
    // 聞く前に成立しないなら確認を出さずに不発（2026-10-02 ユーザー確認。COST_MODEL §10 の「払えなくても確認は出る」を改訂）。
    // confirmed は発動の確認を済ませた経路なので、ここでは不発にしても確認の後の不発として扱う
    if (state.interactiveTargets && !action.confirmed) {
        const pre = judge()
        if (pre.reason !== null) {
            fizzle(unpaidLine(pre.reason))
            return
        }
        // 税は外側の markPays では確認済みにならないので、ここで自分に印を付ける（対象つきのマジックでも同じ）
        const resume = { ...action, ...(eventTargetId !== undefined ? { eventTargetId } : {}), ...(action.tax ? { confirmed: true as const } : {}) }
        const prompt = action.tax
            ? `${action.tax.source}：${action.tax.phrase}なければ、${action.tax.target}の効果を発揮できません。${action.tax.verb}ますか？`
            : `${sourceName}：コストを支払って効果を発揮しますか？`
        requestActivationConfirm(state, owner, prompt, resume, self, action.onceRevert)
        return
    }
    const verdict = judge()
    if (verdict.reason !== null) {
        fizzle(unpaidLine(verdict.reason))
        return
    }
    cost = verdict.cost
    let tollCovered = false
    if (kyoshuAlt) {
        // 払い方の選択（ネクサスか、発生源自身か）。選び直しの再開では ctx.targetInstanceId に選んだ個体が入る
        const selfs = kyoshuSelfExhaustSources(state, owner)
        const nexuses = canExhaustNexus(state, owner) ? state.players[owner].field.nexuses.filter((n) => !n.isRested) : []
        const all = [...nexuses, ...selfs]
        let pick = all.find((i) => i.instanceId === ctx.targetInstanceId)
        if (!pick && all.length > 1 && state.interactiveTargets) {
            requestChoice(state, owner, `${sourceName}：【強襲】のコストとして疲労させるカードを選んでください`, all.map((i) => i.instanceId), false, { ...action, confirmed: true }, self)
            return
        }
        pick ??= all[0]!
        if (selfs.includes(pick)) exhaustSpirit(state, owner, pick, undefined, owner, srcType)
        else exhaustNexus(state, owner, pick, owner, srcType)
        log(state, `${sourceName}：【強襲】のコストとして${getCard(pick.cardId).name}を疲労させた。`)
        tollCovered = true
    }
    const assist = isReserveToll(cost) ? effectCostDiscountNexus(state, owner, ctx.sourceCardId) : null
    if (assist && isReserveToll(cost)) {
        if (ctx.chosenOption === undefined && state.interactiveTargets) {
            requestChoice(state, owner, `${sourceName}：${getCard(assist.nexus.cardId).name}を疲労させて${assist.amount}コスト支払ったものとして扱いますか？`, [], false, { ...action, confirmed: true }, self, "option", ["疲労して肩代わりする", "しない"])
            return
        }
        if (ctx.chosenOption === undefined || ctx.chosenOption === "疲労して肩代わりする") {
            exhaustNexus(state, owner, assist.nexus, owner, srcType)
            log(state, `${getCard(assist.nexus.cardId).name}を疲労させ、${assist.amount}コスト支払ったものとして扱った。`)
            // 肩代わりで0コストになったら払わない
            const left = cost.count - assist.amount
            if (left <= 0) tollCovered = true
            else cost = { ...cost, count: left }
        }
    }
    if (action.limitByKeyword === "kyoshu" && self) noteHeldKeyword(state, owner, self, "kyoshu")
    if (action.limitByKeyword === "kyoshu" && self) self.kyoshuUsed = { turn: state.turn, count: kyoshuUsed + 1 }
    // 「Nコスト支払う」はフィールドのコアからも払える（リザーブだけでは足りないとき・対話で選べるとき）
    if (!tollCovered && isReserveToll(cost) && cost.count > 0) {
        const need = cost.count
        const player = state.players[owner]
        const sourceCardId = ctx.sourceCardId ?? self?.cardId
        const soulSelectable = player.soulCore != null && player.soulCore.zone !== "trash"
        const mustChoose = soulSelectable || fieldCoresSpendable(state, owner).length > 0 || normalReserveOf(player) < need
        if (state.interactiveTargets && mustChoose && sourceCardId !== undefined) {
            suspend(state, {
                pid: owner,
                kind: "option",
                candidates: [],
                prompt: `${sourceName}：${need}コストを支払ってください`,
                options: ["支払う"],
                optional: false,
                action: action.then,
                selfInstanceId: self ? self.instanceId : null,
                effectSource: { ...(srcType !== undefined ? { type: srcType } : {}), ...(srcColors !== undefined ? { colors: [...srcColors] } : {}) },
                effectCostPay: { pid: owner, need, sourceCardId, ...(eventTargetId !== undefined ? { targetInstanceId: eventTargetId } : {}) },
            })
            return
        }
        if (player.reserve < need) {
            const plan = autoPayPlan(state, owner, need, true)
            if (plan === null) {
                fizzle(unpayableLine(sourceName, UNPAYABLE_REASONS.removeCores ?? "コアが足りない"))
                return
            }
            payCost(state, owner, need, plan.paySources, 0, plan.soulFromReserve)
            log(state, `${sourceName}：${need}コストを支払った。`)
            tollCovered = true
        }
    }
    if (action.tax && state.burstTaxUnpaid) state.burstTaxUnpaid--
    // コストを払って then に進む直前で「ターンに1回」の枠を取る（断った場合はここへ来ない＝消費しない）
    if (action.oncePerTurn === true && self && payOnceKey !== undefined) markOnceUsed(state, owner, self, { id: payOnceKey }, "triggeredUsedTurn")
    const scope = newRecordScope()
    resolveInOrder(state, tollCovered ? [action.then] : [cost, action.then], {
        resolve: (a) => {
            state.recordScope = scope
            const target = a === action.then ? eventTargetId : undefined
            ctx.resolve(a, { sourceColors: srcColors, sourceType: srcType, ...(target !== undefined ? { targetInstanceId: target } : {}) })
        },
        frame: (a) => ({
            kind: "action" as const,
            selfInstanceId: self ? self.instanceId : null,
            action: a,
            actorPid: owner,
            recordScope: scope,
            ...(a === action.then && eventTargetId !== undefined ? { targetInstanceId: eventTargetId } : {}),
            ...(srcColors !== undefined ? { sourceColors: srcColors } : {}),
            ...(srcType !== undefined ? { sourceType: srcType } : {}),
        }),
    })
}

const handlers = {
    pay: payHandler,
} satisfies Partial<ActionRegistry>

export default handlers
