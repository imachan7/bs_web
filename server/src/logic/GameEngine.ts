// 召喚/アタック等のアクション実行とイベント発火の統括
import { noteCoverage, noteKeyword } from "../../../shared/coverage"
import { askSurchargePay, payFreeSummonSurcharge } from "./summonSurcharge"
import { exSymbolsOfTrashCard, selfSetCost, summonSurcharge } from "../../../shared/cost"
import type { CardInstance, Color, EffectAction, EffectDef, GameAction, GameState, PaySource, PlayerId } from "../type"
import {
    clearBattle,
    coresForLevel,
    createInstance,
    currentLevel,
    findNexus,
    findSpirit,
    getCard,
    log,
    instMinLevelCores,
    minLevelCores,
    opponentOf,
    placedCoresForSummon,
    checkNoMutationAfterSuspend,
    noteHandleActionEntry,
    pushResumeFrames,
    suspend,
} from "./GameState"
import { endTurn, toAttackPhase } from "./PhaseManager"
import { fireQueuedDestroyBursts } from "./removal"
import { wouldDepleteOf, moveSoulCore, placeSoulCoreOnSummoned, soulCoreInReserve, soulCoreInTrash } from "./soulCore"
import { resolveBlockDeclared } from "./blockDeclared"
import { finishSummonEffect } from "./keywords/burst"
import { markPayConfirmed } from "./actions/pay"
import { doUseHandBurstEffect } from "./handBurstEffect"
import { blockExhaustSpiritRequired, blockPayCost, blockReserveToTrashCount, blockRequiredCount } from "../../../shared/block"
import {
    AWAKEN_FROM_RESERVE,
    timedContentsOn,
    activeConstraintsWithSource,
    cardHasColor,
    hostsOf,
    hasKeyword,
    instAllCosts,
    attackTollTotal,
    attackPayTollCount,
    instIsCombined,
    matchesFamilyFilter,
    spiritHasKeyword,
    matchesTarget,
    resolveSelfRelative,
    hasSuperAwaken,
    isEndStepLocked,
    summonExhausted,
    burstSetCoresRequired,
    payAssistCandidates,
    ownHandKeyword,
    noteHeldKeyword,
} from "../../../shared/rules"
import {
    placeBurst,
    attachBrave,
    detachBraveVoluntary,
    checkExhaustOnCoreChange,
    consumeSummonHandDiscardPay,
    destroySpirit,
    effectiveBp,
    emitEvent,
    exhaustSpirit,
    offerOpponentMainEndMagic,
    fireExhaustedTriggers,
    fireSummonSequence,
    flushPendingTenshoEvent,
    fireFieldEventTriggers,
    fireBpReachedTriggers,
    fireTrigger,
    hasFunsaiOnBlock,
    hasKyoshuOnBlock,
    instColors,
    millDeck,
    fireNexusDeployed,
    payCost,
    refreshLevelAsOverrides,
    sweepLevelCostDepletion,
    resolveAction,
    resolveFunsai,
    resolveKoboOnBattleEnd,
    resolveTensho,
    returnSpiritToHand,
    returnNexusToDeckBottom,
    flushBounces,
    refreshSpirit,
} from "./EffectModules"
import {
    effectiveCost,
    validateActivateAbility,
    validateAttack,
    validateAwaken,
    validateBlock,
    validateEndTurn,
    validateCombineBrave,
    validateDetachBrave,
    validateMoveCore,
    validateSwapSoulCore,
    nexusMillPayAmount,
    summonHandDiscardPayAmount,
    validatePass,
    validateResshinsokuSummon,
    validateSetBurst,
    validateSetNexus,
    validateSummon,
    validateTakeLife,
    validateUseHandAbility,
} from "./RuleValidator"
import { doCastMagic } from "./magic/cast"
import { effectActiveAtLevel } from "./EffectModules"
import { doResolveChoice } from "./choice"
import { resolveBattle, resolveDirectedBlock, resolveLifeDamage } from "./battleResolve"
import { resolveForcedBlock } from "./forcedBlock"
import { markOnceUsed, markOnceNameUsed, revertOnceUsed, markOncePerBattleUsed, revertOncePerBattleUsed } from "./oncePerTurn"

// アクションを実行し、エラーがあれば理由を返す（null = 成功）
export function handleAction(
    state: GameState,
    pid: PlayerId,
    action: GameAction,
): string | null {
    if (state.winner) return "ゲームはすでに終了しています"

    // クライアント演出用イベント列は1アクションごとに配信するため、実行前にクリアする
    state.events = []
    noteHandleActionEntry(state)
    const result = dispatchAction(state, pid, action)
    // バトルがどの経路（解決・ライフ受け・endBattle 効果）で終了しても、
    // サイレントウォールの遅延効果（アタックステップ終了）を一元的に処理する
    forceEndTurnIfFlagged(state)
    // levelAs はスピリット数が変わるたび（召喚・破壊）に再計算が要る
    if (!state.winner) refreshLevelAsOverrides(state)
    // 維持コアを下回った個体の掃除（refreshLevelAsOverrides の後に置くこと）
    sweepLevelCostDepletion(state)
    // バウンス待機カードは選択待ちが無くなった時点で手札／デッキへ移す。resolveAction を通らない経路（エンドステップのデッキ下戻し・召喚時の入れ替え）の安全網
    if (!state.pendingChoice) flushBounces(state)
    // 【迷彩】の支払い済み目印は、払った効果の解決（中断含む）が終わるまで持ち、次の効果へ持ち越さない
    if (!state.pendingChoice) delete state.meisaiPaidFor
    if (!state.pendingChoice) delete state.summonSurchargePaid
    // 公開ゾーンは選択待ちが無くなった時点で必ず片付ける（順番選択のスキップ・中断でもカードを宙に浮かせない不変条件）
    flushRevealedCardsIfIdle(state)
    // 『召喚時』効果の解決中フラグは、選択待ちが無くなった時点で落とす
    if (!state.pendingChoice) {
        delete state.resolvingSummonTriggerPid
        finishSummonEffect(state)
    }
    if (!state.pendingChoice && state.resumeStack.length === 0) {
        delete state.lastMoved
        delete state.lastCores
        delete state.lastDrawn
        delete state.lastTargets
        delete state.recordScope
    }
    // 「破壊される代わりに復活できる」の確認は破壊処理の途中では中断できないので、解決しきったここで1件ずつ出す
    requestPendingReviveConfirm(state)
    requestPendingReviveDestination(state)
    endBattleIfAttackerLeftField(state)
    // 破壊後バースト：破壊の確定・ブレイヴの残す/残さない・【光芒】等まですべて決着した地点で発火（TIMING_CHART.md ＞６）
    if (!state.pendingChoice) fireQueuedDestroyBursts(state)
    // 「BPがN以上になった時」は今の効果の処理が終わってから発揮されるので、解決しきったここで判定する
    if (!state.pendingChoice && state.resumeStack.length === 0 && !state.winner) fireBpReachedTriggers(state)
    checkNoMutationAfterSuspend(state)
    return result
}

// アタッカーが場から居なくなっていたらバトルを終了する（ブロック前のみ）。
// 2026-08-23 利用者報告：フラッシュでアタッカーを破壊しても、防御側が「ブロック／ライフ受け」を選ばされていた。
// ⚠️ 判定は「破壊されたか」ではなく「場にいないか」（2026-08-23 ユーザー確認）。
// 破壊されても場に残った場合と破壊待機中は、アタックを継続する。
// ブロック宣言後は resolveBattle が面倒を見る（割り込むと＞５〜＞７の順序を壊す）。
function endBattleIfAttackerLeftField(state: GameState): void {
    const battle = state.battle
    if (!battle || state.winner || state.pendingChoice) return
    if (battle.blockerInstanceId) return
    // 「場にいるか」は両者のフィールドで判定する（盤面を手で組んだテストはアタッカーを相手側に置くことがある）
    const attackerPid = state.turnPlayer
    const attackerAlive =
        findSpirit(state.players.p1, battle.attackerInstanceId) ??
        findSpirit(state.players.p2, battle.attackerInstanceId)
    if (attackerAlive) return

    log(state, "アタックしていたスピリットが場を離れたため、バトルは終了した。")
    // ＞７：バトル終了時。ブロック前なので発揮されうるのはアタッカーの【光芒】だけ（2026-08-23 ユーザー確認）。
    // 場を離れた個体の cardId・コア数は控えておいた実体参照から読む
    resolveKoboOnBattleEnd(state, attackerPid, state.battleAttackerRef)
    clearBattle(state)
    state.isFlashTiming = false
}

// 保留していた復活の確認を1件だけ pendingChoice として立てる。確認までに場から居なくなった対象は捨てる
function requestPendingReviveConfirm(state: GameState): void {
    if (state.pendingChoice || state.winner) return
    const queue = state.pendingReviveConfirms
    if (!queue || queue.length === 0) return
    while (queue.length > 0) {
        const entry = queue.shift()!
        const inst = state.players[entry.pid].field.spirits.find((s) => s.instanceId === entry.instanceId)
        if (!inst) continue
        suspend(state, {
            pid: entry.pid,
            kind: "option",
            prompt: `${getCard(inst.cardId).name}：破壊される代わりに復活させますか？`,
            candidates: [],
            options: ["復活させる"],
            optional: true,
            confirm: true,
            reviveConfirm: entry,
            action: { type: "noop" },
            selfInstanceId: entry.instanceId,
        })
        return
    }
    if (queue.length === 0) delete state.pendingReviveConfirms
}

// 復活で手札に入ったカードの行き先を1件だけ聞く。確認（復活させるか）が先、行き先は後
function requestPendingReviveDestination(state: GameState): void {
    if (state.pendingChoice || state.winner || (state.pendingReviveConfirms?.length ?? 0) > 0) return
    const entry = state.pendingReviveDestinations?.shift()
    if (!entry) {
        delete state.pendingReviveDestinations
        return
    }
    suspend(state, {
        pid: entry.pid,
        kind: "option",
        prompt: `${getCard(entry.cardId).name}：手札に戻すか、デッキの上に置くかを選んでください`,
        candidates: [],
        options: ["手札に残す", "デッキの上に置く"],
        optional: false,
        reviveDestination: entry,
        action: { type: "noop" },
        selfInstanceId: null,
    })
}

