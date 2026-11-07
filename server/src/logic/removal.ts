// スピリット／ネクサスの除去。EffectModules.ts / triggers.ts と相互 import の関係にある（破壊は誘発を発火し、誘発は破壊を呼ぶ）。
// CommonJS の循環 require で安全に動く（関数宣言はホイストされ、呼び出しは対戦処理中）。EffectModules.ts がここの export を再エクスポートしている
import { bounceDenial, reviveOnReturnStay } from "./bounceGate"
import { entryActive } from "../../../shared/rules/effectStop"
import { trashCardEffectsDisabled, zoneSpiritEffectsDisabled } from "../../../shared/rules"
import { coreGainBlocked, takeCoreGainAllowance } from "./coreGainCap"
import { millDeck } from "./zones/mill"
import { kyokaBonus } from "./keywords/kyoka"
import { noteCoverage } from "../../../shared/coverage"
import { canPayFreeSummonSurcharge } from "./summonSurcharge"
import { randomUUID } from "node:crypto"
import type { CardInstance, CardType, Color, EffectAction, PendingChoice, DestroyContext, GameState, PlayerId, ResumeFrame } from "../type"
import { currentLevel, draw, findInstanceAnywhere, getCard, log, instMinLevelCores, minLevelCores, opponentOf, pushResumeFrames, requestTrashReturn, suspend } from "./GameState"
import { wouldDeplete, soulCoreOnInstance, moveSoulCore, soulCoreLeavesField } from "./soulCore"
import { getAllFamilies, resolveAction } from "./EffectModules"
import { destroyDenial } from "./destroyGate"
import { coreRemovalAllowed } from "./coreGate"

import { fireBurstOnEvent } from "./keywords/burst"
import { hasGrantedTrigger, notifySpiritCoresRemovedByOpponent } from "./triggers"
import { fireFieldEventTriggers, notifyHandGained } from "./fieldEventTriggers"
import type { FieldEventExtraItem } from "./fieldEventTriggers"
import type { KeywordInfo } from "../../../shared/rules"
import { detachBravesOnLeave, flushBraveKeeps } from "./brave"
import { separateBravesOverLimit } from "./braveConditionGate"
import { recordDestroyedCount, recordLeftCost } from "./record"
import { isOnceNameUsed } from "./oncePerTurn"
import { leavesNothingBehind } from "./keywords/bunshin"
import { isTokenCard } from "../../../shared/cardDb"
import { trashUnderCards } from "./zones/underCards"
import { collectReviveEntries, destroyedCostsOf, destroyedFamiliesOf, fushiCandidates, tryNexusReviveOnDestroy, wouldAskReviveConfirm } from "./revive"
import {
    activeConstraints,
    auraAmount,
    auraAppliesTo,
    checkAuraCondition,
    costCantAct,
    countAuraCounter,
    hasDestroyAsMaxLevelGrant,
    coresToOpponentReserveGoToTrash,
    bravesOf,
    countSpiritsWeighted,
    countSymbols,
    effectActiveAtLevel,
    effectiveBp,
    effectSources,
    hasArmorAgainst,
    hasHeavyArmorAgainst,
    hasContinuousKeywordGrant,
    continuousKeywordGrantCount,
    handSizeOf,
    hasFullEffectImmunity,
    hasGlobalConstraint,
    hasMagicImmunity,
    hasBounceImmunity,
    hasKeyword,
    spiritHasKeywordOrLabel,
    instanceSymbolCount,
    instAllCosts,
    instBaseCost,
    instColors,
    instHasColor,
    instHasCost,
    isUntargetableByOpponent,
    instIsVanilla,
    isVirtualSource,
    cardNameContains,
    matchesTarget,
    KEYWORDS,
    matchesFamilyFilter,
    spiritHasFamily,
    spiritHasKeyword,
    timedPlayerRules,
    timedBattleContents,
    timedContentsFor,
} from "../../../shared/rules"

export type { KeywordInfo }
export {
    activeConstraints,
    auraAmount,
    auraAppliesTo,
    checkAuraCondition,
    costCantAct,
    countAuraCounter,
    countSpiritsWeighted,
    countSymbols,
    effectActiveAtLevel,
    effectiveBp,
    effectSources,
    hasArmorAgainst,
    hasHeavyArmorAgainst,
    hasContinuousKeywordGrant,
    continuousKeywordGrantCount,
    handSizeOf,
    hasFullEffectImmunity,
    hasGlobalConstraint,
    hasMagicImmunity,
    hasBounceImmunity,
    hasKeyword,
    spiritHasKeywordOrLabel,
    instanceSymbolCount,
    instColors,
    instHasColor,
    instHasCost,
    isUntargetableByOpponent,
    isVirtualSource,
    cardNameContains,
    matchesTarget,
    KEYWORDS,
    matchesFamilyFilter,
    spiritHasFamily,
    spiritHasKeyword,
}

import {
    summonFreeFromTrashIndex,
    checkExhaustOnCoreChange,
    destroyedCoresGoToTrash,
    emitEvent,
    isResisted,
    placeCoresOnSpirit,
    summonFreeFromHandIndex,
} from "./EffectModules"

export function isInCurrentBattle(state: GameState, inst: CardInstance): boolean {
    if (!state.battle) return false
    return (
        inst.instanceId === state.battle.attackerInstanceId ||
        inst.instanceId === state.battle.blockerInstanceId
    )
}

// ---- スピリット／ネクサスの除去 ----

// destroy アクション1回ぶんで破壊待機に入れたカードの記録（if の cond.last・lastMoved/lastCost が読む）。
// destroyContext は効果の解決ごとに作られるので、同じオブジェクトの破壊だけを数える（破壊時の誘発が別に破壊したものは混ざらない）
let destroyRecorder: { context: DestroyContext; cardIds: string[] } | null = null
export function recordDestroysOf(context: DestroyContext, run: () => void): string[] {
    const outer = destroyRecorder
    const rec = { context, cardIds: [] as string[] }
    destroyRecorder = rec
    try {
        run()
    } finally {
        destroyRecorder = outer
    }
    return rec.cardIds
}

