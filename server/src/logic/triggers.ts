// 誘発の発火とマジックの解決（EffectModules.ts から分割。2026-08-10）
//
// EffectModules.ts が4640行まで肥大化し、読み書き（とくにサブエージェントへの委譲）の
// コストが上がっていたため、境界が明確だった「イベント発火」セクションを切り出したもの。
// **中身は移設しただけで、ロジックは一切変えていない。**
//
// ⚠️ EffectModules.ts とは相互 import の関係にある（こちらは destroySpirit / removeCores 等を、
// あちらは fireTrigger / resolveMagic 等を使う）。GameState.ts ↔ EffectModules.ts と同じ形で、
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
    rawLevel,
    pushResumeFrames,
    suspend,
} from "./GameState"
// 共有ルール層（shared/）へ移設した純粋述語。サーバー／クライアントで同一実装を使う。
// 外部から EffectModules 経由で import している箇所を壊さないため、再エクスポートで名前を残す
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
    canExhaustNexus,
    destroyNexus,
    destroySpirit,
    emitEvent,
    exhaustSpirit,
    findSpiritAny,
    hasAttackTriggersAsBlock,
    hasBlockTriggersAsAttack,
    removeCores,
    removeCoresToTrash,
    removeCoresToVoid,
    requestActivationConfirm,
    resolveAction,
} from "./EffectModules"

// ---- イベント発火 ----

// selfInstance が持つ、指定イベントの誘発効果を実行する。
// レベル条件を満たすものだけ発動する。
// battleRole は onBattleWin 専用の追加引数：勝利した側の役割（attacker/blocker）を渡す。
// 効果側に battleRole の指定があれば、渡された役割と一致する場合のみ発火する
// （指定なしの効果は従来通り常に発火＝相打ちを含まない「勝った側」全体で発火）。
// 指定プレイヤーのスピリットの指定トリガーが「発揮されない」状態か判定する。
// ①このターン限りの抑止（ユーサネイジア＝suppressTriggerThisTurn）
// ②フィールドの発生源による継続抑止（kind:"triggerSuppression"。古代闘技場Lv2）
// ②は「発生源の持ち主から見た相手」のスピリットに効くため、ownerPid が発生源の持ち主の相手であるものを探す
export function isTriggerSuppressed(
    state: GameState,
    ownerPid: PlayerId,
    event: TriggerEvent,
): boolean {
    if (state.triggerSuppressionThisTurn.some((e) => e.pid === ownerPid && e.trigger === event)) {
        return true
    }
    for (const sourcePid of ["p1", "p2"] as PlayerId[]) {
        if (opponentOf(sourcePid) !== ownerPid) continue
        const player = state.players[sourcePid]
        for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
            const level = currentLevel(inst).level
            for (const effect of getCard(inst.cardId).effects) {
                if (effect.kind !== "triggerSuppression") continue
                if (effect.trigger !== event) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && sourcePid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && sourcePid === state.turnPlayer) continue
                return true
            }
        }
    }
    return false
}

// 『このスピリットの召喚時』効果の発火。解決中だけ GameState.resolvingSummonTriggerPid を立て、
// 「相手のスピリットの召喚時効果を受けない」（BS05リトルナイト・ランスロットLv3）が isEffectBlocked で判定できるようにする。
// 選択待ちで中断した場合はフラグを残し、handleAction の事後フックが選択の解決後にクリアする
export function fireSummonTrigger(state: GameState, owner: PlayerId, selfInstance: CardInstance): void {
    // globalConstraint "noSummonTriggerByCost"（BS08共鳴する音叉の塔）：コストが低いスピリットの
    // 『このスピリットの召喚時』効果は発揮されない
    if (noSummonTriggerByCost(state, selfInstance)) {
        log(state, `${getCard(selfInstance.cardId).name}：コストが低いため、召喚時効果は発揮されなかった。`)
        return
    }
    state.resolvingSummonTriggerPid = owner
    fireTrigger(state, owner, selfInstance, "onSummon")
    if (!state.pendingChoice) delete state.resolvingSummonTriggerPid
}

export function fireTrigger(
    state: GameState,
    owner: PlayerId,
    selfInstance: CardInstance,
    event: TriggerEvent,
    battleRole?: "attacker" | "blocker",
    targetInstanceId?: string,
): void {
    // 相手の効果によりこのトリガーが発揮されない状態なら、誘発そのものを行わない
    if (isTriggerSuppressed(state, owner, event)) {
        log(state, `${getCard(selfInstance.cardId).name}の効果は発揮されなかった。`)
        return
    }
    // 「持つ効果すべては発揮されない」を受けている個体（BS07ルナースラッシュ／BS03ゴーレムクラフトで
    // スピリット化されたネクサス）は誘発も出さない
    if (instEffectsSuppressed(selfInstance)) {
        log(state, `${getCard(selfInstance.cardId).name}の効果は発揮されなかった。`)
        return
    }
    const card = getCard(selfInstance.cardId)
    const level = currentLevel(selfInstance).level
    // ブレイブチャージ：この個体の『アタック時』効果は、このターンの間『ブロック時』へ移る。
    // アタック時には発揮されなくなり（＝移し替え）、ブロック時に『ブロック時』効果と一緒に発揮される
    // ターン限定（ブレイブチャージ）に加え、継続付与（ドラグノ近衛兵）でも移し替えが起きる
    const movedToBlock =
        selfInstance.attackTriggersAsBlockThisTurn === true ||
        hasAttackTriggersAsBlock(state, owner, selfInstance)
    // アタックシフト：このターンの間、両陣営スピリットすべての『ブロック時』効果は『アタック時』へ移る
    // （ブロック時には発揮されなくなり＝移し替え、アタック時に『アタック時』効果と一緒に発揮される。BS01-149）
    // アタックシフト（全体・このターン）に加えて、個体単位の移し替え（BS07マクラーンスラッシュ）と
    // 継続付与（BS07大械獣ギガ・テリウム）も見る
    const movedToAttack =
        state.blockTriggersAsAttackThisTurn === true ||
        selfInstance.blockTriggersAsAttackThisTurn === true ||
        hasBlockTriggersAsAttack(state, owner, selfInstance)
    if (movedToBlock && event === "onAttack") {
        return
    }
    if (movedToAttack && event === "onBlock") {
        return
    }
    const firedEvents: TriggerEvent[] =
        movedToBlock && event === "onBlock"
            ? ["onBlock", "onAttack"]
            : movedToAttack && event === "onAttack"
              ? ["onAttack", "onBlock"]
              : [event]
    const matches = (effect: EffectDef): effect is Extract<EffectDef, { kind: "triggered" }> => {
        if (effect.kind !== "triggered") return false
        if (!firedEvents.includes(effect.trigger)) return false
        if (!effectActiveAtLevel(effect.levels, level)) return false
        if (effect.battleRole !== undefined && effect.battleRole !== battleRole) return false
        if (effect.condition) {
            if ("opponentNexusColorsAtLeast" in effect.condition) {
                // 溶海竜プレシオスLv3：持ち主から見て相手フィールドのネクサスの色数（重複除く）が
                // opponentNexusColorsAtLeast 以上のときのみ発火
                const oppNexuses = state.players[opponentOf(owner)].field.nexuses
                const colors = new Set(oppNexuses.flatMap((n) => instColors(n)))
                if (colors.size < effect.condition.opponentNexusColorsAtLeast) return false
            } else if ("ownFieldHasColorSpirit" in effect.condition) {
                // オチョゴ／ジェルフィ：発生源の持ち主のフィールドに指定色のスピリットがいるときのみ発火
                const color = effect.condition.ownFieldHasColorSpirit
                if (
                    !state.players[owner].field.spirits.some((s) => instHasColor(s, color))
                ) {
                    return false
                }
            } else if ("ownFieldHasColorNexus" in effect.condition) {
                // 天使キュリオ：発生源の持ち主のフィールドに指定色のネクサスがあるときのみ発火
                const color = effect.condition.ownFieldHasColorNexus
                if (
                    !state.players[owner].field.nexuses.some((n) => instHasColor(n, color))
                ) {
                    return false
                }
            } else if ("targetSameLevelAsSelf" in effect.condition) {
                // 剣竜ステゴラーサウルス：ブロックしてきたスピリット（targetInstanceId）のLvが
                // selfのLvと同じときのみ発火（未指定/不在なら発火しない）
                if (targetInstanceId === undefined) return false
                const target = findInstanceAnywhere(state, targetInstanceId)
                if (!target) return false
                if (currentLevel(target).level !== level) return false
            } else if ("firstAttackOfTurn" in effect.condition) {
                // ダックル：そのターンの最初のアタックのときのみ発火（doAttackが宣言時に加算する）
                if (state.attacksThisTurn !== 1) return false
            } else if ("lastFunsaiHasNexus" in effect.condition) {
                // 伝説巨人ジュード：直前の【粉砕】で破棄したカードの中にネクサスカードがあったときのみ発火
                if ((state.lastFunsai?.nexuses ?? 0) === 0) return false
            } else if ("lastFunsaiHasSpirit" in effect.condition) {
                // 爆砕巨人ダグラスLv2-3：直前の【粉砕】で破棄したカードの中にスピリットカードがあったときのみ発火
                if ((state.lastFunsai?.spirits ?? 0) === 0) return false
            } else if ("ownFieldHasKeyword" in effect.condition) {
                // クナノミ：発生源の持ち主のフィールドに指定キーワード持ちのスピリットがいるときのみ発火
                const kw = effect.condition.ownFieldHasKeyword
                if (
                    !state.players[owner].field.spirits.some((s) =>
                        spiritHasKeyword(state, owner, s, kw),
                    )
                ) {
                    return false
                }
            } else if ("targetMinBp" in effect.condition) {
                // 鍵鎚のヴァルグリンドLv2：ブロックしたスピリット（targetInstanceId）の実効BPがこれ以上のときのみ発火
                if (targetInstanceId === undefined) return false
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) return false
                if (effectiveBp(state, found.pid, found.inst) < effect.condition.targetMinBp) return false
            } else if ("targetHasColor" in effect.condition) {
                // 鉄蠍竜スコルド・ゴランLv3：ブロックしたスピリット（targetInstanceId）がこの色を持つときのみ発火
                if (targetInstanceId === undefined) return false
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) return false
                if (!instHasColor(found.inst, effect.condition.targetHasColor)) return false
            } else if ("targetMaxCost" in effect.condition) {
                // 激神皇カタストロフドラゴンLv3：ブロックしたスピリット（targetInstanceId）のコストがこれ以下のときのみ発火
                if (targetInstanceId === undefined) return false
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) return false
                if (!instMatchesCostFilter(found.inst, { max: effect.condition.targetMaxCost })) return false
            } else if ("targetNotMaxLevel" in effect.condition) {
                // BS07神帝獣スフィン・クロスLv3：ブロックしたスピリット（targetInstanceId）が
                // そのカードの最高Lvに達していないときのみ発火
                if (targetInstanceId === undefined) return false
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) return false
                const maxLevel = getCard(found.inst.cardId).levels.reduce(
                    (max, lv) => Math.max(max, lv.level),
                    0,
                )
                if (currentLevel(found.inst).level >= maxLevel) return false
            } else if ("battleLoserMaxCost" in effect.condition) {
                // BS07天刃の勇者ヴォルザLv2：直前のバトルで破壊した相手のコストがこれ以下のときのみ。
                // resolveBattle が onBattleWin を発火させるのは「BP比較で相手だけを破壊した」枝で、
                // その直前に lastBattleDestroyedCost を必ず記録している。よって値は常に有効で、
                // **0 を「未記録」と読み替えてはいけない**（コスト0のスピリットが実在する）
                if (state.lastBattleDestroyedCost > effect.condition.battleLoserMaxCost) return false
            } else if ("opponentHandAtLeast" in effect.condition) {
                // BS08ボクルガー：発生源の持ち主から見た相手の手札枚数がこれ以上のときのみ発火。
                // サーバー内部のstate.players[opp].handは常に実配列（隠匿マスクはviewFor変換時のみ）
                if (state.players[opponentOf(owner)].hand.length < effect.condition.opponentHandAtLeast) return false
            } else if ("ownNameIncludesCountAtLeast" in effect.condition) {
                // BS07マカロニペンタン：持ち主のフィールドに[皇帝アンプルール]/[女帝ペンプレス]がいるときのみ発火
                const { names, count } = effect.condition.ownNameIncludesCountAtLeast
                const total = state.players[owner].field.spirits.filter((s) =>
                    names.some((n) => cardNameContains(s, n)),
                ).length
                if (total < count) return false
            }
        }
        return true
    }
    // 付与された誘発効果（kind: "effectGrant"。アルカナビースト・ケン）：持ち主フィールドの発生源から
    // target/nameIncludes 一致でこのインスタンスに継続付与された誘発効果を、静的effectsの末尾に合成する
    // （grantedのlevelsは常に有効扱い。発生源自身もnameIncludes一致すれば対象に含む）
    // 加えて、action:"grantEffectToTargetThisTurn" でこの個体1体に直接付与された、このターン限りの
    // 誘発効果（tempGrantedTriggers）も同様に合成する（BS08メテオストーム）
    const tempGranted = (selfInstance.tempGrantedTriggers ?? [])
        .filter((g) => firedEvents.includes(g.trigger) && (g.battleRole === undefined || g.battleRole === battleRole))
        .map((g) => g.action)
    const grantedActions = [
        ...collectGrantedTriggerActions(state, owner, selfInstance, event, targetInstanceId),
        ...tempGranted,
    ]

    const effects = card.effects
    for (let i = 0; i < effects.length; i++) {
        const effect = effects[i]
        if (!effect || !matches(effect)) continue
        // 「〜できる」（optional）は実対戦では発動可否をプレイヤーに確認する。
        // interactiveTargets=false（テスト）では従来どおり常に発動する
        if (effect.optional && state.interactiveTargets) {
            requestActivationConfirm(
                state,
                owner,
                `${card.name}の効果を発動しますか？`,
                effect.action,
                selfInstance,
            )
        } else {
            // 対象の付け替え（kind:"magicTargetRedirect"）は**マジックに限らず、対象を選ぶ効果全般**に効く
            // （2026-08-14 ユーザー確認。BS09-038スズランの妖精ティンカ／BS05-040スノーホワイトの
            //  効果文どおり「スピリット/マジックの効果」が対象）。ネクサスの効果は対象外
            const redirecting = card.type === "spirit"
            if (redirecting) setTargetRedirect(state, owner, targetInstanceId, effect.action)
            resolveAction(state, owner, selfInstance, effect.action, targetInstanceId)
            if (redirecting) delete state.magicRedirectTo
        }
        // 選択待ちが立ったら、残りの一致エントリ＋付与分をqueueに積んで中断する
        if (state.pendingChoice) {
            const remaining = effects.slice(i + 1).filter(matches)
            pushResumeFrames(state, [
                ...remaining.map((e) => ({ kind: "action" as const, selfInstanceId: selfInstance.instanceId, action: e.action })),
                ...grantedActions.map((a) => ({ kind: "action" as const, selfInstanceId: selfInstance.instanceId, action: a })),
            ])
            return
        }
    }
    for (let i = 0; i < grantedActions.length; i++) {
        const grantedAction = grantedActions[i]
        if (!grantedAction) continue
        resolveAction(state, owner, selfInstance, grantedAction, targetInstanceId)
        if (state.pendingChoice) {
            const remaining = grantedActions.slice(i + 1)
            pushResumeFrames(
                state,
                remaining.map((a) => ({ kind: "action" as const, selfInstanceId: selfInstance.instanceId, action: a })),
            )
            return
        }
    }
}

