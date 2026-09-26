// スピリット／ネクサスの除去（EffectModules.ts から分割。2026-08-10）
//
// 破壊・消滅・コアの取り除き・手札／デッキへ戻す処理をまとめたもの。
// **中身は移設しただけで、ロジックは一切変えていない。**
//
// ⚠️ EffectModules.ts / triggers.ts とは相互 import の関係にある
// （破壊は誘発を発火し、誘発は破壊を呼ぶ）。GameState.ts ↔ EffectModules.ts と同じ形で、
// CommonJS の循環require（関数宣言はホイストされ、呼び出しは対戦処理中＝読み込み完了後）で安全に動く。
// 呼び出し側の互換のため、EffectModules.ts がここの export を再エクスポートしている
import { randomUUID } from "node:crypto"
import type { CardInstance, CardType, Color, PendingChoice, DestroyContext, GameState, PlayerId, ResumeFrame } from "../type"
import { currentLevel, draw, findInstanceAnywhere, getCard, log, instMinLevelCores, minLevelCores, opponentOf, pushResumeFrames, suspend } from "./GameState"

// 共有ルール層（shared/）へ移設した純粋述語。サーバー／クライアントで同一実装を使う。
// 外部から EffectModules 経由で import している箇所を壊さないため、再エクスポートで名前を残す
// 分割した triggers.ts の関数を内部でも使う（再エクスポートとは別に import が要る）。
// 相互 import になるが CommonJS の循環requireで安全（ファイル冒頭の注記を参照）
import { fireBurstOnEvent, fireFieldEventTriggers, notifyHandGained, notifySpiritCoresRemovedByOpponent } from "./triggers"
import type { FieldEventExtraItem } from "./triggers"
import type { KeywordInfo } from "../../../shared/rules"
import { detachBravesOnLeave } from "./brave"
import { collectReviveEntries, destroyedCostsOf, destroyedFamiliesOf, fushiCandidates, wouldAskReviveConfirm } from "./revive"

export type { KeywordInfo }
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
    instanceSymbolCount,
    instAllCosts,
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
    voidCorePlacementBlocked,
} from "./EffectModules"

// EffectModules.ts から一緒に移した内部ヘルパー（除去処理でしか使われていない）
// 指定インスタンスが今まさにバトルの当事者（アタッカーかブロッカー）か
function isInCurrentBattle(state: GameState, inst: CardInstance): boolean {
    if (!state.battle) return false
    return (
        inst.instanceId === state.battle.attackerInstanceId ||
        inst.instanceId === state.battle.blockerInstanceId
    )
}

// 両陣営のフィールドに、指定タイプの globalConstraint が有効な発生源があるか。
// phase/turn は EffectDef 側（globalConstraint エントリ自身）が持つ（発生源の持ち主基準の turn 判定）
function hasActiveGlobalConstraint(state: GameState, type: string): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const sources = [...state.players[pid].field.spirits, ...state.players[pid].field.nexuses]
        for (const source of sources) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== type) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                return true
            }
        }
    }
    return false
}

// ---- スピリット／ネクサスの除去 ----