// 選択待ちが残っている間は「まだ選んでいる途中」なので何もしない
function flushRevealedCardsIfIdle(state: GameState): void {
    const zone = state.revealedCards
    if (!zone) return
    if (state.pendingChoice) return
    const player = state.players[zone.pid]
    for (const id of zone.cardIds) player.deck.push(id)
    if (zone.cardIds.length > 0) {
        log(state, `${player.name}は残り${zone.cardIds.length}枚をデッキの下に戻した。`)
    }
    delete state.revealedCards
}

function dispatchAction(
    state: GameState,
    pid: PlayerId,
    action: GameAction,
): string | null {
    // 降参はゲームの手順の外側にある操作なので、他のどの検証よりも先に処理する
    if (action.type === "surrender") return doSurrender(state, pid)
    // ⚠️ 廃止予定：この設定は**もう判定に使われない**（2026-08-17 に効果ごとに聞く形へ移した）。
    // クライアントがまだ送ってくるので受け皿だけ残している。UI からトグルが消えたら削除すること
    if (action.type === "setPayToNegate") {
        state.players[pid].payToNegate = action.enabled
        log(
            state,
            `${state.players[pid].name}は「手札を破棄して効果を受けない」を${action.enabled ? "使う" : "使わない"}に設定した。`,
        )
        return null
    }
    // 効果解決中のプレイヤー選択待ちは resolveChoice 以外のアクションをすべて拒否する
    if (state.pendingChoice && action.type !== "resolveChoice") {
        return "対象の選択待ちです"
    }
    switch (action.type) {
        case "summon":
            return doSummon(state, pid, action.handIndex, action.paySources, action.level, action.substituteInstanceId, action.discardHandIndices, action.braveTargetInstanceId, action.altSummonNexusInstanceIds, action.shinsokuAssistInstanceIds, action.exReductionTrashIndices, action.paySoulCoreFromReserve, action.placeSoulCoreFromReserve)
        case "resshinsokuSummon":
            return doResshinsokuSummon(state, pid, action.handIndex)
        case "setBurst":
            return doSetBurst(state, pid, action.handIndex)
        case "setNexus":
            return doSetNexus(state, pid, action.handIndex, action.paySources, action.level, action.millPay, action.paySoulCoreFromReserve, action.placeSoulCoreFromReserve)
        case "castMagic":
            return doCastMagic(
                state,
                pid,
                action.handIndex,
                action.targetInstanceId,
                action.paySources,
                action.fromTegamoto,
                undefined,
                action.exReductionTrashIndices,
                action.paySoulCoreFromReserve,
                action.useSoulCoreOnly,
                action.timing,
            )
        case "useHandBurstEffect": {
            const error = doUseHandBurstEffect(state, pid, action.handIndex, action.paySources, action.paySoulCoreFromReserve)
            if (error === null) passFlashPriority(state, pid)
            return error
        }
        case "useHandAbility":
            return doUseHandAbility(state, pid, action.handIndex, action.effectId)
        case "swapSoulCore":
            return doSwapSoulCore(state, pid, action.fromInstanceId, action.toInstanceId)
        case "moveCore":
            return doMoveCore(state, pid, action.instanceId, action.direction, action.confirmDeplete, action.soulCore)
        case "combineBrave":
            return doCombineBrave(state, pid, action.braveInstanceId, action.hostInstanceId)
        case "detachBrave":
            return doDetachBrave(state, pid, action.braveInstanceId, action.paySources)
        case "awaken":
            return doAwaken(state, pid, action.instanceId, action.fromInstanceId, action.count)
        case "attack":
            return doAttack(state, pid, action.instanceId, action.targetSpiritInstanceId, action.paySources, action.paySoulCoreFromReserve)
        case "block":
            return doBlock(state, pid, action.instanceId, action.paySources, action.paySoulCoreFromReserve)
        case "takeLife":
            return doTakeLife(state, pid)
        case "pass":
            return doPass(state, pid)
        case "activateAbility":
            return doActivateAbility(state, pid, action.instanceId, action.effectId)
        case "resolveChoice":
            return doResolveChoice(state, pid, action.instanceId, action.option, action.cardIndex, action.paySources, action.paySoulCoreFromReserve)
        case "nextPhase": {
            if (state.turnPlayer !== pid) return "自分のターンではありません"
            if (state.phase !== "main") return "メインステップではありません"
            if (state.secondMainStep) return "第2メインステップの後は、エンドステップに進みます"
            if (state.turn === 1) return "先攻1ターン目はアタックステップがありません"
            if (state.battle) return "バトル中です"
            // 「お互い、アタックステップは行えず」
            if (isEndStepLocked(state, "attackStep")) return "効果により、アタックステップは行えません"
            if (state.extraMainStep) return "追加のメインステップの後は、アタックステップへ進めません"
            // 「相手のメインステップ終了時に使用できる」マジックの確認を挟む
            if (offerOpponentMainEndMagic(state, pid) === "suspended") return null
            toAttackPhase(state)
            return null
        }
        case "endTurn": {
            const error = validateEndTurn(state, pid)
            if (error) return error
            // メインから直接ターン終了しても「相手のメインステップ終了時」は来る。使われたらアタックステップで止め、ターンプレイヤーへ返す。
            // 第2メインステップと先攻1ターン目の終了はアタックステップへ繋がらないため確認しない
            if (state.phase === "main" && !state.extraMainStep && state.secondMainStep !== true && state.turn !== 1 && !isEndStepLocked(state, "attackStep")) {
                const offered = offerOpponentMainEndMagic(state, pid, true)
                if (offered === "suspended") return null
                if (offered === "used") {
                    toAttackPhase(state)
                    return null
                }
            }
            endTurn(state)
            return null
        }
        // "surrender" は冒頭で処理済みのため、ここでは型から除外されている
    }
}

// バトル中のフラッシュで行動したら優先権を相手へ移し、連続パス数をリセットする（フラッシュマジック・神速召喚・覚醒で共通）
export function passFlashPriority(state: GameState, pid: PlayerId): void {
    if (state.battle && state.isFlashTiming) {
        state.priorityPlayer = opponentOf(pid)
        state.flashCount = 0
    }
}

// endAttackStepAfterBattle（サイレントウォール）が立っていれば、バトル終了直後にターン終了を強制実行する（validateEndTurn の検証はスキップ）
function forceEndTurnIfFlagged(state: GameState): void {
    if (!state.endAttackStepAfterBattle || state.winner) return
    if (state.battle) return
    state.endAttackStepAfterBattle = false
    log(state, "このバトルの終了にともない、アタックステップを終了する。")
    endTurn(state)
}

// kind:"battleSwapSummon" の召喚本体（validateSummon 検証済みの前提）。
// 入れ替え元を手札に戻すのを先にする：戻す処理が『手札に戻ったとき』の誘発を回すので、
// 盤面が動きうる前に召喚を確定させると差し替え先を見失う
function doBattleSwapSummon(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    substituteInstanceId: string,
    paySources?: PaySource[],
): string | null {
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const battle = state.battle
    if (!battle) return "バトルが発生していません"
    const wasAttacker = battle.attackerInstanceId === substituteInstanceId

    const substitute = findSpirit(player, substituteInstanceId)
    if (!substitute) return "入れ替え元のスピリットが見つかりません"
    const substituteName = getCard(substitute.cardId).name

    // 召喚コストは通常どおり支払う（入れ替え元を手札に戻すのは追加コスト）。
    // コストは戻す前に確定させる：軽減シンボルは入れ替え元がまだ場にいる時点で数える。
    // 後で計算すると validateSummon が通した額より高くなり、検証を通ったのに払えない食い違いが起きる
    noteCoverage(card.effects.find((e) => e.kind === "battleSwapSummon"), "battleSwapSummon")
    const cost = effectiveCost(state, pid, card)
    returnSpiritToHand(state, pid, substitute)
    const maintain = minLevelCores(card)
    const placedFromField = payCost(state, pid, cost, paySources, maintain)
    player.reserve -= maintain - placedFromField
    player.hand.splice(handIndex, 1)
    const inst = createInstance(cardId, state.turn, maintain, "summon")
    inst.isRested = true
    player.field.spirits.push(inst)
    log(
        state,
        `${player.name}は${substituteName}を手札に戻し、代わりに${card.name}を疲労状態で召喚した。（コスト${cost}）`,
    )
    emitEvent(state, { type: "summon", pid, cardName: card.name })

    if (state.battle) {
        if (wasAttacker) {
            state.battle.attackerInstanceId = inst.instanceId
        } else {
            state.battle.blockerInstanceId = inst.instanceId
        }
    }

    // doSummon と同じ順序：【転召】→ 召喚時効果（中断したら queue で合流する）
    if (!state.winner) resolveTensho(state, pid, inst, false, true)
    if (state.pendingChoice) {
        pushResumeFrames(state, [{ kind: "action", selfInstanceId: inst.instanceId, action: { type: "summonSequence" } }])
    } else {
        fireSummonSequence(state, pid, inst)
    }
    passFlashPriority(state, pid)
    if (state.winner) state.battle = null
    return null
}

// 【転召】まで解決し終えたスピリットを、維持コアを置いて実際にフィールドへ出す（docs/design/RESUME_STACK.md §6）。転召の対象選択で中断した場合は ResumeFrame "placeSummon" から呼び直される
export function placeSummonedSpirit(
    state: GameState,
    pid: PlayerId,
    inst: CardInstance,
    reserveDelta: number,
    logText: string,
    cardName: string,
    // ダイレクトブレイヴ：合体先スピリットの instanceId（docs/design/BRAVE.md §5.2）。指定時、実体は field.combinedBraves へ入りホストが braveRefs で参照する
    braveTargetInstanceId?: string,
    // [ソウルコア]を維持コアとして置く（2026-10-06）。cores は createInstance に含まれているので、リザーブの取り崩しとポインタだけ動かす
    placeSoulOnSummoned?: boolean,
): void {
    const player = state.players[pid]
    player.reserve -= reserveDelta
    if (placeSoulOnSummoned === true && placeSoulCoreOnSummoned(player, inst)) {
        log(state, `${player.name}はリザーブの[ソウルコア]を${getCard(inst.cardId).name}の維持コアとして置いた。`)
    }
    const host =
        braveTargetInstanceId === undefined
            ? undefined
            : player.field.spirits.find((sp) => sp.instanceId === braveTargetInstanceId)
    if (host !== undefined) {
        attachBrave(state, pid, host, inst)
    } else {
        player.field.spirits.push(inst)
    }
    delete state.summoningInstanceId
    log(state, logText)
    emitEvent(state, { type: "summon", pid, cardName })
    // 保留していた『転召したとき』は、場に出てから発火する（召喚されたカード自身の分を拾うため）
    flushPendingTenshoEvent(state)
    if (state.pendingChoice) {
        pushResumeFrames(state, [
            { kind: "action", selfInstanceId: inst.instanceId, action: { type: "summonSequence" } },
        ])
        return
    }
    if (!state.winner) fireSummonSequence(state, pid, inst)
}

