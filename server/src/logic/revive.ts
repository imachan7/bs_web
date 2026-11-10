// 破壊されたときの復活（「フィールドに残る」の確認）・【不死】・デッキ破棄からの無償召喚

import { coreRemovalAllowed } from "./coreGate"
import { entryActive } from "../../../shared/rules/effectStop"
import { coreGainBlocked, takeCoreGainAllowance } from "./coreGainCap"
import { noteCoverage, noteGrantedFrom, noteKeyword } from "../../../shared/coverage"
import { summonSurcharge } from "../../../shared/cost"
import { summonVoidToll } from "../../../shared/rules/summonToll"
import { coreZoneChoiceId } from "../../../shared/rules/activation"
import { askCostPay, askSurchargePay, canPayFreeSummonSurcharge, payFreeSummonSurchargeKeeping, payVoidToll, surchargeOwed } from "./summonSurcharge"
import { canPayLife, lifeCostQuery, recordLifeLoss } from "./lifeGate"
import type { CardData, CardInstance, CardType, Color, PendingChoice, DestroyContext, EffectDef, GameState, Phase, PlayerId, ResolvedTargetFilter } from "../type"
import { millAllowed, noteMilled } from "./zones/mill"
import { trashUnderCards } from "./zones/underCards"
import { createInstance, currentLevel, getCard, log, instMinLevelCores, minLevelCores, opponentOf, pushResumeFrames, suspend } from "./GameState"

// removal.ts・triggers.ts・EffectModules.ts とは相互 import（CommonJS の循環 require で安全。removal.ts 冒頭の注記）
import { revertDestroyGroupUsage } from "./triggers"
import { fireFieldEventTriggers, notifyHandGained } from "./fieldEventTriggers"
import { destroySpirit, destroyNexus } from "./removal"
import { matchesTarget } from "../../../shared/rules/targetFilter"
import { detachBravesOnLeave, detachBravesOnLeaveFree } from "./brave"
import { unpayableLine } from "./actions/pay"
import { soulCoreLeavesField } from "./soulCore"

import { handGainDenial } from "./handGate"
import {
    effectiveCost,
    ownFieldSymbolColors,
} from "../../../shared/cost"
import {
    canDiscardHand,
    hostsOf,
    effectActiveAtLevel,
    effectiveBp,
    effectSources,
    hasArmorAgainst,
    hasHeavyArmorAgainst,
    spiritHasKeyword,
    instHasColor,
    instIsCombined,
    instIsVanilla,
    isVirtualSource,
    instMatchesCostFilter,
    matchesFamilyFilter,
    ownFieldOnlyColor,
    timedPlayerRules,
    hasGlobalConstraint,
    zoneSpiritEffectsDisabled,
    trashCardEffectsDisabled,
} from "../../../shared/rules"

import {
    autoPayPlan,
    payCost,
    canExhaustNexus,
    exhaustNexus,
    exhaustSpirit,
    fireSummonSequence,
    resolveAction,
    resolveTensho,
    tryOwnLifeFloorByCost
} from "./EffectModules"

// 「破壊される代わりに復活**できる**」の確認を保留リストへ積む。
// 破壊はこの時点では行わない（対象は場に残ったまま）。承認・拒否は handleAction の末尾で確認したあと、
// applyReviveConfirm / declineReviveConfirm が決着させる
type Revived = Extract<EffectDef, { kind: "reviveOnDestroy" }>["revived"]

function queueReviveConfirm(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    effectId: string,
    sourceInstanceId: string,
    context?: DestroyContext,
): void {
    ;(state.pendingReviveConfirms ??= []).push({
        pid: ownerPid,
        instanceId: inst.instanceId,
        effectId,
        sourceInstanceId,
        ...(context ? { context } : {}),
    })
    log(
        state,
        `${state.players[ownerPid].name}の${getCard(inst.cardId).name}は、破壊される代わりに復活するか確認を待っている。`,
    )
}

// 「破壊される代わりに復活**できる**」の確認を**その場で**出す（保留リストに積まない）。
// 破壊はこの時点では行わない（対象は場に残ったまま）。答えが返ったら
// applyReviveConfirm / declineReviveConfirm が決着させる。docs/design/RESUME_STACK.md §7
function suspendReviveConfirm(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    effectId: string,
    sourceInstanceId: string,
    context?: DestroyContext,
): void {
    suspend(state, {
        pid: ownerPid,
        kind: "option",
        prompt: `${getCard(inst.cardId).name}：破壊される代わりに復活させますか？`,
        candidates: [],
        options: ["復活させる"],
        optional: true,
        confirm: true,
        reviveConfirm: {
            pid: ownerPid,
            instanceId: inst.instanceId,
            effectId,
            sourceInstanceId,
            ...(context ? { context } : {}),
        },
        action: { type: "noop" },
        selfInstanceId: inst.instanceId,
    })
}

// 「フィールドに残る」のコストの「使う1体／1つ／1枚」を持ち主に選ばせる選択待ち。
// 復活の確認に「復活させる」と答えたあと（applyReviveConfirm の中）で立つ。
// 答えは applyReviveCostPick が受け、コストを払って復活を確定させる
function suspendReviveCostPick(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>,
    source: CardInstance | undefined,
    context: DestroyContext | undefined,
    instanceIds: string[] | undefined,
    cardIndices: number[] | undefined,
    prompt: string,
): "pending" {
    suspend(state, {
        pid: ownerPid,
        kind: instanceIds !== undefined ? "target" : "card",
        prompt,
        candidates: instanceIds ?? [],
        ...(cardIndices !== undefined ? { cardZone: "hand" as const, cardOwner: ownerPid, cardIndices } : {}),
        // pickMany の効果は、1体だけのときも破棄の選択を複数体のときと同じトグル＋確定にそろえる
        ...(cardIndices !== undefined && effect.pickMany
            ? { selectedCardIndices: [], counter: { label: "捨てる", current: 0, max: 1 }, skipLabel: "これで捨てる", optional: true }
            : { optional: false }),
        reviveCostPick: {
            pid: ownerPid,
            instanceId: inst.instanceId,
            effectId: effect.id,
            sourceInstanceId: source?.instanceId ?? inst.instanceId,
            ...(context ? { context } : {}),
        },
        action: { type: "noop" },
        selfInstanceId: inst.instanceId,
    })
    return "pending"
}

// この個体を今このコンテキストで破壊しようとしたとき、
// 「破壊される代わりに復活させますか？」の確認が出るか（**副作用なし**）。
// 同時破壊で解決順をターンプレイヤーに聞くかどうかの判定にだけ使う
export function wouldAskReviveConfirm(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
    context?: DestroyContext,
): boolean {
    const inst = state.players[ownerPid].field.spirits.find((s) => s.instanceId === instanceId)
    if (!inst) return false
    return tryReviveOnDestroy(state, ownerPid, inst, context, undefined, true, "confirm")
}

// ネクサス版の reviveOnDestroy（scope:"ownNexus"）。破壊待機中のネクサスを、発生源（別の
// 自分のネクサス）のコストで場に残す。removal.ts の driveNexusDestruction がコミット直前に呼ぶ。
// true＝復活した、または確認を出した（どちらでもコミットは実質何もしない／断られたときだけ破壊される）
export function tryNexusReviveOnDestroy(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): boolean {
    const player = state.players[ownerPid]
    for (const source of player.field.nexuses) {
        if (source.instanceId === inst.instanceId) continue
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "reviveOnDestroy" || effect.scope !== "ownNexus") continue
            // ネクサス版のコストは発生源の疲労のみ（cost.exhaustSelf）。ほかのコスト種は対応しない
            if (effect.cost?.exhaustSelf !== true) continue
            if (!entryActive(state, ownerPid, source, effect, currentLevel(source).level)) continue
            if (!matchesTarget(state, ownerPid, inst, effect.filter, source.instanceId)) continue
            // コストはこのネクサスの疲労のみ。破壊待機状態のネクサスは疲労できないので、
            // 発生源自身が破壊されているとき（同時破壊）もここで落ちる
            if (source.pendingDestruction || source.isRested || !canExhaustNexus(state, ownerPid)) continue
            if (state.interactiveTargets) {
                suspend(state, {
                    pid: ownerPid,
                    kind: "option",
                    prompt: `${getCard(inst.cardId).name}：${getCard(source.cardId).name}を疲労させて、破壊される代わりに疲労状態でフィールドに残しますか？`,
                    candidates: [],
                    options: ["疲労させて残す"],
                    optional: true,
                    confirm: true,
                    reviveNexusConfirm: {
                        pid: ownerPid,
                        instanceId: inst.instanceId,
                        sourceInstanceId: source.instanceId,
                        effectId: effect.id,
                    },
                    action: { type: "noop" },
                    selfInstanceId: inst.instanceId,
                })
                return true
            }
            applyNexusRevive(state, ownerPid, inst, source, effect)
            return true
        }
    }
    return false
}

// 確認で「残す」が選ばれたときの後処理（choice.ts から呼ぶ）。コストを払って復活を確定させる。
// 発生源が確認のあいだに疲労・破壊されてコストが払えなくなったら不発（破壊はコミットで行われる）
export function applyNexusReviveConfirm(
    state: GameState,
    entry: NonNullable<PendingChoice["reviveNexusConfirm"]>,
): void {
    const player = state.players[entry.pid]
    const inst = player.field.nexuses.find((n) => n.instanceId === entry.instanceId)
    const source = player.field.nexuses.find((n) => n.instanceId === entry.sourceInstanceId)
    if (!inst || !source || !inst.pendingDestruction) return
    const effect = getCard(source.cardId).effects.find(
        (e): e is Extract<EffectDef, { kind: "reviveOnDestroy" }> =>
            e.kind === "reviveOnDestroy" && e.id === entry.effectId && e.scope === "ownNexus",
    )
    if (!effect || effect.cost?.exhaustSelf !== true || source.isRested || source.pendingDestruction || !canExhaustNexus(state, entry.pid)) {
        log(state, `${getCard(source.cardId).name}：コストを払えないため発動しなかった。`)
        return
    }
    applyNexusRevive(state, entry.pid, inst, source, effect)
}

