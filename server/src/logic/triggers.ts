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
    TimedContent,
    TriggerEvent,
} from "../type"
import { COLOR_LABELS } from "../../../data/constants"
import {
    CARD_DB,
    clearBattle,
    createInstance,
    currentLevel,
    draw,
    fieldInstanceIdsOf,
    findInstanceAnywhere,
    getCard,
    log,
    instMinLevelCores,
    minLevelCores,
    opponentOf,
    rawLevel,
    pushResumeFrames,
    suspend,
    resolveInOrder,
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
    magicEffectiveColors,
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
    instHasTriggerEffect,
    isUntargetableByOpponent,
    instIsVanilla,
    isVirtualSource,
    cardNameContains,
    matchesTarget,
    KEYWORDS,
    instMatchesCostFilter,
    matchesCostFilter,
    matchesFamilyFilter,
    noOpponentTriggerByColor,
    noSummonTriggerByCost,
    spiritHasFamily,
    spiritHasKeyword,
    effectActiveOn,
    isOnFieldAnyZone,
    instIsCombined,
    bravesOf,
    combinedBraveColorsOk,
    hostsOf,
    cardHasColor,
    opponentFieldColorCount,
    ownFieldOnlyColor,
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
    instHasTriggerEffect,
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
    finishBurstActivation,
    fireOwnBurstActivated,
    hasAttackTriggersAsBlock,
    hasBlockTriggersAsAttack,
    removeCores,
    removeCoresToTrash,
    removeCoresToVoid,
    requestActivationConfirm,
    resolveAction,
    summonFreeFromHandIndex,
} from "./EffectModules"
export { resolveMagic } from "./magic/cast"
export { findMagicNegateSource, applyMagicNegateChoice, declineMagicNegateChoice } from "./magic/negate"
export { bothSidesPids, findBothSidesRedirectSource, bothSidesRedirectKeepPid, applyBothSidesRedirectToCandidates, BOTH_SIDES_REDIRECT_OPTIONS, applyMagicSideChoice, applyMagicRedirectChoice } from "./magic/redirect"
import { setTargetRedirect } from "./magic/redirect"
export { resolveMagicEffects, MAGIC_REPEAT_OPTIONS, applyMagicRepeatChoice } from "./magic/resolve"

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
export function fireSummonTrigger(
    state: GameState,
    owner: PlayerId,
    selfInstance: CardInstance,
    byFushi = false,
): void {
    // globalConstraint "noSummonTriggerByCost"（BS08共鳴する音叉の塔）：コストが低いスピリットの
    // 『このスピリットの召喚時』効果は発揮されない
    if (noSummonTriggerByCost(state, selfInstance, owner)) {
        log(state, `${getCard(selfInstance.cardId).name}：コストが低いため、召喚時効果は発揮されなかった。`)
        return
    }
    state.resolvingSummonTriggerPid = owner
    fireTrigger(state, owner, selfInstance, "onSummon", undefined, undefined, byFushi)
    if (!state.pendingChoice) delete state.resolvingSummonTriggerPid
}

// 「ターンに1回」の消費を戻す（発揮しなかったと分かったとき）。GameEngine の revertActivatedUse の誘発版
export function revertOncePerTurn(inst: CardInstance, effectId: string): void {
    if (!inst.triggeredUsedTurn) return
    const { [effectId]: _removed, ...rest } = inst.triggeredUsedTurn
    inst.triggeredUsedTurn = rest
}

// 同時破壊グループの「使った」印を戻す（「〜できる」を断った・コストが払えず不発だったとき）。
// 次に破壊される1体でまた提示できるようにする（fix/destroyed-trigger-once）。
// キーが無い（グループが無効／perDestroyed で最初から印を付けていない）ときは何もしない
export function revertDestroyGroupUsage(state: GameState, instanceId: string, effectId: string): void {
    const g = state.destroyGroup
    if (!g) return
    const key = `${instanceId}:${effectId}`
    const at = g.used.indexOf(key)
    if (at !== -1) g.used.splice(at, 1)
}