function doSummon(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    paySources?: PaySource[],
    level?: number,
    substituteInstanceId?: string,
    discardHandIndices?: number[],
    braveTargetInstanceId?: string, // 指定時はダイレクトブレイヴ（docs/design/BRAVE.md §5）
    altSummonNexusInstanceIds?: string[], // 指定時は kind:"altSummonFromHand" の代替召喚（docs/design/COST_MODEL.md）
    shinsokuAssistInstanceIds?: string[], // 指定時は kind:"payAssistByExhaust"：疲労させることで召喚コストの一部を肩代わりする
    exReductionTrashIndices?: number[], // 《継召》(kind:"exTrashReduction")：除外して軽減するトラッシュ内インデックス
    paySoulCoreFromReserve?: boolean, // リザーブの[ソウルコア]をコスト支払い1個ぶんとして使う
    placeSoulCoreFromReserve?: boolean, // リザーブの[ソウルコア]を維持コアとして召喚したスピリットに置く
): string | null {
    const error = validateSummon(state, pid, handIndex, paySources, level, substituteInstanceId, discardHandIndices, braveTargetInstanceId, altSummonNexusInstanceIds, shinsokuAssistInstanceIds, exReductionTrashIndices, paySoulCoreFromReserve, placeSoulCoreFromReserve)
    if (error) return error

    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)

    // 《継召》の除外記録は「直近の召喚」ぶんだけ残る（毎回の召喚で空配列に上書きする）
    state.keishoExcludedCardIds = []
    delete state.summonPaidWithSoulCore

    // kind:"battleSwapSummon"：バトル中の自分のスピリット1体を手札に戻し（追加コスト）、疲労状態で召喚してバトルを引き継ぐ
    if (substituteInstanceId !== undefined) {
        return doBattleSwapSummon(state, pid, handIndex, substituteInstanceId, paySources)
    }

    // kind:"altSummonFromHand"：指定した自分の青ネクサスをデッキの下に戻すのがコストで、召喚コストは支払わない（維持コアは通常どおりリザーブから）
    if (altSummonNexusInstanceIds !== undefined) {
        noteCoverage(card.effects.find((e) => e.kind === "altSummonFromHand"), "altSummonFromHand")
        for (const id of altSummonNexusInstanceIds) returnNexusToDeckBottom(state, pid, id)
    }
    // kind:"payAssistByExhaust"：指定した発生源を疲労させ、召喚コストの一部を肩代わりする
    let shinsokuDiscount = 0
    if (shinsokuAssistInstanceIds !== undefined && shinsokuAssistInstanceIds.length > 0) {
        // 【神速】かどうかの条件は validateSummon で確認済み。ここは割引額と消費記録を引くだけなので flash は見ない
        const candidates = new Map(payAssistCandidates(state, pid, { cardId: player.hand[handIndex]!, flash: true }).map((c) => [c.instanceId, c]))
        for (const id of shinsokuAssistInstanceIds) {
            const inst = [...player.field.spirits, ...player.field.nexuses].find((s) => s.instanceId === id)
            if (inst) inst.isRested = true
            noteCoverage(inst ? getCard(inst.cardId).effects.find((e) => e.kind === "payAssistByExhaust") : undefined, "payAssistByExhaust")
            const c = candidates.get(id)
            if (c?.oncePerTurn) player.payAssistUsedThisTurn = [...(player.payAssistUsedThisTurn ?? []), id]
            shinsokuDiscount += c?.discount ?? 0
        }
        log(state, `${player.name}は自分のカードを疲労させ、召喚コストのうち${shinsokuDiscount}を支払ったものとして扱った。`)
    }
    // 《継召》：指定されたトラッシュのEXシンボル持ちカードを除外し、そのシンボル列を召喚コストの軽減に使う（軽減に使えるのは同じ色だけで、枚数×シンボル数とは限らない）
    let exReductionSymbols: Color[] = []
    if (exReductionTrashIndices !== undefined && exReductionTrashIndices.length > 0) {
        const excluded: string[] = []
        exReductionSymbols = exReductionTrashIndices.flatMap((idx) => exSymbolsOfTrashCard(state, pid, idx))
        for (const idx of [...exReductionTrashIndices].sort((a, b) => b - a)) {
            const [id] = player.trashCards.splice(idx, 1)
            if (id !== undefined) excluded.unshift(id)
        }
        player.excludedCards.push(...excluded)
        state.keishoExcludedCardIds = excluded
        log(
            state,
            `${player.name}はトラッシュのEXシンボル${excluded.length}枚を除外し、《継召》で召喚コストを軽減した。`,
        )
    }
    const cost = Math.max(
        0,
        (altSummonNexusInstanceIds !== undefined ? summonSurcharge(state, pid, card) : effectiveCost(state, pid, card, false, exReductionSymbols)) -
            shinsokuDiscount,
    )
    // 「〜ならコストNにする。同じカード名でターンに1回」：この注記のコストで召喚したら1回と数える
    if (altSummonNexusInstanceIds === undefined && card.effects.some((e) => e.kind === "selfSummonCost" && e.oncePerTurnName) && selfSetCost(state, pid, card) !== undefined) {
        state.selfSummonCostUsedNames = { ...(state.selfSummonCostUsedNames ?? {}), [pid]: [...(state.selfSummonCostUsedNames?.[pid] ?? []), card.name] }
    }
    // レベル指定があればそのレベルぶんのコアを置いて召喚する（省略時はLv1）。
    // ダイレクトブレイヴは維持コアを置かない（合体状態のLv1が0コア。それがこの召喚の利点そのもの。BRAVE.md §5.2）。
    // 《真界放》マーカー付き＋placeSoulCoreFromReserve は「[ソウルコア]1個のみ」のwaiver配置（placedCoresForSummon）
    const maintain = placedCoresForSummon(card, level, {
        braveTarget: braveTargetInstanceId !== undefined,
        placeSoulCoreFromReserve,
    })

    // コアで足りない分の召喚コストを手札破棄で支払う（枚数は validateSummon と同じ関数で出す）
    const discardPaid = summonHandDiscardPayAmount(state, pid, cost, maintain, paySources, discardHandIndices)
    // 破棄する手札を、**召喚するカードを抜く前に**確定させる（抜くとインデックスがずれるため）。
    // プレイヤーが選んでいればその指定を、選んでいなければ手札の末尾から（自動払いのフォールバック）
    const discardIds =
        discardHandIndices !== undefined
            ? discardHandIndices.slice(0, discardPaid).map((i) => player.hand[i]!)
            : player.hand.filter((_, i) => i !== handIndex).slice(-discardPaid)
    // **召喚するカードを先に手札から抜く**：破棄の対象に自分自身が混ざらないようにする
    player.hand.splice(handIndex, 1)
    if (discardPaid > 0) {
        for (const id of discardIds) {
            const at = player.hand.indexOf(id)
            if (at !== -1) player.hand.splice(at, 1)
            player.trashCards.push(id)
        }
        const names = discardIds.map((id) => getCard(id).name).join("、")
        log(state, `${player.name}は召喚コストのうち${discardPaid}を、手札${discardPaid}枚（${names}）の破棄で支払った。`)
        // 「スピリットカード**1枚**の召喚に」＝実際に使った時点で貸与を使い切る
        consumeSummonHandDiscardPay(state, pid)
    }
    if (paySoulCoreFromReserve === true || paySources?.some((src) => src.includeSoulCore === true)) state.summonPaidWithSoulCore = true
    const placedFromField = payCost(state, pid, cost - discardPaid, paySources, maintain, paySoulCoreFromReserve)
    // ⚠️ 維持コアをリザーブから引くのは**場に出す時点**（placeSummonedSpirit）。
    // 手順が「コストを支払う → 転召 → 維持コアを置く → 召喚完了」なのでここでは引かない

    const inst = createInstance(cardId, state.turn, maintain, "summon")
    // globalConstraint "summonExhausted"：「疲労する」であって「疲労状態になる」ではないため exhaustSpirit を経由しない（ownSpiritExhausted は発火しない）。
    // ダイレクトブレイヴは後続の attachBrave の疲労合成がこの疲労を拾い、合体先へ伝播する
    if (summonExhausted(state, card)) inst.isRested = true
    const flashNote = state.isFlashTiming ? "【神速】で" : ""
    const soulWaiverNote = placeSoulCoreFromReserve === true && maintain === 1 && card.levels.some((l) => l.soulCoreRequired === true) ? "《真界放》で" : ""
    const levelNote = level !== undefined && level > 1 ? `Lv${level}で` : soulWaiverNote
    const braveNote =
        braveTargetInstanceId === undefined
            ? ""
            : `${getCard(player.field.spirits.find((sp) => sp.instanceId === braveTargetInstanceId)?.cardId ?? cardId).name}に合体させて`
    const altSummonNote = altSummonNexusInstanceIds !== undefined ? "、ネクサスをデッキの下に戻すことでコストを支払わずに" : ""
    const logText = `${player.name}は${flashNote}${braveNote}${altSummonNote}${card.name}を${levelNote}召喚した。（コスト${cost}）`
    // [ソウルコア]を維持コアとして置く（2026-10-06）。リザーブの[ソウルコア]（placeSoulCoreFromReserve）でも、
    // フィールドの[ソウルコア]を維持コアに使う指定（soulCoreToMaintain。payCost が一旦リザーブへ移している）でも、
    // placeSoulCoreOnSummoned で新しい個体へ置く
    const soulFromFieldToMaintain = paySources?.some((s) => s.soulCoreToMaintain === true) === true
    const placeSoulOnSummon = (placeSoulCoreFromReserve === true || soulFromFieldToMaintain) && maintain >= 1 && soulCoreInReserve(player)
    // -1調整（リザーブから[ソウルコア]ぶんを引く）はリザーブ由来のときだけ。フィールド由来は placedFromField に既に含まれ、payCost がリザーブへ移し済みなので引かない
    const reserveDelta = maintain - placedFromField - (placeSoulOnSummon && placeSoulCoreFromReserve === true ? 1 : 0)

    // 【転召】は「コストを支払う → 転召 → 維持コアを置く → 召喚完了」の順（docs/design/RESUME_STACK.md §6。2026-08-13 ユーザー確認）。
    // この時点でスピリットはまだ場に出ておらず、summoningInstanceId が立っている間は『転召したとき』の誘発が保留され、場に出た時点で発火する。
    // 召喚時効果は場に出た後（2026-08-13 修正）
    state.summoningInstanceId = inst.instanceId
    // 【神速】による召喚か（fieldEvent.sokuSummonOnly）。フラッシュタイミングで手札から召喚できるのは神速だけ
    if (state.isFlashTiming) {
        state.summoningBySoku = true
        // 「同じカード名のこの効果をターンに1回」＝手札からのフラッシュ召喚の許可を使った時点で枠を取る
        if (!ownHandKeyword(state, cardId, "soku")) for (const e of card.effects) if (e.kind === "flashSummonFromHand" && e.onceScope === "name") markOnceNameUsed(state, pid, cardId, e.id)
    }
    state.summoningFromHand = true // 通常召喚は手札から（fieldEvent.fromHandOnly）
    if (!state.winner) resolveTensho(state, pid, inst, false, true)
    if (state.pendingChoice) {
        pushResumeFrames(state, [
            {
                kind: "placeSummon", pid, inst, reserveDelta, logText, cardName: card.name,
                ...(placeSoulOnSummon ? { placeSoul: true } : {}),
                ...(braveTargetInstanceId !== undefined ? { braveTargetInstanceId } : {}),
            },
        ])
        return null
    }
    placeSummonedSpirit(state, pid, inst, reserveDelta, logText, card.name, braveTargetInstanceId, placeSoulOnSummon)
    passFlashPriority(state, pid)
    if (state.winner) state.battle = null
    return null
}

