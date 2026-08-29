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
    effectiveCost,
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
    braveKeepCores,
    bravesOf,
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
    summonFreeFromTrashIndex,
checkExhaustOnCoreChange,
    destroyedCoresGoToTrash,
    emitEvent,
    exhaustSpirit,
    fireSummonSequence,
    isResisted,
    pickEnemyByBp,
    pickEnemyCandidates,
    placeCoresOnSpirit,
    refreshLevelAsOverrides,
    refreshSpirit,
    resistanceAgainst,
    resolveTensho,
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

// ---- 合体・分離（docs/design/BRAVE.md §2.3・§6・§12.5）----

// **合体処理の唯一の入口。** ブレイヴの実体を field.combinedBraves へ入れ、
// ホストが braveRefs で参照する（参照方式。§2.3）。かつては GameEngine.ts の
// placeSummonedSpirit と EffectModules.ts の summonFreeFromHandIndex に同じ処理が
// 2箇所書かれていた（2026-08-28、効果による再合体で3箇所目になる前にここへ寄せた）
export function attachBrave(state: GameState, pid: PlayerId, host: CardInstance, brave: CardInstance): void {
    const player = state.players[pid]
    // 分離してスピリット状態で field.spirits にいるブレイヴを再合体させる経路（detachBrave.combineToChosenSpirit）
    // では、まずそこから抜く。ダイレクトブレイヴ・召喚直後のインスタンスはそもそも spirits にいないので no-op
    const at = player.field.spirits.findIndex((sp) => sp.instanceId === brave.instanceId)
    if (at !== -1) player.field.spirits.splice(at, 1)
    player.field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    // 合体時の疲労合成：どちらかが疲労状態なら合体スピリットは疲労状態（§1.3）
    host.isRested = host.isRested || brave.isRested
    // ブレイヴが足すコスト・色・シンボルをここで組み直す（このあとに出る召喚時効果等がコストや色を読むため）
    refreshLevelAsOverrides(state)
}

// 分離するときブレイヴへ渡すコア数の既定値（非対話＝テスト・AI用の決定的簡略化）。
// **ブレイヴには維持ぶんだけ渡し、渡すとホストが維持できなくなるなら渡さない**（どちらも残る方を優先する）
export function autoDetachCoresToBrave(host: CardInstance, brave: CardInstance): number {
    const needBrave = braveKeepCores(brave)
    return host.cores - needBrave >= instMinLevelCores(host) ? needBrave : 0
}

// 効果によるブレイヴの分離（§12.5）。
// ⚠️ **合体スピリット上のコアをホストとブレイヴに分け直す**（2026-08-29 ユーザー確認。
// それ以前は「コアは要らない」＝ホストに全部残す簡略化だった）。コアの総数は変わらない。
// 分け方は**合体スピリットの持ち主**が決める（BS11-015「分離するときのコアの移動は相手が行う」）。
// 対話時は呼び出し側が coresToBrave を決めて渡し、非対話では autoDetachCoresToBrave の既定値を使う。
// 分けた結果 Lv1維持コアを下回った側は消滅する（cause:"deplete"＝復活判定に入らない）。
//
// 「場を離れるときに残す」＝ detachBravesOnLeave（§1.4。自分のフィールド/リザーブから
// Lv1維持コスト以上を**新たに置く**）とは別の手順であることは変わらない。
// 分離したブレイヴはホストの疲労状態を引き継ぐ（§12.5：ルール改定で移動元が疲労していると移動先も疲労になる）
export function detachBraveByEffect(
    state: GameState,
    ownerPid: PlayerId,
    host: CardInstance,
    brave: CardInstance,
    coresToBrave?: number,
): void {
    const player = state.players[ownerPid]
    host.braveRefs = (host.braveRefs ?? []).filter((r) => r.instanceId !== brave.instanceId)
    if (host.braveRefs.length === 0) delete host.braveRefs
    const at = player.field.combinedBraves.findIndex((b) => b.instanceId === brave.instanceId)
    if (at !== -1) player.field.combinedBraves.splice(at, 1)
    brave.isRested = host.isRested
    player.field.spirits.push(brave)
    // ⚠️ 参照を切ってから refresh する。合体状態のレベル表のままだと instMinLevelCores がずれる
    refreshLevelAsOverrides(state)
    const give = Math.max(0, Math.min(coresToBrave ?? autoDetachCoresToBrave(host, brave), host.cores))
    host.cores -= give
    brave.cores += give
    log(
        state,
        `${player.name}は${getCard(host.cardId).name}から${getCard(brave.cardId).name}を分離させた。` +
            `（コア${give}個を${getCard(brave.cardId).name}へ移した）`,
    )
    // 分け直した結果、維持コアを下回った側は消滅する
    for (const inst of [brave, host]) {
        if (inst.cores < instMinLevelCores(inst)) {
            destroySpirit(state, ownerPid, inst.instanceId, "deplete")
        }
    }
}