export function destroySpirit(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
    cause: "destroy" | "deplete" = "destroy",
    context?: DestroyContext,
    // skipRevive: 復活の確認で「復活させない」が選ばれたあとの破壊。
    // 再び復活判定に入って無限に確認を出すのを防ぐ
    //
    // allowSuspend: 「フィールドに残る」の確認を**その場で**出してよい呼び出し元の印。
    // これは移行の途中経過ではなく、**①と②の使い分けそのもの**（RESUME_STACK.md §7）:
    //   ① 「破壊する」＋別効果の「破壊したとき」  → その場で聞く（＝allowSuspend を渡す）
    //   ② 「破壊する"ことで"〜する」＝同時発揮     → 恩恵の後に聞く（＝渡さずに
    //      pendingReviveConfirms へ積み、アクションの末尾で確認する）
    // どちらも必要なので、片方を消してはいけない
    // 【不死】のように「破壊時の誘発」として同じ待機の窓の中で解決したいものがあるときに使う
    // （docs/design/TIMING_CHART.md §1.5）
    // suppressOnDestroy: この破壊では『このスピリットの破壊時』（onDestroy）トリガーを発揮させない。
    // 「自分のスピリットが破壊されたとき」フィールドイベント（fireOwnSpiritDestroyed）は通常どおり発火する
    // （効果文が名指ししているのは「このスピリットの破壊時」だけなので、他カードが見る一般則イベントは止めない）
    // includeFushi: この破壊で誘発する【不死】も**同じ列**に並べる（docs/design/TIMING_CHART.md）。
    // 既定は有効（2026-10-16 ユーザー確認：【不死】は破壊なら手段・体数を問わず誘発する）。消滅は cause で除かれる
    options?: { skipRevive?: true; allowSuspend?: true; suppressOnDestroy?: true; includeFushi?: boolean },
    // 戻り値：**実際に破壊できたか**。false は「場にいなかった」か
    // 「破壊されるかわりにフィールドに残った（復活）」。
    // 「この効果で破壊したスピリット1体につき」を数える効果が参照する（RESUME_STACK.md §7）
): boolean {
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex(
        (s) => s.instanceId === instanceId,
    )
    if (index === -1) return false
    const inst = player.field.spirits[index]
    if (!inst) return false
    // 破壊待機状態のカードは、**そこからさらに破壊されることはない**（TIMING_CHART.md §1.5）。
    // ただし skipRevive（復活を断ったあとの同じ破壊の続き）は通す
    if (inst.pendingDestruction && !options?.skipRevive) return false
    const master = getCard(inst.cardId)

    // 相手のスピリット/ブレイヴ/マジックの効果でコアが0個になったときは、維持コア割れ（deplete＝消滅・onDestroy不発火）ではなく
    // 最高Lvとして破壊される（onDestroy誘発あり）。誰の効果の解決中かは currentEffectSource で読む（EFFECT_SOURCE_CONTEXT.md）
    if (cause === "deplete" && inst.cores === 0) {
        const src = state.currentEffectSource
        const bySpiritBraveOrMagic = src?.type === "spirit" || src?.type === "brave" || src?.type === "magic"
        if (src !== undefined && src.pid !== ownerPid && bySpiritBraveOrMagic && hasDestroyAsMaxLevelGrant(state, ownerPid, inst)) {
            inst.destroyAsMaxLevel = true
            cause = "destroy"
        }
    }

    // ＞６：まず**破壊待機状態**にする。カードはフィールドに残り、コアも乗ったまま。
    // 「フィールドに残る」は、この待機状態を解除する効果として働く（applyRevived が印を消す）
    inst.pendingDestruction = true
    // 消滅（維持コア割れ）のときだけ別の印を立てる。消滅したカードのシンボルは軽減に使えない
    // （破壊待機は使える。バトスピ Wiki「わかりづらいルール」。2026-09-16）。
    // 前回の待機から残った印を拾わないよう、破壊のたびに付け直す
    if (cause === "deplete") inst.pendingVanish = true
    else delete inst.pendingVanish
    if (cause === "deplete" && state.currentEffectSource !== undefined && state.currentEffectSource.pid !== ownerPid) inst.pendingVanishByOpponent = true
    else delete inst.pendingVanishByOpponent
    inst.coresAtDestruction = inst.cores
    // ⚠️ 復活チェックは**ここではやらない**。「フィールドに残る」は破壊を無効にするのではなく
    // 「トラッシュに置かれる代わりに場へ戻る」効果なので、**破壊で誘発した効果の列の1項目**として
    // 並べ、ターンプレイヤーが選んだ順で解決する
    // （2026-09-08 ユーザー確認。TIMING_CHART.md「『フィールドに残る／戻る』と『破壊時』」）。
    // 中断・再開の経路もすべて commitPendingDestruction を通るので、そこ1か所で拾える
    if (cause === "destroy" && !options?.skipRevive) {
        if (destroyRecorder !== null && context !== undefined && destroyRecorder.context === context) {
            destroyRecorder.cardIds.push(inst.cardId)
            recordLeftCost(state, inst.cardId, instBaseCost(inst))
        }
        if (context !== undefined) inst.pendingDestroyContext = context
        if (options?.allowSuspend === true) inst.pendingDestroyAllowSuspend = true
    } else {
        // 消滅（維持コア割れ）と skipRevive のときは復活しない。控えを残さないことで印にする
        delete inst.pendingDestroyContext
        delete inst.pendingDestroyAllowSuspend
        inst.skipReviveOnCommit = true
    }

    log(
        state,
        `${player.name}の${master.name}は${cause === "destroy" ? "破壊" : "消滅"}された。`,
    )
    if (cause === "destroy" && context?.battle !== undefined) state.ownSpiritDestroyedByBattleThisTurn = { ...(state.ownSpiritDestroyedByBattleThisTurn ?? {}), [ownerPid]: true }
    if (cause === "destroy") state.ownSpiritDestroyedThisTurn = { ...(state.ownSpiritDestroyedThisTurn ?? {}), [ownerPid]: true }
    else state.spiritVanishedThisTurn = { ...(state.spiritVanishedThisTurn ?? {}), [ownerPid]: true }
    // 相手の効果での除去だけを記録（バトルや維持コア割れは currentEffectSource が立っていない／自分の効果ではない）
    const src = state.currentEffectSource
    if (src !== undefined && src.pid !== ownerPid && context?.battle === undefined) {
        const kind = cause === "destroy" ? "destroy" : "vanish"
        const smKind = src.type === "spirit" || src.type === "magic" ? [`sm:${kind}`] : []
        state.oppSpiritRemovedByEffectThisTurn = { ...(state.oppSpiritRemovedByEffectThisTurn ?? {}), [src.pid]: [...(state.oppSpiritRemovedByEffectThisTurn?.[src.pid] ?? []), kind, ...smKind] }
    } else if (src !== undefined && src.pid === ownerPid && cause === "destroy" && context?.battle === undefined) {
        state.ownSpiritDestroyedByOwnEffectColors = { ...(state.ownSpiritDestroyedByOwnEffectColors ?? {}), [ownerPid]: [...(state.ownSpiritDestroyedByOwnEffectColors?.[ownerPid] ?? []), ...instColors(inst)] }
        if (getCard(inst.cardId).effects.some((e) => e.kind === "triggered" && e.trigger === "onDestroy")) state.ownSpiritWithOnDestroyDestroyedByOwnEffect = { ...(state.ownSpiritWithOnDestroyDestroyedByOwnEffect ?? {}), [ownerPid]: true }
    }
    emitEvent(state, { type: "destroy", pid: ownerPid, cardName: master.name, ...(cause === "deplete" ? { vanish: true as const } : {}) })

    // 破壊された時点でまだバトルが生きているので、アタッカー側だったかをここで確定させる
    // （clearBattle 後には判定できない。attackerOnly の判定に使う）
    const wasAttacker = state.battle?.attackerInstanceId === inst.instanceId
    const byBattle = context?.battle !== undefined
    // 「相手のスピリットの効果で破壊されたとき」（byOpponentSpiritEffectOnly）の判定材料。
    // バトルの BP 比較は sourceType:"spirit" で記録されるが、スピリットの効果ではない
    const bySpiritEffect = !byBattle && context?.sourceType === "spirit" && context?.sourcePid !== undefined && context.sourcePid !== ownerPid
    const sourceInstanceId = context?.sourceInstanceId
    // 「自分のスピリットが相手によって破壊されたとき」（byOpponentEffectOnly）：
    // バトルのBP比較で敗れた場合も、相手のスピリット/ネクサス/マジックの効果による場合も含める
    // 強制ブロックで同じ陣営どうしが戦ったバトル（context.sourcePid が持ち主自身）は相手による破壊ではない
    const byOpponentEffect = byOpponentEffectOf(context, ownerPid) || (byBattle && context?.sourcePid !== ownerPid)
    // 破壊後バースト用の控え。BP は破壊直前（まだ場にいてコアも乗ったまま）のこの時点で確定させる
    inst.pendingDestroyBurstInfo = { byOpponentEffect, bp: effectiveBp(state, ownerPid, inst), ...(context?.sourceType !== undefined ? { sourceType: context.sourceType } : {}) }

    // ＞６-1：破壊時の誘発。**この間、破壊された個体はまだフィールドにいる**
    // （数・シンボル・効果の対象・【転召】の生贄に数えられる）。
    //
    // この破壊で誘発するものは**すべて1つの列**に並べ、ターンプレイヤーが1つずつ選んで解決する
    // （docs/design/TIMING_CHART.md）。列に入るのは
    //   ①破壊されたカード自身の『破壊時』（カードで1グループ）
    //   ②他のカードの「〜が破壊されたとき」（fireOwnSpiritDestroyed が集める）
    //   ③「フィールドに残る／戻る」（発生源ごとに1グループ）
    // ③が解決した時点でこの破壊は無かったことになり、列の残りは
    // requiresPendingDestructionOf のガードで空振りする
    const extraItems: FieldEventExtraItem[] = []
    if (cause === "destroy" && !options?.suppressOnDestroy && !context?.suppressOnDestroy && hasOwnTrigger(state, ownerPid, inst, "onDestroy")) {
        extraItems.push({
            key: `selfOnDestroy:${inst.instanceId}`,
            label: `${player.name}の${master.name}（破壊時）`,
            action: { type: "resolveOwnDestroyTriggers", instanceId: inst.instanceId, ...(byOpponentEffect ? { byOpponent: true } : {}) },
            selfInstanceId: inst.instanceId,
            actorPid: ownerPid,
            requiresPendingDestructionOf: inst.instanceId,
            first: true,
        })
    }
    // 「フィールドに残る」で生き残っても勝敗は変わらないので発揮する（requiresPendingDestructionOf を付けない。TIMING_CHART の勝敗の行）
    if (cause === "destroy" && context?.battleLoser && hasOwnTrigger(state, ownerPid, inst, "onBattleLose")) {
        extraItems.push({
            key: `selfBattleLose:${inst.instanceId}`,
            label: `${player.name}の${master.name}（バトルで破壊されたとき）`,
            action: { type: "resolveOwnBattleLoseTriggers", instanceId: inst.instanceId },
            selfInstanceId: inst.instanceId,
            actorPid: ownerPid,
        })
    }
    if (cause === "destroy" && !inst.skipReviveOnCommit) {
        for (const entry of collectReviveEntries(state, ownerPid, inst, context)) {
            extraItems.push({
                key: `revive:${entry.effectId}`,
                label: `${entry.sourceName}（フィールドに残る）`,
                action: { type: "applyReviveOnDestroy", instanceId: inst.instanceId, effectId: entry.effectId },
                selfInstanceId: inst.instanceId,
                actorPid: ownerPid,
                requiresPendingDestructionOf: inst.instanceId,
            })
        }
    }
    // 【不死】：トラッシュの【不死】持ちも**同じ列**に並べる。先に「フィールドに残る」が解決すると
    // 破壊が無かったことになるので、requiresPendingDestructionOf のガードで自動的に空振りする
    if (cause === "destroy" && options?.includeFushi !== false) {
        for (const trashIndex of fushiCandidates(state, ownerPid, destroyedCostsOf(inst), destroyedFamiliesOf(inst))) {
            const cardId = player.trashCards[trashIndex]
            if (cardId === undefined) continue
            extraItems.push({
                key: `fushi:${cardId}`,
                label: `${getCard(cardId).name}（【不死】）`,
                action: { type: "resolveFushiSummon", pid: ownerPid, cardId },
                selfInstanceId: null,
                actorPid: ownerPid,
                requiresPendingDestructionOf: inst.instanceId,
            })
        }
    }
    // 手札の「自分のスピリットが破壊されたときコストを支払わずに召喚できる」も【不死】と同じ列に並ぶ
    // （2026-11-05ユーザー確認・TIMING_CHART）。byOpponent は BP 比べの敗北も含む（byOpponentEffect の定義どおり）
    if (cause === "destroy") {
        for (let i = 0; i < player.hand.length; i++) {
            const cardId = player.hand[i]
            if (cardId === undefined || zoneSpiritEffectsDisabled(state, cardId)) continue
            const effect = getCard(cardId).effects.find((e) => e.kind === "freeSummonFromHandOnOwnSpiritDestroyed")
            if (!effect || effect.kind !== "freeSummonFromHandOnOwnSpiritDestroyed") continue
            if (effect.byOpponent && !byOpponentEffect) continue
            // この kind の filter は色・コストなど静的な軸だけ。self 相対のBP軸はここでは解決しないので除外する
            if (effect.filter) {
                const { maxBp: _maxBp, minBp: _minBp, exactBp: _exactBp, ...resolvedFilter } = effect.filter
                if (!matchesTarget(state, ownerPid, inst, resolvedFilter, undefined)) continue
            }
            if (!canPayFreeSummonSurcharge(state, ownerPid, getCard(cardId), minLevelCores(getCard(cardId)))) continue
            noteCoverage(effect, "freeSummonFromHandOnOwnSpiritDestroyed")
            extraItems.push({
                key: `handFreeSummonOnDestroy:${ownerPid}:${cardId}`,
                label: `${getCard(cardId).name}（手札からのコスト不払い召喚）`,
                action: { type: "resolveHandFreeSummonOnDestroy", pid: ownerPid, cardId },
                selfInstanceId: null,
                actorPid: ownerPid,
                requiresPendingDestructionOf: inst.instanceId,
            })
        }
    }
    fireOwnSpiritDestroyed(state, ownerPid, inst, byBattle, wasAttacker, bySpiritEffect, byOpponentEffect, sourceInstanceId, extraItems)
    if (state.pendingChoice || state.winner) {
        suspendDestroyCommit(state, ownerPid, inst, 2, byBattle, wasAttacker, bySpiritEffect, byOpponentEffect, sourceInstanceId)
        return true
    }

    commitPendingDestruction(state, ownerPid, inst)
    // 同時破壊グループの外（単体の直接呼び出し）なら、破壊後バーストはここで確定させてよい。
    // グループの中（destroyTargetsBatchのループ経由）は他のメンバーの確定を待つため、
    // ここでは発火させず destroyTargetsBatch/resumeDestroyBatch の完了時に回す（TIMING_CHART.md ＞６）
    if (!state.destroyGroup) fireQueuedDestroyBursts(state)
    return true
}

// 破壊時の誘発が中断した／勝敗が決まったときに、残り（フィールドイベント誘発と破壊の確定）を
// 再開フレームへ預ける。**破壊待機状態のまま**中断するのが要点（TIMING_CHART.md §1.5）
function suspendDestroyCommit(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    step: number,
    byBattle: boolean,
    wasAttacker: boolean,
    bySpiritEffect: boolean,
    byOpponentEffect: boolean,
    sourceInstanceId: string | undefined,
): void {
    if (state.winner) {
        commitPendingDestruction(state, ownerPid, inst)
        return
    }
    // ⚠️ 破壊で誘発した効果の列（triggerBatch）が**この中断で既に積まれている**場合、
    // 破壊の確定はその**あと**に来なければならない。resumeTriggerBatch は
    // 「フレームを積んでから suspend する」ので、suspend が resumeInsertAt を0へ戻したあとに
    // ここ（外側）が積むと、pushResumeFrames では列より**前**に入ってしまい、
    // 誘発を1つも解決しないままトラッシュ行きが確定する（docs/design/RESUME_STACK.md §3）
    const batchAt = state.resumeStack.map((f) => f.kind).lastIndexOf("triggerBatch")
    const commitFrame: ResumeFrame = {
        kind: "destroyCommit",
        pid: ownerPid,
        instanceId: inst.instanceId,
        step,
        byBattle,
        wasAttacker,
        bySpiritEffect,
        byOpponentEffect,
        ...(sourceInstanceId !== undefined ? { sourceInstanceId } : {}),
    }
    const batch = batchAt >= 0 ? state.resumeStack[batchAt] : undefined
    if (batch !== undefined && batch.kind === "triggerBatch") batch.after = commitFrame
    else pushResumeFrames(state, [commitFrame])
}

