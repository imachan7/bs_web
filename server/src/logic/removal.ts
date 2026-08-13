// スピリット／ネクサスの除去（EffectModules.ts から分割。2026-08-10）
//
// 破壊・消滅・コアの取り除き・手札／デッキへ戻す処理をまとめたもの。
// **中身は移設しただけで、ロジックは一切変えていない。**
//
// ⚠️ EffectModules.ts / triggers.ts とは相互 import の関係にある
// （破壊は誘発を発火し、誘発は破壊を呼ぶ）。GameState.ts ↔ EffectModules.ts と同じ形で、
// CommonJS の循環require（関数宣言はホイストされ、呼び出しは対戦処理中＝読み込み完了後）で安全に動く。
// 呼び出し側の互換のため、EffectModules.ts がここの export を再エクスポートしている
import type {
    AuraCondition,
    AuraCounter,
    AuraDef,
    CardData,
    CardInstance,
    CardType,
    Color,
    PendingChoice,
    ConstraintDef,
    DestroyContext,
    EffectAction,
    EffectCounter,
    EffectDef,
    FamilyFilter,
    FieldEvent,
    GameEvent,
    GameState,
    GlobalConstraintDef,
    Keyword,
    Phase,
    PlayerId,
    ResolvedTargetFilter,
    ResumeFrame,
    TargetFilter,
    TriggerEvent,
} from "../type"
import { COLOR_LABELS } from "../../../data/constants"
import {
    CARD_DB,
    clearBattle,
    createInstance,
    currentLevel,
    draw,
    findInstanceAnywhere,
    getCard,
    log,
    instMinLevelCores,
    minLevelCores,
    opponentOf,
    pushResumeFrames,
    rawLevel,
    suspend,
} from "./GameState"
// 共有ルール層（shared/）へ移設した純粋述語。サーバー／クライアントで同一実装を使う。
// 外部から EffectModules 経由で import している箇所を壊さないため、再エクスポートで名前を残す
// 分割した triggers.ts の関数を内部でも使う（再エクスポートとは別に import が要る）。
// 相互 import になるが CommonJS の循環requireで安全（ファイル冒頭の注記を参照）
import {
    fireFieldEventTriggers,
    fireTrigger,
    notifyHandGained,
    notifyNexusDeployed,
    notifySpiritCoresRemovedByOpponent,
    resolveMagicEffects,
} from "./triggers"
import ACTION_HANDLERS from "./actions"
import type { ActionCtx } from "./actions/types"
import type { EffectAttempt, KeywordInfo, Resistance } from "../../../shared/rules"
export type { KeywordInfo }
import {
    findMagicFreeGrantSource,
    hasMagicRestriction,
    isSelfInBattle,
    ownFieldSymbolColors,
} from "../../../shared/cost"
import {
    activeConstraints,
    auraAmount,
    boardResistanceAgainst,
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
    instEffectsSuppressed,
    instHasColor,
    instHasCost,
    isUntargetableByOpponent,
    instIsVanilla,
    isVirtualSource,
    cardNameContains,
    matchesTarget,
    KEYWORDS,
    instMatchesCostFilter,
    matchesCostFilter,
    matchesFamilyFilter,
    noSummonTriggerByCost,
    spiritHasFamily,
    spiritHasKeyword,
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
checkExhaustOnCoreChange,
    destroyedCoresGoToTrash,
    emitEvent,
    exhaustSpirit,
    isResisted,
    pickEnemyByBp,
    pickEnemyCandidates,
    placeCoresOnSpirit,
    resistanceAgainst,
    summonFreeFromHandIndex,
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
    options?: { skipRevive?: true; allowSuspend?: true },
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
    const master = getCard(inst.cardId)

    // 復活チェック（cause==="destroy"のときのみ。維持コア割れ＝消滅は対象外）。
    // 破壊されるかわりに場に留まる。複数ソースがある場合は self由来→ownAll由来の順で最初の1つだけ適用。
    // 「〜できる」の任意発動は常に発動する簡略化とする。
    if (
        cause === "destroy" &&
        !options?.skipRevive &&
        tryReviveOnDestroy(state, ownerPid, inst, context, undefined, options?.allowSuspend === true)
    ) {
        return false
    }

    // 破壊直前のコア数を記録（リザーブへ移す前。漆黒鳥ヤタグロスの coreGainPer: selfCoresAtDestruction）
    inst.coresAtDestruction = inst.cores

    player.field.spirits.splice(index, 1)
    // 破壊されたスピリット上のコアは通常リザーブへ戻るが、
    // destroyedCoresToTrash（古龍の縄張りLv1）が有効な間はトラッシュへ置かれる
    if (destroyedCoresGoToTrash(state)) {
        player.trashCores += inst.cores
    } else {
        player.reserve += inst.cores
    }
    player.trashCards.push(inst.cardId)
    log(
        state,
        `${player.name}の${master.name}は${cause === "destroy" ? "破壊" : "消滅"}された。`,
    )
    emitEvent(state, { type: "destroy", pid: ownerPid, cardName: master.name })

    if (cause === "destroy") {
        fireTrigger(state, ownerPid, inst, "onDestroy")
    }
    // フィールドイベント誘発「自分のスピリットが破壊されたとき」：cause問わず（消滅も含む）持ち主側で発火
    // （侵食されゆく銀世界Lv2）。fireFieldEventTriggers の action がさらに destroySpirit を
    // 呼ぶカードは現対象に無いが、呼ぶ場合は再入（同一スピリットの二重破壊）に注意すること
    // 破壊されたスピリットの色（colorFilter判定用。祝福されし大聖堂）と、
    // バニラ判定・バトル破壊判定（vanillaOnly／byBattleOnly。運命分かつ岐路）を渡す
    // selfOverrideに破壊されたスピリット自身を渡す（BS05永久氷殿：maxBpFromSelfで「破壊されたスピリットのBP以下」を
    // 参照できるようにする。既存カードはselfを参照しないアクションのみのため挙動は変わらない）
    fireFieldEventTriggers(state, ownerPid, "ownSpiritDestroyed", { pid: ownerPid, inst }, master.colors, undefined, undefined, {
        vanilla: instIsVanilla(inst),
        byBattle: context?.battle !== undefined,
        // 破壊された時点でまだバトルが生きているので、アタッカー側だったかをここで確定させる
        // （clearBattle 後には判定できない。attackerOnly の判定に使う）
        wasAttacker: state.battle?.attackerInstanceId === inst.instanceId,
        families: master.family,
        // instAllCosts：破壊されたスピリットの本来のコストに加え、道化師クランの付与コストも含める
        costs: instAllCosts(inst),
    })
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
            if (state.phase !== effect.phaseTurn.phase) continue
            if (effect.phaseTurn.turn === "own" && pid !== state.turnPlayer) continue
            if (effect.phaseTurn.turn === "opponent" && pid === state.turnPlayer) continue
        }
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