// ---- ブレイヴの分離（場を離れるとき。docs/design/BRAVE.md §6）----

// **ホストが場を離れるときに必ず1回だけ呼ぶ共通の入口。**
// 場を離れる経路は破壊だけではない（維持コア割れの消滅・手札へ戻る・デッキへ戻る・
// ターン終了でネクサスに戻る）。**入口ごとに書くと必ずどれかを忘れる**ので、
// `field.spirits` から個体を抜くすべての箇所がこれを通る（§6.1.1）。
//
// 残すには「自分のフィールド/リザーブから **Lv1の維持コスト以上のコア**を置く」必要がある（§1.4）。
// **非対話（テスト・AI）ではリザーブから払えるなら自動で残す。**
// プレイヤーに置き方を選ばせる対話版は段階5（`PayingState` の3つ目の起点が要る。§6.3）。
export function detachBravesOnLeave(state: GameState, ownerPid: PlayerId, host: CardInstance): void {
    const player = state.players[ownerPid]
    const braves = bravesOf(player, host)
    if (braves.length === 0) return
    // 先に参照を切る。異魔神ブレイヴ（実体1つ・参照2本）は、
    // **もう片方のホストがまだ生きていれば合体したまま**にする
    delete host.braveRefs
    const wasAttacker = state.battle?.attackerInstanceId === host.instanceId
    const wasBlocker = state.battle?.blockerInstanceId === host.instanceId
    for (const brave of braves) {
        if (player.field.spirits.some((sp) => (sp.braveRefs ?? []).some((r) => r.instanceId === brave.instanceId))) {
            continue // まだ別のホストと合体している
        }
        const at = player.field.combinedBraves.findIndex((b) => b.instanceId === brave.instanceId)
        if (at !== -1) player.field.combinedBraves.splice(at, 1)
        const name = getCard(brave.cardId).name
        const need = braveKeepCores(brave)
        if (player.reserve < need) {
            // 残せない → **合体元と同時にトラッシュへ**（§1.4）。合体中のコアは0なので戻すコアは無い
            player.trashCards.push(brave.cardId)
            log(state, `${player.name}の${name}は、コアを置けないため合体元と一緒にトラッシュに置かれた。`)
            continue
        }
        player.reserve -= need
        brave.cores = need
        // 合体スピリットの疲労状態をそのまま引き継ぐ（合体中は1体なので状態を共有している。§1.3）
        brave.isRested = host.isRested
        player.field.spirits.push(brave)
        log(state, `${player.name}の${name}は、コア${need}個を置いてスピリット状態でフィールドに残った。`)
        // アタック中なら、ブレイヴがそのままバトルを引き継ぐ（§6.2 の5）。
        // **アタック宣言はやり直さない**＝アタック時効果は再発揮しない（2026-08-25 ユーザー確認。§12 の7）
        if (state.battle && wasAttacker) state.battle.attackerInstanceId = brave.instanceId
        else if (state.battle && wasBlocker) state.battle.blockerInstanceId = brave.instanceId
    }
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
    // deferCommit: 破壊待機の設定と確定（トラッシュ行き）を**呼び出し元が管理する**印。
    // 【不死】のように「破壊時の誘発」として同じ待機の窓の中で解決したいものがあるときに使う
    // （resolveDestroyOne。docs/design/TIMING_CHART.md §1.5）
    options?: { skipRevive?: true; allowSuspend?: true; deferCommit?: true },
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
    // ただし skipRevive（復活を断ったあとの同じ破壊の続き）と
    // deferCommit（呼び出し元が待機を管理している同じ破壊）は通す
    if (inst.pendingDestruction && !options?.skipRevive && !options?.deferCommit) return false
    const master = getCard(inst.cardId)

    // ＞６：まず**破壊待機状態**にする。カードはフィールドに残り、コアも乗ったまま。
    // 「フィールドに残る」は、この待機状態を解除する効果として働く（applyRevived が印を消す）
    inst.pendingDestruction = true
    // 破壊直前のコア数を記録（漆黒鳥ヤタグロスの coreGainPer: selfCoresAtDestruction）
    inst.coresAtDestruction = inst.cores

    // 復活チェック（cause==="destroy"のときのみ。維持コア割れ＝消滅は対象外）。
    // 破壊されるかわりに場に留まる。複数ソースがある場合は self由来→ownAll由来の順で最初の1つだけ適用。
    // ⚠️ ここで true が返るのは「復活した」「確認を保留した」の両方。
    //    確認待ちの間も破壊待機状態のままなので、印はここでは消さない（applyRevived が消す）
    if (
        cause === "destroy" &&
        !options?.skipRevive &&
        tryReviveOnDestroy(state, ownerPid, inst, context, undefined, options?.allowSuspend === true)
    ) {
        return false
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

    // ＞６-1：破壊時の誘発。**この間、破壊された個体はまだフィールドにいる**
    // （数・シンボル・効果の対象・【転召】の生贄に数えられる）
    if (cause === "destroy") {
        fireTrigger(state, ownerPid, inst, "onDestroy")
        if (state.pendingChoice || state.winner) {
            suspendDestroyCommit(state, ownerPid, inst, 1, byBattle, wasAttacker, bySpiritEffect, sourceInstanceId, options?.deferCommit)
            return true
        }
    }
    fireOwnSpiritDestroyed(state, ownerPid, inst, byBattle, wasAttacker, bySpiritEffect, sourceInstanceId)
    if (state.pendingChoice || state.winner) {
        suspendDestroyCommit(state, ownerPid, inst, 2, byBattle, wasAttacker, bySpiritEffect, sourceInstanceId, options?.deferCommit)
        return true
    }

    // ＞６-3/4：破壊待機状態を解いて、カードをトラッシュへ・コアをリザーブへ。
    // deferCommit のときは呼び出し元が同じ窓の中で続きを解決するので、ここでは確定しない
    if (!options?.deferCommit) commitPendingDestruction(state, ownerPid, inst)
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
    sourceInstanceId: string | undefined,
    deferCommit?: true,
): void {
    // 勝敗が決まっているならもう盤面は動かさない（待機のまま終わってよい）
    if (state.winner) {
        if (!deferCommit) commitPendingDestruction(state, ownerPid, inst)
        return
    }
    pushResumeFrames(state, [
        {
            kind: "destroyCommit",
            pid: ownerPid,
            instanceId: inst.instanceId,
            step,
            byBattle,
            wasAttacker,
            bySpiritEffect,
            ...(sourceInstanceId !== undefined ? { sourceInstanceId } : {}),
            ...(deferCommit ? { deferCommit } : {}),
        },
    ])
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
    sourceInstanceId: string | undefined,
): void {
    const master = getCard(inst.cardId)
    fireFieldEventTriggers(state, ownerPid, "ownSpiritDestroyed", { pid: ownerPid, inst }, master.colors, undefined, undefined, {
        vanilla: instIsVanilla(inst),
        byBattle,
        wasAttacker,
        bySpiritEffect,
        ...(sourceInstanceId !== undefined ? { sourceInstanceId } : {}),
        families: master.family,
        // instAllCosts：破壊されたスピリットの本来のコストに加え、道化師クランの付与コストも含める
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
        fireOwnSpiritDestroyed(state, frame.pid, inst, frame.byBattle, frame.wasAttacker, frame.bySpiritEffect, frame.sourceInstanceId)
        if (state.pendingChoice || state.winner) {
            suspendDestroyCommit(state, frame.pid, inst, 2, frame.byBattle, frame.wasAttacker, frame.bySpiritEffect, frame.sourceInstanceId, frame.deferCommit)
            return
        }
    }
    // deferCommit のときは、外側（destroyOne フレーム）が【不死】を解決してから確定させる
    if (!frame.deferCommit) commitPendingDestruction(state, frame.pid, inst)
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
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex((s) => s.instanceId === inst.instanceId)
    if (index === -1) {
        delete inst.pendingDestruction
        return
    }
    detachBravesOnLeave(state, ownerPid, inst) // 合体していたブレイヴを外す（§6.1.1）
    player.field.spirits.splice(index, 1)
    player.trashCards.push(inst.cardId)
    // 破壊されたスピリット上のコアは通常リザーブへ戻るが、
    // destroyedCoresToTrash（古龍の縄張りLv1）が有効な間、または現在のバトルで
    // battleOpponentDestroyedCoresToVoid（BS10-X01幻羅星龍ガイ・アスラLv4）が
    // このプレイヤーを指している間はボイド（トラッシュ）へ置かれる
    if (destroyedCoresGoToTrash(state) || state.battle?.opponentDestroyedCoresToVoidPid === ownerPid) {
        player.trashCores += inst.cores
    } else {
        player.reserve += inst.cores
    }
    delete inst.pendingDestruction
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
            if (state.phase !== effect.phaseTurn.phase) continue
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

// この個体を今このコンテキストで破壊しようとしたとき、
// **そもそも「フィールドに残る」が成立しうるか**（任意・強制を問わない。副作用なし）。
// 【不死】と「フィールドに残る」の解決順をターンプレイヤーに聞くべきかの判定に使う
export function wouldRevive(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
    context?: DestroyContext,
): boolean {
    const inst = state.players[ownerPid].field.spirits.find((s) => s.instanceId === instanceId)
    if (!inst) return false
    return tryReviveOnDestroy(state, ownerPid, inst, context, undefined, true, "any")
}

// ── 【不死】（BS09）──────────────────────────────────────────────────────
// トラッシュにある【不死】持ちのスピリットカードは、指定コストの自分のスピリットが破壊されたとき、
// **通常のコストを支払って**召喚できる（『お互いのアタックステップ』限定）。
// ⚠️ 同じ破壊に対する「フィールドに残る」と**同時発揮**で、ターンプレイヤーが決める解決順が
//    結果を変える（残るを先に解決すると破壊されなかったことになり、【不死】は発動できない）。
// docs/design/BS09_PLAN.md §3 ／ docs/design/TIMING_CHART.md §0-3

// この破壊で【不死】の確認が出るトラッシュのカード位置を列挙する（**副作用なし**）。
// 召喚コスト＋維持コアをリザーブから払えないものは、確認自体を出さないので除く
export function fushiCandidates(state: GameState, ownerPid: PlayerId, destroyedCost: number): number[] {
    // 『お互いのアタックステップ』：アタックステップ以外では発揮しない
    if (state.phase !== "attack") return []
    const player = state.players[ownerPid]
    const found: number[] = []
    for (let i = 0; i < player.trashCards.length; i++) {
        const cardId = player.trashCards[i]
        if (cardId === undefined) continue
        const card = getCard(cardId)
        if (card.type !== "spirit") continue
        const hit = card.effects.some(
            (e) =>
                e.kind === "keyword" &&
                e.keyword === "fushi" &&
                (e.triggerCosts ?? []).includes(destroyedCost),
        )
        if (!hit) continue
        if (player.reserve < effectiveCost(state, ownerPid, card) + minLevelCores(card)) continue
        found.push(i)
    }
    return found
}

function suspendFushiSummon(state: GameState, ownerPid: PlayerId, trashIndex: number): void {
    const cardId = state.players[ownerPid].trashCards[trashIndex]
    if (cardId === undefined) return
    const card = getCard(cardId)
    suspend(state, {
        pid: ownerPid,
        kind: "option",
        prompt: `${card.name}：【不死】でトラッシュからコスト${String(effectiveCost(state, ownerPid, card))}を支払って召喚しますか？`,
        candidates: [],
        options: ["召喚する"],
        optional: true,
        confirm: true,
        fushiSummon: { pid: ownerPid, cardId, trashIndex },
        action: { type: "noop" },
        selfInstanceId: null,
    })
}

// 【不死】の確認で「召喚する」が選ばれたときの後処理。**コストはここで支払う**
export function applyFushiSummon(
    state: GameState,
    info: NonNullable<PendingChoice["fushiSummon"]>,
): void {
    const player = state.players[info.pid]
    // 確認を出したあとにトラッシュが動いている可能性があるので、位置が食い違えばカードIDで取り直す
    const index =
        player.trashCards[info.trashIndex] === info.cardId
            ? info.trashIndex
            : player.trashCards.indexOf(info.cardId)
    if (index === -1) return
    const card = getCard(info.cardId)
    const cost = effectiveCost(state, info.pid, card)
    const maintain = minLevelCores(card)
    if (player.reserve < cost + maintain) {
        log(state, `${player.name}は【不死】のコストを支払えず、${card.name}を召喚できなかった。`)
        return
    }
    player.trashCards.splice(index, 1)
    // 召喚コストはリザーブからトラッシュへ、維持コアはリザーブからスピリットの上へ（通常の召喚と同じ）
    player.reserve -= cost
    player.trashCores += cost
    player.reserve -= maintain
    const inst = createInstance(info.cardId, state.turn, maintain)
    player.field.spirits.push(inst)
    log(state, `${player.name}は【不死】で${card.name}をトラッシュから召喚した。（コスト${String(cost)}）`)
    // 「召喚」なので【転召】も召喚時効果も通常どおり解決する
    if (!state.winner) resolveTensho(state, info.pid, inst)
    if (state.winner) return
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

// 【不死】が絡む1体ぶんの破壊を、確定した順番どおりに解決する。
// 中断したら destroyOne フレームを積んで抜ける（続きは drainResumeStack が回す）。
// 破壊の結果は state.lastReviveDestroyed に残す（バッチが「破壊できた数」に算入するため）
export function resolveDestroyOne(
    state: GameState,
    frame: Extract<ResumeFrame, { kind: "destroyOne" }>,
): void {
    let fushiDone = frame.fushiDone
    for (let s = frame.step; s < frame.order.length; s++) {
        if (frame.order[s] === "destroy") {
            // deferCommit：破壊待機状態を解かずに戻ってくる。こうすることで
            // 続く【不死】の解決が**同じ待機の窓の中**で走る（TIMING_CHART.md §1.5）。
            // 破壊された個体はまだ場にいるので、シンボルは軽減にそのまま数えられ、
            // 【転召】の生贄にも取れる
            state.lastReviveDestroyed = destroySpirit(
                state,
                frame.pid,
                frame.instanceId,
                "destroy",
                frame.context,
                { allowSuspend: true, deferCommit: true },
            )
        } else {
            // ⚠️「破壊」を先に解決していて、そこで**場に残った**（＝破壊されなかった）なら、
            // 【不死】の引き金（「破壊されたとき」）が成立しないので発揮しない。
            // これが「残るを先に解決したら【不死】は撃てない」の実体（BS09_PLAN.md §3）
            const destroyIndex = frame.order.indexOf("destroy")
            if (destroyIndex >= 0 && destroyIndex < s && state.lastReviveDestroyed !== true) continue
            // 【不死】：候補を1枚ずつ確認する（確認のたびに中断しうる）。
            // 候補は解決のたびに数え直す（召喚でトラッシュが減るため）。
            // 破壊された個体は破壊待機状態でまだ場にいるので、
            // **その個体のシンボルも軽減にそのまま数えられる**（特別扱いは要らない）
            while (true) {
                const candidates = fushiCandidates(state, frame.pid, frame.destroyedCost)
                const next = candidates[fushiDone]
                if (next === undefined) break
                fushiDone++
                if (state.interactiveTargets) {
                    suspendFushiSummon(state, frame.pid, next)
                    break
                }
                // 非対話（テスト・自動解決）では確認せずに召喚する（既存の任意効果と同じ簡略化）
                const cardId = state.players[frame.pid].trashCards[next]
                if (cardId === undefined) break
                applyFushiSummon(state, { pid: frame.pid, cardId, trashIndex: next })
                if (state.pendingChoice || state.winner) break
            }
        }
        if (state.winner) return
        if (state.pendingChoice) {
            // 「破壊」で中断したときはそのステップは終わっている（確認の答えが決着させる）ので次から。
            // 【不死】で中断したときは同じステップの続き（残りの候補）から再開する
            const nextStep = frame.order[s] === "destroy" ? s + 1 : s
            pushResumeFrames(state, [{ ...frame, step: nextStep, fushiDone }])
            return
        }
    }
    // すべて解決し終えた。破壊待機状態を解いてカードをトラッシュへ
    // （deferCommit で先送りしていたぶん。復活していれば印は消えているので何もしない）
    const inst = state.players[frame.pid].field.spirits.find((x) => x.instanceId === frame.instanceId)
    if (inst) commitPendingDestruction(state, frame.pid, inst)
}

// 「破壊そのもの」と【不死】のどちらを先に解決するかを、ターンプレイヤーに聞いて中断する
function suspendDestroyEffectOrder(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): void {
    suspend(state, {
        pid: state.turnPlayer,
        kind: "option",
        prompt: `${state.players[ownerPid].name}の${getCard(inst.cardId).name}の破壊：どちらを先に解決しますか？`,
        candidates: [],
        options: ["フィールドに残る", "【不死】で召喚する"],
        optional: false,
        destroyEffectOrder: {
            pid: ownerPid,
            instanceId: inst.instanceId,
            slots: ["destroy", "fushi"],
        },
        action: { type: "noop" },
        selfInstanceId: null,
    })
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
        // 【不死】（BS09）：この破壊を引き金にトラッシュから召喚できるカードがあるか。
        // **絡まなければ従来どおり destroySpirit を直接呼ぶ**（ほぼ全てのケース）
        const target = state.players[t.pid].field.spirits.find((s) => s.instanceId === t.instanceId)
        const fushi = target ? fushiCandidates(state, t.pid, getCard(target.cardId).cost) : []
        if (fushi.length === 0) {
            if (destroySpirit(state, t.pid, t.instanceId, "destroy", ctx, { allowSuspend: true })) {
                destroyed++
            }
        } else if (target) {
            // 「フィールドに残る」と【不死】が同時発揮するなら、ターンプレイヤーが解決順を決める
            // （残るを先に解決すると破壊されなかったことになり、【不死】は発動できない）
            let order: ("destroy" | "fushi")[] = ["destroy", "fushi"]
            if (wouldRevive(state, t.pid, t.instanceId, ctx)) {
                const pick = state.destroyEffectOrderPick
                if (pick === undefined) {
                    if (state.interactiveTargets) {
                        suspendDestroyEffectOrder(state, t.pid, target)
                        return { destroyed, stoppedAt: i }
                    }
                    // 非対話（テスト・自動解決）は「破壊を先に」で決定的に進める簡略化
                } else {
                    delete state.destroyEffectOrderPick
                    order = pick === "fushi" ? ["fushi", "destroy"] : ["destroy", "fushi"]
                }
            }
            delete state.lastReviveDestroyed
            resolveDestroyOne(state, {
                kind: "destroyOne",
                pid: t.pid,
                instanceId: t.instanceId,
                destroyedCost: getCard(target.cardId).cost,
                order,
                step: 0,
                fushiDone: 0,
                ...(ctx ? { context: ctx } : {}),
            })
            // 中断せずに終わったなら、破壊できたかをここで算入する
            // （中断した場合は destroyOne フレームが決着させ、resumeDestroyBatch が算入する）
            if (!state.pendingChoice && state.lastReviveDestroyed === true) {
                destroyed++
                delete state.lastReviveDestroyed
            }
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
    // ①の破壊（destroySpirits のバッチ経由）だけが立てる。②は渡さず保留へ（destroySpirit の注記）
    allowSuspend?: boolean,
    // **判定だけ**して結果を返す下見モード（確認も復活も実行しない）。
    //   "confirm" ＝「復活しますか？」の確認が出るか（＝任意の復活があるか）
    //   "any"     ＝任意・強制を問わず、そもそも復活が成立しうるか（【不死】との解決順の判定に使う）
    // ⚠️ "any" はコストが払えるかまでは見ない近似（副作用なしで確かめられないため）
    probe?: "confirm" | "any",
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
        if (effect.cost?.oneCoreToTrash) {
            // BS09-063花の宮殿：対象のコア1個を持ち主のトラッシュへ。**コア1個でも支払う**ので、
            // 支払った結果0個になった個体は待機解除の後に維持コア割れで消滅する（2026-08-14 ユーザー確認）
            if (inst.cores <= 0) return false
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
            const cardType = effect.cost.handDiscardCardType
            if (cardType !== undefined) {
                // BS10-046龍仙公主：手札の末尾から指定種別のカードを探して破棄する。
                // 該当が無ければ支払い不可＝不発（指定なしの既存挙動＝末尾1枚は変えない）
                let index = -1
                for (let i = player.hand.length - 1; i >= 0; i--) {
                    if (getCard(player.hand[i]!).type === cardType) {
                        index = i
                        break
                    }
                }
                if (index === -1) return false
                const cardId = player.hand.splice(index, 1)[0]!
                player.trashCards.push(cardId)
                return true
            }
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
        // 復活が成立した＝**破壊待機状態が解除された**（TIMING_CHART.md §1.5）。
        // 印を消さないと、以後この個体は「疲労も回復もできず、破壊もされない」ままになる
        delete inst.pendingDestruction
        if ("toHand" in revived) {
            detachBravesOnLeave(state, ownerPid, inst) // 合体していたブレイヴを外す（§6.1.1）
            const idx = player.field.spirits.findIndex((s) => s.instanceId === inst.instanceId)
            if (idx !== -1) player.field.spirits.splice(idx, 1)
            player.reserve += inst.cores
            player.hand.push(inst.cardId)
            notifyHandGained(state, ownerPid, 1)
        } else {
            inst.isRested = revived.rested
            // 支払いでコアが維持コアを下回った場合は、待機解除の直後に消滅する
            // （cause:"deplete" は復活判定に入らないので再帰しない。BS09-063花の宮殿＝コア1個の個体）
            if (inst.cores < instMinLevelCores(inst)) {
                destroySpirit(state, ownerPid, inst.instanceId, "deplete")
            }
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
            if (effect.lentOnly && !isVirtualSource(source)) continue
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
            // optional は self 由来と同じ扱い（発生源は source 側＝oncePerTurn の記録先）。
            // allowSuspend が渡っていれば**その場で**確認を出す（渡っていなければ従来どおり保留へ）
            if (effect.optional && state.interactiveTargets && !forced) {
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
                fireFieldEventTriggers(state, ownerPid, "ownNexusDestroyed", undefined, undefined, undefined, undefined, {
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
    inst.pendingBounce = { to }
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
            detachBravesOnLeave(state, pid, inst) // 合体していたブレイヴを外す（§6.1.1）
            player.field.spirits.splice(index, 1)
            player.reserve += inst.cores
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
    const floor = coreFloorFor(state, inst, ownerPid)
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
    const removed = Math.min(count, Math.max(0, inst.cores - coreFloorFor(state, inst, ownerPid)))
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
    // ブロッカー限定の保護（BS09-027密林の勇者皇ヴォルザ：「このスピリットをブロックしている
    // スピリット上に置いてあるコアは取り除くことができない」）。バトル終了で state.battle ごと消える
    if (state.battle?.blockerCoresProtected && state.battle.blockerInstanceId === inst.instanceId) {
        return true
    }
    if (!isInCurrentBattle(state, inst)) return false
    return hasActiveGlobalConstraint(state, "battlingCoresProtected")
}