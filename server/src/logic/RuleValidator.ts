// 行動可否判定（召喚条件、コスト支払い可否など）
// 各関数はエラー理由の文字列を返し、問題なければ null を返す
import type { CardData, CardInstance, Color, EffectDef, GameState, PaySource, PlayerId } from "../type"
import {
    coresForLevel,
    countSymbols,
    currentLevel,
    findNexus,
    findSpirit,
    getCard,
    lv1Cores,
    opponentOf,
} from "./GameState"
import { cantActByCost } from "../../../shared/rules"
// コスト計算は shared/cost.ts に一本化（クライアントの表示計算と同一実装）。
// effectiveCost は多数の箇所から RuleValidator 経由で import されているため再エクスポートで名前を残す
import {
    effectiveCost,
    hasMagicFreeGrant,
    hasMagicRestriction,
    ownFieldSymbolColors,
} from "../../../shared/cost"
export { effectiveCost }
import {
    activeConstraints,
    effectActiveAtLevel,
    effectiveBp,
    hasGlobalConstraint,
    hasKeyword,
    hasMagicImmunity,
    instHasColor,
    isUntargetableByOpponent,
    KEYWORDS,
    matchesFamilyFilter,
    spiritHasKeyword,
} from "./EffectModules"
import { COLOR_LABELS } from "../../../data/constants"







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
        if (seen.has(src.instanceId)) return "支払い元が重複しています"
        seen.add(src.instanceId)
        const inst = findSpirit(player, src.instanceId) ?? findNexus(player, src.instanceId)
        if (!inst) return "支払い元が見つかりません"
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
    level?: number,
): string | null {
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    if (card.type !== "spirit") return "スピリットカードではありません"

    // 神速：フラッシュタイミングなら手札から召喚できる（自分・相手ターン問わず）
    // grantKeywordToHandCardで一時的に神速を付与された手札カードも同様に扱う（ビートプリースト）
    const hasTempSoku = (player.tempHandKeywordGrants ?? []).some(
        (g) => g.cardId === cardId && g.keyword === "soku",
    )
    const flashSummon = state.isFlashTiming && (hasKeyword(cardId, "soku") || hasTempSoku)
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

    // フィールドのスピリット数上限（旋風渦巻く渓谷＝5体以上召喚できない）。
    // 効果文が『お互いのメインステップ』のため、メインステップの通常召喚のみを制限する（神速召喚は対象外）
    if (!flashSummon && state.phase === "main") {
        const cap = maxSpiritsOnField(state)
        if (cap !== null && player.field.spirits.length >= cap) {
            return `効果により、スピリットは${cap}体までしか召喚できません`
        }
    }

    const cost = effectiveCost(state, pid, card)
    // レベル指定時はそのレベルのコア数を置く（省略時はLv1）
    const placeError = validateSummonLevel(card, level)
    if (placeError) return placeError
    const maintain = level === undefined ? lv1Cores(card) : (coresForLevel(card, level) ?? 0)
    const payError = validatePaySources(state, pid, cost, paySources)
    if (payError) return payError
    // 置くコアは必ずリザーブから払うため、コアで賄えなかった分+置くコアがリザーブに残っているか検証
    const total = paySourcesTotal(paySources)
    if (player.reserve < cost - total + maintain) {
        return `コアが足りません（コスト+置くコアで${cost + maintain}個必要）`
    }
    return null
}

// フィールドに置けるスピリット数の上限（globalConstraint "maxSpiritsOnField"）。
// 両陣営のフィールドを走査し、レベル有効な発生源があればその max を返す（複数あれば最も厳しい値）
function maxSpiritsOnField(state: GameState): number | null {
    let cap: number | null = null
    for (const ownerPid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[ownerPid]
        for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
            const level = currentLevel(inst).level
            for (const effect of getCard(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "maxSpiritsOnField") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                const max = effect.constraint.max
                cap = cap === null ? max : Math.min(cap, max)
            }
        }
    }
    return cap
}

// 召喚／配置のレベル指定を検証する（未指定＝Lv1は常に有効）。
// カードに存在しないレベルや、Lv1のコア数を下回るレベル指定を弾く
function validateSummonLevel(card: CardData, level?: number): string | null {
    if (level === undefined) return null
    if (!Number.isInteger(level) || level < 1) return "レベルの指定が不正です"
    const cores = coresForLevel(card, level)
    if (cores === null) return `${card.name}にLv${level}はありません`
    return null
}

