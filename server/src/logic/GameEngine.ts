// 召喚/アタック等のアクション実行とイベント発火の統括
import type { CardInstance, DestroyContext, EffectAction, GameAction, GameState, PaySource, PlayerId } from "../type"
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
    minLevelCores,
    opponentOf,
} from "./GameState"
import { endTurn, resumeTurnStart, toAttackPhase } from "./PhaseManager"
import { AWAKEN_FROM_RESERVE } from "../../../shared/rules"
import {
    activeConstraints,
    checkExhaustOnCoreChange,
    destroySpirit,
    effectActiveAtLevel,
    effectiveBp,
    emitEvent,
    fireBattleWonTriggers,
    fireFieldEventTriggers,
    fireTrigger,
    hasArmorAgainst,
    hasFunsaiOnBlock,
    hasLifeDamageNegate,
    instanceSymbolCount,
    instColors,
    millDeck,
    refreshLevelAsOverrides,
    resolveAction,
    resolveFunsai,
    resolveKoboOnBattleEnd,
    resolveMagic,
    resolveTensho,
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
    const result = dispatchAction(state, pid, action)
    // バトルがどの経路（解決・ライフ受け・endBattle 効果）で終了しても、
    // サイレントウォールの遅延効果（アタックステップ終了）を一元的に処理する
    forceEndTurnIfFlagged(state)
    // 継続的なレベル置換（levelAs）をアクション実行の事後フックとして再計算する
    // （召喚・破壊等でフィールドのスピリット数が変わるたびにジャグリーンの条件を反映するため）
    if (!state.winner) refreshLevelAsOverrides(state)
    return result
}