// 「破壊される代わりに復活**できる**」の確認を保留リストへ積む。
// 破壊はこの時点では行わない（対象は場に残ったまま）。承認・拒否は handleAction の末尾で確認したあと、
// applyReviveConfirm / declineReviveConfirm が決着させる
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

// 複数体をまとめて破壊する（1体ごとに「破壊される代わりに復活できる」の確認で中断しうる）。
// 戻り値は「実際に破壊できた数」。中断したときは state.pendingChoice が立ち、
// 呼び出し元は destroyBatch フレームを積んで return する（GameEngine の drainResumeStack が続きを回す）
export function destroySpiritsFrom(
    state: GameState,
    targets: { pid: PlayerId; instanceId: string }[],
    startIndex: number,
    destroyedSoFar: number,
    context?: DestroyContext,
): { destroyed: number; stoppedAt: number } {
    let destroyed = destroyedSoFar
    for (let i = startIndex; i < targets.length; i++) {
        const t = targets[i]
        if (!t) continue
        if (destroySpirit(state, t.pid, t.instanceId, "destroy", context, { allowSuspend: true })) {
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
    targets: { pid: PlayerId; instanceId: string }[],
    context?: DestroyContext,
    after?: Extract<ResumeFrame, { kind: "destroyBatch" }>["after"],
): number {
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
        }])
        return destroyed
    }
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
    if (state.winner) return
    applyDestroyBatchAfter(state, frame.ownerPid, destroyed, frame.after)
}

