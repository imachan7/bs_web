// 行動可否判定（召喚条件、コスト支払い可否など）
// 各関数はエラー理由の文字列を返し、問題なければ null を返す
import type { CardData, GameState, PaySource, PlayerId } from "../type"
import {
    countSymbols,
    currentLevel,
    findSpirit,
    getCard,
    lv1Cores,
    opponentOf,
} from "./GameState"
import {
    activeConstraints,
    effectActiveAtLevel,
    effectiveBp,
    hasGlobalConstraint,
    hasKeyword,
    isUntargetableByOpponent,
    KEYWORDS,
} from "./EffectModules"
import { COLOR_LABELS } from "../../../data/constants"

// コスト修正（kind: "costMod"）の合計を求める。両プレイヤーのフィールド（スピリット＋ネクサス）を
// 走査し、レベル有効な costMod のうち card.color が colorFilter と一致するものの amount を合計する
// （ルビーの太陽：「すべての白のカードは使用時+1コスト」＝発生源・対象カードの持ち主を問わず両陣営に効く）
function costModTotal(state: GameState, card: CardData): number {
    let total = 0
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        const sources = [...player.field.spirits, ...player.field.nexuses]
        for (const source of sources) {
            const sourceLevel = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "costMod") continue
                if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
                if (card.color !== effect.colorFilter) continue
                total += effect.amount
            }
        }
    }
    return total
}

// 軽減後の実コスト（フィールドの一致シンボル数だけ軽減、軽減シンボル数が上限）に
// costMod（例: ルビーの太陽の白カード+1コスト）を加算した実コスト
export function effectiveCost(
    state: GameState,
    pid: PlayerId,
    card: CardData,
): number {
    const symbols = countSymbols(state.players[pid], card.reduction)
    const reduction = Math.min(card.reduction.length, symbols)
    const base = Math.max(card.cost - reduction, 0)
    return base + costModTotal(state, card)
}

function checkMainTiming(state: GameState, pid: PlayerId): string | null {
    if (state.turnPlayer !== pid) return "自分のターンではありません"
    if (state.phase !== "main") return "メインステップではありません"
    if (state.battle) return "バトル中は使用できません"
    return null
}

// コスト支払いの妥当性を検証する（スピリット上のコアを併用する場合）。
// paySources 未指定・空配列なら従来通りリザーブのみで cost を賄えるか検証する。
function validatePaySources(
    state: GameState,
    pid: PlayerId,
    cost: number,
    paySources: PaySource[] | undefined,
): string | null {
    const player = state.players[pid]
    if (!paySources || paySources.length === 0) {
        if (player.reserve < cost) return "コアが足りません"
        return null
    }
    const seen = new Set<string>()
    let total = 0
    for (const src of paySources) {
        if (seen.has(src.instanceId)) return "支払い元のスピリットが重複しています"
        seen.add(src.instanceId)
        const inst = findSpirit(player, src.instanceId)
        if (!inst) return "支払い元のスピリットが見つかりません"
        if (src.count < 1) return "支払うコア数が不正です"
        if (src.count > inst.cores) return "支払い元のコアが足りません"
        total += src.count
    }
    if (total > cost) return "コストを超えてコアを支払うことはできません"
    if (player.reserve < cost - total) return "コアが足りません"
    return null
}

// paySources の合計を求める（他の検証・召喚コスト計算で使い回す）
function paySourcesTotal(paySources: PaySource[] | undefined): number {
    return (paySources ?? []).reduce((sum, s) => sum + s.count, 0)
}

export function validateSummon(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    paySources?: PaySource[],
): string | null {
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    if (card.type !== "spirit") return "スピリットカードではありません"

    // 神速：フラッシュタイミングなら手札から召喚できる（自分・相手ターン問わず）
    const flashSummon = state.isFlashTiming && hasKeyword(cardId, "soku")
    if (!flashSummon) {
        const timing = checkMainTiming(state, pid)
        if (timing) return timing
    } else {
        // フラッシュ中の神速召喚は優先権を持つプレイヤーのみ
        if (pid !== state.priorityPlayer) return "現在フラッシュの優先権がありません"
        // lockFlash 適用中は手札のカード（神速召喚も含む）を使用できない
        if (state.battle?.flashLockedPlayer === pid) {
            return "このバトルの間、フラッシュで手札のカードを使用できません"
        }
    }

    const cost = effectiveCost(state, pid, card)
    const maintain = lv1Cores(card)
    const payError = validatePaySources(state, pid, cost, paySources)
    if (payError) return payError
    // 維持コアは必ずリザーブから払うため、コアで賄えなかった分+維持コアがリザーブに残っているか検証
    const total = paySourcesTotal(paySources)
    if (player.reserve < cost - total + maintain) {
        return `コアが足りません（コスト+維持コアで${cost + maintain}個必要）`
    }
    return null
}