// fireTrigger 用: 持ち主(owner)フィールドの kind:"effectGrant" 発生源から、selfInstance に
// 継続付与された誘発効果（trigger一致）のアクション一覧を集める（アルカナビースト・ケン）
function collectGrantedTriggerActions(
    state: GameState,
    owner: PlayerId,
    selfInstance: CardInstance,
    event: TriggerEvent,
    targetInstanceId?: string,
): EffectAction[] {
    // effectSources()：このターンだけの仮想発生源（マジックが貸した継続効果。BS03ブリッツ）も含める
    const sources = effectSources(state, owner)
    const actions: EffectAction[] = []
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "effectGrant") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.granted.trigger !== event) continue
            if (effect.nameIncludes && !cardNameContains(selfInstance, effect.nameIncludes)) {
                continue
            }
            if (effect.colorFilter && !instHasColor(selfInstance, effect.colorFilter)) continue
            if (
                effect.familyFilter &&
                !matchesFamilyFilter(state, owner, selfInstance, effect.familyFilter)
            ) {
                continue
            }
            if (effect.keywordFilter && !hasKeyword(selfInstance.cardId, effect.keywordFilter)) continue
            // 付与された誘発の発火条件（BS07ライフセービング＝コスト3以下をブロックしたとき）。
            // fireTrigger が渡す targetInstanceId（onBlock ならアタッカー）を見る
            if (effect.granted.condition !== undefined) {
                if (targetInstanceId === undefined) continue
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) continue
                if (!instMatchesCostFilter(found.inst, { max: effect.granted.condition.targetMaxCost })) continue
            }
            actions.push(effect.granted.action)
        }
    }
    return actions
}

// バトルの勝者側プレイヤーのフィールド（ネクサス＋スピリット）を走査し、
// kind: "battleWon" かつ role 一致（role:"any"はどちらの役割でも一致）かつレベル条件を満たす効果を実行する
// （ネクサスのバトル結果誘発）。
// resolveAction には self として発生源（ネクサス／スピリット）ではなく、
// 「勝利したスピリット（winnerInst）」を渡す。refreshSelf 等が「勝ったスピリット」を回復させる
// ような効果文（例: 無限蟲の蟻塚「自分のブロックしたスピリットは回復する」）を、
// 発生源に関係なく素直に表現するための意図的な選択。selfMode:"source" 指定時は逆に
// 発生源インスタンス（ネクサス自身）を self に渡す（深緑の樹海：ネクサス自身にコアを置く）。
// turn:"own" 指定時は winnerPid が turnPlayer のときのみ、vanillaWinnerOnly 指定時は
// 勝利したスピリットがバニラのときのみ発火する。
// 勝敗が決着したら（state.winner が立ったら）残りは打ち切る。
export function fireBattleWonTriggers(
    state: GameState,
    winnerPid: PlayerId,
    winnerInst: CardInstance,
    role: "attacker" | "blocker",
): void {
    // effectSources：このターンだけの仮想発生源（マジックが貸した継続効果。BS04ニーベルングリング）も含める
    const instances = effectSources(state, winnerPid)
    for (const inst of instances) {
        const card = getCard(inst.cardId)
        const level = currentLevel(inst).level
        for (const effect of card.effects) {
            if (effect.kind !== "battleWon") continue
            if (effect.role !== "any" && effect.role !== role) continue
            // 『このスピリットのバトル時』：発生源自身が勝利したときだけ発火する（BS01要塞龍ギガLv2）。
            // 同名の別個体が場にいても、勝っていない側では発火させない
            if (effect.selfOnly && inst.instanceId !== winnerInst.instanceId) continue
            // lentOnly：仮想発生源からのみ有効（実在カードが同じエントリを持っても恒久化させない）
            if (effect.lentOnly && !isVirtualSource(inst)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.turn === "own" && winnerPid !== state.turnPlayer) continue
            // そのターンの最初のアタックで勝利したときのみ（BS08太陽石の神殿）
            if (effect.firstAttackOfTurn && state.attacksThisTurn !== 1) continue
            if (effect.vanillaWinnerOnly && !instIsVanilla(winnerInst)) continue
            // 勝利したスピリットのカード名で絞る（BS04獣使いドヴェルグ＝「鎧装獣」／ニーベルングリング＝「ジーク」）
            if (
                effect.winnerNameContains !== undefined &&
                !cardNameContains(winnerInst, effect.winnerNameContains)
            ) {
                continue
            }
            // BS04ドラゴンズラッシュ：勝利したスピリットが指定系統を持つときのみ発火（配列＝OR）
            if (
                effect.winnerFamilyFilter !== undefined &&
                !matchesFamilyFilter(state, winnerPid, winnerInst, effect.winnerFamilyFilter)
            ) {
                continue
            }
            // BS02エメラルドに輝く鍾乳洞Lv2：勝利したスピリットのコアが指定数以上のときのみ発火
            if (effect.winnerMinCores !== undefined && winnerInst.cores < effect.winnerMinCores) {
                continue
            }
            // BS03熾烈極める最前線Lv2：勝利したスピリットが指定キーワードを持つときのみ発火（＝覚醒持ち）
            if (
                effect.winnerKeywordFilter !== undefined &&
                !spiritHasKeyword(state, winnerPid, winnerInst, effect.winnerKeywordFilter)
            ) {
                continue
            }
            const actionSelf = effect.selfMode === "source" ? inst : winnerInst
            // 「〜できる」（optional）は実対戦では発動可否を確認する（step / triggered と同じ扱い）
            if (effect.optional && state.interactiveTargets) {
                requestActivationConfirm(
                    state,
                    winnerPid,
                    `${getCard(inst.cardId).name}の効果を発動しますか？`,
                    effect.action,
                    actionSelf,
                )
                return
            }
            resolveAction(state, winnerPid, actionSelf, effect.action)
            if (state.winner) return
            if (state.pendingChoice) return
        }
    }
}

// ステップ誘発の condition を、発火元インスタンスの持ち主 pid 基準で判定する
function checkStepCondition(
    state: GameState,
    pid: PlayerId,
    condition: "handNotGreaterThanOpponent",
): boolean {
    // 主無き古城Lv2：お互いの手札の枚数が同じか、相手の方が多いとき
    return state.players[pid].hand.length <= state.players[opponentOf(pid)].hand.length
}