function applyNexusRevive(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    source: CardInstance,
    effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>,
): void {
    if (!exhaustNexus(state, ownerPid, source, ownerPid, getCard(source.cardId).type)) return
    delete inst.pendingDestruction
    inst.isRested = true
    inst.nexusReviveStayed = true
    noteCoverage(effect, "reviveOnDestroy")
    log(
        state,
        `${state.players[ownerPid].name}の${getCard(inst.cardId).name}は、${getCard(source.cardId).name}の効果で破壊される代わりに疲労状態でフィールドに残った。`,
    )
}

// この破壊で成立しうる「フィールドに残る／戻る」のエントリを集める（**副作用ありに変わった**：
// 同時破壊グループが有効な間は、他の発生源（sourceInstanceId 付き＝scope:"ownAll"）の枠を
// `${sourceInstanceId}:${effectId}` 単位で仮消費する。自身の reviveOnDestroy（scope:"self"）は対象外
// （公式Q&A Q22359。fix/destroyed-trigger-once）。断った場合は declineReviveConfirm が戻す
// 破壊で誘発した効果を1列に並べるとき、列の項目として出すために使う（docs/design/TIMING_CHART.md）
export function collectReviveEntries(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    context?: DestroyContext,
): { effectId: string; sourceName: string }[] {
    const found: { effectId: string; sourceName: string; sourceInstanceId?: string; perDestroyed?: true; pickMany?: true }[] = []
    tryReviveOnDestroy(state, ownerPid, inst, context, undefined, undefined, undefined, found)
    const group = state.destroyGroup
    const result: { effectId: string; sourceName: string }[] = []
    for (const entry of found) {
        if (context?.suppressOwnEffects && entry.sourceInstanceId === undefined) continue
        if (group && entry.sourceInstanceId !== undefined && entry.perDestroyed !== true) {
            const key = `${entry.sourceInstanceId}:${entry.effectId}`
            if (group.used.includes(key)) continue
            group.used.push(key)
        }
        result.push({ effectId: entry.effectId, sourceName: entry.sourceName })
    }
    return result
}

// 集めておいた「フィールドに残る／戻る」エントリを1つだけ適用する（列から選ばれたときに呼ぶ）。
// optional（「〜できる」）またはコストありなら持ち主に確認を出す（払えなくても出す。COST_MODEL.md §10）。断れば破壊はそのまま進み、
// 列に残っている項目も解決される（pendingDestruction が消えないため）
export function applyReviveEntry(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    effectId: string,
    context?: DestroyContext,
): boolean {
    return tryReviveOnDestroy(state, ownerPid, inst, context, { effectId }, true)
}

// ── 【不死】（BS09）──────────────────────────────────────────────────────
// トラッシュにある【不死】持ちのスピリットカードは、指定コストの自分のスピリットが破壊されたとき、
// **通常のコストを支払って**召喚できる（『お互いのアタックステップ』限定）。
// ⚠️ 同じ破壊に対する「フィールドに残る」と**同時発揮**で、ターンプレイヤーが決める解決順が
//    結果を変える（残るを先に解決すると破壊されなかったことになり、【不死】は発動できない）。
// docs/design/BS09_PLAN.md §3 ／ docs/design/TIMING_CHART.md §0-3

// この破壊で【不死】の確認が出るトラッシュのカード位置を列挙する（**副作用なし**）。
// 召喚コスト＋維持コアをリザーブから払えないものは、確認自体を出さないので除く
// 破壊された個体が【不死】の引き金として持つコストの一覧。
// 本来のコストに加えて「破壊されたとき、このコストとしても扱う」ぶんを足す（BS11-064 闇の聖剣Lv1）
export function destroyedCostsOf(inst: CardInstance): number[] {
    if ((inst.alsoCostsWhenDestroyed ?? []).length > 0) noteGrantedFrom(inst, "alsoCostGrant")
    return [getCard(inst.cardId).cost, ...(inst.alsoCostsWhenDestroyed ?? [])]
}

// 破壊された個体が【不死：系統】の引き金として持つ系統の一覧（静的な系統。BS13-014 闇騎士アグラヴェイン）
export function destroyedFamiliesOf(inst: CardInstance): string[] {
    return getCard(inst.cardId).family
}

// 【不死】召喚で実際に払うコスト。このターン最初の1回だけ0になる制約があれば0
// （BS14-098ダークリボーン。維持コアはここに含まない＝通常どおり要る）
function fushiCostOf(state: GameState, ownerPid: PlayerId, card: CardData): number {
    if (timedPlayerRules(state, ownerPid).some((c) => c.type === "freeFushiSummonForPid")) return summonSurcharge(state, ownerPid, card)
    return effectiveCost(state, ownerPid, card, false, [], false, false)
}

// 通常のコスト＋維持コアを、リザーブとフィールドのコアで払えるか（支払い元はフィールドも含む。2026-10-15 ユーザー確認）
function fushiPayable(state: GameState, ownerPid: PlayerId, card: CardData): boolean {
    return autoPayPlan(state, ownerPid, fushiCostOf(state, ownerPid, card) + minLevelCores(card), true) !== null
}

// kind:"fushiFreeByExhaust"（BS15-064冥府へ続く魔門Lv2）：未疲労のこのネクサスがあれば、
// カード記載コストが effect.maxCost 以下の【不死】スピリットを、このネクサスを疲労させることで
// コストを支払わずに召喚できる（維持コアは通常どおり要る）。該当する発生源のinstanceIdを返す
// （複数あれば最初に見つかったものを使う。決定的簡略化）
function fushiFreeExhaustSource(state: GameState, ownerPid: PlayerId, card: CardData): string | null {
    const player = state.players[ownerPid]
    for (const nexus of player.field.nexuses) {
        if (nexus.isRested) continue
        const level = currentLevel(nexus).level
        const hit = getCard(nexus.cardId).effects.some(
            (e) => e.kind === "fushiFreeByExhaust" && entryActive(state, ownerPid, nexus, e, level) && card.cost <= e.maxCost,
        )
        if (hit) {
            noteCoverage(getCard(nexus.cardId).effects.find((e) => e.kind === "fushiFreeByExhaust"), "fushiFreeByExhaust")
        }
        if (hit) return nexus.instanceId
    }
    return null
}

export function fushiCandidates(
    state: GameState,
    ownerPid: PlayerId,
    destroyedCosts: number[],
    destroyedFamilies: string[] = [],
): number[] {
    // 『お互いのアタックステップ』：アタックステップ以外では発揮しない
    if (state.phase !== "attack") return []
    const player = state.players[ownerPid]
    const found: number[] = []
    for (let i = 0; i < player.trashCards.length; i++) {
        const cardId = player.trashCards[i]
        if (cardId === undefined) continue
        const card = getCard(cardId)
        // 【不死】で召喚するのはスピリットに限らない：ブレイヴカードならスピリット状態で場に出る（BS20-X07）
        if (card.type !== "spirit" && card.type !== "brave") continue
        if (trashCardEffectsDisabled(state, cardId)) continue
        const hit = card.effects.some((e) => {
            if (e.kind !== "keyword" || e.keyword !== "fushi") return false
            if ((e.triggerCosts ?? []).some((c) => destroyedCosts.includes(c))) return true
            const triggerFamilies = e.triggerFamilies
            if (triggerFamilies === undefined) return false
            const families = Array.isArray(triggerFamilies) ? triggerFamilies : [triggerFamilies]
            return families.some((f) => destroyedFamilies.includes(f))
        })
        if (!hit) continue
        const maintain = minLevelCores(card)
        // 通常どおりコスト+維持コアを払えるか。払えなくても、未疲労のLv2魔門があり
        // コストがmaxCost以下なら、維持コアだけで無償召喚の候補になる（BS15-064）
        const canPayNormally = fushiPayable(state, ownerPid, card)
        const canPayFree = canPayFreeSummonSurcharge(state, ownerPid, card, maintain) && fushiFreeExhaustSource(state, ownerPid, card) !== null
        if (!canPayNormally && !canPayFree) continue
        noteKeyword(getCard(cardId).effects, "fushi")
        found.push(i)
    }
    return found
}

function suspendFushiSummon(state: GameState, ownerPid: PlayerId, trashIndex: number): void {
    const cardId = state.players[ownerPid].trashCards[trashIndex]
    if (cardId === undefined) return
    const card = getCard(cardId)
    const player = state.players[ownerPid]
    const maintain = minLevelCores(card)
    const canPayNormally = fushiPayable(state, ownerPid, card)
    const freeSource = fushiFreeExhaustSource(state, ownerPid, card)
    const canPayFree = freeSource !== null && canPayFreeSummonSurcharge(state, ownerPid, card, maintain)
    // 払える側だけ選択肢に出す（COST_MODEL.md §1：払えない道は提示しない）。
    // 魔門（BS15-064 Lv2）で無償召喚できないときは、従来どおり「召喚する」1つだけの確認にする
    const options: string[] = []
    if (canPayFree) {
        if (canPayNormally) options.push("コストを支払って召喚する")
        options.push("魔門を疲労させて無償で召喚する")
    } else if (canPayNormally) {
        options.push("召喚する")
    }
    if (options.length === 0) return
    suspend(state, {
        pid: ownerPid,
        kind: "option",
        prompt: canPayFree
            ? `${card.name}：【不死】でトラッシュから召喚しますか？（通常のコスト${String(fushiCostOf(state, ownerPid, card))}）`
            : `${card.name}：【不死】でトラッシュからコスト${String(fushiCostOf(state, ownerPid, card))}を支払って召喚しますか？`,
        candidates: [],
        options,
        optional: true,
        confirm: true,
        fushiSummon: {
            pid: ownerPid,
            cardId,
            trashIndex,
            ...(canPayFree ? { freeNexusInstanceId: freeSource } : {}),
        },
        action: { type: "noop" },
        selfInstanceId: null,
    })
}