export type ResshinsokuInfo = { handIndex: number; cardId: string; remaining: number; selfCores: number }

// 【烈神速】：トラッシュのコアをすべて自分のフィールド/リザーブに好きに置くことで、コストを支払わずに手札から召喚する。置き先は1個ずつ選ばせる（INTERRUPTION_POINTS.md パターンA）
function doResshinsokuSummon(state: GameState, pid: PlayerId, handIndex: number): string | null {
    const error = validateResshinsokuSummon(state, pid, handIndex)
    if (error) return error
    const player = state.players[pid]
    const cardId = player.hand[handIndex]!
    // 案B-inside: trashCoresには[ソウルコア]が含まれる。トラッシュを空にするときは
    // [ソウルコア]をリザーブへ退避させる（ボイドと同じく配分の対象にしない。2026-10-06 簡易化）
    if (soulCoreInTrash(player)) moveSoulCore(player, { zone: "reserve" })
    const total = player.trashCores
    player.trashCores = 0
    const info: ResshinsokuInfo = { handIndex, cardId, remaining: total, selfCores: 0 }
    // 非対話（AI・自動応答）は全部このスピリットに置く（2026-09-22 ユーザー確定）
    if (!state.interactiveTargets) {
        info.selfCores = total
        info.remaining = 0
        return finishResshinsokuSummon(state, pid, info)
    }
    requestResshinsokuDestination(state, pid, info)
    return null
}

// コアの置き先を1個ぶん聞く。残り1回で最低限必要な数（Lv1維持コア）に届かないときは
// 選択肢を「このスピリットに置く」だけに絞り、必ず維持コアが足りる状態で召喚できるようにする
function requestResshinsokuDestination(state: GameState, pid: PlayerId, info: ResshinsokuInfo): void {
    if (info.remaining <= 0) {
        finishResshinsokuSummon(state, pid, info)
        return
    }
    const player = state.players[pid]
    const card = getCard(info.cardId)
    const need = minLevelCores(card) - info.selfCores
    const forceSelf = need >= info.remaining
    const targets = [...player.field.spirits, ...player.field.nexuses]
    const destinations: string[] = forceSelf ? ["self"] : ["reserve", ...targets.map((t) => t.instanceId), "self"]
    const options: string[] = forceSelf
        ? [`${card.name}（このスピリット）に置く`]
        : [
              "リザーブに置く",
              ...targets.map((t) => `${getCard(t.cardId).name}（Lv${String(currentLevel(t).level)}）に置く`),
              `${card.name}（このスピリット）に置く`,
          ]
    if (!forceSelf && info.remaining > 1) {
        destinations.push("reserve_all", "self_all")
        options.push("残り全部をリザーブに置く", "残り全部をこのスピリットに置く")
    }
    suspend(state, {
        pid,
        kind: "option",
        prompt: `【烈神速】：トラッシュのコア（残り${String(info.remaining)}個）の置き先を選んでください`,
        candidates: [],
        options,
        optional: false,
        action: { type: "noop" },
        selfInstanceId: null,
        distributeCores: {
            remaining: info.remaining,
            selfCores: info.selfCores,
            destinations,
            handIndex: info.handIndex,
            cardId: info.cardId,
        },
    })
}

export function applyResshinsokuDestination(
    state: GameState,
    pid: PlayerId,
    info: ResshinsokuInfo,
    destination: string,
): void {
    const player = state.players[pid]
    if (destination === "reserve_all") {
        player.reserve += info.remaining
        log(state, `${player.name}はトラッシュのコア${String(info.remaining)}個をリザーブに置いた。`)
        requestResshinsokuDestination(state, pid, { ...info, remaining: 0 })
        return
    }
    if (destination === "self_all") {
        log(state, `${player.name}はトラッシュのコア${String(info.remaining)}個をこのスピリットに置いた。`)
        requestResshinsokuDestination(state, pid, { ...info, selfCores: info.selfCores + info.remaining, remaining: 0 })
        return
    }
    if (destination === "reserve") {
        player.reserve += 1
        requestResshinsokuDestination(state, pid, { ...info, remaining: info.remaining - 1 })
        return
    }
    if (destination === "self") {
        requestResshinsokuDestination(state, pid, { ...info, selfCores: info.selfCores + 1, remaining: info.remaining - 1 })
        return
    }
    const target = findSpirit(player, destination) ?? findNexus(player, destination)
    if (target) {
        target.cores += 1
        requestResshinsokuDestination(state, pid, { ...info, remaining: info.remaining - 1 })
        return
    }
    // 対象が選択中に場からいなくなっていた場合の安全網：残りをリザーブへ
    player.reserve += info.remaining
    requestResshinsokuDestination(state, pid, { ...info, remaining: 0 })
}

// コアの配置がすべて終わったところで実際にスピリットを場に出す。コストも維持コアの支払いも無い（維持コアぶんは「このスピリット」に置かれたコアが兼ねる）。
// 無償でも相手の転召の祭壇などの余分は払う。割り振りの後に、割り振ったコアも含めたリザーブとフィールドから払う（2026-10-15 ユーザー確認）。
// 払えるかは割り振りの前に validate 済み（割り振りは場の外のコアを減らさない）。
// ponytail: トラッシュのコアを割り振ってはじめて払える場合も validate で弾く。要るなら割り振りの選択肢に「場の外に残す数」の下限を足す
export function finishResshinsokuSummon(state: GameState, pid: PlayerId, info: ResshinsokuInfo, surchargePaid = false): string | null {
    const player = state.players[pid]
    const at = player.hand[info.handIndex] === info.cardId ? info.handIndex : player.hand.lastIndexOf(info.cardId)
    if (at === -1) return null
    noteKeyword(getCard(info.cardId).effects, "resshinsoku")
    if (!surchargePaid) {
        const resume = { type: "resshinsokuFinishInternal", handIndex: info.handIndex, cardId: info.cardId, selfCores: info.selfCores } as const
        if (askSurchargePay(state, pid, getCard(info.cardId), false, 0, resume)) return null
        payFreeSummonSurcharge(state, pid, getCard(info.cardId))
    }
    player.hand.splice(at, 1)
    const card = getCard(info.cardId)
    const inst = createInstance(info.cardId, state.turn, info.selfCores)
    if (summonExhausted(state, card)) inst.isRested = true
    const logText = `${player.name}は【烈神速】でコストを支払わずに${card.name}を召喚した。`
    state.summoningInstanceId = inst.instanceId
    state.summoningFromHand = true
    if (!state.winner) resolveTensho(state, pid, inst, false, true)
    if (state.pendingChoice) {
        pushResumeFrames(state, [{ kind: "placeSummon", pid, inst, reserveDelta: 0, logText, cardName: card.name }])
        return null
    }
    placeSummonedSpirit(state, pid, inst, 0, logText, card.name)
    passFlashPriority(state, pid)
    if (state.winner) state.battle = null
    return null
}

// バーストのセット（docs/design/BURST.md）。既にセット済みなら旧カードをトラッシュへ送ってから
function doSetBurst(state: GameState, pid: PlayerId, handIndex: number): string | null {
    const error = validateSetBurst(state, pid, handIndex)
    if (error) return error
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    // セットのたびにリザーブのコアをトラッシュへ置く効果（足りることは validateSetBurst で確認済み）
    const required = burstSetCoresRequired(state, pid)
    if (required > 0) {
        player.reserve -= required
        player.trashCores += required
        log(state, `${player.name}は相手の効果により、バーストのセットにリザーブのコア${required}個をトラッシュへ置いた。`)
    }
    player.hand.splice(handIndex, 1)
    placeBurst(state, pid, cardId)
    player.burstSetThisTurn = true
    return null
}