// ステップ誘発のログに出すステップ名。「どのステップの効果として発動したか」を示す
const STEP_LABELS: Record<Phase, string> = {
    start: "スタートステップ",
    core: "コアステップ",
    draw: "ドローステップ",
    refresh: "リフレッシュステップ",
    main: "メインステップ",
    attack: "アタックステップ",
    end: "エンドステップ",
}

// 指定ステップに到達したときの誘発（ネクサス・スピリット共通）を、
// ターンプレイヤー側 → 相手側の順に、各プレイヤー内ではスピリット→ネクサスの順で発火する。
// 1件実行するたびに勝敗をチェックし、決着していれば残りは発火させない。
// refreshedInstanceIds はリフレッシュステップで実際に回復（isRested: true → false）した
// インスタンスの集合（PhaseManagerが渡す）。selfWasRefreshedThisStep 条件の判定に使う（省略可）
// timing は「ステップ開始時（省略時＝"enter"）」と「ステップ終了時（"end"）」の呼び分け。
// データ側の effect.timing が未指定なら "enter" 扱いなので、既存の呼び出しは影響を受けない
export function fireStepTriggers(
    state: GameState,
    step: Phase,
    refreshedInstanceIds?: Set<string>,
    timing: "enter" | "end" = "enter",
    // ドローステップだけ、ドローの前後で2回に分けて呼ぶ（PhaseManager が区間を分けている）。
    // "beforeDraw"＝ドロー自体を支払いに使う効果（step.beforeDraw）だけ、"afterDraw"＝それ以外。
    // 省略時（他のステップ）は全部発火する
    drawPhase: "beforeDraw" | "afterDraw" | "all" = "all",
): void {
    const order: PlayerId[] = [
        state.turnPlayer,
        opponentOf(state.turnPlayer),
    ]
    for (const pid of order) {
        const player = state.players[pid]
        const instances = [...player.field.spirits, ...player.field.nexuses]
        for (const inst of instances) {
            const card = getCard(inst.cardId)
            const level = currentLevel(inst).level
            for (const effect of card.effects) {
                if (effect.kind !== "step") continue
                if (effect.step !== step) continue
                if ((effect.timing ?? "enter") !== timing) continue
                if (drawPhase === "beforeDraw" && effect.beforeDraw !== true) continue
                if (drawPhase === "afterDraw" && effect.beforeDraw === true) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.condition === "handNotGreaterThanOpponent" && !checkStepCondition(state, pid, effect.condition)) continue
                if (effect.condition === "selfWasRefreshedThisStep" && !refreshedInstanceIds?.has(inst.instanceId)) continue
                if (effect.condition && typeof effect.condition === "object" && "ownSymbolColorAtLeast" in effect.condition) {
                    // ハートレス・ティンLv2：自分のフィールドの指定色シンボルが count 個以上、かつ
                    // noAttacksThisTurn 指定時はこのターンまだ1度もアタックが行われていないときのみ発火
                    const { color, count } = effect.condition.ownSymbolColorAtLeast
                    const symbols = instances.reduce(
                        (sum, i) => sum + getCard(i.cardId).symbol.filter((c) => c === color).length,
                        0,
                    )
                    if (symbols < count) continue
                    if (effect.condition.noAttacksThisTurn && state.attacksThisTurn > 0) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownColorTotalAtLeast" in effect.condition) {
                    // 道化師クラン：自分のフィールドに指定色のスピリット+ネクサスが合計count以上あるときのみ発火
                    const { color, count } = effect.condition.ownColorTotalAtLeast
                    const total = instances.filter((s) => instHasColor(s, color)).length
                    if (total < count) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownFamilyCountAtLeast" in effect.condition) {
                    // 王蛇の住処：自分のフィールドに指定系統（配列＝OR）のスピリットがcount体以上いるときのみ発火
                    const { family, count } = effect.condition.ownFamilyCountAtLeast
                    const total = countSpiritsWeighted(
                        state,
                        pid,
                        pid,
                        (s) => matchesFamilyFilter(state, pid, s, family),
                        getCard(inst.cardId).type,
                    )
                    if (total < count) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownHandAtLeast" in effect.condition) {
                    // 水蛇シーサーペンタ：持ち主の手札が指定枚数以上のときのみ発火（Lvごとに閾値が変わる）
                    if (state.players[pid].hand.length < effect.condition.ownHandAtLeast) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "opponentDeckNotEmpty" in effect.condition) {
                    // BS09-058魔本収められし書架Lv2：相手のデッキが0枚のときは発揮しない
                    if (state.players[opponentOf(pid)].deck.length === 0) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownSpiritMinCost" in effect.condition) {
                    // BS09-032飛鋼獣ゲイル・フォッカー：コストが指定値以上の自分のスピリットが1体でもいるときのみ
                    const min = effect.condition.ownSpiritMinCost
                    if (!state.players[pid].field.spirits.some((s) => instMatchesCostFilter(s, { min }))) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownSpiritMinBp" in effect.condition) {
                    // BS09-015獄獣ガシャベルス：実効BPが指定値以上の自分のスピリットが1体でもいるときのみ発火
                    const min = effect.condition.ownSpiritMinBp
                    if (!state.players[pid].field.spirits.some((s) => effectiveBp(state, pid, s) >= min)) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownRefreshedSpiritsAtLeast" in effect.condition) {
                    // 紫水晶の森Lv2：自分のフィールドに回復状態のスピリットが指定体数以上いるときのみ発火
                    const refreshed = countSpiritsWeighted(state, pid, pid, (s) => !s.isRested, getCard(inst.cardId).type)
                    if (refreshed < effect.condition.ownRefreshedSpiritsAtLeast) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownNameIncludesCountAtLeast" in effect.condition) {
                    // 郵便ペンタン：カード名にいずれかの文字列を含む自分のスピリットが合計count体以上いるときのみ発火
                    const { names, count } = effect.condition.ownNameIncludesCountAtLeast
                    const total = countSpiritsWeighted(
                        state,
                        pid,
                        pid,
                        (s) => names.some((n) => cardNameContains(s, n)),
                        getCard(inst.cardId).type,
                    )
                    if (total < count) continue
                }
                // 「〜できる」（optional）は実対戦では発動可否を確認する（triggered と同じ扱い）
                if (effect.optional && state.interactiveTargets) {
                    requestActivationConfirm(
                        state,
                        pid,
                        `${getCard(inst.cardId).name}の効果を発動しますか？`,
                        effect.action,
                        inst,
                    )
                } else {
                    // 効果の発生源をログに残す（2026-08-02 UI担当からの指摘）。
                    // これが無いと「カードを2枚引いた」等の結果だけが残り、どのカードの効果か分からない。
                    // カード名を含めることでUI側のホバー表示も効く
                    log(state, `${player.name}の${card.name}の効果が発動した。（${STEP_LABELS[step]}${timing === "end" ? "終了時" : ""}）`)
                    resolveAction(state, pid, inst, effect.action)
                }
                if (state.winner) return
                if (state.pendingChoice) return
            }
        }
    }
}