// スピリットを破壊（または消滅）：コアをリザーブへ戻し、カードをトラッシュへ。
// cause が "destroy" のときのみ破壊時効果（onDestroy）が誘発する。
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
    // （効果文が名指ししているのは「このスピリットの破壊時」だけなので、他カードが見る一般則イベントは止めない。
    // BS12-052デス・ヘイズ：召喚時に自分のスピリットを好きなだけ破壊するがそれらの破壊時効果は出さない）
    // includeFushi: この破壊で誘発する【不死】も**同じ列**に並べる（docs/design/TIMING_CHART.md）。
    // 破壊のバッチ経由（destroySpiritsFrom）だけが立てる。従来は破壊の外側で別に2択を出していた
    options?: { skipRevive?: true; allowSuspend?: true; suppressOnDestroy?: true; includeFushi?: true },
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

    // 器N（BS12-057ハイドランディア【合体時】/BS12-069定規山脈）：「相手のスピリット/ブレイヴ/マジックの
    // 効果でコアが0個になったとき」は、通常の維持コア割れ（cause:"deplete"＝消滅・onDestroy不発火）ではなく、
    // 最高Lvとして破壊される（onDestroy誘発あり）。currentEffectSourceは resolveAction が効果解決中ずっと
    // 立てているので、ここで「誰の・どの種別の効果の解決中か」を読める（EFFECT_SOURCE_CONTEXT.md）
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
    // 破壊直前のコア数を記録（漆黒鳥ヤタグロスの coreGain: selfCoresAtDestruction）
    inst.coresAtDestruction = inst.cores
    // 「フィールドに残る」の判定に要る材料を、破壊待機状態の間だけ控えておく。
    // ⚠️ 復活チェックは**ここではやらない**。「フィールドに残る」は破壊を無効にするのではなく
    // 「トラッシュに置かれる代わりに場へ戻る」効果なので、**破壊で誘発した効果の列の1項目**として
    // 並べ、ターンプレイヤーが選んだ順で解決する
    // （2026-09-08 ユーザー確認。TIMING_CHART.md「『フィールドに残る／戻る』と『破壊時』」）。
    // 中断・再開の経路もすべて commitPendingDestruction を通るので、そこ1か所で拾える
    if (cause === "destroy" && !options?.skipRevive) {
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
    emitEvent(state, { type: "destroy", pid: ownerPid, cardName: master.name })

    // 破壊された時点でまだバトルが生きているので、アタッカー側だったかをここで確定させる
    // （clearBattle 後には判定できない。attackerOnly の判定に使う）
    const wasAttacker = state.battle?.attackerInstanceId === inst.instanceId
    const byBattle = context?.battle !== undefined
    // 「相手のスピリットの効果で破壊されたとき」（byOpponentSpiritEffectOnly）の判定材料。
    // BS10-012アントイーター/BS10-014闇騎士マリス
    const bySpiritEffect = context?.sourceType === "spirit" && context?.sourcePid !== undefined && context.sourcePid !== ownerPid
    const sourceInstanceId = context?.sourceInstanceId
    // 「自分のスピリットが相手によって破壊されたとき」（byOpponentEffectOnly。BS12-005星角獣ユニゴーント）：
    // バトルのBP比較で敗れた場合も、相手のスピリット/ネクサス/マジックの効果による場合も含める
    const byOpponentEffect = byOpponentEffectOf(context, ownerPid) || byBattle
    // 破壊後バースト用の控え（commitPendingDestructionが読む。BS16バッチ0）。
    // BPは破壊直前（まだ場にいる・コアも乗ったまま）のこの時点で確定させる
    inst.pendingDestroyBurstInfo = { byOpponentEffect, bp: effectiveBp(state, ownerPid, inst) }

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
    if (cause === "destroy" && !options?.suppressOnDestroy && hasOwnDestroyTrigger(inst)) {
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
    // （＝「残るを先に解決したら【不死】は撃てない」。従来は破壊の外側の2択で表していた）
    if (cause === "destroy" && options?.includeFushi) {
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
    fireOwnSpiritDestroyed(state, ownerPid, inst, byBattle, wasAttacker, bySpiritEffect, byOpponentEffect, sourceInstanceId, extraItems)
    if (state.pendingChoice || state.winner) {
        suspendDestroyCommit(state, ownerPid, inst, 2, byBattle, wasAttacker, bySpiritEffect, byOpponentEffect, sourceInstanceId)
        return true
    }

    // ＞６-3/4：破壊待機状態を解いて、カードをトラッシュへ・コアをリザーブへ
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
    // 勝敗が決まっているならもう盤面は動かさない（待機のまま終わってよい）
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

// フィールドイベント誘発「自分のスピリットが破壊されたとき」：cause問わず（消滅も含む）持ち主側で発火
// （侵食されゆく銀世界Lv2）。破壊されたスピリットの色（colorFilter判定用。祝福されし大聖堂）と、
// バニラ判定・バトル破壊判定（vanillaOnly／byBattleOnly。運命分かつ岐路）を渡す。
// selfOverrideに破壊されたスピリット自身を渡す（BS05永久氷殿：maxBpFromSelfで
// 「破壊されたスピリットのBP以下」を参照できるようにする）
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
    fireFieldEventTriggers(state, ownerPid, "ownSpiritDestroyed", { pid: ownerPid, inst }, master.colors, undefined, undefined, {
        vanilla: instIsVanilla(inst),
        byBattle,
        wasAttacker,
        // kind:"burst".destroyedMinBp用（BS15-034）：破壊直前の実効BPの近似値。既にフィールドから
        // 離れている場合があるためeffectiveBpはオーラ等を欠くことがあるが、破壊直前の状態を極力保つ
        destroyedBp: effectiveBp(state, ownerPid, inst),
        bySpiritEffect,
        // 「自分のスピリットが相手によって破壊されたとき」（byOpponentEffectOnly。BS12-005星角獣ユニゴーント）
        byOpponentEffect,
        ...(sourceInstanceId !== undefined ? { sourceInstanceId } : {}),
        families: master.family,
        // instAllCosts：破壊されたスピリットの本来のコストに加え、道化師クランの付与コストも含める
        costs: instAllCosts(inst),
        // extraSources に破壊された個体自身を渡す。effectSources はもう場にいないものを返さないため、
        // これが無いと fieldEvent の selfOnly（「このスピリットが破壊されたとき」）が無言で発火しない
    }, [inst], extraItems, undefined, true) // skipBurst：破壊後バーストはここでは判定しない（commitPendingDestructionが積み、fireQueuedDestroyBurstsがトラッシュ行き確定後に発火させる。BS16バッチ0）
    // フィールドイベント誘発「相手のスピリットが破壊されたとき」：破壊された側から見た**相手**の
    // フィールドで発火する（anyNexusDestroyed が両陣営を順に焚くのと同じ形）。手段は問わない
    // exhaustOpponentSameFamilyAll（BS16-027）が読む橋渡し。同時破壊なら破壊待機の全員の系統
    state.lastOpponentSpiritDestroyedFamilies = state.destroyGroup?.familiesByPid[ownerPid] ?? master.family
    fireFieldEventTriggers(state, opponentOf(ownerPid), "opponentSpiritDestroyed", { pid: ownerPid, inst }, master.colors, undefined, undefined, {
        byBattle,
        bySpiritEffect,
        byOpponentEffect,
        families: master.family,
        costs: instAllCosts(inst),
    })
}

// 中断していた破壊処理の続き（drainResumeStack から呼ぶ）
export function resumeDestroyCommit(
    state: GameState,
    frame: Extract<ResumeFrame, { kind: "destroyCommit" }>,
): void {
    const inst = state.players[frame.pid].field.spirits.find((s) => s.instanceId === frame.instanceId)
    // 誘発の解決中に復活した／場から居なくなったなら、破壊は成立しない
    if (!inst || !inst.pendingDestruction) return
    if (frame.step <= 1) {
        fireOwnSpiritDestroyed(state, frame.pid, inst, frame.byBattle, frame.wasAttacker, frame.bySpiritEffect, frame.byOpponentEffect, frame.sourceInstanceId)
        if (state.pendingChoice || state.winner) {
            suspendDestroyCommit(state, frame.pid, inst, 2, frame.byBattle, frame.wasAttacker, frame.bySpiritEffect, frame.byOpponentEffect, frame.sourceInstanceId)
            return
        }
    }
    commitPendingDestruction(state, frame.pid, inst)
    // グループ外の単体破壊の再開ならここで発火（destroySpirit本体と同じ規則。BS16バッチ0）
    if (!state.destroyGroup) fireQueuedDestroyBursts(state)
}

// この個体が『このスピリットの破壊時』エントリを1つでも持つか（列に並べるかの判定）
function hasOwnDestroyTrigger(inst: CardInstance): boolean {
    return getCard(inst.cardId).effects.some((e) => e.kind === "triggered" && e.trigger === "onDestroy")
}

// 破壊待機状態のカードを実際にトラッシュへ置き、乗っていたコアをリザーブへ移す（＞６の3と4）。
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
    // 破壊後バースト（kind:"burst".event:"ownSpiritDestroyed"）用の材料を、トラッシュ行きが確定した
    // このタイミングで控える。**まだ合体中のここで**捕える（instColors／instAllCostsはbraveComposite経由で
    // 合体中のブレイヴの色・コストを含むため。detachBravesOnLeaveの後では読めなくなる）。
    // hostCostはブレイヴぶんを差し引いた「ホスト自身のコスト」（braves側で改めて足す。TIMING_CHART.md ＞６）。
    // 発火自体はここではしない（ブレイヴを残す/残さない確認が残っていることがあるため、
    // handleAction末尾のfireQueuedDestroyBurstsへ委ねる。BS16バッチ0）
    const burstInfo = inst.pendingDestroyBurstInfo
    delete inst.pendingDestroyBurstInfo
    ;(state.pendingBurstDestroyQueue ??= []).push({
        pid: ownerPid,
        groupKey: state.destroyGroup?.id ?? inst.instanceId,
        cardId: inst.cardId,
        colors: instColors(inst),
        hostCost: instAllCosts(inst)[0]! - (inst.braveComposite?.cost ?? 0),
        braves: bravesOf(player, inst).map((b) => ({ instanceId: b.instanceId, cost: instAllCosts(b)[0]! })),
        byOpponentEffect: burstInfo?.byOpponentEffect ?? false,
        destroyedBp: burstInfo?.bp ?? 0,
    })
    player.field.spirits.splice(index, 1)
    player.trashCards.push(inst.cardId)
    // 破壊されたスピリット上のコアは通常リザーブへ戻るが、
    // destroyedCoresToTrash（古龍の縄張りLv1）が有効な間、または現在のバトルで
    // battleOpponentDestroyedCoresTo がこのプレイヤーを指している間は、その行き先へ置く（void はどこにも足さない）
    const redirect = timedContentsFor(state, ownerPid).find((c) => c.type === "destroyedCoresTo")?.to
    if (redirect === "void") {
        // ボイドへ：ゲームから取り除く
    } else if (redirect === "trash" || destroyedCoresGoToTrash(state)) {
        player.trashCores += inst.cores
    } else {
        player.reserve += inst.cores
    }
    delete inst.pendingDestruction
    // 合体していたブレイヴを外す（§6.1.1）。**コアを移した後**に呼ぶ：
    // ホストのコアがリザーブに入ってからブレイヴに置くのが正しい順（§6.3.1）
    detachBravesOnLeave(state, ownerPid, inst)
}

// 破壊後バースト（kind:"burst".event:"ownSpiritDestroyed"）を、pendingBurstDestroyQueueにたまった分だけ
// まとめて発火する。handleAction の末尾（ブレイヴの「残す/残さない」確認まで含め、すべて決着した安全な地点）
// から呼ぶ。groupKey＋持ち主単位でまとめ、同時破壊グループは1回にする（TIMING_CHART.md ＞６：
// 破壊時効果・破壊されたとき効果 → 破壊後バースト。BS16バッチ0）
export function fireQueuedDestroyBursts(state: GameState): void {
    if (state.pendingChoice || state.winner) return
    // ブレイヴの「残す/残さない」がまだ決着していない間は、コストが確定しないので待つ
    if ((state.pendingBraveKeeps?.length ?? 0) > 0) return
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
        let destroyedBp = 0
        let byOpponentEffect = false
        for (const m of members) {
            for (const c of m.colors) colors.add(c)
            // 一緒にトラッシュへ行ったブレイヴぶんのコストだけ足す（残したブレイヴは今フィールドにいる）
            const braveCost = m.braves
                .filter((b) => !player.field.spirits.some((s) => s.instanceId === b.instanceId))
                .reduce((sum, b) => sum + b.cost, 0)
            costs.push(m.hostCost + braveCost)
            destroyedBp = Math.max(destroyedBp, m.destroyedBp)
            byOpponentEffect ||= m.byOpponentEffect
        }
        // destroyedAsTarget：グループが1体だけのときのみcardIdを渡す（複数体では1枚に決まらないため対象外。BS16バッチ0の簡略化）
        const selfOverride = { pid, ...(members.length === 1 ? { cardId: members[0]!.cardId } : {}) }
        fireBurstOnEvent(state, pid, "ownSpiritDestroyed", selfOverride, [...colors], undefined, {
            byOpponentEffect,
            destroyedBp,
            costs,
        })
    }
}