function doSetNexus(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    paySources?: PaySource[],
    level?: number,
    millPay?: number,
    paySoulCoreFromReserve?: boolean, // リザーブの[ソウルコア]を配置コスト支払い1個ぶんとして使う
    placeSoulCoreFromReserve?: boolean, // リザーブの[ソウルコア]を維持コアとして配置したネクサスに置く
): string | null {
    const error = validateSetNexus(state, pid, handIndex, paySources, level, millPay, paySoulCoreFromReserve, placeSoulCoreFromReserve)
    if (error) return error

    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const cost = effectiveCost(state, pid, card)
    // レベル指定があればそのレベルぶんのコアを置いて配置する（省略時はLv1。ネクサスのLv1は0コアが多い）。《真界放》の waiver 配置は doSummon と同じ
    const maintain = placedCoresForSummon(card, level, { placeSoulCoreFromReserve })

    // 配置コストをデッキ破棄で支払う場合（コア払いとの併用はできないので全額かゼロ。枚数は validateSetNexus と同じ関数で出す）
    const millPaid = nexusMillPayAmount(state, pid, cost, maintain, paySources, millPay)
    if (millPaid > 0) {
        millDeck(state, pid, millPaid)
        log(state, `${player.name}は配置コスト${millPaid}を、デッキ${millPaid}枚の破棄で支払った。`)
    }
    const placedFromField = payCost(state, pid, cost - millPaid, paySources, maintain, paySoulCoreFromReserve)
    // [ソウルコア]を維持コアとして置く（2026-10-06）
    const soulFromFieldToMaintainNexus = paySources?.some((s) => s.soulCoreToMaintain === true) === true
    const placeSoulOnNexus = (placeSoulCoreFromReserve === true || soulFromFieldToMaintainNexus) && maintain >= 1 && soulCoreInReserve(player)
    // -1調整はリザーブ由来のときだけ（doSummonと同じ理由）
    player.reserve -= maintain - placedFromField - (placeSoulOnNexus && placeSoulCoreFromReserve === true ? 1 : 0)
    player.hand.splice(handIndex, 1)

    const nexusInst = createInstance(cardId, state.turn, maintain)
    player.field.nexuses.push(nexusInst)
    if (placeSoulOnNexus && placeSoulCoreOnSummoned(player, nexusInst)) {
        log(state, `${player.name}はリザーブの[ソウルコア]を${card.name}の維持コアとして置いた。`)
    }
    const soulWaiverNote = placeSoulCoreFromReserve === true && maintain === 1 && card.levels.some((l) => l.soulCoreRequired === true) ? "《真界放》で" : ""
    const levelNote = level !== undefined && level > 1 ? `Lv${level}で` : soulWaiverNote
    log(state, `${player.name}は${card.name}を${levelNote}配置した。（コスト${cost}）`)
    // 『このネクサスの配置時』と「自分のネクサスが配置されたとき」を発火する。
    // 2026-08-28 発覚：以前はここで onSummon を発火しておらず、ネクサスの『配置時』効果が実戦で一度も発揮されなかった。
    // ownSpiritSummoned のフィールドイベントは field.spirits だけが対象でネクサスには意図的に効かないため、スピリットとは別の経路
    fireNexusDeployed(state, pid, nexusInst, true)
    return null
}

// 無償化の確認の選択肢。**この並び順に doResolveChoice が依存する**（0=無償で使う / 1=コストを払って使う）
export const MAGIC_FREE_OPTIONS = ["コストを支払わずに使用する", "コストを支払って使用する"]

// count が「対象の体数」を表すアクション。ここに挙げたものだけを「複数体が対象なのに1体しか渡されていない」の判定にかける。
// ホワイトリストなのは、同じ count でもコアの個数（coreCharge）や「何体分として数えるか」（timedEffect の countAs）が混ざっており、
// 体数と読み違えると正しく渡された対象まで捨ててしまうため
export const COUNT_IS_BODIES = new Set(["destroy", "exhaust", "return"])

// 手札から使うフラッシュ（kind:"handActivated"）。マジックではないので「マジックを使用したとき」系の誘発は出さず、【氷壁】の対象にもならない（resolveMagic 経由ではない）。
// 解決には srcColors=このカードの色／srcType="spirit" を必ず渡す（装甲・効果耐性が効くように。anySide の候補集めがこれを見る）
function doUseHandAbility(state: GameState, pid: PlayerId, handIndex: number, effectId: string): string | null {
    const error = validateUseHandAbility(state, pid, handIndex, effectId)
    if (error) return error

    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const effect = card.effects.find(
        (e): e is Extract<EffectDef, { kind: "handActivated" }> => e.kind === "handActivated" && e.id === effectId,
    )
    if (!effect) return "効果が見つかりません"
    noteCoverage(effect, "handActivated")

    // コスト：手札にあるこのカード自身を破棄する（現状これのみ対応）
    if (effect.cost.discardSelf) {
        player.hand.splice(handIndex, 1)
        player.trashCards.push(cardId)
        log(state, `${player.name}は手札の${card.name}を破棄して効果を発動した。`)
    }

    resolveAction(state, pid, null, markPayConfirmed(effect.action), undefined, card.colors, "spirit", undefined, undefined, cardId)
    passFlashPriority(state, pid)
    return null
}

// メインステップの任意合体（docs/design/BRAVE.md §6.4）
function doCombineBrave(state: GameState, pid: PlayerId, braveInstanceId: string, hostInstanceId: string): string | null {
    const error = validateCombineBrave(state, pid, braveInstanceId, hostInstanceId)
    if (error) return error
    const player = state.players[pid]
    const brave = findSpirit(player, braveInstanceId)
    const host = findSpirit(player, hostInstanceId)
    if (!brave || !host) return "対象のカードが見つかりません"
    const moved = brave.cores
    attachBrave(state, pid, host, brave)
    // 効果以外でホストのコアが増えたので、相手の魔帝の寝所などで疲労する（ブレイヴQ&A Q7）
    if (moved > 0) checkExhaustOnCoreChange(state, pid, host)
    log(state, `${player.name}は${getCard(brave.cardId).name}を${getCard(host.cardId).name}に合体させた。`)
    return null
}

// メインステップの任意分離（§6.4）。コアの支払いは detachBraveVoluntary が行う
function doDetachBrave(state: GameState, pid: PlayerId, braveInstanceId: string, paySources?: PaySource[]): string | null {
    const error = validateDetachBrave(state, pid, braveInstanceId, paySources)
    if (error) return error
    const player = state.players[pid]
    const brave = player.field.combinedBraves.find((b) => b.instanceId === braveInstanceId)
    const host = player.field.spirits.find((sp) => (sp.braveRefs ?? []).some((r) => r.instanceId === braveInstanceId))
    if (!brave || !host) return "対象のカードが見つかりません"
    detachBraveVoluntary(state, pid, host, brave, paySources)
    return null
}

// メインステップの1:1交換（docs/design/SOULCORE.md §1.4）: [ソウルコア]1個と通常コア1個を同時に交換する。
// 「同時に移動している」ため消滅判定は挟まない。コア増加の誘発（夢魔の寝所）は両方の個体に発火
function doSwapSoulCore(
    state: GameState,
    pid: PlayerId,
    fromInstanceId: string,
    toInstanceId: string,
): string | null {
    const error = validateSwapSoulCore(state, pid, fromInstanceId, toInstanceId)
    if (error) return error
    const player = state.players[pid]
    const from = findSpirit(player, fromInstanceId) ?? findNexus(player, fromInstanceId)
    const to = findSpirit(player, toInstanceId) ?? findNexus(player, toInstanceId)
    if (!from || !to) return "自分のスピリット/ネクサスが見つかりません"
    to.cores -= 1
    from.cores += 1
    moveSoulCore(player, { zone: "instance", instanceId: toInstanceId }, from)
    log(
        state,
        `${player.name}は${getCard(from.cardId).name}の[ソウルコア]と${getCard(to.cardId).name}の通常コア1個を交換した。`,
    )
    checkExhaustOnCoreChange(state, pid, from)
    checkExhaustOnCoreChange(state, pid, to)
    return null
}

function doMoveCore(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    direction: "add" | "remove",
    confirmDeplete?: true,
    soulCore?: boolean, // [ソウルコア]を動かす
): string | null {
    const error = validateMoveCore(state, pid, instanceId, direction, confirmDeplete, soulCore)
    if (error) return error

    const player = state.players[pid]
    const spirit = findSpirit(player, instanceId)
    const inst = spirit ?? findNexus(player, instanceId)
    if (!inst) return "対象のカードが見つかりません"

    if (soulCore) {
        // [ソウルコア]の移動: moveSoulCore がポインタと数値（cores/reserve）の両方を動かす
        if (direction === "add") {
            moveSoulCore(player, { zone: "instance", instanceId })
            log(state, `${player.name}はリザーブの[ソウルコア]を${getCard(inst.cardId).name}に置いた。`)
            // ソウルコアでも「コアを増やした」誘発は発火する（コアとして置かれたため）
            if (spirit) checkExhaustOnCoreChange(state, pid, spirit)
        } else {
            moveSoulCore(player, { zone: "reserve" })
            log(state, `${player.name}は${getCard(inst.cardId).name}の[ソウルコア]をリザーブへ戻した。`)
            if (spirit && wouldDepleteOf(player, spirit)) {
                log(
                    state,
                    `${player.name}は${getCard(spirit.cardId).name}の[ソウルコア]を取り除いた。維持コアを下回ったため消滅した。`,
                )
                destroySpirit(state, pid, spirit.instanceId, "deplete")
            }
        }
        return null
    }

    if (direction === "add") {
        player.reserve -= 1
        inst.cores += 1
        // コアを増やしたスピリットが疲労する効果はネクサスへのコア追加では発火させない
        if (spirit) checkExhaustOnCoreChange(state, pid, spirit)
    } else {
        inst.cores -= 1
        player.reserve += 1
        // 維持コア（Lv1）を下回ったら消滅する（confirmDeplete で承知のうえ取り除いた場合のみ。残ったコアは destroySpirit がリザーブへ戻す）。
        // 疲労の誘発より先に消滅させる：場を離れたスピリットが「コアを取り除かれて疲労した」ことにならないように
        if (spirit && wouldDepleteOf(player, spirit)) {
            log(
                state,
                `${player.name}は${getCard(spirit.cardId).name}のコアを取り除いた。維持コアを下回ったため消滅した。`,
            )
            destroySpirit(state, pid, spirit.instanceId, "deplete")
            return null
        }
        // 「コアを置く、または取り除くと疲労する」。onRemove を持たない既存の効果はここでは反応しない
        if (spirit) checkExhaustOnCoreChange(state, pid, spirit, { viaEffect: false, isRemoval: true })
    }
    return null
}