export function validateSetNexus(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    paySources?: PaySource[],
): string | null {
    const timing = checkMainTiming(state, pid)
    if (timing) return timing
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    if (card.type !== "nexus") return "ネクサスカードではありません"

    const cost = effectiveCost(state, pid, card)
    const maintain = lv1Cores(card)
    const payError = validatePaySources(state, pid, cost, paySources)
    if (payError) return payError
    const total = paySourcesTotal(paySources)
    if (player.reserve < cost - total + maintain) {
        return `コアが足りません（コスト+維持コアで${cost + maintain}個必要）`
    }
    return null
}

export function validateCastMagic(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    targetInstanceId?: string,
    paySources?: PaySource[],
): string | null {
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    if (card.type !== "magic") return "マジックカードではありません"

    // 対象指定がある場合、両プレイヤーのフィールドに該当スピリットが存在するか検証
    if (targetInstanceId !== undefined) {
        const exists =
            findSpirit(state.players[pid], targetInstanceId) !== undefined ||
            findSpirit(state.players[opponentOf(pid)], targetInstanceId) !==
                undefined
        if (!exists) return "対象のスピリットが見つかりません"
        // 相手スピリットが免疫（ワルキューレ／フェザーバリア）なら対象にできない
        const enemyTarget = findSpirit(
            state.players[opponentOf(pid)],
            targetInstanceId,
        )
        if (enemyTarget && isUntargetableByOpponent(enemyTarget)) {
            return "このスピリットは効果の対象にできません"
        }
    }

    if (state.battle) {
        // バトル中のフラッシュ：優先権を持つプレイヤーのみ（攻撃側も優先権があれば使用可）
        if (!state.isFlashTiming) return "フラッシュタイミングは終了しています"
        if (pid !== state.priorityPlayer) return "現在フラッシュの優先権がありません"
        if (!card.flash) return "このマジックはフラッシュタイミングで使用できません"
        // lockFlash 適用中はフラッシュで手札のカードを使用できない
        if (state.battle.flashLockedPlayer === pid) {
            return "このバトルの間、フラッシュで手札のカードを使用できません"
        }
    } else {
        const timing = checkMainTiming(state, pid)
        if (timing) return timing
    }

    const payError = validatePaySources(state, pid, effectiveCost(state, pid, card), paySources)
    if (payError) return payError
    return null
}

export function validateMoveCore(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    direction: "add" | "remove",
): string | null {
    const timing = checkMainTiming(state, pid)
    if (timing) return timing
    const player = state.players[pid]
    const inst = findSpirit(player, instanceId)
    if (!inst) return "対象のスピリットが見つかりません"
    if (direction === "add") {
        if (player.reserve < 1) return "リザーブにコアがありません"
    } else {
        const need = lv1Cores(getCard(inst.cardId))
        if (inst.cores - 1 < need) {
            return "維持コア（Lv1）を下回るためコアを取り除けません"
        }
    }
    return null
}

// 覚醒：フラッシュタイミングで、自分のスピリットのコアを覚醒持ちへ移す
export function validateAwaken(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    fromInstanceId: string,
    count: number,
): string | null {
    if (!state.isFlashTiming) return "フラッシュタイミングではありません"
    // バトル中のフラッシュ：優先権を持つプレイヤーのみ（castMagic・神速召喚と同じ扱い）
    if (state.battle && pid !== state.priorityPlayer) {
        return "現在フラッシュの優先権がありません"
    }
    const player = state.players[pid]
    const target = findSpirit(player, instanceId)
    if (!target) return "覚醒するスピリットが見つかりません"
    if (!hasKeyword(target.cardId, "awaken")) return "このスピリットは【覚醒】を持ちません"
    if (count < 1) return "移動するコア数が不正です"
    if (instanceId === fromInstanceId) return "移動元と移動先が同じです"
    const from = findSpirit(player, fromInstanceId)
    if (!from) return "コアの移動元スピリットが見つかりません"
    if (from.cores < count) return "移動元のコアが足りません"
    return null
}