function dispatchAction(
    state: GameState,
    pid: PlayerId,
    action: GameAction,
): string | null {
    // 効果解決中のプレイヤー選択待ちは resolveChoice 以外のアクションをすべて拒否する
    if (state.pendingChoice && action.type !== "resolveChoice") {
        return "対象の選択待ちです"
    }
    switch (action.type) {
        case "summon":
            return doSummon(state, pid, action.handIndex, action.paySources, action.level)
        case "setNexus":
            return doSetNexus(state, pid, action.handIndex, action.paySources, action.level)
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
            if (inst && inst.cores < minLevelCores(getCard(inst.cardId))) {
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

function doSummon(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    paySources?: PaySource[],
    level?: number,
): string | null {
    const error = validateSummon(state, pid, handIndex, paySources, level)
    if (error) return error

    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const cost = effectiveCost(state, pid, card)
    // レベル指定があればそのレベルぶんのコアを置いて召喚する（省略時はLv1）。
    // 召喚時効果はコア配置後に発火するため、Lv2以上を指定すればそのレベルの効果が発揮される
    const maintain = level === undefined ? minLevelCores(card) : (coresForLevel(card, level) ?? minLevelCores(card))

    // 置くコアもフィールドのコアで賄える（賄えなかった分だけリザーブから出す）
    const placedFromField = payCost(state, pid, cost, paySources, maintain)
    player.reserve -= maintain - placedFromField
    player.hand.splice(handIndex, 1)

    const inst = createInstance(cardId, state.turn, maintain)
    player.field.spirits.push(inst)
    const flashNote = state.isFlashTiming ? "【神速】で" : ""
    const levelNote = level !== undefined && level > 1 ? `Lv${level}で` : ""
    log(state, `${player.name}は${flashNote}${card.name}を${levelNote}召喚した。（コスト${cost}）`)
    emitEvent(state, { type: "summon", pid, cardName: card.name })

    fireTrigger(state, pid, inst, "onSummon")
    // 【転召】：召喚コスト支払い後、対象がいれば上のコアすべてをdestへ（勝敗決定後や消滅後の重複解決を避けるためwinner未確定時のみ）
    if (!state.winner) resolveTensho(state, pid, inst)
    // フィールドからの「自分のスピリットが召喚されたとき」誘発（七龍帝の玉座Lv2／鋼葉の樹林Lv2）。
    // self には召喚されたスピリットを渡す（maxBpFromSelf が「召喚されたスピリットのBP以下」を参照するため）。
    // 転召でコアが尽きて消滅した場合は発火させない
    const stillOnField = player.field.spirits.some((s) => s.instanceId === inst.instanceId)
    if (!state.winner && stillOnField) {
        fireFieldEventTriggers(
            state,
            pid,
            "ownSpiritSummoned",
            { pid, inst },
            undefined,
            undefined,
            undefined,
            { families: card.family },
        )
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
): string | null {
    const error = validateSetNexus(state, pid, handIndex, paySources, level)
    if (error) return error

    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const cost = effectiveCost(state, pid, card)
    // レベル指定があればそのレベルぶんのコアを置いて配置する（省略時はLv1。ネクサスのLv1は0コアが多い）
    const maintain = level === undefined ? minLevelCores(card) : (coresForLevel(card, level) ?? minLevelCores(card))

    // 置くコアもフィールドのコアで賄える（賄えなかった分だけリザーブから出す）
    const placedFromField = payCost(state, pid, cost, paySources, maintain)
    player.reserve -= maintain - placedFromField
    player.hand.splice(handIndex, 1)

    player.field.nexuses.push(createInstance(cardId, state.turn, maintain))
    const levelNote = level !== undefined && level > 1 ? `Lv${level}で` : ""
    log(state, `${player.name}は${card.name}を${levelNote}配置した。（コスト${cost}）`)
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
    } else {
        player.hand.splice(handIndex, 1)
    }
    player.trashCards.push(cardId)
    log(state, `${player.name}は${card.name}を使用した。（コスト${cost}）`)
    // このターンのマジック使用回数を加算（作戦参謀フォクシンのoncePerTurnAll判定用）
    state.magicUsedThisTurn[pid] = (state.magicUsedThisTurn[pid] ?? 0) + 1

    // 使用タイミングに応じた効果を実行。メインステップでメイン効果がなければフラッシュ効果を使う。
    if (state.battle) {
        resolveMagic(state, pid, cardId, "flash", targetInstanceId)
        // フラッシュで使用したら優先権を相手へ移し、再応答の機会を与える
        passFlashPriority(state, pid)
    } else {
        const hasMain = card.effects.some(
            (e) => e.kind === "magic" && e.timing === "main",
        )
        resolveMagic(state, pid, cardId, hasMain ? "main" : "flash", targetInstanceId)
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
    const inst = findSpirit(player, instanceId)
    if (!inst) return "対象のスピリットが見つかりません"

    if (direction === "add") {
        player.reserve -= 1
        inst.cores += 1
        checkExhaustOnCoreChange(state, pid, inst)
    } else {
        inst.cores -= 1
        player.reserve += 1
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
    if (from.cores < minLevelCores(getCard(from.cardId))) {
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

    fireTrigger(state, pid, inst, "onAttack")

    // 【粉砕】：アタック時、相手のデッキを上からこのスピリットのLvと同じ枚数破棄する
    // （funsaiBonus・ownFunsaiMilled誘発の共通処理はresolveFunsaiに集約）
    if (!state.winner) resolveFunsai(state, pid, inst)

    // フィールドイベント誘発「スピリットがアタックを宣言したとき」（魔帝の墓標Lv2）。
    // 発生源の持ち主に関わらずアタックしたスピリットに作用させるため、
    // 両プレイヤーのフィールドから selfOverride（アタッカー）付きで発火する
    if (!state.winner) {
        fireFieldEventTriggers(state, pid, "anySpiritAttacked", { pid, inst }, instColors(inst), undefined, undefined, {
            cost: getCard(inst.cardId).cost,
        })
    }
    if (!state.winner) {
        // アタックしたスピリットのコストを渡す（costFilter で絞る効果のため。BS04鎧装獣ヘイズ・ルーン）
        fireFieldEventTriggers(state, opponentOf(pid), "anySpiritAttacked", { pid, inst }, instColors(inst), undefined, undefined, {
            cost: getCard(inst.cardId).cost,
        })
    }
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
    if (attacker) {
        fireFieldEventTriggers(
            state,
            attackerPid,
            "ownSpiritBlocked",
            undefined,
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

function doTakeLife(state: GameState, pid: PlayerId): string | null {
    const error = validateTakeLife(state, pid)
    if (error) return error
    if (!state.battle) return "バトルが発生していません"

    const attackerPid = state.turnPlayer
    const attacker = findSpirit(
        state.players[attackerPid],
        state.battle.attackerInstanceId,
    )
    const defender = state.players[pid]

    // 硝子の女神フレイア等：ブロックされなかったアタッカーの実効BPが発生源の実効BP以下のとき、
    // ライフダメージそのものを打ち消す（emitEvent "lifeDamage" もfireTrigger onLifeDealtも発火しない）
    // ミストカーテン：指定されたアタッカーのアタックでは、このターン使用者のライフが減らない
    if (attacker && attacker.lifeDamageNegatedFor === pid) {
        log(
            state,
            `${defender.name}は${getCard(attacker.cardId).name}のアタックによるライフダメージを受けなかった（効果）。`,
        )
        resolveKoboOnBattleEnd(state, attackerPid, attacker)
        clearBattle(state)
        return null
    }
    if (attacker && hasLifeDamageNegate(state, pid, attackerPid, attacker)) {
        log(
            state,
            `${defender.name}は${getCard(attacker.cardId).name}のアタックによるライフダメージを受けなかった（効果）。`,
        )
        resolveKoboOnBattleEnd(state, attackerPid, attacker)
        clearBattle(state)
        return null
    }

    // ダメージ = アタックスピリットのシンボル数（instanceSymbolCount。tempExtraSymbols＝ダブルハート等も加味）。
    // ライフのコアは通常リザーブへ、ただしアタッカーが lifeDamageToVoid をレベル有効で持つ場合はボイドへ（スライミーLv3）
    const damage = attacker ? instanceSymbolCount(attacker) : 1
    const dealt = Math.min(damage, defender.life)
    const toVoid =
        attacker !== undefined &&
        activeConstraints(state, attackerPid, attacker).some((c) => c.type === "lifeDamageToVoid")
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
    if (dealt > 0) emitEvent(state, { type: "lifeDamage", pid, amount: dealt })

    if (defender.life <= 0) {
        state.winner = attackerPid
        log(state, `${state.players[attackerPid].name}の勝利！`)
    } else if (dealt > 0) {
        // フィールドイベント誘発「相手によって自分のライフが減らされたとき」（命の果実）。
        // ライフ0で敗北が決まった場合は発火しない
        fireFieldEventTriggers(state, pid, "ownLifeDamaged")
    }
    // トリガー誘発「このスピリットのアタックによって相手のライフを減らしたとき」（老賢樹トレントン）。
    // アタッカー側で発火。勝敗が決まっていても発火して問題ない（コア獲得のみのため）
    if (dealt > 0 && attacker) {
        fireTrigger(state, attackerPid, attacker, "onLifeDealt")
    }

    resolveKoboOnBattleEnd(state, attackerPid, attacker)
    clearBattle(state)
    return null
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

    // コスト支払い（リザーブからトラッシュへ）
    const n = effect.cost.reserveToTrash
    player.reserve -= n
    player.trashCores += n
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}の効果を発動した。（リザーブのコア${n}個をトラッシュ）`,
    )

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

    if (pending.kind === "option") {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        if (option === undefined && !pending.optional) {
            return "選択肢を選んでください"
        }
        state.pendingChoice = null
        const self = pending.selfInstanceId ? findInstanceAnywhere(state, pending.selfInstanceId) ?? null : null
        if (option !== undefined) {
            resolveAction(state, pending.pid, self, pending.action, undefined, undefined, undefined, option)
        } else {
            log(state, `${self ? getCard(self.cardId).name : "効果"}：選択しなかった。`)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid, pending.queue)
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
            resolveAction(state, pending.pid, self, pending.action, undefined, undefined, undefined, undefined, cardIndex)
        } else {
            log(state, `${self ? getCard(self.cardId).name : "効果"}：選択しなかった。`)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid, pending.queue)
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
        resolveAction(state, pending.pid, self, pending.action, instanceId)
    } else {
        log(state, `${self ? getCard(self.cardId).name : "効果"}：対象を選ばなかった。`)
    }
    if (state.winner) return null
    return finishChoiceResolution(state, pending.pid, pending.queue)
}

// 選択解決後の共通後処理：queue を消化し、消化しきって新たな選択待ちも無く勝敗も未決なら、
// ステップ誘発の pendingChoice で中断していたターン開始処理を続きのステップから再開する
// （百識の谷Lv1のドローステップ破棄選択など。中断していなければ resumeTurnStart は no-op）。
function finishChoiceResolution(
    state: GameState,
    pid: PlayerId,
    queue: { selfInstanceId: string | null; action: EffectAction }[],
): string | null {
    drainChoiceQueue(state, pid, queue)
    if (!state.pendingChoice && !state.winner) {
        resumeTurnStart(state)
    }
    return null
}

// 退避したqueue（同一トリガー内の残りの誘発）を先頭から順に消化する。
// 途中で新しいpendingChoiceが立ったら残りをそちらのqueueに積んで中断する（同じ中断パターンの繰り返し）。
function drainChoiceQueue(
    state: GameState,
    pid: PlayerId,
    queue: { selfInstanceId: string | null; action: EffectAction }[],
): string | null {
    for (let i = 0; i < queue.length; i++) {
        const item = queue[i]
        if (!item) continue
        const itemSelf = item.selfInstanceId ? findInstanceAnywhere(state, item.selfInstanceId) ?? null : null
        resolveAction(state, pid, itemSelf, item.action)
        if (state.winner) return null
        const newPending = state.pendingChoice as GameState["pendingChoice"]
        if (newPending) {
            newPending.queue.push(...queue.slice(i + 1))
            return null
        }
    }
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
        if (state.battle && state.battle.blockerInstanceId) {
            // ブロック後のフラッシュ終了 → バトルを解決する
            resolveBattle(state)
        }
        // ブロック未宣言なら isFlashTiming を下ろすのみ（防御側の block/takeLife 待ち）
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

    // 【noRestWhenBlockingColor】：アタッカーの色が一致する場合、ブロッカーは疲労しない（巨神機トール）
    const attackerColors = instColors(attacker)
    const skipRest = activeConstraints(state, defenderPid, blocker).some(
        (c) => c.type === "noRestWhenBlockingColor" && attackerColors.includes(c.color),
    )
    if (!skipRest) blocker.isRested = true
    const attackerBp = effectiveBp(state, attackerPid, attacker)
    const blockerBp = effectiveBp(state, defenderPid, blocker)
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
    const attackerValue = compareByLevel ? currentLevel(attacker).level : attackerBp
    const blockerValue = compareByLevel ? currentLevel(blocker).level : blockerBp

    if (attackerValue > blockerValue) {
        // BPを比べ相手のスピリットだけを破壊：破壊直前のブロッカーのコア数・Lvを記録（魔界七将デストロードLv2／魔界伯爵ヴィールLv3）
        state.lastBattleDestroyedCores = blocker.cores
        state.lastBattleDestroyedLevel = blockerLevel
        state.lastBattleDestroyedColors = instColors(blocker)
        state.lastBattleDestroyedFamilies = [...getCard(blocker.cardId).family]
        destroySpirit(state, defenderPid, blocker.instanceId, "destroy", {
            sourcePid: attackerPid,
            sourceType: "spirit",
            battle: { attackerColors, attackerLevel },
        })
        fireTrigger(state, attackerPid, attacker, "onBattle", "attacker") // アタッカー勝利
        if (!state.winner) fireBattleWonTriggers(state, attackerPid, attacker, "attacker")
    } else if (attackerValue < blockerValue) {
        state.lastBattleDestroyedColors = instColors(attacker)
        state.lastBattleDestroyedFamilies = [...getCard(attacker.cardId).family]
        destroySpirit(state, attackerPid, attacker.instanceId, "destroy", {
            sourcePid: defenderPid,
            sourceType: "spirit",
            battle: { attackerColors: instColors(blocker), attackerLevel: blockerLevel },
        })
        fireTrigger(state, defenderPid, blocker, "onBattle", "blocker") // ブロッカー勝利
        if (!state.winner) fireBattleWonTriggers(state, defenderPid, blocker, "blocker")
    } else {
        destroySpirit(state, defenderPid, blocker.instanceId, "destroy", {
            sourcePid: attackerPid,
            sourceType: "spirit",
            battle: { attackerColors, attackerLevel },
        })
        destroySpirit(state, attackerPid, attacker.instanceId, "destroy", {
            sourcePid: defenderPid,
            sourceType: "spirit",
            battle: { attackerColors: instColors(blocker), attackerLevel: blockerLevel },
        })
    }

    // 【呪撃】：アタッカーが現レベルで持つなら、ブロッカーが（BP比較の結果に関わらず）
    // まだフィールドにいる場合にバトル終了時に破壊する。ブロッカー側の呪撃は発動しない。
    // アタッカー自身がBP比較で破壊されていても発動する（attacker/blocker はローカル参照のため
    // destroySpirit 後も cardId・cores は読み取れる）。
    const hasJugeki = getCard(attacker.cardId).effects.some(
        (e) =>
            e.kind === "keyword" &&
            e.keyword === "jugeki" &&
            effectActiveAtLevel(e.levels, attackerLevel),
    )
    if (hasJugeki) {
        const stillOnField = findSpirit(state.players[defenderPid], blocker.instanceId)
        if (stillOnField) {
            if (hasArmorAgainst(stillOnField, attackerColors)) {
                log(
                    state,
                    `${getCard(blocker.cardId).name}は装甲によって【呪撃】を防いだ。`,
                )
            } else {
                log(
                    state,
                    `${getCard(attacker.cardId).name}の【呪撃】：${getCard(blocker.cardId).name}を破壊した。`,
                )
                destroySpirit(state, defenderPid, blocker.instanceId, "destroy", {
                    sourcePid: attackerPid,
                    sourceType: "spirit",
                    battle: { attackerColors, attackerLevel },
                })
            }
        }
    }

    // onBattleEnd 誘発：バトル参加者（アタッカー・ブロッカー）のうち、まだフィールドに
    // 生存している個体それぞれに発火する（コリスタル：ブロックされても生き残れば自壊する）
    const survivingAttacker = findSpirit(state.players[attackerPid], attacker.instanceId)
    if (survivingAttacker) fireTrigger(state, attackerPid, survivingAttacker, "onBattleEnd")
    if (!state.winner) {
        const survivingBlocker = findSpirit(state.players[defenderPid], blocker.instanceId)
        if (survivingBlocker) fireTrigger(state, defenderPid, survivingBlocker, "onBattleEnd")
    }

    resolveKoboOnBattleEnd(state, attackerPid, attacker)
    clearBattle(state)
}