// 【超覚醒】：この効果でコアを置いたとき、そのスピリットは回復する。【覚醒】との違いはここだけなので、コアを移した直後に1回だけ呼ぶ
function refreshOnSuperAwaken(state: GameState, pid: PlayerId, target: CardInstance): void {
    if (!target.isRested) return
    if (!hasSuperAwaken(state, pid, target)) return
    if (!refreshSpirit(state, pid, target, "spirit")) return
    noteHeldKeyword(state, pid, target, "superAwaken")
    log(state, `【超覚醒】${getCard(target.cardId).name}は回復した。`)
}

function doAwaken(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    fromInstanceId: string,
    count: number,
): string | null {
    const error = validateAwaken(state, pid, instanceId, fromInstanceId, count)
    if (error) return error

    const player = state.players[pid]
    const target = findSpirit(player, instanceId)
    if (!target) return "対象のスピリットが見つかりません"

    const noteAwaken = () => {
        noteHeldKeyword(state, pid, target, "awaken")
    }
    // リザーブからの【覚醒】（書き換えられた場合）。移動元スピリットの消滅判定は不要
    if (fromInstanceId === AWAKEN_FROM_RESERVE) {
        noteAwaken()
        player.reserve -= count
        target.cores += count
        checkExhaustOnCoreChange(state, pid, target)
        log(
            state,
            `【覚醒】${player.name}はリザーブから${getCard(target.cardId).name}へコア${count}個を移した。`,
        )
        refreshOnSuperAwaken(state, pid, target)
        passFlashPriority(state, pid)
        return null
    }

    const from = findSpirit(player, fromInstanceId)
    if (!from) return "対象のスピリットが見つかりません"

    noteAwaken()
    from.cores -= count
    target.cores += count
    checkExhaustOnCoreChange(state, pid, target)
    log(
        state,
        `【覚醒】${player.name}は${getCard(from.cardId).name}から${getCard(target.cardId).name}へコア${count}個を移した。`,
    )
    refreshOnSuperAwaken(state, pid, target)
    if (wouldDepleteOf(player, from)) {
        destroySpirit(state, pid, from.instanceId, "deplete")
    }
    passFlashPriority(state, pid)
    return null
}

function doAttack(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    targetSpiritInstanceId?: string,
    paySources?: PaySource[],
    paySoulCoreFromReserve?: boolean,
): string | null {
    const error = validateAttack(state, pid, instanceId, targetSpiritInstanceId, paySources, paySoulCoreFromReserve)
    if (error) return error

    const player = state.players[pid]
    const inst = findSpirit(player, instanceId)
    if (!inst) return "対象のスピリットが見つかりません"
    const card = getCard(inst.cardId)

    inst.isRested = true
    // 「このステップの最初に」の義務は、最初のアタック宣言で（誰が宣言しても）消える（2026-10-08 ユーザー確認）
    state.timedEffects = state.timedEffects.filter((r) => r.until !== "firstAttack")
    // 『自分の合体スピリットの次にアタックしたとき』用に、直前のアタック宣言を1つだけ覚える。
    // prev = 1つ前のアタッカーが合体スピリットだったときその持ち主／それ以外は undefined。
    // state.battle を作る前に必ずスライドさせる（読まれるのは「1つ前」なので順序が重要）
    if (state.lastAttackerCombinedPid !== undefined) {
        state.prevAttackerCombinedPid = state.lastAttackerCombinedPid
    } else {
        delete state.prevAttackerCombinedPid
    }
    if (instIsCombined(inst)) {
        state.lastAttackerCombinedPid = pid
    } else {
        delete state.lastAttackerCombinedPid
    }
    // 指定アタックは blockerInstanceId を指定スピリットにセットする（「blockerInstanceId あり＝ブロック済み」の既存ロジックで takeLife も他のブロックも拒否される。onBlock は発火させない）。
    // ただしアタック宣言の時点ではブロックを確定させない（2026-09-06 ユーザー確認）。
    // 確定はアタック時効果と【バースト】をすべて解決した後＝フラッシュ①を閉じる doPass の時点で、
    // そこまでに指定先が場を離れたり耐性を得たりしたら通常のアタックに戻る
    state.battle = {
        attackerInstanceId: instanceId,
        blockerInstanceId: null,
        directed: targetSpiritInstanceId !== undefined,
        ...(targetSpiritInstanceId !== undefined ? { directedTargetInstanceId: targetSpiritInstanceId } : {}),
    }
    // アタッカーが場を離れてバトルが終わるときの＞７（【光芒】）で読むために実体参照を控える
    state.battleAttackerRef = inst
    // コスト以下のアタックはリザーブのコア1個をトラッシュに置くことが要る。validateAttack で払えることは確認済みなので自動で払う（非対話・AIも同じ経路）
    const toll = attackTollTotal(state, pid, inst) - attackPayTollCount(state, pid, inst)
    if (toll > 0 && player.reserve >= toll) {
        player.reserve -= toll
        player.trashCores += toll
        log(state, `${player.name}はアタックのためリザーブのコア${toll}個をトラッシュに置いた。`)
    }
    // attackPayToll は、フィールドのコアも含めて払える（2026-10-11 ユーザー確認）
    const payToll = attackPayTollCount(state, pid, inst)
    if (payToll > 0) {
        payCost(state, pid, payToll, paySources, 0, paySoulCoreFromReserve)
        log(state, `${player.name}はアタックのため${String(payToll)}コストを支払った。`)
    }
    state.isFlashTiming = true
    state.priorityPlayer = opponentOf(pid)
    if (targetSpiritInstanceId !== undefined) {
        const target = findSpirit(state.players[opponentOf(pid)], targetSpiritInstanceId)
        const targetName = target ? getCard(target.cardId).name : "スピリット"
        log(state, `${player.name}の${card.name}は${targetName}を指定してアタックした！`)
    } else {
        log(state, `${player.name}の${card.name}がアタックした！`)
    }

    // このターンのアタック回数を加算する（誘発より前に更新する）
    state.attacksThisTurn += 1
    inst.attackedThisTurn = true
    player.minAttackCostThisTurn = Math.min(player.minAttackCostThisTurn ?? Infinity, ...instAllCosts(inst))

    // 直前の【粉砕】の記録をクリアする（粉砕を持たないスピリットのアタック時に前回の値を拾わないように）
    delete state.lastFunsai

    // 【粉砕】：アタック時、相手のデッキを上からこのスピリットのLvと同じ枚数破棄する（共通処理は resolveFunsai）。
    // onAttack の誘発より先に解決する：「【粉砕】で破棄した◯枚につき」の onAttack 効果が state.lastFunsai を参照するため、
    // 順序が逆だと常に空のまま発揮されてしまう
    resolveFunsai(state, pid, inst)

    if (!state.winner) fireTrigger(state, pid, inst, "onAttack")

    // 『このスピリットのバトル時』：バトルが成立した時点（アタック宣言時）で発火する。勝敗を問わない。
    // 指定アタックのときはここでは発火させない（この時点では相手が決まっていない。resolveDirectedBlock がブロック確定後に発火させる）
    if (!state.winner && targetSpiritInstanceId === undefined) fireTrigger(state, pid, inst, "onBattleStart")

    // フィールドイベント誘発「スピリットがアタックを宣言したとき」。発生源の持ち主に関わらず作用させるため、両プレイヤーのフィールドから selfOverride（アタッカー）付きで発火する
    if (!state.winner) {
        fireFieldEventTriggers(state, pid, "anySpiritAttacked", { pid, inst }, instColors(inst), undefined, undefined, {
            // instAllCosts：本来のコストに加え、道化師クランの付与コストも含める
            costs: instAllCosts(inst),
        })
    }
    if (!state.winner) {
        // アタックしたスピリットのコストを渡す（costFilter で絞る効果のため）
        fireFieldEventTriggers(state, opponentOf(pid), "anySpiritAttacked", { pid, inst }, instColors(inst), undefined, undefined, {
            // instAllCosts：本来のコストに加え、道化師クランの付与コストも含める
            costs: instAllCosts(inst),
        })
    }
    // フィールドイベント誘発「スピリットが疲労したとき」。アタック宣言による疲労の分をここで発火する。アタッカーが効果で消滅しうるので、直後の「バトル不成立」判定に乗る位置に置く
    if (!state.winner) fireExhaustedTriggers(state, pid, inst)
    if (state.battle && !findSpirit(player, instanceId)) {
        log(state, `${card.name}は消滅したため、バトルは発生しなかった。`)
        clearBattle(state)
    }

    if (state.winner) state.battle = null
    return null
}

function doBlock(state: GameState, pid: PlayerId, instanceId: string, paySources?: PaySource[], paySoulCoreFromReserve?: boolean): string | null {
    const error = validateBlock(state, pid, instanceId, paySources, paySoulCoreFromReserve)
    if (error) return error
    if (!state.battle) return "バトルが発生していません"
    const payNeed = blockPayCost(state, opponentOf(pid), findSpirit(state.players[opponentOf(pid)], state.battle.attackerInstanceId))
    if (payNeed > 0) {
        payCost(state, pid, payNeed, paySources, 0, paySoulCoreFromReserve)
        log(state, `${state.players[pid].name}はブロックのため${String(payNeed)}コストを支払った。`)
    }

    // 制約 blockExhaustSpirit：ブロックするスピリット以外の回復状態のスピリット1体を疲労させる（validateBlock 確認済み）。対話時は候補が2体以上ならブロックする側が選び、非対話は先頭
    if (blockExhaustSpiritRequired(state, opponentOf(pid), findSpirit(state.players[opponentOf(pid)], state.battle.attackerInstanceId))) {
        const candidates = state.players[pid].field.spirits.filter((sp) => sp.instanceId !== instanceId && !sp.isRested)
        if (state.interactiveTargets && candidates.length > 1) {
            state.pendingChoice = {
                pid,
                kind: "target",
                prompt: "ブロックのコストとして疲労させるスピリットを選んでください",
                candidates: candidates.map((sp) => sp.instanceId),
                optional: false,
                action: { type: "noop" },
                selfInstanceId: instanceId,
                blockExhaustPick: { blockerPid: pid, blockerInstanceId: instanceId },
            }
            return null
        }
        exhaustBlockToll(state, pid, candidates[0]!)
    }
    return continueBlockDeclaration(state, pid, instanceId)
}