// 起動能力（kind: "activated"）の発動可否。コストを払って任意発動する能力の汎用検証。
export function validateActivateAbility(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    effectId: string,
): string | null {
    const inst = findSpirit(state.players[pid], instanceId)
    if (!inst) return "対象のスピリットが見つかりません"
    const level = currentLevel(inst).level
    const effect = getCard(inst.cardId).effects.find(
        (e) => e.kind === "activated" && e.id === effectId,
    )
    if (!effect || effect.kind !== "activated") return "起動能力が見つかりません"
    if (!effectActiveAtLevel(effect.levels, level)) {
        return "現在のレベルでは発動できません"
    }
    // 発動可能タイミング（現状はフラッシュ中のバトルのみ）
    if (effect.timing === "flashBattle") {
        if (!state.isFlashTiming || !state.battle) {
            return "フラッシュタイミングではありません"
        }
    }
    // 発動条件: self が現在のバトルの当事者
    if (effect.condition === "selfInBattle") {
        if (
            !state.battle ||
            (state.battle.attackerInstanceId !== instanceId &&
                state.battle.blockerInstanceId !== instanceId)
        ) {
            return "このスピリットはバトルに参加していません"
        }
    }
    // フラッシュ優先権（手札のカードではなくスピリットの能力なので lockFlash は適用しない）
    if (pid !== state.priorityPlayer) return "現在フラッシュの優先権がありません"
    if (state.players[pid].reserve < effect.cost.reserveToTrash) {
        return "コアが足りません"
    }
    return null
}

export function validateAttack(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    targetSpiritInstanceId?: string,
): string | null {
    if (state.turnPlayer !== pid) return "自分のターンではありません"
    if (state.phase !== "attack") return "アタックステップではありません"
    if (state.turn === 1) return "先攻1ターン目はアタックできません"
    if (state.battle) return "バトルの解決中です"
    const inst = findSpirit(state.players[pid], instanceId)
    if (!inst) return "対象のスピリットが見つかりません"
    if (inst.isRested) return "疲労しているためアタックできません"
    if (inst.cantAttackThisTurn) return "このターンはアタックできません"
    if (currentLevel(inst).level < 1) return "レベル1未満のためアタックできません"
    // フィールド全体制約（魔帝の墓標）：コア1個しか置いていないスピリットはアタックできない
    if (inst.cores === 1 && hasGlobalConstraint(state, "singleCoreCantAct")) {
        return "コア1個しか置いていないスピリットはアタックできません"
    }

    if (targetSpiritInstanceId !== undefined) {
        // 指定アタック：canDirectAttack を持ち、指定した相手スピリットが targetFilter に合うかを検証する
        const directConstraint = activeConstraints(state, pid, inst).find(
            (c) => c.type === "canDirectAttack",
        )
        if (!directConstraint || directConstraint.type !== "canDirectAttack") {
            return "このスピリットは指定アタックできません"
        }
        const target = findSpirit(state.players[opponentOf(pid)], targetSpiritInstanceId)
        if (!target) return "指定した相手スピリットが見つかりません"
        if (directConstraint.targetFilter === "rested" && !target.isRested) {
            return "疲労状態のスピリットしか指定できません"
        }
        if (directConstraint.targetFilter === "singleCore" && target.cores !== 1) {
            return "コア1個のスピリットしか指定できません"
        }
    }
    return null
}