// フィールドイベント誘発：「フィールド上の他の何かに起きたこと」に対してネクサス／スピリットが反応する。
//   ownLifeDamaged: pid のライフが（相手によって）減らされたとき
//   ownSpiritDestroyed: pid のスピリットが破壊（または消滅）されたとき
//   anySpiritAttacked: どちらかのスピリットがアタックを宣言したとき（発生源の持ち主を問わず両フィールドから呼ぶ）
// pid のフィールド（スピリット→ネクサスの順、既存の走査順に合わせる）から
// kind:"fieldEvent" かつ event 一致かつレベル・phase・turn 条件を満たす効果を実行する。
// self には発生源インスタンス（効果を持つネクサス／スピリット自身）を渡す。
// selfOverride を指定すると、resolveAction に渡す self とその持ち主を差し替える
// （anySpiritAttacked では「アタックしたスピリット」に効果を作用させるため。
// fireBattleWonTriggers が勝利スピリットを self に渡すのと同じ考え方）。既存呼び出しには影響しない。
// eventColor を指定すると、colorFilter 付きの効果（event: "ownSpiritDestroyed" 限定）は
// この色と一致する場合のみ発火する（祝福されし大聖堂）。他イベントでは colorFilter を持つ
// データが無いため未指定のままでよい。
// 1件実行するたびに勝敗をチェックし、決着していれば残りは発火させない。
// 注意（再入）: ここで実行される action が destroySpirit を呼ぶと、本関数を呼び出した
// destroySpirit 自身への再入となる。現対象カードの action は draw / coreGain のみで
// destroySpirit を呼ばないため安全だが、将来 destroy 系アクションを組み合わせる場合は
// 無限ループ（破壊→誘発→破壊→…）が起きないよう設計時に確認すること。
export function fireFieldEventTriggers(
    state: GameState,
    pid: PlayerId,
    event: FieldEvent,
    selfOverride?: { pid: PlayerId; inst: CardInstance },
    eventColors?: Color[],
    targetInstanceId?: string,
    eventCount?: number,
    eventInfo?: {
        vanilla?: boolean
        byBattle?: boolean
        // event: "ownSpiritDestroyed" 限定：破壊されたスピリットがそのバトルのアタッカーだったか（attackerOnly の判定に使う）
        wasAttacker?: boolean
        // event: "ownNexusDestroyed" 限定：**相手の**スピリット/ネクサス/マジックの効果による破壊か
        // （destroyNexus が DestroyContext から求めて渡す。byOpponentEffectOnly の判定に使う）
        byOpponentEffect?: boolean
        families?: string[]
        magicCost?: number
        magicTiming?: "main" | "flash"
        // event: "ownTensho" 限定：【転召】の犠牲になったスピリットのカード名（nameIncludesの判定に使う。BS08魔界七将アスモディオス）
        names?: string[]
        // 対象スピリットが「扱われている」コストの一覧（instAllCosts）。本来のコストに加え、
        // 道化師クランの付与コストも含めた複数値になりうるため、配列で受け取りいずれかが
        // costFilter を満たせばよい（instMatchesCostFilterと同じOR意味論）
        costs?: number[]
        // event: "ownSpiritCoresRemovedByOpponent" 限定：実際に取り除かれたコア数。
        // effect.countMode === "cores" のエントリのみ repeatPerCount の繰り返し回数として使う（BS06希望の大灯台Lv1）
        coresRemoved?: number
        // event: "ownSpiritSummoned" 限定：その召喚が【不死】によるものだったか（fushiSummonOnly の判定に使う。BS09-013ミミズクロ）
        byFushi?: boolean
    },
    // 場から離れた発生源を走査に加える（「**自分のネクサスが破壊されたとき**」を、
    // 破壊されたネクサス自身が持っている場合。effectSources はもう場にいないものを返さないため、
    // これが無いと自分自身の破壊では無言で発火しない。BS07の各色ネクサス6枚。2026-08-10 修正）
    extraSources?: CardInstance[],
): void {
    const player = state.players[pid]
    // effectSources()：このターンだけの仮想発生源（マジックが貸した継続効果。lendSelfThisTurn。
    // BS05ソウルクラッシュ）も含める。「誰が誘発効果を出しているか」を問うA分類の走査
    // （TURN_EFFECT_SOURCES.md §1）
    const instances = extraSources && extraSources.length > 0
        ? [...effectSources(state, pid), ...extraSources]
        : effectSources(state, pid)
    for (const inst of instances) {
        const card = getCard(inst.cardId)
        const level = currentLevel(inst).level
        for (const effect of card.effects) {
            if (effect.kind !== "fieldEvent") continue
            if (effect.event !== event) continue
            // lentOnly：仮想発生源からのみ有効（実在カードが同じエントリを持っても恒久化させない）
            if (effect.lentOnly && !isVirtualSource(inst)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            // 「ドローステップ以外で」（BS08ダークアンキラーザウルス）：指定ステップでは発火しない
            if (effect.excludePhase !== undefined && state.phase === effect.excludePhase) continue
            if (effect.turn === "own" && pid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && pid === state.turnPlayer) continue
            // ownOnly（BS06冥騎士アンドラー／冥府の深淵）：発生源の持ち主（pid）のスピリットがアタックしたときのみ
            // （selfOverride.pidが発生源の持ち主と一致するときだけ通す。「自分のスピリットが」の限定）
            if (effect.ownOnly && selfOverride?.pid !== pid) continue
            if (effect.colorFilter !== undefined && !(eventColors ?? []).includes(effect.colorFilter)) continue
            if (effect.vanillaOnly && !eventInfo?.vanilla) continue
            if (effect.byBattleOnly && !eventInfo?.byBattle) continue
            // 「アタックした自分のスピリットが破壊されるたび」（BS06ベリアルドロー）：
            // ブロッカーとして破壊された場合は発火させない
            if (effect.attackerOnly && !eventInfo?.wasAttacker) continue
            // 「相手のスピリット/ネクサス/マジックの効果で破壊されたとき」（BS07の各色ネクサス6枚）：
            // 自分の効果で自分のネクサスを壊した場合や、発生源が不明な破壊では発火しない
            if (effect.byOpponentEffectOnly && !eventInfo?.byOpponentEffect) continue
            // 破壊/消滅したスピリットのコストで絞る（BS05天使クレイオ：コスト2）。
            // 道化師クランの付与コストも見るため、eventInfo.costsのいずれかが条件を満たせばよい
            if (
                effect.costFilter !== undefined &&
                !(eventInfo?.costs ?? []).some((c) => matchesCostFilter(c, effect.costFilter))
            ) {
                continue
            }
            // アタックしたスピリット（selfOverride）の実効BPで絞る（BS08ダークスカルデーモン：BP6000以下）
            if (
                effect.maxBp !== undefined &&
                (selfOverride === undefined ||
                    effectiveBp(state, selfOverride.pid, selfOverride.inst) > effect.maxBp)
            ) {
                continue
            }
            // 「一度に◯枚以上破棄したとき」（アリゲイド）：eventCount が閾値以上のときのみ
            if (effect.minEventCount !== undefined && (eventCount ?? 0) < effect.minEventCount) continue
            // 相手のマジック使用（氷の女神フリッグ）：コスト／タイミングの一致で絞る
            if (effect.magicCostEquals !== undefined && eventInfo?.magicCost !== effect.magicCostEquals) continue
            if (effect.magicTiming !== undefined && eventInfo?.magicTiming !== effect.magicTiming) continue
            // 「このスピリットが疲労したとき」（スクルディア）：イベント対象が発生源自身のときだけ
            if (effect.eventTargetIsSelf && selfOverride?.inst.instanceId !== inst.instanceId) continue
            // 「[カード名]以外の」の除外（BS06鉄拳のカクタスガルー）：イベント対象が発生源自身のときは発火しない
            if (effect.excludeSelfAsEventTarget && selfOverride?.inst.instanceId === inst.instanceId) continue
            // イベント対象のカード名で絞る（BS05ペンタン帝国Lv2：「ペンタン」/「アンプルール」）。
            // event: "ownTensho" はselfOverrideを渡さないため、eventInfo.names（【転召】の犠牲になった
            // スピリットのカード名）があればそちらで判定する（BS08魔界七将アスモディオス）
            if (effect.nameIncludes !== undefined) {
                const nameOk =
                    eventInfo?.names !== undefined
                        ? effect.nameIncludes.some((n) => eventInfo.names?.some((name) => name.includes(n)))
                        : selfOverride !== undefined &&
                          effect.nameIncludes.some((n) => cardNameContains(selfOverride.inst, n))
                if (!nameOk) continue
            }
            // targetInstanceId のスピリットのLvがイベント対象と同じときだけ
            // （BS05ペンタン帝国Lv2：同じLvの相手のスピリットにブロックされたとき）
            if (effect.targetSameLevelAsSelf) {
                const target = targetInstanceId ? findInstanceAnywhere(state, targetInstanceId) : null
                if (!target || !selfOverride) continue
                if (currentLevel(target).level !== currentLevel(selfOverride.inst).level) continue
            }
            if (effect.familyFilter !== undefined) {
                // 配列指定はいずれかの系統を持てばよい（OR。BS04七龍帝の玉座＝古竜/龍帝）
                const wanted = Array.isArray(effect.familyFilter)
                    ? effect.familyFilter
                    : [effect.familyFilter]
                const ok =
                    eventInfo?.families !== undefined
                        ? // 破壊/召喚イベント：呼び出し側が渡した**カード静的な系統**で判定する（従来どおり）
                          wanted.some((f) => eventInfo.families?.includes(f))
                        : // families を渡さないイベント（疲労）：継続付与された系統も含めて判定する
                          // （BS02生み出される尖兵：自身のLv1が与える「武装」を Lv2 が見る）
                          selfOverride !== undefined &&
                          matchesFamilyFilter(state, selfOverride.pid, selfOverride.inst, effect.familyFilter)
                if (!ok) continue
            }
            // 【不死】の効果で召喚されたときのみ（BS09-013ミミズクロ）。通常の召喚では発火しない
            if (effect.fushiSummonOnly && eventInfo?.byFushi !== true) continue
            // 召喚されたスピリットがこのキーワードを静的に持つときのみ（BS05最古龍の顎：転召持ちが召喚されたとき）。
            // anySpiritAttacked / ownSpiritDealtLife 限定：イベント対象（アタックした／ライフを減らしたスピリット）の
            // 状態を考慮したキーワード判定（静的・一時付与・継続付与。冥府の深淵の継続付与でも発火させるため。BS06）
            if (effect.keywordFilter !== undefined) {
                const hasKw =
                    (event === "anySpiritAttacked" || event === "ownSpiritDealtLife") && selfOverride !== undefined
                        ? spiritHasKeyword(state, selfOverride.pid, selfOverride.inst, effect.keywordFilter)
                        : hasKeyword((selfOverride?.inst ?? inst).cardId, effect.keywordFilter)
                if (!hasKw) continue
            }
            if (effect.condition) {
                if (effect.condition === "selfIsAttacking") {
                    // キノコノコ：発生源自身が現在のバトルのアタッカーであるときのみ
                    if (!state.battle || state.battle.attackerInstanceId !== inst.instanceId) continue
                } else if ("firstAttackOfTurn" in effect.condition) {
                    // 神鳴る霊峰Lv2：そのターンの最初のアタックのときのみ（triggered.conditionの同名軸と同じ判定）
                    if (state.attacksThisTurn !== 1) continue
                } else if ("targetMaxBp" in effect.condition) {
                    // BS08竜騎集う円卓：ライフを減らしたスピリット（targetInstanceId＝アタッカー）の
                    // 実効BPがこれ以下のときのみ（見つからなければ発火しない）
                    if (targetInstanceId === undefined) continue
                    const found = findSpiritAny(state, targetInstanceId)
                    if (!found) continue
                    if (effectiveBp(state, found.pid, found.inst) > effect.condition.targetMaxBp) continue
                } else if ("ownColorTotalAtLeast" in effect.condition) {
                    // 花の子リップ：発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上
                    const { color, count } = effect.condition.ownColorTotalAtLeast
                    const sources = [...player.field.spirits, ...player.field.nexuses]
                    const total = sources.filter((s) => instHasColor(s, color)).length
                    if (total < count) continue
                } else if ("ownFamilyCountAtLeast" in effect.condition) {
                    // 魔力満ちる泉：発生源の持ち主のフィールドに指定系統のスピリットがcount体以上
                    const { family, count } = effect.condition.ownFamilyCountAtLeast
                    const total = countSpiritsWeighted(
                        state,
                        pid,
                        pid,
                        (s) => matchesFamilyFilter(state, pid, s, family),
                        getCard(inst.cardId).type,
                    )
                    if (total < count) continue
                } else if ("ownFieldHasColorNexus" in effect.condition) {
                    // 修理屋バラン・バラン：発生源の持ち主のフィールドに指定色のネクサスがある
                    const color = effect.condition.ownFieldHasColorNexus
                    if (!player.field.nexuses.some((n) => instHasColor(n, color))) continue
                } else {
                    // BS08デストラクションバリア：ライフを減らしたスピリットが指定キーワードを持つときは発火しない
                    if (targetInstanceId === undefined) continue
                    const found = findSpiritAny(state, targetInstanceId)
                    if (!found) continue
                    if (spiritHasKeyword(state, found.pid, found.inst, effect.condition.targetKeywordExclude)) continue
                }
            }
            // repeatPerCount（バラン・バラン「置かれるたび」）: 実破棄枚数ぶんアクションを繰り返す。
            // countMode:"cores"（希望の大灯台Lv1）指定時は、影響を受けたスピリット数(eventCount)ではなく
            // 取り除かれたコア数(eventInfo.coresRemoved)を繰り返し回数にする（省略時は従来どおりeventCount）
            const repeatTimes = effect.repeatPerCount
                ? effect.countMode === "cores" && eventInfo?.coresRemoved !== undefined
                    ? eventInfo.coresRemoved
                    : eventCount
                      ? eventCount
                      : 1
                : 1
            for (let i = 0; i < repeatTimes; i++) {
                // 「〜できる」（optional）は実対戦では発動可否を確認する（triggered/step/battleWonと同じ扱い。
                // interactiveTargets=false（テスト）では従来どおり常に発動する。BS08聖なる柱状彫刻Lv2）
                if (effect.optional && state.interactiveTargets) {
                    const actionPid = effect.selfMode === "source" ? pid : (selfOverride?.pid ?? pid)
                    const actionSelf = effect.selfMode === "source" ? inst : (selfOverride?.inst ?? inst)
                    requestActivationConfirm(state, actionPid, `${card.name}の効果を発動しますか？`, effect.action, actionSelf)
                    if (state.pendingChoice) return
                    continue
                }
                // selfMode:"source" 指定時は、イベント対象ではなく発生源自身を self にする
                // （BS04鎧装獣ヘイズ・ルーン：相手のコスト1以下がアタックしたとき「このスピリットは回復する」）
                if (effect.selfMode === "source") {
                    resolveAction(state, pid, inst, effect.action, targetInstanceId)
                } else if (selfOverride) {
                    // self はイベント対象（召喚されたスピリット等。filter の self 相対BPが参照する）だが、
                    // **効果の発生源はこのエントリを持つカード（inst）**。装甲・マジック効果耐性の判定に使う
                    // 色と種別は発生源のものを明示的に渡す（渡さないと self から導出され、
                    // 「召喚されたスピリットの色で装甲を判定する」誤りになる。BS04七龍帝の玉座／鋼葉の樹林）
                    resolveAction(
                        state,
                        selfOverride.pid,
                        selfOverride.inst,
                        effect.action,
                        targetInstanceId,
                        instColors(inst),
                        getCard(inst.cardId).type,
                    )
                } else {
                    resolveAction(state, pid, inst, effect.action, targetInstanceId)
                }
                if (state.winner) return
                if (state.pendingChoice) return
            }
        }
    }
}

// フィールドイベント誘発「持ち主から見て相手の手札にカードが加えられたとき」：
// 手札を得たプレイヤー(gainerPid)の相手側フィールドから発火する（犬人マードック／英雄の喪失）。
// ドロー・トラッシュ回収・deckReveal・バウンス（ネクサス／スピリット）・reviveOnDestroy の
// toHand など、初期手札配布を除く手札加入箇所すべてから呼ぶ。count省略時/0以下・勝敗確定後は何もしない
export function notifyHandGained(state: GameState, gainerPid: PlayerId, count: number): void {
    if (count < 1 || state.winner) return
    fireFieldEventTriggers(state, opponentOf(gainerPid), "opponentHandAdded", undefined, undefined, undefined, count)
}

// フィールドイベント誘発「自分のフィールドにネクサスが配置されたとき」（BS04栄光の表彰台Lv2）。
// 通常の配置（GameEngine.doSetNexus）・効果による配置（deployNexus）・破壊されたネクサスの復活の
// いずれからも呼ぶ。ネクサスを1つ置くたびに1回発火する（「配置されるたび」）
export function notifyNexusDeployed(state: GameState, ownerPid: PlayerId): void {
    if (state.winner) return
    fireFieldEventTriggers(state, ownerPid, "ownNexusDeployed")
}

// 封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）：「お互いを対象とするマジックの効果」の
// 対象を片側だけに変更する。両陣営を対象にするアクション（destroyNexus side:"both" / bothSidesCoreToTrash /
// bothSidesCoreToVoid / exhaustAll side:"both" / returnAllToHand side:"both" / nexusCoresToTrash side:"both" /
// draw side:"both" / discardBothHands）は、ハードコードの ["p1","p2"] の代わりにこれを呼ぶ。
// beneficial=true は「受ける側にとって得な効果」（ドロー）で、そのときだけ相手を外す。
// マジック以外の発生源（スピリット・ネクサスの効果）は対象外なので、そのまま両陣営を返す
export function bothSidesPids(
    state: GameState,
    srcType: CardType | undefined,
    beneficial = false,
): PlayerId[] {
    const all: PlayerId[] = ["p1", "p2"]
    if (srcType !== "magic") return all
    const found = findBothSidesRedirectSource(state)
    if (!found) return all
    // 対話モードでは、どちらに変更するかを魔導書の持ち主に確認済み（resolveMagic が1回だけ聞く）。
    // 「変更しない」を選んでいたら両陣営のまま（『〜に変更できる』の任意性）
    const decision = state.magicSideDecision
    if (decision && decision.sourceInstanceId === found.inst.instanceId) {
        if (decision.keepPid === null) return all
        log(
            state,
            `${getCard(found.inst.cardId).name}：このマジックの効果の対象を${state.players[decision.keepPid].name}のみに変更した。`,
        )
        return [decision.keepPid]
    }
    // 決定が無い＝非対話（テスト・自動解決）なので、従来どおり持ち主に有利な側へ固定する
    const excluded = beneficial ? opponentOf(found.pid) : found.pid
    log(
        state,
        `${getCard(found.inst.cardId).name}：このマジックの効果の対象を${state.players[opponentOf(excluded)].name}のみに変更した。（どちらに変更するかは簡略化）`,
    )
    return all.filter((p) => p !== excluded)
}

// 封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）の発生源を探す。
// **どちらに変更するか（あるいは変更しないか）は呼び出し側が決める**。
// resolveMagic の事前確認（このマジックで対象変更が起こりうるか）と、実際に絞り込む
// bothSidesPids / anySide の候補列挙が共用する。相手が使ったマジックにも効くので両陣営を走査する
// （選ぶのはあくまで発生源の持ち主。docs/design/CHOOSER_RULES.md）
export function findBothSidesRedirectSource(
    state: GameState,
): { pid: PlayerId; inst: CardInstance } | null {
    for (const ownerPid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, ownerPid)) {
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "bothSidesTargetRedirect") continue
                if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
                return { pid: ownerPid, inst: source }
            }
        }
    }
    return null
}