// kind:"trashReturnOnOwnSpiritDestroyed"。同名は1ターン1回なので戻るのは1枚だけ。
// 「手札に戻せる」は任意なので持ち主に確認する（2026-10-11 ユーザー確認）。ほかの誘発の選択待ちより後に聞く
function returnTrashOnOwnSpiritDestroyed(state: GameState, pid: PlayerId, families: string[]): void {
    const player = state.players[pid]
    for (const cardId of player.trashCards) {
        if (trashCardEffectsDisabled(state, cardId)) continue
        const e = getCard(cardId).effects.find((x) => x.kind === "trashReturnOnOwnSpiritDestroyed")
        if (!e || e.kind !== "trashReturnOnOwnSpiritDestroyed" || !families.includes(e.familyFilter)) continue
        if (isOnceNameUsed(state, pid, cardId, e.id)) continue
        requestTrashReturn(state, pid, cardId, e.id)
        return
    }
}

// 付与された系統も含む（破壊待機中はまだ場にいるので、場を離れる直前の状態を読める。2026-10-31 ユーザー決定）
function grantedFamilies(state: GameState, pid: PlayerId, inst: CardInstance): string[] {
    return getAllFamilies().filter((f) => spiritHasFamily(state, pid, inst, f))
}

// フィールドイベント誘発「自分のスピリットが破壊されたとき」：cause問わず（消滅も含む）持ち主側で発火。
// 色・バニラ・バトル破壊の判定材料を渡し、selfOverride に破壊された個体自身を渡す（maxBpFromSelf が「破壊されたスピリットのBP以下」を参照するため）
function fireOwnSpiritDestroyed(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    byBattle: boolean,
    wasAttacker: boolean,
    bySpiritEffect: boolean,
    byOpponentEffect: boolean,
    sourceInstanceId: string | undefined,
    extraItems?: FieldEventExtraItem[],
): void {
    const master = getCard(inst.cardId)
    // 色・系統は付与込み（破壊待機中でまだ場にいるので、場を離れる直前の状態を読める）
    const colors = instColors(inst)
    const families = grantedFamilies(state, ownerPid, inst)
    fireFieldEventTriggers(state, ownerPid, "ownSpiritDestroyed", { pid: ownerPid, inst }, colors, undefined, undefined, {
        vanilla: instIsVanilla(inst),
        vanishedByOpponent: inst.pendingVanishByOpponent === true,
        byBattle,
        wasAttacker,
        // 破壊直前の実効BPの近似値（既にフィールドを離れていると effectiveBp がオーラ等を欠くことがある）
        destroyedBp: effectiveBp(state, ownerPid, inst),
        bySpiritEffect,
        byOpponentEffect,
        ...(inst.pendingDestroyBurstInfo?.sourceType !== undefined ? { destroySourceType: inst.pendingDestroyBurstInfo.sourceType } : {}),
        ...(sourceInstanceId !== undefined ? { sourceInstanceId } : {}),
        families,
        // instAllCosts：破壊されたスピリットの本来のコストに加え、道化師クランの付与コストも含める
        costs: instAllCosts(inst),
        // extraSources に破壊された個体自身を渡す。effectSources はもう場にいないものを返さないため、
        // これが無いと fieldEvent の selfOnly（「このスピリットが破壊されたとき」）が無言で発火しない
    }, [inst], extraItems, undefined, true) // skipBurst：破壊後バーストはここでは判定しない（commitPendingDestruction が積み、fireQueuedDestroyBursts がトラッシュ行き確定後に発火させる）
    // フィールドイベント誘発「相手のスピリットが破壊されたとき」：破壊された側から見た相手のフィールドで発火する。手段は問わない
    // sameFamilyAsDestroyed が読む橋渡し。同時破壊なら破壊待機の全員の系統
    state.lastOpponentSpiritDestroyedFamilies = state.destroyGroup?.familiesByPid[ownerPid] ?? families
    // 破壊した側（発火する側）の効果による破壊なら、その発生源の種別とカード（「自分のスピリット/マジックの効果で」）。バトルは含まない
    const dctx = inst.pendingDestroyContext
    const ownEffect = !byBattle && dctx?.sourcePid !== undefined && dctx.sourcePid !== ownerPid ? dctx : undefined
    fireFieldEventTriggers(state, opponentOf(ownerPid), "opponentSpiritDestroyed", { pid: ownerPid, inst }, colors, undefined, undefined, {
        byBattle,
        bySpiritEffect,
        byOpponentEffect,
        destroyedBp: effectiveBp(state, ownerPid, inst),
        ...(ownEffect?.sourceType !== undefined ? { ownEffectSourceType: ownEffect.sourceType } : {}),
        ...(ownEffect?.sourceCardId !== undefined ? { ownEffectSourceCardId: ownEffect.sourceCardId } : {}),
        ...(ownEffect?.sourceInstanceId !== undefined ? { ownEffectSourceInstanceId: ownEffect.sourceInstanceId } : {}),
        families,
        costs: instAllCosts(inst),
    })
    if (inst.pendingVanish !== true) returnTrashOnOwnSpiritDestroyed(state, ownerPid, master.family)
}

export function resumeDestroyCommit(
    state: GameState,
    frame: Extract<ResumeFrame, { kind: "destroyCommit" }>,
): void {
    const inst = state.players[frame.pid].field.spirits.find((s) => s.instanceId === frame.instanceId)
    if (!inst || !inst.pendingDestruction) return
    if (frame.step <= 1) {
        fireOwnSpiritDestroyed(state, frame.pid, inst, frame.byBattle, frame.wasAttacker, frame.bySpiritEffect, frame.byOpponentEffect, frame.sourceInstanceId)
        if (state.pendingChoice || state.winner) {
            suspendDestroyCommit(state, frame.pid, inst, 2, frame.byBattle, frame.wasAttacker, frame.bySpiritEffect, frame.byOpponentEffect, frame.sourceInstanceId)
            return
        }
    }
    commitPendingDestruction(state, frame.pid, inst)
    // グループ外の単体破壊の再開ならここで発火（destroySpirit 本体と同じ規則）
    if (!state.destroyGroup) fireQueuedDestroyBursts(state)
}

// 合体中のブレイヴの【合体時】も含める（含めないと、ホストが破壊時効果を持たない合体スピリットでブレイヴ側が発揮しない。BS15-055）
function hasOwnTrigger(state: GameState, pid: PlayerId, inst: CardInstance, trigger: "onDestroy" | "onBattleLose"): boolean {
    return (
        [inst, ...bravesOf(state.players[pid], inst)].some((src) => getCard(src.cardId).effects.some((e) => e.kind === "triggered" && e.trigger === trigger)) ||
        hasGrantedTrigger(state, pid, inst, trigger)
    )
}

// destroyedCoresToSelf（BS20-X01 Lv1）の有効な発生源＝破壊された個体の持ち主の場のスピリット。
// 破壊待機中の個体は行き先になれない（破壊された個体自身はこの時点で既に場にいない）
function destroyedCoresToSelfCandidates(state: GameState, ownerPid: PlayerId): CardInstance[] {
    const out: CardInstance[] = []
    for (const source of effectSources(state, ownerPid)) {
        if (!state.players[ownerPid].field.spirits.includes(source) || source.pendingDestruction) continue
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "destroyedCoresToSelf") continue
            if (!entryActive(state, ownerPid, source, effect, level)) continue
            noteCoverage(effect, "destroyedCoresToSelf")
            out.push(source)
            break
        }
    }
    return out
}

// pendingCoreDestinations を先頭から1件ずつ確認に出す（flushBraveKeeps と同じ形。ブレイヴを残す確認より先）
export function flushCoreDestinations(state: GameState): void {
    while (!state.pendingChoice && !state.winner && (state.pendingCoreDestinations?.length ?? 0) > 0) {
        const entry = state.pendingCoreDestinations![0]!
        if (state.interactiveTargets) {
            // 同名の X01 が2体いても見分けられるように、スピリットには番号と今のコアの数を付ける
            const label = (dest: string, i: number): string => {
                if (dest === "trash") return "トラッシュ"
                if (dest === "void") return "ボイド"
                if (dest === "reserve") return "リザーブ"
                const inst = findInstanceAnywhere(state, dest)
                return `${i + 1}. ${getCard(inst?.cardId ?? "").name || dest}（コア${inst?.cores ?? 0}個）`
            }
            suspend(state, {
                pid: entry.chooser,
                kind: "option",
                prompt: `破壊されたスピリットのコア${entry.cores}個の行き先を選んでください`,
                candidates: [],
                options: entry.options.map((d, i) => label(d, i)),
                optional: false,
                action: { type: "noop" },
                selfInstanceId: null,
                coreDestination: { ownerPid: entry.ownerPid, cores: entry.cores, destOptions: entry.options },
            })
            return
        }
        state.pendingCoreDestinations!.shift()
        applyCoreDestination(state, entry.ownerPid, entry.cores, entry.options[0]!)
    }
    if ((state.pendingCoreDestinations?.length ?? 0) === 0) delete state.pendingCoreDestinations
}

// 選ばれた行き先へコアを置く。行き先の個体が場を離れていたらリザーブへ（コアを消さない）
export function applyCoreDestination(state: GameState, ownerPid: PlayerId, cores: number, dest: string): void {
    if (dest === "trash") {
        state.players[ownerPid].trashCores += cores
    } else if (dest === "reserve") {
        state.players[ownerPid].reserve += cores
    } else if (dest !== "void") {
        const target = state.players[ownerPid].field.spirits.find((s) => s.instanceId === dest)
        if (target) {
            target.cores += cores
            log(state, `破壊されたスピリットのコア${cores}個は${getCard(target.cardId).name}に置かれた。`)
        } else {
            state.players[ownerPid].reserve += cores
        }
    }
}