// 「この効果で破壊したスピリット1体につき」の後処理。
// **実際に破壊できた数**で数える（復活して場に残った個体は入らない。RESUME_STACK.md §7 ①）
export function applyDestroyBatchAfter(
    state: GameState,
    ownerPid: PlayerId,
    destroyed: number,
    after: Extract<ResumeFrame, { kind: "destroyBatch" }>["after"],
): void {
    if (!after || destroyed <= 0) return
    if (after.drawPerDestroyed) draw(state, ownerPid, destroyed)
    if (after.voidCoreToSelfPerDestroyed && after.selfInstanceId) {
        const self = findInstanceAnywhere(state, after.selfInstanceId)
        if (self) {
            placeCoresOnSpirit(state, self, destroyed, ownerPid)
            log(
                state,
                `${getCard(self.cardId).name}は、破壊した${destroyed}体につきボイドからコア${destroyed}個を自身の上に置いた。`,
            )
        }
    }
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
    if (!tryReviveOnDestroy(state, entry.pid, inst, entry.context, { effectId: entry.effectId })) {
        declineReviveConfirm(state, entry)
        return
    }
    // 復活が成立した＝破壊されていない（場に残る／手札へ戻るのどちらでも）
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

// reviveOnDestroy の判定と実行。復活できたら true を返す（呼び出し側 destroySpirit はそのまま return する）。
// 優先順位: instのカード自身が持つ scope:"self" の効果 → 持ち主フィールドの scope:"ownAll" の効果（先に見つかった方）。
function tryReviveOnDestroy(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    context?: DestroyContext,
    // 指定時は「このエントリだけを、確認済みとして確定させる」モード。
    // optional の保留分岐に入らず、他のエントリも見ない（applyReviveConfirm から渡る）
    forced?: { effectId: string },
    // true なら「破壊される代わりに復活できる」の確認を**その場で**出す（保留リストに積まない）。
    // destroySpirits のバッチ経由の呼び出しだけが立てる
    allowSuspend?: boolean,
): boolean {
    const player = state.players[ownerPid]
    const level = currentLevel(inst).level

    const matchesWhen = (when: {
        byOpponentEffect?: boolean
        byBattleVsArmorColor?: boolean
        byBattle?: boolean
        byBattleKillerLevel?: number
        byBattleKillerMaxBp?: number
    }): boolean => {
        if (when.byOpponentEffect) {
            if (context?.sourcePid === undefined || context.sourcePid === ownerPid) return false
        }
        if (when.byBattleVsArmorColor) {
            const attackerColors = context?.battle?.attackerColors
            if (attackerColors === undefined || !hasArmorAgainst(inst, attackerColors)) return false
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
        return true
    }

    const matchesPhaseTurn = (phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }): boolean => {
        if (!phaseTurn) return true
        if (state.phase !== phaseTurn.phase) return false
        if (phaseTurn.turn === "own" && ownerPid !== state.turnPlayer) return false
        if (phaseTurn.turn === "opponent" && ownerPid === state.turnPlayer) return false
        return true
    }

    const applyCost = (effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>): boolean => {
        if (effect.cost?.keepOneCoreRestToTrash) {
            const excess = inst.cores - 1
            if (excess > 0) {
                inst.cores = 1
                player.trashCores += excess
            }
            return true
        }
        if (effect.cost?.oneCoreToVoid) {
            // コア1個の個体は支払うと維持コア割れになるため不発
            if (inst.cores <= 1) return false
            inst.cores -= 1
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
            // 持ち主のリザーブのコア1個（無ければ自分のフィールド＝スピリット/ネクサス、
            // 発生源自身を除く、からコア1個）を持ち主のトラッシュへ（BS04宝石虫スカラベール）
            if (player.reserve > 0) {
                player.reserve -= 1
                player.trashCores += 1
                return true
            }
            const source = [...player.field.spirits, ...player.field.nexuses].find(
                (i) => i.instanceId !== inst.instanceId && i.cores > 0,
            )
            if (source) {
                source.cores -= 1
                player.trashCores += 1
                return true
            }
            return false
        }
        if (effect.cost?.handDiscardOne) {
            // 持ち主の手札1枚（末尾＝決定的簡略化）をトラッシュへ。手札0枚なら支払い不可＝不発（BS06暴かれた墓石Lv2）
            if (player.hand.length === 0) return false
            const cardId = player.hand.pop()!
            player.trashCards.push(cardId)
            return true
        }
        if (effect.cost?.millSelfOneMatching) {
            // BS07冥勇士デスカラビア：自分のデッキを上から1枚破棄し、そのカードが
            // 指定の色・種別（紫のスピリットカード）だったときだけ成立する
            const { color, cardType } = effect.cost.millSelfOneMatching
            const cardId = player.deck.shift()
            if (cardId === undefined) {
                log(state, `${player.name}のデッキが尽きているため、破壊時の効果は成立しなかった。`)
                return false
            }
            const milled = getCard(cardId)
            player.trashCards.push(cardId)
            log(state, `${player.name}はデッキを上から1枚（${milled.name}）破棄した。`)
            const ok = milled.type === cardType && milled.colors.includes(color)
            if (!ok) log(state, `${milled.name}は条件を満たさなかった。`)
            return ok
        }
        if (effect.cost?.exhaustOwnFamilyOne) {
            // BS07パオ・ペイール：持ち主の「想獣」の回復状態スピリット1体を疲労させる。
            // 破壊されようとしている個体自身は除く。候補は実効BP最小を選ぶ（犠牲を最小化する簡略化）
            const family = effect.cost.exhaustOwnFamilyOne
            const candidates = player.field.spirits.filter(
                (s) =>
                    s.instanceId !== inst.instanceId &&
                    !s.isRested &&
                    matchesFamilyFilter(state, ownerPid, s, family),
            )
            if (candidates.length === 0) return false
            const chosen = candidates.reduce((min, s) =>
                effectiveBp(state, ownerPid, s) < effectiveBp(state, ownerPid, min) ? s : min,
            )
            exhaustSpirit(state, ownerPid, chosen)
            return true
        }
        if (effect.cost?.ownLifeOneToVoid) {
            // BS08太陽石の神殿：持ち主のライフのコア1個をボイドへ（リザーブには戻らない）。
            // ライフ0なら支払い不可＝不発。支払った結果ライフが0になった場合はそのまま勝敗が決まる
            if (player.life <= 0) return false
            player.life -= 1
            log(state, `${player.name}はライフのコア1個をボイドに置いた。（残りライフ${player.life}）`)
            if (player.life <= 0 && !state.winner) {
                state.winner = opponentOf(ownerPid)
                log(state, `${state.players[opponentOf(ownerPid)].name}の勝利！`)
            }
            return true
        }
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
    const applyRevived = (revived: { rested: boolean } | { toHand: true }): void => {
        if ("toHand" in revived) {
            const idx = player.field.spirits.findIndex((s) => s.instanceId === inst.instanceId)
            if (idx !== -1) player.field.spirits.splice(idx, 1)
            player.reserve += inst.cores
            player.hand.push(inst.cardId)
            notifyHandGained(state, ownerPid, 1)
        } else {
            inst.isRested = revived.rested
        }
    }

    const revivedLabel = (revived: { rested: boolean } | { toHand: true }): string =>
        "toHand" in revived ? "手札に戻った" : `${revived.rested ? "疲労" : "回復"}状態で自分のフィールドに戻った`

    // 持ち主のフィールド（スピリット）に指定カード名を持つ個体が1体以上いるか
    // （BS05プリンセス・スノーホワイト：自分のフィールドに[ドワッフー・セブン]がいるとき）
    const matchesRequireOwnFieldHasName = (name?: string): boolean => {
        if (name === undefined) return true
        return player.field.spirits.some((s) => getCard(s.cardId).name === name)
    }

    // 発生源の持ち主から見た相手フィールドのシンボル色数（重複除く）がこの値以下か
    // （BS06夢中漂う桃幻郷Lv2：相手フィールドにシンボルが1色しかない間）
    const matchesReviveCondition = (condition?: { opponentFieldSymbolColorsAtMost: number }): boolean => {
        if (!condition) return true
        const oppColors = ownFieldSymbolColors(state, opponentOf(ownerPid))
        return oppColors.size <= condition.opponentFieldSymbolColorsAtMost
    }

    const tryEffect = (effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>, sourceName: string): boolean => {
        if (forced && effect.id !== forced.effectId) return false
        if (!effectActiveAtLevel(effect.levels, level)) return false
        if (effect.vanillaFilter && !instIsVanilla(inst)) return false
        if (!matchesRequireOwnFieldHasName(effect.requireOwnFieldHasName)) return false
        if (!matchesReviveCondition(effect.condition)) return false
        if (!matchesWhen(effect.when)) return false
        if (!matchesPhaseTurn(effect.phaseTurn)) return false
        if (oncePerTurnBlocked(effect, inst)) return false
        // 「〜できる」＝任意（optional）は、実対戦では持ち主に確認してから確定させる。
        // allowSuspend（destroySpirits のバッチ経由）なら**その場で**確認を出す。
        // それ以外の呼び出し元はまだ中断を受け止められないので、従来どおり保留へ積む
        // （移行の途中。残りの呼び出し元は docs/design/RESUME_STACK.md §7）
        if (effect.optional && state.interactiveTargets && !forced) {
            if (allowSuspend) {
                suspendReviveConfirm(state, ownerPid, inst, effect.id, inst.instanceId, context)
            } else {
                queueReviveConfirm(state, ownerPid, inst, effect.id, inst.instanceId, context)
            }
            return true
        }
        if (!applyCost(effect)) return false
        markOncePerTurn(effect, inst)
        const name = getCard(inst.cardId).name
        // BS07ブラックリチュアル：「破壊時効果を発揮した自分のスピリットは手札に戻る」。
        // 既定では復活が成立すると破壊時効果は発揮されないので、場に留める（手札へ戻す）前に先に発揮させる
        if (effect.fireDestroyTriggerFirst) fireTrigger(state, ownerPid, inst, "onDestroy")
        applyRevived(effect.revived)
        log(
            state,
            `${player.name}の${name}は、${sourceName}の効果で破壊される代わりに${revivedLabel(effect.revived)}。`,
        )
        return true
    }

    // self由来（inst自身が持つ reviveOnDestroy）
    for (const effect of getCard(inst.cardId).effects) {
        if (effect.kind !== "reviveOnDestroy") continue
        if (effect.scope !== "self") continue
        if (tryEffect(effect, getCard(inst.cardId).name)) return true
    }

    // ownAll由来（持ち主フィールドの発生源から）。levelsは発生源のレベル条件のため、
    // instのlevelを見るtryEffectは使わず発生源のsourceLevelで判定する。
    // effectSources() でこのターンだけの仮想発生源（マジックが貸した継続効果。BS05リアニメイト）も含める
    const sources = effectSources(state, ownerPid)
    for (const source of sources) {
        if (source.instanceId === inst.instanceId) continue
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "reviveOnDestroy") continue
            if (forced && effect.id !== forced.effectId) continue
            if (effect.scope !== "ownAll") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.vanillaFilter && !instIsVanilla(inst)) continue
            if (effect.keywordFilter && !hasKeyword(inst.cardId, effect.keywordFilter)) continue
            // BS06夢中漂う桃幻郷：指定色を持つスピリットのみ対象
            if (effect.colorFilter && !instHasColor(inst, effect.colorFilter)) continue
            // 氷の魔女ヘル：指定系統を持つスピリットのみ対象（配列＝OR）
            if (effect.familyFilter && !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)) continue
            // BS03エスケープルート：カード静的な family 配列の要素数が指定数以上のスピリットのみ対象
            if (effect.minFamilies !== undefined && getCard(inst.cardId).family.length < effect.minFamilies) continue
            // 強者統べる大地：実効BPが閾値以上のスピリットのみ対象（破壊直前のBPで判定する）
            if (effect.minBp !== undefined && effectiveBp(state, ownerPid, inst) < effect.minBp) continue
            if (!matchesReviveCondition(effect.condition)) continue
            if (!matchesWhen(effect.when)) continue
            if (!matchesPhaseTurn(effect.phaseTurn)) continue
            if (oncePerTurnBlocked(effect, source)) continue
            // optional は self 由来と同じく保留する（発生源は source 側＝oncePerTurn の記録先）
            if (effect.optional && state.interactiveTargets && !forced) {
                queueReviveConfirm(state, ownerPid, inst, effect.id, source.instanceId, context)
                return true
            }
            if (!applyCost(effect)) continue
            markOncePerTurn(effect, source)
            const name = getCard(inst.cardId).name
            // BS07ブラックリチュアル：場に留める（手札へ戻す）前に破壊時効果を先に発揮させる
            if (effect.fireDestroyTriggerFirst) fireTrigger(state, ownerPid, inst, "onDestroy")
            applyRevived(effect.revived)
            log(
                state,
                `${player.name}の${name}は、${getCard(source.cardId).name}の効果で破壊される代わりに${revivedLabel(effect.revived)}。`,
            )
            return true
        }
    }

    return false
}