export function fireTrigger(
    state: GameState,
    owner: PlayerId,
    selfInstance: CardInstance,
    event: TriggerEvent,
    battleRole?: "attacker" | "blocker",
    targetInstanceId?: string,
    byFushi?: boolean, // 【不死】の効果で召喚されたときの召喚か（onSummon限定。condition.selfSummonedByFushi の判定に使う。BS13-014 闇騎士アグラヴェイン）
    byOpponent?: boolean, // 相手によって破壊されたか（onDestroy限定。condition.selfDestroyedByOpponent の判定に使う。reviveOnDestroy.when.byOpponentと同じ判定＝相手の効果 または バトルのBP比較。BS13-010スカルザード）
    fromHand?: boolean, // 器BS16：onDeploy限定：手札から配置されたか（effect.fromHandOnly の判定に使う。BS16-062天下眺める絶景門）
): void {
    // 相手の効果によりこのトリガーが発揮されない状態なら、誘発そのものを行わない
    if (isTriggerSuppressed(state, owner, event)) {
        log(state, `${getCard(selfInstance.cardId).name}の効果は発揮されなかった。`)
        return
    }
    // globalConstraint "noOpponentTriggerByColor"（SD01-031 朝焼け岬Lv2）：
    // 相手の指定色のスピリットの、指定した『〇〇時』効果は発揮されない。
    // ここ（fireTrigger の入口）で落とすので、封じられるのは『』でカテゴライズされた効果だけになり、
    // ネクサスの常在効果による reviveOnDestroy は素通りする（docs/design/CONJUNCTION.md）
    if (noOpponentTriggerByColor(state, owner, selfInstance, event)) {
        log(state, `${getCard(selfInstance.cardId).name}の効果は発揮されなかった。`)
        return
    }
    // 「持つ効果すべては発揮されない」を受けている個体（BS07ルナースラッシュ／BS03ゴーレムクラフトで
    // スピリット化されたネクサス）は誘発も出さない
    if (instEffectsSuppressed(selfInstance)) {
        log(state, `${getCard(selfInstance.cardId).name}の効果は発揮されなかった。`)
        return
    }
    // markSuppressTriggerThisTurn：**この個体1体だけ**が対象の一時抑止（BS14-043月光姫マーニLv2）。
    // trigger:"onAttack"は【合体時】の『合体アタック時』も同時に防ぐ（どちらも内部的にonAttack）
    if (selfInstance.suppressedTriggersThisTurn?.includes(event)) {
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
        // このターンの間、**片側のプレイヤーの**スピリットすべてが対象（BS10-072 セイバーシャーク）
        state.turnConstraints.some((c) => c.type === "blockTriggersAsAttackForPid" && c.pid === owner) ||
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
    // src は**その効果エントリを持っているカードの個体**。ホスト自身のこともあれば、
    // 合体しているブレイヴのこともある（下の entries を参照）。
    // レベル判定と【合体時】のゲートは src で行う（ブレイヴは合体状態のレベル表を引く）
    const matches = (effect: EffectDef, src: CardInstance = selfInstance): effect is Extract<EffectDef, { kind: "triggered" }> => {
        if (effect.kind !== "triggered") return false
        if (!firedEvents.includes(effect.trigger)) return false
        // 【合体時】＝合体しているときだけ発揮する（BRAVE.md §12.3）。
        // 『このスピリットの**合体アタック時**』もこの形で表す（＝ブレイヴが付いているときだけの『アタック時』。
        // 2026-08-25 ユーザー確認）
        if (!effectActiveOn(src, effect, src === selfInstance ? level : currentLevel(src).level)) return false
        // 【合体時】の色条件（X008）。ホストは selfInstance 側（合体スピリットは1体）
        if (
            effect.kind === "triggered" &&
            !combinedBraveColorsOk(state.players[owner], selfInstance, effect.combinedBraveColors)
        ) {
            return false
        }
        if (effect.battleRole !== undefined && effect.battleRole !== battleRole) return false
        // 器BS16：fromHandOnly（trigger:"onDeploy"限定。BS16-062／BS16-064）
        if (effect.fromHandOnly && !fromHand) return false
        // turn（BS13-010スカルザードLv2＝『相手のターン』）：発生源の持ち主基準でown/opponentを絞る
        if (effect.turn === "own" && owner !== state.turnPlayer) return false
        if (effect.turn === "opponent" && owner === state.turnPlayer) return false
        // 「この効果はターンに1回しか使えない」（発生源1体につき。BS11-032 天王神獣スレイ・ウラノス）
        if (effect.oncePerTurn === true && src.triggeredUsedTurn?.[effect.id] === state.turn) return false
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
            } else if ("ownFieldHasCombinedSpirit" in effect.condition) {
                // BS10-X03巨蟹武神キャンサードLv2：自分のフィールドに合体スピリットがいるときのみ発火
                if (!state.players[owner].field.spirits.some((sp) => instIsCombined(sp))) return false
            } else if ("targetMinBp" in effect.condition) {
                // 鍵鎚のヴァルグリンドLv2：ブロックしたスピリット（targetInstanceId）の実効BPがこれ以上のときのみ発火
                if (targetInstanceId === undefined) return false
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) return false
                if (effectiveBp(state, found.pid, found.inst) < effect.condition.targetMinBp) return false
            } else if ("targetBlockedMaxBp" in effect.condition) {
                // SD01-024 人馬機兵アトリーズLv2：ブロックしたスピリット（targetInstanceId）の実効BPが
                // これ以下のときのみ発火（targetMinBp の鏡）
                if (targetInstanceId === undefined) return false
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) return false
                if (effectiveBp(state, found.pid, found.inst) > effect.condition.targetBlockedMaxBp) return false
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
            } else if ("bothFieldsHaveMinBpSpirit" in effect.condition) {
                // BS11-008 爆竜ドラゴニックベアード：お互いのフィールドにBP10000以上のスピリットがいるとき
                const min = effect.condition.bothFieldsHaveMinBpSpirit
                const has = (p: PlayerId) =>
                    state.players[p].field.spirits.some((sp) => effectiveBp(state, p, sp) >= min)
                if (!has("p1") || !has("p2")) return false
            } else if ("battleOpponentCombined" in effect.condition) {
                // BS11-X02 滅神星龍ダークヴルム・ノヴァLv2-3：いま成立しているバトルの相手側が
                // 合体スピリットのときのみ発火。self がアタッカーかブロッカーかで相手側を選ぶ
                const battle = state.battle
                if (!battle) return false
                const otherId =
                    battle.attackerInstanceId === src.instanceId
                        ? battle.blockerInstanceId
                        : battle.attackerInstanceId
                if (!otherId) return false
                const other = findSpiritAny(state, otherId)
                if (!other || !instIsCombined(other.inst)) return false
            } else if ("requirePrevAttackerCombined" in effect.condition) {
                // BS10-047赤ずきん妖精ルージュLv3：直前のアタック宣言が発生源の持ち主自身の
                // 合体スピリットによるものだったときのみ発火（doAttackがスライドさせるprevAttackerCombinedPid）
                if (state.prevAttackerCombinedPid !== owner) return false
            } else if ("ownLifeAtMost" in effect.condition) {
                // BS12-X05戦神乙女ヴィエルジェ：発生源の持ち主のライフがこの数以下のときのみ発火
                if (state.players[owner].life > effect.condition.ownLifeAtMost) return false
            } else if ("selfSummonedByFushi" in effect.condition) {
                // BS13-014闇騎士アグラヴェイン：その召喚が【不死】によるものだったときのみ発火
                if (byFushi !== true) return false
            } else if ("selfDestroyedByOpponent" in effect.condition) {
                // BS13-010スカルザード：相手によって破壊されたときのみ発火
                if (byOpponent !== true) return false
            } else if ("ownNameIncludesCountAtLeast" in effect.condition) {
                // BS07マカロニペンタン：持ち主のフィールドに[皇帝アンプルール]/[女帝ペンプレス]がいるときのみ発火
                const { names, count } = effect.condition.ownNameIncludesCountAtLeast
                const total = state.players[owner].field.spirits.filter((s) =>
                    names.some((n) => cardNameContains(s, n)),
                ).length
                if (total < count) return false
            } else if ("ownNexusNameKindsAtLeast" in effect.condition) {
                // 器BQ：カード名にnameContainsを含む自分のネクサスの「異なるカード名の種類数」（同名は1種類）
                // がcount以上のときのみ発火（BS13-048古代戦艦アルゴ・ゴレム：「古代戦艦」が4種類）
                const { nameContains, count } = effect.condition.ownNexusNameKindsAtLeast
                const kinds = new Set(
                    state.players[owner].field.nexuses
                        .filter((n) => cardNameContains(n, nameContains))
                        .map((n) => getCard(n.cardId).name),
                )
                if (kinds.size < count) return false
            } else if ("ownBurstSet" in effect.condition) {
                // 発生源の持ち主が自分のバーストエリアにカードをセットしている間だけ発火（docs/design/BURST.md）。
                // false指定時は**セットしていない**間だけ発火（SD06-009キジ・トリアLv2）
                if (state.players[owner].burstSet !== effect.condition.ownBurstSet) return false
            } else if ("opponentFieldColorsAtLeast" in effect.condition) {
                // BS15共通器：持ち主から見た相手フィールドの色の種類数がこれ以上のときのみ発火
                const { opponentFieldColorsAtLeast, spiritsOnly } = effect.condition
                if (opponentFieldColorCount(state, owner, spiritsOnly === true) < opponentFieldColorsAtLeast) return false
            } else if ("ownFieldOnlyColor" in effect.condition) {
                // BS15共通器：発生源の持ち主のフィールドが指定色1色だけのときのみ発火
                const { ownFieldOnlyColor: color, spiritsOnly } = effect.condition
                if (!ownFieldOnlyColor(state, owner, color, spiritsOnly === true)) return false
            }
        }
        return true
    }
    // 付与された誘発効果（kind: "effectGrant"。アルカナビースト・ケン）：持ち主フィールドの発生源から
    // target/nameIncludes 一致でこのインスタンスに継続付与された誘発効果を、静的effectsの末尾に合成する
    // （grantedのlevelsは常に有効扱い。発生源自身もnameIncludes一致すれば対象に含む）
    // 加えて、action:"grantEffectToTargetThisTurn" でこの個体1体に直接付与された、このターン限りの
    // 誘発効果（tempGrantedTriggers）も同様に合成する（BS08メテオストーム）
    // timedEffect の grantTrigger：1体は個体の tempGrantedTriggers、「すべて」は timedRule（後から出たスピリットにも付く）
    const ruleGranted = state.turnConstraints.flatMap((c) =>
        c.type === "timedRule" &&
        (c.pid === undefined || c.pid === owner) &&
        matchesTarget(state, owner, selfInstance, c.filter, c.selfInstanceId)
            ? c.content.filter((x): x is Extract<TimedContent, { type: "grantTrigger" }> => x.type === "grantTrigger")
            : [],
    )
    const tempGranted = [...(selfInstance.tempGrantedTriggers ?? []), ...ruleGranted]
        .filter((g) => firedEvents.includes(g.trigger) && (g.battleRole === undefined || g.battleRole === battleRole))
        .map((g) => g.action)
    const grantedActions = [
        ...collectGrantedTriggerActions(state, owner, selfInstance, event, targetInstanceId),
        ...tempGranted,
    ]

    // ⚠️ **合体しているブレイヴの誘発効果もここで発火させる**（docs/design/BRAVE.md §4）。
    // 継続効果は effectSources が拾うが、**誘発は個体ごとの fireTrigger を通る**ため、
    // ここで合流させないと【合体時】の『アタック時』『バトル時』などが一度も発火しない
    // （2026-08-25 に実カードで発覚。coverage:effects が「一度も適用されていない」と報告した）。
    //
    // **self はホストのまま**にする：合体スピリットは1体なので、効果文の「このスピリット」は
    // 合体スピリット＝ホスト側の個体を指す（refreshSelf・selfBuff などが正しく当たる）。
    // レベル判定だけはブレイヴ側の合体状態のレベル表を引く必要があるので、発生源を持ち回る
    const entries: { effect: EffectDef; src: CardInstance }[] = [
        ...card.effects.map((e) => ({ effect: e, src: selfInstance })),
        ...bravesOf(state.players[owner], selfInstance).flatMap((b) =>
            getCard(b.cardId).effects.map((e) => ({ effect: e, src: b })),
        ),
    ]
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const effect = entry?.effect
        if (!entry || !effect || !matches(effect, entry.src)) continue
        // ターン1回の消費は**発揮する直前**に記録する（解決中に中断が入っても再発揮させない）。
        // 実際には発揮しなかったとき（コストを払えず不発／確認を断った）は下で巻き戻す
        // （RULES_BATSPI_WIKI.md。2026-09-16 ユーザー確定）
        if (effect.oncePerTurn === true) {
            entry.src.triggeredUsedTurn = { ...(entry.src.triggeredUsedTurn ?? {}), [effect.id]: state.turn }
            delete state.effectFizzled
        }
        // 「〜できる」（optional）は実対戦では発動可否をプレイヤーに確認する。
        // interactiveTargets=false（テスト）では従来どおり常に発動する
        if (effect.optional && state.interactiveTargets) {
            requestActivationConfirm(
                state,
                owner,
                `${getCard(entry.src.cardId).name}の効果を発動しますか？`,
                effect.action,
                selfInstance,
                effect.oncePerTurn === true ? { instanceId: entry.src.instanceId, effectId: effect.id } : undefined,
            )
        } else {
            // 対象の付け替え（kind:"magicTargetRedirect"）は**マジックに限らず、対象を選ぶ効果全般**に効く
            // （2026-08-14 ユーザー確認。BS09-038スズランの妖精ティンカ／BS05-040スノーホワイトの
            //  効果文どおり「スピリット/マジックの効果」が対象）。ネクサスの効果は対象外
            // ブレイヴの効果も「合体スピリット＝スピリットの効果」として扱う（BRAVE.md §12.1）
            const redirecting = card.type === "spirit" || entry.src !== selfInstance
            if (redirecting) setTargetRedirect(state, owner, targetInstanceId, effect.action)
            resolveAction(state, owner, selfInstance, effect.action, targetInstanceId)
            if (redirecting) delete state.magicRedirectTo
        }
        // コストを払えないなどで何も起きなかったら、「ターンに1回」の消費を戻す
        if (effect.oncePerTurn === true && state.effectFizzled) {
            revertOncePerTurn(entry.src, effect.id)
            delete state.effectFizzled
        }
        // 選択待ちが立ったら、残りの一致エントリ＋付与分をqueueに積んで中断する
        if (state.pendingChoice) {
            const remaining = entries.slice(i + 1).filter((x) => matches(x.effect, x.src))
            pushResumeFrames(state, [
                ...remaining.map((x) => ({ kind: "action" as const, selfInstanceId: selfInstance.instanceId, action: (x.effect as Extract<EffectDef, { kind: "triggered" }>).action })),
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

// BS13-007豹竜パンドランサー：「自分のスピリット状態のブレイヴ1体と合体できる。その後、このスピリットが持つ
// 『このスピリットの合体アタック時』効果を発揮させる」。fireTriggerの`entries`は呼び出し時点でのbravesOf
// スナップショットなので、その最中に新たに合体したブレイヴが持ち込む【合体時】onAttackエントリは自然には
// 拾われない。合体が実際に成立したときだけ、ここで改めてbravesOf(host)を取り直して発揮させる
// （合体しなかった／できなかったときは呼ばれないので発揮しない。2026-09-07ユーザー確認）
export function fireCombinedAttackTrigger(
    state: GameState,
    owner: PlayerId,
    host: CardInstance,
    event: TriggerEvent,
): void {
    const entries = bravesOf(state.players[owner], host).flatMap((brave) =>
        getCard(brave.cardId)
            .effects.filter(
                (e): e is Extract<EffectDef, { kind: "triggered" }> =>
                    e.kind === "triggered" &&
                    e.trigger === event &&
                    e.whileCombined === true &&
                    effectActiveAtLevel(e.levels, currentLevel(brave).level),
            )
            .map((effect) => ({ effect, src: brave })),
    )
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        if (!entry) continue
        const { effect } = entry
        if (effect.optional && state.interactiveTargets) {
            requestActivationConfirm(state, owner, `${getCard(host.cardId).name}の効果を発動しますか？`, effect.action, host)
        } else {
            resolveAction(state, owner, host, effect.action, undefined)
        }
        if (state.pendingChoice) {
            const remaining = entries.slice(i + 1)
            pushResumeFrames(
                state,
                remaining.map((x) => ({ kind: "action" as const, selfInstanceId: host.instanceId, action: x.effect.action })),
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
            if (effect.whileCombined && !instIsCombined(source)) continue
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
                if ("targetMaxCost" in effect.granted.condition) {
                    if (!instMatchesCostFilter(found.inst, { max: effect.granted.condition.targetMaxCost })) continue
                } else if (effectiveBp(state, found.pid, found.inst) > effect.granted.condition.targetMaxBp) continue
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
    // ⚠️ **発火するものを先に全部集めてから順に解決する**（2026-08-17。fireStepTriggers と同じ形）。
    // 以前はループの中で直接解決し、選択待ちが立ったら `return` するだけだったため、
    // **同じバトルの残りの誘発が永久に失われていた**（太陽石の神殿を2枚並べると2枚目が発火しない）
    const firing: { inst: CardInstance; effect: Extract<EffectDef, { kind: "battleWon" }> }[] = []
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
            if (effect.whileCombined && !instIsCombined(inst)) continue
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
            // BS07ニードルショット：「**そのスピリットが**、BPを比べ〜」＝直前の文でBP増加した1体に限る。
            // 貸与のときに仮想発生源へ写した lentBuffTargetId と照合する
            if (effect.winnerIsLentBuffTarget && inst.lentBuffTargetId !== winnerInst.instanceId) {
                continue
            }
            // BS13-078ネバーギブアップ：targetChoiceLendThisTurnで選んだ1体に限る。
            // 貸与のときに仮想発生源へ写した lentChoiceInstanceId と照合する
            if (effect.winnerIsLentChoiceTarget && inst.lentChoiceInstanceId !== winnerInst.instanceId) {
                continue
            }
            // BS03熾烈極める最前線Lv2：勝利したスピリットが指定キーワードを持つときのみ発火（＝覚醒持ち）
            // 配列＝OR（どれか1つ持っていれば発火する。1回だけ）
            if (effect.winnerKeywordFilter !== undefined) {
                const needs = Array.isArray(effect.winnerKeywordFilter)
                    ? effect.winnerKeywordFilter
                    : [effect.winnerKeywordFilter]
                if (!needs.some((kw) => spiritHasKeyword(state, winnerPid, winnerInst, kw))) continue
            }
            // BS11-062 オールトの竜巣Lv2：勝利したのが**合体スピリット**のときのみ発火
            if (effect.winnerCombinedOnly && !instIsCombined(winnerInst)) {
                continue
            }
            // BS15-005虚獣チャンプボンゴル：勝利したスピリットがこの色を持つときのみ発火
            if (effect.winnerColorFilter !== undefined && !instHasColor(winnerInst, effect.winnerColorFilter)) {
                continue
            }
            // BS13-050輝竜シャイン・ブレイザー【合体時】：敗北して破壊された側の実効BPがこれ以上のときのみ発火
            // （state.lastBattleDestroyedBpは破壊直前に測った実効BP。GameEngine.resolveBattleが記録する）
            if (effect.loserMinBp !== undefined && state.lastBattleDestroyedBp < effect.loserMinBp) {
                continue
            }
            // BS14-060ティンダロ・ハウンドLv2：破壊された側のコストがこれ以下のときのみ発火
            if (effect.loserCostAtMost !== undefined && state.lastBattleDestroyedCost > effect.loserCostAtMost) {
                continue
            }
            // BS15-066廃寺の無限階段：発生源の持ち主のフィールドが指定色1色だけのときのみ発火
            if (
                effect.condition?.ownFieldOnlyColor !== undefined &&
                !ownFieldOnlyColor(state, winnerPid, effect.condition.ownFieldOnlyColor, effect.condition.spiritsOnly)
            ) {
                continue
            }
            firing.push({ inst, effect })
        }
    }
    const selfOf = (e: (typeof firing)[number]): CardInstance =>
        e.effect.selfMode === "source" ? e.inst : winnerInst
    resolveInOrder(state, firing, {
        // 集めたあとに場を離れた発生源は発火させない（先に解決した効果で破壊されうる）。
        // 仮想発生源はフィールドに実体が無いので在否を見ない
        skip: (e) => !isVirtualSource(e.inst) && !isStillOnField(state, winnerPid, e.inst.instanceId),
        resolve: (e) => {
            // 「〜できる」（optional）は実対戦では発動可否を確認する（step / triggered と同じ扱い）
            if (e.effect.optional && state.interactiveTargets) {
                requestActivationConfirm(state, winnerPid, activationPrompt(e.inst), e.effect.action, selfOf(e))
            } else {
                resolveAction(state, winnerPid, selfOf(e), e.effect.action)
            }
        },
        frame: (e) => ({
            kind: "action" as const,
            selfInstanceId: selfOf(e).instanceId,
            action: e.effect.action,
            actorPid: winnerPid,
            ...confirmPromptIfOptional(state, e.inst, e.effect.optional),
        }),
        // 同時発揮の解決順はターンプレイヤーが決める（TIMING_CHART.md §0-3）
        askOrder: {
            pid: state.turnPlayer,
            label: (e) => getCard(e.inst.cardId).name,
            // ⚠️ **カード単位**で見る（効果エントリ単位にしない）。同じカードの複数エントリは
            // 「ドロー後、〜する」のようにテキストで順序が決まっているので同時発揮ではなく、
            // 同名カードを2枚並べた場合は順序を入れ替えても結果が同じ（対称）
            key: (e) => e.inst.cardId,
        },
    })
}

// 発動確認の文面（3種の誘発で同じ形を使う）
function activationPrompt(inst: CardInstance): string {
    return `${getCard(inst.cardId).name}の効果を発動しますか？`
}

// optional な誘発の残りは、再開時も**発動確認から**始める（確認なしの自動発動を防ぐ）。
// exactOptionalPropertyTypes のため、付けないときはキー自体を出さない
function confirmPromptIfOptional(
    state: GameState,
    inst: CardInstance,
    optional: boolean | undefined,
): { confirmPrompt?: string } {
    return optional === true && state.interactiveTargets ? { confirmPrompt: activationPrompt(inst) } : {}
}

// 発生源がまだ持ち主のフィールドに居るか（スピリット／ネクサスのどちらでも）。
// 「集めてから解決する」形では、先に解決した効果で発生源が破壊されうるので都度確かめる
function isStillOnField(state: GameState, pid: PlayerId, instanceId: string): boolean {
    // 合体中のブレイヴも「場にいる」（効果の発生源になる。BRAVE.md §2.3）。
    // ここを spirits/nexuses だけにすると、【合体時】の fieldEvent が丸ごと飛ばされる
    return isOnFieldAnyZone(state.players[pid], instanceId)
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
    // ドローステップとコアステップは、本体の動き（ドロー／リザーブへのコア置き）の前後で
    // 2回に分けて呼ぶ（PhaseManager が区間を分けている）。
    // "before"＝本体の動き自体を支払いに使う効果（step.beforeStepAction）だけ、"after"＝それ以外。
    // 省略時（他のステップ）は全部発火する
    subStep: "before" | "after" | "all" = "all",
): void {
    const order: PlayerId[] = [
        state.turnPlayer,
        opponentOf(state.turnPlayer),
    ]
    // ⚠️ **発火するものを先に全部集めてから順に解決する**（2026-08-17）。
    // 以前はループの中で直接解決し、選択待ちが立ったら `return` するだけだったため、
    // **同じステップの残りの誘発が永久に失われていた**
    // （灼熱の谷を2枚並べると、1枚目の「手札1枚を破棄」で中断して2枚目が発火しなかった）。
    // 中断したら残りを再開スタックへ積む（fireTrigger と同じ形）。
    // 条件（handNotGreaterThanOpponent など）は**誘発した時点**で判定する
    const firing: { pid: PlayerId; inst: CardInstance; effect: Extract<EffectDef, { kind: "step" }> }[] = []
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
                if (subStep === "before" && effect.beforeStepAction !== true) continue
                if (subStep === "after" && effect.beforeStepAction === true) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                // 【合体時】のゲート＋レベル判定（BS10-008 火星神龍アレス・ドラグーン）
                if (!effectActiveOn(inst, effect, level)) continue
                // 「ターンに1回」（BS10-008：この効果自身が追加のエンドステップを生むため、無いと無限ループになる）
                if (effect.oncePerTurn === true && inst.stepUsedTurn?.[effect.id] === state.turn) continue
                if (effect.condition === "handNotGreaterThanOpponent" && !checkStepCondition(state, pid, effect.condition)) continue
                if (effect.condition === "selfWasRefreshedThisStep" && !refreshedInstanceIds?.has(inst.instanceId)) continue
                if (effect.condition && typeof effect.condition === "object" && "ownSymbolColorAtLeast" in effect.condition) {
                    // ハートレス・ティンLv2：自分のフィールドの指定色シンボルが count 個以上、かつ
                    // noAttacksThisTurn 指定時はこのターンまだ1度もアタックが行われていないときのみ発火
                    const { color, count } = effect.condition.ownSymbolColorAtLeast
                    // シンボルの数え方は countSymbols に一本化する（2026-08-20）。
                    // symbolFix による固定・バウンス待機の除外・「◯色としても扱う」で得た色も見る
                    if (countSymbols(player, [color]) < count) continue
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
                if (effect.condition && typeof effect.condition === "object" && "ownTrashOnlyColor" in effect.condition) {
                    // BS14-024ツチピッグLv1-2：トラッシュにあるカードが指定色だけのときのみ（0枚は満たさない）
                    const wantColor = effect.condition.ownTrashOnlyColor
                    const trash = state.players[pid].trashCards
                    if (trash.length === 0 || !trash.every((id) => cardHasColor(getCard(id), wantColor))) continue
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
                if (effect.condition && typeof effect.condition === "object" && "ownBurstSet" in effect.condition) {
                    // SD06-009キジ・トリアLv2：自分がバーストをセットしている／していない間だけ発火
                    if (state.players[pid].burstSet !== effect.condition.ownBurstSet) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "opponentBurstSet" in effect.condition) {
                    // BS15-065大河と絶壁Lv2：相手がバーストをセットしている／していない間だけ発火
                    if (state.players[opponentOf(pid)].burstSet !== effect.condition.opponentBurstSet) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "noAttacksThisTurn" in effect.condition) {
                    // BS15-067雪の結晶樹：このターンまだ1度もアタックが行われていないときのみ発火
                    if (state.attacksThisTurn > 0) continue
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
                // cost:{exhaustSelf}（BS12-043大地の狩人コンドラッドLv1）：既に疲労状態なら払えないので発火しない
                if (effect.cost && "exhaustSelf" in effect.cost && inst.isRested) continue
                // cost:{reserveToTrash}（BS15-032スノーフレイクンLv1）：リザーブが足りなければ払えないので発火しない
                if (effect.cost && "reserveToTrash" in effect.cost && state.players[pid].reserve < effect.cost.reserveToTrash) continue
                // cost:{selfCoresToTrash}（BS15-023タケノ・サイガーLv2）：発生源自身のコアが足りなければ発火しない
                if (effect.cost && "selfCoresToTrash" in effect.cost && inst.cores < effect.cost.selfCoresToTrash) continue
                // 器BS16：cost:{discardHandFamily}（BS16-063釣魂台Lv2）：手札に指定系統のスピリットカードが無ければ発火しない
                if (effect.cost && "discardHandFamily" in effect.cost) {
                    const wanted = Array.isArray(effect.cost.discardHandFamily)
                        ? effect.cost.discardHandFamily
                        : [effect.cost.discardHandFamily]
                    const hasCard = state.players[pid].hand.some(
                        (cardId) => getCard(cardId).type === "spirit" && wanted.some((f) => getCard(cardId).family.includes(f)),
                    )
                    if (!hasCard) continue
                }
                firing.push({ pid, inst, effect })
            }
        }
    }
    resolveInOrder(state, firing, {
        // 集めたあとに場を離れた発生源は発火させない（先に解決した効果で破壊されうる）
        skip: (e) => !isStillOnField(state, e.pid, e.inst.instanceId),
        resolve: (e) => {
            // 「ターンに1回」の消費を記録する（BS10-008：発火が確定した時点で記録し、再入で二重発火しない）
            if (e.effect.oncePerTurn === true) {
                e.inst.stepUsedTurn = { ...(e.inst.stepUsedTurn ?? {}), [e.effect.id]: state.turn }
            }
            // cost:{exhaustSelf}：発火が確定した時点で疲労させる（COST_MODEL.md。
            // interactiveTargetsの確認を断った場合も疲労する簡略化）
            if (e.effect.cost && "exhaustSelf" in e.effect.cost) {
                exhaustSpirit(state, e.pid, e.inst)
            }
            if (e.effect.cost && "reserveToTrash" in e.effect.cost) {
                const player = state.players[e.pid]
                const paid = e.effect.cost.reserveToTrash
                player.reserve -= paid
                player.trashCores += paid
            }
            if (e.effect.cost && "selfCoresToTrash" in e.effect.cost) {
                const paid = e.effect.cost.selfCoresToTrash
                e.inst.cores -= paid
                state.players[e.pid].trashCores += paid
            }
            // 器BS16：cost:{discardHandFamily}（BS16-063釣魂台Lv2）。候補2枚以上ならコスト最大を自動選択する簡略化
            if (e.effect.cost && "discardHandFamily" in e.effect.cost) {
                const player = state.players[e.pid]
                const wanted = Array.isArray(e.effect.cost.discardHandFamily)
                    ? e.effect.cost.discardHandFamily
                    : [e.effect.cost.discardHandFamily]
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
                log(state, `${player.name}は${getCard(e.inst.cardId).name}のコストとして手札の${getCard(cardId).name}を破棄した。`)
            }
            // 「〜できる」（optional）は実対戦では発動可否を確認する（triggered と同じ扱い）
            if (e.effect.optional && state.interactiveTargets) {
                requestActivationConfirm(state, e.pid, activationPrompt(e.inst), e.effect.action, e.inst)
                return
            }
            // 効果の発生源をログに残す（2026-08-02 UI担当からの指摘）。
            // これが無いと「カードを2枚引いた」等の結果だけが残り、どのカードの効果か分からない。
            // カード名を含めることでUI側のホバー表示も効く
            log(
                state,
                `${state.players[e.pid].name}の${getCard(e.inst.cardId).name}の効果が発動した。（${STEP_LABELS[step]}${timing === "end" ? "終了時" : ""}）`,
            )
            resolveAction(state, e.pid, e.inst, e.effect.action)
        },
        frame: (e) => ({
            kind: "action" as const,
            selfInstanceId: e.inst.instanceId,
            action: e.effect.action,
            actorPid: e.pid,
            logText: `${state.players[e.pid].name}の${getCard(e.inst.cardId).name}の効果が発動した。（${STEP_LABELS[step]}${timing === "end" ? "終了時" : ""}）`,
            ...confirmPromptIfOptional(state, e.inst, e.effect.optional),
        }),
        // 同時発揮の解決順はターンプレイヤーが決める（TIMING_CHART.md §0-3）
        askOrder: {
            pid: state.turnPlayer,
            label: (e) => `${state.players[e.pid].name}の${getCard(e.inst.cardId).name}`,
            // ⚠️ **カード単位**で見る（同じカードの複数エントリはテキスト順で決まっており同時発揮ではない）。
            // 持ち主が違えば別扱い（自分と相手の同名ネクサスは順序が結果を変えうる）
            key: (e) => `${e.pid}:${e.inst.cardId}`,
        },
    })
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
// 上の extraItems の1件分。fieldEvent の誘発と同じ列に並ぶ
export interface FieldEventExtraItem {
    key: string // 「同じ効果か」の判定用（askOrder.key と同じ役目）
    label: string // 選択肢の表示
    action: EffectAction // 解決するアクション（内部専用アクションを渡す）
    selfInstanceId: string | null
    actorPid: PlayerId
    requiresPendingDestructionOf?: string // このフレームのガード
    // 非対話（テスト・AI）で順番を聞かないときの既定位置。true なら fieldEvent の誘発より前に置く。
    // 実対戦では askOrder が並べ替えるので効かない。**従来の解決順を変えないため**に要る
    // （破壊されたカード自身の『破壊時』は、もともと他カードの誘発より先だった）
    first?: true
}

// kind:"burst" の condition 判定（docs/design/BURST.md）。未指定なら常に満たす
export function burstConditionMet(
    state: GameState,
    pid: PlayerId,
    condition: Extract<EffectDef, { kind: "burst" }>["condition"],
): boolean {
    if (condition === undefined) return true
    const player = state.players[pid]
    if ("ownLifeAtMost" in condition) return player.life <= condition.ownLifeAtMost
    if ("ownNexusAtLeast" in condition) return player.field.nexuses.length >= condition.ownNexusAtLeast
    if ("ownTrashColorCountAtLeast" in condition) {
        const { color, count } = condition.ownTrashColorCountAtLeast
        return player.trashCards.filter((id) => getCard(id).colors.includes(color)).length >= count
    }
    if ("ownTrashCardTypeCountAtLeast" in condition) {
        const { cardType, count } = condition.ownTrashCardTypeCountAtLeast
        return player.trashCards.filter((id) => getCard(id).type === cardType).length >= count
    }
    // BS15-017エンプレス・ヨウクィーン：自分の手札が5枚以上のとき
    if ("ownHandAtLeast" in condition) return player.hand.length >= condition.ownHandAtLeast
    // BS15-026軍師鳥ショカツリョー：自分と相手のフィールドに疲労状態のスピリットが合計でこれ以上いるとき
    if ("bothFieldsRestedSpiritsAtLeast" in condition) {
        const restedCount = (p: typeof player) => p.field.spirits.filter((s) => s.isRested).length
        return restedCount(player) + restedCount(state.players[opponentOf(pid)]) >= condition.bothFieldsRestedSpiritsAtLeast
    }
    // BS15共通器：BS15-043ショーグンペンタン「自分の黄のスピリットが3体以上いるとき」
    if ("ownColorCountAtLeast" in condition) {
        const { color, count } = condition.ownColorCountAtLeast
        return player.field.spirits.filter((s) => instHasColor(s, color)).length >= count
    }
    // BS15共通器：BS15-053コジロンド・ゴレム「自分のフィールドに【粉砕】/【大粉砕】を持つスピリットが1体以上いるとき」
    if ("ownFieldHasKeywordAny" in condition) {
        return player.field.spirits.some((s) => condition.ownFieldHasKeywordAny.some((k) => spiritHasKeyword(state, pid, s, k)))
    }
    // BS15共通器：BS15-083秘剣燕返「相手の手札が5枚以上のとき」
    if ("opponentHandAtLeast" in condition) {
        return state.players[opponentOf(pid)].hand.length >= condition.opponentHandAtLeast
    }
    // BS16共通器：このバースト発動時に破壊された（同時破壊なら全メンバーの）色にこの色が含まれるか
    if ("burstDestroyedColor" in condition) {
        return (state.burstEventColors ?? []).includes(condition.burstDestroyedColor)
    }
    // 器BS16：発生源の持ち主のフィールドに指定系統（配列＝OR）のスピリットがcount体以上いるか
    // （BS16-005ゴエモン・シーフ・ドラゴン：「系統：「覇皇」/「雄将」を持つ自分のスピリットがいるとき」）
    if ("ownFamilyCountAtLeast" in condition) {
        const { family, count } = condition.ownFamilyCountAtLeast
        return player.field.spirits.filter((s) => matchesFamilyFilter(state, pid, s, family)).length >= count
    }
    // ownFamilyCountAtLeastの相手版（BS16-027：「系統：『覇皇』/『雄将』を持つ相手のスピリットがいるとき」）
    if ("opponentFamilyCountAtLeast" in condition) {
        const { family, count } = condition.opponentFamilyCountAtLeast
        const oppPlayer = state.players[opponentOf(pid)]
        return oppPlayer.field.spirits.filter((s) => matchesFamilyFilter(state, opponentOf(pid), s, family)).length >= count
    }
    // フィールド（スピリット・ネクサス・合体中のブレイヴの上）＋リザーブ＋トラッシュのコアの合計。
    // ライフとソウルコアは数えない（効果文が挙げている3つのゾーンだけ。BS14-X03）
    const fieldCores =
        player.field.spirits.reduce((n, i) => n + i.cores, 0) +
        player.field.nexuses.reduce((n, i) => n + i.cores, 0) +
        player.field.combinedBraves.reduce((n, i) => n + i.cores, 0)
    return fieldCores + player.reserve + player.trashCores >= condition.ownCoresTotalAtLeast
}

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
        // event: "ownSpiritDestroyed" 限定：破壊されたスピリットの実効BP（破壊直前の近似値。kind:"burst".destroyedMinBpの判定に使う。BS15-034ミブロック・ジーナス）
        destroyedBp?: number
        // event: "ownNexusDestroyed" 限定：**相手の**スピリット/ネクサス/マジックの効果による破壊か
        // （destroyNexus が DestroyContext から求めて渡す。byOpponentEffectOnly の判定に使う）
        // event: "ownSpiritExhausted" 限定：**相手の**スピリット/ブレイヴ/マジックの効果による疲労か
        // （ネクサスの効果による疲労は含まない。fireExhaustedTriggers が計算する。BS12-062白煙の大山脈）
        byOpponentEffect?: boolean
        // event: "ownSpiritDestroyed" 限定：**相手のスピリットの**効果による破壊か（byOpponentSpiritEffectOnly の判定に使う）
        bySpiritEffect?: boolean
        // 同上：その効果を発揮したスピリットのインスタンスID（byOpponentSpiritEffectOnly 指定時の対象決定に使う。BS10-012/BS10-014）。
        // event: "ownSpiritSummoned" 限定：**召喚されたスピリット自身**のインスタンスID（summonedSpiritAsTarget が読む。BS13-053モクバオー）
        sourceInstanceId?: string
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
        // 同上：その召喚が【神速】によるものだったか（sokuSummonOnly の判定に使う。BS11-065 満天の牧草地Lv2）
        bySoku?: boolean
        // 同上：手札からの召喚だったか（fromHandOnly の判定に使う。BS11-X05 魔導双神ジェミナイズ）
        fromHand?: boolean
        // event: "ownMagicUsed" 限定：そのマジックが「コストを支払って」使用されたか（paidCostOnly の判定に使う。BS11-X05 魔導双神ジェミナイズ Lv2-3）
        paidCost?: boolean
        // event: "ownBurstActivated" 限定：発動したバーストのカードのコスト（docs/design/BURST.md）
        burstCost?: number
        // event: "anySpiritRefreshed" 限定：回復させた効果の発生源種別（refreshSpiritのsourceType引数をそのまま渡す。
        // undefined＝リフレッシュステップ・ネクサスの効果由来。refreshSourceTypeFilterの判定に使う。BS14-085賛美するパイプオルガン）
        refreshSourceType?: CardType
    },
    // 場から離れた発生源を走査に加える（「**自分のネクサスが破壊されたとき**」を、
    // 破壊されたネクサス自身が持っている場合。effectSources はもう場にいないものを返さないため、
    // これが無いと自分自身の破壊では無言で発火しない。BS07の各色ネクサス6枚。2026-08-10 修正）
    extraSources?: CardInstance[],
    // 破壊で誘発した効果を1列に並べるための外部項目（docs/design/TIMING_CHART.md）。
    // ownSpiritDestroyed から、破壊されたカード自身の『破壊時』と「フィールドに残る／戻る」を
    // **同じ列**に混ぜてターンプレイヤーに順番を選ばせるために使う。他のイベントでは使わない
    extraItems?: FieldEventExtraItem[],
    // 発生源から除外する instanceId（docs/design/BURST.md）。ownBurstActivated が
    // 「発動開始時点で場にいた発生源にだけ発火させる」ために、summonBurstCardFreeで新しく場に出た
    // 個体をここで除く
    excludeInstanceIds?: string[],
    // BS16バッチ0：破壊後バースト（kind:"burst".event:"ownSpiritDestroyed"）は、破壊待機中のこの走査では
    // 判定しない（トラッシュ行き確定の後に fireQueuedDestroyBursts が1回だけ判定する。TIMING_CHART.md ＞６）。
    // trueのときはこの関数末尾のバースト走査を丸ごと飛ばす
    skipBurst?: true,
): void {
    const player = state.players[pid]
    // effectSources()：このターンだけの仮想発生源（マジックが貸した継続効果。lendSelfThisTurn。
    // BS05ソウルクラッシュ）も含める。「誰が誘発効果を出しているか」を問うA分類の走査
    // （TURN_EFFECT_SOURCES.md §1）
    // extraSources は場を離れた個体を拾うためのもの。破壊処理の途中ではその個体がまだ field.spirits に居るので、
    // instanceId で重複を除く（除かないと fieldEvent＋selfOnly が2回解決される。BS13-010スカルザード。smoke part341）
    const baseSources = effectSources(state, pid)
    const instances = extraSources && extraSources.length > 0
        ? [...baseSources, ...extraSources.filter((x) => !baseSources.some((b) => b.instanceId === x.instanceId))]
        : baseSources
    // ⚠️ **発火するものを先に全部集めてから順に解決する**（2026-08-17。fireStepTriggers と同じ形）。
    // 以前はループの中で直接解決し、選択待ちが立ったら `return` するだけだったため、
    // **同じイベントの残りの誘発が永久に失われていた**
    // （共鳴する音叉の塔を2枚並べると、1枚目の確認で中断して2枚目が発火しなかった）。
    // 条件は**誘発した時点**で判定する（repeatTimes もここで確定させる）
    const firing: {
        inst: CardInstance
        effect: Extract<EffectDef, { kind: "fieldEvent" }>
        repeatTimes: number
    }[] = []
    for (const inst of instances) {
        if (excludeInstanceIds?.includes(inst.instanceId)) continue
        const card = getCard(inst.cardId)
        const level = currentLevel(inst).level
        for (const effect of card.effects) {
            if (effect.kind !== "fieldEvent") continue
            if (effect.event !== event) continue
            // lentOnly：仮想発生源からのみ有効（実在カードが同じエントリを持っても恒久化させない）
            if (effect.lentOnly && !isVirtualSource(inst)) continue
            // selfOnly：発生源自身が破壊されたときだけ（ownSpiritDestroyed 限定。BS13-010 スカルザード）
            if (effect.selfOnly && inst.instanceId !== selfOverride?.inst.instanceId) continue
            // excludeSelfSubject（BS15-009虚龍帝カタストロフドラゴン）：イベントの主体が発生源自身のときは発火しない
            if (effect.excludeSelfSubject && inst.instanceId === selfOverride?.inst.instanceId) continue
            if (!effectActiveOn(inst, effect, level)) continue
            // ターンに1回（BS13-070星宿の障壁Lv2）。kind:"triggered".oncePerTurnと同じ記録先を共有する
            // **マッチ時点で消費する**（コストが後で不発でも1回ぶん消費される）。これは新しい簡略化ではなく、
            // 既存の kind:"triggered" の oncePerTurn と同じ挙動（下の firing.push 手前で同様に記録している）。
            // ルール上は払えなければ発揮していないので消費すべきでない＝既知のズレ（HANDOFF §2）
            if (effect.oncePerTurn === true && inst.triggeredUsedTurn?.[effect.id] === state.turn) continue
            // 【合体時】の色条件（X008）
            if (!combinedBraveColorsOk(state.players[pid], inst, effect.combinedBraveColors)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            // 「ドローステップ以外で」（BS08ダークアンキラーザウルス）：指定ステップでは発火しない
            if (effect.excludePhase !== undefined && state.phase === effect.excludePhase) continue
            if (effect.turn === "own" && pid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && pid === state.turnPlayer) continue
            // ownOnly（BS06冥騎士アンドラー／冥府の深淵）：発生源の持ち主（pid）のスピリットがアタックしたときのみ
            // （selfOverride.pidが発生源の持ち主と一致するときだけ通す。「自分のスピリットが」の限定）
            if (effect.ownOnly && selfOverride?.pid !== pid) continue
            // subjectSide：**イベントの主体がどちら側か**で絞る（turn＝誰のターンか、とは別軸）。
            // 「**相手の**スピリットが疲労したとき」のように、any…系のイベントで
            // 主体の陣営だけを条件にしたいときに使う（SD01-028 呪われし神殿Lv2）
            // subjectCombined：**イベントの主体が合体しているか**で絞る（BS10-070 鎧馬アルファズル）
            if (
                effect.subjectCombined !== undefined &&
                (selfOverride === undefined || instIsCombined(selfOverride.inst) !== effect.subjectCombined)
            ) {
                continue
            }
            if (effect.subjectSide === "own" && selfOverride?.pid !== pid) continue
            if (
                effect.subjectSide === "opponent" &&
                (selfOverride === undefined || selfOverride.pid === pid)
            ) {
                continue
            }
            // subjectMaxCores（BS13-063血塗られた魔具）：アタックしたスピリット自身のコア数で絞る
            if (effect.subjectMaxCores !== undefined && (selfOverride === undefined || selfOverride.inst.cores > effect.subjectMaxCores)) continue
            if (effect.colorFilter !== undefined && !(eventColors ?? []).includes(effect.colorFilter)) continue
            // sourceColorFilter：「**相手の**この色のスピリット/ネクサス/マジックの**効果によって**起きたとき」
            // だけ発火する（SD01-029 蠢く地下墓地Lv1＝緑／SD01-031 朝焼け岬Lv1＝紫）。
            // colorFilter がイベント**対象**の色を見るのに対し、こちらは効果の**発生源**の色を見る。
            // currentEffectSource が無い＝効果によらない動き（ドローステップのドロー・コアステップのコア置き）
            // なので発火させない。docs/design/EFFECT_SOURCE_CONTEXT.md
            if (effect.sourceColorFilter !== undefined) {
                const src = state.currentEffectSource
                if (!src) continue
                if (src.pid === pid) continue
                if (!(src.colors ?? []).includes(effect.sourceColorFilter)) continue
            }
            // targetColorFilter：イベントの「相手役」（targetInstanceId）の色で絞る。
            // colorFilter（イベントの主体の色）とは別軸（SD01-029 蠢く地下墓地Lv2＝緑にブロックされたとき）
            if (effect.targetColorFilter !== undefined) {
                if (targetInstanceId === undefined) continue
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) continue
                if (!instHasColor(found.inst, effect.targetColorFilter)) continue
            }
            // vanillaOnly：破壊/召喚のように主体が既にフィールドを離れているイベントは
            // 呼び出し側が eventInfo.vanilla を渡す。anySpiritAttacked のように主体が場に残る
            // イベントは selfOverride の実体で判定する（継続付与の「バニラとしても扱う」も見る）
            if (effect.vanillaOnly) {
                const subjectIsVanilla = eventInfo?.vanilla ?? (selfOverride !== undefined && instIsVanilla(selfOverride.inst))
                if (!subjectIsVanilla) continue
            }
            // subjectKeywordFilter（BS11-069 黄金の鐘楼Lv2＝【聖命】持ち）：主体の実体で判定する。
            // 破壊のイベントでも、この時点では破壊待機状態でまだ場にいるのでキーワードを読める
            if (effect.subjectKeywordFilter !== undefined) {
                if (selfOverride === undefined) continue
                const needs = Array.isArray(effect.subjectKeywordFilter)
                    ? effect.subjectKeywordFilter
                    : [effect.subjectKeywordFilter]
                if (!needs.some((kw) => spiritHasKeyword(state, selfOverride.pid, selfOverride.inst, kw))) continue
            }
            // 器BS16：subjectMaxCost / subjectHasTrigger（BS16-064宙吊りの五行山Lv2）。
            // 主体の実体（selfOverride）で判定する＝subjectKeywordFilterと同じ考え方
            if (effect.subjectMaxCost !== undefined) {
                if (selfOverride === undefined || !instMatchesCostFilter(selfOverride.inst, { max: effect.subjectMaxCost })) continue
            }
            if (effect.subjectHasTrigger !== undefined) {
                if (selfOverride === undefined || !instHasTriggerEffect(selfOverride.inst, effect.subjectHasTrigger)) continue
            }
            if (effect.byBattleOnly && !eventInfo?.byBattle) continue
            // 「アタックした自分のスピリットが破壊されるたび」（BS06ベリアルドロー）：
            // ブロッカーとして破壊された場合は発火させない
            if (effect.attackerOnly && !eventInfo?.wasAttacker) continue
            // 「このスピリットのアタック時」限定（BS16-027）：発生源自身が現在のバトルのアタッカーであるときだけ
            if (effect.duringSelfAttack && state.battle?.attackerInstanceId !== inst.instanceId) continue
            // 「相手のスピリット/ネクサス/マジックの効果で破壊されたとき」（BS07の各色ネクサス6枚）：
            // 自分の効果で自分のネクサスを壊した場合や、発生源が不明な破壊では発火しない
            if (effect.byOpponentEffectOnly && !eventInfo?.byOpponentEffect) continue
            // 「相手によって破壊されたとき」（BS15-061幼竜の揺り籠Lv2）：相手の効果による破壊 **または**
            // バトルのBP比較による破壊（reviveOnDestroy.when.byOpponentと同じ判定。byOpponentEffectOnlyより広い）
            if (effect.byOpponentOnly && !(eventInfo?.byOpponentEffect || eventInfo?.byBattle)) continue
            // 「相手のスピリットの効果で破壊されたとき」（BS10-012アントイーター/BS10-014闇騎士マリス）
            if (effect.byOpponentSpiritEffectOnly && !eventInfo?.bySpiritEffect) continue
            // event: "anySpiritRefreshed" 限定：回復させた効果の発生源種別で絞る（BS14-085賛美するパイプオルガン：
            // 「スピリット/マジックの効果で回復した」＝ネクサスの効果・リフレッシュステップ由来（sourceType未指定）は対象外）
            if (
                effect.refreshSourceTypeFilter !== undefined &&
                (eventInfo?.refreshSourceType === undefined ||
                    !effect.refreshSourceTypeFilter.includes(eventInfo.refreshSourceType))
            ) {
                continue
            }
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
            // アタックしたスピリット（selfOverride）のシンボル数で絞る（BS12-037オリンピアの天使ベトール：シンボル2つ）
            if (
                effect.symbolCount !== undefined &&
                (selfOverride === undefined || instanceSymbolCount(selfOverride.inst) !== effect.symbolCount)
            ) {
                continue
            }
            // 「一度に◯枚以上破棄したとき」（アリゲイド）：eventCount が閾値以上のときのみ
            if (effect.minEventCount !== undefined && (eventCount ?? 0) < effect.minEventCount) continue
            // 相手のマジック使用（氷の女神フリッグ）：コスト／タイミングの一致で絞る
            if (effect.magicCostEquals !== undefined && eventInfo?.magicCost !== effect.magicCostEquals) continue
            if (effect.magicTiming !== undefined && eventInfo?.magicTiming !== effect.magicTiming) continue
            // 「このスピリットが疲労したとき」（スクルディア）：イベント対象が発生源自身のときだけ
            // eventTargetIsSelf：「このスピリットが」＝inst自身が対象のとき。inst が合体中のブレイヴ自身なら
            // 「このスピリット」はホスト（合体スピリット。1体として振る舞う）を指す（selfMode:"source"と同じ考え方。
            // BS14-068ストラスト【合体時】：「このスピリットが疲労したとき」＝ホストが疲労したとき）
            if (effect.eventTargetIsSelf) {
                const selfTarget = inst.braveCombined === true ? (hostsOf(player, inst)[0] ?? inst) : inst
                if (selfOverride?.inst.instanceId !== selfTarget.instanceId) continue
            }
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
            if (effect.sokuSummonOnly && eventInfo?.bySoku !== true) continue
            if (effect.fromHandOnly && eventInfo?.fromHand !== true) continue
            // 「コストを支払って」使用されたときのみ（BS11-X05 魔導双神ジェミナイズLv2-3）。
            // このカード自身の無償使用（paidCost:false）からは連鎖しない
            if (effect.paidCostOnly && eventInfo?.paidCost !== true) continue
            // 「ターンに2回しか使えない」：実際に無償使用した回数（confirmで断った・候補が無かった場合は含まない）で絞る
            if (effect.magicFreeUseMaxPerTurn !== undefined) {
                const usedSoFar = inst.magicFreeUseTurn === state.turn ? (inst.magicFreeUseCount ?? 0) : 0
                if (usedSoFar >= effect.magicFreeUseMaxPerTurn) continue
            }
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
                } else if ("targetMaxCostOfEventTarget" in effect.condition) {
                    // SD02-004 神獣ハクタクLv2-3：ブロックした相手（targetInstanceId）のコストがこれ以下のときのみ。
                    // 道化師クランの付与コストも見るため instMatchesCostFilter を使う
                    if (targetInstanceId === undefined) continue
                    const found = findSpiritAny(state, targetInstanceId)
                    if (!found) continue
                    if (!instMatchesCostFilter(found.inst, { max: effect.condition.targetMaxCostOfEventTarget })) continue
                } else if ("lastFunsaiHasSpirit" in effect.condition) {
                    // BS11-042 海賊ラッコルセア：直前の【粉砕】で破棄したカードの中にスピリットカードがあったときのみ
                    // （triggered.conditionの同名軸と同じ判定。GameState.lastFunsai）
                    if ((state.lastFunsai?.spirits ?? 0) === 0) continue
                } else if ("lastFunsaiHasCostAtLeast4" in effect.condition) {
                    // BS15共通器：BS15-053コジロンド・ゴレムLv2-3「コスト4以上のカードを破棄したとき」
                    if ((state.lastFunsai?.costAtLeast4 ?? 0) === 0) continue
                } else if ("opponentHandAtLeastOwnHand" in effect.condition) {
                    // BS13-042ナイト・ゴーンLv2：相手の手札枚数が自分の手札枚数以上のときのみ
                    if (state.players[opponentOf(pid)].hand.length < state.players[pid].hand.length) continue
                } else if ("opponentMagicUsedAtLeast" in effect.condition) {
                    // BS13-071巨人港Lv2：このターンに相手がマジックの効果を使用した回数がこれ以上のときのみ
                    // （state.magicUsedThisTurnはresolveMagicの解決前に加算済み＝この誘発の時点で最新値）
                    if ((state.magicUsedThisTurn[opponentOf(pid)] ?? 0) < effect.condition.opponentMagicUsedAtLeast) continue
                } else if ("burstCostAtMost" in effect.condition) {
                    // event: "ownBurstActivated" 限定：発動したバーストのカードのコストがこれ以下のときのみ
                    // （SD06-007英雄龍ロード・ドラゴン：「発動したカードがコスト5以下のとき」）
                    if (eventInfo?.burstCost === undefined || eventInfo.burstCost > effect.condition.burstCostAtMost) continue
                } else if ("ownBurstSet" in effect.condition) {
                    // BS14-X04氷の覇王ミブロック・バラガン：「自分のバーストをセットしていないとき」
                    // （triggered.conditionの同名軸と同じ判定。falseなら未セットの間だけ発火）
                    if (state.players[pid].burstSet !== effect.condition.ownBurstSet) continue
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
                    : effect.countMode === "funsaiSpirits"
                      ? (state.lastFunsai?.spirits ?? 0)
                      : eventCount
                        ? eventCount
                        : 1
                : 1
            // 同時破壊グループ：2体以上が同時に破壊されても、他カードの「破壊されたとき」は
            // グループにつき1回だけ（perDestroyed 指定は対象外。公式Q&A Q22359。fix/destroyed-trigger-once）。
            // 消費は resolve 側で解決確定するまでの間だけ先取りし、断った／不発なら revertDestroyGroupUsage で戻す
            // （oncePerTurn と同じ「マッチ時点で仮消費 → 未発揮なら巻き戻す」形）
            if (
                (event === "ownSpiritDestroyed" || event === "opponentSpiritDestroyed") &&
                state.destroyGroup &&
                effect.perDestroyed !== true
            ) {
                const groupKey = `${inst.instanceId}:${effect.id}`
                if (state.destroyGroup.used.includes(groupKey)) continue
                state.destroyGroup.used.push(groupKey)
            }
            // 発揮しなかったときは解決後に巻き戻す（triggered と同型。2026-09-16）
            if (effect.oncePerTurn) inst.triggeredUsedTurn = { ...(inst.triggeredUsedTurn ?? {}), [effect.id]: state.turn }
            firing.push({ inst, effect, repeatTimes })
        }
    }

    // 集めたものを順に解決する。`remaining` は「この誘発の残り回数」（repeatPerCount のぶん）
    const queue: { inst: CardInstance; effect: Extract<EffectDef, { kind: "fieldEvent" }> }[] = []
    for (const e of firing) for (let i = 0; i < e.repeatTimes; i++) queue.push({ inst: e.inst, effect: e.effect })

    // 1件ぶんの解決に必要な文脈（再開スタックへ積むときも同じ組み合わせを使う）
    const contextOf = (inst: CardInstance, effect: Extract<EffectDef, { kind: "fieldEvent" }>) => {
        // selfMode:"source" 指定時は、イベント対象ではなく発生源自身を self にする
        // （BS04鎧装獣ヘイズ・ルーン：相手のコスト1以下がアタックしたとき「このスピリットは回復する」）
        // ignoreEventTarget：イベント対象を効果の対象にしない（SD01-029 蠢く地下墓地Lv2）
        // byOpponentSpiritEffectOnly：対象をイベント対象ではなく「その効果を発揮したスピリット」にする
        // （eventInfo.sourceInstanceId。BS10-012アントイーター/BS10-014闇騎士マリス）
        const actionTargetId = effect.byOpponentSpiritEffectOnly || effect.summonedSpiritAsTarget
            ? eventInfo?.sourceInstanceId
            : effect.attackerAsTarget
              ? selfOverride?.inst.instanceId
              : effect.ignoreEventTarget
                ? undefined
                : targetInstanceId
        if (effect.selfMode === "source") {
            // inst が合体中のブレイヴ自身のときは、self はホスト（＝合体スピリット。1体として振る舞う）にする
            // （BS10鎧馬アルファズル：refreshSelf はホストの isRested を操作する必要がある）
            const src = inst.braveCombined === true ? (hostsOf(player, inst)[0] ?? inst) : inst
            return { actionPid: pid, actionSelf: src, actionTargetId, srcColors: undefined, srcType: undefined }
        }
        if (selfOverride) {
            // self はイベント対象（召喚されたスピリット等。filter の self 相対BPが参照する）だが、
            // **効果の発生源はこのエントリを持つカード（inst）**。装甲・マジック効果耐性の判定に使う
            // 色と種別は発生源のものを明示的に渡す（渡さないと self から導出され、
            // 「召喚されたスピリットの色で装甲を判定する」誤りになる。BS04七龍帝の玉座／鋼葉の樹林）
            return {
                actionPid: selfOverride.pid,
                actionSelf: selfOverride.inst,
                actionTargetId,
                srcColors: instColors(inst),
                srcType: getCard(inst.cardId).type,
            }
        }
        return { actionPid: pid, actionSelf: inst, actionTargetId, srcColors: undefined, srcType: undefined }
    }

    // extraItems（破壊で誘発した効果の列）を同じプールに混ぜる。
    // 混ぜることで「自身の『破壊時』→他カードの誘発→フィールドに残る」の順番を
    // ターンプレイヤーが1つずつ選べるようになる（docs/design/TIMING_CHART.md）
    type PoolItem =
        | { extra?: undefined; inst: CardInstance; effect: Extract<EffectDef, { kind: "fieldEvent" }> }
        | { extra: FieldEventExtraItem }
    const extras = extraItems ?? []
    const pool: PoolItem[] = [
        ...extras.filter((e) => e.first === true).map((extra) => ({ extra })),
        ...queue,
        ...extras.filter((e) => e.first !== true).map((extra) => ({ extra })),
    ]

    resolveInOrder(state, pool, {
        // 集めたあとに場を離れた発生源は発火させない（先に解決した効果で破壊されうる）。
        // 仮想発生源はフィールドに実体が無いので在否を見ない
        skip: (e) =>
            e.extra === undefined && !isVirtualSource(e.inst) && !isStillOnField(state, pid, e.inst.instanceId),
        resolve: (e) => {
            if (e.extra !== undefined) {
                resolveAction(state, e.extra.actorPid, e.extra.selfInstanceId ? findInstanceAnywhere(state, e.extra.selfInstanceId) ?? null : null, e.extra.action)
                return
            }
            const c = contextOf(e.inst, e.effect)
            // 「〜できる」（optional）は実対戦では発動可否を確認する（triggered/step/battleWonと同じ扱い。
            // interactiveTargets=false（テスト）では従来どおり常に発動する。BS08聖なる柱状彫刻Lv2）
            if (e.effect.optional && state.interactiveTargets) {
                requestActivationConfirm(
                    state,
                    c.actionPid,
                    activationPrompt(e.inst),
                    e.effect.action,
                    c.actionSelf,
                    // oncePerTurn／同時破壊グループの仮消費どちらも、断ったときにここで戻す
                    // （revertDestroyGroupUsageは対象キーが無ければ何もしないので常に渡してよい）
                    { instanceId: e.inst.instanceId, effectId: e.effect.id },
                )
            } else {
                delete state.effectFizzled
                resolveAction(state, c.actionPid, c.actionSelf, e.effect.action, c.actionTargetId, c.srcColors, c.srcType)
                // コストを払えないなどで何も起きなかったら、「ターンに1回」／同時破壊グループの消費を戻す（2026-09-16／fix/destroyed-trigger-once）
                if (state.effectFizzled) {
                    if (e.effect.oncePerTurn) revertOncePerTurn(e.inst, e.effect.id)
                    revertDestroyGroupUsage(state, e.inst.instanceId, e.effect.id)
                }
                delete state.effectFizzled
            }
        },
        frame: (e) => {
            if (e.extra !== undefined) {
                return {
                    kind: "action" as const,
                    selfInstanceId: e.extra.selfInstanceId,
                    action: e.extra.action,
                    actorPid: e.extra.actorPid,
                    ...(e.extra.requiresPendingDestructionOf !== undefined
                        ? { requiresPendingDestructionOf: e.extra.requiresPendingDestructionOf }
                        : {}),
                }
            }
            const c = contextOf(e.inst, e.effect)
            return {
                kind: "action" as const,
                selfInstanceId: c.actionSelf.instanceId,
                action: e.effect.action,
                actorPid: c.actionPid,
                ...(c.actionTargetId !== undefined ? { targetInstanceId: c.actionTargetId } : {}),
                ...(c.srcColors !== undefined ? { sourceColors: c.srcColors } : {}),
                ...(c.srcType !== undefined ? { sourceType: c.srcType } : {}),
                ...confirmPromptIfOptional(state, e.inst, e.effect.optional),
            }
        },
        // 同時発揮の解決順はターンプレイヤーが決める（TIMING_CHART.md §0-3）
        askOrder: {
            pid: state.turnPlayer,
            label: (e) => (e.extra !== undefined ? e.extra.label : `${state.players[pid].name}の${getCard(e.inst.cardId).name}`),
            // ⚠️ **持ち主込みのカード単位**で見る。相手の同名ネクサスと混ざらないように pid を入れる
            // （step 版と同じ形。2026-09-08 に効果エントリ単位＋pid無しから直した）
            key: (e) => (e.extra !== undefined ? e.extra.key : `${pid}:${e.inst.cardId}`),
        },
    })

    // バースト（docs/design/BURST.md）：effectSources() には入れないため、上のフィールド発生源の
    // 走査とは別に、ここで両プレイヤーのバーストエリアを見る。上の解決で選択待ちが残っている間は割り込まない。
    // skipBurst指定時（破壊待機中のownSpiritDestroyed走査）はここで判定しない（BS16バッチ0：呼び出し元が
    // トラッシュ行き確定後にfireQueuedDestroyBursts経由でfireBurstOnEventを直接呼ぶ）
    if (state.pendingChoice || skipBurst) return
    fireBurstOnEvent(
        state,
        pid,
        event,
        selfOverride ? { pid: selfOverride.pid, cardId: selfOverride.inst.cardId } : undefined,
        eventColors,
        targetInstanceId,
        eventInfo,
    )
}

// kind:"burst" の走査本体（docs/design/BURST.md）。fireFieldEventTriggers の末尾から呼ぶほか、
// BS16バッチ0：破壊後バースト（event:"ownSpiritDestroyed"）はトラッシュ行き確定後に
// removal.ts の fireQueuedDestroyBursts が単独で呼ぶ（selfOverrideは{pid, cardId}の軽量版でよい。
// 破壊済みの個体はもうCardInstance実体が無いため）
export function fireBurstOnEvent(
    state: GameState,
    pid: PlayerId,
    event: FieldEvent,
    selfOverride: { pid: PlayerId; cardId?: string } | undefined,
    eventColors: Color[] | undefined,
    targetInstanceId: string | undefined,
    eventInfo?: {
        byOpponentEffect?: boolean
        destroyedBp?: number
        costs?: number[]
    },
): void {
    // 同時に条件を満たした場合は防御側（ターンプレイヤーでない側）の宣言を優先する＝走査順を固定するだけでよい
    // （2026-09-11 ユーザー確認）
    const order: PlayerId[] = [opponentOf(state.turnPlayer), state.turnPlayer]
    for (const holderPid of order) {
        const holder = state.players[holderPid]
        const burstCardId = holder.burst
        if (burstCardId === null) continue
        let effect = getCard(burstCardId).effects.find(
            (e): e is Extract<EffectDef, { kind: "burst" }> => e.kind === "burst" && e.event === event,
        )
        // BS15共通器：globalConstraint "burstAltEventFromOpponentSummon"（発生源=holder自身）が
        // 効いている間、event:"opponentSummonEffectResolved"のバーストは"ownLifeDamaged"でも拾う
        // （BS15-069太陰の宮廷Lv2）
        const hasBurstAltEvent = effectSources(state, holderPid).some((src) => {
            const srcLevel = currentLevel(src).level
            return getCard(src.cardId).effects.some(
                (e) =>
                    e.kind === "globalConstraint" &&
                    e.constraint.type === "burstAltEventFromOpponentSummon" &&
                    effectActiveAtLevel(e.levels, srcLevel),
            )
        })
        if (!effect && event === "ownLifeDamaged" && hasBurstAltEvent) {
            effect = getCard(burstCardId).effects.find(
                (e): e is Extract<EffectDef, { kind: "burst" }> => e.kind === "burst" && e.event === "opponentSummonEffectResolved",
            )
        }
        if (!effect) continue
        // 「このスピリットのバトル時、相手はバーストを発動できない」（BS15-X03鳥武帝スザクロス・ソウソー）
        if (state.battle?.burstBlockedForPid === holderPid) continue
        // subjectSide：fieldEvent の同名軸と同じ判定（own=バーストの持ち主自身の事象、opponent=その相手の事象）
        if (effect.subjectSide === "own" && selfOverride?.pid !== holderPid) continue
        if (effect.subjectSide === "opponent" && (selfOverride === undefined || selfOverride.pid === holderPid)) continue
        // byOpponentEffectOnly / destroyedColorFilter：fieldEvent の同名軸と同じ判定（event: "ownSpiritDestroyed" 限定）
        if (effect.byOpponentEffectOnly && !eventInfo?.byOpponentEffect) continue
        if (effect.destroyedColorFilter !== undefined && !(eventColors ?? []).includes(effect.destroyedColorFilter)) continue
        if (effect.destroyedMinBp !== undefined && (eventInfo?.destroyedBp ?? 0) < effect.destroyedMinBp) continue
        // condition：バーストの宣言自体はここまで来た時点で成立している。満たさないときはactionの解決だけを飛ばす
        // （「このスピリットカードを召喚する」等が空振りし、finishBurstActivationの既定どおりトラッシュへ置かれる）
        const actionToRun: EffectAction = burstConditionMet(state, holderPid, effect.condition) ? effect.action : { type: "noop" }
        // destroyedAsTarget：破壊された個体はもう場に無く、トラッシュには cardId でしか残らないので、
        // instanceId ではなく **cardId** を渡す（受け手は recoverMagicFromTrash の onlyBurstDestroyedCard）
        const destroyedCardId = effect.destroyedAsTarget ? selfOverride?.cardId : undefined
        // alsoDrawIfDestroyedColor（BS14-X02）：eventColorsはここでしか手に入らないため、宣言時点でbool化しておく
        const alsoDraw = effect.alsoDrawIfDestroyedColor !== undefined && (eventColors ?? []).includes(effect.alsoDrawIfDestroyedColor)
        // BS16バッチ0：破壊後バーストのコストが1つの値に決まらない（同時破壊で複数体・値違い）ときは、
        // 発動者が使う値を1つ選ぶ（対話：選択肢／非対話：最大値。1つだけ・全部同じならそのまま）
        const costs = eventInfo?.costs ?? []
        const distinctCosts = [...new Set(costs)]
        // event:"ownLifeDamaged"限定：ライフを減らしたスピリットのinstanceId（EffectCounter等が読む先はstate.burstEventLifeDamagerId）
        const lifeDamagerId = event === "ownLifeDamaged" ? (targetInstanceId ?? state.battle?.lifeDamagers?.at(-1)) : undefined
        // 発動は常に任意（バーストは宣言制。空打ち＝条件未達での宣言は不可なので、ここに来た時点で条件は満たしている）。
        // 実対戦では発動確認を出し、非対話（テスト）では従来どおり自動で発動する
        if (state.interactiveTargets) {
            if (distinctCosts.length > 1) {
                // コストの選択肢つき確認（「発動する」の代わりに「コストNで発動する」を並べる）
                suspend(state, {
                    pid: holderPid,
                    kind: "option",
                    prompt: `${getCard(burstCardId).name}のバーストを発動しますか？`,
                    candidates: [],
                    options: distinctCosts.map((c) => `コスト${c}で発動する`),
                    optional: true,
                    confirm: true,
                    action: actionToRun,
                    selfInstanceId: null,
                })
            } else {
                requestActivationConfirm(state, holderPid, `${getCard(burstCardId).name}のバーストを発動しますか？`, actionToRun, null)
            }
            // ⚠️ 対話モードでは、この1件を確認してから返る。同時に相手側も条件を満たしていた場合、
            // その宣言は今回は提示しない簡略化（1事象につき先着1件。docs/design/BURST.md）
            // 上の早期 return で pendingChoice は null に絞られているため、型注釈付きの局所変数で読み直す
            const pending = state.pendingChoice as PendingChoice | null
            if (pending) {
                pending.burstActivate = {
                    pid: holderPid,
                    cardId: burstCardId,
                    ...(effect.thenPay !== undefined ? { thenPay: effect.thenPay } : {}),
                    ...(destroyedCardId !== undefined ? { destroyedCardId } : {}),
                    ...(alsoDraw ? { alsoDraw: true as const } : {}),
                    ...(effect.returnSelfToHandAfter ? { toHand: true as const } : {}),
                    // BS15共通器：EffectCounter "burstEventCost" が読む値を確認の再入まで持ち回る
                    // （BS15-084爆砕轟神掌／BS15-X06鉄の覇王サイゴード・ゴレム）
                    ...(distinctCosts.length > 1
                        ? { burstEventCostOptions: distinctCosts }
                        : costs[0] !== undefined
                          ? { burstEventCost: costs[0] }
                          : {}),
                    ...(eventColors && eventColors.length > 0 ? { burstEventColors: eventColors } : {}),
                    ...(lifeDamagerId !== undefined ? { burstEventLifeDamagerId: lifeDamagerId } : {}),
                }
            }
            return
        }
        const before = fieldInstanceIdsOf(state, holderPid)
        // バースト効果を解決している間だけ目印を立てる（coreReturnBonus.ownBurstOnly。BS14-019）
        state.resolvingBurstPid = holderPid
        // BS15共通器：EffectCounter "burstEventCost" 用（BS15-084／BS15-X06）。非対話では最大値を使う
        if (distinctCosts.length > 0) state.burstEventCost = Math.max(...distinctCosts)
        else delete state.burstEventCost
        // BS16共通器：条件{burstDestroyedColor}用
        if (eventColors && eventColors.length > 0) state.burstEventColors = eventColors
        else delete state.burstEventColors
        if (lifeDamagerId !== undefined) state.burstEventLifeDamagerId = lifeDamagerId
        else delete state.burstEventLifeDamagerId
        // バーストのカードの色と種別を渡す（【装甲】などの効果耐性はバースト効果にも効く。【氷壁】は resolveMagic にしか無いので対象外のまま。BURST.md §7）。
        // 色は magicEffectiveColors を通す（紫のマジックのバースト効果にも015が効くように。BS15_PLAN.md §7.3）
        const burstCard = getCard(burstCardId)
        resolveAction(
            state,
            holderPid,
            null,
            actionToRun,
            destroyedCardId ?? targetInstanceId,
            magicEffectiveColors(state, holderPid, burstCard),
            burstCard.type,
            undefined,
            undefined,
            burstCardId,
        )
        delete state.resolvingBurstPid
        if (alsoDraw && !state.winner && !state.pendingChoice) resolveAction(state, holderPid, null, { type: "draw", count: 1 })
        finishBurstActivation(state, holderPid, burstCardId, actionToRun.type, effect.thenPay, effect.returnSelfToHandAfter ? { toHand: true } : undefined)
        if (state.pendingChoice) return
        fireOwnBurstActivated(state, holderPid, before, burstCardId)
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
    tryHandFreeSummonOnOwnNexusDeployed(state, ownerPid)
}

// 手札のカード自身が持つ「自分のネクサスが配置されたとき、コストを支払わずに召喚できる」
// （kind:"freeSummonFromHandOnOwnNexusDeployed"。BS14-060 ティンダロ・ハウンド）。
// tryHandFreeSummonOnLifeDamaged（removal.ts）と同型：実対戦では確認を出し、非対話では自動召喚する
function tryHandFreeSummonOnOwnNexusDeployed(state: GameState, pid: PlayerId): void {
    if (state.pendingChoice || state.winner) return
    const player = state.players[pid]
    for (let i = 0; i < player.hand.length; i++) {
        const cardId = player.hand[i]
        if (cardId === undefined) continue
        const effect = getCard(cardId).effects.find((e) => e.kind === "freeSummonFromHandOnOwnNexusDeployed")
        if (!effect) continue
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

// ネクサスが「配置」されたときの発火をまとめたもの。通知は2種類あり別物:
//   ・fireSummonTrigger    … 置かれたネクサス自身の『このネクサスの配置時』（trigger:"onSummon"）
//   ・notifyNexusDeployed  … 他カードの「自分のフィールドにネクサスが配置されたとき」
// ⚠️ 2026-08-28 まで、前者を呼んでいたのは手札からの通常配置だけで、効果による配置
// （トラッシュから／コストを支払わずに／デッキ破棄から）では自身の『配置時』が黙って消えていた。
// 経路ごとに2行書くと同じ呼び忘れが再発するので、配置の経路はすべてこの1本を通す。
// **破壊されたネクサスの復活（destroy.ts）とスピリット化の解除（PhaseManager）は「配置」ではない**ので、
// ここは通さず notifyNexusDeployed だけを呼ぶ（2026-08-28 ユーザー判断）
export function fireNexusDeployed(state: GameState, ownerPid: PlayerId, inst: CardInstance, fromHand?: boolean): void {
    // ネクサスの『このネクサスの配置時』は `onDeploy`。スピリットの『召喚時』（onSummon）とは
    // **別のカテゴリ**なので分けている（SEMANTICS_AUDIT.md §3.17）。
    // `fireSummonTrigger` を通さないのは、そこで見ている noSummonTriggerByCost（コストの低い
    // **スピリット**の召喚時効果を止める）も resolvingSummonTriggerPid（「相手の**スピリット**の
    // 召喚時効果を受けない」）も、どちらもスピリット限定の規則だから
    // 器BS16：fromHand（手札から配置したときのみ発火する条件。effect.fromHandOnly）
    fireTrigger(state, ownerPid, inst, "onDeploy", undefined, undefined, undefined, undefined, fromHand === true)
    notifyNexusDeployed(state, ownerPid)
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
            if (effect.lentOnly && !isVirtualSource(source)) continue
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