// **順序は「カードをトラッシュへ → コアを移す」**（TIMING_CHART.md §1.5）。
// 誘発の解決中に復活した／場から居なくなった場合は何もしない
export function commitPendingDestruction(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): void {
    if (!inst.pendingDestruction) return
    // ⚠️ ここでは「フィールドに残る／戻る」を試さない。**破壊で誘発した効果の列の1項目**として
    // 既に解決済みだから（docs/design/TIMING_CHART.md）。列で復活が成立していれば
    // applyRevived が pendingDestruction を消しているので、この関数は上の行で抜けている
    const braveCantRemain = inst.pendingDestroyContext?.braveCantRemain === true
    const commitContext = inst.pendingDestroyContext
    delete inst.pendingDestroyContext
    delete inst.pendingDestroyAllowSuspend
    delete inst.skipReviveOnCommit
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex((s) => s.instanceId === inst.instanceId)
    if (index === -1) {
        delete inst.pendingDestruction
        delete inst.pendingDestroyBurstInfo
        return
    }
    // 破壊後バースト用の材料を、トラッシュ行きが確定したこのタイミングで控える。まだ合体中のここで捕える
    // （instColors／instAllCosts が合体中のブレイヴの色・コストを含むため。detachBravesOnLeave の後では読めない）。hostCost はブレイヴぶんを除いたホスト自身のコスト。
    // 発火はここではせず handleAction 末尾の fireQueuedDestroyBursts に委ねる（ブレイヴを残す/残さない確認が残っていることがあるため）
    const burstInfo = inst.pendingDestroyBurstInfo
    delete inst.pendingDestroyBurstInfo
    // トークンはトラッシュに置かれずトークン置き場へ戻る＝破壊後バーストも起きない（「破壊時」は発揮済み）
    const token = leavesNothingBehind(inst)
    if (!token) (state.pendingBurstDestroyQueue ??= []).push({
        pid: ownerPid,
        groupKey: state.destroyGroup?.id ?? inst.instanceId,
        cardId: inst.cardId,
        colors: instColors(inst),
        families: getAllFamilies().filter((f) => spiritHasFamily(state, ownerPid, inst, f)),
        hostCost: instAllCosts(inst)[0]! - (inst.braveComposite?.cost ?? 0),
        braves: bravesOf(player, inst).map((b) => ({ instanceId: b.instanceId, cost: instAllCosts(b)[0]! })),
        byOpponentEffect: burstInfo?.byOpponentEffect ?? false,
        destroyedBp: burstInfo?.bp ?? 0,
    })
    player.field.spirits.splice(index, 1)
    trashUnderCards(state, ownerPid, inst) // 下のカードは場を離れるとき破棄（BS19-X02。トラッシュでは下のカードが先）
    if (inst.bunshinOf !== undefined) {
        player.trashCards.push(inst.bunshinOf) // Q787：元のカードが表向きでトラッシュへ（BP0でもデッキ下へは行かない）
        if (commitContext) commitContext.trashedCount = (commitContext.trashedCount ?? 0) + 1
    } else if (!token) {
        if (burstInfo !== undefined && burstInfo.bp <= 0 && bp0DestroyedGoesToDeckBottom(state, ownerPid, inst)) player.deck.push(inst.cardId)
        else {
            player.trashCards.push(inst.cardId)
            if (commitContext) commitContext.trashedCount = (commitContext.trashedCount ?? 0) + 1
        }
    }
    // 破壊されたスピリット上のコアは通常リザーブへ戻るが、destroyedCoresToTrash が有効な間、またはバトル中に
    // battleOpponentDestroyedCoresTo がこのプレイヤーを指している間は、その行き先へ置く（void はどこにも足さない）。
    // destroyedCoresToSelf（BS20-X01）の候補があるときは、コアは候補へ（複数・トラッシュ/ボイド行きとの衝突時は選択）
    const redirectEntry = timedContentsFor(state, ownerPid).find((c) => c.type === "destroyedCoresTo")
    // soleOnly：効果の持ち主側のバトル中のスピリットが同じ破壊バッチにいる（または既に場にいない）なら相打ちなので適用しない
    const winnerSurvives = (): boolean => {
        const b = state.battle
        if (!b) return false
        const mine = state.players[opponentOf(ownerPid)].field.spirits.find((s) => s.instanceId === b.attackerInstanceId || s.instanceId === b.blockerInstanceId)
        return mine !== undefined && !mine.pendingDestruction && !state.destroyGroup?.memberIds.includes(mine.instanceId)
    }
    const redirect = redirectEntry && "soleOnly" in redirectEntry && redirectEntry.soleOnly && !winnerSurvives() ? undefined : redirectEntry?.to
    // ソウルコア退避（案A-outside: 数値に含まれないため自力では動かない。§1.2でボイドには行けない。
    // 破壊されたコアがトラッシュへ行く間だけ一緒にトラッシュへ、それ以外（ボイド行きを含む）はリザーブへ）
    if (soulCoreOnInstance(player, inst.instanceId)) {
        // 既に field から splice 済みなので fromInst を渡す（soulInstance は場にいない個体を見つけられない。
        // 渡さないと inst.cores が1個多くリザーブへ移り、ソウルコアぶんが二重に加算される）
        moveSoulCore(player, redirect === "trash" || destroyedCoresGoToTrash(state) ? { zone: "trash" } : { zone: "reserve" }, inst)
    }
    const baseDest: "reserve" | "trash" | "void" = redirect === "void" ? "void" : redirect === "trash" || destroyedCoresGoToTrash(state) ? "trash" : "reserve"
    const selfDests = destroyedCoresToSelfCandidates(state, ownerPid)
    if (selfDests.length > 0 && baseDest === "reserve" && (selfDests.length === 1 || !state.interactiveTargets)) {
        // 候補が1体（または非対話）でトラッシュ/ボイド行きとの衝突が無ければ、選ばずにその候補へ（非対話は先頭）
        const dest = selfDests[0]!
        dest.cores += inst.cores
        log(state, `破壊された${getCard(inst.cardId).name}のコア${inst.cores}個は${getCard(dest.cardId).name}に置かれた。`)
    } else if (selfDests.length > 0 && !state.interactiveTargets) {
        // 非対話でトラッシュ/ボイド行きと衝突していても候補の先頭へ（決定的簡略化）
        const dest = selfDests[0]!
        dest.cores += inst.cores
        log(state, `破壊された${getCard(inst.cardId).name}のコア${inst.cores}個は${getCard(dest.cardId).name}に置かれた。`)
    } else if (selfDests.length > 0) {
        // 候補が2体以上、またはトラッシュ/ボイド行き（古龍の縄張り等）との衝突。持ち主（衝突時はターンプレイヤー）が選ぶ
        ;(state.pendingCoreDestinations ??= []).push({
            chooser: baseDest === "reserve" ? ownerPid : state.turnPlayer,
            ownerPid,
            cores: inst.cores,
            options: [...selfDests.map((s) => s.instanceId), ...(baseDest === "reserve" ? [] : [baseDest])],
        })
        inst.cores = 0
        flushCoreDestinations(state)
    } else if (baseDest === "trash") {
        player.trashCores += inst.cores
    } else if (baseDest === "reserve") {
        player.reserve += inst.cores
    }
    delete inst.pendingDestruction
    // 合体していたブレイヴを外す（§6.1.1）。**コアを移した後**に呼ぶ：
    // ホストのコアがリザーブに入ってからブレイヴに置くのが正しい順（§6.3.1）
    detachBravesOnLeave(state, ownerPid, inst, false, "trash", braveCantRemain)
    separateBravesOverLimit(state)
}