export function exhaustBlockToll(state: GameState, pid: PlayerId, sp: CardInstance): void {
    exhaustSpirit(state, pid, sp)
    log(state, `${state.players[pid].name}はブロックのため${getCard(sp.cardId).name}を疲労させた。`)
}

// ブロックのコストを払ったあとの宣言処理（blockExhaustSpirit の選択待ちからも再開する）
export function continueBlockDeclaration(state: GameState, pid: PlayerId, instanceId: string): string | null {
    if (!state.battle) return "バトルが発生していません"
    // 複数体ブロック（blockRequiresCount）：必要数がそろうまでは宣言を貯めるだけで、誘発もフラッシュの再オープンもしない
    const attackerPidForCount = opponentOf(pid)
    const attackerForCount = findSpirit(state.players[attackerPidForCount], state.battle.attackerInstanceId)
    const required = blockRequiredCount(state, attackerPidForCount, attackerForCount)
    if (required > 1) {
        const declared = [...(state.battle.pendingBlockerIds ?? []), instanceId]
        // 強制ブロックの個体はアタッカー側の場にいる
        const ownerOf = (id: string): PlayerId => (id === state.battle?.forcedBlockerInstanceId ? attackerPidForCount : pid)
        const name = (id: string) => {
            const sp = findSpirit(state.players[ownerOf(id)], id)
            return sp ? getCard(sp.cardId).name : "スピリット"
        }
        if (declared.length < required) {
            state.battle.pendingBlockerIds = declared
            log(state, `${state.players[pid].name}の${name(instanceId)}がブロック宣言（あと${String(required - declared.length)}体）。`)
            return null
        }
        delete state.battle.pendingBlockerIds
        log(state, `${state.players[pid].name}は${declared.map(name).join("・")}の${String(declared.length)}体でブロックした！`)
        // 「どれか1体とだけバトルする」は効果文に「相手は」が無く主語がアタッカー側なので、アタック側がバトル相手を選ぶ
        // （docs/design/CHOOSER_RULES.md。2026-08-27 ユーザー確認）
        if (state.interactiveTargets) {
            state.pendingChoice = {
                pid: attackerPidForCount,
                kind: "target",
                prompt: "どのブロッカーとバトルするか選んでください",
                candidates: declared,
                optional: false,
                action: { type: "noop" },
                selfInstanceId: state.battle.attackerInstanceId,
                blockBattlePick: { blockerPid: pid },
            }
            return null
        }
        const picked = [...declared]
            .map((id) => ({ id, inst: findSpirit(state.players[ownerOf(id)], id), owner: ownerOf(id) }))
            .filter((x) => x.inst !== undefined)
            .sort((a, b) => effectiveBp(state, a.owner, a.inst!) - effectiveBp(state, b.owner, b.inst!))[0]
        const battlingId = picked?.id ?? declared[0]!
        state.battle.extraBlockerIds = declared.filter((id) => id !== battlingId)
        return finishBlockDeclaration(state, pid, battlingId)
    }

    return finishBlockDeclaration(state, pid, instanceId)
}

// ブロック宣言が確定したあとの処理（誘発の発火とフラッシュの再オープン）。複数体ブロックは「どれとバトルするか」が決まってから呼ばれる
// ブロックを宣言したスピリットを疲労させる（TIMING_CHART.md §3「１Ｂ」→「２Ｂ」）。
// 2026-09-17 までは resolveBattle で疲労させていて、ブロック後のフラッシュの間ずっと回復状態のままだった（smoke part340）
function exhaustDeclaredBlocker(
    state: GameState,
    defenderPid: PlayerId,
    blocker: CardInstance,
    attacker: CardInstance,
    withKyoshu: boolean,
): void {
    const attackerPid = opponentOf(defenderPid)
    // 発生源つきで取るのは、「ターンに1回」を**ネクサス1枚ごと**に数えるため（下記）
    const matched = activeConstraintsWithSource(state, defenderPid, blocker).filter(
        ({ constraint: c }) => c.type === "noRestWhenBlocking" && matchesTarget(state, attackerPid, attacker, resolveSelfRelative(c.filter, blocker)),
    )
    // 「ターンに1回」（oncePerTurn）は発生源1つにつき1回数える（同名ネクサスを2枚置けば2回使える。2026-08-24）。
    // このターン既に使った発生源の制約は数に入れない。回数制限の無い制約が同時にあるならそちらが働くので消費もしない
    const isOnce = (e: (typeof matched)[number]): boolean =>
        e.constraint.type === "noRestWhenBlocking" && e.constraint.oncePerTurn === true
    const usedIds = state.players[defenderPid].noRestWhenBlockingUsedThisTurn ?? []
    const usable = matched.filter((e) => !(isOnce(e) && usedIds.includes(e.sourceInstanceId)))
    const skipRest = usable.length > 0
    if (skipRest && usable.every(isOnce)) {
        const consumed = usable[0]
        if (consumed) state.players[defenderPid].noRestWhenBlockingUsedThisTurn = [...usedIds, consumed.sourceInstanceId]
        log(state, `${getCard(blocker.cardId).name}はブロックしても疲労しない（ターンに1回）。`)
    }
    if (!skipRest) exhaustSpirit(state, defenderPid, blocker)
    // 【強襲】を『このスピリットのブロック時』にも発揮させる継続付与。疲労の直後に置く（回復状態のままだと【強襲】が空振りする）。バトルしない側のブロッカーには発揮しない
    if (withKyoshu && hasKyoshuOnBlock(state, defenderPid)) {
        resolveAction(state, defenderPid, blocker, KYOSHU_PAY)
    }
}

const KYOSHU_PAY: EffectAction = {
    type: "pay",
    cost: { type: "exhaust", side: "own", nexusOnly: true, count: 1 },
    then: { type: "refresh", target: "self" },
    limitByKeyword: "kyoshu",
}

export function finishBlockDeclaration(state: GameState, pid: PlayerId, instanceId: string): string | null {
    if (!state.battle) return "バトルが発生していません"
    const forced = state.battle.forcedBlockerInstanceId === instanceId
    const blockerPid = forced ? opponentOf(pid) : pid
    delete state.battle.forcedBlockerInstanceId
    if (forced) state.battle.blockerPid = blockerPid
    state.battle.blockerInstanceId = instanceId
    const blocker = findSpirit(state.players[blockerPid], instanceId)
    // 26系【地鳴】の減算材料：ブロックを宣言したスピリットのカードを宣言時点で記録する（スワップで複数回宣言されたら最後のブロッカーで上書き）
    if (blocker) state.lastBattleBlockerCardId = blocker.cardId
    // ブロックの追加コスト（アタッカーに掛かっている blockCost）。validateBlock で払えることは確認済み。マジックの破棄は自動選択（最初に見つかったマジック）
    const costAttacker = findSpirit(state.players[opponentOf(pid)], state.battle.attackerInstanceId)
    const reserveToll = forced ? 0 : blockReserveToTrashCount(state, opponentOf(pid), costAttacker)
    if (reserveToll > 0) {
        state.players[pid].reserve -= reserveToll
        state.players[pid].trashCores += reserveToll
        log(state, `${state.players[pid].name}はブロックのためリザーブのコア${reserveToll}個をトラッシュに置いた。`)
    }
    for (const c of costAttacker && !forced ? timedContentsOn(state, costAttacker) : []) {
        if (c.type !== "blockCost") continue
        const blockerPlayer = state.players[pid]
        if (c.cost === "reserveCoreToTrash") {
            blockerPlayer.reserve -= c.count
            blockerPlayer.trashCores += c.count
            log(state, `${blockerPlayer.name}はブロックのためリザーブのコア${c.count}個をトラッシュに置いた。`)
            continue
        }
        for (let i = 0; i < c.count; i++) {
            const magicIdx = blockerPlayer.hand.findIndex((id) => getCard(id).type === "magic")
            if (magicIdx === -1) break
            const cardId = blockerPlayer.hand[magicIdx]!
            blockerPlayer.hand.splice(magicIdx, 1)
            blockerPlayer.trashCards.push(cardId)
            log(state, `${blockerPlayer.name}はブロックのため手札の${getCard(cardId).name}を破棄した。`)
        }
    }
    const declaredAttacker = findSpirit(state.players[opponentOf(pid)], state.battle.attackerInstanceId)
    if (declaredAttacker) {
        if (blocker && !forced) exhaustDeclaredBlocker(state, pid, blocker, declaredAttacker, true)
        for (const extraId of state.battle.extraBlockerIds ?? []) {
            const extra = findSpirit(state.players[pid], extraId)
            if (extra) exhaustDeclaredBlocker(state, pid, extra, declaredAttacker, false)
        }
    }
    const blockerName = blocker ? getCard(blocker.cardId).name : "スピリット"
    log(state, `${state.players[pid].name}の${blockerName}がブロックした！ フラッシュタイミングを開始する。`)
    // ブロック宣言で誘発する効果は同時発揮。解決順はターンプレイヤーが選ぶ（blockDeclared.ts）
    resolveBlockDeclared(state, blockerPid, blocker, instanceId)
    if (state.winner) {
        state.battle = null
        return null
    }
    // ブロック宣言後は即解決せず、フラッシュを再オープンする（防御側から優先権を持つ）
    state.isFlashTiming = true
    state.flashCount = 0
    state.priorityPlayer = opponentOf(state.turnPlayer)
    return null
}

// 防御側がライフで受けることを宣言する。ライフで受ける場合はフラッシュ②を開かず、宣言した場でそのまま resolveLifeDamage を解決する
function doTakeLife(state: GameState, pid: PlayerId): string | null {
    const error = validateTakeLife(state, pid)
    if (error) return error
    if (!state.battle) return "バトルが発生していません"

    log(state, `${state.players[pid].name}はライフで受けることを宣言した。`)
    resolveLifeDamage(state)
    return null
}