// 手札のカード自身が持つ「相手のスピリットの効果で手札から破棄されたとき、コストを支払わずに
// 召喚できる」（BS09-025忍者サルトベ）。**破棄されてトラッシュに置かれた直後**に呼ぶ。
// 召喚できたら true を返し、呼び出し側はトラッシュからそのカードを取り除いてある前提で進む
export function tryFreeSummonOnHandDiscard(
    state: GameState,
    targetPid: PlayerId,
    cardId: string,
    sourceType: CardType | undefined,
    sourcePid: PlayerId,
): boolean {
    // 「相手の**スピリット**の効果で」＝発生源がスピリットで、かつ破棄された側とは別のプレイヤー
    if (sourceType !== "spirit" || sourcePid === targetPid) return false
    if (state.pendingChoice || state.winner) return false
    const effect = getCard(cardId).effects.find((e) => e.kind === "freeSummonFromHandOnDiscardedByOpponent")
    if (!effect) return false
    const player = state.players[targetPid]
    // 維持コアを置けないなら召喚できない
    if (player.reserve < minLevelCores(getCard(cardId))) return false
    const index = player.trashCards.lastIndexOf(cardId)
    if (index === -1) return false
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

// 手札のカード自身が持つ「ライフが減ったとき、コストを支払わずに召喚できる」（BS08猫娘アニー）。
// ownLifeDamaged の発火点から呼ぶ。実対戦では確認を出し、非対話では自動で召喚する
export function tryHandFreeSummonOnLifeDamaged(state: GameState, pid: PlayerId): void {
    if (state.pendingChoice || state.winner) return
    const player = state.players[pid]
    for (let i = 0; i < player.hand.length; i++) {
        const cardId = player.hand[i]
        if (cardId === undefined) continue
        const effect = getCard(cardId).effects.find((e) => e.kind === "freeSummonFromHandOnLifeDamaged")
        if (!effect || effect.kind !== "freeSummonFromHandOnLifeDamaged") continue
        if (effect.phaseTurn) {
            // phase 省略＝ステップ不問（turn 条件だけ見る）
            if (effect.phaseTurn.phase !== undefined && state.phase !== effect.phaseTurn.phase) continue
            if (effect.phaseTurn.turn === "own" && pid !== state.turnPlayer) continue
            if (effect.phaseTurn.turn === "opponent" && pid === state.turnPlayer) continue
        }
        // condition（BS09-035巨獣皇スミドロード＝自分のライフが3以下なら）。
        // この関数はライフが減った**後**に呼ばれるので、減った後のライフで判定される
        if (effect.condition && player.life > effect.condition.ownLifeAtMost) continue
        // 維持コアを置けないなら召喚できないので、確認自体を出さない
        if (player.reserve < minLevelCores(getCard(cardId))) continue
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

// pendingChoice（手札からの無償召喚の確認）で「召喚する」が選ばれたときの後処理。
// 確認を出したあとに手札から失われていた場合は何もしない
export function applyHandFreeSummon(
    state: GameState,
    info: NonNullable<PendingChoice["handFreeSummon"]>,
): void {
    const index = state.players[info.pid].hand.indexOf(info.cardId)
    if (index === -1) return
    summonFreeFromHandIndex(state, info.pid, getCard(info.cardId).name, index)
}

// 直前の「どの体から破壊処理をするか」で指名された個体を、残りの先頭（index）へ入れ替える。
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

// 複数体をまとめて破壊する（1体ごとに「破壊される代わりに復活できる」の確認で中断しうる）。
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
    for (let i = startIndex; i < targets.length; i++) {
        // 同時破壊で「フィールドに残る」の確認が2体以上に出るなら、
        // どの体から破壊処理をするかをターンプレイヤーが決める（docs/design/TIMING_CHART.md §0-3）。
        // 直前の選択で指名された個体があればそれを先頭へ入れ替え、無ければ必要に応じて聞く
        if (!applyDestroyOrderPick(state, targets, i) && askDestroyOrder(state, targets, i, context)) {
            return { destroyed, stoppedAt: i }
        }
        const t = targets[i]
        if (!t) continue
        const ctx = t.context ?? context
        // 【不死】（BS09）も「フィールドに残る」も、いまは destroySpirit の中で
        // **破壊で誘発した効果の1つの列**として解決される（docs/design/TIMING_CHART.md）。
        // かつてここにあった「破壊 or 不死」の2択は、その列に統合したので消した（2026-09-08）
        if (destroySpirit(state, t.pid, t.instanceId, "destroy", ctx, { allowSuspend: true, includeFushi: true })) {
            destroyed++
        }
        if (state.winner) return { destroyed, stoppedAt: targets.length }
        // 復活の確認で中断した。**この対象はまだ決着していない**ので、次から再開する
        // （確認の答えは applyReviveConfirm / declineReviveConfirm が決着させる）
        if (state.pendingChoice) return { destroyed, stoppedAt: i + 1 }
    }
    return { destroyed, stoppedAt: targets.length }
}

// 事前に確定した対象リストをまとめて破壊する（呼び出し元の定型）。
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
    // 破壊待機のスピリットすべての系統を持ち主ごとに控える（BS16-027 は1回の誘発で全員を参照する。2026-09-22 ユーザー確認）
    const familiesByPid: Partial<Record<PlayerId, string[]>> = {}
    for (const t of targets) {
        const inst = state.players[t.pid].field.spirits.find((s) => s.instanceId === t.instanceId)
        if (!inst) continue
        familiesByPid[t.pid] = [...new Set([...(familiesByPid[t.pid] ?? []), ...getCard(inst.cardId).family])]
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
    // グループの外（入れ子の破壊でなければ）に戻ったところで、破壊後バーストをまとめて発火する（BS16バッチ0）
    if (!state.destroyGroup) fireQueuedDestroyBursts(state)
    if (state.winner) return destroyed
    if (after) applyDestroyBatchAfter(state, ownerPid, destroyed, after)
    return destroyed
}

// 破壊バッチの続きを回す。1体ごとに「破壊される代わりに復活できる」の確認で中断しうるので、
// 途中で止まったらフレームを積み直して抜ける（destroyed は中断をまたいで持ち回る）。
// 全部終わったら after（破壊できた数を使う処理）を適用する
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
    // thenDrawFixed（BS14-010）：破壊できた数によらず固定枚数ドロー（「その後」）。0体破壊でも発火する
    if (after.thenDrawFixed) draw(state, ownerPid, after.thenDrawFixed)
    if (destroyed <= 0) return
    if (after.drawPerDestroyed) draw(state, ownerPid, destroyed)
    if (after.voidCoreToSelfPerDestroyed && after.selfInstanceId) {
        const self = findInstanceAnywhere(state, after.selfInstanceId)
        if (self && voidCorePlacementBlocked(state)) {
            log(state, `${getCard(self.cardId).name}：コアステップ以外はボイドからコアを置けないため置かなかった。`)
        } else if (self) {
            placeCoresOnSpirit(state, self, destroyed, ownerPid)
            log(
                state,
                `${getCard(self.cardId).name}は、破壊した${destroyed}体につきボイドからコア${destroyed}個を自身の上に置いた。`,
            )
        }
    }
}

// 破壊対象ネクサスの持ち主（ownerPid）自身のフィールド（スピリット＋ネクサス）のみを走査し、
// レベル有効かつ condition（ownVanillaSpiritsAtLeast＝持ち主のバニラスピリット数）を満たす
// globalConstraint "ownNexusIndestructible" があるか判定する。
// hasGlobalConstraint は両陣営を走査する汎用判定だが、こちらは破壊対象の持ち主側のみに効く
// 制約（サファイアの城壁）専用の判定のため別関数にしている。
function hasOwnNexusIndestructible(
    state: GameState,
    ownerPid: PlayerId,
    target?: CardInstance,
    context?: DestroyContext,
): boolean {
    const player = state.players[ownerPid]
    const instances = [...player.field.spirits, ...player.field.nexuses]
    for (const inst of instances) {
        const level = currentLevel(inst).level
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "ownNexusIndestructible") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // colors（BS09-062ノルンの泉Lv2＝白/黄のネクサスだけ）：対象が分からないときは守らない側に倒す
            if (effect.constraint.colors !== undefined) {
                if (!target) continue
                if (!effect.constraint.colors.some((c) => instHasColor(target, c))) continue
            }
            // nameIncludes（SD06-012英雄皇の御盾Lv2＝カード名に「英雄皇」と入っているネクサスだけ）：対象が分からないときは守らない側に倒す
            if (effect.constraint.nameIncludes !== undefined) {
                if (!target) continue
                if (!cardNameContains(target, effect.constraint.nameIncludes)) continue
            }
            // sourceColors / sourceTypes（SD01-032 機械神の加護＝「相手の赤のスピリット/マジックの効果では」）：
            // 破壊しようとしている効果の発生源で絞る。発生源が分からないときは守らない側に倒す
            if (effect.constraint.sourceColors !== undefined || effect.constraint.sourceTypes !== undefined) {
                if (!context || context.sourcePid === undefined) continue
                if (context.sourcePid === ownerPid) continue
                if (
                    effect.constraint.sourceColors !== undefined &&
                    !effect.constraint.sourceColors.some((c) => (context.sourceColors ?? []).includes(c))
                ) {
                    continue
                }
                if (
                    effect.constraint.sourceTypes !== undefined &&
                    (context.sourceType === undefined || !effect.constraint.sourceTypes.includes(context.sourceType))
                ) {
                    continue
                }
            }
            if (effect.condition?.ownVanillaSpiritsAtLeast !== undefined) {
                const vanillaCount = player.field.spirits.filter((s) =>
                    instIsVanilla(s),
                ).length
                if (vanillaCount < effect.condition.ownVanillaSpiritsAtLeast) continue
            }
            // 「自分のネクサスすべてが黄の間」（BS11-069 黄金の鐘楼）。発生源自身も数に入る
            if (effect.condition?.allOwnNexusesHaveColor !== undefined) {
                const color = effect.condition.allOwnNexusesHaveColor
                if (!player.field.nexuses.every((n) => instHasColor(n, color))) continue
            }
            // 「自分のフィールドにネクサスが1つだけある間」（BS11-027 海戦機ニヨルドLv2）
            if (effect.condition?.ownNexusCountExactly !== undefined) {
                if (player.field.nexuses.length !== effect.condition.ownNexusCountExactly) continue
            }
            return true
        }
    }
    return false
}