// globalConstraint "bp0DestroyedToDeckBottom"。発生源は破壊された側から見た相手のフィールドにある
function bp0DestroyedGoesToDeckBottom(state: GameState, ownerPid: PlayerId, inst: CardInstance): boolean {
    const pid = opponentOf(ownerPid)
    for (const source of effectSources(state, pid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint" || effect.constraint.type !== "bp0DestroyedToDeckBottom") continue
            if (!entryActive(state, pid, source, effect, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            if (effect.turn === "own" && pid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && pid === state.turnPlayer) continue
            if (instAllCosts(inst)[0]! <= effect.constraint.maxCost) return true
        }
    }
    return false
}

// 破壊後バーストを、pendingBurstDestroyQueue にたまった分だけまとめて発火する。handleAction の末尾
// （ブレイヴの「残す/残さない」確認まで決着した安全な地点）から呼ぶ。groupKey＋持ち主単位でまとめ、同時破壊グループは1回にする（TIMING_CHART.md ＞６）
export function fireQueuedDestroyBursts(state: GameState): void {
    if (state.pendingChoice || state.winner) return
    // ブレイヴの「残す/残さない」がまだ決着していない間は、コストが確定しないので待つ
    if ((state.pendingBraveKeeps?.length ?? 0) > 0) return
    // コアの行き先選び（destroyedCoresToSelf）も同じく、決着するまで待つ
    if ((state.pendingCoreDestinations?.length ?? 0) > 0) return
    const queue = state.pendingBurstDestroyQueue
    if (!queue || queue.length === 0) return
    delete state.pendingBurstDestroyQueue
    const groups = new Map<string, typeof queue>()
    for (const e of queue) {
        const key = `${e.pid}:${e.groupKey}`
        const arr = groups.get(key)
        if (arr) arr.push(e)
        else groups.set(key, [e])
    }
    for (const members of groups.values()) {
        if (state.pendingChoice || state.winner) return
        const pid = members[0]!.pid
        const player = state.players[pid]
        const colors = new Set<Color>()
        const costs: number[] = []
        const memberInfos: { colors: Color[]; cost: number; families: string[] }[] = []
        let destroyedBp = 0
        let byOpponentEffect = false
        for (const m of members) {
            for (const c of m.colors) colors.add(c)
            const braveCost = m.braves
                .filter((b) => !player.field.spirits.some((s) => s.instanceId === b.instanceId))
                .reduce((sum, b) => sum + b.cost, 0)
            costs.push(m.hostCost + braveCost)
            memberInfos.push({ colors: m.colors, cost: m.hostCost + braveCost, families: m.families })
            destroyedBp = Math.max(destroyedBp, m.destroyedBp)
            byOpponentEffect ||= m.byOpponentEffect
        }
        // destroyedAsTarget：グループが1体だけのときのみ cardId を渡す（複数体では1枚に決まらないため対象外。簡略化）
        const selfOverride = { pid, ...(members.length === 1 ? { cardId: members[0]!.cardId } : {}) }
        fireBurstOnEvent(state, pid, "ownSpiritDestroyed", selfOverride, [...colors], undefined, {
            byOpponentEffect,
            destroyedBp,
            costs,
            members: memberInfos,
        })
    }
}

// 手札のカード自身が持つ「相手のスピリットの効果で手札から破棄されたとき、コストを支払わずに召喚できる」。
// 破棄されてトラッシュに置かれた直後に呼ぶ。true なら、呼び出し側はトラッシュからそのカードを取り除いてある前提で進む
export function tryFreeSummonOnHandDiscard(
    state: GameState,
    targetPid: PlayerId,
    cardId: string,
    sourceType: CardType | undefined,
    sourcePid: PlayerId,
): boolean {
    if (sourceType !== "spirit" || sourcePid === targetPid) return false
    if (state.pendingChoice || state.winner) return false
    if (zoneSpiritEffectsDisabled(state, cardId)) return false
    const effect = getCard(cardId).effects.find((e) => e.kind === "freeSummonFromHandOnDiscardedByOpponent")
    if (!effect) return false
    const player = state.players[targetPid]
    if (!canPayFreeSummonSurcharge(state, targetPid, getCard(cardId), minLevelCores(getCard(cardId)))) return false
    const index = player.trashCards.lastIndexOf(cardId)
    if (index === -1) return false
    noteCoverage(effect, "freeSummonFromHandOnDiscardedByOpponent")
    if (state.interactiveTargets) {
        suspend(state, {
            pid: targetPid,
            kind: "option",
            prompt: `${getCard(cardId).name}：破棄されたこのカードを、コストを支払わずに召喚しますか？`,
            candidates: [],
            options: ["召喚する"],
            optional: true,
            confirm: true,
            trashFreeSummon: { pid: targetPid, cardId, trashIndex: index },
            action: { type: "noop" },
            selfInstanceId: null,
        })
        return true
    }
    summonFreeFromTrashIndex(state, targetPid, getCard(cardId).name, index)
    return true
}

// ownLifeDamaged の発火点から呼ぶ。実対戦では確認を出し、非対話では自動で召喚する
export function tryHandFreeSummonOnLifeDamaged(state: GameState, pid: PlayerId): void {
    if (state.pendingChoice || state.winner) return
    const player = state.players[pid]
    for (let i = 0; i < player.hand.length; i++) {
        const cardId = player.hand[i]
        if (cardId === undefined) continue
        if (zoneSpiritEffectsDisabled(state, cardId)) continue
        const effect = getCard(cardId).effects.find((e) => e.kind === "freeSummonFromHandOnLifeDamaged")
        if (!effect || effect.kind !== "freeSummonFromHandOnLifeDamaged") continue
        if (effect.phaseTurn) {
            // phase 省略＝ステップ不問（turn 条件だけ見る）
            if (effect.phaseTurn.phase !== undefined && state.phase !== effect.phaseTurn.phase) continue
            if (effect.phaseTurn.turn === "own" && pid !== state.turnPlayer) continue
            if (effect.phaseTurn.turn === "opponent" && pid === state.turnPlayer) continue
        }
        // condition：この関数はライフが減った後に呼ばれるので、減った後のライフで判定される
        if (effect.condition && player.life > effect.condition.ownLifeAtMost) continue
        // 維持コアを置けないなら召喚できないので、確認自体を出さない
        if (!canPayFreeSummonSurcharge(state, pid, getCard(cardId), minLevelCores(getCard(cardId)))) continue
        noteCoverage(effect, "freeSummonFromHandOnLifeDamaged")
        if (state.interactiveTargets) {
            suspend(state, {
                pid,
                kind: "option",
                prompt: `${getCard(cardId).name}：手札からコストを支払わずに召喚しますか？`,
                candidates: [],
                options: ["召喚する"],
                optional: true,
                confirm: true,
                handFreeSummon: { pid, cardId },
                action: { type: "noop" },
                selfInstanceId: null,
            })
            return
        }
        summonFreeFromHandIndex(state, pid, getCard(cardId).name, i)
        return
    }
}

// 確認を出したあとに手札から失われていた場合は何もしない
export function applyHandFreeSummon(
    state: GameState,
    info: NonNullable<PendingChoice["handFreeSummon"]>,
): void {
    const index = state.players[info.pid].hand.indexOf(info.cardId)
    if (index === -1) return
    summonFreeFromHandIndex(state, info.pid, getCard(info.cardId).name, index)
}

// 破壊で誘発した効果の列に並んだ「〜が破壊されたときコストを支払わずに召喚できる」1枚分。
// 実対戦では確認を出し、非対話では自動で召喚する
export function resolveHandFreeSummonOnDestroy(state: GameState, pid: PlayerId, cardId: string): void {
    if (state.pendingChoice || state.winner) return
    const index = state.players[pid].hand.indexOf(cardId)
    if (index === -1) return
    if (!canPayFreeSummonSurcharge(state, pid, getCard(cardId), minLevelCores(getCard(cardId)))) return
    if (state.interactiveTargets) {
        suspend(state, {
            pid,
            kind: "option",
            prompt: `${getCard(cardId).name}：手札からコストを支払わずに召喚しますか？`,
            candidates: [],
            options: ["召喚する"],
            optional: true,
            confirm: true,
            handFreeSummon: { pid, cardId },
            action: { type: "noop" },
            selfInstanceId: null,
        })
        return
    }
    summonFreeFromHandIndex(state, pid, getCard(cardId).name, index)
}

// 指名が無ければ false（＝これから聞く必要があるかもしれない）
function applyDestroyOrderPick(
    state: GameState,
    targets: { pid: PlayerId; instanceId: string; context?: DestroyContext }[],
    index: number,
): boolean {
    const pick = state.destroyOrderPick
    if (pick === undefined) return false
    delete state.destroyOrderPick
    const j = targets.findIndex((t, k) => k >= index && t.instanceId === pick)
    const head = targets[index]
    const picked = j >= 0 ? targets[j] : undefined
    if (j > index && head && picked) {
        targets[index] = picked
        targets[j] = head
    }
    return true
}

// 残りの対象のうち「フィールドに残る」の確認が出る候補が2体以上なら、
// ターンプレイヤーに解決順を聞いて中断する（聞いたら true）。
// 候補が1体以下なら順番に意味が無いので聞かない（TIMING_CHART.md §0-3）
function askDestroyOrder(
    state: GameState,
    targets: { pid: PlayerId; instanceId: string; context?: DestroyContext }[],
    index: number,
    context?: DestroyContext,
): boolean {
    if (!state.interactiveTargets) return false
    const candidates = targets
        .slice(index)
        .filter((t) => wouldAskReviveConfirm(state, t.pid, t.instanceId, t.context ?? context))
    if (candidates.length < 2) return false
    // 同名カードが並ぶと選択肢が重複して区別できないため、先頭に番号を振る
    const options = candidates.map(
        (t, k) =>
            `${k + 1}. ${state.players[t.pid].name}の${getCard(
                state.players[t.pid].field.spirits.find((s) => s.instanceId === t.instanceId)?.cardId ?? "",
            ).name}`,
    )
    suspend(state, {
        pid: state.turnPlayer,
        kind: "option",
        prompt: "同時に破壊されるスピリットのうち、どれから破壊処理をしますか？",
        candidates: [],
        options,
        optional: false,
        destroyOrder: { instanceIds: candidates.map((t) => t.instanceId) },
        action: { type: "noop" },
        selfInstanceId: null,
    })
    return true
}

// 戻り値は「実際に破壊できた数」。中断したときは state.pendingChoice が立ち、
// 呼び出し元は destroyBatch フレームを積んで return する（GameEngine の drainResumeStack が続きを回す）
export function destroySpiritsFrom(
    state: GameState,
    targets: { pid: PlayerId; instanceId: string; context?: DestroyContext }[],
    startIndex: number,
    destroyedSoFar: number,
    context?: DestroyContext,
): { destroyed: number; stoppedAt: number } {
    let destroyed = destroyedSoFar
    if (startIndex === 0 && destroyedSoFar === 0 && context) context.trashedCount = 0
    // 「実際にトラッシュへ置かれた体数」。復活で残った・手札へ戻った個体は数えない（context が無い破壊は破壊できた数で代用）
    const record = (): void => recordDestroyedCount(state, context ? (context.trashedCount ?? 0) : destroyed)
    for (let i = startIndex; i < targets.length; i++) {
        // 同時破壊で「フィールドに残る」の確認が2体以上に出るなら、
        // どの体から破壊処理をするかをターンプレイヤーが決める（docs/design/TIMING_CHART.md §0-3）。
        if (!applyDestroyOrderPick(state, targets, i) && askDestroyOrder(state, targets, i, context)) {
            return { destroyed, stoppedAt: i }
        }
        const t = targets[i]
        if (!t) continue
        const ctx = t.context ?? context
        // 【不死】も「フィールドに残る」も、destroySpirit の中で破壊で誘発した効果の列の1項目として解決される（TIMING_CHART.md）
        if (destroySpirit(state, t.pid, t.instanceId, "destroy", ctx, { allowSuspend: true, includeFushi: true })) {
            destroyed++
        }
        if (state.winner) return { destroyed, stoppedAt: targets.length }
        // 復活の確認で中断した。**この対象はまだ決着していない**ので、次から再開する
        // （確認の答えは applyReviveConfirm / declineReviveConfirm が決着させる）
        if (state.pendingChoice) {
            record()
            return { destroyed, stoppedAt: i + 1 }
        }
    }
    record()
    return { destroyed, stoppedAt: targets.length }
}

// 復活の確認で中断したら destroyBatch フレームを積んで止まるので、
// **呼び出し元は「戻ってきたら state.pendingChoice を見て return する」だけでよい**。
// 戻り値は（中断していなければ）実際に破壊できた数
export function destroyTargetsBatch(
    state: GameState,
    ownerPid: PlayerId,
    targets: { pid: PlayerId; instanceId: string; context?: DestroyContext }[],
    context?: DestroyContext,
    after?: Extract<ResumeFrame, { kind: "destroyBatch" }>["after"],
): number {
    // 同時破壊グループ（他カードの「破壊されたとき」を1回にする単位）。入れ子の破壊に備え、
    // このバッチが始まる前の値を退避して完了時に戻す（docs/design/TIMING_CHART.md）
    const prevGroup = state.destroyGroup
    // 破壊待機のスピリットすべての系統を持ち主ごとに控える（1回の誘発で全員を参照するため。2026-09-22 ユーザー確認）
    const familiesByPid: Partial<Record<PlayerId, string[]>> = {}
    for (const t of targets) {
        const inst = state.players[t.pid].field.spirits.find((s) => s.instanceId === t.instanceId)
        if (!inst) continue
        familiesByPid[t.pid] = [...new Set([...(familiesByPid[t.pid] ?? []), ...grantedFamilies(state, t.pid, inst)])]
    }
    state.destroyGroup = { id: randomUUID(), memberIds: targets.map((t) => t.instanceId), used: [], familiesByPid }
    const { destroyed, stoppedAt } = destroySpiritsFrom(state, targets, 0, 0, context)
    if (stoppedAt < targets.length) {
        pushResumeFrames(state, [{
            kind: "destroyBatch",
            ownerPid,
            targets,
            index: stoppedAt,
            destroyed,
            ...(context ? { context } : {}),
            ...(after ? { after } : {}),
            ...(prevGroup ? { prevGroup } : {}),
        }])
        return destroyed
    }
    restoreDestroyGroup(state, prevGroup)
    // グループの外（入れ子の破壊でなければ）に戻ったところで、破壊後バーストをまとめて発火する
    if (!state.destroyGroup) fireQueuedDestroyBursts(state)
    if (state.winner) return destroyed
    if (after) applyDestroyBatchAfter(state, ownerPid, destroyed, after)
    return destroyed
}

// 破壊バッチの続きを回す。1体ごとに「破壊される代わりに復活できる」の確認で中断しうるので、
// 途中で止まったらフレームを積み直して抜ける（destroyed は中断をまたいで持ち回る）。
export function resumeDestroyBatch(
    state: GameState,
    frame: Extract<ResumeFrame, { kind: "destroyBatch" }>,
): void {
    // 中断の原因になった1体（frame.index の1つ前）の決着を取り込む。
    // 「復活させない」を選んで破壊された場合は「破壊できた数」に算入する（RESUME_STACK.md §7 ①）
    let carried = frame.destroyed
    if (state.lastReviveDestroyed === true) carried++
    delete state.lastReviveDestroyed
    // state.destroyGroup は中断をまたいでそのまま（この関数の呼び出し元は積み直すだけで触らない）
    const { destroyed, stoppedAt } = destroySpiritsFrom(
        state,
        frame.targets,
        frame.index,
        carried,
        frame.context,
    )
    if (stoppedAt < frame.targets.length) {
        pushResumeFrames(state, [{ ...frame, index: stoppedAt, destroyed }])
        return
    }
    restoreDestroyGroup(state, frame.prevGroup)
    if (!state.destroyGroup) fireQueuedDestroyBursts(state)
    if (state.winner) return
    applyDestroyBatchAfter(state, frame.ownerPid, destroyed, frame.after)
}

function restoreDestroyGroup(state: GameState, prev: GameState["destroyGroup"]): void {
    if (prev) state.destroyGroup = prev
    else delete state.destroyGroup
}

// 「この効果で破壊したスピリット1体につき」の後処理。
// **実際に破壊できた数**で数える（復活して場に残った個体は入らない。RESUME_STACK.md §7 ①）
export function applyDestroyBatchAfter(
    state: GameState,
    ownerPid: PlayerId,
    destroyed: number,
    after: Extract<ResumeFrame, { kind: "destroyBatch" }>["after"],
): void {
    if (!after) return
    // thenDrawFixed：破壊できた数によらず固定枚数ドロー（「その後」）。0体破壊でも発火する
    if (after.thenDrawFixed) draw(state, ownerPid, after.thenDrawFixed)
    if (destroyed <= 0) return
    if (after.drawPerDestroyed) draw(state, ownerPid, destroyed * after.drawPerDestroyed)
    if (after.millPerDestroyed) {
        // 破棄されるのは効果の持ち主から見た相手のデッキ。体数ぶんの破棄も「相手へのデッキ破棄効果」なので
        // 【強化】（青）の +1枚を最終枚数に足す（BS19_PLAN §2.1）
        const kyoka = kyokaBonus(state, ownerPid, "deckMill")
        millDeck(state, opponentOf(ownerPid), destroyed * after.millPerDestroyed + kyoka, ownerPid)
    }
    if (after.voidCoreToSelfPerDestroyed && after.selfInstanceId) {
        const self = findInstanceAnywhere(state, after.selfInstanceId)
        if (self && coreGainBlocked(state, "void", "field")) {
            log(state, `${getCard(self.cardId).name}：コアステップ以外はボイドからコアを置けないため置かなかった。`)
        } else if (self) {
            const placed = takeCoreGainAllowance(state, ownerPid, getCard(self.cardId).type, "void", "field", destroyed)
            if (placed <= 0) {
                log(state, `${getCard(self.cardId).name}：効果により、これ以上コアを置けなかった。`)
                return
            }
            placeCoresOnSpirit(state, self, placed, ownerPid)
            log(
                state,
                `${getCard(self.cardId).name}は、破壊した${destroyed}体につきボイドからコア${placed}個を自身の上に置いた。`,
            )
        }
    }
}

// ネクサスを破壊する。破壊耐性（nexusIndestructible）で不発なら false（呼び出し側はカウント・ドロー処理の可否を判定する）。
// after＝破壊がコミットで確定したときにだけ解決するアクション（「相手のネクサスを破壊したときドローする」等。
// ネクサス版 reviveOnDestroy で場に残ったときは解決されない）
export function destroyNexus(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
    context?: DestroyContext,
    after?: { actorPid: PlayerId; action: EffectAction },
): boolean {
    const player = state.players[ownerPid]
    const index = player.field.nexuses.findIndex(
        (n) => n.instanceId === instanceId,
    )
    if (index === -1) return false
    const inst = player.field.nexuses[index]
    if (!inst) return false
    const denial = destroyDenial(state, {
        ownerPid,
        target: inst,
        cause: "effect",
        ...(context?.sourcePid !== undefined ? { actorPid: context.sourcePid } : {}),
        ...(context?.sourceType !== undefined ? { sourceType: context.sourceType } : {}),
        ...(context?.sourceColors !== undefined ? { sourceColors: context.sourceColors } : {}),
    })
    if (denial !== null) {
        log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）は破壊されなかった（${denial}）。`)
        return false
    }
    // 破壊待機状態のネクサスは、そこからさらに破壊されない（TIMING_CHART.md §1.5）
    if (inst.pendingDestruction) return false
    // この間もネクサスの効果（誘発・継続効果）は普通に働く（2026-08-14 ユーザー確認）
    inst.pendingDestruction = true
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）は破壊された。`)
    // 直近に破壊されたネクサスを記録する（「その破壊されたネクサス」を参照する効果用）
    state.lastDestroyedNexus = { pid: ownerPid, cardId: inst.cardId }
    driveNexusDestruction(state, ownerPid, inst, 1, byOpponentEffectOf(context, ownerPid), after)
    return true
}

// 「相手の効果で破壊されたとき」限定のエントリの判定材料。効果による破壊か（sourceType あり）＋発生源が持ち主自身でないか
function byOpponentEffectOf(context: DestroyContext | undefined, ownerPid: PlayerId): boolean {
    return (
        context?.sourceType !== undefined &&
        context.sourcePid !== undefined &&
        context.sourcePid !== ownerPid
    )
}

// ネクサスの破壊処理（＞６）を1ステップずつ進める。**1ステップ＝中断しうる呼び出し1つ**。
// 途中で選択待ちが立ったら destroyNexusCommit フレームに次のステップを載せて抜ける
// （破壊待機状態のまま残る）。docs/design/TIMING_CHART.md §1.5
function driveNexusDestruction(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    startStep: number,
    byOpponentEffect: boolean,
    after?: { actorPid: PlayerId; action: EffectAction },
): void {
    // 破壊が確定したときだけ after を解決する。ネクサス版 reviveOnDestroy で「破壊される代わりに」
    // 場に残った（nexusReviveStayed）ときは破壊されていないので解決しない。
    // reviveLastDestroyedNexus（破壊された後でフィールドに戻す）は待機を解除しても破壊は成立しているので解決する
    const runAfterIfDestroyed = (): void => {
        const stayed = inst.nexusReviveStayed === true
        delete inst.nexusReviveStayed
        if (after && !stayed) resolveAction(state, after.actorPid, null, after.action)
    }
    const commit = (): void => {
        commitPendingNexusDestruction(state, ownerPid, inst)
        runAfterIfDestroyed()
    }
    for (let step = startStep; step <= 5; step++) {
        switch (step) {
            // フィールドイベント誘発「ネクサスが破壊されたとき」：破壊した/された側を問わず両陣営のフィールドから発火。バウンスはここを通らないため対象外
            case 1:
                fireFieldEventTriggers(state, ownerPid, "anyNexusDestroyed")
                break
            case 2:
                fireFieldEventTriggers(state, opponentOf(ownerPid), "anyNexusDestroyed")
                break
            // フィールドイベント誘発「自分のネクサスが破壊されたとき」：持ち主側のフィールドからのみ発火。
            // 破壊されたネクサス自身は破壊待機状態でまだ場にいるので、そのネクサス自身が持つ形も走査に含まれる
            case 3:
                // eventColors には破壊されたネクサスの色を渡す。渡さないと fieldEvent.colorFilter が常に外れ、条件付きの誘発が不発になる
                fireFieldEventTriggers(state, ownerPid, "ownNexusDestroyed", undefined, instColors(inst), undefined, undefined, {
                    byOpponentEffect,
                })
                break
            // ネクサス版 reviveOnDestroy（scope:"ownNexus"）：コミットの前に、他の自分のネクサスが
            // コストで破壊を打ち消せるかを見る。復活したら inst.pendingDestruction が消えるのでコミットは空振りする
            case 4:
                tryNexusReviveOnDestroy(state, ownerPid, inst)
                break
            default:
                commit()
                return
        }
        if (state.winner) {
            commit()
            return
        }
        if (state.pendingChoice) {
            pushResumeFrames(state, [
                {
                    kind: "destroyNexusCommit",
                    pid: ownerPid,
                    instanceId: inst.instanceId,
                    step: step + 1,
                    byOpponentEffect,
                    ...(after ? { after } : {}),
                },
            ])
            return
        }
    }
}

export function resumeDestroyNexusCommit(
    state: GameState,
    frame: Extract<ResumeFrame, { kind: "destroyNexusCommit" }>,
): void {
    const inst = state.players[frame.pid].field.nexuses.find((n) => n.instanceId === frame.instanceId)
    if (!inst) return
    // 確認のあいだに破壊待機が解除されていたら、もうステップを進めない。
    // reviveLastDestroyedNexus（破壊された後で戻す）なら破壊は成立しているので after だけ解決する。
    // ネクサス版 reviveOnDestroy（nexusReviveStayed）なら「破壊されていない」ので after も解決しない
    if (!inst.pendingDestruction) {
        const stayed = inst.nexusReviveStayed === true
        delete inst.nexusReviveStayed
        if (frame.after && !stayed) resolveAction(state, frame.after.actorPid, null, frame.after.action)
        return
    }
    driveNexusDestruction(state, frame.pid, inst, frame.step, frame.byOpponentEffect, frame.after)
}

export function commitPendingNexusDestruction(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): boolean {
    // 戻り値＝実際にトラッシュへ置いたか（reviveOnDestroy で待機が解除済みのときは false）
    if (!inst.pendingDestruction) return false
    const player = state.players[ownerPid]
    const index = player.field.nexuses.findIndex((n) => n.instanceId === inst.instanceId)
    if (index === -1) {
        delete inst.pendingDestruction
        return false
    }
    player.field.nexuses.splice(index, 1)
    player.trashCards.push(inst.cardId)
    // 案B-inside: 先に[ソウルコア]を退避させる（soulCoreLeavesFieldがinst.coresの数値も動かす）
    soulCoreLeavesField(player, inst)
    player.reserve += inst.cores
    delete inst.pendingDestruction
    return true
}

// ネクサスを持ち主の手札へ戻す（バウンス）。破壊ではないため destroyNexus とは別処理
export function returnNexusToHand(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
): void {
    const player = state.players[ownerPid]
    const index = player.field.nexuses.findIndex(
        (n) => n.instanceId === instanceId,
    )
    if (index === -1) return
    const inst = player.field.nexuses[index]
    if (!inst) return
    player.field.nexuses.splice(index, 1)
    // 案B-inside: 先に[ソウルコア]を退避させる（soulCoreLeavesFieldがinst.coresの数値も動かす）
    soulCoreLeavesField(player, inst)
    player.reserve += inst.cores
    player.hand.push(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）は手札に戻った。`)
    emitEvent(state, { type: "returnToHand", pid: ownerPid, cardName: getCard(inst.cardId).name })
    notifyHandGained(state, ownerPid, 1)
}

// ネクサスを持ち主のデッキの下（末尾）へ戻す。代替召喚コストの支払い（デッキの下へ戻すことでコスト不要で召喚）に使う。破壊ではないため onDestroy は誘発しない
export function returnNexusToDeckBottom(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
): void {
    const player = state.players[ownerPid]
    const index = player.field.nexuses.findIndex(
        (n) => n.instanceId === instanceId,
    )
    if (index === -1) return
    const inst = player.field.nexuses[index]
    if (!inst) return
    player.field.nexuses.splice(index, 1)
    // 案B-inside: 先に[ソウルコア]を退避させる（soulCoreLeavesFieldがinst.coresの数値も動かす）
    soulCoreLeavesField(player, inst)
    player.reserve += inst.cores
    player.deck.push(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）はデッキの下に戻った。`)
}

// ネクサスを持ち主のデッキの上へ戻す（returnNexusToDeckBottom のデッキ上版）。破壊ではないため onDestroy は誘発しない
export function returnNexusToDeckTop(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
): void {
    const player = state.players[ownerPid]
    const index = player.field.nexuses.findIndex(
        (n) => n.instanceId === instanceId,
    )
    if (index === -1) return
    const inst = player.field.nexuses[index]
    if (!inst) return
    player.field.nexuses.splice(index, 1)
    // 案B-inside: 先に[ソウルコア]を退避させる（soulCoreLeavesFieldがinst.coresの数値も動かす）
    soulCoreLeavesField(player, inst)
    player.reserve += inst.cores
    player.deck.unshift(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）はデッキの上に戻った。`)
}

// **その場では移さず、バウンス待機状態にするだけ**（バトスピ Wiki「バウンスについて」）。
// 実際の移動と「手札に戻ったとき」の誘発は、バウンス効果の解決が終わってから
// flushBounces がまとめて行う。破壊ではないため onDestroy は誘発しない。
export function returnSpiritToHand(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    // 効果の発生源カード名。渡すとログとイベントに載せる（何の効果で戻ったのかを対戦者が追えるように）
    sourceName?: string,
): void {
    markBounce(state, ownerPid, inst, "hand", sourceName)
    flushBounces(state)
}

// バウンス待機状態にする。フィールドには留めたまま印だけ付ける。
// **すでに待機中なら何もしない**（同じカードを2つの効果が戻そうとしても1回しか戻らない）。
//
// **1つの効果で複数体を戻すときはこれを直接呼び、最後に flushBounces を1回呼ぶ**。
// そうすると「全部戻ってから、まとめて『戻ったとき』が誘発する」というルールどおりになる
// （1体ずつ戻すと、1体目の誘発が2体目以降の対象を変えてしまう）。
// 1体だけ戻す場合は returnSpiritToHand 等がその場で flush するので結果は変わらない
// いま解決中の効果の持ち主に「手札に戻る先をデッキの上へ」が張られているか
// （GameState.currentEffectSource が効果の持ち主を指す。効果の解決中でなければ常に false）
function bouncesToDeckTop(state: GameState): boolean {
    const pid = state.currentEffectSource?.pid
    if (pid === undefined) return false
    return timedPlayerRules(state, pid).some((c) => c.type === "bounceToDeckTopForPid")
}

// return アクションの braveCantRemain を、その解決の間だけ markBounce へ届ける（戻す経路が多く、引数で通すと全部の呼び出しを直すことになる）
let bounceBraveCantRemain = false
export function withBounceBraveCantRemain(on: boolean, run: () => void): void {
    const saved = bounceBraveCantRemain
    bounceBraveCantRemain = on
    try {
        run()
    } finally {
        bounceBraveCantRemain = saved
    }
}

export function markBounce(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    to: "hand" | "deckTop" | "deckBottom" | "burst",
    sourceName?: string,
): boolean {
    const player = state.players[ownerPid]
    if (!player.field.spirits.some((s) => s.instanceId === inst.instanceId)) return false
    if (inst.pendingBounce) return false
    const denied = bounceDenial(state, ownerPid, inst, to)
    if (denied) {
        log(state, `${getCard(inst.cardId).name}は手札に戻らなかった（${denied}）。`)
        return false
    }
    // kind:"reviveOnDestroy".alsoOnReturn（BS19-X02）：相手の効果で戻されるときも復活して場に残る
    if (to !== "burst" && state.currentEffectSource?.pid !== undefined && state.currentEffectSource.pid !== ownerPid && reviveOnReturnStay(state, ownerPid, inst)) {
        return false
    }
    // 解決中の効果の持ち主が「このターンの間、自分の効果で手札に戻るスピリットは持ち主のデッキの上に戻る」を張っていれば、
    // 手札への戻しをデッキの上へ振り替える。手札への戻しはすべてここを通るので、「〜を手札に戻すことで」のコスト支払いも同じ扱いになる
    const srcPid = state.currentEffectSource?.pid
    inst.pendingBounce = { to: to === "hand" && bouncesToDeckTop(state) ? "deckTop" : to, ...(srcPid !== undefined && srcPid !== ownerPid ? { byOpponent: true as const } : {}), ...(bounceBraveCantRemain ? { braveCantRemain: true as const } : {}) }
    recordLeftCost(state, inst.cardId, instBaseCost(inst))
    if (sourceName !== undefined) bounceSourceNames.set(inst.instanceId, sourceName)
    return true
}

// バウンスの発生源カード名（ログ用）。CardInstance に持たせると盤面の状態が増えるので、
// **待機中だけの一時情報**としてここに置く（flushBounces が使い終わったら消す）
const bounceSourceNames = new Map<string, string>()

// バウンス待機状態のカードを実際に手札／デッキへ移し、そのあとで誘発をまとめて発揮する。バウンス効果の解決が終わった時点で呼ぶ。
//
// 移動を先に全部済ませてから誘発するのが要点（Wiki：待機中の「戻るとき」効果は割り込まない）。
// 1体戻すごとに誘発していると、その誘発が2体目以降の対象を変えてしまう
//
// order（instanceId の列）を渡すと**その順に移す**。プレイヤーが決めた順番がデッキの並びに出る効果（好きな順番でデッキの下に戻す）で使う。
// 列に無いものは従来どおりフィールドの並び順で、そのあとに続く
export function flushBounces(state: GameState, order?: string[]): void {
    const moved: { pid: PlayerId; inst: CardInstance; to: "hand" | "deckTop" | "deckBottom" | "burst"; byOpponent?: true }[] = []
    const rank = (inst: CardInstance): number => {
        if (!order) return 0
        const i = order.indexOf(inst.instanceId)
        return i === -1 ? order.length : i
    }
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        for (const inst of [...player.field.spirits].sort((a, b) => rank(a) - rank(b))) {
            const pb = inst.pendingBounce
            if (!pb) continue
            const index = player.field.spirits.findIndex((s) => s.instanceId === inst.instanceId)
            if (index === -1) continue
            player.field.spirits.splice(index, 1)
            trashUnderCards(state, pid, inst) // 下のカードは場を離れるとき破棄（BS19-X02）
            soulCoreLeavesField(player, inst) // 案B-inside: 先に[ソウルコア]退避（coresの数値調整込み）
            player.reserve += inst.cores
            // 合体していたブレイヴを外す（§6.1.1。コアを移した後。§6.3.1）。残すかの確認は全員を移し終えてから出す
            // （途中で確認の中断を立てると、その後の移動で盤面が変わる。smoke part778 の場面25）
            detachBravesOnLeave(state, pid, inst, true, pb.to === "burst" ? "trash" : pb.to, pb.braveCantRemain === true)
            delete inst.pendingBounce
            const sourceName = bounceSourceNames.get(inst.instanceId)
            bounceSourceNames.delete(inst.instanceId)
            const name = getCard(inst.cardId).name
            const prefix = sourceName !== undefined ? `${sourceName}：` : ""
            if (inst.bunshinOf !== undefined) {
                // Q788：手札・デッキ・バーストには入らず、元のカードが表向きでトラッシュへ。「手札に戻ったとき」の誘発も起きない
                player.trashCards.push(inst.bunshinOf)
                log(state, `${prefix}${player.name}の分身スピリットは場を離れ、元のカードがトラッシュに置かれた。`)
                continue
            }
            if (pb.to === "hand") {
                if (!isTokenCard(inst.cardId)) player.hand.push(inst.cardId)
                log(state, `${prefix}${player.name}の${name}は手札に戻った。`)
                emitEvent(state, {
                    type: "returnToHand",
                    pid,
                    cardName: name,
                    ...(sourceName !== undefined ? { sourceName } : {}),
                })
            } else if (pb.to === "burst") {
                // 呼び出し側が「バーストが未セット」を確認済み。セット通知（ownBurstSet）は移動を全部済ませたあと fireBounceTriggers で出す
                player.burst = inst.cardId
                player.burstSet = true
                log(state, `${prefix}${player.name}はスピリットをバーストとしてセットした。`)
            } else {
                const top = pb.to === "deckTop"
                if (!isTokenCard(inst.cardId)) {
                    if (top) player.deck.unshift(inst.cardId)
                    else player.deck.push(inst.cardId)
                }
                log(state, `${prefix}${player.name}の${name}はデッキの一番${top ? "上" : "下"}に戻った。`)
                emitEvent(state, {
                    type: "returnToDeck",
                    pid,
                    cardName: name,
                    position: top ? "top" : "bottom",
                    ...(sourceName !== undefined ? { sourceName } : {}),
                })
            }
            moved.push({ pid, inst, to: pb.to, ...(pb.byOpponent ? { byOpponent: true as const } : {}) })
        }
    }
    if (moved.length === 0) return
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const n = moved.filter((m) => m.pid === pid && m.to === "hand" && !isTokenCard(m.inst.cardId)).length
        if (n > 0) notifyHandGained(state, pid, n)
    }
    flushBraveKeeps(state)
    if (state.pendingChoice) {
        pushResumeFrames(state, [{ kind: "bounceFlush", moved, index: 0 }])
        return
    }
    fireBounceTriggers(state, moved, 0)
}

// 移動後の誘発をまとめて発揮する。**選択待ちで中断したら残りを再開スタックへ送る**
// （割り込まれる側の作法。docs/design/RESUME_STACK.md）
export function fireBounceTriggers(
    state: GameState,
    moved: { pid: PlayerId; inst: CardInstance; to: "hand" | "deckTop" | "deckBottom" | "burst"; byOpponent?: true }[],
    from: number,
): void {
    for (let i = from; i < moved.length; i++) {
        const m = moved[i]!
        if (state.winner) return
        // フィールドイベント誘発「自分のスピリットが手札に戻ったとき」。
        // self には戻ったスピリットを渡す（すでにフィールドからは外れている）
        if (m.to === "hand") {
            // 同時に戻るスピリット自身の「戻るとき」も、もう場にいなくても発揮する（待機中に誘発する扱い）
            fireFieldEventTriggers(state, m.pid, "ownSpiritReturnedToHand", { pid: m.pid, inst: m.inst }, instColors(m.inst), undefined, undefined, { byOpponentEffect: m.byOpponent === true }, moved.filter((x) => x.pid === m.pid && x.to === "hand").map((x) => x.inst))
            // 「**相手の**スピリットが手札に戻ったとき」を書けるように、両者のフィールド発生源にも配る（subjectSide で主体の陣営を絞る。anySpiritAttacked と同じ形）
            for (const pid of ["p1", "p2"] as PlayerId[]) {
                fireFieldEventTriggers(state, pid, "anySpiritReturnedToHand", { pid: m.pid, inst: m.inst }, instColors(m.inst))
            }
        }
        if (m.to === "burst") {
            fireFieldEventTriggers(state, m.pid, "ownBurstSet")
            fireFieldEventTriggers(state, opponentOf(m.pid), "opponentBurstSet")
        }
        if (state.pendingChoice) {
            if (i + 1 < moved.length) {
                pushResumeFrames(state, [{ kind: "bounceFlush", moved, index: i + 1 }])
            }
            return
        }
    }
}

// スピリットを持ち主のデッキの一番上へ戻す。破壊ではないため onDestroy は誘発しない。
export function returnSpiritToDeckTop(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    // 効果の発生源カード名。渡すとログの先頭に出す（何の効果で戻ったのかを対戦者が追えるように）
    sourceName?: string,
): void {
    markBounce(state, ownerPid, inst, "deckTop", sourceName)
    flushBounces(state)
}

// スピリットをデッキの一番下へ戻す（returnSpiritToDeckTop のデッキ下版）。
// 上に置くか下に置くかだけの違いなので、コアの戻し先など他の扱いは揃えてある
export function returnSpiritToDeckBottom(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    // 効果の発生源カード名。渡すとログの先頭に出す（何によって戻ったかが分かるように）
    sourceName?: string,
): void {
    markBounce(state, ownerPid, inst, "deckBottom", sourceName)
    flushBounces(state)
}

// 相手のスピリットからコアを奪う効果が、そのスピリットに届くか（＝耐性で弾かれないか）。
// 範囲でまとめて奪う効果は候補を自前で走査するため pickEnemyByBp 等の経路を通らず、【装甲】を素通りしていた（2026-08-10 修正）。
// 現在は耐性の唯一の入口（resistanceAgainst）へ委譲している。新しく書くハンドラは resistanceAgainst を直接呼んでよい
export function canTakeCoresFrom(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    actorPid: PlayerId,
    srcColors?: Color[],
    srcType?: CardType,
): boolean {
    return !isResisted(state, ownerPid, inst, {
        op: "coreRemove",
        scope: "area",
        actorPid,
        ...(srcType !== undefined ? { sourceType: srcType } : {}),
        ...(srcColors !== undefined ? { sourceColors: srcColors } : {}),
    })
}

// 効果で取り除ける上限（取り除けない系の禁止・バトル中の保護・下限をすべて見る）。actorPid 省略＝持ち主自身
function effectCoreCap(state: GameState, ownerPid: PlayerId, inst: CardInstance, actorPid: PlayerId | undefined, srcType: CardType | undefined, toReserve = false): number {
    return coreRemovalAllowed(state, { ownerPid, target: inst, amount: inst.cores, cause: "effect", actorPid: actorPid ?? ownerPid, sourceType: srcType, ...(toReserve ? { toReserve: true as const } : {}) })
}

// コアを取り除き、維持コア（Lv1）を下回ったら消滅させる。
// actorPid: このコア除去を引き起こした実行者（省略時は通知なし）。actorPid !== ownerPid のときフィールドイベント「ownSpiritCoresRemovedByOpponent」を発火する
export function removeCores(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
    actorPid?: PlayerId,
    // このコア除去を引き起こした効果の種別（coresToOpponentReserveGoToTrash の判定に使う。省略時＝ネクサス扱いと同じ「対象外」に倒す）
    srcType?: CardType,
    // §1.3の持ち主選択で[ソウルコア]を含める答えが戻ってきたとき（ソウルコア1個ぶんも移す。案A-outsideのため数値には含めない）
    includeSoul?: boolean,
    // 行き先がライフのとき（リザーブを経由するだけ）。「リザーブに置かれない」保護と opponentSpiritCoresToReserve の対象にしない
    viaLife?: boolean,
): number {
    // 戻り値＝**実際に取り除けた数**。バトル中の保護やコア下限で減る場合があるため、呼び出し側が残数を数えるときは必ずこれを使う
    const player = state.players[ownerPid]
    // coreReturnBonus：効果でリザーブへ置かれるコアの数を+する（両陣営の発生源が効く）。元のコア数を超えては取れないので inst.cores で頭打ちにする
    const bonus = coreReturnBonusFor(state, ownerPid)
    if (bonus > 0 && inst.cores > count) {
        log(state, `リザーブに置かれるコアが${Math.min(bonus, inst.cores - count)}個追加された。`)
    }
    // coreFloorByCost：有効なら、このカードのコストを下回るまでは取り除けない
    const allowed = effectCoreCap(state, ownerPid, inst, actorPid, srcType, !viaLife)
    // [ソウルコア]を含める指定: ソウルコア1個ぶんも移す個数に数える（案B-inside: coresには元から含まれる）。
    // 含めない指定なら、取り除き上限は[ソウルコア]を差し引いた通常コア数
    const soulHere = soulCoreOnInstance(player, inst.instanceId)
    // 通常コアだけでは足りない（全部取るときを含む）なら、聞かずに[ソウルコア]も取る（SOULCORE.md §5）
    const includeSoulUnit = soulHere && (includeSoul === true || count + bonus > allowed - 1)
    const soulUnits = includeSoulUnit ? 1 : 0
    const capacity = allowed - (soulHere && !includeSoulUnit ? 1 : 0)
    const removed = Math.min(count + bonus, capacity)
    inst.cores -= Math.max(0, removed - soulUnits)
    // coresToOpponentReserveGoToTrash：本来リザーブへ置かれるはずのコアを、発生源の持ち主から見た相手（＝ownerPid）のトラッシュへ振り替える
    const redirectToTrash = removed > 0 && coresToOpponentReserveGoToTrash(state, ownerPid, srcType)
    if (includeSoulUnit) moveSoulCore(player, { zone: redirectToTrash ? "trash" : "reserve" })
    if (redirectToTrash) {
        player.trashCores += removed - soulUnits
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}からコア${removed}個を取り除き、リザーブの代わりにトラッシュに置いた。`,
        )
    } else {
        player.reserve += removed - soulUnits
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}からコア${removed}個を取り除いた。`,
        )
    }
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (wouldDeplete(state, ownerPid, inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1, removed)
    }
    // 取られたスピリットごとに発火する（1回の効果で複数体でも体数ぶん。「その相手のスピリットすべて」を疲労させるため）
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0 && !redirectToTrash && !viaLife && srcType !== undefined) {
        fireFieldEventTriggers(state, actorPid, "opponentSpiritCoresToReserve", { pid: ownerPid, inst }, undefined, undefined, undefined, { causeType: srcType })
    }
    return removed
}

// コアを取り除いて持ち主のトラッシュへ置き、維持コア（Lv1）を下回ったら消滅させる。actorPid の扱いは removeCores と同じ
export function removeCoresToTrash(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
    actorPid?: PlayerId,
    // §1.3の持ち主選択で[ソウルコア]を含める答えが戻ってきたとき（ソウルコア1個ぶんも移す。数値には含めない）
    includeSoul?: boolean,
    srcType?: CardType,
): number {
    // 戻り値＝**実際に取り除けた数**。バトル中の保護やコア下限で減る場合があるため、呼び出し側が残数を数えるときは必ずこれを使う
    const player = state.players[ownerPid]
    // coreReturnBonus の includeTrash 版：トラッシュ行きにも加算する
    const bonus = coreReturnBonusFor(state, ownerPid, true)
    if (bonus > 0 && inst.cores > count) {
        log(state, `トラッシュに置かれるコアが${Math.min(bonus, inst.cores - count)}個追加された。`)
    }
    const soulHere = soulCoreOnInstance(player, inst.instanceId)
    const allowed = effectCoreCap(state, ownerPid, inst, actorPid, srcType)
    // 通常コアだけでは足りない（全部取るときを含む）なら、聞かずに[ソウルコア]も取る（SOULCORE.md §5）
    const includeSoulUnit = soulHere && (includeSoul === true || count + bonus > allowed - 1)
    const soulUnits = includeSoulUnit ? 1 : 0
    const capacity = allowed - (soulHere && !includeSoulUnit ? 1 : 0)
    const removed = Math.min(count + bonus, capacity)
    inst.cores -= Math.max(0, removed - soulUnits)
    if (includeSoulUnit) moveSoulCore(player, { zone: "trash" })
    player.trashCores += removed - soulUnits
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}のコア${removed}個をトラッシュに置いた。`,
    )
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (wouldDeplete(state, ownerPid, inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1, removed)
    }
    return removed
}

