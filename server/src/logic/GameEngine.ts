// 召喚/アタック等のアクション実行とイベント発火の統括
import type { CardInstance, EffectDef, GameAction, GameState, PaySource, PlayerId } from "../type"
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
    checkNoMutationAfterSuspend,
    noteHandleActionEntry,
    pushResumeFrames,
    suspend,
} from "./GameState"
import { endTurn, toAttackPhase } from "./PhaseManager"
import { fireQueuedDestroyBursts } from "./removal"
import { blockRequiredCount } from "../../../shared/block"
import {
    AWAKEN_FROM_RESERVE,
    timedContentsOn,
    activeConstraintsWithSource,
    cardHasColor,
    hostsOf,
    hasKeyword,
    instAllCosts,
    instAttackRequiresCoreToll,
    instIsCombined,
    matchesFamilyFilter,
    spiritHasKeyword,
    hasSuperAwaken,
    isEndStepLocked,
    summonExhausted,
    burstSetCoresRequired,
    shinsokuAssistCandidates,
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
import { doResolveChoice } from "./choice"
import { resolveBattle, resolveDirectedBlock, resolveLifeDamage } from "./battleResolve"

// アクションを実行し、エラーがあれば理由を返す（null = 成功）
export function handleAction(
    state: GameState,
    pid: PlayerId,
    action: GameAction,
): string | null {
    if (state.winner) return "ゲームはすでに終了しています"

    // クライアント演出用イベント列は1アクションごとに配信するため、実行前にクリアする
    state.events = []
    // 中断ガードの基準取り直し（BS_DEBUG_CHECKS=1 のときだけ働く）
    noteHandleActionEntry(state)
    const result = dispatchAction(state, pid, action)
    // バトルがどの経路（解決・ライフ受け・endBattle 効果）で終了しても、
    // サイレントウォールの遅延効果（アタックステップ終了）を一元的に処理する
    forceEndTurnIfFlagged(state)
    // 継続的なレベル置換（levelAs）をアクション実行の事後フックとして再計算する
    // （召喚・破壊等でフィールドのスピリット数が変わるたびにジャグリーンの条件を反映するため）
    if (!state.winner) refreshLevelAsOverrides(state)
    // 「Lvコストを+1する」で維持コアを下回った個体を掃除する（refreshLevelAsOverrides の後に置くこと）
    sweepLevelCostDepletion(state)
    // バウンス待機状態のカードは、選択待ちが無くなった時点で必ず手札／デッキへ移す。
    // 通常は効果の解決ごとに resolveAction が移すが、そこを通らない経路
    // （エンドステップの「デッキ下に戻る」、召喚時の入れ替えなど）でも盤面に居座らせないための安全網
    if (!state.pendingChoice) flushBounces(state)
    // 公開ゾーン（「デッキを上からN枚オープンする」）は、選択待ちが無くなった時点で必ず片付ける。
    // 戻す順番の選択をスキップした場合や、途中で中断した場合でもカードが宙に浮かないようにする不変条件
    flushRevealedCardsIfIdle(state)
    // 『召喚時』効果の解決中フラグは、選択待ちが無くなった時点で必ず落とす
    // （選択を挟んで中断した召喚時効果も、解決しきったここでクリアされる）
    if (!state.pendingChoice) delete state.resolvingSummonTriggerPid
    // 「破壊される代わりに復活できる」の確認は、破壊処理の途中では中断できないので
    // ここ（アクションを解決しきった安全な地点）で1件ずつ出す。
    // resolveChoice も handleAction を通るため、複数体ぶんは自然に繰り返される
    requestPendingReviveConfirm(state)
    // アタックしていたスピリットが場を離れていたら、その時点でバトルを終える
    endBattleIfAttackerLeftField(state)
    // 破壊後バースト（kind:"burst".event:"ownSpiritDestroyed"）：破壊の確定・ブレイヴの「残す/残さない」・
    // 【光芒】等のバトル終了処理まで**すべて決着した**この地点でまとめて発火する
    // （TIMING_CHART.md ＞６：破壊時効果・破壊されたとき効果 → 破壊後バースト。BS16バッチ0）
    if (!state.pendingChoice) fireQueuedDestroyBursts(state)
    // 中断したのに処理を続けていないかの検査（BS_DEBUG_CHECKS=1 のときだけ働く）
    checkNoMutationAfterSuspend(state)
    return result
}

// アタックしていたスピリットが場から居なくなっていたら、バトルを終了する。
//
// フラッシュタイミングでアタッカーをマジックで破壊しても、以前はバトルが残ったままで、
// **アタッカーが居ないのに防御側が「ブロックする／ライフで受ける」を選ばされていた**
// （2026-08-23 利用者報告。ライフダメージ自体は doTakeLife のガードで防がれていた）。
//
// ⚠️ 判定は「破壊されたか」ではなく「**場にいないか**」で行う（2026-08-23 ユーザー確認）:
//   破壊されてもフィールドに残る効果（BS07-016 冥勇士デスカラビア等）で盤面に残ったなら
//   **アタックは継続する**。破壊待機状態（＞６の途中でまだ場にいる）も同じ理由で継続し、
//   確定して場を離れた次の handleAction でここに掛かる。
//
// ブロック宣言後は resolveBattle が終了まで面倒を見るので、ここでは触らない
// （途中で割り込むと＞５〜＞７の順序を壊す）。ブロック前だけを扱う。
function endBattleIfAttackerLeftField(state: GameState): void {
    const battle = state.battle
    if (!battle || state.winner || state.pendingChoice) return
    if (battle.blockerInstanceId) return
    // 「場にいるか」は**両者のフィールドを見て**判定する。実対戦のアタッカーは必ず
    // ターンプレイヤー側だが、ターンプレイヤーの場だけを見ると、盤面を手で組んだ
    // テスト（フラッシュ窓を作るためだけに battle を作るもの）でアタッカーが
    // 相手側に置かれている場合に、生きている個体を見落としてバトルを畳んでしまう
    const attackerPid = state.turnPlayer
    const attackerAlive =
        findSpirit(state.players.p1, battle.attackerInstanceId) ??
        findSpirit(state.players.p2, battle.attackerInstanceId)
    if (attackerAlive) return

    log(state, "アタックしていたスピリットが場を離れたため、バトルは終了した。")
    // ＞７：バトル終了時。ブロック前なので生存しているバトル参加者はおらず、
    // 発揮されうるのはアタッカーの【光芒】だけ（2026-08-23 ユーザー確認）。
    // 場を離れた個体の cardId・コア数は控えておいた実体参照から読む
    resolveKoboOnBattleEnd(state, attackerPid, state.battleAttackerRef)
    clearBattle(state)
    // アタックステップの途中なので、フラッシュタイミングも閉じる
    state.isFlashTiming = false
}

// 保留していた復活の確認を1件だけ pendingChoice として立てる。
// 対象が場から居なくなっていた項目は捨てる（確認を出すまでの間に別の効果で消えた場合）
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

// 公開ゾーンに残っているカードを、持ち主のデッキの下へ戻して片付ける。
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
    // （自分のターンでなくても、フラッシュ中でも、対象の選択待ち中でも降参できる）
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
            return doSummon(state, pid, action.handIndex, action.paySources, action.level, action.substituteInstanceId, action.discardHandIndices, action.braveTargetInstanceId, action.altSummonNexusInstanceIds, action.shinsokuAssistInstanceIds)
        case "resshinsokuSummon":
            return doResshinsokuSummon(state, pid, action.handIndex)
        case "setBurst":
            return doSetBurst(state, pid, action.handIndex)
        case "setNexus":
            return doSetNexus(state, pid, action.handIndex, action.paySources, action.level, action.millPay)
        case "castMagic":
            return doCastMagic(
                state,
                pid,
                action.handIndex,
                action.targetInstanceId,
                action.paySources,
                action.fromTegamoto,
            )
        case "useHandAbility":
            return doUseHandAbility(state, pid, action.handIndex, action.effectId)
        case "moveCore":
            return doMoveCore(state, pid, action.instanceId, action.direction, action.confirmDeplete)
        case "combineBrave":
            return doCombineBrave(state, pid, action.braveInstanceId, action.hostInstanceId)
        case "detachBrave":
            return doDetachBrave(state, pid, action.braveInstanceId, action.paySources)
        case "awaken":
            return doAwaken(state, pid, action.instanceId, action.fromInstanceId, action.count)
        case "attack":
            return doAttack(state, pid, action.instanceId, action.targetSpiritInstanceId)
        case "block":
            return doBlock(state, pid, action.instanceId)
        case "takeLife":
            return doTakeLife(state, pid)
        case "pass":
            return doPass(state, pid)
        case "activateAbility":
            return doActivateAbility(state, pid, action.instanceId, action.effectId)
        case "resolveChoice":
            return doResolveChoice(state, pid, action.instanceId, action.option, action.cardIndex, action.paySources)
        case "nextPhase": {
            if (state.turnPlayer !== pid) return "自分のターンではありません"
            if (state.phase !== "main") return "メインステップではありません"
            if (state.battle) return "バトル中です"
            // 「お互い、アタックステップは行えず」（BS10-108 ルナティックシール）
            if (isEndStepLocked(state, "attackStep")) return "効果により、アタックステップは行えません"
            if (state.extraMainStep) return "追加のメインステップの後は、アタックステップへ進めません"
            // 器CA：「相手のメインステップ終了時に使用できる」マジック（BS15-079プロボケイション）の確認を挟む
            if (offerOpponentMainEndMagic(state, pid) === "suspended") return null
            toAttackPhase(state)
            return null
        }
        case "endTurn": {
            const error = validateEndTurn(state, pid)
            if (error) return error
            // メインから直接ターン終了しても「相手のメインステップ終了時」は来る（BS15-079プロボケイション）。
            // 使われたらアタックステップで止め、ターンプレイヤーへ返す
            if (state.phase === "main" && !state.extraMainStep && !isEndStepLocked(state, "attackStep")) {
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

// バトル中のフラッシュで行動したら優先権を相手へ移し、連続パス数をリセットする
// （フラッシュマジック・神速召喚・覚醒で共通）
export function passFlashPriority(state: GameState, pid: PlayerId): void {
    if (state.battle && state.isFlashTiming) {
        state.priorityPlayer = opponentOf(pid)
        state.flashCount = 0
    }
}

// endAttackStepAfterBattle フラグ（サイレントウォール）が立っている場合、
// バトル終了直後（clearBattle 呼び出し元）にターン終了処理を強制実行する。
// mustAttack 等の validateEndTurn の検証はスキップされる＝強制終了。
// 既存の endTurn 関数（PhaseManager）をそのまま呼ぶ。
function forceEndTurnIfFlagged(state: GameState): void {
    if (!state.endAttackStepAfterBattle || state.winner) return
    if (state.battle) return // バトル継続中は発火しない（終了時のみ）
    state.endAttackStepAfterBattle = false
    log(state, "このバトルの終了にともない、アタックステップを終了する。")
    endTurn(state)
}

// kind:"battleSwapSummon" の召喚本体。validateSummon で検証済みの前提で呼ぶ。
// 手順は「入れ替え元を手札に戻す → 維持コアをリザーブから置いて疲労状態で召喚 →
// バトルの枠（アタッカー／ブロッカー）を新しい個体に差し替える」の順。
// **手札に戻すのを先にする**：戻す処理が『手札に戻ったとき』の誘発を回すので、
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

    // 効果文に「コストを支払わずに」が無いので、召喚コストは通常どおり支払う
    // （[カラカロッサム]を手札に戻すのは**追加コスト**）。
    // **コストは入れ替え元を手札に戻す前に確定させる**：軽減シンボルは召喚を宣言した時点、
    // つまり入れ替え元がまだ場にいる時点で数える。後で計算すると validateSummon が通した額より
    // 高くなり、検証を通ったのに払えないという食い違いが起きる
    const cost = effectiveCost(state, pid, card)
    returnSpiritToHand(state, pid, substitute)
    const maintain = minLevelCores(card)
    const placedFromField = payCost(state, pid, cost, paySources, maintain)
    player.reserve -= maintain - placedFromField
    player.hand.splice(handIndex, 1)
    const inst = createInstance(cardId, state.turn, maintain)
    inst.isRested = true
    player.field.spirits.push(inst)
    log(
        state,
        `${player.name}は${substituteName}を手札に戻し、代わりに${card.name}を疲労状態で召喚した。（コスト${cost}）`,
    )
    emitEvent(state, { type: "summon", pid, cardName: card.name })

    // バトルを引き継ぐ（入れ替え元が就いていた側の枠を差し替える）
    if (state.battle) {
        if (wasAttacker) {
            state.battle.attackerInstanceId = inst.instanceId
        } else {
            state.battle.blockerInstanceId = inst.instanceId
        }
    }

    // doSummon と同じ順序：【転召】→ 召喚時効果（中断したら queue で合流する）
    if (!state.winner) resolveTensho(state, pid, inst)
    if (state.pendingChoice) {
        pushResumeFrames(state, [{ kind: "action", selfInstanceId: inst.instanceId, action: { type: "summonSequence" } }])
    } else {
        fireSummonSequence(state, pid, inst)
    }
    passFlashPriority(state, pid)
    if (state.winner) state.battle = null
    return null
}

// 【転召】まで解決し終えたスピリットを、維持コアを置いて実際にフィールドへ出す。
// 手順の「4. カードに維持コストを置く → 5. 召喚完了。その後、召喚時効果」に当たる
// （docs/design/RESUME_STACK.md §6）。転召の対象選択で中断した場合は
// ResumeFrame "placeSummon" から呼び直される
export function placeSummonedSpirit(
    state: GameState,
    pid: PlayerId,
    inst: CardInstance,
    reserveDelta: number,
    logText: string,
    cardName: string,
    // ダイレクトブレイヴ：合体先スピリットの instanceId（docs/design/BRAVE.md §5.2）。
    // 指定時、実体は field.spirits ではなく **field.combinedBraves** へ入り、
    // ホストが braveRefs で参照する（参照方式。§2.3）
    braveTargetInstanceId?: string,
): void {
    const player = state.players[pid]
    player.reserve -= reserveDelta
    const host =
        braveTargetInstanceId === undefined
            ? undefined
            : player.field.spirits.find((sp) => sp.instanceId === braveTargetInstanceId)
    if (host !== undefined) {
        // 合体処理の共通入口（server/src/logic/removal.ts）。疲労合成・refreshLevelAsOverridesも内包する
        attachBrave(state, pid, host, inst)
    } else {
        player.field.spirits.push(inst)
    }
    delete state.summoningInstanceId
    log(state, logText)
    emitEvent(state, { type: "summon", pid, cardName })
    // 保留していた『転召したとき』を、場に出てから発火する（召喚されたカード自身の分を拾うため）
    flushPendingTenshoEvent(state)
    if (state.pendingChoice) {
        // 『転召したとき』の誘発が選択待ちを立てた。召喚時効果は解決してから
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
    altSummonNexusInstanceIds?: string[], // 指定時は kind:"altSummonFromHand" の代替召喚（BS10-058。docs/design/COST_MODEL.md）
    shinsokuAssistInstanceIds?: string[], // 指定時は kind:"shinsokuPayAssist"（BS16-021）：疲労させることで召喚コストの一部を肩代わりする
): string | null {
    const error = validateSummon(state, pid, handIndex, paySources, level, substituteInstanceId, discardHandIndices, braveTargetInstanceId, altSummonNexusInstanceIds, shinsokuAssistInstanceIds)
    if (error) return error

    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)

    // kind:"battleSwapSummon"（BS07ブラックカラカロッサム）：バトル中の自分のスピリット1体を
    // 手札に戻し（追加コスト）、その代わりに疲労状態で召喚してバトルを引き継ぐ。
    // 召喚コスト自体は通常どおり支払うので paySources をそのまま渡す
    if (substituteInstanceId !== undefined) {
        return doBattleSwapSummon(state, pid, handIndex, substituteInstanceId, paySources)
    }

    // kind:"altSummonFromHand"（BS10-058）：指定した自分の青ネクサスをデッキの下に戻すことがコストで、
    // 召喚コストは支払わない（維持コアは通常どおりリザーブから。COST_MODEL.md §1＝検証済みのA・Bを実行するだけ）
    if (altSummonNexusInstanceIds !== undefined) {
        for (const id of altSummonNexusInstanceIds) returnNexusToDeckBottom(state, pid, id)
    }
    // kind:"shinsokuPayAssist"（BS16-021）：指定したスピリットを疲労させ、召喚コストの一部を肩代わりする
    // （検証済み＝validateSummonがcandidatesと重複を確認済み）
    let shinsokuDiscount = 0
    if (shinsokuAssistInstanceIds !== undefined && shinsokuAssistInstanceIds.length > 0) {
        const candidates = new Map(shinsokuAssistCandidates(state, pid).map((c) => [c.instanceId, c.discount]))
        for (const id of shinsokuAssistInstanceIds) {
            const inst = player.field.spirits.find((s) => s.instanceId === id)
            if (inst) inst.isRested = true
            shinsokuDiscount += candidates.get(id) ?? 0
        }
        log(state, `${player.name}は自分のスピリットを疲労させ、召喚コストのうち${shinsokuDiscount}を支払ったものとして扱った。`)
    }
    const cost = Math.max(0, (altSummonNexusInstanceIds !== undefined ? 0 : effectiveCost(state, pid, card)) - shinsokuDiscount)
    // レベル指定があればそのレベルぶんのコアを置いて召喚する（省略時はLv1）。
    // 召喚時効果はコア配置後に発火するため、Lv2以上を指定すればそのレベルの効果が発揮される
    // ダイレクトブレイヴは**維持コアを置かない**（合体状態のLv1が0コア。それがこの召喚の利点そのもの。§5.2）
    const maintain =
        braveTargetInstanceId !== undefined
            ? 0
            : level === undefined
              ? minLevelCores(card)
              : (coresForLevel(card, level) ?? minLevelCores(card))

    // BS08ビクティム：コアで足りない分の召喚コストを手札破棄で支払う
    // （validateSummon と同じ関数で枚数を出すので、検証と実行がズレない）
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
    // 置くコアもフィールドのコアで賄える（賄えなかった分だけリザーブから出す）
    const placedFromField = payCost(state, pid, cost - discardPaid, paySources, maintain)
    // ⚠️ 維持コアをリザーブから引くのは**場に出す時点**（placeSummonedSpirit）。
    // 手順が「コストを支払う → 転召 → 維持コアを置く → 召喚完了」なのでここでは引かない

    const inst = createInstance(cardId, state.turn, maintain)
    // 器AB（globalConstraint "summonExhausted"）：条件を満たすカードは疲労状態で召喚する。
    // 「疲労する」であって「疲労状態になる」ではないため exhaustSpirit を経由しない＝ownSpiritExhaustedは発火しない
    // （BS13_PLAN.md §1 #24）。ダイレクトブレイヴはこの後 attachBrave の疲労合成（host.isRested||brave.isRested）
    // が拾うため、召喚するインスタンス自身をここで疲労させれば合体先へ自然に伝播する（同 #14）
    if (summonExhausted(state, card)) inst.isRested = true
    const flashNote = state.isFlashTiming ? "【神速】で" : ""
    const levelNote = level !== undefined && level > 1 ? `Lv${level}で` : ""
    const braveNote =
        braveTargetInstanceId === undefined
            ? ""
            : `${getCard(player.field.spirits.find((sp) => sp.instanceId === braveTargetInstanceId)?.cardId ?? cardId).name}に合体させて`
    const altSummonNote = altSummonNexusInstanceIds !== undefined ? "、ネクサスをデッキの下に戻すことでコストを支払わずに" : ""
    const logText = `${player.name}は${flashNote}${braveNote}${altSummonNote}${card.name}を${levelNote}召喚した。（コスト${cost}）`
    const reserveDelta = maintain - placedFromField

    // 【転召】は「コストを支払う → **転召** → 維持コアを置く → 召喚完了」の順に解決する
    // （docs/design/RESUME_STACK.md §6。2026-08-13 ユーザー確認の手順）。
    // つまりこの時点でスピリットはまだ場に出ていない。summoningInstanceId が立っている間は
    // 『転召したとき』の誘発が保留され、場に出た時点で発火する（fireTenshoEvent / flushPendingTenshoEvent）。
    // **召喚時効果は場に出た後**（2026-08-13 修正。以前は犠牲が消える前に召喚時効果が出ていた）
    state.summoningInstanceId = inst.instanceId
    // 【神速】による召喚か（fieldEvent.sokuSummonOnly。BS11-065 満天の牧草地Lv2）。
    // フラッシュタイミングで手札から召喚できるのは神速だけなので、ここで判定できる
    if (state.isFlashTiming) state.summoningBySoku = true
    state.summoningFromHand = true // 通常召喚は手札から（fieldEvent.fromHandOnly。BS11-X05）
    if (!state.winner) resolveTensho(state, pid, inst)
    if (state.pendingChoice) {
        // 転召の対象選択で中断した。選択が解決したら場に出すところから続ける
        pushResumeFrames(state, [
            {
                kind: "placeSummon", pid, inst, reserveDelta, logText, cardName: card.name,
                ...(braveTargetInstanceId !== undefined ? { braveTargetInstanceId } : {}),
            },
        ])
        return null
    }
    placeSummonedSpirit(state, pid, inst, reserveDelta, logText, card.name, braveTargetInstanceId)
    // フラッシュ中（神速召喚）は優先権を相手へ移す
    passFlashPriority(state, pid)
    if (state.winner) state.battle = null
    return null
}

// 【烈神速】の中断状態（PendingChoice.distributeCores と同じ形＋どこまで進んだか）
type ResshinsokuInfo = { handIndex: number; cardId: string; remaining: number; selfCores: number }

// 【烈神速】：トラッシュのコアをすべて自分のフィールド/リザーブに好きに置くことで、
// コストを支払わずに手札から召喚する（BS16-X03）。置き先は1個ずつ選ばせる（docs/design/INTERRUPTION_POINTS.md パターンA）
function doResshinsokuSummon(state: GameState, pid: PlayerId, handIndex: number): string | null {
    const error = validateResshinsokuSummon(state, pid, handIndex)
    if (error) return error
    const player = state.players[pid]
    const cardId = player.hand[handIndex]!
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

// distributeCores の選択を1件適用し、残りがあれば続けて聞く
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

// コアの配置がすべて終わったところで、実際にスピリットを場に出す。
// 通常の doSummon と違い、コストも維持コアの支払いも発生しない
// （維持コアぶんは distributeCores で「このスピリット」に置かれたコアがそのまま兼ねる）
function finishResshinsokuSummon(state: GameState, pid: PlayerId, info: ResshinsokuInfo): string | null {
    const player = state.players[pid]
    const at = player.hand[info.handIndex] === info.cardId ? info.handIndex : player.hand.lastIndexOf(info.cardId)
    if (at === -1) return null
    player.hand.splice(at, 1)
    const card = getCard(info.cardId)
    const inst = createInstance(info.cardId, state.turn, info.selfCores)
    if (summonExhausted(state, card)) inst.isRested = true
    const logText = `${player.name}は【烈神速】でコストを支払わずに${card.name}を召喚した。`
    state.summoningInstanceId = inst.instanceId
    state.summoningFromHand = true
    if (!state.winner) resolveTensho(state, pid, inst)
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
// 新しいものをセットする。セット成立後は ownBurstSet を発火する
function doSetBurst(state: GameState, pid: PlayerId, handIndex: number): string | null {
    const error = validateSetBurst(state, pid, handIndex)
    if (error) return error
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    // BS16-067氷聖女の塔Lv2：セットのたびにリザーブのコアをトラッシュへ置く（validateSetBurstで足りることは確認済み）
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
): string | null {
    const error = validateSetNexus(state, pid, handIndex, paySources, level, millPay)
    if (error) return error

    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const cost = effectiveCost(state, pid, card)
    // レベル指定があればそのレベルぶんのコアを置いて配置する（省略時はLv1。ネクサスのLv1は0コアが多い）
    const maintain = level === undefined ? minLevelCores(card) : (coresForLevel(card, level) ?? minLevelCores(card))

    // 栄光の表彰台Lv1：配置コストをデッキ破棄で支払う（コア払いとの併用はできないので全額かゼロ）
    // （validateSetNexus と同じ関数で枚数を出すので、検証と実行がズレない）
    const millPaid = nexusMillPayAmount(state, pid, cost, maintain, paySources, millPay)
    if (millPaid > 0) {
        millDeck(state, pid, millPaid)
        log(state, `${player.name}は配置コスト${millPaid}を、デッキ${millPaid}枚の破棄で支払った。`)
    }
    // 置くコアもフィールドのコアで賄える（賄えなかった分だけリザーブから出す）
    const placedFromField = payCost(state, pid, cost - millPaid, paySources, maintain)
    player.reserve -= maintain - placedFromField
    player.hand.splice(handIndex, 1)

    const nexusInst = createInstance(cardId, state.turn, maintain)
    player.field.nexuses.push(nexusInst)
    const levelNote = level !== undefined && level > 1 ? `Lv${level}で` : ""
    log(state, `${player.name}は${card.name}を${levelNote}配置した。（コスト${cost}）`)
    // 『このネクサスの配置時』と「自分のネクサスが配置されたとき」を発火する（triggers.ts）。
    // ⚠️ 2026-08-28 発覚：以前はここでonSummonを発火しておらず、BS09-066目覚める要塞城の
    // 『配置時』効果が実戦で一度も発揮されないバグがあった（BS10-096最後の優勝旗の実装中に発見。
    // データはtrigger:"onSummon"で書かれているのに、doSetNexusがfireSummonTriggerを呼んでいなかった）。
    // fireSummonSequenceのownSpiritSummonedフィールドイベントはfield.spiritsだけが対象で、
    // ネクサスには意図的に効かないため、スピリットのplaceSummonedSpiritとは別の経路になっている
    fireNexusDeployed(state, pid, nexusInst, true)
    return null
}

// 無償化の確認の選択肢。**この並び順に doResolveChoice が依存する**（0=無償で使う / 1=コストを払って使う）
export const MAGIC_FREE_OPTIONS = ["コストを支払わずに使用する", "コストを支払って使用する"]

// count が「対象の**体数**」を表すアクション。ここに挙げたものだけを
// 「複数体が対象なのに1体しか渡されていない」の判定にかける。
// **ホワイトリストにしてある**のは、同じ count でも意味が違うアクションが混ざっているため:
// コアの個数（coreCharge＝BS01アウェイクンはコア3個までを1体に置く）や、
// 「何体分として数えるか」（countAsMultipleThisTurn＝BS05スリーカードは1体を3体分に数える）を
// 体数と読み違えると、正しく渡された対象まで捨ててしまう
export const COUNT_IS_BODIES = new Set(["destroy", "exhaust", "returnToHand", "returnToDeckTop"])

// 011ミーアバット：手札から使うフラッシュ（kind:"handActivated"）。マジックではないので
// 「マジックを使用したとき」系の誘発は出さず、【氷壁】の対象にもならない（resolveMagic経由ではないため）。
// 解決には srcColors=このカードの色／srcType="spirit" を必ず渡す（装甲・効果耐性が効くように。
// anySideの候補集めがこれを見て判定する。BS15_PLAN.md §7.2）
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

    // コスト：手札にあるこのカード自身を破棄する（現状これのみ対応）
    if (effect.cost.discardSelf) {
        player.hand.splice(handIndex, 1)
        player.trashCards.push(cardId)
        log(state, `${player.name}は手札の${card.name}を破棄して効果を発動した。`)
    }

    resolveAction(state, pid, null, effect.action, undefined, card.colors, "spirit", undefined, undefined, cardId)
    // バトル中のフラッシュで使用したら優先権を相手へ移す（フラッシュマジック・神速召喚・覚醒と共通。passFlashPriority）
    passFlashPriority(state, pid)
    return null
}

// メインステップの任意合体（docs/design/BRAVE.md §6.4）。
// ブレイヴが載せていたコアは**リザーブへ戻す**（分離でリザーブから払うことと対称。§6.4 の注記）
function doCombineBrave(state: GameState, pid: PlayerId, braveInstanceId: string, hostInstanceId: string): string | null {
    const error = validateCombineBrave(state, pid, braveInstanceId, hostInstanceId)
    if (error) return error
    const player = state.players[pid]
    const brave = findSpirit(player, braveInstanceId)
    const host = findSpirit(player, hostInstanceId)
    if (!brave || !host) return "対象のカードが見つかりません"
    player.reserve += brave.cores
    brave.cores = 0
    attachBrave(state, pid, host, brave)
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

function doMoveCore(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    direction: "add" | "remove",
    confirmDeplete?: true,
): string | null {
    const error = validateMoveCore(state, pid, instanceId, direction, confirmDeplete)
    if (error) return error

    const player = state.players[pid]
    const spirit = findSpirit(player, instanceId)
    const inst = spirit ?? findNexus(player, instanceId)
    if (!inst) return "対象のカードが見つかりません"

    if (direction === "add") {
        player.reserve -= 1
        inst.cores += 1
        // 夢魔の寝所／魔影街は「コアの数を増やした**スピリット**すべては疲労する」ため、
        // ネクサスへのコア追加では発火させない
        if (spirit) checkExhaustOnCoreChange(state, pid, spirit)
    } else {
        inst.cores -= 1
        player.reserve += 1
        // 維持コア（Lv1）を下回ったら消滅する（confirmDeplete で承知のうえ取り除いた場合のみここへ来る。
        // 残ったコアは destroySpirit がリザーブへ戻す）。**疲労の誘発より先に消滅させる**：
        // 場を離れたスピリットが「コアを取り除かれて疲労した」ことにならないように
        if (spirit && spirit.cores < instMinLevelCores(spirit)) {
            log(
                state,
                `${player.name}は${getCard(spirit.cardId).name}のコアを取り除いた。維持コアを下回ったため消滅した。`,
            )
            destroySpirit(state, pid, spirit.instanceId, "deplete")
            return null
        }
        // 「コアを置く、または取り除くと疲労する」（BS01ルビーの太陽Lv2）。
        // onRemove を持たない既存の効果（夢魔の寝所／魔影街）はここでは反応しない
        if (spirit) checkExhaustOnCoreChange(state, pid, spirit, { viaEffect: false, isRemoval: true })
    }
    return null
}

// 【超覚醒】：この効果でコアを置いたとき、そのスピリットは回復する（BS10-X01 幻羅星龍ガイ・アスラ）。
// 【覚醒】との違いはここだけなので、コアを移した直後に1回だけ呼ぶ
function refreshOnSuperAwaken(state: GameState, pid: PlayerId, target: CardInstance): void {
    if (!target.isRested) return
    if (!hasSuperAwaken(state, pid, target)) return
    refreshSpirit(state, pid, target)
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

    // リザーブからの【覚醒】（ディノゾールLv2で書き換えられた場合）。移動元スピリットの消滅判定は不要
    if (fromInstanceId === AWAKEN_FROM_RESERVE) {
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

    from.cores -= count
    target.cores += count
    checkExhaustOnCoreChange(state, pid, target)
    log(
        state,
        `【覚醒】${player.name}は${getCard(from.cardId).name}から${getCard(target.cardId).name}へコア${count}個を移した。`,
    )
    refreshOnSuperAwaken(state, pid, target)
    // 移動元が維持コア（Lv1）を下回ったら消滅
    if (from.cores < instMinLevelCores(from)) {
        destroySpirit(state, pid, from.instanceId, "deplete")
    }
    // バトル中のフラッシュで覚醒したら優先権を相手へ移す（フラッシュマジックと同じ扱い）
    passFlashPriority(state, pid)
    return null
}

function doAttack(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    targetSpiritInstanceId?: string,
): string | null {
    const error = validateAttack(state, pid, instanceId, targetSpiritInstanceId)
    if (error) return error

    const player = state.players[pid]
    const inst = findSpirit(player, instanceId)
    if (!inst) return "対象のスピリットが見つかりません"
    const card = getCard(inst.cardId)

    inst.isRested = true
    // BS10-047：『自分の合体スピリットの次にアタックしたとき』用に、直前のアタック宣言を1つだけ覚える。
    // prev = 1つ前のアタッカーが合体スピリットだったときその持ち主／それ以外はundefined。
    // state.battle を作る前に必ずスライドさせる（047自身のアタック時トリガーが読むのは「1つ前」なので順序が重要）
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
    // 指定アタックの場合、blockerInstanceId を強制的に指定スピリットにセットする
    // （既存の「blockerInstanceId あり＝ブロック済み」ロジックにより、takeLife も他のブロックも
    // 自動的に拒否される。onBlock トリガーはブロック宣言ではないため発火させない）
    // 指定アタックでも**アタック宣言の時点ではブロックを確定させない**（2026-09-06 ユーザー確認）。
    // 確定するのはアタック時効果と【バースト】をすべて解決した後＝フラッシュ①を閉じる doPass の時点で、
    // そこまでに指定先が場を離れたり耐性を得たりしたら通常のアタックに戻る
    state.battle = {
        attackerInstanceId: instanceId,
        blockerInstanceId: null,
        directed: targetSpiritInstanceId !== undefined,
        ...(targetSpiritInstanceId !== undefined ? { directedTargetInstanceId: targetSpiritInstanceId } : {}),
    }
    // アタッカーが場を離れてバトルが終わるときの＞７（【光芒】）で読むために実体参照を控える
    state.battleAttackerRef = inst
    // 器BM（BS13-043鳥人イカロッシュ）：コスト以下のアタックはリザーブのコア1個をトラッシュに置くことが要る。
    // validateAttackで払えることは確認済みなので、ここで自動的に支払う（非対話・AIも同じ経路で払う）
    if (instAttackRequiresCoreToll(state, inst) && player.reserve >= 1) {
        player.reserve -= 1
        player.trashCores += 1
        log(state, `${player.name}はアタックのためリザーブのコア1個をトラッシュに置いた。`)
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

    // このターンのアタック回数を加算する（「ターンの最初のアタック」判定に使う。誘発より前に更新する）
    state.attacksThisTurn += 1
    // 器AQ：globalConstraint "attackOncePerTurnBySymbolCount" が見る「このターン既にアタックしたか」の印
    inst.attackedThisTurn = true

    // 直前の【粉砕】の記録をクリアする（アタック宣言のたびに。粉砕を持たないスピリットのアタック時に
    // 前回の値を拾わないようにするため。GameState.lastFunsai）
    delete state.lastFunsai

    // 【粉砕】：アタック時、相手のデッキを上からこのスピリットのLvと同じ枚数破棄する
    // （funsaiBonus・ownFunsaiMilled誘発の共通処理はresolveFunsaiに集約）。
    // onAttackの誘発より先に解決する: 巨人王ランドルフ／二刀流のアムブローズ／伝説巨人ジュードの
    // 「【粉砕】で破棄した◯枚につき」onAttack効果がstate.lastFunsaiを参照するため、
    // この順序が逆だと常にlastFunsaiが空のまま発揮されてしまう
    resolveFunsai(state, pid, inst)

    if (!state.winner) fireTrigger(state, pid, inst, "onAttack")

    // 『このスピリットのバトル時』：バトルが成立した時点（アタック宣言時）で発火する。勝敗を問わない。
    // **指定アタックのときはここでは発火させない**（ブロックの確定が後ろにずれ、この時点では相手が
    // 決まっていないため。resolveDirectedBlock がブロック確定後に発火させる）
    if (!state.winner && targetSpiritInstanceId === undefined) fireTrigger(state, pid, inst, "onBattleStart")

    // フィールドイベント誘発「スピリットがアタックを宣言したとき」（魔帝の墓標Lv2）。
    // 発生源の持ち主に関わらずアタックしたスピリットに作用させるため、
    // 両プレイヤーのフィールドから selfOverride（アタッカー）付きで発火する
    if (!state.winner) {
        fireFieldEventTriggers(state, pid, "anySpiritAttacked", { pid, inst }, instColors(inst), undefined, undefined, {
            // instAllCosts：アタックしたスピリットの本来のコストに加え、道化師クランの付与コストも含める
            costs: instAllCosts(inst),
        })
    }
    if (!state.winner) {
        // アタックしたスピリットのコストを渡す（costFilter で絞る効果のため。BS04鎧装獣ヘイズ・ルーン）
        fireFieldEventTriggers(state, opponentOf(pid), "anySpiritAttacked", { pid, inst }, instColors(inst), undefined, undefined, {
            // instAllCosts：アタックしたスピリットの本来のコストに加え、道化師クランの付与コストも含める
            costs: instAllCosts(inst),
        })
    }
    // フィールドイベント誘発「スピリットが疲労したとき」（BS05藍紫の虚空Lv1）。
    // アタック宣言による疲労（448行目）の分をここで発火する。アタッカーが効果で消滅する可能性があるため、
    // 直後の「バトル不成立」判定（既存ガード）にそのまま乗るこの位置に置いている
    if (!state.winner) fireExhaustedTriggers(state, pid, inst)
    // アタッカーが維持コア割れで消滅した場合はバトル不成立（ライフ受け・ブロックの対象が存在しないため）
    if (state.battle && !findSpirit(player, instanceId)) {
        log(state, `${card.name}は消滅したため、バトルは発生しなかった。`)
        clearBattle(state)
    }

    if (state.winner) state.battle = null
    return null
}

function doBlock(state: GameState, pid: PlayerId, instanceId: string): string | null {
    const error = validateBlock(state, pid, instanceId)
    if (error) return error
    if (!state.battle) return "バトルが発生していません"

    // 複数体ブロック（blockRequiresCount。BS10-X03巨蟹武神キャンサード＝スピリット2体）：
    // 必要数がそろうまでは宣言を貯めるだけで、誘発もフラッシュの再オープンもしない
    const attackerPidForCount = opponentOf(pid)
    const attackerForCount = findSpirit(state.players[attackerPidForCount], state.battle.attackerInstanceId)
    const required = blockRequiredCount(state, attackerPidForCount, attackerForCount)
    if (required > 1) {
        const declared = [...(state.battle.pendingBlockerIds ?? []), instanceId]
        const name = (id: string) => {
            const sp = findSpirit(state.players[pid], id)
            return sp ? getCard(sp.cardId).name : "スピリット"
        }
        if (declared.length < required) {
            state.battle.pendingBlockerIds = declared
            log(state, `${state.players[pid].name}の${name(instanceId)}がブロック宣言（あと${String(required - declared.length)}体）。`)
            return null
        }
        delete state.battle.pendingBlockerIds
        log(state, `${state.players[pid].name}は${declared.map(name).join("・")}の${String(declared.length)}体でブロックした！`)
        // 「そのスピリットがブロックされたとき、どれか1体とだけバトルする」＝
        // 効果文に「相手は」が無く主語がアタッカー側なので、**アタック側**がバトル相手を選ぶ
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
        // 非対話（テスト・AI）：アタッカーが勝ちやすい方＝実効BPが最も低いブロッカーを選ぶ
        const picked = [...declared]
            .map((id) => ({ id, inst: findSpirit(state.players[pid], id) }))
            .filter((x) => x.inst !== undefined)
            .sort((a, b) => effectiveBp(state, pid, a.inst!) - effectiveBp(state, pid, b.inst!))[0]
        const battlingId = picked?.id ?? declared[0]!
        state.battle.extraBlockerIds = declared.filter((id) => id !== battlingId)
        return finishBlockDeclaration(state, pid, battlingId)
    }

    return finishBlockDeclaration(state, pid, instanceId)
}

// ブロック宣言が確定したあとの処理（誘発の発火とフラッシュの再オープン）。
// 通常のブロックはそのまま、複数体ブロックは「どれとバトルするか」が決まってから呼ばれる
// ブロックを宣言したスピリットを疲労させる（TIMING_CHART.md §3「１Ｂ：ブロッカーを疲労してブロック宣言」→「２Ｂ：ブロック時効果」）。
// 2026-09-17 までは resolveBattle で疲労させていて、ブロック後のフラッシュタイミングの間ずっと回復状態のままだった（smoke part340）
function exhaustDeclaredBlocker(
    state: GameState,
    defenderPid: PlayerId,
    blocker: CardInstance,
    attacker: CardInstance,
    withKyoshu: boolean,
): void {
    const attackerPid = opponentOf(defenderPid)
    // 【noRestWhenBlockingColor】：アタッカーの色が一致する場合、ブロッカーは疲労しない（巨神機トール）
    // 【noRestWhenBlockingCost】：アタッカーのコストが条件を満たす場合も疲労しない
    // （maxCost以下＝BS07シルバー・ゴレム／sameCost＝ブロッカー自身と同じコスト＝BS07造兵工房）。
    // コストは道化師クランの付与コストも見る（instAllCosts）
    const attackerColors = instColors(attacker)
    const attackerCosts = instAllCosts(attacker)
    const blockerCosts = instAllCosts(blocker)
    // 発生源つきで取るのは、「ターンに1回」を**ネクサス1枚ごと**に数えるため（下記）
    const matched = activeConstraintsWithSource(state, defenderPid, blocker).filter(({ constraint: c }) => {
        if (c.type === "noRestWhenBlockingColor") return attackerColors.includes(c.color)
        // BS07ブリシンガメンの首飾りLv2：指定キーワードを持たない相手をブロックしたとき疲労しない
        if (c.type === "noRestWhenBlockingWithoutKeyword") {
            return !spiritHasKeyword(state, attackerPid, attacker, c.keyword)
        }
        if (c.type !== "noRestWhenBlockingCost") return false
        if (c.sameCost) return attackerCosts.some((a) => blockerCosts.includes(a))
        const max = c.maxCost
        return max !== undefined && attackerCosts.some((a) => a <= max)
    })
    // 「ターンに1回」（oncePerTurn。BS07ブリシンガメンの首飾りLv2）：**発生源1つにつき1回**数える
    // （同名ネクサスを2枚置けば2回使える。灼熱の谷と同じ「2枚あれば2回」の考え方。2026-08-24）。
    // このターン既に使った発生源の制約は数に入れない。回数制限の無い制約が同時にあるなら
    // そちらが働くので消費もしない
    const isOnce = (e: (typeof matched)[number]): boolean =>
        e.constraint.type === "noRestWhenBlockingWithoutKeyword" && e.constraint.oncePerTurn === true
    const usedIds = state.players[defenderPid].noRestWhenBlockingUsedThisTurn ?? []
    const usable = matched.filter((e) => !(isOnce(e) && usedIds.includes(e.sourceInstanceId)))
    const skipRest = usable.length > 0
    if (skipRest && usable.every(isOnce)) {
        // 消費するのは1つだけ（複数枚あっても、このブロックで使うのは1枚ぶん）
        const consumed = usable[0]
        if (consumed) state.players[defenderPid].noRestWhenBlockingUsedThisTurn = [...usedIds, consumed.sourceInstanceId]
        log(state, `${getCard(blocker.cardId).name}はブロックしても疲労しない（ターンに1回）。`)
    }
    if (!skipRest) exhaustSpirit(state, defenderPid, blocker)
    // 【強襲】を『このスピリットのブロック時』にも発揮させる継続付与（BS07蹴撃の戦場跡Lv2）。
    // **疲労の直後に置く**（回復状態のままだと【強襲】が空振りする）。バトルしない側のブロッカーには発揮しない
    if (withKyoshu && hasKyoshuOnBlock(state, defenderPid)) {
        resolveAction(state, defenderPid, blocker, { type: "refreshSelfByExhaustNexus" })
    }
}

export function finishBlockDeclaration(state: GameState, pid: PlayerId, instanceId: string): string | null {
    if (!state.battle) return "バトルが発生していません"
    state.battle.blockerInstanceId = instanceId
    const blocker = findSpirit(state.players[pid], instanceId)
    // ブロックの追加コスト（アタッカーに掛かっている blockCost）。検証（validateBlock）で払えることは確認済み。
    // マジックの破棄は自動選択（最初に見つかったマジック）
    const costAttacker = findSpirit(state.players[opponentOf(pid)], state.battle.attackerInstanceId)
    for (const c of costAttacker ? timedContentsOn(state, costAttacker) : []) {
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
    // ブロックを宣言したスピリットはここで疲労する（複数体ブロックでバトルしない側も宣言はしているので疲労する）
    const declaredAttacker = findSpirit(state.players[opponentOf(pid)], state.battle.attackerInstanceId)
    if (declaredAttacker) {
        if (blocker) exhaustDeclaredBlocker(state, pid, blocker, declaredAttacker, true)
        for (const extraId of state.battle.extraBlockerIds ?? []) {
            const extra = findSpirit(state.players[pid], extraId)
            if (extra) exhaustDeclaredBlocker(state, pid, extra, declaredAttacker, false)
        }
    }
    const blockerName = blocker ? getCard(blocker.cardId).name : "スピリット"
    log(state, `${state.players[pid].name}の${blockerName}がブロックした！ フラッシュタイミングを開始する。`)
    // ブロック時効果（targetInstanceId=アタッカー。targetSameLevelAsSelf 等の対象条件が参照する）
    if (blocker) fireTrigger(state, pid, blocker, "onBlock", undefined, state.battle.attackerInstanceId)
    if (state.winner) {
        state.battle = null
        return null
    }
    // フィールドイベント誘発「自分のスピリットがブロックしたとき」（BS10-088天貫く塔の城）。
    // self にはブロックしたスピリット自身（blocker）を渡す。vanillaOnly はこの self で判定する
    if (blocker) {
        fireFieldEventTriggers(
            state,
            pid,
            "ownSpiritDeclaredBlock",
            { pid, inst: blocker },
            instColors(blocker),
            state.battle.attackerInstanceId,
        )
    }
    if (state.winner) {
        state.battle = null
        return null
    }
    // フィールドイベント誘発「スピリットがブロックを宣言したとき」（BS14-083氷結した瀑布）。
    // 発生源の持ち主に関わらずブロッカーに作用させるため、両プレイヤーのフィールドから
    // selfOverride（ブロッカー）付きで発火する（anySpiritAttacked と同じ作り）
    if (blocker && !state.winner) {
        fireFieldEventTriggers(state, pid, "anySpiritDeclaredBlock", { pid, inst: blocker }, instColors(blocker), state.battle.attackerInstanceId)
    }
    if (blocker && !state.winner) {
        fireFieldEventTriggers(state, opponentOf(pid), "anySpiritDeclaredBlock", { pid, inst: blocker }, instColors(blocker), state.battle.attackerInstanceId)
    }
    if (state.winner) {
        state.battle = null
        return null
    }
    // 『このスピリットのバトル時』：バトルが成立した時点（ブロック宣言時）で発火する。勝敗を問わない
    if (blocker) fireTrigger(state, pid, blocker, "onBattleStart", undefined, state.battle.attackerInstanceId)
    if (state.winner) {
        state.battle = null
        return null
    }
    // 【粉砕】をこのスピリットのブロック時にも発揮させる継続付与（士気高き大本営）
    if (blocker && hasFunsaiOnBlock(state, pid)) resolveFunsai(state, pid, blocker)
    if (state.winner) {
        state.battle = null
        return null
    }
    // 攻撃側の「ブロックされたとき」誘発（バット・バット、暗黒将軍ブラッディ・シーザー）。
    // self=アタッカー、targetInstanceId=ブロッカー（coreRemoveの対象に使う）
    const attackerPid = opponentOf(pid)
    const attackerInstanceId = state.battle?.attackerInstanceId
    const attacker = attackerInstanceId
        ? findSpirit(state.players[attackerPid], attackerInstanceId)
        : undefined
    if (attacker) fireTrigger(state, attackerPid, attacker, "onBlocked", undefined, instanceId)
    if (state.winner) {
        state.battle = null
        return null
    }
    // フィールドイベント誘発「自分のスピリットがブロック宣言を受けたとき」（花の子リップ）。
    // 持ち主（attackerPid）のフィールドから発火。colorFilterはブロックされた自分スピリット（attacker）の色、
    // targetInstanceIdはブロッカー（instanceId）
    // self にはブロックされた自分のスピリット（attacker）を渡す。refreshSelf が
    // 「ブロックされたこのスピリットを回復させる」として機能する（BS05ペンタン帝国Lv2）。
    // 花の子リップの levelOverrideTarget は targetInstanceId しか見ないので影響を受けない
    if (attacker) {
        fireFieldEventTriggers(
            state,
            attackerPid,
            "ownSpiritBlocked",
            { pid: attackerPid, inst: attacker },
            instColors(attacker),
            instanceId,
        )
    }
    if (state.winner) {
        state.battle = null
        return null
    }
    // ブロック宣言後は即解決せず、フラッシュを再オープンする
    // （公式ルール: フラッシュは非ターンプレイヤー＝防御側から優先権を持つ）
    state.isFlashTiming = true
    state.flashCount = 0
    state.priorityPlayer = opponentOf(state.turnPlayer)
    return null
}

// 防御側がライフで受けることを宣言する。ブロック宣言と違い、ライフで受ける場合はフラッシュ②を
// 再オープンせず、宣言した場でそのまま resolveLifeDamage を解決する
// （公式ルール: ブロック宣言時のみフラッシュ②が開く。ライフで受ける場合はフラッシュタイミングなし）
function doTakeLife(state: GameState, pid: PlayerId): string | null {
    const error = validateTakeLife(state, pid)
    if (error) return error
    if (!state.battle) return "バトルが発生していません"

    log(state, `${state.players[pid].name}はライフで受けることを宣言した。`)
    resolveLifeDamage(state)
    return null
}

// フラッシュの優先権を相手へ渡す。両者が連続でパスするとフラッシュ終了。
// 起動能力の「ターンに1回」の消費を取り消す（対象を見てからやめたとき／対象がいなかったとき）。
// 記録が消えるので、同じターンにもう一度起動ボタンを押せる（2026-08-21 ユーザー確定）
export function revertActivatedUse(inst: CardInstance, effectId: string): void {
    if (!inst.activatedUsedTurn) return
    const rest = { ...inst.activatedUsedTurn }
    delete rest[effectId]
    inst.activatedUsedTurn = rest
}

// 起動能力（kind: "activated"）: コストを払って任意発動する能力。
// 個別の効果は effect.action に載っており、この関数はコスト支払いと発動の枠組みのみを担う。
function doActivateAbility(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    effectId: string,
): string | null {
    const error = validateActivateAbility(state, pid, instanceId, effectId)
    if (error) return error

    const player = state.players[pid]
    // ネクサスの起動能力（BS11-067 白き楯の長城Lv2）と、【合体時】の起動能力を持つ
    // 合体中のブレイヴ（BS12-050 突機竜アーケランサー）も通す
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

    // コスト支払い（リザーブからトラッシュへ／自身を疲労させる）。
    // cost 省略時は追加コストなし（BS08帝竜騎サイクル＝「ターンに1回、〜できる」だけの効果）
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
        // 手札の指定系統のスピリットカード1枚を破棄する（BS13-062光り輝く大銀河Lv2）。
        // 候補2枚以上なら実対戦では持ち主が選ぶ（COST_MODEL.md §2）。ここは非対話（AI・テスト）の
        // 決定的簡略化として、コスト最大の1枚を自動選択する（validateActivateが手札の存在を保証済み）
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
        // 器BS16：手札の指定色のカード（種別を問わない）1枚を破棄する（BS16-005ゴエモン・シーフ・ドラゴンLv2-3）。
        // discardHandFamilyと同じく候補2枚以上ならコスト最大を自動選択する簡略化（validateActivateが存在を保証済み）
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
        // BS14-051 アルカナビーストクィーン：指定系統の回復状態スピリット1体を疲労させる。
        // 候補2体以上は実効BP最小を自動選択する簡略化（reviveOnDestroy.cost.exhaustOwnFamilyOneと同型）
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
        // BS15-003ファイアファンサウル：手札1枚（決定的簡略化：末尾）を破棄し、このスピリット自身を疲労させる
        const cardId = player.hand.pop()!
        player.trashCards.push(cardId)
        exhaustSpirit(state, pid, host)
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}の効果を発動した。（手札の${getCard(cardId).name}を破棄し、このスピリットを疲労）`,
        )
    } else if ("discardHandKeyword" in effect.cost) {
        // BS15-017エンプレス・ヨウクィーン：指定キーワード持ちのスピリットカード1枚（コスト最大を自動選択）を破棄する
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
        const n = effect.cost.reserveToTrash
        player.reserve -= n
        player.trashCores += n
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}の効果を発動した。（リザーブのコア${n}個をトラッシュ）`,
        )
    }

    // 「ターンに1回」の消費を、**コスト支払い後・効果解決前**に記録する。
    // 効果の解決中に中断（pendingChoice）が入ってもこのターンの再発動を防ぐため
    if (effect.oncePerTurn) {
        inst.activatedUsedTurn = { ...(inst.activatedUsedTurn ?? {}), [effectId]: state.turn }
    }

    // 対象を見てからやめられる起動能力か（いまは summonFromHandFree.cancelable ＝ BS08帝竜騎サイクル）。
    // 「起動ボタンを押す → 対象を選ぶ → やめる」を、効果を発揮しなかった扱いにするための軸
    const cancelable = "cancelable" in effect.action && effect.action.cancelable === true
    delete state.effectFizzled // 前回の発動の残りを拾わないよう、毎回落としてから解決する
    resolveAction(state, pid, host, effect.action)
    if (effect.oncePerTurn && cancelable) {
        if (state.effectFizzled) {
            // 対象がいなくてその場で終わった＝発揮しなかったので、消費を戻して再度起動できるようにする
            revertActivatedUse(inst, effectId)
        } else if (state.pendingChoice) {
            // 選択待ちに入った：**やめたら**戻す（doResolveChoice が見る）
            state.pendingChoice.revertActivated = { instanceId, effectId }
        }
    }
    delete state.effectFizzled
    // 効果でバトルが終了していなければ、フラッシュの優先権を相手へ移す
    if (state.battle) passFlashPriority(state, pid)
    return null
}

// 降参：相手の勝利としてただちにゲームを終了する。
// 進行中のバトル・フラッシュ・選択待ちはすべて破棄する（勝敗が決まった後は誰も操作しないため、
// 中途半端な状態を残さない）
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
        // マジックミラーが写せるのは「**このフラッシュタイミングで**相手が直前に使用したマジック」なので、
        // タイミングが閉じた時点で記録も切る。1つのバトルにはフラッシュ①（アタック宣言後）と
        // ②（ブロック後）があり、これが無いと①で相手が使ったマジックを②で写せてしまう（BS08マジックミラー）
        delete state.lastMagicCast
        if (state.battle && state.battle.blockerInstanceId) {
            // ブロック後のフラッシュ終了 → バトルを解決する
            resolveBattle(state)
        } else if (state.battle && state.battle.directedTargetInstanceId) {
            // 指定アタック：アタック時効果と【バースト】の解決がすべて終わり、ブロック宣言に入る
            // 時点＝ここで自動的にブロックを確定させる（防御側に選ばせない）
            resolveDirectedBlock(state)
        }
        // ブロック未宣言なら isFlashTiming を下ろすのみ（防御側の block/takeLife 待ち）。
        // ライフ受けはフラッシュ②を開かず宣言時に即解決するため、ここでは扱わない
    }
    return null
}