// 【不死】の確認で「召喚する」が選ばれたときの後処理。**コストはここで支払う**
// 【不死】1枚を解決する。実対戦では「召喚しますか？」の確認を出し、非対話では確認せず召喚する
// （既存の任意効果と同じ簡略化）。破壊で誘発した効果の列から呼ばれる
export function fushiSummonOrConfirm(state: GameState, ownerPid: PlayerId, trashIndex: number): void {
    if (state.interactiveTargets) {
        suspendFushiSummon(state, ownerPid, trashIndex)
        return
    }
    const cardId = state.players[ownerPid].trashCards[trashIndex]
    if (cardId === undefined) return
    const player = state.players[ownerPid]
    const card = getCard(cardId)
    const maintain = minLevelCores(card)
    // 非対話（AI・テスト）の既定：通常どおり払えるならそちらを優先する（召喚時効果も発揮できて得なため）。
    // 払えないときだけ、未疲労のLv2魔門があれば無償召喚を使う（BS15-064冥府へ続く魔門）
    if (!fushiPayable(state, ownerPid, card)) {
        const freeSource = fushiFreeExhaustSource(state, ownerPid, card)
        if (freeSource !== null && canPayFreeSummonSurcharge(state, ownerPid, card, maintain)) {
            applyFushiSummon(state, { pid: ownerPid, cardId, trashIndex, freeNexusInstanceId: freeSource }, true)
            return
        }
    }
    applyFushiSummon(state, { pid: ownerPid, cardId, trashIndex })
}

export function applyFushiSummon(
    state: GameState,
    info: NonNullable<PendingChoice["fushiSummon"]>,
    // true指定時：info.freeNexusInstanceId のネクサスを疲労させ、コストを支払わずに召喚する
    // （維持コアは通常どおり要る）。召喚時効果は発揮されない（skipOnSummonと同じ印。BS15-064冥府へ続く魔門Lv2）
    useFree?: true,
    // 支払い待ち（effectCostPay）で払い済み。維持コアだけリザーブから置く
    prepaid?: true,
): void {
    const player = state.players[info.pid]
    // 確認を出したあとにトラッシュが動いている可能性があるので、位置が食い違えばカードIDで取り直す
    const index =
        player.trashCards[info.trashIndex] === info.cardId
            ? info.trashIndex
            : player.trashCards.indexOf(info.cardId)
    if (index === -1) return
    const card = getCard(info.cardId)
    const maintain = minLevelCores(card)
    const freeNexus =
        useFree && info.freeNexusInstanceId !== undefined
            ? player.field.nexuses.find((n) => n.instanceId === info.freeNexusInstanceId && !n.isRested)
            : undefined
    if (useFree && !freeNexus) {
        log(state, `${player.name}は魔門を疲労させて【不死】を無償で召喚できなかった。`)
        return
    }
    // 無償（魔門）でも相手の転召の祭壇などの余分は払う（2026-10-15）
    const cost = freeNexus ? surchargeOwed(state, info.pid, card, false) : fushiCostOf(state, info.pid, card)
    const voidToll = summonVoidToll(state, card)
    if (voidToll > player.reserve) {
        log(state, `${player.name}はボイドにコアを置けず、${card.name}を召喚できなかった。`)
        return
    }
    if (!prepaid) {
        if (autoPayPlan(state, info.pid, cost + maintain + voidToll, true) === null) {
            log(state, `${player.name}は【不死】のコストを支払えず、${card.name}を召喚できなかった。`)
            return
        }
        const resume = { type: "trashSummonPaidInternal", via: freeNexus ? "fushiFree" : "fushi", cardId: info.cardId, trashIndex: index, ...(freeNexus ? { freeNexusInstanceId: freeNexus.instanceId } : {}) } as const
        const asked = freeNexus
            ? askSurchargePay(state, info.pid, card, false, maintain, resume)
            : askCostPay(state, info.pid, cost, maintain, `【不死】${card.name}：${cost}コストを支払ってください`, info.cardId, resume)
        if (asked) return
    }
    player.trashCards.splice(index, 1)
    payVoidToll(state, info.pid, card)
    let placedFromField = 0
    if (!prepaid) {
        const plan = autoPayPlan(state, info.pid, cost + maintain, true)!
        placedFromField = payCost(state, info.pid, cost, plan.paySources, maintain, plan.soulFromReserve)
    }
    if (freeNexus) {
        exhaustSpirit(state, info.pid, freeNexus)
    } else {
        // コスト0になる制約は**このターン最初の1回だけ**なので、使ったらここで取り除く（BS14-098）
        const freeIndex = state.timedEffects.findIndex(
            (r) => r.target.kind === "player" && r.target.pid === info.pid && r.content.some((c) => c.type === "playerRule" && c.rule.type === "freeFushiSummonForPid"),
        )
        if (freeIndex !== -1) state.timedEffects.splice(freeIndex, 1)
    }
    // 維持コアはリザーブからスピリットの上へ（無償召喚でも通常どおり要る）
    player.reserve -= maintain - placedFromField
    const inst = createInstance(info.cardId, state.turn, maintain)
    if (freeNexus) inst.noOnSummon = true
    player.field.spirits.push(inst)
    log(
        state,
        `${player.name}は【不死】で${card.name}をトラッシュから召喚した。` +
            (freeNexus ? `（${getCard(freeNexus.cardId).name}を疲労させ、コストを支払わずに）` : `（コスト${String(cost)}）`),
    )
    // 「召喚」なので【転召】は通常どおり解決する（無償召喚でも必ず行う。skipOnSummonと同じ規則）
    if (!state.winner) resolveTensho(state, info.pid, inst, false, true)
    if (state.winner) return
    // 魔門を疲労させた無償召喚は、このスピリット自身の召喚時効果だけを止める（inst.noOnSummon。ほかのカードの「召喚されたとき」は出る。RESUME_STACK §6）
    if (freeNexus) log(state, `${card.name}：『召喚時』効果は発揮されない。`)
    if (state.pendingChoice) {
        // 【転召】の途中で中断したら、召喚時効果以降は再開フレームに任せる（doSummon と同じ形）
        pushResumeFrames(state, [
            { kind: "action", selfInstanceId: inst.instanceId, action: { type: "summonSequence", byFushi: true } },
        ])
        return
    }
    // 【不死】も「召喚」なので、召喚時効果だけでなく「自分のスピリットが召喚されたとき」の
    // フィールド誘発も通常どおり起こす（byFushi=true。BS09-013ミミズクロ／BS09-071イモータルドロー）
    fireSummonSequence(state, info.pid, inst, true)
}

// 器AR：BS13-034ミノガメン「相手のデッキ破棄効果で破棄されたこのカードは、コストを支払わずに
// 召喚できる。さらに、このターンの間、自分のデッキは破棄されない」。「できる」＝任意なので確認を出す
// （非対話は自動で召喚する。fushiSummonと同じ形）。破棄されたその瞬間にしか呼ばれない
// （BS13_PLAN.md §1 #27＝トラッシュに残っていてもあとから召喚はできない）
export function spiritMillFreeSummonOrConfirm(state: GameState, ownerPid: PlayerId, trashIndex: number): void {
    const cardId = state.players[ownerPid].trashCards[trashIndex]
    if (cardId === undefined) return
    if (!canPayFreeSummonSurcharge(state, ownerPid, getCard(cardId))) {
        log(state, `${getCard(cardId).name}：転召の祭壇などの余分のコストを払えず、召喚できなかった。`)
        return
    }
    if (!state.interactiveTargets) {
        applySpiritMillFreeSummon(state, { pid: ownerPid, cardId, trashIndex })
        return
    }
    suspend(state, {
        pid: ownerPid,
        kind: "option",
        prompt: `${getCard(cardId).name}：コストを支払わずに召喚しますか？`,
        candidates: [],
        options: ["召喚する"],
        optional: true,
        confirm: true,
        spiritMillFreeSummon: { pid: ownerPid, cardId, trashIndex },
        action: { type: "noop" },
        selfInstanceId: null,
    })
}

export function declineSpiritMillFreeSummon(state: GameState, info: NonNullable<PendingChoice["spiritMillFreeSummon"]>): void {
    log(state, `${getCard(info.cardId).name}：召喚しなかった。`)
}

export function applySpiritMillFreeSummon(
    state: GameState,
    info: NonNullable<PendingChoice["spiritMillFreeSummon"]>,
    // 余分を支払い待ち（effectCostPay）で払い済み
    prepaid?: true,
): void {
    const player = state.players[info.pid]
    const index =
        player.trashCards[info.trashIndex] === info.cardId
            ? info.trashIndex
            : player.trashCards.indexOf(info.cardId)
    if (index === -1) return
    const card = getCard(info.cardId)
    const maintain = minLevelCores(card)
    if (!prepaid && askSurchargePay(state, info.pid, card, false, maintain, { type: "trashSummonPaidInternal", via: "mill", cardId: info.cardId, trashIndex: index })) return
    const placed = prepaid ? 0 : payFreeSummonSurchargeKeeping(state, info.pid, card, false, maintain)
    if (placed === null) {
        log(state, `${card.name}：転召の祭壇などの余分のコストを払えず、召喚できなかった。`)
        return
    }
    player.trashCards.splice(index, 1)
    // 召喚コストは無料だが、Lv1 に要るコアは通常の召喚と同じくリザーブから置く（フィールドのコアで賄えたぶんは除く）
    const cores = Math.min(maintain - placed, player.reserve) + placed
    player.reserve -= cores - placed
    const inst = createInstance(info.cardId, state.turn, cores)
    player.field.spirits.push(inst)
    log(state, `${player.name}は${card.name}をコストを支払わずに召喚した。`)
    if (!state.winner) resolveTensho(state, info.pid, inst, false, true)
    if (state.winner) return
    if (state.pendingChoice) {
        pushResumeFrames(state, [
            { kind: "action", selfInstanceId: inst.instanceId, action: { type: "summonSequence" } },
        ])
        return
    }
    fireSummonSequence(state, info.pid, inst)
}