// ネクサスを破壊する。破壊できたら true、破壊耐性（nexusIndestructible）で不発だった場合は false を返す
// （呼び出し側は戻り値でカウント・ドロー処理の可否を判定する。バスタースピア等）。
export function destroyNexus(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
    context?: DestroyContext,
): boolean {
    const player = state.players[ownerPid]
    const index = player.field.nexuses.findIndex(
        (n) => n.instanceId === instanceId,
    )
    if (index === -1) return false
    const inst = player.field.nexuses[index]
    if (!inst) return false
    // 破壊耐性（要塞皇オーディーンLv2-3等）：すべてのネクサスは破壊されない
    if (hasGlobalConstraint(state, "nexusIndestructible")) {
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}（ネクサス）は破壊されなかった（破壊耐性）。`,
        )
        return false
    }
    // 破壊耐性（サファイアの城壁Lv2）：破壊対象ネクサスの持ち主自身のフィールドに、
    // condition（バニラスピリット数）を満たす ownNexusIndestructible 発生源があれば破壊されない
    if (hasOwnNexusIndestructible(state, ownerPid, inst, context)) {
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}（ネクサス）は破壊されなかった（破壊耐性）。`,
        )
        return false
    }
    // 破壊待機状態のネクサスは、そこからさらに破壊されない（TIMING_CHART.md §1.5）
    if (inst.pendingDestruction) return false
    // ＞６：まず**破壊待機状態**にする。カードはフィールドに残り、コアも乗ったまま。
    // この間もネクサスの効果（誘発・継続効果）は普通に働く（2026-08-14 ユーザー確認）
    inst.pendingDestruction = true
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）は破壊された。`)
    // 直近に破壊されたネクサスを記録する（戦闘獣ジャッカーが「その破壊されたネクサス」を参照するため）
    state.lastDestroyedNexus = { pid: ownerPid, cardId: inst.cardId }
    driveNexusDestruction(state, ownerPid, inst, 1, byOpponentEffectOf(context, ownerPid))
    return true
}

// 「相手の効果で破壊されたとき」限定のエントリ（BS07の各色ネクサス6枚）の判定材料。
// 効果による破壊か（sourceType あり）＋発生源が持ち主自身でないか
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
): void {
    for (let step = startStep; step <= 4; step++) {
        switch (step) {
            // フィールドイベント誘発「ネクサスが破壊されたとき」：破壊した/された側を問わず
            // 両陣営のフィールドから発火（竜狩りのアーケオルニ）。
            // バウンス（returnNexusToHand）はここを通らないため対象外
            case 1:
                fireFieldEventTriggers(state, ownerPid, "anyNexusDestroyed")
                break
            case 2:
                fireFieldEventTriggers(state, opponentOf(ownerPid), "anyNexusDestroyed")
                break
            // フィールドイベント誘発「自分のネクサスが破壊されたとき」：持ち主側のフィールドからのみ
            // 発火（シャークハンマー）。破壊されたネクサス自身は**破壊待機状態でまだ場にいる**ので、
            // 「自分のネクサスが破壊されたとき」をそのネクサス自身が持つ形（BS07の各色ネクサス6枚）も
            // 走査にそのまま含まれる（以前は場から外していたため extraSources で補っていた）
            case 3:
                // eventColors には**破壊されたネクサスの色**を渡す。
                // 渡さないと fieldEvent.colorFilter が常に外れる（「自分の緑のネクサスが破壊されたとき」＝
                // BS11-066 発見されし世界樹。2026-09-02 まで配線されておらず、条件付きの誘発は常に不発だった）
                fireFieldEventTriggers(state, ownerPid, "ownNexusDestroyed", undefined, instColors(inst), undefined, undefined, {
                    byOpponentEffect,
                })
                break
            // ＞６-3/4：破壊待機状態を解いて、カードをトラッシュへ・コアをリザーブへ
            default:
                commitPendingNexusDestruction(state, ownerPid, inst)
                return
        }
        if (state.winner) {
            commitPendingNexusDestruction(state, ownerPid, inst)
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
                },
            ])
            return
        }
    }
}

// 中断していたネクサスの破壊処理の続き（drainResumeStack から呼ぶ）
export function resumeDestroyNexusCommit(
    state: GameState,
    frame: Extract<ResumeFrame, { kind: "destroyNexusCommit" }>,
): void {
    const inst = state.players[frame.pid].field.nexuses.find((n) => n.instanceId === frame.instanceId)
    if (!inst || !inst.pendingDestruction) return
    driveNexusDestruction(state, frame.pid, inst, frame.step, frame.byOpponentEffect)
}

// 破壊待機状態のネクサスを実際にトラッシュへ置き、乗っていたコアをリザーブへ移す（＞６の3と4）
export function commitPendingNexusDestruction(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): void {
    if (!inst.pendingDestruction) return
    const player = state.players[ownerPid]
    const index = player.field.nexuses.findIndex((n) => n.instanceId === inst.instanceId)
    if (index === -1) {
        delete inst.pendingDestruction
        return
    }
    player.field.nexuses.splice(index, 1)
    player.trashCards.push(inst.cardId)
    player.reserve += inst.cores
    delete inst.pendingDestruction
}

// ネクサスを持ち主の手札へ戻す（バウンス）：コアはリザーブへ、カードは手札へ。
// 破壊ではないため destroyNexus とは別処理（ネクサスに onDestroy はまだないが将来のため命名を揃える）。
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
    player.reserve += inst.cores
    player.hand.push(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）は手札に戻った。`)
    emitEvent(state, { type: "returnToHand", pid: ownerPid, cardName: getCard(inst.cardId).name })
    notifyHandGained(state, ownerPid, 1)
}