export function validateBlock(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
): string | null {
    if (!state.battle) return "バトルが発生していません"
    if (pid !== opponentOf(state.turnPlayer)) return "防御側ではありません"
    // 攻撃側に優先権がある間（フラッシュ中で自分が優先権を持たない）はブロックできない
    if (state.isFlashTiming && pid !== state.priorityPlayer) {
        return "現在フラッシュの優先権がありません"
    }
    if (state.battle.blockerInstanceId) return "すでにブロックしています"
    const inst = findSpirit(state.players[pid], instanceId)
    if (!inst) return "対象のスピリットが見つかりません"
    if (inst.isRested) return "疲労しているためブロックできません"
    if (currentLevel(inst).level < 1) return "レベル1未満のためブロックできません"
    // フィールド全体制約（魔帝の墓標）：コア1個しか置いていないスピリットはブロックできない
    if (inst.cores === 1 && hasGlobalConstraint(state, "singleCoreCantAct")) {
        return "コア1個しか置いていないスピリットはブロックできません"
    }

    const attackerPid = opponentOf(pid)
    const attacker = findSpirit(
        state.players[attackerPid],
        state.battle.attackerInstanceId,
    )

    // ブロッカー側の制約（cantBlock / cantBlockLowerBp）。
    // バーストファイアで無効化されている場合はこれらのチェックをスキップする。
    const blockerConstraints = activeConstraints(state, pid, inst)
    if (!inst.blockConstraintNegatedThisTurn) {
        if (blockerConstraints.some((c) => c.type === "cantBlock")) {
            return "このスピリットはブロックできません"
        }
        if (
            attacker &&
            blockerConstraints.some((c) => c.type === "cantBlockLowerBp") &&
            effectiveBp(state, attackerPid, attacker) <
                effectiveBp(state, pid, inst)
        ) {
            return "BPの低いスピリットはブロックできません"
        }
    }

    // アタッカー側の制約（unblockableBy）
    if (attacker) {
        const blockerCard = getCard(inst.cardId)
        const attackerConstraints = activeConstraints(state, attackerPid, attacker)
        for (const c of attackerConstraints) {
            if (c.type !== "unblockableBy") continue
            if (c.colorFilter !== undefined && blockerCard.color === c.colorFilter) {
                return `このスピリットは${COLOR_LABELS[c.colorFilter]}のスピリットにブロックされません`
            }
            if (
                c.keywordFilter !== undefined &&
                hasKeyword(inst.cardId, c.keywordFilter)
            ) {
                return `このスピリットは【${KEYWORDS[c.keywordFilter].label}】を持つスピリットにブロックされません`
            }
            if (c.maxCores !== undefined && inst.cores <= c.maxCores) {
                return `このスピリットはコア${c.maxCores}個以下のスピリットにブロックされません`
            }
        }
    }
    return null
}

// ブロック可能なスピリットがいるか（【激突】等の判定に使用）
export function hasBlocker(state: GameState, pid: PlayerId): boolean {
    return state.players[pid].field.spirits.some(
        (s) => !s.isRested && currentLevel(s).level >= 1,
    )
}

// フラッシュの優先権を相手に渡す（パス）
export function validatePass(state: GameState, pid: PlayerId): string | null {
    if (!state.battle || !state.isFlashTiming) return "フラッシュタイミングではありません"
    if (pid !== state.priorityPlayer) return "現在フラッシュの優先権がありません"
    return null
}

// ターン終了（endTurn）の妥当性を検証する。
// 「必ずアタック」制約（mustAttack）を持ち、かつ現在アタック可能な自分のスピリットが1体でもいる場合は
// エンドターンを拒否し、アタックを強制する（メインからの endTurn／アタックステップからの endTurn 両方）。
export function validateEndTurn(state: GameState, pid: PlayerId): string | null {
    if (state.turnPlayer !== pid) return "自分のターンではありません"
    if (state.phase !== "main" && state.phase !== "attack") {
        return "ターンを終了できるステップではありません"
    }
    if (state.battle) return "バトルの解決中です"

    // 先攻1ターン目はアタック自体が禁止のため、mustAttack はターン終了を妨げない
    if (state.turn === 1) return null

    const player = state.players[pid]
    for (const inst of player.field.spirits) {
        if (inst.isRested) continue
        if (inst.cantAttackThisTurn) continue
        if (currentLevel(inst).level < 1) continue
        // フィールド全体制約（魔帝の墓標）でアタックできない個体はアタック強制の対象外
        if (inst.cores === 1 && hasGlobalConstraint(state, "singleCoreCantAct")) continue
        const constraints = activeConstraints(state, pid, inst)
        if (constraints.some((c) => c.type === "mustAttack")) {
            return `${getCard(inst.cardId).name}は必ずアタックしなければなりません`
        }
    }
    return null
}

export function validateTakeLife(state: GameState, pid: PlayerId): string | null {
    if (!state.battle) return "バトルが発生していません"
    if (pid !== opponentOf(state.turnPlayer)) return "防御側ではありません"
    // ブロック宣言済みならライフでは受けられない
    if (state.battle.blockerInstanceId) return "すでにブロックしています"
    // 攻撃側に優先権がある間（フラッシュ中で自分が優先権を持たない）はライフで受けられない
    if (state.isFlashTiming && pid !== state.priorityPlayer) {
        return "現在フラッシュの優先権がありません"
    }
    const attacker = findSpirit(
        state.players[state.turnPlayer],
        state.battle.attackerInstanceId,
    )
    // 【激突】持ちのアタック時はブロック強制（第一弾には未収録だが将来弾向けに残す）
    if (attacker && hasKeyword(attacker.cardId, "clash") && hasBlocker(state, pid)) {
        return "【激突】によりブロックしなければなりません"
    }
    return null
}