// 封印された魔導書Lv1 の答えのうち「**対象として残る側**」を返す（null＝絞らない）。
// 「お互いを対象とする効果」（bothSidesPids）だけでなく、**陣営を指定していない単体対象**
// （action.anySide の「スピリット1体」「ネクサス1つ」）にも効かせるためのもの。
// **マジックの効果にだけ効く**のは bothSidesPids と同じで、決定が無いとき
// （非対話・魔導書が無い・「変更しない」を選んだ）は null を返して素通しさせる
export function bothSidesRedirectKeepPid(
    state: GameState,
    sourceType: "spirit" | "nexus" | "magic" | undefined,
): PlayerId | null {
    if (sourceType !== "magic") return null
    const decision = state.magicSideDecision
    if (!decision || decision.keepPid === null) return null
    const found = findBothSidesRedirectSource(state)
    if (!found || found.inst.instanceId !== decision.sourceInstanceId) return null
    return decision.keepPid
}

// 上の答えで候補列挙（pickAnySideCandidates）を片側に絞る。スピリットとネクサスの両方を見る
// （「ネクサス1つ」を対象にする anySide があるため。BS03メビウスリング）
export function applyBothSidesRedirectToCandidates(
    state: GameState,
    sourceType: "spirit" | "nexus" | "magic" | undefined,
    candidates: CardInstance[],
): CardInstance[] {
    const keepPid = bothSidesRedirectKeepPid(state, sourceType)
    if (keepPid === null) return candidates
    const keep = state.players[keepPid].field
    const ids = new Set([...keep.spirits, ...keep.nexuses].map((c) => c.instanceId))
    return candidates.filter((c) => ids.has(c.instanceId))
}

// 果て無き地平線Lv1（kind:"battleBpAsLevel"）：バトルのBP比較のときだけ、指定レベルのスピリットが
// 別のレベルのBPを使う。effectiveBp（バフ・オーラ込み）に「使うレベルのBP − 本来のレベルのBP」の差を足す形で
// 実装するので、BP増減の効果とは独立して働く。GameEngine.resolveBattle からのみ呼ぶ
// （効果の対象条件やオーラのBP判定には影響させない ＝「バトルでBPを比べるとき」の限定を守る）
export function battleBp(state: GameState, pid: PlayerId, inst: CardInstance): number {
    const base = effectiveBp(state, pid, inst)
    const level = currentLevel(inst).level
    // side:"both"（BS09-073オンザエッジ＝「スピリットすべては」）は相手の発生源からも効くので、
    // 対象の持ち主だけでなく両陣営の発生源を走査する
    const sourcePids: PlayerId[] = [pid, opponentOf(pid)]
    for (const sourcePid of sourcePids)
    for (const source of effectSources(state, sourcePid)) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "battleBpAsLevel") continue
            // 相手側の発生源は side:"both" のエントリだけが効く
            if (sourcePid !== pid && effect.side !== "both") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.fromLevel !== level) continue
            // keywordFilter（BS06神葉樹の森Lv2）：指定キーワードを持つスピリットのみ対象
            if (effect.keywordFilter && !spiritHasKeyword(state, pid, inst, effect.keywordFilter)) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && sourcePid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && sourcePid === state.turnPlayer) continue
            }
            const levels = getCard(inst.cardId).levels
            const from = levels.find((l) => l.level === effect.fromLevel)
            const use = levels.find((l) => l.level === effect.useLevel)
            if (!from || !use) continue
            return base + (use.bp - from.bp)
        }
    }
    return base
}

// 魔影街Lv1（kind:"jugekiCoreToVoid"）：アタッカー側のフィールドに発生源がある間、
// 【呪撃】で破壊される相手スピリット上のコアを指定個数ボイドへ置く。
// GameEngine の呪撃解決が destroySpirit の**直前**に呼ぶ（破壊後だとコアは持ち主のリザーブへ
// 移っており「そのスピリット上のコア」を取れないため）。ボイド行きなのでリザーブには戻らない
export function applyJugekiCoreToVoid(
    state: GameState,
    attackerPid: PlayerId,
    victimPid: PlayerId,
    victim: CardInstance,
): void {
    for (const source of effectSources(state, attackerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "jugekiCoreToVoid") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            const removed = Math.min(effect.count, victim.cores)
            if (removed === 0) continue
            victim.cores -= removed
            log(
                state,
                `${getCard(source.cardId).name}：【呪撃】で破壊される${getCard(victim.cardId).name}のコア${removed}個をボイドに置いた。`,
            )
            notifySpiritCoresRemovedByOpponent(state, victimPid, 1, removed)
        }
    }
}

// フィールドイベント誘発「自分のスピリット上のコアが相手の効果でリザーブ/トラッシュへ置かれたとき」
// （極光の大地）。spiritOwnerPid視点で発火し、affectedCount=影響を受けたスピリット数（従来どおりのeventCount）。
// removedCoreCount指定時は「取り除かれたコア数」も渡す（countMode:"cores"のエントリのみ使う。BS06希望の大灯台Lv1）。
// removeCores / removeCoresToTrash / removeCoresToVoid（actorPid !== ownerPidのとき）から呼ばれる
export function notifySpiritCoresRemovedByOpponent(
    state: GameState,
    spiritOwnerPid: PlayerId,
    affectedCount: number,
    removedCoreCount?: number,
): void {
    if (affectedCount < 1 || state.winner) return
    fireFieldEventTriggers(
        state,
        spiritOwnerPid,
        "ownSpiritCoresRemovedByOpponent",
        undefined,
        undefined,
        undefined,
        affectedCount,
        removedCoreCount !== undefined ? { coresRemoved: removedCoreCount } : undefined,
    )
}