// ネクサスを持ち主のデッキの下（末尾）へ戻す：コアはリザーブへ、カードはデッキの下へ。
// returnNexusToHand のデッキ下版。代替召喚コストの支払い（BS10-058水星神龍メルクリウス・サーペント：
// 青のネクサス1つをデッキの下に戻すことで、コストを支払わずに召喚できる）に使う。
// 破壊ではないため onDestroy は誘発しない
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
    player.reserve += inst.cores
    player.deck.push(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）はデッキの下に戻った。`)
}

// ネクサスを持ち主のデッキの上へ戻す：returnNexusToDeckBottomのデッキ上版（unshift）。
// コアはリザーブへ、カードはデッキの一番上へ。破壊ではないため onDestroy は誘発しない
// （BS13-055重装合体シールド・ドラゴンMk-II：「相手のネクサス1つをデッキの上に戻す」）
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
    player.reserve += inst.cores
    player.deck.unshift(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）はデッキの上に戻った。`)
}

// スピリットを持ち主の手札へ戻す（バウンス）。
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
// 器AO：いま解決中の効果の持ち主に「手札に戻る先をデッキの上へ」が張られているか
// （GameState.currentEffectSource が効果の持ち主を指す。効果の解決中でなければ常に false）
function bouncesToDeckTop(state: GameState): boolean {
    const pid = state.currentEffectSource?.pid
    if (pid === undefined) return false
    return timedPlayerRules(state, pid).some((c) => c.type === "bounceToDeckTopForPid")
}

