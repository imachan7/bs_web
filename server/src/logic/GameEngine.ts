// 召喚/アタック等のアクション実行とイベント発火の統括
import type { CardInstance, DestroyContext, EffectAction, GameAction, GameState, PaySource, PlayerId, ResumeFrame } from "../type"
import {
    clearBattle,
    coresForLevel,
    createInstance,
    currentLevel,
    findInstanceAnywhere,
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
import { driveTurnStart, endTurn, toAttackPhase } from "./PhaseManager"
import { applyFushiSummon, destroyTargetsBatch, resolveDestroyOne, resumeDestroyBatch, resumeDestroyCommit, resumeDestroyNexusCommit } from "./removal"
import { AWAKEN_FROM_RESERVE, effectSources, instAllCosts, lifeProtectedByCostThisTurn, noLifeDamageByCost, protectedByBpUpToSelf, spiritHasKeyword } from "../../../shared/rules"
import {
    summonFreeFromTrashIndex,
    activeConstraints,
    checkExhaustOnCoreChange,
    consumeSummonHandDiscardPay,
    destroySpirit,
    effectActiveAtLevel,
    effectiveBp,
    emitEvent,
    exhaustSpirit,
    applyJugekiCoreToVoid,
    applyMagicNegateChoice,
    applyMagicRedirectChoice,
    applyMagicSideChoice,
    applyHandFreeSummon,
    applyDeckMillNegate,
    applyReviveConfirm,
    declineDeckMillNegate,
    declineReviveConfirm,
    tryHandFreeSummonOnLifeDamaged,
    battleBp,
    bofuCountFor,
    declineMagicNegateChoice,
    fireBattleWonTriggers,
    fireExhaustedTriggers,
    fireSummonSequence,
    fireSummonTrigger,
    fireFieldEventTriggers,
    fireTrigger,
    hasArmorAgainst,
    hasFunsaiOnBlock,
    hasKyoshuOnBlock,
    hasJugekiOnBlockReplace,
    hasBofuOnBlock,
    hasKoboOnBlock,
    hasLifeDamageNegate,
    tryLifeDamageMillGuard,
    hasSummonedExhaustGrant,
    instanceSymbolCount,
    instColors,
    millDeck,
    notifyNexusDeployed,
    refreshLevelAsOverrides,
    sweepLevelCostDepletion,
    resolveAction,
    resolveFunsai,
    resolveKoboOnBattleEnd,
    resolveMagic,
    resolveTensho,
    returnSpiritToHand,
} from "./EffectModules"
import {
    effectiveCost,
    validateActivateAbility,
    validateAttack,
    validateAwaken,
    validateBlock,
    validateCastMagic,
    validateEndTurn,
    validateMoveCore,
    nexusMillPayAmount,
    summonHandDiscardPayAmount,
    validatePass,
    validateSetNexus,
    validateSummon,
    validateTakeLife,
} from "./RuleValidator"

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
    // 中断したのに処理を続けていないかの検査（BS_DEBUG_CHECKS=1 のときだけ働く）
    checkNoMutationAfterSuspend(state)
    return result
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
    // 「手札を破棄して効果を受けない」を払うかどうかの方針切り替え（BS08竜騎集う円卓Lv2）。
    // 盤面を変えない設定操作なので、降参と同じくいつでも受け付ける
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
            return doSummon(state, pid, action.handIndex, action.paySources, action.level, action.substituteInstanceId, action.discardHandIndices)
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
        case "moveCore":
            return doMoveCore(state, pid, action.instanceId, action.direction)
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
            return doResolveChoice(state, pid, action.instanceId, action.option, action.cardIndex)
        case "nextPhase": {
            if (state.turnPlayer !== pid) return "自分のターンではありません"
            if (state.phase !== "main") return "メインステップではありません"
            if (state.battle) return "バトル中です"
            toAttackPhase(state)
            return null
        }
        case "endTurn": {
            const error = validateEndTurn(state, pid)
            if (error) return error
            endTurn(state)
            return null
        }
        // "surrender" は冒頭で処理済みのため、ここでは型から除外されている
    }
}

// コストと「召喚/配置したカードの上に置くコア」をまとめて支払う。
//
// paySources（自分のフィールドのスピリット/ネクサス上のコア）から取ったぶんは、
// **先にコストへ充当し、余りを置くコアへ回す**。コスト充当分はトラッシュへ行き、
// 置くコアに回った分はそのままカードの上へ置かれる（＝トラッシュを経由しない）。
// 不足分はリザーブから支払う。
// 戻り値は「置くコアのうちフィールドから賄えた数」で、呼び出し側はリザーブから引く数を
// maintain - placedFromField にする。
// 支払い後、維持コア（Lv1）を下回った支払い元スピリットは消滅する。
function payCost(
    state: GameState,
    pid: PlayerId,
    cost: number,
    paySources?: PaySource[],
    maintain = 0,
): number {
    const player = state.players[pid]
    let takenFromField = 0
    if (paySources && paySources.length > 0) {
        for (const src of paySources) {
            const inst = findSpirit(player, src.instanceId) ?? findNexus(player, src.instanceId)
            if (!inst) continue
            const paid = Math.min(src.count, inst.cores)
            inst.cores -= paid
            takenFromField += paid
        }
    }
    // フィールドから取ったコアはコスト優先で充当し、余りを置くコアへ（上限は maintain）
    const costFromField = Math.min(takenFromField, cost)
    const placedFromField = Math.min(takenFromField - costFromField, maintain)
    // コスト充当分（フィールド由来＋リザーブ由来）はトラッシュへ
    const costFromReserve = cost - costFromField
    player.reserve -= costFromReserve
    player.trashCores += costFromField + costFromReserve
    // 置くコアに回りきらなかった余剰はリザーブへ戻す（validate 側で弾いているので通常は0）
    const surplus = takenFromField - costFromField - placedFromField
    if (surplus > 0) player.reserve += surplus
    if (takenFromField > 0) {
        const placedNote = placedFromField > 0 ? `（うち${placedFromField}個は置くコアに充当）` : ""
        log(state, `${player.name}はフィールドのコア${takenFromField}個を含めて支払った。${placedNote}`)
    }
    // 全支払い完了後、支払い元スピリットが維持コア（Lv1）を下回っていたら消滅させる
    // （ここは意図的に findSpirit のみを検索する。ネクサスは維持コアの概念がなく
    //   自然に消滅対象から外れるため、findNexus を併用しないこと）
    if (paySources) {
        for (const src of paySources) {
            const inst = findSpirit(player, src.instanceId)
            if (inst && inst.cores < instMinLevelCores(inst)) {
                destroySpirit(state, pid, inst.instanceId, "deplete")
            }
        }
    }
    return placedFromField
}