// 保留していた復活の確認で「復活させる」が選ばれたときの後処理。
// ここで初めてコストを支払い、復活先（場に残る／手札へ戻る）を適用する。
// コストを払えなければ復活は成立せず、そのまま破壊する
export function applyReviveConfirm(
    state: GameState,
    entry: NonNullable<PendingChoice["reviveConfirm"]>,
): void {
    const player = state.players[entry.pid]
    const inst = player.field.spirits.find((s) => s.instanceId === entry.instanceId)
    if (!inst) return // 確認を出したあとに場から居なくなっていたら何もしない
    // 保留したときと同じ判定経路を、対象のエントリだけに絞って**確定モード**で通す
    // （forced 指定時は optional の保留分岐に入らない）。コストが払えない等で成立しなければ破壊する
    if (!tryReviveOnDestroy(state, entry.pid, inst, entry.context, { effectId: entry.effectId, skipConfirm: true })) {
        log(state, `${getCard(inst.cardId).name}：条件を満たさないため発動しなかった。`)
        declineReviveConfirm(state, entry)
        return
    }
    // 復活が成立した＝破壊されていない（場に残る／手札へ戻るのどちらでも）
    state.lastReviveDestroyed = false
}

// 「フィールドに残る」のコストの選択（reviveCostPick）に答えたときの後処理。
// 選んだ対象でコストを払って復活を確定させる。選んだ候補がもう使えなくなっていたら不発＝破壊する
export function applyReviveCostPick(
    state: GameState,
    entry: NonNullable<PendingChoice["reviveCostPick"]>,
    instanceId?: string,
    cardIndex?: number,
): void {
    const player = state.players[entry.pid]
    const inst = player.field.spirits.find((s) => s.instanceId === entry.instanceId)
    if (!inst) return // 選択を出したあとに場から居なくなっていたら何もしない
    if (
        !tryReviveOnDestroy(state, entry.pid, inst, entry.context, { effectId: entry.effectId, skipConfirm: true }, undefined, undefined, undefined, {
            ...(instanceId !== undefined ? { instanceId } : {}),
            ...(cardIndex !== undefined ? { cardIndex } : {}),
        })
    ) {
        log(state, `${getCard(inst.cardId).name}：条件を満たさないため発動しなかった。`)
        declineReviveConfirm(state, entry)
        return
    }
    state.lastReviveDestroyed = false
}

// 保留していた復活の確認で「復活させない」が選ばれたときの後処理。見送っていた破壊をここで行う
export function declineReviveConfirm(
    state: GameState,
    entry: NonNullable<PendingChoice["reviveConfirm"]>,
): void {
    const player = state.players[entry.pid]
    const inst = player.field.spirits.find((s) => s.instanceId === entry.instanceId)
    if (!inst) return
    log(state, `${player.name}の${getCard(inst.cardId).name}は復活しなかった。`)
    // 同時破壊グループの仮消費を戻す（このsourceInstanceIdはscope:"self"のときは元々マークしていないので
    // 何もしない。次に破壊される1体でまたこの発生源の枠を提示できるようにする。fix/destroyed-trigger-once）
    revertDestroyGroupUsage(state, entry.sourceInstanceId, entry.effectId)
    // 破壊バッチが中断から再開したときに「破壊できた数」へ算入できるよう結果を残す
    state.lastReviveDestroyed = destroySpirit(
        state,
        entry.pid,
        entry.instanceId,
        "destroy",
        entry.context,
        { skipRevive: true },
    )
}