// 器BS16：globalConstraint "allSpiritsCantBounce"（BS16-012金狐角）。両陣営のeffectSourcesを
// 走査し、kind:"globalConstraint"のphase/turnフィールド（発生源の持ち主基準）も見る
// （hasGlobalConstraintは汎用関数のためphase/turnを見ない＝battlingCoresProtected等と同じく専用関数を書く）
function allSpiritsCantBounceActive(state: GameState): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, pid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "allSpiritsCantBounce") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                return true
            }
        }
    }
    return false
}

export function markBounce(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    to: "hand" | "deckTop" | "deckBottom",
    sourceName?: string,
): void {
    const player = state.players[ownerPid]
    if (!player.field.spirits.some((s) => s.instanceId === inst.instanceId)) return
    if (inst.pendingBounce) return
    if (allSpiritsCantBounceActive(state)) return
    // 器AO：いま解決中の効果の持ち主が「このターンの間、自分の効果で手札に戻るスピリットは
    // 持ち主のデッキの上に戻る」を張っていれば、手札への戻しをデッキの上へ振り替える
    // （BS13-079ヴァニシングデイ）。**手札への戻しはすべてここを通る**ので、
    // 「〜を手札に戻すことで」のコスト支払いも同じ扱いになる
    inst.pendingBounce = { to: to === "hand" && bouncesToDeckTop(state) ? "deckTop" : to }
    if (sourceName !== undefined) bounceSourceNames.set(inst.instanceId, sourceName)
}

// バウンスの発生源カード名（ログ用）。CardInstance に持たせると盤面の状態が増えるので、
// **待機中だけの一時情報**としてここに置く（flushBounces が使い終わったら消す）
const bounceSourceNames = new Map<string, string>()

// バウンス待機状態のカードを実際に手札／デッキへ移し、そのあとで誘発をまとめて発揮する。
// **バウンス効果の解決が終わった時点で呼ぶ**。
//
// 移動を先に全部済ませてから誘発するのが要点（Wiki：待機中の「戻るとき」効果は割り込まない）。
// 1体戻すごとに誘発していると、その誘発が2体目以降の対象を変えてしまう
// （例：紅玉の火山弾＝地竜が手札に戻ったとき相手1体を破壊、とまとめ戻しの組み合わせ）
//
// order（instanceId の列）を渡すと**その順に移す**。「好きな順番でデッキの下に戻す」
// （BS06颶風高原Lv2）のように、プレイヤーが決めた順番がデッキの並びに出る効果で使う。
// 列に無いものは従来どおりフィールドの並び順で、そのあとに続く
export function flushBounces(state: GameState, order?: string[]): void {
    const moved: { pid: PlayerId; inst: CardInstance; to: "hand" | "deckTop" | "deckBottom" }[] = []
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
            player.reserve += inst.cores
            detachBravesOnLeave(state, pid, inst) // 合体していたブレイヴを外す（§6.1.1。コアを移した後。§6.3.1）
            delete inst.pendingBounce
            const sourceName = bounceSourceNames.get(inst.instanceId)
            bounceSourceNames.delete(inst.instanceId)
            const name = getCard(inst.cardId).name
            const prefix = sourceName !== undefined ? `${sourceName}：` : ""
            if (pb.to === "hand") {
                player.hand.push(inst.cardId)
                log(state, `${prefix}${player.name}の${name}は手札に戻った。`)
                emitEvent(state, {
                    type: "returnToHand",
                    pid,
                    cardName: name,
                    ...(sourceName !== undefined ? { sourceName } : {}),
                })
            } else {
                const top = pb.to === "deckTop"
                if (top) player.deck.unshift(inst.cardId)
                else player.deck.push(inst.cardId)
                log(state, `${prefix}${player.name}の${name}はデッキの一番${top ? "上" : "下"}に戻った。`)
                emitEvent(state, {
                    type: "returnToDeck",
                    pid,
                    cardName: name,
                    position: top ? "top" : "bottom",
                    ...(sourceName !== undefined ? { sourceName } : {}),
                })
            }
            moved.push({ pid, inst, to: pb.to })
        }
    }
    if (moved.length === 0) return
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const n = moved.filter((m) => m.pid === pid && m.to === "hand").length
        if (n > 0) notifyHandGained(state, pid, n)
    }
    fireBounceTriggers(state, moved, 0)
}

