// 召喚/アタック等のアクション実行とイベント発火の統括
import type { GameAction, GameState, PaySource, PlayerId } from "../type"
import {
    clearBattle,
    createInstance,
    currentLevel,
    findSpirit,
    getCard,
    log,
    lv1Cores,
    opponentOf,
} from "./GameState"
import { endTurn, toAttackPhase } from "./PhaseManager"
import {
    activeConstraints,
    destroySpirit,
    effectActiveAtLevel,
    effectiveBp,
    fireBattleWonTriggers,
    fireFieldEventTriggers,
    fireTrigger,
    hasArmorAgainst,
    refreshLevelAsOverrides,
    resolveAction,
    resolveMagic,
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
    switch (action.type) {
        case "summon":
            return doSummon(state, pid, action.handIndex, action.paySources)
        case "setNexus":
            return doSetNexus(state, pid, action.handIndex, action.paySources)
        case "castMagic":
            return doCastMagic(state, pid, action.handIndex, action.targetInstanceId, action.paySources)
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

// コストを支払う（指定があればスピリット上のコア→トラッシュ、残りはリザーブ→トラッシュ）。
// 支払い後、維持コア（Lv1）を下回った支払い元スピリットは消滅する。
function payCost(
    state: GameState,
    pid: PlayerId,
    cost: number,
    paySources?: PaySource[],
): void {
    const player = state.players[pid]
    let paidFromSpirits = 0
    if (paySources && paySources.length > 0) {
        for (const src of paySources) {
            const inst = findSpirit(player, src.instanceId)
            if (!inst) continue
            const paid = Math.min(src.count, inst.cores)
            inst.cores -= paid
            player.trashCores += paid
            paidFromSpirits += paid
        }
    }
    const remaining = cost - paidFromSpirits
    player.reserve -= remaining
    player.trashCores += remaining
    if (paidFromSpirits > 0) {
        log(state, `${player.name}はスピリット上のコア${paidFromSpirits}個を含めてコストを支払った。`)
    }
    // 全支払い完了後、支払い元スピリットが維持コア（Lv1）を下回っていたら消滅させる
    if (paySources) {
        for (const src of paySources) {
            const inst = findSpirit(player, src.instanceId)
            if (inst && inst.cores < lv1Cores(getCard(inst.cardId))) {
                destroySpirit(state, pid, inst.instanceId, "deplete")
            }
        }
    }
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
): string | null {
    const error = validateSummon(state, pid, handIndex, paySources)
    if (error) return error

    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const cost = effectiveCost(state, pid, card)
    const maintain = lv1Cores(card)

    payCost(state, pid, cost, paySources)
    player.reserve -= maintain // 維持コアはリザーブから直接スピリットへ
    player.hand.splice(handIndex, 1)

    const inst = createInstance(cardId, state.turn, maintain)
    player.field.spirits.push(inst)
    const flashNote = state.isFlashTiming ? "【神速】で" : ""
    log(state, `${player.name}は${flashNote}${card.name}を召喚した。（コスト${cost}）`)

    fireTrigger(state, pid, inst, "onSummon")
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
): string | null {
    const error = validateSetNexus(state, pid, handIndex, paySources)
    if (error) return error

    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const cost = effectiveCost(state, pid, card)
    const maintain = lv1Cores(card)

    payCost(state, pid, cost, paySources)
    player.reserve -= maintain
    player.hand.splice(handIndex, 1)

    player.field.nexuses.push(createInstance(cardId, state.turn, maintain))
    log(state, `${player.name}は${card.name}を配置した。（コスト${cost}）`)
    return null
}

function doCastMagic(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    targetInstanceId?: string,
    paySources?: PaySource[],
): string | null {
    const error = validateCastMagic(state, pid, handIndex, targetInstanceId, paySources)
    if (error) return error

    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const cost = effectiveCost(state, pid, card)

    payCost(state, pid, cost, paySources)
    player.hand.splice(handIndex, 1)
    player.trashCards.push(cardId)
    log(state, `${player.name}は${card.name}を使用した。（コスト${cost}）`)

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
    const from = findSpirit(player, fromInstanceId)
    if (!target || !from) return "対象のスピリットが見つかりません"

    from.cores -= count
    target.cores += count
    log(
        state,
        `【覚醒】${player.name}は${getCard(from.cardId).name}から${getCard(target.cardId).name}へコア${count}個を移した。`,
    )
    // 移動元が維持コア（Lv1）を下回ったら消滅
    if (from.cores < lv1Cores(getCard(from.cardId))) {
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

    fireTrigger(state, pid, inst, "onAttack")

    // フィールドイベント誘発「スピリットがアタックを宣言したとき」（魔帝の墓標Lv2）。
    // 発生源の持ち主に関わらずアタックしたスピリットに作用させるため、
    // 両プレイヤーのフィールドから selfOverride（アタッカー）付きで発火する
    if (!state.winner) {
        fireFieldEventTriggers(state, pid, "anySpiritAttacked", { pid, inst })
    }
    if (!state.winner) {
        fireFieldEventTriggers(state, opponentOf(pid), "anySpiritAttacked", { pid, inst })
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
    // ブロック時効果
    if (blocker) fireTrigger(state, pid, blocker, "onBlock")
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
            getCard(attacker.cardId).color,
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

    // ダメージ = アタックスピリットのシンボル数。ライフのコアは通常リザーブへ、
    // ただしアタッカーが lifeDamageToVoid をレベル有効で持つ場合はボイドへ（スライミーLv3）
    const damage = attacker ? getCard(attacker.cardId).symbol.length : 1
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

    // 【noRestWhenBlockingColor】：アタッカーの色が一致する場合、ブロッカーは疲労しない（巨神機トール）
    const attackerColor = getCard(attacker.cardId).color
    const skipRest = activeConstraints(state, defenderPid, blocker).some(
        (c) => c.type === "noRestWhenBlockingColor" && c.color === attackerColor,
    )
    if (!skipRest) blocker.isRested = true
    const attackerBp = effectiveBp(state, attackerPid, attacker)
    const blockerBp = effectiveBp(state, defenderPid, blocker)

    log(
        state,
        `${getCard(blocker.cardId).name}（BP${blockerBp}）が${getCard(attacker.cardId).name}（BP${attackerBp}）をブロック！`,
    )

    if (attackerBp > blockerBp) {
        // BPを比べ相手のスピリットだけを破壊：破壊直前のブロッカーのコア数を記録（魔界七将デストロードLv2）
        state.lastBattleDestroyedCores = blocker.cores
        destroySpirit(state, defenderPid, blocker.instanceId)
        fireTrigger(state, attackerPid, attacker, "onBattle", "attacker") // アタッカー勝利
        if (!state.winner) fireBattleWonTriggers(state, attackerPid, attacker, "attacker")
    } else if (attackerBp < blockerBp) {
        destroySpirit(state, attackerPid, attacker.instanceId)
        fireTrigger(state, defenderPid, blocker, "onBattle", "blocker") // ブロッカー勝利
        if (!state.winner) fireBattleWonTriggers(state, defenderPid, blocker, "blocker")
    } else {
        destroySpirit(state, defenderPid, blocker.instanceId)
        destroySpirit(state, attackerPid, attacker.instanceId)
    }

    // 【呪撃】：アタッカーが現レベルで持つなら、ブロッカーが（BP比較の結果に関わらず）
    // まだフィールドにいる場合にバトル終了時に破壊する。ブロッカー側の呪撃は発動しない。
    // アタッカー自身がBP比較で破壊されていても発動する（attacker/blocker はローカル参照のため
    // destroySpirit 後も cardId・cores は読み取れる）。
    const attackerLevel = currentLevel(attacker).level
    const hasJugeki = getCard(attacker.cardId).effects.some(
        (e) =>
            e.kind === "keyword" &&
            e.keyword === "jugeki" &&
            effectActiveAtLevel(e.levels, attackerLevel),
    )
    if (hasJugeki) {
        const stillOnField = findSpirit(state.players[defenderPid], blocker.instanceId)
        if (stillOnField) {
            if (hasArmorAgainst(stillOnField, attackerColor)) {
                log(
                    state,
                    `${getCard(blocker.cardId).name}は装甲によって【呪撃】を防いだ。`,
                )
            } else {
                log(
                    state,
                    `${getCard(attacker.cardId).name}の【呪撃】：${getCard(blocker.cardId).name}を破壊した。`,
                )
                destroySpirit(state, defenderPid, blocker.instanceId)
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

    clearBattle(state)
}