// バトル中のフラッシュで行動したら優先権を相手へ移し、連続パス数をリセットする
// （フラッシュマジック・神速召喚・覚醒で共通）
function passFlashPriority(state: GameState, pid: PlayerId): void {
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

function doSummon(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    paySources?: PaySource[],
    level?: number,
    substituteInstanceId?: string,
    discardHandIndices?: number[],
): string | null {
    const error = validateSummon(state, pid, handIndex, paySources, level, substituteInstanceId, discardHandIndices)
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

    const cost = effectiveCost(state, pid, card)
    // レベル指定があればそのレベルぶんのコアを置いて召喚する（省略時はLv1）。
    // 召喚時効果はコア配置後に発火するため、Lv2以上を指定すればそのレベルの効果が発揮される
    const maintain = level === undefined ? minLevelCores(card) : (coresForLevel(card, level) ?? minLevelCores(card))

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
    player.reserve -= maintain - placedFromField

    const inst = createInstance(cardId, state.turn, maintain)
    player.field.spirits.push(inst)
    const flashNote = state.isFlashTiming ? "【神速】で" : ""
    const levelNote = level !== undefined && level > 1 ? `Lv${level}で` : ""
    log(state, `${player.name}は${flashNote}${card.name}を${levelNote}召喚した。（コスト${cost}）`)
    emitEvent(state, { type: "summon", pid, cardName: card.name })

    // 【転召】を先に解決する：対象を選び、その上のコアすべてをdestへ置く（多くの場合そこで消滅する）。
    // **召喚時効果はこの後**（2026-08-13 修正。以前は逆順で、犠牲が消える前に召喚時効果が出ていた）
    if (!state.winner) resolveTensho(state, pid, inst)
    if (state.pendingChoice) {
        // 転召の対象選択で中断した。選択の解決後に続きへ合流させる（queue は同一解決内の残り処理を積む場所）
        pushResumeFrames(state, [{ kind: "action", selfInstanceId: inst.instanceId, action: { type: "summonSequence" } }])
    } else {
        fireSummonSequence(state, pid, inst)
    }
    // フラッシュ中（神速召喚）は優先権を相手へ移す
    passFlashPriority(state, pid)
    if (state.winner) state.battle = null
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

    // 栄光の表彰台Lv1：コアで足りない分の配置コストをデッキ破棄で支払う
    // （validateSetNexus と同じ関数で枚数を出すので、検証と実行がズレない）
    const millPaid = nexusMillPayAmount(state, pid, cost, maintain, paySources, millPay)
    if (millPaid > 0) {
        millDeck(state, pid, millPaid)
        log(state, `${player.name}は配置コストのうち${millPaid}を、デッキ${millPaid}枚の破棄で支払った。`)
    }
    // 置くコアもフィールドのコアで賄える（賄えなかった分だけリザーブから出す）
    const placedFromField = payCost(state, pid, cost - millPaid, paySources, maintain)
    player.reserve -= maintain - placedFromField
    player.hand.splice(handIndex, 1)

    player.field.nexuses.push(createInstance(cardId, state.turn, maintain))
    const levelNote = level !== undefined && level > 1 ? `Lv${level}で` : ""
    log(state, `${player.name}は${card.name}を${levelNote}配置した。（コスト${cost}）`)
    notifyNexusDeployed(state, pid)
    return null
}

function doCastMagic(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    targetInstanceId?: string,
    paySources?: PaySource[],
    fromTegamoto?: boolean,
): string | null {
    const error = validateCastMagic(state, pid, handIndex, targetInstanceId, paySources, fromTegamoto)
    if (error) return error

    const player = state.players[pid]
    const cardId = fromTegamoto ? player.tegamoto[handIndex] : player.hand[handIndex]
    if (cardId === undefined) return fromTegamoto ? "手元にカードがありません" : "手札にカードがありません"
    const card = getCard(cardId)
    const cost = effectiveCost(state, pid, card)

    payCost(state, pid, cost, paySources)
    if (fromTegamoto) {
        player.tegamoto.splice(handIndex, 1)
        // 手元の使用権（BS06混迷する魔法実験場Lv2）も1件ぶん消費する。
        // cardId の多重集合として持っているので、同名が複数あってもどれを消しても等価
        const playableIdx = player.tegamotoPlayable.indexOf(cardId)
        if (playableIdx !== -1) player.tegamotoPlayable.splice(playableIdx, 1)
    } else {
        player.hand.splice(handIndex, 1)
    }
    player.trashCards.push(cardId)
    log(state, `${player.name}は${card.name}を使用した。（コスト${cost}）`)
    // このターンのマジック使用回数を加算（作戦参謀フォクシンのoncePerTurnAll判定用）
    state.magicUsedThisTurn[pid] = (state.magicUsedThisTurn[pid] ?? 0) + 1

    // 使用タイミングに応じた効果を実行。メインステップでメイン効果がなければフラッシュ効果を使う。
    // マジックミラー用：このフラッシュタイミングで直前に使用したマジックとして記録する
    // （clearBattleでバトルごとにクリアされる。BS08マジックミラー）。
    // **resolveMagicの後で、かつ解決中に書き換わっていなければ**記録すること：
    // この使用自体がマジックミラーだった場合、マジックミラー自身の解決（action:"magicMirrorRepeat"）が
    // 「直前に使用されたマジック」を読んでからここと同じ場所を書き換える。先に（resolveMagicの前に）
    // 記録すると自分自身を読んでしまい、後で（無条件に）書き換えるとマジックミラー側の記録を潰してしまう
    const beforeLastMagicCast = state.lastMagicCast
    if (state.battle) {
        resolveMagic(state, pid, cardId, "flash", targetInstanceId)
        if (state.lastMagicCast === beforeLastMagicCast) {
            state.lastMagicCast = {
                pid,
                cardId,
                timing: "flash",
                ...(targetInstanceId !== undefined ? { targetInstanceId } : {}),
            }
        }
        // フラッシュで使用したら優先権を相手へ移し、再応答の機会を与える
        passFlashPriority(state, pid)
    } else {
        const hasMain = card.effects.some(
            (e) => e.kind === "magic" && e.timing === "main",
        )
        const timing = hasMain ? "main" : "flash"
        resolveMagic(state, pid, cardId, timing, targetInstanceId)
        if (state.lastMagicCast === beforeLastMagicCast) {
            state.lastMagicCast = {
                pid,
                cardId,
                timing,
                ...(targetInstanceId !== undefined ? { targetInstanceId } : {}),
            }
        }
    }
    if (state.winner) state.battle = null
    return null
}

function doMoveCore(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    direction: "add" | "remove",
): string | null {
    const error = validateMoveCore(state, pid, instanceId, direction)
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
        // 「コアを置く、または取り除くと疲労する」（BS01ルビーの太陽Lv2）。
        // onRemove を持たない既存の効果（夢魔の寝所／魔影街）はここでは反応しない
        if (spirit) checkExhaustOnCoreChange(state, pid, spirit, { viaEffect: false, isRemoval: true })
    }
    return null
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
    // 指定アタックの場合、blockerInstanceId を強制的に指定スピリットにセットする
    // （既存の「blockerInstanceId あり＝ブロック済み」ロジックにより、takeLife も他のブロックも
    // 自動的に拒否される。onBlock トリガーはブロック宣言ではないため発火させない）
    state.battle = {
        attackerInstanceId: instanceId,
        blockerInstanceId: targetSpiritInstanceId ?? null,
        flashLockedPlayer: null,
        directed: targetSpiritInstanceId !== undefined,
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

    // 『このスピリットのバトル時』：バトルが成立した時点（アタック宣言時）で発火する。勝敗を問わない
    if (!state.winner) fireTrigger(state, pid, inst, "onBattleStart")

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

    state.battle.blockerInstanceId = instanceId
    const blocker = findSpirit(state.players[pid], instanceId)
    const blockerName = blocker ? getCard(blocker.cardId).name : "スピリット"
    log(state, `${state.players[pid].name}の${blockerName}がブロックした！ フラッシュタイミングを開始する。`)
    // ブロック時効果（targetInstanceId=アタッカー。targetSameLevelAsSelf 等の対象条件が参照する）
    if (blocker) fireTrigger(state, pid, blocker, "onBlock", undefined, state.battle.attackerInstanceId)
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

// ライフで受けることを宣言した場でライフダメージを解決する（doTakeLifeから直接呼ばれる）。
// フラッシュ①中に盤面が変わりうるため（アタッカー破壊・BP変化・ライフダメージ無効の付与等）、
// 解決時点の状態を読む
function resolveLifeDamage(state: GameState): void {
    if (!state.battle) return
    const attackerPid = state.turnPlayer
    const defenderPid = opponentOf(attackerPid)
    const attacker = findSpirit(
        state.players[attackerPid],
        state.battle.attackerInstanceId,
    )
    const defender = state.players[defenderPid]

    // フラッシュ中にアタッカーが破壊された等で場を離れていたら、ライフダメージなしでバトル終了
    if (!attacker) {
        log(state, "アタッカーが場を離れたため、ライフダメージは発生しなかった。")
        clearBattle(state)
        return
    }

    // 硝子の女神フレイア等：ブロックされなかったアタッカーの実効BPが発生源の実効BP以下のとき、
    // ライフダメージそのものを打ち消す（emitEvent "lifeDamage" もfireTrigger onLifeDealtも発火しない）
    // ミストカーテン：指定されたアタッカーのアタックでは、このターン使用者のライフが減らない
    if (attacker.lifeDamageNegatedFor === defenderPid) {
        log(
            state,
            `${defender.name}は${getCard(attacker.cardId).name}のアタックによるライフダメージを受けなかった（効果）。`,
        )
        resolveKoboOnBattleEnd(state, attackerPid, attacker)
        clearBattle(state)
        return
    }
    // BS07「勇傑」各色に共通：コストがmaxCost以下のスピリットのアタックでは、お互いのライフは減らされない。
    // 両陣営に効く全体制約なので、発生源の持ち主を問わず hasGlobalConstraintByCost で見る
    if (noLifeDamageByCost(state, attacker)) {
        log(
            state,
            `${defender.name}は${getCard(attacker.cardId).name}のアタックによるライフダメージを受けなかった（効果）。`,
        )
        resolveKoboOnBattleEnd(state, attackerPid, attacker)
        clearBattle(state)
        return
    }
    // BS07秘密の花園Lv2：このターンの間、コスト条件を満たすアタックでは**この防御側のライフだけ**が減らない
    if (lifeProtectedByCostThisTurn(state, defenderPid, attacker)) {
        log(
            state,
            `${defender.name}は${getCard(attacker.cardId).name}のアタックによるライフダメージを受けなかった（効果）。`,
        )
        resolveKoboOnBattleEnd(state, attackerPid, attacker)
        clearBattle(state)
        return
    }
    // BS08空帝竜騎プラチナム：ブロックされなかったアタッカーの実効BPがこのスピリット自身の実効BP以下のとき、
    // そのアタックでは自分のライフは減らない（片側のみ）
    if (protectedByBpUpToSelf(state, defenderPid, attacker)) {
        log(
            state,
            `${defender.name}は${getCard(attacker.cardId).name}のアタックによるライフダメージを受けなかった（効果）。`,
        )
        resolveKoboOnBattleEnd(state, attackerPid, attacker)
        clearBattle(state)
        return
    }
    if (hasLifeDamageNegate(state, defenderPid, attackerPid, attacker)) {
        log(
            state,
            `${defender.name}は${getCard(attacker.cardId).name}のアタックによるライフダメージを受けなかった（効果）。`,
        )
        resolveKoboOnBattleEnd(state, attackerPid, attacker)
        clearBattle(state)
        return
    }

    // BS07六花の司書長サーガ：ライフが減る直前にデッキを1枚破棄し、条件に合えばライフが減らない
    if (tryLifeDamageMillGuard(state, defenderPid)) {
        log(
            state,
            `${defender.name}は${getCard(attacker.cardId).name}のアタックによるライフダメージを受けなかった（効果）。`,
        )
        resolveKoboOnBattleEnd(state, attackerPid, attacker)
        clearBattle(state)
        return
    }

    // ダメージ = アタックスピリットのシンボル数（instanceSymbolCount。tempExtraSymbols＝ダブルハート等も加味）。
    // ライフのコアは通常リザーブへ、ただしアタッカーが lifeDamageToVoid をレベル有効で持つ場合はボイドへ（スライミーLv3）
    const damage = instanceSymbolCount(attacker)
    const dealt = Math.min(damage, defender.life)
    const toVoid = activeConstraints(state, attackerPid, attacker).some((c) => c.type === "lifeDamageToVoid")
    defender.life -= dealt
    if (toVoid) {
        log(
            state,
            `${defender.name}はライフで受けた。ライフ-${dealt}（残り${defender.life}）。コアはボイドへ消えた。`,
        )
    } else {
        defender.reserve += dealt
        log(
            state,
            `${defender.name}はライフで受けた。ライフ-${dealt}（残り${defender.life}）`,
        )
    }
    if (dealt > 0) emitEvent(state, { type: "lifeDamage", pid: defenderPid, amount: dealt })

    if (defender.life <= 0) {
        state.winner = attackerPid
        log(state, `${state.players[attackerPid].name}の勝利！`)
    } else if (dealt > 0) {
        // フィールドイベント誘発「相手によって自分のライフが減らされたとき」（命の果実）。
        // ライフ0で敗北が決まった場合は発火しない。targetInstanceIdにアタッカーを渡す
        // （BS08竜騎集う円卓：BP5000以下のアタックによって減らされたとき、そのスピリットを破壊する）
        fireFieldEventTriggers(state, defenderPid, "ownLifeDamaged", undefined, undefined, attacker.instanceId)
        // 手札のカード自身が持つ「ライフが減ったとき無償召喚できる」（BS08猫娘アニー）。
        // 場・トラッシュではなく**手札**が発生源なので、フィールド誘発の走査では拾えない
        tryHandFreeSummonOnLifeDamaged(state, defenderPid)
    }
    // トリガー誘発「このスピリットのアタックによって相手のライフを減らしたとき」（老賢樹トレントン）。
    // アタッカー側で発火。勝敗が決まっていても発火して問題ない（コア獲得のみのため）
    if (dealt > 0) {
        fireTrigger(state, attackerPid, attacker, "onLifeDealt")
        // フィールドイベント誘発「自分のスピリットのアタックによって相手のライフを減らしたとき」
        // （BS06-X22魔界七将ベルゼビート）。selfにはライフを減らしたスピリット（アタッカー）を渡す
        if (!state.winner) {
            fireFieldEventTriggers(
                state,
                attackerPid,
                "ownSpiritDealtLife",
                { pid: attackerPid, inst: attacker },
                instColors(attacker),
            )
        }
    }

    resolveKoboOnBattleEnd(state, attackerPid, attacker)
    clearBattle(state)
}

// フラッシュの優先権を相手へ渡す。両者が連続でパスするとフラッシュ終了。
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
    const inst = findSpirit(player, instanceId)
    if (!inst) return "対象のスピリットが見つかりません"
    const effect = getCard(inst.cardId).effects.find(
        (e) => e.kind === "activated" && e.id === effectId,
    )
    if (!effect || effect.kind !== "activated") return "起動能力が見つかりません"

    // コスト支払い（リザーブからトラッシュへ／自身を疲労させる）
    if ("exhaustSelf" in effect.cost) {
        exhaustSpirit(state, pid, inst)
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}の効果を発動した。（このスピリットを疲労）`,
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

    resolveAction(state, pid, inst, effect.action)
    // 効果でバトルが終了していなければ、フラッシュの優先権を相手へ移す
    if (state.battle) passFlashPriority(state, pid)
    return null
}

// pendingChoice（効果解決中のプレイヤー選択）への応答を処理する。
// instanceId 省略時は「選ばない」（optional な選択のみ許可）。
// 選択実行後、退避していた queue（同一トリガー内の残りの誘発）を先頭から順に消化する。
// 途中で新たな pendingChoice が立てば、残りの queue をそちらへ引き継いで中断する。
function doResolveChoice(
    state: GameState,
    pid: PlayerId,
    instanceId?: string,
    option?: string,
    cardIndex?: number,
): string | null {
    const pending = state.pendingChoice
    if (!pending) return "選択待ちの効果がありません"
    if (pending.pid !== pid) return "あなたが選択するタイミングではありません"

    // マジックの無効化の確認（鏡の回廊Lv2／【氷壁】）。action は解決せず、
    // 「無効にする」ならコストを払ってマジックの効果を捨て、選ばなければ中断していた解決を続ける
    if (pending.magicNegate) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const info = pending.magicNegate
        state.pendingChoice = null
        if (option !== undefined) {
            applyMagicNegateChoice(state, info)
        } else {
            log(state, `${getCard(info.cardId).name}の効果を無効にしなかった。`)
            declineMagicNegateChoice(state, info)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 手札からの無償召喚の確認（BS08猫娘アニー）。action は解決しない
    if (pending.handFreeSummon) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const info = pending.handFreeSummon
        state.pendingChoice = null
        if (option !== undefined) {
            applyHandFreeSummon(state, info)
        } else {
            log(state, `${getCard(info.cardId).name}：手札から召喚しなかった。`)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 手札から破棄されたカード自身の無償召喚の確認（BS09-025忍者サルトベ）。action は解決しない
    if (pending.trashFreeSummon) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const info = pending.trashFreeSummon
        state.pendingChoice = null
        if (option !== undefined) {
            // 確認を出したあとにトラッシュが動いている可能性があるので、位置が食い違えばIDで取り直す
            const trash = state.players[info.pid].trashCards
            const index = trash[info.trashIndex] === info.cardId ? info.trashIndex : trash.lastIndexOf(info.cardId)
            if (index !== -1) summonFreeFromTrashIndex(state, info.pid, getCard(info.cardId).name, index)
        } else {
            log(state, `${getCard(info.cardId).name}：トラッシュから召喚しなかった。`)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 「破壊される代わりに復活できる」の確認。action は解決せず、
    // 選べばコストを払って復活が確定し、選ばなければ見送っていた破壊をここで行う
    if (pending.reviveConfirm) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const entry = pending.reviveConfirm
        state.pendingChoice = null
        if (option !== undefined) {
            applyReviveConfirm(state, entry)
        } else {
            declineReviveConfirm(state, entry)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 【不死】（BS09）：トラッシュのこのカードを、コストを支払って召喚するかの確認。action は解決しない
    if (pending.fushiSummon) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const info = pending.fushiSummon
        state.pendingChoice = null
        if (option !== undefined) {
            applyFushiSummon(state, info)
        } else {
            log(state, `${getCard(info.cardId).name}：【不死】で召喚しなかった。`)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 1体の破壊に対して同時に発揮する効果（「フィールドに残る」と【不死】）の解決順。
    // action は解決せず、選ばれた側を記録して破壊バッチの再開へ戻す（TIMING_CHART.md §0-3）
    if (pending.destroyEffectOrder) {
        const options = pending.options ?? []
        if (option === undefined) return "どちらを先に解決するか選んでください"
        const index = options.indexOf(option)
        const picked = pending.destroyEffectOrder.slots[index]
        if (index < 0 || picked === undefined) return "選択できない候補です"
        state.pendingChoice = null
        state.destroyEffectOrderPick = picked
        return finishChoiceResolution(state, pending.pid)
    }

    // 同時に破壊される複数体のうち「どの体から破壊処理をするか」（ターンプレイヤーが決める）。
    // action は解決せず、選ばれた個体を記録して破壊バッチの再開へ戻す（docs/design/TIMING_CHART.md §0-3）
    if (pending.destroyOrder) {
        const options = pending.options ?? []
        if (option === undefined) return "どのスピリットから破壊処理をするか選んでください"
        const index = options.indexOf(option)
        const picked = pending.destroyOrder.instanceIds[index]
        if (index < 0 || picked === undefined) return "選択できない候補です"
        state.pendingChoice = null
        state.destroyOrderPick = picked
        return finishChoiceResolution(state, pending.pid)
    }

    // 「デッキの破棄を、コストを払って無効にできる」の確認（BS08鳳翼の聖剣Lv2）。action は解決せず、
    // 選べばコストを払って破棄が無効になり、選ばなければ見送っていた破棄をここで行う
    if (pending.deckMillNegate) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const entry = pending.deckMillNegate
        state.pendingChoice = null
        if (option !== undefined) {
            applyDeckMillNegate(state, entry)
        } else {
            declineDeckMillNegate(state, entry)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 対象の変更の確認（BS02封印された魔導書Lv1）。action は解決せず、
    // どちらを対象として残すかを記録してから、中断していたマジックの解決を続ける。
    // options の並びは BOTH_SIDES_REDIRECT_OPTIONS（0=変更しない / 1=相手のみ / 2=自分のみ）で、
    // 「相手」「自分」はどちらも**魔導書の持ち主から見た**呼び方
    if (pending.magicSideChoice) {
        const options = pending.options ?? []
        if (option === undefined) return "対象をどちらに変更するか選んでください"
        const index = options.indexOf(option)
        if (index < 0) return "選択できない候補です"
        const info = pending.magicSideChoice
        state.pendingChoice = null
        const keepPid =
            index === 0 ? null : index === 1 ? opponentOf(info.ownerPid) : info.ownerPid
        applyMagicSideChoice(state, info, keepPid)
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 対象の絞り込みの確認（BS04サンク／BS05スノーホワイト）。action は解決せず、
    // 承認・拒否のどちらでも中断していたマジックの解決を続ける（絞り込むかだけが変わる）
    if (pending.magicRedirect) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const info = pending.magicRedirect
        state.pendingChoice = null
        if (option === undefined) {
            const source = findInstanceAnywhere(state, info.sourceInstanceId)
            const name = source ? getCard(source.cardId).name : "効果"
            log(state, `${name}：${getCard(info.cardId).name}の対象を絞り込まなかった。`)
        }
        applyMagicRedirectChoice(state, info, option !== undefined)
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    if (pending.kind === "option") {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        if (option === undefined && !pending.optional) {
            return "選択肢を選んでください"
        }
        state.pendingChoice = null
        const self = pending.selfInstanceId ? findInstanceAnywhere(state, pending.selfInstanceId) ?? null : null
        // 実行者は actorPid（省略時は選択者自身）。「相手に選ばせて自分の効果として解決する」形に対応する
        const actor = pending.actorPid ?? pending.pid
        if (option !== undefined) {
            // confirm（「〜できる」の発動確認）は選んだラベルを渡さない。
            // 渡すと、選択肢を解釈するアクション（grantColorChoice 等）が誤動作する
            if (pending.confirm) {
                // 発動を選んだ側もログに残す（発動しなかった場合と対になる。発生源がログから追えるように）
                log(state, `${self ? getCard(self.cardId).name : "効果"}：効果を発動した。`)
                resolveAction(state, actor, self, pending.action)
            } else {
                resolveAction(state, actor, self, pending.action, undefined, undefined, undefined, option)
            }
        } else {
            const name = self ? getCard(self.cardId).name : "効果"
            log(state, pending.confirm ? `${name}：効果を発動しなかった。` : `${name}：選択しなかった。`)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    if (pending.kind === "card") {
        if (cardIndex !== undefined && !(pending.cardIndices ?? []).includes(cardIndex)) {
            return "選択できない対象です"
        }
        if (cardIndex === undefined && !pending.optional) {
            return "対象を選択してください"
        }
        state.pendingChoice = null
        const self = pending.selfInstanceId ? findInstanceAnywhere(state, pending.selfInstanceId) ?? null : null
        if (cardIndex !== undefined) {
            resolveAction(state, pending.actorPid ?? pending.pid, self, pending.action, undefined, undefined, undefined, undefined, cardIndex)
        } else if (pending.resolveOnSkip) {
            // 「選び終わったら後処理がある」効果（BS08堕天使ミカファール：破棄した枚数ぶんドローする）。
            // スキップ＝「もう選ばない」の合図なので、cardIndex なしで action をもう一度解決させる
            resolveAction(state, pending.actorPid ?? pending.pid, self, pending.action)
        } else {
            log(state, `${self ? getCard(self.cardId).name : "効果"}：選択しなかった。`)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    if (instanceId !== undefined && !pending.candidates.includes(instanceId)) {
        return "選択できない対象です"
    }
    if (instanceId === undefined && !pending.optional) {
        return "対象を選択してください"
    }

    state.pendingChoice = null
    const self = pending.selfInstanceId ? findInstanceAnywhere(state, pending.selfInstanceId) ?? null : null

    if (instanceId !== undefined) {
        resolveAction(state, pending.actorPid ?? pending.pid, self, pending.action, instanceId)
    } else {
        log(state, `${self ? getCard(self.cardId).name : "効果"}：対象を選ばなかった。`)
    }
    if (state.winner) return null
    return finishChoiceResolution(state, pending.pid)
}

// 選択解決後の共通後処理：queue を消化し、消化しきって新たな選択待ちも無く勝敗も未決なら、
// ステップ誘発の pendingChoice で中断していたターン開始処理を続きのステップから再開する
// （百識の谷Lv1のドローステップ破棄選択など。中断していなければ resumeTurnStart は no-op）。
function finishChoiceResolution(state: GameState, pid: PlayerId): string | null {
    drainResumeStack(state, pid)
    return null
}

// 再開スタック（中断された残りの処理）を先頭から1つずつ消化する。
//
// **中断が起きたら、その場で止めるだけでよい**（残りはスタックに載ったまま）。
// 新しい中断で積まれたフレームは pushResumeFrames が「今回の領域の末尾」＝古いフレームより前へ
// 入れるので、配列は常に「内側 → 外側 → 古いもの」の正しい実行順に並ぶ。
// 移行前は queue を引数で持ち回り、中断のたびに新しい pendingChoice へ積み直していた
// （docs/design/RESUME_STACK.md §2・§3）
function drainResumeStack(state: GameState, pid: PlayerId): string | null {
    // 直前のアクションが新しい選択待ちを立てていたら、消化せずそのまま中断を続ける
    // （選択の解決中にさらに選択が必要になるケース。例：【転召】でコアを置く先を選んだあと、
    // その対象が【転召】置換を持っていて「疲労するか」を続けて聞く）
    while (!state.pendingChoice && !state.winner && state.resumeStack.length > 0) {
        const frame = state.resumeStack.shift()
        if (!frame) continue
        if (frame.kind === "turnStart") {
            // 中断していたターン開始処理を続きのステップから再開する
            // （百識の谷Lv1のドローステップ破棄選択など）
            driveTurnStart(state, frame.step)
            continue
        }
        if (frame.kind === "destroyBatch") {
            resumeDestroyBatch(state, frame)
            continue
        }
        if (frame.kind === "destroyNexusCommit") {
            // 破壊待機状態のまま中断していたネクサスの破壊処理を続ける
            resumeDestroyNexusCommit(state, frame)
            continue
        }
        if (frame.kind === "destroyCommit") {
            // 破壊待機状態のまま中断していた破壊処理（誘発の残り＋トラッシュ行き）を続ける
            resumeDestroyCommit(state, frame)
            continue
        }
        if (frame.kind === "destroyOne") {
            // 1体の破壊に伴う同時発揮（「フィールドに残る」と【不死】）の続きを回す
            resolveDestroyOne(state, frame)
            continue
        }
        if (frame.kind === "battleResolve") {
            // 中断していたバトル解決（＞６破壊処理〜＞７バトル終了）を続きのステップから再開する
            resumeBattleResolution(state, frame)
            continue
        }
        const frameSelf = frame.selfInstanceId
            ? findInstanceAnywhere(state, frame.selfInstanceId) ?? null
            : null
        resolveAction(state, frame.actorPid ?? pid, frameSelf, frame.action)
    }
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
        }
        // ブロック未宣言なら isFlashTiming を下ろすのみ（防御側の block/takeLife 待ち）。
        // ライフ受けはフラッシュ②を開かず宣言時に即解決するため、ここでは扱わない
    }
    return null
}

// ブロック成立後のバトル解決：BP比較で敗者を破壊（同値は相打ち）
function resolveBattle(state: GameState): void {
    if (!state.battle) return
    const attackerPid = state.turnPlayer
    const defenderPid = opponentOf(attackerPid)
    const attacker = findSpirit(
        state.players[attackerPid],
        state.battle.attackerInstanceId,
    )
    const blocker = state.battle.blockerInstanceId
        ? findSpirit(state.players[defenderPid], state.battle.blockerInstanceId)
        : undefined

    if (!attacker || !blocker) {
        clearBattle(state)
        return
    }

    // 直前のバトル解決の記録をリセット（魔界七将デストロード：coreGainPer counter "lastBattleDestroyedCores"）
    state.lastBattleDestroyedCores = 0
    // 直前のバトル解決の記録をリセット（魔界伯爵ヴィール：exhaustAllByLevel level "lastBattleDestroyed"）
    state.lastBattleDestroyedLevel = 0
    // 「BPを比べ相手のスピリットだけを破壊した」ときの破壊された側の色・系統
    // （TargetFilter.sameColorAsBattleLoser / sameFamilyAsBattleLoser。ドヴェルグ／ニーベルングリング）
    state.lastBattleDestroyedColors = []
    state.lastBattleDestroyedFamilies = []
    state.lastBattleDestroyedBp = 0
    state.lastBattleDestroyedCost = 0

    // 【noRestWhenBlockingColor】：アタッカーの色が一致する場合、ブロッカーは疲労しない（巨神機トール）
    // 【noRestWhenBlockingCost】：アタッカーのコストが条件を満たす場合も疲労しない
    // （maxCost以下＝BS07シルバー・ゴレム／sameCost＝ブロッカー自身と同じコスト＝BS07造兵工房）。
    // コストは道化師クランの付与コストも見る（instAllCosts）
    const attackerColors = instColors(attacker)
    const attackerCosts = instAllCosts(attacker)
    const blockerCosts = instAllCosts(blocker)
    const matched = activeConstraints(state, defenderPid, blocker).filter((c) => {
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
    // 「ターンに1回」（oncePerTurn。BS07ブリシンガメンの首飾りLv2）：このターン既に使っていたら、
    // その制約は数に入れない。回数制限の無い制約が同時にあるならそちらが働くので消費もしない
    const isOnce = (c: (typeof matched)[number]): boolean =>
        c.type === "noRestWhenBlockingWithoutKeyword" && c.oncePerTurn === true
    const used = state.players[defenderPid].noRestWhenBlockingUsedThisTurn === true
    const usable = matched.filter((c) => !(isOnce(c) && used))
    const skipRest = usable.length > 0
    if (skipRest && usable.every(isOnce)) {
        state.players[defenderPid].noRestWhenBlockingUsedThisTurn = true
        log(state, `${getCard(blocker.cardId).name}はブロックしても疲労しない（ターンに1回）。`)
    }
    if (!skipRest) exhaustSpirit(state, defenderPid, blocker)
    // 【強襲】を『このスピリットのブロック時』にも発揮させる継続付与（BS07蹴撃の戦場跡Lv2）。
    // **ブロック宣言時ではなくここで呼ぶ**：ブロッカーが疲労するのはこの直上なので、
    // 宣言時点では回復状態のまま＝【強襲】が空振りしてしまう
    if (hasKyoshuOnBlock(state, defenderPid)) {
        resolveAction(state, defenderPid, blocker, { type: "refreshSelfByExhaustNexus" })
    }
    // 【暴風】を『このスピリットのブロック時』へ差し替える継続付与（BS07大風車の丘Lv2）。
    // 本来は「アタックしてブロックされたとき」だが、これがある間はブロックした側が発揮する。
    // 疲労させられるのはアタッカー側で、既に疲労しているアタッカー自身は除く（excludeTarget）
    if (hasBofuOnBlock(state, defenderPid)) {
        const count = bofuCountFor(state, defenderPid, blocker)
        if (count > 0) {
            resolveAction(
                state,
                defenderPid,
                blocker,
                { type: "exhaust", count, chooserIsTarget: true, excludeTarget: true },
                attacker.instanceId,
            )
        }
    }
    // 疲労誘発でアタッカー／ブロッカーが消滅したらバトルは成立しない（BS05藍紫の虚空Lv1のような
    // 「疲労したときコアを置く」効果は、ブロックの疲労でも発火してその場で消滅させうる）
    if (state.winner) return
    if (
        !findSpirit(state.players[attackerPid], attacker.instanceId) ||
        !findSpirit(state.players[defenderPid], blocker.instanceId)
    ) {
        clearBattle(state)
        return
    }
    // BS09-044妖精の姫巫女ハマ・ドリュアス：ブロッカーがLv1なら、**BPを比べずに**
    // 「ブロックされなかった」ものとして扱う（＝ライフに通る。どちらも破壊されず、
    // ブロッカーは疲労したまま場に残る。BS09_PLAN.md §4。2026-08-14 ユーザー確認）
    if (state.battle.treatAsUnblockedIfBlockerLevel1 && currentLevel(blocker).level === 1) {
        log(
            state,
            `${getCard(blocker.cardId).name}はLv1のため、BPを比べずブロックされなかったものとして扱う。`,
        )
        resolveLifeDamage(state)
        return
    }
    // 果て無き地平線Lv1：バトルのBP比較のときだけ、Lv1スピリットがLv2BPを使う（battleBp が差分を足す）
    const attackerBp = battleBp(state, attackerPid, attacker)
    const blockerBp = battleBp(state, defenderPid, blocker)
    // バトルによる破壊コンテキストに載せる「破壊した側（勝者）」のレベル（子供部屋 午前0時の
    // byBattleKillerLevel判定用）。命名はattackerColorと同じく歴史的なもので、実際は勝者側の値
    const attackerLevel = currentLevel(attacker).level
    const blockerLevel = currentLevel(blocker).level

    log(
        state,
        `${getCard(blocker.cardId).name}（BP${blockerBp}）が${getCard(attacker.cardId).name}（BP${attackerBp}）をブロック！`,
    )

    // エンジェルボイス：バトル解決時、BPの代わりにLvを比較する（Lvが低い方が破壊される。同Lvは相打ち）
    const compareByLevel = state.battle.compareByLevel === true
    if (compareByLevel) {
        log(state, "バトル解決：BPの代わりにLvを比較する。")
    }
    // イマジンフィールド：バトル解決時、BPの代わりにコアの数を比較する（コアが少ない方が破壊される。同数は相打ち）
    const compareByCores = state.battle.compareByCores === true
    if (compareByCores) {
        log(state, "バトル解決：BPの代わりにコアの数を比較する。")
    }
    const attackerValue = compareByLevel ? currentLevel(attacker).level : compareByCores ? attacker.cores : attackerBp
    const blockerValue = compareByLevel ? currentLevel(blocker).level : compareByCores ? blocker.cores : blockerBp

    // ＞５：BP比較で勝敗（＝どちらが破壊されるか）が確定する。
    // 以後の＞６（破壊処理）で「フィールドに残る」が使われても、この判定は覆らない
    // （docs/design/TIMING_CHART.md §2。『BPを比べ相手のスピリットだけを破壊したとき』は
    // 敗者が生き残っても発揮する）
    const outcome: BattleOutcome =
        attackerValue > blockerValue
            ? "attackerWins"
            : attackerValue < blockerValue
              ? "blockerWins"
              : "mutual"
    if (outcome === "attackerWins") {
        // BPを比べ相手のスピリットだけを破壊：破壊直前のブロッカーのコア数・Lvを記録（魔界七将デストロードLv2／魔界伯爵ヴィールLv3）
        state.lastBattleDestroyedCores = blocker.cores
        state.lastBattleDestroyedLevel = blockerLevel
        state.lastBattleDestroyedColors = instColors(blocker)
        state.lastBattleDestroyedFamilies = [...getCard(blocker.cardId).family]
        // 破壊直前の実効BP（TargetFilter.sameBpAsBattleLoser。BS03熾烈極める最前線Lv2）
        state.lastBattleDestroyedBp = blockerBp
        // 破壊直前のコスト（action:"millPerLoserCost"。BS06名誉ある御前試合）
        state.lastBattleDestroyedCost = getCard(blocker.cardId).cost
    } else if (outcome === "blockerWins") {
        state.lastBattleDestroyedColors = instColors(attacker)
        state.lastBattleDestroyedFamilies = [...getCard(attacker.cardId).family]
        state.lastBattleDestroyedBp = attackerBp
        state.lastBattleDestroyedCost = getCard(attacker.cardId).cost
    }

    driveBattleResolution(state, {
        kind: "battleResolve",
        step: 1,
        attackerPid,
        attackerInstanceId: attacker.instanceId,
        blockerInstanceId: blocker.instanceId,
        outcome,
        attackerColors,
        blockerColors: instColors(blocker),
        attackerLevel,
        blockerLevel,
        attackerBp,
        blockerBp,
        // ＞６に入る直前の写し。破壊されると場から消えるが、『相手のスピリットに破壊されたとき』や
        // ログのカード名は破壊後にも参照する（destroySpirit と同じく、コア数は破壊直前の値）
        attackerSnapshot: { ...attacker, coresAtDestruction: attacker.cores },
        blockerSnapshot: { ...blocker, coresAtDestruction: blocker.cores },
    })
}

type BattleOutcome = "attackerWins" | "blockerWins" | "mutual"
type BattleResolveFrame = Extract<ResumeFrame, { kind: "battleResolve" }>

// バトル解決の最終ステップ番号（runBattleStep の switch と対応）
const BATTLE_LAST_STEP = 11

// ＞６（破壊処理）〜＞７（バトル終了宣言）を1ステップずつ進める。
// **1ステップ＝中断しうる呼び出し1つ**にしてあるので、選択待ちが立ったら
// 次のステップ番号を battleResolve フレームに載せて抜ければよい
// （続きは drainResumeStack が resumeBattleResolution 経由で回す）。
// docs/design/TIMING_CHART.md ／ docs/design/RESUME_STACK.md §7
function driveBattleResolution(state: GameState, frame: BattleResolveFrame): void {
    for (let step = frame.step; step <= BATTLE_LAST_STEP; step++) {
        runBattleStep(state, frame, step)
        if (state.pendingChoice) {
            pushResumeFrames(state, [{ ...frame, step: step + 1 }])
            return
        }
    }
}

// 中断されていたバトル解決の続き（drainResumeStack から呼ぶ）
export function resumeBattleResolution(state: GameState, frame: BattleResolveFrame): void {
    driveBattleResolution(state, frame)
}

// 【呪撃】をそのレベルで静的に持つか（一時付与は見ない）
function staticJugeki(cardId: string, level: number): boolean {
    return getCard(cardId).effects.some(
        (e) => e.kind === "keyword" && e.keyword === "jugeki" && effectActiveAtLevel(e.levels, level),
    )
}

// バトル解決の1ステップ。**中断（pendingChoice）は呼び出し元 driveBattleResolution が見る**ので、
// ここでは元の解決順にある `!state.winner` ガードだけを保つ
function runBattleStep(state: GameState, f: BattleResolveFrame, step: number): void {
    const attackerPid = f.attackerPid
    const defenderPid = opponentOf(attackerPid)
    // 破壊された個体は場から消えるので、生存していれば実体を、していなければ写しを使う
    const attacker =
        findSpirit(state.players[attackerPid], f.attackerInstanceId) ?? f.attackerSnapshot
    const blocker = findSpirit(state.players[defenderPid], f.blockerInstanceId) ?? f.blockerSnapshot
    const attackerContext: DestroyContext = {
        sourcePid: attackerPid,
        sourceType: "spirit",
        battle: {
            attackerColors: f.attackerColors,
            attackerLevel: f.attackerLevel,
            attackerBp: f.attackerBp,
        },
    }
    const blockerContext: DestroyContext = {
        sourcePid: defenderPid,
        sourceType: "spirit",
        battle: {
            attackerColors: f.blockerColors,
            attackerLevel: f.blockerLevel,
            attackerBp: f.blockerBp,
        },
    }

    switch (step) {
        // ＞６：破壊処理。相打ちは**同時破壊**なので1つのバッチにまとめる
        // （復活の確認が2体に出るなら、バッチがターンプレイヤーに順番を聞く。TIMING_CHART.md §0-3）。
        // 破壊元は対象ごとに違う（ブロッカーを破壊したのはアタッカー、その逆も同様）ため context も対象ごとに渡す
        case 1: {
            if (f.outcome === "attackerWins") {
                destroyTargetsBatch(state, attackerPid, [
                    { pid: defenderPid, instanceId: f.blockerInstanceId, context: attackerContext },
                ])
            } else if (f.outcome === "blockerWins") {
                destroyTargetsBatch(state, defenderPid, [
                    { pid: attackerPid, instanceId: f.attackerInstanceId, context: blockerContext },
                ])
            } else {
                destroyTargetsBatch(state, attackerPid, [
                    { pid: defenderPid, instanceId: f.blockerInstanceId, context: attackerContext },
                    { pid: attackerPid, instanceId: f.attackerInstanceId, context: blockerContext },
                ])
            }
            return
        }
        // 『このスピリットのバトル時』相手のスピリットに破壊されたとき（敗北側）。
        // destroySpirit（＝onDestroy誘発）の後に発火し、相打ちでは発火しない
        case 2: {
            if (state.winner) return
            if (f.outcome === "attackerWins") fireTrigger(state, defenderPid, blocker, "onBattleLose")
            else if (f.outcome === "blockerWins") fireTrigger(state, attackerPid, attacker, "onBattleLose")
            return
        }
        // 勝利側の『このスピリットのバトル時』（相打ちでは発火しない）
        case 3: {
            if (state.winner) return
            if (f.outcome === "attackerWins") {
                fireTrigger(state, attackerPid, attacker, "onBattleWin", "attacker")
            } else if (f.outcome === "blockerWins") {
                fireTrigger(state, defenderPid, blocker, "onBattleWin", "blocker")
            }
            return
        }
        // 勝利側フィールドのネクサス等による『BPを比べ相手のスピリットだけを破壊したとき』
        case 4: {
            if (state.winner) return
            if (f.outcome === "attackerWins") {
                fireBattleWonTriggers(state, attackerPid, attacker, "attacker")
            } else if (f.outcome === "blockerWins") {
                fireBattleWonTriggers(state, defenderPid, blocker, "blocker")
            }
            return
        }
        // ＞７：【呪撃】。アタッカーが現レベルで持つなら、ブロッカーが（BP比較の結果に関わらず）
        // まだフィールドにいる場合にバトル終了時に破壊する。ブロッカー側の呪撃は発動しない。
        // アタッカー自身がBP比較で破壊されていても発動する。
        // ＞６で「フィールドに残る」を使って生き残った個体もここでは対象になる（TIMING_CHART.md §2）
        case 5: {
            // BS06カウンターカース：【呪撃】の発揮タイミングを『ブロック時』へ**差し替える**。
            // 差し替えが効いている側はアタック時に発揮しなくなり、代わりにブロック時に発揮する
            const attackerJugekiReplaced = hasJugekiOnBlockReplace(state, attackerPid)
            if (!staticJugeki(attacker.cardId, f.attackerLevel) || attackerJugekiReplaced) return
            const stillOnField = findSpirit(state.players[defenderPid], f.blockerInstanceId)
            if (!stillOnField) return
            if (hasArmorAgainst(stillOnField, f.attackerColors)) {
                log(state, `${getCard(blocker.cardId).name}は装甲によって【呪撃】を防いだ。`)
                return
            }
            log(
                state,
                `${getCard(attacker.cardId).name}の【呪撃】：${getCard(blocker.cardId).name}を破壊した。`,
            )
            // 魔影街Lv1：破壊の直前に、そのスピリット上のコアをボイドへ（リザーブに戻らなくなる）
            applyJugekiCoreToVoid(state, attackerPid, defenderPid, stillOnField)
            destroyTargetsBatch(state, attackerPid, [
                {
                    pid: defenderPid,
                    instanceId: f.blockerInstanceId,
                    context: {
                        sourcePid: attackerPid,
                        sourceType: "spirit",
                        battle: { attackerColors: f.attackerColors, attackerLevel: f.attackerLevel },
                    },
                },
            ])
            return
        }
        // BS06カウンターカース：差し替えが効いている側では、**ブロッカー**の【呪撃】が
        // バトルした相手（＝アタッカー）をバトル終了時に破壊する
        case 6: {
            if (!hasJugekiOnBlockReplace(state, defenderPid)) return
            if (!staticJugeki(blocker.cardId, f.blockerLevel)) return
            const attackerStill = findSpirit(state.players[attackerPid], f.attackerInstanceId)
            if (!attackerStill) return
            if (hasArmorAgainst(attackerStill, f.blockerColors)) {
                log(state, `${getCard(attacker.cardId).name}は装甲によって【呪撃】を防いだ。`)
                return
            }
            log(
                state,
                `${getCard(blocker.cardId).name}の【呪撃】（ブロック時）：${getCard(attacker.cardId).name}を破壊した。`,
            )
            applyJugekiCoreToVoid(state, defenderPid, attackerPid, attackerStill)
            destroyTargetsBatch(state, defenderPid, [
                {
                    pid: attackerPid,
                    instanceId: f.attackerInstanceId,
                    context: {
                        sourcePid: defenderPid,
                        sourceType: "spirit",
                        battle: { attackerColors: f.blockerColors, attackerLevel: f.blockerLevel },
                    },
                },
            ])
            return
        }
        // onBattleEnd 誘発：バトル参加者（アタッカー・ブロッカー）のうち、まだフィールドに
        // 生存している個体それぞれに発火する（コリスタル：ブロックされても生き残れば自壊する）
        case 7: {
            const survivingAttacker = findSpirit(state.players[attackerPid], f.attackerInstanceId)
            if (survivingAttacker) fireTrigger(state, attackerPid, survivingAttacker, "onBattleEnd")
            return
        }
        case 8: {
            if (state.winner) return
            const survivingBlocker = findSpirit(state.players[defenderPid], f.blockerInstanceId)
            if (survivingBlocker) fireTrigger(state, defenderPid, survivingBlocker, "onBattleEnd")
            return
        }
        case 9: {
            resolveKoboOnBattleEnd(state, attackerPid, attacker)
            return
        }
        // 星降る巡礼地Lv2：自分のスピリットの【光芒】は『ブロック時』にも発揮される。
        // ブロッカー側の使用マジックを、ブロッカーの持ち主基準でもう一度解決する
        case 10: {
            if (hasKoboOnBlock(state, defenderPid)) {
                resolveKoboOnBattleEnd(state, defenderPid, blocker)
            }
            return
        }
        case 11: {
            clearBattle(state)
            return
        }
    }
}