// 破壊対象ネクサスの持ち主（ownerPid）自身のフィールド（スピリット＋ネクサス）のみを走査し、
// レベル有効かつ condition（ownVanillaSpiritsAtLeast＝持ち主のバニラスピリット数）を満たす
// globalConstraint "ownNexusIndestructible" があるか判定する。
// hasGlobalConstraint は両陣営を走査する汎用判定だが、こちらは破壊対象の持ち主側のみに効く
// 制約（サファイアの城壁）専用の判定のため別関数にしている。
function hasOwnNexusIndestructible(state: GameState, ownerPid: PlayerId): boolean {
    const player = state.players[ownerPid]
    const instances = [...player.field.spirits, ...player.field.nexuses]
    for (const inst of instances) {
        const level = currentLevel(inst).level
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "ownNexusIndestructible") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.condition) {
                const vanillaCount = player.field.spirits.filter((s) =>
                    instIsVanilla(s),
                ).length
                if (vanillaCount < effect.condition.ownVanillaSpiritsAtLeast) continue
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
    if (hasOwnNexusIndestructible(state, ownerPid)) {
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}（ネクサス）は破壊されなかった（破壊耐性）。`,
        )
        return false
    }
    player.field.nexuses.splice(index, 1)
    player.reserve += inst.cores
    player.trashCards.push(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）は破壊された。`)
    // フィールドイベント誘発「ネクサスが破壊されたとき」：破壊した/された側を問わず両陣営のフィールドから発火
    // （竜狩りのアーケオルニ）。バウンス（returnNexusToHand）はここを通らないため対象外
    fireFieldEventTriggers(state, ownerPid, "anyNexusDestroyed")
    fireFieldEventTriggers(state, opponentOf(ownerPid), "anyNexusDestroyed")
    // 直近に破壊されたネクサスを記録する（戦闘獣ジャッカーが「その破壊されたネクサス」を参照するため）
    state.lastDestroyedNexus = { pid: ownerPid, cardId: inst.cardId }
    // フィールドイベント誘発「自分のネクサスが破壊されたとき」：持ち主側のフィールドからのみ発火（シャークハンマー）。
    // 「**相手の**効果で破壊されたとき」限定のエントリ（BS07の各色ネクサス6枚）のために、
    // 効果による破壊か（sourceType あり）＋発生源が持ち主自身でないか、を eventInfo で渡す
    const byOpponentEffect =
        context?.sourceType !== undefined &&
        context.sourcePid !== undefined &&
        context.sourcePid !== ownerPid
    // 破壊されたネクサス自身も走査に含める（extraSources）。「自分のネクサスが破壊されたとき」を
    // そのネクサス自身が持つ形（BS07の各色ネクサス6枚）は、ここで渡さないと自分の破壊では発火しない
    fireFieldEventTriggers(state, ownerPid, "ownNexusDestroyed", undefined, undefined, undefined, undefined, {
        byOpponentEffect,
    }, [inst])
    return true
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