// マジックカードの効果を実行する（timing に一致するすべての効果を配列順に実行）。
// 「ドロー＋バフ」のような複合テキストは effects に複数エントリを並べて表現する。
// アルカナソルジャー・サンクLv2（kind:"magicTargetRedirect"）の判定。
// 「相手がこのスピリットを対象に含むマジックの効果を使用したとき、その対象をこのスピリットのみにできる」。
// 「できる」は自動適用の簡略化（magicFreeGrant と同じ扱い）。
// 対象に含むかの判定:
//   - 明示ターゲットあり → それがサンク自身のときだけ絞り込む（他の1体を選んだならサンクは対象外）
//   - 明示ターゲットなし（全体効果・自動選択） → 対象に含むものとして絞り込む
//     （利用者確認：マジックの「対象」には全体を含む効果も含まれる。DECISIONS.md）
function setTargetRedirect(
    state: GameState,
    casterPid: PlayerId,
    targetInstanceId: string | undefined,
    action: EffectAction,
): void {
    delete state.magicRedirectTo
    const found = findMagicRedirectSource(state, casterPid, targetInstanceId, action)
    if (!found) return
    // 対話モードでは、絞り込むかどうかを発生源の持ち主（＝守る側）に確認済み。
    // 「しない」を選んでいたら絞り込まない（『〜にできる』の任意性。BS04サンク／BS05スノーホワイト）。
    // 決定が無い＝非対話（テスト・自動解決）なので、従来どおり自動で絞り込む
    const decision = state.magicRedirectDecision
    if (decision && decision.sourceInstanceId === found.instanceId && !decision.approved) return
    state.magicRedirectTo = { pid: opponentOf(casterPid), instanceId: found.instanceId }
    log(
        state,
        `${getCard(found.cardId).name}：このマジックの効果の対象を、このスピリットのみにした。`,
    )
}

// magicTargetRedirect の発生源を探す（実際に絞り込むかは呼び出し側が決める）。
// resolveMagic の事前確認（このマジックで絞り込みが起こりうるか）と setMagicRedirect が共用する
function findMagicRedirectSource(
    state: GameState,
    casterPid: PlayerId,
    targetInstanceId: string | undefined,
    action: EffectAction,
): CardInstance | null {
    const defenderPid = opponentOf(casterPid)
    for (const inst of state.players[defenderPid].field.spirits) {
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "magicTargetRedirect") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(inst).level)) continue
            // 『相手のターン』＝発生源の持ち主がターンプレイヤーでないとき／『自分のターン』＝turnPlayerのとき
            if (effect.turn === "opponent" && defenderPid === state.turnPlayer) continue
            if (effect.turn === "own" && defenderPid !== state.turnPlayer) continue
            if (effect.protectFamily !== undefined || effect.protectCost !== undefined) {
                // スノーホワイト：守る対象は「持ち主の指定系統（＋指定色）のスピリット」で、
                // 絞り込み先は発生源自身。守る対象が1体も対象に含まれていなければ発動しない
                // （BS06細剣の猫騎士ケット・シー：protectCostで「持ち主の指定コストのスピリット」を守る同型版）
                const guarded = state.players[defenderPid].field.spirits.filter(
                    (s) =>
                        (effect.protectFamily === undefined ||
                            matchesFamilyFilter(state, defenderPid, s, effect.protectFamily)) &&
                        (effect.protectColor === undefined || instHasColor(s, effect.protectColor)) &&
                        (effect.protectCost === undefined || instHasCost(s, effect.protectCost)),
                )
                if (guarded.length === 0) continue
                const included =
                    targetInstanceId !== undefined
                        ? guarded.some((s) => s.instanceId === targetInstanceId)
                        : guarded.some((s) => redirectTargetMatches(state, defenderPid, s, action))
                if (!included) continue
            } else {
                if (targetInstanceId !== undefined && targetInstanceId !== inst.instanceId) continue
                // そもそもこのアクションの絞り込みに合致しなければ「対象に含む」ではない
                // （例: BP3000以下を破壊するマジックに対し、BP4000のサンクは対象外＝絞り込みは起きない）
                if (!redirectTargetMatches(state, defenderPid, inst, action)) continue
            }
            return inst
        }
    }
    return null
}

// 絞り込み対象（サンク）が、そのアクションの filter に合致するか。
// self 相対BP・バトル敗者参照など「マジック単体では解決できない軸」を含む場合は
// 判定できないため false（＝絞り込まない＝従来どおりの挙動）にする
function redirectTargetMatches(
    state: GameState,
    defenderPid: PlayerId,
    inst: CardInstance,
    action: EffectAction,
): boolean {
    const spec = (action as { filter?: TargetFilter }).filter
    if (!spec) return true
    if (spec.maxBp === "selfBp" || spec.minBp === "selfBp" || spec.exactBp === "selfBp") return false
    if (spec.sameColorAsBattleLoser || spec.sameFamilyAsBattleLoser) return false
    // ここまでで "selfBp" 系は除外済みなので、数値のみの ResolvedTargetFilter として扱える
    return matchesTarget(state, defenderPid, inst, spec as unknown as ResolvedTargetFilter)
}

// マジックを無効にできる発生源（kind:"magicNegate"）を、使用者の相手側のフィールドから探す。
// 見つからない条件（レベル・色・ステップ・ターン・ターン1回・コストが払えない）はすべてここで弾くので、
// 呼び出し側は「見つかったら必ず無効化できる」前提で書ける
// 【氷壁】の支払いを肩代わりできる、持ち主の回復状態のネクサス（BS09-062ノルンの泉）。
// 無ければ null。ノルンの泉自身も対象に含む（除外の記述が無いため）
function magicNegateNexusPayer(state: GameState, ownerPid: PlayerId): CardInstance | null {
    let granted = false
    for (const source of effectSources(state, ownerPid)) {
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "magicNegatePayByNexusGrant") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
            granted = true
        }
    }
    if (!granted) return null
    // BS09-063花の宮殿Lv2：相手がネクサスの疲労を禁じている間は肩代わりできない
    if (!canExhaustNexus(state, ownerPid)) return null
    return state.players[ownerPid].field.nexuses.find((n) => !n.isRested) ?? null
}

// 【氷壁】の発揮タイミングの置き換え（BS09-077アイスバーグ）。無ければ undefined
function magicNegateTurnOverride(state: GameState, ownerPid: PlayerId): "own" | "opponent" | undefined {
    for (const source of effectSources(state, ownerPid)) {
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "magicNegateTurnOverrideGrant") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            return effect.turn
        }
    }
    return undefined
}

export function findMagicNegateSource(
    state: GameState,
    casterPid: PlayerId,
    card: CardData,
): {
    pid: PlayerId
    inst: CardInstance
    effect: Extract<EffectDef, { kind: "magicNegate" }>
    nexusPayer?: CardInstance
} | null {
    const defenderPid = opponentOf(casterPid)
    // 【氷壁】限定の支払い代替・タイミング置換（BS09-062ノルンの泉／BS09-077アイスバーグ）
    const nexusPayer = magicNegateNexusPayer(state, defenderPid)
    const turnOverride = magicNegateTurnOverride(state, defenderPid)
    for (const inst of effectSources(state, defenderPid)) {
        const level = currentLevel(inst).level
        const isHyoheki = hasKeyword(inst.cardId, "hyoheki")
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "magicNegate") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            // 【氷壁】を持つスピリットだけ、発揮タイミングを置き換えられる
            const turn = isHyoheki && turnOverride !== undefined ? turnOverride : effect.turn
            if (turn === "own" && defenderPid !== state.turnPlayer) continue
            if (turn === "opponent" && defenderPid === state.turnPlayer) continue
            // 【氷壁：赤】＝赤のマジックのみ無効にできる
            if (effect.colors !== undefined && !effect.colors.some((c) => card.colors.includes(c))) continue
            if (effect.oncePerTurn && inst.magicNegateUsedTurn === state.turn) continue
            // コストを払えないなら発動できない。
            // 【氷壁】はネクサスの疲労で肩代わりできる（ノルンの泉）。**代替できるときはそちらを優先**して
            // スピリットを回復状態のまま残す（プレイヤー選択の決定的簡略化）
            const payer = isHyoheki && nexusPayer ? nexusPayer : null
            if ("exhaustSelf" in effect.cost) {
                if (!payer && inst.isRested) continue
            } else if (inst.cores < effect.cost.selfCoresToVoid) {
                continue
            }
            return payer && "exhaustSelf" in effect.cost
                ? { pid: defenderPid, inst, effect, nexusPayer: payer }
                : { pid: defenderPid, inst, effect }
        }
    }
    return null
}

// 無効化のコストを支払い、ログを残す。呼び出し側はこのあとマジックの効果を解決しない
function payMagicNegate(
    state: GameState,
    found: {
        pid: PlayerId
        inst: CardInstance
        effect: Extract<EffectDef, { kind: "magicNegate" }>
        nexusPayer?: CardInstance
    },
    card: CardData,
): void {
    const { pid, inst, effect } = found
    if ("exhaustSelf" in effect.cost) {
        if (found.nexusPayer) {
            // ノルンの泉：スピリットの代わりにネクサス1つを疲労させる
            found.nexusPayer.isRested = true
            log(state, `${getCard(found.nexusPayer.cardId).name}（ネクサス）を代わりに疲労させた。`)
        } else {
            exhaustSpirit(state, pid, inst)
        }
    } else {
        // ボイド行きなので、リザーブにもトラッシュにも戻らない
        inst.cores -= effect.cost.selfCoresToVoid
        log(
            state,
            `${getCard(inst.cardId).name}：コア${effect.cost.selfCoresToVoid}個をボイドに置いた。`,
        )
    }
    if (effect.oncePerTurn) inst.magicNegateUsedTurn = state.turn
    log(state, `${getCard(inst.cardId).name}の効果で、${card.name}の効果は無効になった。`)
}