// 移動後の誘発をまとめて発揮する。**選択待ちで中断したら残りを再開スタックへ送る**
// （割り込まれる側の作法。docs/design/RESUME_STACK.md）
export function fireBounceTriggers(
    state: GameState,
    moved: { pid: PlayerId; inst: CardInstance; to: "hand" | "deckTop" | "deckBottom" }[],
    from: number,
): void {
    for (let i = from; i < moved.length; i++) {
        const m = moved[i]!
        if (state.winner) return
        // フィールドイベント誘発「自分のスピリットが手札に戻ったとき」（BS01リターンドロー）。
        // self には戻ったスピリットを渡す（すでにフィールドからは外れている）
        if (m.to === "hand") {
            fireFieldEventTriggers(state, m.pid, "ownSpiritReturnedToHand", { pid: m.pid, inst: m.inst }, instColors(m.inst))
            // 「**相手の**スピリットが手札に戻ったとき」を書けるように、両者のフィールド発生源にも配る
            // （subjectSide で主体の陣営を絞る。anySpiritAttacked と同じ形。BS12-040 天王神龍スレイ・カエルス）
            for (const pid of ["p1", "p2"] as PlayerId[]) {
                fireFieldEventTriggers(state, pid, "anySpiritReturnedToHand", { pid: m.pid, inst: m.inst }, instColors(m.inst))
            }
        }
        if (state.pendingChoice) {
            if (i + 1 < moved.length) {
                pushResumeFrames(state, [{ kind: "bounceFlush", moved, index: i + 1 }])
            }
            return
        }
    }
}

// スピリットを持ち主のデッキの一番上へ戻す：コアはリザーブへ、カードはデッキトップへ。
// 破壊ではないため onDestroy は誘発しない。
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

// スピリットをデッキの一番下へ戻す（returnSpiritToDeckTop のデッキ下版。BS04グラシアルブレス）。
// 上に置くか下に置くかだけの違いなので、コアの戻し先など他の扱いは揃えてある
export function returnSpiritToDeckBottom(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    // 効果の発生源カード名。渡すとログの先頭に出す（颶風高原Lv2 で「何によって戻ったか」が分かるように）
    sourceName?: string,
): void {
    markBounce(state, ownerPid, inst, "deckBottom", sourceName)
    flushBounces(state)
}

// 相手のスピリットからコアを奪う効果が、そのスピリットに届くか（＝耐性で弾かれないか）。
//
// **なぜ必要か**: コアを1体ずつ選んで取る効果（coreRemove 等）は、対象選びの中で
// pickEnemyByBp / pickEnemyCandidates が装甲・免疫を弾いてくれる。しかし「範囲でまとめて奪う」
// 効果（幻龍シェイロン・氷の女神フリッグ等）は候補を自前で走査するため、その経路を通らず
// **【装甲】を素通りしていた**（2026-08-10 修正）。
// 現在は耐性の唯一の入口（resistanceAgainst）へ委譲している。この関数はコア除去用の別名にすぎず、
// **新しく書くハンドラは resistanceAgainst を直接呼んでよい**
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

// コアを取り除き、維持コア（Lv1）を下回ったら消滅させる
// actorPid: このコア除去を引き起こした実行者（省略時は通知なし）。
// actorPid !== ownerPid（自分以外の効果でコアが取り除かれた）のとき、
// フィールドイベント「ownSpiritCoresRemovedByOpponent」を発火する（極光の大地）
export function removeCores(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
    actorPid?: PlayerId,
    // このコア除去を引き起こした効果の種別（BS12-X02魔羯邪神シュタイン・ボルグ：
    // coresToOpponentReserveGoToTrash の判定に使う。省略時＝ネクサス扱いと同じ「対象外」に倒す）
    srcType?: CardType,
): number {
    // 戻り値＝**実際に取り除けた数**。バトル中の保護（BS05茨の決戦地Lv1）やコア下限
    // （BS08聖なる柱状彫刻）で減る場合があるため、呼び出し側が残数を数えるときは必ずこれを使う
    if (isBattlingCoreProtected(state, inst)) {
        log(state, `${getCard(inst.cardId).name}は、バトル中のためコアを取り除けなかった。`)
        return 0
    }
    const player = state.players[ownerPid]
    // coreReturnBonus（BS02チャウーLv2）：効果でリザーブへ置かれるコアの数を+する（両陣営の発生源が効く）。
    // 元のコア数を超えては取れないので、加算してから inst.cores で頭打ちにする
    const bonus = coreReturnBonusFor(state, ownerPid)
    if (bonus > 0 && inst.cores > count) {
        log(state, `リザーブに置かれるコアが${Math.min(bonus, inst.cores - count)}個追加された。`)
    }
    // coreFloorByCost（BS08聖なる柱状彫刻）：有効なら、このカードのコストを下回るまでは取り除けない
    const floor = coreFloorFor(state, inst, ownerPid)
    const removed = Math.min(count + bonus, Math.max(0, inst.cores - floor))
    inst.cores -= removed
    // coresToOpponentReserveGoToTrash（BS12-X02）：本来リザーブへ置かれるはずのコアを、
    // 発生源の持ち主から見た相手（＝ownerPid）のトラッシュへ振り替える
    if (removed > 0 && coresToOpponentReserveGoToTrash(state, ownerPid, srcType)) {
        player.trashCores += removed
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}からコア${removed}個を取り除き、リザーブの代わりにトラッシュに置いた。`,
        )
    } else {
        player.reserve += removed
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}からコア${removed}個を取り除いた。`,
        )
    }
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (inst.cores < instMinLevelCores(inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1, removed)
    }
    return removed
}