// スピリットを持ち主の手札へ戻す（バウンス）：コアはリザーブへ、カードは手札へ。
// 破壊ではないため onDestroy は誘発しない（destroySpirit とは別処理）。
export function returnSpiritToHand(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    // 効果の発生源カード名。渡すとログとイベントに載せる（何の効果で戻ったのかを対戦者が追えるように）
    sourceName?: string,
): void {
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex(
        (s) => s.instanceId === inst.instanceId,
    )
    if (index === -1) return
    player.field.spirits.splice(index, 1)
    player.reserve += inst.cores
    player.hand.push(inst.cardId)
    log(
        state,
        `${sourceName ? `${sourceName}：` : ""}${player.name}の${getCard(inst.cardId).name}は手札に戻った。`,
    )
    emitEvent(state, {
        type: "returnToHand",
        pid: ownerPid,
        cardName: getCard(inst.cardId).name,
        ...(sourceName !== undefined ? { sourceName } : {}),
    })
    notifyHandGained(state, ownerPid, 1)
    // フィールドイベント誘発「自分のスピリットが手札に戻ったとき」（BS01リターンドロー）。
    // self には戻ったスピリットを渡す（すでにフィールドからは外れている）
    if (!state.winner) {
        fireFieldEventTriggers(state, ownerPid, "ownSpiritReturnedToHand", { pid: ownerPid, inst }, instColors(inst))
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
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex(
        (s) => s.instanceId === inst.instanceId,
    )
    if (index === -1) return
    player.field.spirits.splice(index, 1)
    player.reserve += inst.cores
    player.deck.unshift(inst.cardId)
    log(
        state,
        `${sourceName ? `${sourceName}：` : ""}${player.name}の${getCard(inst.cardId).name}はデッキの一番上に戻った。`,
    )
    emitEvent(state, {
        type: "returnToDeck",
        pid: ownerPid,
        cardName: getCard(inst.cardId).name,
        position: "top",
        ...(sourceName !== undefined ? { sourceName } : {}),
    })
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
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex(
        (s) => s.instanceId === inst.instanceId,
    )
    if (index === -1) return
    player.field.spirits.splice(index, 1)
    player.reserve += inst.cores
    player.deck.push(inst.cardId)
    log(
        state,
        `${sourceName ? `${sourceName}：` : ""}${player.name}の${getCard(inst.cardId).name}はデッキの一番下に戻った。`,
    )
    emitEvent(state, {
        type: "returnToDeck",
        pid: ownerPid,
        cardName: getCard(inst.cardId).name,
        position: "bottom",
        ...(sourceName !== undefined ? { sourceName } : {}),
    })
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
    srcType?: "spirit" | "nexus" | "magic",
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
    const bonus = coreReturnBonusFor(state)
    if (bonus > 0 && inst.cores > count) {
        log(state, `リザーブに置かれるコアが${Math.min(bonus, inst.cores - count)}個追加された。`)
    }
    // coreFloorByCost（BS08聖なる柱状彫刻）：有効なら、このカードのコストを下回るまでは取り除けない
    const floor = coreFloorFor(state, inst)
    const removed = Math.min(count + bonus, Math.max(0, inst.cores - floor))
    inst.cores -= removed
    player.reserve += removed
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}からコア${removed}個を取り除いた。`,
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
    // coreFloorByCost（BS08聖なる柱状彫刻）：有効なら、このカードのコストを下回るまでは取り除けない
    const removed = Math.min(count, Math.max(0, inst.cores - coreFloorFor(state, inst)))
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
    const removed = Math.min(count, Math.max(0, inst.cores - coreFloorFor(state, inst)))
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
// **簡略化**：removeCores/removeCoresToTrash/removeCoresToVoid（単体除去の共通処理）だけが尊重する。
// coreSqueezeAll/One・bothSidesCoreToTrash/Void・moveCoresLeavingOne・swapOpponentCores等、
// .coresを直接書き換える範囲効果はこの下限を見ない（data/card-notes.jsonに明記）
function coreFloorFor(state: GameState, inst: CardInstance): number {
    const card = getCard(inst.cardId)
    if (card.type !== "spirit") return 0
    if (!hasActiveGlobalConstraint(state, "coreFloorByCost")) return 0
    return card.cost
}

// 効果でスピリットからリザーブへ置かれるコアの追加数（BS02チャウーLv2の coreReturnBonus）。
// 効果文が「お互いのスピリット上に置かれたコアが」と陣営を限定していないため、**両陣営の発生源**を見る。
// 走査は effectSources 経由＝このターンだけの仮想発生源（マジックが貸した継続効果）も含む
function coreReturnBonusFor(state: GameState): number {
    let bonus = 0
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, pid)) {
            const level = currentLevel(source).level
            for (const e of getCard(source.cardId).effects) {
                if (e.kind !== "coreReturnBonus") continue
                if (!effectActiveAtLevel(e.levels, level)) continue
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
    if (!isInCurrentBattle(state, inst)) return false
    return hasActiveGlobalConstraint(state, "battlingCoresProtected")
}