export function resolveMagic(
    state: GameState,
    owner: PlayerId,
    cardId: string,
    timing: "main" | "flash",
    targetInstanceId?: string,
): void {
    // 【光芒】用: バトル中の使用ならアタッカー側の usedMagicCardIds に記録する
    // （バトル終了時にこの中からトラッシュ→手札へ戻す）
    if (state.battle) {
        if (!state.battle.usedMagicCardIds) {
            state.battle.usedMagicCardIds = { p1: [], p2: [] }
        }
        state.battle.usedMagicCardIds[owner].push(cardId)
    }
    const card = getCard(cardId)
    // oncePerBattle の無償化（BS07大天使イスフィール＝「マジックカード1枚を」）は、ここで使い切る。
    // 再発揮（magicRepeatGrant）の消費は resolveMagicEffects 側で別に記録するので、
    // この記録によって**同じ1枚目の再発揮まで消えることはない**
    // 「あえてコストを払って使う」を選んでいたら、1枚きりの無償枠は消費しない（2026-08-15 ユーザー確認）。
    // doCastMagic が直前に立てるフラグなので、読んだらすぐ消す
    const declinedFree = state.magicFreeDeclined === true
    delete state.magicFreeDeclined
    if (!declinedFree) consumeOncePerBattleMagicFree(state, owner, card)
    emitEvent(state, { type: "magic", pid: owner, cardName: card.name })

    // マジックの無効化（鏡の回廊Lv2／今後の【氷壁】）。効果を1つも解決する前に判定する。
    // 実対戦（interactiveTargets）では防御側に「無効にするか」を確認し、
    // 自動解決（テスト・非interactive）ではコストを払える限り無効にする
    const negate = findMagicNegateSource(state, owner, card)
    if (negate) {
        if (state.interactiveTargets) {
            suspend(state, {
                pid: negate.pid,
                kind: "option",
                prompt: `${getCard(negate.inst.cardId).name}：${card.name}の効果を無効にしますか？`,
                candidates: [],
                options: ["無効にする"],
                optional: true,
                confirm: true,
                magicNegate: {
                    casterPid: owner,
                    cardId,
                    timing,
                    targetInstanceId,
                    sourceInstanceId: negate.inst.instanceId,
                },
                action: { type: "noop" },
                selfInstanceId: negate.inst.instanceId,
            })
            return
        }
        payMagicNegate(state, negate, card)
        fireMagicUsedTriggers(state, owner, card, timing)
        return
    }

    // 対象の絞り込み（BS04サンク／BS05スノーホワイト）は「〜にできる」＝任意なので、
    // 守る側に1回だけ確認する。**このマジックの効果のどれかで実際に絞り込みが起こる場合だけ聞く**
    // （聞いても意味がない場面で確認を出さないため）。答えはマジックの解決中ずっと使い回す
    delete state.magicRedirectDecision
    if (state.interactiveTargets) {
        const redirectSource = findMagicRedirectSourceForCard(state, owner, card, timing, targetInstanceId)
        if (redirectSource) {
            suspend(state, {
                pid: opponentOf(owner),
                kind: "option",
                prompt: `${getCard(redirectSource.cardId).name}：${card.name}の効果の対象を、このスピリットのみにしますか？`,
                candidates: [],
                options: ["このスピリットのみにする"],
                optional: true,
                confirm: true,
                magicRedirect: {
                    casterPid: owner,
                    cardId,
                    timing,
                    targetInstanceId,
                    sourceInstanceId: redirectSource.instanceId,
                },
                action: { type: "noop" },
                selfInstanceId: redirectSource.instanceId,
            })
            return
        }
    }

    if (askBothSidesRedirect(state, owner, card, timing, targetInstanceId)) return
    resolveMagicEffects(state, owner, cardId, timing, targetInstanceId)
}

// 封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）の「対象を相手のみ／自分のみに変更できる」の確認。
// 出したら true（中断）を返す。**このマジックが実際に両陣営に関わる場合だけ**聞く
// （相手だけを対象にする大多数のマジックで確認を出さないため）。答えはマジックの解決中ずっと使い回す
function askBothSidesRedirect(
    state: GameState,
    owner: PlayerId,
    card: CardData,
    timing: "main" | "flash",
    targetInstanceId: string | undefined,
): boolean {
    delete state.magicSideDecision
    if (!state.interactiveTargets) return false
    const found = findBothSidesRedirectSource(state)
    if (!found) return false
    const touches = card.effects.some(
        (e) => e.kind === "magic" && e.timing === timing && actionTouchesBothSides(e.action),
    )
    if (!touches) return false
    suspend(state, {
        pid: found.pid, // 選ぶのは**魔導書の持ち主**（マジックの使用者とは限らない）
        kind: "option",
        prompt: `${getCard(found.inst.cardId).name}：${card.name}の効果の対象を変更しますか？`,
        candidates: [],
        options: BOTH_SIDES_REDIRECT_OPTIONS,
        optional: false,
        magicSideChoice: {
            casterPid: owner,
            cardId: card.cardId,
            timing,
            targetInstanceId,
            sourceInstanceId: found.inst.instanceId,
            ownerPid: found.pid,
        },
        action: { type: "noop" },
        selfInstanceId: found.inst.instanceId,
    })
    return true
}

// 確認の選択肢。**この並び順に GameEngine.doResolveChoice が依存する**（0=変更しない / 1=相手のみ / 2=自分のみ）。
// 「相手」「自分」はどちらも**魔導書の持ち主から見た**呼び方
export const BOTH_SIDES_REDIRECT_OPTIONS = ["変更しない", "相手のみ", "自分のみ"]

// 「お互いを対象とする」効果（side:"both" 等）か、陣営を指定しない単体対象（anySide）を含むか。
// EffectAction は判別共用体で、両陣営を示す印が型ごとに散らばっているため、
// **ここだけは値として再帰的に**走査する（新しい action を足しても印さえ同じなら追随不要）
const BOTH_SIDES_ACTION_TYPES = new Set([
    "bothSidesCoreToTrash",
    "bothSidesCoreToVoid",
    "discardBothHands",
])
function actionTouchesBothSides(node: unknown): boolean {
    if (Array.isArray(node)) return node.some(actionTouchesBothSides)
    if (node === null || typeof node !== "object") return false
    const o = node as Record<string, unknown>
    if (o["anySide"] === true) return true
    if (o["side"] === "both") return true
    if (o["target"] === "anyAll") return true
    if (typeof o["type"] === "string" && BOTH_SIDES_ACTION_TYPES.has(o["type"])) return true
    return Object.values(o).some(actionTouchesBothSides)
}

// pendingChoice（対象の変更の確認）の後処理。keepPid=null なら変更せず、
// それ以外はその側だけを対象として中断していた解決を続ける。GameEngine.doResolveChoice から呼ぶ
export function applyMagicSideChoice(
    state: GameState,
    info: NonNullable<PendingChoice["magicSideChoice"]>,
    keepPid: PlayerId | null,
): void {
    state.magicSideDecision = { sourceInstanceId: info.sourceInstanceId, keepPid }
    if (keepPid === null) {
        const source = findInstanceAnywhere(state, info.sourceInstanceId)
        const name = source ? getCard(source.cardId).name : "効果"
        log(state, `${name}：${getCard(info.cardId).name}の効果の対象を変更しなかった。`)
    }
    resolveMagicEffects(state, info.casterPid, info.cardId, info.timing, info.targetInstanceId)
}

// このマジックが解決する効果のうち、1つでも magicTargetRedirect の絞り込み対象になるものがあるか。
// あればその発生源を返す（確認を出すかどうかの事前判定。runMagicActions と同じ timing 絞り込みを使う）
function findMagicRedirectSourceForCard(
    state: GameState,
    casterPid: PlayerId,
    card: CardData,
    timing: "main" | "flash",
    targetInstanceId: string | undefined,
): CardInstance | null {
    for (const effect of card.effects) {
        if (effect.kind !== "magic" || effect.timing !== timing) continue
        const found = findMagicRedirectSource(state, casterPid, targetInstanceId, effect.action)
        if (found) return found
    }
    return null
}

// pendingChoice（対象の絞り込みの確認）の後処理。承認・拒否のどちらでも、中断していた解決を続ける。
// GameEngine.doResolveChoice から呼ぶ
export function applyMagicRedirectChoice(
    state: GameState,
    info: NonNullable<PendingChoice["magicRedirect"]>,
    approved: boolean,
): void {
    state.magicRedirectDecision = { sourceInstanceId: info.sourceInstanceId, approved }
    // 絞り込みの確認で中断していた場合も、封印された魔導書の確認はここで出す（解決へ直行させない）
    if (askBothSidesRedirect(state, info.casterPid, getCard(info.cardId), info.timing, info.targetInstanceId)) return
    resolveMagicEffects(state, info.casterPid, info.cardId, info.timing, info.targetInstanceId)
}

// pendingChoice（無効化の確認）で「無効にする」が選ばれたときの後処理。
// GameEngine.doResolveChoice から呼ぶ
export function applyMagicNegateChoice(
    state: GameState,
    info: NonNullable<PendingChoice["magicNegate"]>,
): void {
    const card = getCard(info.cardId)
    const found = findMagicNegateSource(state, info.casterPid, card)
    // 確認を出したあとに盤面が変わってコストを払えなくなった場合は、無効化せず通常どおり解決する
    if (!found || found.inst.instanceId !== info.sourceInstanceId) {
        resolveMagicEffects(state, info.casterPid, info.cardId, info.timing, info.targetInstanceId)
        return
    }
    payMagicNegate(state, found, card)
    fireMagicUsedTriggers(state, info.casterPid, card, info.timing)
}

// pendingChoice（無効化の確認）で「無効にしない」が選ばれたときの後処理。中断していた解決を続ける
export function declineMagicNegateChoice(
    state: GameState,
    info: NonNullable<PendingChoice["magicNegate"]>,
): void {
    resolveMagicEffects(state, info.casterPid, info.cardId, info.timing, info.targetInstanceId)
}

// マジックの効果本体の解決。resolveMagic から（無効化されなかったときに）呼ぶ。
// usedMagicCardIds への記録と emitEvent は resolveMagic 側で済ませてあるので、ここでは行わない
export function resolveMagicEffects(
    state: GameState,
    owner: PlayerId,
    cardId: string,
    timing: "main" | "flash",
    targetInstanceId?: string,
): void {
    // BS07大天使イスフィール：使用者のフィールドに magicRepeatGrant が有効な発生源があれば、
    // 効果の並びをもう1周する。判定は1周目を始める前に固定する（1周目の結果で発生源が場を離れても
    // 「発揮後にもう1度」は約束どおり行う）
    const repeatSource = findMagicRepeatGrantSource(state, owner)
    runMagicActions(state, owner, cardId, timing, targetInstanceId)
    // 選択待ちで中断したときは、残りの効果を pendingChoice の queue が引き継いでいるのでここで抜ける
    if (state.pendingChoice) return
    if (repeatSource && !state.winner) {
        // 「もう1度だけ発揮**できる**」＝任意なので、1周目が解決しきってから聞く（2026-08-15 ユーザー確認）。
        // 非対話（テスト・自動解決）では従来どおり自動で2周目を走らせる
        if (state.interactiveTargets) {
            suspend(state, {
                pid: owner,
                kind: "option",
                prompt: `${getCard(repeatSource.cardId).name}：${getCard(cardId).name}の効果をもう1度発揮しますか？`,
                candidates: [],
                options: MAGIC_REPEAT_OPTIONS,
                optional: false,
                magicRepeat: {
                    casterPid: owner,
                    cardId,
                    timing,
                    targetInstanceId,
                    sourceInstanceId: repeatSource.instanceId,
                },
                action: { type: "noop" },
                selfInstanceId: repeatSource.instanceId,
            })
            return
        }
        consumeMagicRepeatGrant(state, repeatSource)
        log(state, `${getCard(cardId).name}の効果をもう1度発揮する。`)
        runMagicActions(state, owner, cardId, timing, targetInstanceId)
        if (state.pendingChoice) return
    }
    fireMagicUsedTriggers(state, owner, getCard(cardId), timing)
}

// 使用者pidのフィールドにある、kind:"magicRepeatGrant" の有効な発生源を返す（BS07大天使イスフィール）。
// **消費（oncePerBattle の記録）はここでは行わない**：再発揮は「もう1度発揮**できる**」＝任意で、
// 発揮しないことを選んだときは枠を使っていないので残す（2026-08-15 ユーザー確認）。
// 消費は実際に2周目を走らせる直前に consumeMagicRepeatGrant で行う
// （無償化側とは消費点が違うのでリストを分けている＝BattleState のコメント参照）
function findMagicRepeatGrantSource(state: GameState, pid: PlayerId): CardInstance | null {
    for (const source of effectSources(state, pid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "magicRepeatGrant") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.condition === "selfInBattle" && !isSelfInBattle(state, source.instanceId)) continue
            if (effect.oncePerBattle) {
                if (!state.battle) continue // バトル外では消費を記録できないので成立させない
                if ((state.battle.oncePerBattleMagicRepeatUsed ?? []).includes(source.instanceId)) continue
            }
            return source
        }
    }
    return null
}