export function validateSetNexus(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    paySources?: PaySource[],
    level?: number,
): string | null {
    const timing = checkMainTiming(state, pid)
    if (timing) return timing
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    if (card.type !== "nexus") return "ネクサスカードではありません"

    const cost = effectiveCost(state, pid, card)
    const placeError = validateSummonLevel(card, level)
    if (placeError) return placeError
    const maintain = level === undefined ? lv1Cores(card) : (coresForLevel(card, level) ?? 0)
    const payError = validatePaySources(state, pid, cost, paySources)
    if (payError) return payError
    const total = paySourcesTotal(paySources)
    if (player.reserve < cost - total + maintain) {
        return `コアが足りません（コスト+置くコアで${cost + maintain}個必要）`
    }
    return null
}

export function validateCastMagic(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    targetInstanceId?: string,
    paySources?: PaySource[],
    fromTegamoto?: boolean,
): string | null {
    const player = state.players[pid]
    const cardId = fromTegamoto ? player.tegamoto[handIndex] : player.hand[handIndex]
    if (cardId === undefined) return fromTegamoto ? "手元にカードがありません" : "手札にカードがありません"
    const card = getCard(cardId)
    if (card.type !== "magic") return "マジックカードではありません"

    // 手元(tegamoto)からの使用は、scope:"allMagicHandAndTegamoto"の無償化（ミカファールLv2）が
    // 有効な場合のみ許可する（凱旋門Lv2のnoFreeCastOpponentが有効なら無償化自体が打ち消される）
    if (fromTegamoto) {
        if (
            !hasMagicFreeGrant(state, pid, card, true) ||
            hasMagicRestriction(state, pid, "noFreeCastOpponent")
        ) {
            return "手元のマジックカードを無償使用できる効果がありません"
        }
    }

    // 作戦参謀フォクシン：フィールドに発生源があれば、お互いターンに1回しかマジックの効果を使用できない
    if (hasMagicRestriction(state, pid, "oncePerTurnAll") && (state.magicUsedThisTurn[pid] ?? 0) >= 1) {
        return "このターンはすでにマジックの効果を使用しているため使用できません"
    }
    // 力奪う凱旋門：相手フィールドに発生源があれば、自分のフィールドのシンボル色と一致しない色のマジックは使用できない
    if (hasMagicRestriction(state, pid, "colorLockOpponent") && !ownFieldSymbolColors(state, pid).has(card.color)) {
        return "このマジックの色と一致するシンボルが自分のフィールドにないため使用できません"
    }

    // 対象指定がある場合、両プレイヤーのフィールドに該当スピリットが存在するか検証
    if (targetInstanceId !== undefined) {
        const exists =
            findSpirit(state.players[pid], targetInstanceId) !== undefined ||
            findSpirit(state.players[opponentOf(pid)], targetInstanceId) !==
                undefined
        if (!exists) return "対象のスピリットが見つかりません"
        // 相手スピリットが免疫（ワルキューレ／フェザーバリア）またはマジック効果耐性（ポークン）
        // を持つなら対象にできない（マジックの使用自体はここで検証しているためsourceTypeは常に"magic"）
        const enemyTarget = findSpirit(
            state.players[opponentOf(pid)],
            targetInstanceId,
        )
        if (
            enemyTarget &&
            (isUntargetableByOpponent(enemyTarget) ||
                hasMagicImmunity(state, opponentOf(pid), enemyTarget))
        ) {
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
        // メインステップ経路（バトル外）で使用しようとしているtiming（doCastMagicと同じ判定：
        // main用エントリがあればmain、なければflash用エントリをメインステップから使うことになる）の
        // エントリがすべてmainForbiddenなら、効果文「メインステップで使えない」に従い使用を拒否する
        const hasMain = card.effects.some((e) => e.kind === "magic" && e.timing === "main")
        const usedTiming: "main" | "flash" = hasMain ? "main" : "flash"
        const usedEntries = card.effects.filter(
            (e): e is Extract<EffectDef, { kind: "magic" }> =>
                e.kind === "magic" && e.timing === usedTiming,
        )
        if (usedEntries.length > 0 && usedEntries.every((e) => e.mainForbidden)) {
            return "このマジックはメインステップでは使用できません"
        }
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
    if (!spiritHasKeyword(state, pid, target, "awaken")) return "このスピリットは【覚醒】を持ちません"
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
    // このスピリットはアタックできない（カイザレオン大帝Lv1）
    if (activeConstraints(state, pid, inst).some((c) => c.type === "cantAttack")) {
        return "このスピリットはアタックできません"
    }
    // このターンの間だけの全体制約（ヘビィゲート）：コストがmaxCost以下のスピリットはアタックできない
    if (cantActByCost(state, inst)) {
        return "このターンの間、このスピリットはアタックできません"
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
        if (directConstraint.targetFilter === "recovered" && target.isRested) {
            return "回復状態のスピリットしか指定できません"
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
    // このターンの間だけの全体制約（ヘビィゲート）：コストがmaxCost以下のスピリットはブロックできない
    if (cantActByCost(state, inst)) {
        return "このターンの間、このスピリットはブロックできません"
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

    // アタッカー側の制約（unblockableBy）。
    // レッドウォール使用中は、ブロック側がこのターン「ブロックされない」効果を無視できる
    if (attacker && !state.ignoreUnblockableThisTurn.includes(pid)) {
        const blockerCard = getCard(inst.cardId)
        const attackerConstraints = activeConstraints(state, attackerPid, attacker)
        for (const c of attackerConstraints) {
            if (c.type !== "unblockableBy") continue
            if (c.colorFilter !== undefined && instHasColor(inst, c.colorFilter)) {
                return `このスピリットは${COLOR_LABELS[c.colorFilter]}のスピリットにブロックされません`
            }
            if (
                c.keywordFilter !== undefined &&
                spiritHasKeyword(state, pid, inst, c.keywordFilter)
            ) {
                return `このスピリットは【${KEYWORDS[c.keywordFilter].label}】を持つスピリットにブロックされません`
            }
            if (c.maxCores !== undefined && inst.cores <= c.maxCores) {
                return `このスピリットはコア${c.maxCores}個以下のスピリットにブロックされません`
            }
            if (
                c.levelFilter !== undefined &&
                c.levelFilter.includes(currentLevel(inst).level)
            ) {
                return `このスピリットはLv${c.levelFilter.join("/")}のスピリットにブロックされません`
            }
            if (c.costNot !== undefined && blockerCard.cost !== c.costNot) {
                return `このスピリットはコスト${c.costNot}以外のスピリットにブロックされません`
            }
        }
    }
    return null
}

// このターンの間だけ有効な全体制約（turnConstraints）により、指定スピリットがアタック/ブロック
// できないか（ヘビィゲート：コストがmaxCost以下のスピリットはすべて対象）

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
        // このターンの間だけの全体制約（ヘビィゲート）でアタックできない個体もアタック強制の対象外
        if (cantActByCost(state, inst)) continue
        const constraints = activeConstraints(state, pid, inst)
        // cantAttack を持つスピリットはそもそもアタックできないため、mustAttack強制の対象外
        if (constraints.some((c) => c.type === "cantAttack")) continue
        if (constraints.some((c) => c.type === "mustAttack")) {
            return `${getCard(inst.cardId).name}は必ずアタックしなければなりません`
        }
    }
    return null
}

// 強制ブロック（kind: "mustBlockGrant"）：アタッカーの持ち主のフィールドに、
// レベル有効・phase/turn一致・familyFilter一致（省略時は全アタッカー）の発生源があるか判定する。
// firstAttackOnly 指定時はそのターンの最初のアタック（attacksThisTurn === 1）のみ対象
function hasMustBlockAgainst(
    state: GameState,
    attackerPid: PlayerId,
    attacker: CardInstance,
): boolean {
    const player = state.players[attackerPid]
    for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
        const level = currentLevel(inst).level
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "mustBlockGrant") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            if (effect.turn === "own" && attackerPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && attackerPid === state.turnPlayer) continue
            if (effect.firstAttackOnly && state.attacksThisTurn !== 1) continue
            if (
                effect.familyFilter !== undefined &&
                !matchesFamilyFilter(state, attackerPid, attacker, effect.familyFilter)
            ) {
                continue
            }
            return true
        }
    }
    return false
}

// 「可能ならば必ずブロックする」の判定用：実際にブロック宣言が通るスピリットが1体でもいるか。
// hasBlocker（回復状態か見るだけ）と違い validateBlock を通すため、cantBlock や
// unblockableBy で実際にはブロックできない場合に強制ブロックで詰まない
function hasLegalBlocker(state: GameState, pid: PlayerId): boolean {
    return state.players[pid].field.spirits.some(
        (s) => validateBlock(state, pid, s.instanceId) === null,
    )
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
    if (
        attacker &&
        spiritHasKeyword(state, state.turnPlayer, attacker, "clash") &&
        hasBlocker(state, pid)
    ) {
        return "【激突】によりブロックしなければなりません"
    }
    // 強制ブロック（燃えさかる戦場Lv2＝ターン最初のアタック／BS04翼持つ者の空域Lv2＝翼竜・空牙のアタック）。
    // ブロック宣言が実際に通るスピリットがいるときのみ強制する（「可能ならば」）
    if (
        attacker &&
        hasMustBlockAgainst(state, state.turnPlayer, attacker) &&
        hasLegalBlocker(state, pid)
    ) {
        return "相手の効果により、可能ならば必ずブロックしなければなりません"
    }
    return null
}