// 「残る」の後始末。reviveOnDestroy の revived:{rested} と action "remainOnFieldSelf"（破壊時効果の中で
// 自分の破壊を取り消す。BS20-X02）が共有する。破壊待機でなければ呼ばない（呼び出し側で見る）
export function stayOnFieldRevived(state: GameState, ownerPid: PlayerId, inst: CardInstance, rested: boolean): void {
    // 復活が成立した＝**破壊待機状態が解除された**（TIMING_CHART.md §1.5）。
    // 印を消さないと、以後この個体は「疲労も回復もできず、破壊もされない」ままになる
    delete inst.pendingDestruction
    inst.isRested = rested
    // 支払いでコアが維持コアを下回った場合は、待機解除の直後に消滅する
    // （cause:"deplete" は復活判定に入らないので再帰しない。BS09-063花の宮殿＝コア1個の個体）
    if (inst.cores < instMinLevelCores(inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
}

// pickMany の発生源が、この個体を戻す候補にできるか（revivePickMany.ts が使う。判定は破壊時の走査と同じ）
export function collectPickManyEntries(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    context?: DestroyContext,
): { effectId: string; sourceInstanceId: string }[] {
    const found: { effectId: string; sourceName: string; sourceInstanceId?: string; pickMany?: true }[] = []
    tryReviveOnDestroy(state, ownerPid, inst, context, undefined, undefined, undefined, found)
    // 自分の強制の「残る」（確認もコストも無い scope:"self"）が先に効く体は、選ばせると捨てた手札が無駄になるので候補にしない
    const ownEffects = getCard(inst.cardId).effects
    const staysByItself = found.some((e) => {
        if (e.sourceInstanceId !== undefined) return false
        const own = ownEffects.find((x) => x.id === e.effectId)
        return own?.kind === "reviveOnDestroy" && own.scope === "self" && !own.optional && own.cost === undefined
    })
    if (staysByItself) return []
    return found.flatMap((e) => (e.pickMany && e.sourceInstanceId !== undefined ? [{ effectId: e.effectId, sourceInstanceId: e.sourceInstanceId }] : []))
}

// reviveOnDestroy の判定と実行。復活できたら true を返す（呼び出し側 destroySpirit はそのまま return する）。
// 優先順位: instのカード自身が持つ scope:"self" の効果 → 持ち主フィールドの scope:"ownAll" の効果（先に見つかった方）。
function tryReviveOnDestroy(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    context?: DestroyContext,
    // 指定時は「このエントリだけを、確認済みとして確定させる」モード。
    // optional の保留分岐に入らず、他のエントリも見ない（applyReviveConfirm から渡る）
    // skipConfirm 指定時は optional の確認をスキップして即適用する（applyReviveConfirm＝
    // 既に持ち主が「はい」と答えたあとの経路。指定しなければ optional は従来どおり確認を出す）
    forced?: { effectId: string; skipConfirm?: true },
    // true なら「破壊される代わりに復活できる」の確認を**その場で**出す（保留リストに積まない）。
    // ①の破壊（destroySpirits のバッチ経由）だけが立てる。②は渡さず保留へ（destroySpirit の注記）
    allowSuspend?: boolean,
    // **判定だけ**して結果を返す下見モード（確認も復活も実行しない）。
    //   "confirm" ＝「復活しますか？」の確認が出るか（＝任意の復活があるか）
    //   "any"     ＝任意・強制を問わず、そもそも復活が成立しうるか（【不死】との解決順の判定に使う）
    // ⚠️ "any" はコストが払えるかまでは見ない近似（副作用なしで確かめられないため）
    probe?: "confirm" | "any",
    // 指定時は**適用せず、条件を満たすエントリを集めるだけ**（破壊で誘発した効果を1列に並べるとき、
    // 「フィールドに残る／戻る」を列の項目として出すために使う。docs/design/TIMING_CHART.md）。
    // sourceInstanceId／perDestroyed は scope:"ownAll"（他の発生源）のときだけ載る
    // （collectReviveEntries が同時破壊グループの重複判定に使う。scope:"self" は対象外＝常に載らない）
    collect?: { effectId: string; sourceName: string; sourceInstanceId?: string; perDestroyed?: true; pickMany?: true }[],
    // reviveCostPick の選択で持ち主が選んだ対象（スピリット/ネクサスのinstanceId、手札のcardIndex）。
    // 指定時は applyCost がその候補を使う（候補外・既に使えなければ不発）
    chosen?: { instanceId?: string; cardIndex?: number },
): boolean {
    const player = state.players[ownerPid]
    const level = currentLevel(inst).level

    const matchesWhen = (when: {
        byOpponentEffect?: boolean
        byOpponent?: boolean
        byBattleVsArmorColor?: boolean
        byBattleVsHeavyArmorColor?: boolean
        byBattle?: boolean
        byBattleKillerLevel?: number
        byBattleKillerMaxBp?: number
        byBattleKillerMinBp?: number
        opponentEffectSourceTypes?: CardType[]
    }): boolean => {
        if (when.byOpponentEffect) {
            // バトルのBP比較による破壊は「効果」ではない（BS19-X05。効果による破壊だけに効く）
            if (context?.battle !== undefined) return false
            if (context?.sourcePid === undefined || context.sourcePid === ownerPid) return false
            if (when.opponentEffectSourceTypes && (context.sourceType === undefined || !when.opponentEffectSourceTypes.includes(context.sourceType))) return false
        }
        // 「相手によって破壊されたとき」＝相手の効果 **または** バトルのBP比較（BS12-X05）。
        // 自分の効果で自分を破壊した場合は含まない
        if (when.byOpponent) {
            const byOppEffect = context?.sourcePid !== undefined && context.sourcePid !== ownerPid
            if (!byOppEffect && context?.battle === undefined) return false
        }
        if (when.byBattleVsArmorColor) {
            const attackerColors = context?.battle?.attackerColors
            if (attackerColors === undefined || !hasArmorAgainst(state, inst, attackerColors)) return false
        }
        // 器AI：byBattleVsArmorColorの【重装甲】版（BS13-067光導く巨塔）
        if (when.byBattleVsHeavyArmorColor) {
            const attackerColors = context?.battle?.attackerColors
            if (attackerColors === undefined || !hasHeavyArmorAgainst(inst, attackerColors)) return false
        }
        if (when.byBattle && context?.battle === undefined) return false
        if (
            when.byBattleKillerLevel !== undefined &&
            context?.battle?.attackerLevel !== when.byBattleKillerLevel
        ) {
            return false
        }
        // BS08勝者のグリーンフィールドLv2：破壊した側（勝者）の実効BPがこれ以下のときのみ復活する
        if (
            when.byBattleKillerMaxBp !== undefined &&
            (context?.battle?.attackerBp === undefined || context.battle.attackerBp > when.byBattleKillerMaxBp)
        ) {
            return false
        }
        if (
            when.byBattleKillerMinBp !== undefined &&
            (context?.battle?.attackerBp === undefined || context.battle.attackerBp < when.byBattleKillerMinBp)
        ) {
            return false
        }
        return true
    }

    const matchesPhaseTurn = (phaseTurn?: { phase?: Phase; turn: "own" | "opponent" | "both" }): boolean => {
        if (!phaseTurn) return true
        // phase 省略＝ステップ不問（turn 条件だけ見る）
        if (phaseTurn.phase !== undefined && state.phase !== phaseTurn.phase) return false
        if (phaseTurn.turn === "own" && ownerPid !== state.turnPlayer) return false
        if (phaseTurn.turn === "opponent" && ownerPid === state.turnPlayer) return false
        return true
    }

    // 復活のコストは効果の一部なので、発生源（ネクサス、無ければ破壊されたスピリット自身）の種類で破棄の制限に聞く
    const costSourceType = (source?: CardInstance): CardType => getCard((source ?? inst).cardId).type

    // 「自分の〜1体を疲労させることで」の候補（exhaustOwnFamilyOne・exhaustOwnSameFamilyOne・exhaustOwnOne の共通化。
    // 破壊される個体自身は除く）
    const exhaustCostCandidates = (
        effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>,
    ): CardInstance[] => {
        const own = effect.cost?.exhaustOwnOne
        const family =
            effect.cost?.exhaustOwnFamilyOne ??
            (effect.cost?.exhaustOwnSameFamilyOne ? getCard(inst.cardId).family : undefined)
        return player.field.spirits.filter(
            (s) =>
                s.instanceId !== inst.instanceId &&
                !s.isRested &&
                (family === undefined || matchesFamilyFilter(state, ownerPid, s, family)) &&
                (own === undefined || matchesTarget(state, ownerPid, s, own, inst.instanceId)),
        )
    }

    // 選択式コストの共通処理。候補が複数で対話モードなら選択待ちを立てる（"pending"）。
    // 非対話は auto の簡略化ヒューリスティックで選ぶ。選ばれた候補がもう使えなければ undefined＝不発
    const pickCostTarget = (
        effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>,
        source: CardInstance | undefined,
        candidates: CardInstance[],
        prompt: string,
        auto: (candidates: CardInstance[]) => CardInstance,
    ): CardInstance | "pending" | undefined => {
        if (chosen?.instanceId !== undefined) {
            return candidates.find((c) => c.instanceId === chosen!.instanceId)
        }
        if (candidates.length === 1) return candidates[0]
        if (state.interactiveTargets) {
            return suspendReviveCostPick(state, ownerPid, inst, effect, source, context, candidates.map((c) => c.instanceId), undefined, prompt)
        }
        return auto(candidates)
    }

    const applyCost = (
        effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>,
        source?: CardInstance,
    ): boolean | "pending" => {
        // 発生源自身を疲労させる（BS17-069）。COST_MODEL.mdのexhaustSelfと同じく既疲労なら不発
        if (effect.cost?.exhaustSelf) {
            if (!source || source.isRested) return false
            source.isRested = true
            return true
        }
        // 発生源自身のコアを払う（BS11-066 発見されし世界樹Lv2＝このネクサス上のコア3個）
        if (effect.cost?.sourceCoresToTrash !== undefined) {
            const need = effect.cost.sourceCoresToTrash
            if (!source || source.cores < need || coreRemovalAllowed(state, { ownerPid: ownerPid, target: source, amount: need, cause: "cost", actorPid: ownerPid }) < need) return false
            source.cores -= need
            player.trashCores += need
            return true
        }
        if (effect.cost?.keepOneCoreRestToTrash) {
            const excess = inst.cores - 1
            if (excess > 0 && coreRemovalAllowed(state, { ownerPid: ownerPid, target: inst, amount: excess, cause: "cost", actorPid: ownerPid }) < excess) return false
            if (excess > 0) {
                inst.cores = 1
                player.trashCores += excess
            }
            return true
        }
        if (effect.cost?.oneCoreToVoid) {
            // コア1個の個体は支払うと維持コア割れになるため不発
            if (inst.cores <= 1 || coreRemovalAllowed(state, { ownerPid: ownerPid, target: inst, amount: 1, cause: "cost", actorPid: ownerPid }) < 1) return false
            inst.cores -= 1
            return true
        }
        if (effect.cost?.oneCoreToTrash) {
            // BS09-063花の宮殿：対象のコア1個を持ち主のトラッシュへ。**コア1個でも支払う**ので、
            // 支払った結果0個になった個体は待機解除の後に維持コア割れで消滅する（2026-08-14 ユーザー確認）
            if (inst.cores <= 0 || coreRemovalAllowed(state, { ownerPid: ownerPid, target: inst, amount: 1, cause: "cost", actorPid: ownerPid }) < 1) return false
            inst.cores -= 1
            player.trashCores += 1
            return true
        }
        if (effect.cost?.reserveOneToTrash) {
            // 持ち主のリザーブのコア1個を持ち主のトラッシュへ（リザーブ0なら不発）
            if (player.reserve <= 0) return false
            player.reserve -= 1
            player.trashCores += 1
            return true
        }
        if (effect.cost?.fieldOrReserveOneToTrash) {
            // リザーブか、自分のスピリット/ネクサス1つのコア1個を持ち主のトラッシュへ。どこから払うかは持ち主がクリックして選ぶ
            // （2026-11-11 ユーザー指示。候補が1つだけなら選ばせない＝2026-11-05 の他のコスト選択と同じ。非対話はリザーブ優先の自動）。
            // 破壊される本人のコアは0個にならないときだけ。0個にすると消滅の待機に変わり、この「破壊されたとき」が解決できなくなる
            // （PENDING_STATE.md の改訂文・2026-11-11 ユーザー確認）
            const removable = (i: CardInstance): boolean => coreRemovalAllowed(state, { ownerPid: ownerPid, target: i, amount: 1, cause: "cost", actorPid: ownerPid }) >= 1
            const reserveId = coreZoneChoiceId("reserve", ownerPid)
            const fieldCands = [...player.field.spirits, ...player.field.nexuses].filter(
                (i) => (i.instanceId === inst.instanceId ? i.cores >= 2 : i.cores > 0) && removable(i),
            )
            const candidates = [...(player.reserve > 0 ? [reserveId] : []), ...fieldCands.map((i) => i.instanceId)]
            if (candidates.length === 0) return false
            let pick = chosen?.instanceId
            if (pick !== undefined && !candidates.includes(pick)) return false
            if (pick === undefined) {
                if (candidates.length === 1 || !state.interactiveTargets) pick = candidates[0]!
                else {
                    return suspendReviveCostPick(
                        state, ownerPid, inst, effect, source, context,
                        candidates, undefined,
                        `${getCard((source ?? inst).cardId).name}：トラッシュに置くコアを、リザーブか自分のスピリット/ネクサスから1個選んでください`,
                    )
                }
            }
            if (pick === reserveId) {
                player.reserve -= 1
            } else {
                const from = fieldCands.find((i) => i.instanceId === pick)!
                from.cores -= 1
            }
            player.trashCores += 1
            return true
        }
        if (effect.cost?.handDiscardOne) {
            // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない（コストとしての破棄も止まる。COST_MODEL.md §1）
            if (!canDiscardHand(state, ownerPid)) return false
            const cardType = effect.cost.handDiscardCardType
            const indices = player.hand
                .map((id, i) => (cardType === undefined || getCard(id).type === cardType ? i : -1))
                .filter((i) => i !== -1)
            if (indices.length === 0) return false
            // 破棄する1枚は持ち主が選ぶ（対話モードかつ候補2枚以上。2026-11-05 ユーザー確認）。
            // 候補1枚なら選ばせない。非対話は末尾（元の簡略化）
            const pickedIndex = chosen?.cardIndex !== undefined && indices.includes(chosen.cardIndex) ? chosen.cardIndex : undefined
            if (pickedIndex === undefined && chosen?.cardIndex !== undefined) return false
            const index = pickedIndex ?? (indices.length === 1 ? indices[0]! : -1)
            if (index === -1) {
                if (!state.interactiveTargets) {
                    const cardId = player.hand.splice(indices[indices.length - 1]!, 1)[0]!
                    player.trashCards.push(cardId)
                    return true
                }
                return suspendReviveCostPick(
                    state, ownerPid, inst, effect, source, context,
                    undefined, indices,
                    `${getCard((source ?? inst).cardId).name}：破棄する手札1枚を選んでください`,
                )
            }
            const cardId = player.hand.splice(index, 1)[0]!
            player.trashCards.push(cardId)
            return true
        }
        if (effect.cost?.millSelfOneMatching) {
            // BS07冥勇士デスカラビア：自分のデッキを上から1枚破棄し、そのカードが
            // 指定の色・種別（紫のスピリットカード）だったときだけ成立する
            const { color, cardType, thenHandIfNameIncludes } = effect.cost.millSelfOneMatching
            if (millAllowed(state, { pid: ownerPid, count: 1, actorPid: ownerPid, sourceType: costSourceType(source) }) < 1) return false
            const cardId = player.deck.shift()
            if (cardId === undefined) {
                log(state, `${player.name}のデッキが尽きているため、破壊時の効果は成立しなかった。`)
                return false
            }
            const milled = getCard(cardId)
            player.trashCards.push(cardId)
            noteMilled(state, ownerPid, 1, ownerPid, costSourceType(source))
            log(state, `${player.name}はデッキを上から1枚（${milled.name}）破棄した。`)
            const ok = milled.type === cardType && milled.colors.includes(color)
            if (!ok) log(state, `${milled.name}は条件を満たさなかった。`)
            // BS15共通器：thenHandIfNameIncludes（BS15-043ショーグンペンタン）。成立の可否と独立に、
            // カード名が一致すればトラッシュから手札へ移す（CONJUNCTION.md「さらに」）
            if (thenHandIfNameIncludes !== undefined && !handGainDenial(state, { pid: ownerPid, from: "trash", cause: "effect" }) && milled.name.includes(thenHandIfNameIncludes)) {
                const idx = player.trashCards.lastIndexOf(cardId)
                if (idx !== -1) {
                    player.trashCards.splice(idx, 1)
                    player.hand.push(cardId)
                    notifyHandGained(state, ownerPid, 1)
                    log(state, `${player.name}は${milled.name}を手札に加えた。`)
                }
            }
            return ok
        }
        if (effect.cost?.exhaustOwnFamilyOne || effect.cost?.exhaustOwnSameFamilyOne || effect.cost?.exhaustOwnOne) {
            // 疲労させる1体は持ち主が選ぶ（対話モードかつ候補2体以上。2026-11-05 ユーザー確認）。
            // 候補1体なら選ばせない。非対話は実効BP最小（元の簡略化）
            const candidates = exhaustCostCandidates(effect)
            if (candidates.length === 0) return false
            const picked = pickCostTarget(
                effect, source, candidates,
                `${getCard((source ?? inst).cardId).name}：疲労させる自分のスピリットを選んでください`,
                (cs) => cs.reduce((min, s) => (effectiveBp(state, ownerPid, s) < effectiveBp(state, ownerPid, min) ? s : min)),
            )
            if (picked === "pending") return "pending"
            if (picked === undefined) return false
            exhaustSpirit(state, ownerPid, picked)
            return true
        }
        if (effect.cost?.ownLifeOneToVoid) {
            // BS08太陽石の神殿：持ち主のライフのコア1個をボイドへ（リザーブには戻らない）。
            // ライフ0なら支払い不可＝不発。支払った結果ライフが0になった場合はそのまま勝敗が決まる。
            // ただし「ライフは0にならない」が働いている間は払って0にできない＝支払い不可（2026-09-16 ユーザー確定）
            if (player.life <= 0) return false
            if (!canPayLife(state, lifeCostQuery(ownerPid, 1, inst))) return false
            player.life -= 1
            recordLifeLoss(state, ownerPid, 1, inst)
            log(state, `${player.name}はライフのコア1個をボイドに置いた。（残りライフ${player.life}）`)
            if (player.life <= 0 && !state.winner) {
                state.winner = opponentOf(ownerPid)
                log(state, `${state.players[opponentOf(ownerPid)].name}の勝利！`)
            } else {
                fireFieldEventTriggers(state, ownerPid, "ownLifeLost")
            }
            return true
        }
        // 器AR：BS13-036星鳥クージャ「自分のライフのコア1個を自分のリザーブに置くことで」
        if (effect.cost?.ownLifeOneToReserve) {
            if (player.life <= 0) return false
            if (!canPayLife(state, lifeCostQuery(ownerPid, 1, inst))) return false
            player.life -= 1
            recordLifeLoss(state, ownerPid, 1, inst)
            player.reserve += 1
            log(state, `${player.name}はライフのコア1個を自分のリザーブに置いた。（残りライフ${player.life}）`)
            if (player.life <= 0 && !state.winner) {
                state.winner = opponentOf(ownerPid)
                log(state, `${state.players[opponentOf(ownerPid)].name}の勝利！`)
            } else {
                fireFieldEventTriggers(state, ownerPid, "ownLifeLost")
            }
            return true
        }
        if (effect.cost?.millSelfCount !== undefined) {
            // 枚数が足りなければ払えない（2026-09-24 ユーザー確定「数も完全に」。COST_MODEL）
            const n = effect.cost.millSelfCount
            if (player.deck.length < n || millAllowed(state, { pid: ownerPid, count: n, actorPid: ownerPid, sourceType: costSourceType(source) }) < n) return false
            for (let i = 0; i < n; i++) {
                const cardId = player.deck.shift()!
                player.trashCards.push(cardId)
            }
            noteMilled(state, ownerPid, n, ownerPid, costSourceType(source))
            log(state, `${player.name}はデッキを上から${n}枚破棄した。`)
            return true
        }
        // 器BW：BS14-X02呪の覇王カオティック・セイメイLv3【呪滅撃】「相手のライフのコア1個を相手のトラッシュに置くことで」。
        // 支払うのは**相手**のライフ（ownLifeOneToVoid等の自分版とは別軸）。相手のライフが0なら支払い不可＝不発。
        // 支払った結果相手のライフが0になれば、そのまま持ち主の勝利が決まる
        if (effect.cost?.opponentLifeOneToTrash) {
            const oppPid = opponentOf(ownerPid)
            const oppPlayer = state.players[oppPid]
            if (oppPlayer.life <= 0) return false
            if (!canPayLife(state, lifeCostQuery(opponentOf(ownerPid), 1, inst, ownerPid))) return false
            oppPlayer.life -= 1
            recordLifeLoss(state, oppPid, 1, inst)
            oppPlayer.trashCores += 1
            log(state, `${oppPlayer.name}はライフのコア1個をトラッシュに置いた。（残りライフ${oppPlayer.life}）`)
            if (oppPlayer.life <= 0 && !state.winner) {
                // BS14-084永久凍土の王都：**相手の効果で**ライフが0になる瞬間も守る
                // （効果文「自分のライフが0になるとき」は原因を限定していない。2026-09-13 ユーザー判断）。
                // コスト自体は支払われた（ライフは実際に0まで減った）うえで、王都が0を回避する
                if (!tryOwnLifeFloorByCost(state, oppPid)) {
                    state.winner = ownerPid
                    log(state, `${player.name}の勝利！`)
                }
            }
            if (!state.winner) fireFieldEventTriggers(state, oppPid, "ownLifeLost")
            return true
        }
        // BS14-X05神獣鳥アン・ズール：「自分のバースト1つを破棄することで」。
        // バーストがセットされていなければ支払い不可＝不発
        if (effect.cost?.discardOwnBurst) {
            if (player.burst === null) return false
            player.trashCards.push(player.burst)
            player.burst = null
            player.burstSet = false
            log(state, `${player.name}は${getCard(inst.cardId).name}のコストとして自分のバーストを破棄した。`)
            return true
        }
        // BS14-064レボルシング・ゼヨンLv2：「自分のネクサス1つを疲労させることで」。
        // 相手のconstraintで疲労させられない間は支払い不可＝不発（canExhaustNexus）。
        // 疲労させる1つは持ち主が選ぶ（対話モードかつ候補2つ以上。2026-11-05 ユーザー確認）。非対話はコア最少（元の簡略化）
        if (effect.cost?.exhaustOwnNexusOne) {
            if (!canExhaustNexus(state, ownerPid)) return false
            const candidates = player.field.nexuses.filter((n) => !n.isRested)
            if (candidates.length === 0) return false
            const picked = pickCostTarget(
                effect, source, candidates,
                `${getCard((source ?? inst).cardId).name}：疲労させる自分のネクサスを選んでください`,
                (cs) => cs.reduce((min, n) => (n.cores < min.cores ? n : min)),
            )
            if (picked === "pending") return "pending"
            if (picked === undefined) return false
            picked.isRested = true
            return true
        }
        // BS20-065サイクロ・アームズ【合体時】：「自分のネクサス1つを破壊することで」。
        // 破壊する1つは持ち主が選ぶ（対話モードかつ候補2つ以上。2026-11-05 ユーザー確認）。非対話は先頭。
        // 破壊は destroyNexus の通常処理で行う（破壊待機を経てコミットされる。相手の破壊耐性があれば支払い不可＝不発）
        if (effect.cost?.destroyOwnNexusOne) {
            const candidates = player.field.nexuses.filter((n) => !n.pendingDestruction)
            if (candidates.length === 0) return false
            const picked = pickCostTarget(
                effect, source, candidates,
                `${getCard((source ?? inst).cardId).name}：破壊する自分のネクサスを選んでください`,
                (cs) => cs[0]!,
            )
            if (picked === "pending") return "pending"
            if (picked === undefined) return false
            return destroyNexus(state, ownerPid, picked.instanceId)
        }
        if (effect.cost?.discardUnderOne) {
            // BS19-X02：下のカード1枚の破棄がコスト。場を離れずに残るので下のカードはそのまま
            if (trashUnderCards(state, ownerPid, inst, 1) < 1) return false
            return true
        }
        return true
    }

    // 確認を出す前の成立判定（副作用なし）。払えない理由を返し、払えるか判定できない（デッキの上の結果次第など）なら null。
    // applyCost の不成立条件と揃えること（2026-10-02 ユーザー確認：聞く前に払えないなら確認を出さない）
    const reviveCostReason = (
        effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>,
        source?: CardInstance,
    ): string | null => {
        const cost = effect.cost
        if (!cost) return null
        if (cost.exhaustSelf) return !source || source.isRested ? "疲労させられない" : null
        if ((cost.millSelfCount !== undefined || cost.millSelfOneMatching) && millAllowed(state, { pid: ownerPid, count: cost.millSelfCount ?? 1, actorPid: ownerPid, sourceType: costSourceType(source) }) < (cost.millSelfCount ?? 1)) return "デッキを破棄できない"
        if (cost.millSelfCount !== undefined) return player.deck.length < cost.millSelfCount ? "デッキが足りない" : null
        if (cost.sourceCoresToTrash !== undefined) return !source || source.cores < cost.sourceCoresToTrash ? "コアが足りない" : null
        if (cost.oneCoreToVoid) return inst.cores <= 1 ? "コアが足りない" : null
        if (cost.oneCoreToTrash) return inst.cores <= 0 ? "コアが足りない" : null
        if (cost.reserveOneToTrash) return player.reserve <= 0 ? "リザーブにコアがない" : null
        if (cost.fieldOrReserveOneToTrash) {
            const any = player.reserve > 0 || inst.cores >= 2 || [...player.field.spirits, ...player.field.nexuses].some((i) => i.instanceId !== inst.instanceId && i.cores > 0)
            return any ? null : "トラッシュへ置けるコアがない"
        }
        if (cost.handDiscardOne) {
            if (!canDiscardHand(state, ownerPid)) return "手札を破棄できない"
            const type = cost.handDiscardCardType
            const has = type !== undefined ? player.hand.some((id) => getCard(id).type === type) : player.hand.length > 0
            return has ? null : "手札に破棄できるカードがない"
        }
        if (cost.millSelfOneMatching) return player.deck.length === 0 ? "デッキがない" : null
        if (cost.exhaustOwnFamilyOne || cost.exhaustOwnSameFamilyOne || cost.exhaustOwnOne) {
            const has = exhaustCostCandidates(effect).length > 0
            return has ? null : "疲労させられる自分のスピリットがいない"
        }
        if (cost.destroyOwnNexusOne) return player.field.nexuses.length === 0 ? "破壊できる自分のネクサスがない" : null
        if (cost.ownLifeOneToVoid || cost.ownLifeOneToReserve) return player.life <= 0 || !canPayLife(state, lifeCostQuery(ownerPid, 1, inst)) ? "ライフを減らせない" : null
        if (cost.opponentLifeOneToTrash) return state.players[opponentOf(ownerPid)].life <= 0 || !canPayLife(state, lifeCostQuery(opponentOf(ownerPid), 1, inst, ownerPid)) ? "相手のライフを減らせない" : null
        if (cost.discardOwnBurst) return player.burst === null ? "破棄できるバーストがセットされていない" : null
        if (cost.discardUnderOne) return (inst.underCards?.length ?? 0) < 1 ? "下のカードがない" : null
        if (cost.exhaustOwnNexusOne) return !canExhaustNexus(state, ownerPid) || player.field.nexuses.every((n) => n.isRested) ? "疲労させられる自分のネクサスがない" : null
        return null
    }
    // 払えないなら確認を出さず不発にする。下見（probe）ではログを出さない。true＝不発として扱う
    const skipUnpayable = (effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>, source: CardInstance, sourceName: string): boolean => {
        if (effect.cost === undefined) return false
        const reason = reviveCostReason(effect, source)
        if (reason === null) return false
        if (!probe) log(state, unpayableLine(sourceName, reason))
        return true
    }

    // oncePerTurn（BS06暴かれた墓石Lv2）：発生源（sourceInst）が同一ターンに既に復活を成立させていたら不発
    const oncePerTurnBlocked = (
        effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>,
        sourceInst: CardInstance,
    ): boolean => effect.oncePerTurn === true && sourceInst.reviveOnDestroyUsedTurn === state.turn
    const markOncePerTurn = (
        effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>,
        sourceInst: CardInstance,
    ): void => {
        if (effect.oncePerTurn) sourceInst.reviveOnDestroyUsedTurn = state.turn
    }

    // 復活時の状態反映：{rested}は場に留まったまま状態を変更、{toHand}は場から除去して手札へ戻す
    // （コアは持ち主のリザーブへ。トラッシュは経由しない。深緑の樹海Lv2）
    const applyRevived = (revived: Revived): void => {
        // 復活が成立した＝**破壊待機状態が解除された**（TIMING_CHART.md §1.5）。
        // 印を消さないと、以後この個体は「疲労も回復もできず、破壊もされない」ままになる
        delete inst.pendingDestruction
        if ("toBurst" in revived) {
            // BS15-004ハンゾウ・シノビ・ドラゴン：トラッシュへ置かれる代わりに持ち主のバーストエリアへ
            // （placeBurstと同じ規則：既にセットしていたバーストはトラッシュへ押し出される。
            // EffectModulesからのimportは循環参照になるためここでは直接書く）
            const idx = player.field.spirits.findIndex((s) => s.instanceId === inst.instanceId)
            if (idx !== -1) player.field.spirits.splice(idx, 1)
            trashUnderCards(state, ownerPid, inst) // 場を離れるので下のカードは破棄（BS19-X02）
            soulCoreLeavesField(player, inst) // 案B-inside: 先に[ソウルコア]退避
            player.reserve += inst.cores
            detachBravesOnLeave(state, ownerPid, inst)
            if (player.burst !== null) {
                player.trashCards.push(player.burst)
            }
            player.burst = inst.cardId
            player.burstSet = true
        } else if ("toHand" in revived || "handOrDeckTop" in revived) {
            const idx = player.field.spirits.findIndex((s) => s.instanceId === inst.instanceId)
            if (idx !== -1) player.field.spirits.splice(idx, 1)
            trashUnderCards(state, ownerPid, inst) // 場を離れるので下のカードは破棄（BS19-X02）
            soulCoreLeavesField(player, inst) // 案B-inside: 先に[ソウルコア]退避
            player.reserve += inst.cores
            // handOrDeckTop の対話モードは行き先が決まるまでどのゾーンにも入れない（手札を経由すると手札が増えた誘発が起きる）。
            // 破壊処理の途中では中断できないので、確認は handleAction の末尾で出す
            if ("handOrDeckTop" in revived && handGainDenial(state, { pid: ownerPid, from: "field", cause: "effect" })) {
                player.deck.unshift(inst.cardId)
                log(state, `${player.name}の${getCard(inst.cardId).name}は、手札が増やせないためデッキの上に置かれた。`)
            } else if ("handOrDeckTop" in revived && state.interactiveTargets) {
                ;(state.pendingReviveDestinations ??= []).push({ pid: ownerPid, cardId: inst.cardId })
            } else {
                player.hand.push(inst.cardId)
                notifyHandGained(state, ownerPid, 1)
            }
            // 器AT：braveStay指定時は、通常の「残す」確認（コア支払い）を経ずに無償・強制で残す
            if (revived.braveStay !== undefined) {
                detachBravesOnLeaveFree(state, ownerPid, inst, revived.braveStay === "rested")
            } else {
                // 合体していたブレイヴを外す（§6.1.1。コアを移した後。§6.3.1）。残さないなら手札へ（§6.3.2。行き先を後で選ぶ handOrDeckTop はトラッシュのまま）
                detachBravesOnLeave(state, ownerPid, inst, false, "toHand" in revived ? "hand" : "trash")
            }
        } else {
            stayOnFieldRevived(state, ownerPid, inst, revived.rested)
        }
    }

    const revivedLabel = (revived: Revived): string =>
        "toBurst" in revived ? "バーストとしてセットされた" : "toHand" in revived || "handOrDeckTop" in revived ? "手札に戻った" : `${revived.rested ? "疲労" : "回復"}状態で自分のフィールドに戻った`

    // 持ち主のフィールド（スピリット）に指定カード名を持つ個体が1体以上いるか
    // （BS05プリンセス・スノーホワイト：自分のフィールドに[ドワッフー・セブン]がいるとき）
    const matchesRequireOwnFieldHasName = (name?: string): boolean => {
        if (name === undefined) return true
        return player.field.spirits.some((s) => getCard(s.cardId).name === name)
    }

    // 発生源の持ち主から見た相手フィールドのシンボル色数（重複除く）がこの値以下か
    // （BS06夢中漂う桃幻郷Lv2：相手フィールドにシンボルが1色しかない間）
    const matchesReviveCondition = (
        condition?: { opponentFieldSymbolColorsAtMost: number } | { ownBurstSet: boolean } | { ownFieldOnlyColor: Color; spiritsOnly?: true } | { ownHandAtLeast: number } | { ownSpiritMatches: ResolvedTargetFilter },
    ): boolean => {
        if (!condition) return true
        if ("ownSpiritMatches" in condition) return player.field.spirits.some((s) => matchesTarget(state, ownerPid, s, condition.ownSpiritMatches, inst.instanceId))
        if ("ownHandAtLeast" in condition) return state.players[ownerPid].hand.length >= condition.ownHandAtLeast
        if ("ownBurstSet" in condition) return (player.burst !== null) === condition.ownBurstSet
        if ("ownFieldOnlyColor" in condition) return ownFieldOnlyColor(state, ownerPid, condition.ownFieldOnlyColor, condition.spiritsOnly)
        const oppColors = ownFieldSymbolColors(state, opponentOf(ownerPid))
        return oppColors.size <= condition.opponentFieldSymbolColorsAtMost
    }

    const tryEffect = (effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>, sourceName: string): boolean => {
        if (forced && effect.id !== forced.effectId) return false
        if (!effectActiveAtLevel(effect.levels, level)) return false
        if ("toHand" in effect.revived && handGainDenial(state, { pid: ownerPid, from: "field", cause: "effect" })) return false // 手札へ戻れないなら復活しない＝通常どおり破壊される
        if (!matchesTarget(state, ownerPid, inst, effect.filter, inst.instanceId)) return false
        if (!matchesRequireOwnFieldHasName(effect.requireOwnFieldHasName)) return false
        if (!matchesReviveCondition(effect.condition)) return false
        if (!matchesWhen(effect.when)) return false
        if (!matchesPhaseTurn(effect.phaseTurn)) return false
        if (oncePerTurnBlocked(effect, inst)) return false
        // 「〜できる」＝任意（optional）は、実対戦では持ち主に確認してから確定させる。
        // allowSuspend（destroySpirits のバッチ経由）なら**その場で**確認を出す。
        // それ以外の呼び出し元はまだ中断を受け止められないので、従来どおり保留へ積む
        // （移行の途中。残りの呼び出し元は docs/design/RESUME_STACK.md §7）
        // collect：条件を満たしたのでここで拾う。適用はせず、次のエントリも見に行く（false を返す）
        if (collect) {
            collect.push({ effectId: effect.id, sourceName })
            return false
        }
        if ((effect.optional || effect.cost !== undefined) && state.interactiveTargets && !forced?.skipConfirm) {
            if (skipUnpayable(effect, inst, sourceName)) return false
            if (probe) return true // 下見：ここで確認が出る
            if (allowSuspend) {
                suspendReviveConfirm(state, ownerPid, inst, effect.id, inst.instanceId, context)
            } else {
                queueReviveConfirm(state, ownerPid, inst, effect.id, inst.instanceId, context)
            }
            return true
        }
        // 任意でない復活（＝確認を出さずに確定する）。"any" は復活しうるので true、
        // "confirm" は確認が出ないので次のエントリを見に行く
        if (probe) return probe === "any"
        const paid = applyCost(effect, inst)
        if (paid === "pending") return true // コストの対象の選択待ち（applyReviveCostPick が確定させる）
        if (!paid) return false
        markOncePerTurn(effect, inst)
        const name = getCard(inst.cardId).name
        // BS15-030愛の女神ロヴンLv2：復活成立とセットで、場を離れる前にボイドからコアをリザーブへ置く
        if (effect.alsoVoidCoreToReserve) {
            const placed = coreGainBlocked(state, "void", "reserve") ? 0 : takeCoreGainAllowance(state, ownerPid, getCard(inst.cardId).type, "void", "reserve", effect.alsoVoidCoreToReserve)
            player.reserve += placed
            log(state, `${sourceName}：ボイドからコア${placed}個を${player.name}のリザーブに置いた。`)
        }
        // BS07ブラックリチュアル：「破壊時効果を発揮した自分のスピリットは手札に戻る」。
        // 既定では復活が成立すると破壊時効果は発揮されないので、場に留める（手札へ戻す）前に先に発揮させる
        noteCoverage(effect, "reviveOnDestroy")
        applyRevived(effect.revived)
        log(
            state,
            `${player.name}の${name}は、${sourceName}の効果で破壊される代わりに${revivedLabel(effect.revived)}。`,
        )
        // then（BS19-X05「フィールドに残り、1枚ドローする」）：復活の直後に解決する
        if (effect.then) resolveAction(state, ownerPid, inst, effect.then)
        return true
    }

    // self由来（inst自身が持つ reviveOnDestroy）
    for (const effect of getCard(inst.cardId).effects) {
        if (effect.kind !== "reviveOnDestroy") continue
        if (effect.scope !== "self") continue
        // スピリットの【合体時】：合体していなければ働かない（ブレイヴ側の合体時は下のホスト経由の走査が持つ）
        if (effect.whileCombined && getCard(inst.cardId).type !== "brave" && !state.players[ownerPid].field.combinedBraves.some((b) => hostsOf(state.players[ownerPid], b).some((h) => h.instanceId === inst.instanceId))) continue
        if (tryEffect(effect, getCard(inst.cardId).name)) return true
    }

    // 合体中ブレイヴの scope:"self" + whileCombined 由来（BS12-052デス・ヘイズ：
    // 合体しているホスト＝instが破壊されるとき、ブレイヴ自身が持つ「このスピリットは戻る」を代わりに適用する）。
    // effectSources() は合体中ブレイヴも含むが、あちらは scope:"ownAll"（複数対象への一般則）用の走査。
    // scope:"self" はカードの持ち主＝ブレイヴ自身を指すため、ホストと一致するかをここで別途見る。
    // レベルはブレイヴ自身のレベルで判定し（ホストのlevelではない）、tryEffectの内部再判定はlevels:nullで無効化する
    for (const brave of state.players[ownerPid].field.combinedBraves) {
        if (!hostsOf(state.players[ownerPid], brave).some((h) => h.instanceId === inst.instanceId)) continue
        const braveLevel = currentLevel(brave).level
        for (const effect of getCard(brave.cardId).effects) {
            if (effect.kind !== "reviveOnDestroy") continue
            if (effect.scope !== "self" || effect.whileCombined !== true) continue
            if (!effectActiveAtLevel(effect.levels, braveLevel)) continue
            if (tryEffect({ ...effect, levels: null }, getCard(brave.cardId).name)) return true
        }
    }

    // ownAll由来（持ち主フィールドの発生源から）。levelsは発生源のレベル条件のため、
    // instのlevelを見るtryEffectは使わず発生源のsourceLevelで判定する。
    // effectSources() でこのターンだけの仮想発生源（マジックが貸した継続効果。BS05リアニメイト）も含める
    const sources = effectSources(state, ownerPid)
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "reviveOnDestroy") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (forced && effect.id !== forced.effectId) continue
            if (effect.scope !== "ownAll" && effect.scope !== "chosenInstance") continue
            // chosenInstance（BS21-077）：targetChoiceLendThisTurn で選んだ1体だけ
            if (effect.scope === "chosenInstance" && source.lentChoiceInstanceId !== inst.instanceId) continue
            if (!entryActive(state, ownerPid, source, effect, sourceLevel)) continue
            if (!matchesTarget(state, ownerPid, inst, effect.filter, source.instanceId)) continue
            // pickMany：グループの先頭で戻す体が選ばれていれば、選ばれた体だけが確認・コストなしで戻る
            const pickedBodies = effect.pickMany ? state.destroyGroup?.pickMany?.[`${source.instanceId}:${effect.id}`] : undefined
            if (pickedBodies !== undefined && !pickedBodies.includes(inst.instanceId)) continue
            if (effect.keywordFilter && ![effect.keywordFilter].flat().some((k) => spiritHasKeyword(state, ownerPid, inst, k))) continue
            // BS03エスケープルート：カード静的な family 配列の要素数が指定数以上のスピリットのみ対象
            if (effect.minFamilies !== undefined && getCard(inst.cardId).family.length < effect.minFamilies) continue
            if (!matchesReviveCondition(effect.condition)) continue
            if (!matchesWhen(effect.when)) continue
            if (!matchesPhaseTurn(effect.phaseTurn)) continue
            if (oncePerTurnBlocked(effect, source)) continue
            // collect：条件を満たしたのでここで拾う。適用はせず、次の発生源も見に行く
            if (collect) {
                collect.push({
                    effectId: effect.id,
                    sourceName: getCard(source.cardId).name,
                    sourceInstanceId: source.instanceId,
                    ...(effect.perDestroyed || pickedBodies !== undefined ? { perDestroyed: true as const } : {}),
                    ...(effect.pickMany ? { pickMany: true as const } : {}),
                })
                continue
            }
            // optional は self 由来と同じ扱い（発生源は source 側＝oncePerTurn の記録先）。
            // allowSuspend が渡っていれば**その場で**確認を出す（渡っていなければ従来どおり保留へ）
            if ((effect.optional || effect.cost !== undefined) && state.interactiveTargets && !forced?.skipConfirm && pickedBodies === undefined) {
                if (skipUnpayable(effect, source, getCard(source.cardId).name)) continue
                if (probe) return true // 下見：ここで確認が出る
                if (allowSuspend) {
                    suspendReviveConfirm(state, ownerPid, inst, effect.id, source.instanceId, context)
                } else {
                    queueReviveConfirm(state, ownerPid, inst, effect.id, source.instanceId, context)
                }
                return true
            }
            // 任意でない復活。"any" は復活しうるので true、"confirm" は次の発生源を見に行く
            if (probe === "any") return true
            if (probe) continue
            const paid = pickedBodies !== undefined ? true : applyCost(effect, source)
            if (paid === "pending") return true // コストの対象の選択待ち（applyReviveCostPick が確定させる）
            if (!paid) continue
            markOncePerTurn(effect, source)
            const name = getCard(inst.cardId).name
            if (effect.alsoVoidCoreToReserve) {
                const placed = coreGainBlocked(state, "void", "reserve") ? 0 : takeCoreGainAllowance(state, ownerPid, getCard(source.cardId).type, "void", "reserve", effect.alsoVoidCoreToReserve)
                player.reserve += placed
                log(state, `${getCard(source.cardId).name}：ボイドからコア${placed}個を${player.name}のリザーブに置いた。`)
            }
            // BS07ブラックリチュアル：場に留める（手札へ戻す）前に破壊時効果を先に発揮させる
            noteCoverage(effect, "reviveOnDestroy")
            applyRevived(effect.revived)
            log(
                state,
                `${player.name}の${name}は、${getCard(source.cardId).name}の効果で破壊される代わりに${revivedLabel(effect.revived)}。`,
            )
            // then は scope:"self\" と同じく復活の直後に解決する（SD15-X01「手札に戻る。その後、1枚ドローする」）
            if (effect.then) resolveAction(state, ownerPid, inst, effect.then)
            return true
        }
    }

    return false
}