// 上で見つけた発生源を「このバトルで使い切った」として記録する（oncePerBattle のときだけ）
function consumeMagicRepeatGrant(state: GameState, source: CardInstance): void {
    const oncePerBattle = getCard(source.cardId).effects.some(
        (e) => e.kind === "magicRepeatGrant" && e.oncePerBattle,
    )
    if (!oncePerBattle || !state.battle) return
    const used = (state.battle.oncePerBattleMagicRepeatUsed ??= [])
    if (!used.includes(source.instanceId)) used.push(source.instanceId)
}

// 再発揮の確認の選択肢。**この並び順に GameEngine.doResolveChoice が依存する**（0=発揮する / 1=しない）
export const MAGIC_REPEAT_OPTIONS = ["もう1度発揮する", "発揮しない"]

// pendingChoice（再発揮の確認）の後処理。GameEngine.doResolveChoice から呼ぶ
export function applyMagicRepeatChoice(
    state: GameState,
    info: NonNullable<PendingChoice["magicRepeat"]>,
    again: boolean,
): void {
    const card = getCard(info.cardId)
    if (again) {
        const source = findInstanceAnywhere(state, info.sourceInstanceId)
        if (source) consumeMagicRepeatGrant(state, source)
        log(state, `${card.name}の効果をもう1度発揮する。`)
        runMagicActions(state, info.casterPid, info.cardId, info.timing, info.targetInstanceId)
        if (state.pendingChoice) return
        if (state.winner) return
    } else {
        log(state, `${card.name}の効果をもう1度は発揮しなかった。`)
    }
    fireMagicUsedTriggers(state, info.casterPid, card, info.timing)
}

// oncePerBattle の magicFreeGrant を「このバトルで1枚使った」として記録する。
// resolveMagic の冒頭（＝マジックの使用が確定した時点）で呼ぶ。コスト0の判定自体は
// その手前の支払い経路（shared/cost.ts effectiveCost）で済んでいるため、ここでは記録だけを行う
function consumeOncePerBattleMagicFree(state: GameState, pid: PlayerId, cardData: CardData): void {
    if (!state.battle) return
    if (hasMagicRestriction(state, pid, "noFreeCastOpponent")) return // 無償化が封じられていたなら消費しない
    // 手元(tegamoto)からの使用も手札からの使用も、成立させている発生源は同じ絞り込みで引ける
    const sourceId =
        findMagicFreeGrantSource(state, pid, cardData) ?? findMagicFreeGrantSource(state, pid, cardData, true)
    if (!sourceId) return
    const effects = getCard(
        [...state.players[pid].field.spirits, ...state.players[pid].field.nexuses].find(
            (s) => s.instanceId === sourceId,
        )!.cardId,
    ).effects
    if (!effects.some((e) => e.kind === "magicFreeGrant" && e.oncePerBattle)) return
    ;(state.battle.oncePerBattleMagicFreeUsed ??= []).push(sourceId)
}

// マジックの効果エントリを1周ぶん解決する。resolveMagicEffects が1〜2回呼ぶ
// （「マジックの効果を使用したとき」の誘発は呼び出し側が最後に1回だけ発火させる）
function runMagicActions(
    state: GameState,
    owner: PlayerId,
    cardId: string,
    timing: "main" | "flash",
    targetInstanceId?: string,
): void {
    const card = getCard(cardId)
    const matches = (effect: EffectDef): effect is Extract<EffectDef, { kind: "magic" }> =>
        effect.kind === "magic" && effect.timing === timing
    const effects = card.effects
    for (let i = 0; i < effects.length; i++) {
        const effect = effects[i]
        if (!effect || !matches(effect)) continue
        if (effect.condition) {
            if ("ownFamilyCountAtLeast" in effect.condition) {
                // デルタクラッシュ：指定系統を持つ自分のスピリットがcount体以上のときのみ実行
                const { family, count } = effect.condition.ownFamilyCountAtLeast
                const total = countSpiritsWeighted(
                    state,
                    owner,
                    owner,
                    (s) => spiritHasFamily(state, owner, s, family),
                    "magic", // ここはマジックの使用条件なので発生源は常にマジック
                )
                if (total < count) {
                    log(
                        state,
                        `${card.name}：系統「${family}」を持つスピリットが${count}体未満のため発動しなかった。`,
                    )
                    continue
                }
            } else if ("ownFieldHasMinSymbolSpirit" in effect.condition) {
                // ライトニングバリスタ等：自分のフィールドにシンボル数がこれ以上のスピリットが
                // 1体もいなければ実行しない（BS04エンジン拡張バッチ1）
                const minSymbols = effect.condition.ownFieldHasMinSymbolSpirit
                const has = state.players[owner].field.spirits.some(
                    (s) => instanceSymbolCount(s) >= minSymbols,
                )
                if (!has) {
                    log(
                        state,
                        `${card.name}：シンボル${minSymbols}個以上を持つスピリットがいないため発動しなかった。`,
                    )
                    continue
                }
            } else if ("ownSpiritIsBlocking" in effect.condition) {
                // BS07アームズインパクト：自分のスピリットが現在のバトルでブロッカーのときだけ使える
                const blockerId = state.battle?.blockerInstanceId
                const blocking =
                    blockerId !== undefined &&
                    blockerId !== null &&
                    state.players[owner].field.spirits.some((s) => s.instanceId === blockerId)
                if (!blocking) {
                    log(state, `${card.name}：自分のスピリットがブロックしていないため発動しなかった。`)
                    continue
                }
            } else if ("bothFieldsHaveNexus" in effect.condition) {
                // クロスファイア：どちらのフィールドにもネクサスが1つ以上ないと使用できない
                const bothHave =
                    state.players.p1.field.nexuses.length > 0 &&
                    state.players.p2.field.nexuses.length > 0
                if (!bothHave) {
                    log(
                        state,
                        `${card.name}：どちらかのフィールドにネクサスがないため発動しなかった。`,
                    )
                    continue
                }
            } else if ("ownSpiritCountAtLeast" in effect.condition) {
                // BS08ジャッジメントフレア：自分のフィールドのスピリット数がこれ以上ないと使用できない
                const minCount = effect.condition.ownSpiritCountAtLeast
                if (state.players[owner].field.spirits.length < minCount) {
                    log(
                        state,
                        `${card.name}：自分のスピリットが${minCount}体未満のため発動しなかった。`,
                    )
                    continue
                }
            } else if ("ownFieldHasColorSpirits" in effect.condition) {
                // BS09-072シャドウブレイド：指定した色のスピリットが**それぞれ**1体以上いないと使用できない
                // （1体が多色で複数の色を満たしてもよい）
                const wanted = effect.condition.ownFieldHasColorSpirits
                const spirits = state.players[owner].field.spirits
                if (!wanted.every((c) => spirits.some((s) => instHasColor(s, c)))) {
                    log(state, `${card.name}：必要な色のスピリットがそろっていないため発動しなかった。`)
                    continue
                }
            } else if ("ownFieldHasAllNames" in effect.condition) {
                // BS08ロイヤルストレートフラッシュ：指定したカード名すべてが自分のフィールドに
                // 1体ずつ揃っていないと使用できない（cardIdではなく名前の完全一致で判定）
                const names = effect.condition.ownFieldHasAllNames
                const ownNames = new Set(
                    state.players[owner].field.spirits.map((s) => getCard(s.cardId).name),
                )
                if (!names.every((n) => ownNames.has(n))) {
                    log(state, `${card.name}：指定されたスピリットがフィールドに揃っていないため発動しなかった。`)
                    continue
                }
            } else {
                // ブランチロック：自分のフィールド（スピリット+ネクサス）が持つシンボルの色の種類数（重複除く）がこれ以上
                const minColors = effect.condition.ownFieldSymbolColorsAtLeast
                const colors = new Set<Color>()
                for (const s of [
                    ...state.players[owner].field.spirits,
                    ...state.players[owner].field.nexuses,
                ]) {
                    for (const c of getCard(s.cardId).symbol) colors.add(c)
                }
                if (colors.size < minColors) {
                    log(
                        state,
                        `${card.name}：シンボルの色が${minColors}色未満のため発動しなかった。`,
                    )
                    continue
                }
            }
        }
        // アルカナソルジャー・サンクLv2：相手が使用したマジックがサンクを対象に含むとき、
        // このアクションの対象をサンクのみに絞る（＝同じ持ち主の他のスピリットは効果を受けない）
        setTargetRedirect(state, owner, targetInstanceId, effect.action)
        // self が null（マジック）のため、装甲・マジック効果耐性判定用のカード色／種別／カードIDを明示的に渡す
        // （sourceCardId: lendSelfThisTurnが仮想発生源を作るのに使う。TURN_EFFECT_SOURCES.md §3.3）
        resolveAction(
            state,
            owner,
            null,
            effect.action,
            targetInstanceId,
            card.colors,
            "magic",
            undefined,
            undefined,
            card.cardId,
        )
        if (state.pendingChoice) {
            const remaining = effects.slice(i + 1).filter(matches)
            pushResumeFrames(
                state,
                remaining.map((e) => ({ kind: "action" as const, selfInstanceId: null, action: e.action })),
            )
            // 選択待ちで抜けるときも絞り込みは持ち越さない（選択の解決は別のアクションとして走る）
            delete state.magicRedirectTo
            return
        }
    }
    // 対象の絞り込みはこのマジックの解決中だけ有効（誘発効果には及ぼさない）
    delete state.magicRedirectTo
}

// 「マジックの効果を使用したとき」の誘発（使用者側・相手側）。
// **効果が無効にされた場合もここは通す**（使用宣言とコストの支払いは済んでいるため）
function fireMagicUsedTriggers(
    state: GameState,
    owner: PlayerId,
    card: CardData,
    timing: "main" | "flash",
): void {
    // フィールドイベント誘発「自分がマジックの効果を使用したとき」：使用者側のフィールドから発火
    // （opponentDrewの実装を踏襲。緑芽吹く原野）
    if (!state.winner) {
        fireFieldEventTriggers(state, owner, "ownMagicUsed")
    }
    // 「相手がマジックの効果を使用したとき」：使用者の相手側のフィールドから発火する（氷の女神フリッグ）。
    // コスト（軽減前の素のコスト）と使用タイミングを eventInfo で渡し、fieldEvent 側で絞り込む
    if (!state.winner) {
        fireFieldEventTriggers(
            state,
            opponentOf(owner),
            "opponentMagicUsed",
            undefined,
            undefined,
            undefined,
            undefined,
            { magicCost: card.cost, magicTiming: timing },
        )
    }
}