// コアを取り除いて持ち主のトラッシュへ置き、維持コア（Lv1）を下回ったら消滅させる
// （魔帝の墓標Lv2「そのスピリット上のコア1個をトラッシュに置かなければならない」）
// actorPidの扱いはremoveCoresと同じ
export function removeCoresToTrash(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
    actorPid?: PlayerId,
): number {
    // 戻り値＝**実際に取り除けた数**。バトル中の保護（BS05茨の決戦地Lv1）やコア下限
    // （BS08聖なる柱状彫刻）で減る場合があるため、呼び出し側が残数を数えるときは必ずこれを使う
    if (isBattlingCoreProtected(state, inst)) {
        log(state, `${getCard(inst.cardId).name}は、バトル中のためコアを取り除けなかった。`)
        return 0
    }
    const player = state.players[ownerPid]
    // coreReturnBonus の includeTrash 版（BS14-019シュテン・ドーガ）：トラッシュ行きにも加算する
    const bonus = coreReturnBonusFor(state, ownerPid, true)
    if (bonus > 0 && inst.cores > count) {
        log(state, `トラッシュに置かれるコアが${Math.min(bonus, inst.cores - count)}個追加された。`)
    }
    // coreFloorByCost（BS08聖なる柱状彫刻）：有効なら、このカードのコストを下回るまでは取り除けない
    const removed = Math.min(count + bonus, Math.max(0, inst.cores - coreFloorFor(state, inst, ownerPid)))
    inst.cores -= removed
    player.trashCores += removed
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}のコア${removed}個をトラッシュに置いた。`,
    )
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (inst.cores < instMinLevelCores(inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1, removed)
    }
    return removed
}

// コアを取り除いてボイドへ送る（消滅させる。リザーブ・トラッシュどちらも増えない）。
// 維持コア（Lv1）を下回ったら消滅させる（BS04ヴェノムショット）。actorPidの扱いはremoveCoresと同じ
// スピリットからコアを取る共通部分（行き先への加算とログは呼び出し側）。自分の効果で動かすときも保護・下限を見る
// （2026-09-26 ユーザー確認）。removeCoresToVoid も同じ中身だがログの順が違うので、取り除く系の器を作るときにまとめる
export function takeCoresFromSpirit(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
    actorPid?: PlayerId,
): number {
    if (isBattlingCoreProtected(state, inst)) {
        log(state, `${getCard(inst.cardId).name}は、バトル中のためコアを取り除けなかった。`)
        return 0
    }
    const removed = Math.min(count, Math.max(0, inst.cores - coreFloorFor(state, inst, ownerPid)))
    inst.cores -= removed
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (inst.cores < instMinLevelCores(inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1, removed)
    }
    return removed
}

export function removeCoresToVoid(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
    actorPid?: PlayerId,
): number {
    // 戻り値＝**実際に取り除けた数**。バトル中の保護（BS05茨の決戦地Lv1）やコア下限
    // （BS08聖なる柱状彫刻）で減る場合があるため、呼び出し側が残数を数えるときは必ずこれを使う
    if (isBattlingCoreProtected(state, inst)) {
        log(state, `${getCard(inst.cardId).name}は、バトル中のためコアを取り除けなかった。`)
        return 0
    }
    const player = state.players[ownerPid]
    // coreFloorByCost（BS08聖なる柱状彫刻）：有効なら、このカードのコストを下回るまでは取り除けない
    const removed = Math.min(count, Math.max(0, inst.cores - coreFloorFor(state, inst, ownerPid)))
    inst.cores -= removed
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}のコア${removed}個をボイドに置いた。`,
    )
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (inst.cores < instMinLevelCores(inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1, removed)
    }
    return removed
}

// globalConstraint "coreFloorByCost"（BS08聖なる柱状彫刻）：有効な発生源があれば、スピリット上のコアは
// そのカードのコスト（Lv1コスト）を下回るまで取り除けない。ネクサスは対象外（カードに「コスト」はあるが
// 効果文は「スピリットすべて」なのでtype==="spirit"のみに適用）。
// **コアの動かし方を問わず効く**（2026-08-24 ユーザー確認）。「少なくならない」は結果の状態を縛る
// 書き方なので、取り除く効果だけでなく**移動・入れ替え**でも下回れない。
// 取り除く系は removeCores/removeCoresToTrash/removeCoresToVoid が、
// 移動・入れ替え系（moveCoresLeavingOne／swapOpponentCores）は各ハンドラがこの関数を直接見る。
export function coreFloorFor(state: GameState, inst: CardInstance, ownerPid?: PlayerId): number {
    if (getCard(inst.cardId).type !== "spirit") return 0
    // ownOnly（BS09-059翡翠の社Lv2）は発生源の持ち主のスピリットだけを守るので、
    // 「どちらの発生源から来た制約か」を見る必要がある
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const sources = [...state.players[pid].field.spirits, ...state.players[pid].field.nexuses]
        for (const source of sources) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "coreFloorByCost") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                if (effect.constraint.ownOnly && (ownerPid === undefined || ownerPid !== pid)) continue
                // colorFilter（BS12-065大樹茂る天守閣：「自分の緑のスピリットすべて」）：この色を持たなければ守らない
                if (effect.constraint.colorFilter !== undefined && !instHasColor(inst, effect.constraint.colorFilter)) continue
                // 「Lv1コスト」＝**Lv1に必要なコア数**（レベル表の「Lv1コスト：1」。2026-08-14 ユーザー確認）。
                // 以前はカードの召喚コストとして実装していた（BS08-059聖なる柱状彫刻の挙動もここで変わる）
                return instMinLevelCores(inst)
            }
        }
    }
    return 0
}

// 効果でスピリットからリザーブへ置かれるコアの追加数（BS02チャウーLv2の coreReturnBonus）。
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
                if (!effectActiveAtLevel(e.levels, level)) continue
                // 既定はリザーブ行きだけ。includeTrash 指定時はトラッシュ行きにも効く（BS14-019）
                if (toTrash && !e.includeTrash) continue
                // targetSide:"opponent"＝発生源の持ち主から見た相手のスピリットから取り除くときだけ
                if (e.targetSide === "opponent" && targetOwnerPid === pid) continue
                // ownBurstOnly＝発生源の持ち主のバースト効果を解決している間だけ
                if (e.ownBurstOnly && state.resolvingBurstPid !== pid) continue
                bonus += e.amount
            }
        }
    }
    return bonus
}

// バトルをしている両陣営のスピリット上のコアは、globalConstraint "battlingCoresProtected" が
// 有効な発生源が両陣営のフィールドにあれば効果によって取り除かれない（BS05茨の決戦地Lv1-2）。
// phase/turnはEffectDef側（globalConstraintエントリ自身）が持つ（発生源の持ち主基準のturn判定）
function isBattlingCoreProtected(state: GameState, inst: CardInstance): boolean {
    // ブロッカー限定の保護（期間つき効果 blockerCoresProtected。このバトルの間）
    if (state.battle?.blockerInstanceId === inst.instanceId && timedBattleContents(state).some((c) => c.type === "blockerCoresProtected")) {
        return true
    }
    if (!isInCurrentBattle(state, inst)) return false
    return hasActiveGlobalConstraint(state, "battlingCoresProtected")
}