// スピリットからコアを取る共通部分（行き先への加算とログは呼び出し側）。自分の効果で動かすときも保護・下限を見る
// （2026-09-26 ユーザー確認）。removeCoresToVoid も同じ中身だがログの順が違うので、取り除く系の器を作るときにまとめる
export function takeCoresFromSpirit(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
    actorPid?: PlayerId,
    srcType?: CardType,
): number {
    const removed = Math.min(count, effectCoreCap(state, ownerPid, inst, actorPid, srcType))
    inst.cores -= removed
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (wouldDeplete(state, ownerPid, inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1, removed)
    }
    return removed
}

// コアを取り除いてボイドへ送る（消滅させる。リザーブ・トラッシュどちらも増えない）。
// 維持コア（Lv1）を下回ったら消滅させる。actorPid の扱いは removeCores と同じ
export function removeCoresToVoid(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
    actorPid?: PlayerId,
    srcType?: CardType,
): number {
    // 戻り値＝**実際に取り除けた数**。バトル中の保護やコア下限で減る場合があるため、呼び出し側が残数を数えるときは必ずこれを使う
    const player = state.players[ownerPid]
    const removed = Math.min(count, effectCoreCap(state, ownerPid, inst, actorPid, srcType))
    inst.cores -= removed
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}のコア${removed}個をボイドに置いた。`,
    )
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (wouldDeplete(state, ownerPid, inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1, removed)
    }
    return removed
}

// globalConstraint "coreFloorByCost"：有効な発生源があれば、スピリット上のコアはそのカードのコスト（Lv1コスト）を下回るまで取り除けない。
// ネクサスは対象外（効果文は「スピリットすべて」なので type==="spirit" のみに適用）。
// **コアの動かし方を問わず効く**（2026-08-24 ユーザー確認）。「少なくならない」は結果の状態を縛る
// 書き方なので、取り除く効果だけでなく**移動・入れ替え**でも下回れない。
// 取り除く系は removeCores/removeCoresToTrash/removeCoresToVoid が、
// 移動・入れ替え系（moveCoresLeavingOne／swapOpponentCores）は各ハンドラがこの関数を直接見る。
export function coreFloorFor(state: GameState, inst: CardInstance, ownerPid?: PlayerId, actorPid?: PlayerId): number {
    // トークンのスピリットも守る対象（「ソーディッシュ」）。ほかの下限は従来どおりカード種別が spirit のものだけ
    if (leavesNothingBehind(inst)) return coreFloorOwnNamedFor(state, inst, ownerPid, actorPid)
    if (getCard(inst.cardId).type !== "spirit") return 0
    return Math.max(coreFloorByCostFor(state, inst, ownerPid, actorPid), coreFloorBlockingKeywordFor(state, inst), coreFloorOwnNamedFor(state, inst, ownerPid, actorPid))
}

// 「このスピリットと、自分の「X」すべてのコアは相手の効果では N 個より少なくならない」。actorPid が相手のときだけ
function coreFloorOwnNamedFor(state: GameState, inst: CardInstance, ownerPid?: PlayerId, actorPid?: PlayerId): number {
    if (ownerPid === undefined || actorPid === undefined || actorPid === ownerPid) return 0
    let floor = 0
    for (const source of state.players[ownerPid].field.spirits) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint" || effect.constraint.type !== "coreFloorOwnNamedByOpponent") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (source.instanceId !== inst.instanceId && !getCard(inst.cardId).name.includes(effect.constraint.nameContains)) continue
            floor = Math.max(floor, effect.constraint.floor)
        }
    }
    return floor
}

// 「〜をブロックしている相手のスピリットのコアは、N個より少なくならない」。ブロックしているのは今のバトルのブロッカーだけ
function coreFloorBlockingKeywordFor(state: GameState, inst: CardInstance): number {
    if (state.battle?.blockerInstanceId !== inst.instanceId) return 0
    let floor = 0
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const attacker = state.players[pid].field.spirits.find((s) => s.instanceId === state.battle?.attackerInstanceId)
        if (!attacker || state.players[pid].field.spirits.some((s) => s.instanceId === inst.instanceId)) continue
        for (const source of effectSources(state, pid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "coreFloorWhileBlockingKeyword") continue
                if (!entryActive(state, pid, source, effect, level)) continue
                if (!spiritHasKeywordOrLabel(state, pid, attacker, effect.constraint.keyword)) continue
                floor = Math.max(floor, effect.constraint.floor)
            }
        }
    }
    return floor
}

function coreFloorByCostFor(state: GameState, inst: CardInstance, ownerPid?: PlayerId, actorPid?: PlayerId): number {
    // ownOnly は発生源の持ち主のスピリットだけを守るので、どちらの発生源から来た制約かを見る必要がある
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, pid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "coreFloorByCost") continue
                if (!entryActive(state, pid, source, effect, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                if (effect.constraint.ownOnly && (ownerPid === undefined || ownerPid !== pid)) continue
                // byOpponentOnly：減らす側が actorPid で、pid（守る側）と同じなら自分自身の減少なので床を張らない
                if (effect.constraint.byOpponentOnly && (actorPid === undefined || actorPid === pid)) continue
                if (!matchesTarget(state, ownerPid ?? pid, inst, effect.constraint.filter, source.instanceId)) continue
                // 「Lv1コスト」＝**Lv1に必要なコア数**（レベル表の「Lv1コスト：1」。2026-08-14 ユーザー確認）。以前はカードの召喚コストとして実装していた
                noteCoverage(effect, "globalConstraint")
                return effect.constraint.floor ?? instMinLevelCores(inst)
            }
        }
    }
    return 0
}

// 効果でスピリットからリザーブへ置かれるコアの追加数（coreReturnBonus）。
// 効果文が「お互いのスピリット上に置かれたコアが」と陣営を限定していないため、**両陣営の発生源**を見る。
// 走査は effectSources 経由＝このターンだけの仮想発生源（マジックが貸した継続効果）も含む
// targetOwnerPid＝コアを取り除かれるスピリットの持ち主。toTrash＝行き先がトラッシュか（既定はリザーブ）
function coreReturnBonusFor(state: GameState, targetOwnerPid: PlayerId, toTrash = false): number {
    let bonus = 0
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, pid)) {
            const level = currentLevel(source).level
            for (const e of getCard(source.cardId).effects) {
                if (e.kind !== "coreReturnBonus") continue
                if (!entryActive(state, pid, source, e, level)) continue
                // 既定はリザーブ行きだけ。includeTrash 指定時はトラッシュ行きにも効く
                if (toTrash && !e.includeTrash) continue
                // targetSide:"opponent"＝発生源の持ち主から見た相手のスピリットから取り除くときだけ
                if (e.targetSide === "opponent" && targetOwnerPid === pid) continue
                // ownBurstOnly＝発生源の持ち主のバースト効果を解決している間だけ
                if (e.ownBurstOnly && !(state.currentEffectSource?.burst && state.currentEffectSource.pid === pid)) continue
                noteCoverage(e, "coreReturnBonus")
                bonus += e.amount
            }
        }
    }
    return bonus
}