// 起動能力の「ターンに1回」の消費を取り消す（対象を見てからやめたとき／対象がいなかったとき）。
// 記録が消えるので、同じターンにもう一度起動ボタンを押せる（2026-08-21 ユーザー確定）
export function revertActivatedUse(state: GameState, inst: CardInstance, effectId: string): void {
    revertOnceUsed(state, inst, effectId, "activatedUsedTurn")
    revertOncePerBattleUsed(state, inst, effectId)
}

// 起動能力（kind: "activated"）。個別の効果は effect.action に載っており、この関数はコスト支払いと発動の枠組みのみを担う
function doActivateAbility(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    effectId: string,
): string | null {
    const error = validateActivateAbility(state, pid, instanceId, effectId)
    if (error) return error

    const player = state.players[pid]
    // ネクサスの起動能力と、【合体時】の起動能力を持つ合体中のブレイヴも通す
    const brave = player.field.combinedBraves.find((b) => b.instanceId === instanceId)
    const inst =
        findSpirit(player, instanceId) ??
        player.field.nexuses.find((n) => n.instanceId === instanceId) ??
        brave
    if (!inst) return "対象のカードが見つかりません"
    // 効果文の「このスピリット」は合体スピリット（ホスト）を指すので、self にはホストを渡す
    const host = brave ? hostsOf(player, brave)[0] : inst
    if (!host) return "合体先のスピリットが見つかりません"
    const effect = getCard(inst.cardId).effects.find(
        (e) => e.kind === "activated" && e.id === effectId,
    )
    if (!effect || effect.kind !== "activated") return "起動能力が見つかりません"

    // 「Nコスト支払う」は常に pay に任せる（フィールドのコアからも払える・疲労で肩代わりできるネクサスがあれば聞く）
    const reserveTollViaPay = effect.cost !== undefined && "reserveToTrash" in effect.cost
    // cost 省略時は追加コストなし（「ターンに1回、〜できる」だけの効果）
    if (effect.cost === undefined) {
        log(state, `${player.name}の${getCard(inst.cardId).name}の効果を発動した。`)
    } else if ("exhaustSelf" in effect.cost) {
        exhaustSpirit(state, pid, host)
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}の効果を発動した。（このスピリットを疲労）`,
        )
    } else if ("selfCoresToTrash" in effect.cost) {
        const n = effect.cost.selfCoresToTrash
        host.cores -= n
        player.trashCores += n
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}の効果を発動した。（このカードの上のコア${n}個をトラッシュ）`,
        )
    } else if ("discardHandFamily" in effect.cost) {
        // 候補2枚以上なら実対戦では持ち主が選ぶ（COST_MODEL.md §2）。ここは非対話（AI・テスト）の決定的簡略化として、コスト最大の1枚を自動選択する（validateActivate が手札の存在を保証済み）
        const wanted = Array.isArray(effect.cost.discardHandFamily)
            ? effect.cost.discardHandFamily
            : [effect.cost.discardHandFamily]
        const indices = player.hand
            .map((_, i) => i)
            .filter((i) => getCard(player.hand[i]!).type === "spirit" && wanted.some((f) => getCard(player.hand[i]!).family.includes(f)))
        let bestIdx = indices[0]!
        for (const i of indices) {
            if (getCard(player.hand[i]!).cost > getCard(player.hand[bestIdx]!).cost) bestIdx = i
        }
        const cardId = player.hand[bestIdx]!
        player.hand.splice(bestIdx, 1)
        player.trashCards.push(cardId)
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}の効果を発動した。（手札の${getCard(cardId).name}を破棄）`,
        )
    } else if ("discardHandColor" in effect.cost) {
        // 手札の指定色のカード（種別を問わない）1枚を破棄する。discardHandFamily と同じく候補2枚以上ならコスト最大を自動選択する簡略化
        const color = effect.cost.discardHandColor
        const indices = player.hand.map((_, i) => i).filter((i) => cardHasColor(getCard(player.hand[i]!), color))
        let bestIdx = indices[0]!
        for (const i of indices) {
            if (getCard(player.hand[i]!).cost > getCard(player.hand[bestIdx]!).cost) bestIdx = i
        }
        const cardId = player.hand[bestIdx]!
        player.hand.splice(bestIdx, 1)
        player.trashCards.push(cardId)
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}の効果を発動した。（手札の${getCard(cardId).name}を破棄）`,
        )
    } else if ("exhaustOwnFamilyOne" in effect.cost) {
        // 指定系統の回復状態スピリット1体を疲労させる。候補2体以上は実効BP最小を自動選択する簡略化
        const family = effect.cost.exhaustOwnFamilyOne
        const candidates = player.field.spirits.filter(
            (s) => !s.isRested && matchesFamilyFilter(state, pid, s, family),
        )
        const chosen = candidates.reduce((min, s) =>
            effectiveBp(state, pid, s) < effectiveBp(state, pid, min) ? s : min,
        )
        exhaustSpirit(state, pid, chosen)
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}の効果を発動した。（${getCard(chosen.cardId).name}を疲労）`,
        )
    } else if ("discardHandOne" in effect.cost) {
        // 手札1枚（決定的簡略化：末尾）を破棄し、このスピリット自身を疲労させる
        const cardId = player.hand.pop()!
        player.trashCards.push(cardId)
        exhaustSpirit(state, pid, host)
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}の効果を発動した。（手札の${getCard(cardId).name}を破棄し、このスピリットを疲労）`,
        )
    } else if ("discardHandKeyword" in effect.cost) {
        // 指定キーワード持ちのスピリットカード1枚（コスト最大を自動選択する簡略化）を破棄する
        const keyword = effect.cost.discardHandKeyword
        const indices = player.hand
            .map((_, i) => i)
            .filter((i) => getCard(player.hand[i]!).type === "spirit" && hasKeyword(player.hand[i]!, keyword))
        let bestIdx = indices[0]!
        for (const i of indices) {
            if (getCard(player.hand[i]!).cost > getCard(player.hand[bestIdx]!).cost) bestIdx = i
        }
        const cardId = player.hand[bestIdx]!
        player.hand.splice(bestIdx, 1)
        player.trashCards.push(cardId)
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}の効果を発動した。（手札の${getCard(cardId).name}を破棄）`,
        )
    } else {
        // 払いは pay に任せる（持ち主に聞く・非対話は自動で払う。resolveAction 側）
        log(state, `${player.name}の${getCard(inst.cardId).name}の効果を発動した。`)
    }

    // 「ターンに1回」の消費は、コスト支払い後・効果解決前に記録する（解決中に中断が入ってもこのターンの再発動を防ぐ）
    if (effect.oncePerTurn) {
        markOnceUsed(state, pid, inst, effect, "activatedUsedTurn")
    }
    // 〔バトル1回〕も同じ位置で記録する（バトル単位。clearBattle で消える）
    if (effect.oncePerBattle) {
        markOncePerBattleUsed(state, inst, effect.id)
    }

    // 対象を見てからやめられる起動能力か（いまは summon{from:"hand"}.cancelable）。「起動 → 対象を選ぶ → やめる」を効果を発揮しなかった扱いにする軸
    const cancelable = "cancelable" in effect.action && effect.action.cancelable === true
    delete state.effectFizzled
    const prevFlash = state.flashEffect
    if (effect.timing === "flash" || effect.timing === "flashBattle") state.flashEffect = true
    try {
        resolveAction(state, pid, host, markPayConfirmed(reserveTollViaPay ? { type: "pay", cost: { type: "removeCores", side: "own", from: ["reserve"], to: "trash", count: (effect.cost as { reserveToTrash: number }).reserveToTrash }, then: effect.action, costOnly: true } : effect.action))
    } finally {
        if (prevFlash) state.flashEffect = true
        else delete state.flashEffect
    }
    if (effect.oncePerTurn && cancelable) {
        if (state.effectFizzled) {
            revertActivatedUse(state, inst, effectId)
        } else if (state.pendingChoice) {
            state.pendingChoice.revertActivated = { instanceId, effectId }
        }
    }
    // キーワードラベルを持つ起動効果の解決後に発火（FieldEvent "ownKeywordActivated"）。不発・選択待ちに入った場合は発火しない（選択待ちから再開した解決とキャンセル経路も発火しない簡略化）
    if (effect.keyword !== undefined && !state.effectFizzled && !state.pendingChoice) {
        fireFieldEventTriggers(state, pid, "ownKeywordActivated", { pid, inst: host }, undefined, undefined, undefined, {
            keyword: effect.keyword,
        })
    }
    delete state.effectFizzled
    if (state.battle) passFlashPriority(state, pid)
    return null
}

// 降参：相手の勝利としてただちにゲームを終了する。進行中のバトル・フラッシュ・選択待ちはすべて破棄する
function doSurrender(state: GameState, pid: PlayerId): string | null {
    const winner = opponentOf(pid)
    state.pendingChoice = null
    state.battle = null
    state.isFlashTiming = false
    state.winner = winner
    log(
        state,
        `${state.players[pid].name}は降参した。${state.players[winner].name}の勝利！`,
    )
    return null
}

function doPass(state: GameState, pid: PlayerId): string | null {
    const error = validatePass(state, pid)
    if (error) return error

    state.flashCount += 1
    state.priorityPlayer = opponentOf(pid)
    if (state.flashCount >= 2) {
        // 両者が連続でパスした → フラッシュ終了
        state.isFlashTiming = false
        log(state, "フラッシュ終了")
        // マジックミラーが写せるのは「このフラッシュタイミングで」相手が直前に使用したマジックなので、タイミングが閉じた時点で記録も切る。
        // 無いとフラッシュ①で使われたマジックを②で写せてしまう
        delete state.lastMagicCast
        if (state.battle && state.battle.blockerInstanceId) {
            // ブロック後のフラッシュ終了 → バトルを解決する
            resolveBattle(state)
        } else if (state.battle && state.battle.forcedBlockerInstanceId) {
            resolveForcedBlock(state)
        } else if (state.battle && state.battle.directedTargetInstanceId) {
            // 指定アタック：アタック時効果と【バースト】の解決がすべて終わり、ブロック宣言に入る時点で自動的にブロックを確定させる（防御側に選ばせない）
            resolveDirectedBlock(state)
        }
        // ブロック未宣言なら isFlashTiming を下ろすのみ（ライフ受けはフラッシュ②を開かず宣言時に即解決するため、ここでは扱わない）
    }
    return null
}
