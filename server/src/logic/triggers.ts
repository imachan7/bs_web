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
import { noteCoverage } from "../../../shared/coverage"
import { markPays } from "./actions/pay"
import type {
    CardInstance, EffectAction, EffectDef, GameState, PlayerId,
    ResolvedTargetFilter, TimedContent,
    TriggerEvent
} from "../type"
import {
    currentLevel, findInstanceAnywhere,
    getCard,
    log, opponentOf, pushResumeFrames
} from "./GameState"
// 共有ルール層（shared/）へ移設した純粋述語。サーバー／クライアントで同一実装を使う。
// 外部から EffectModules 経由で import している箇所を壊さないため、再エクスポートで名前を残す
import type { KeywordInfo } from "../../../shared/rules"
import {
    activeConstraints,
    auraAmount, auraAppliesTo,
    checkAuraCondition,
    costCantAct,
    countAuraCounter,
    countSpiritsWeighted,
    countSymbols,
    effectActiveAtLevel,
    effectiveBp, effectSources,
    hasArmorAgainst,
    hasContinuousKeywordGrant,
    continuousKeywordGrantCount,
    handSizeOf,
    hasFullEffectImmunity,
    hasGlobalConstraint,
    hasMagicImmunity,
    hasBounceImmunity,
    instanceSymbolCount, instColors,
    instEffectsSuppressed,
    nexusEffectsStopped,
    instHasColor,
    instHasCost,
    instHasTriggerEffect,
    isUntargetableByOpponent, isVirtualSource,
    cardNameContains,
    matchesTarget,
    timedContentsFor,
    timedContentsOn,
    KEYWORDS,
    instMatchesCostFilter, matchesFamilyFilter,
    noOpponentTriggerByColor,
    noSummonTriggerByCost,
    spiritHasFamily, spiritHasKeyword,
    spiritHasKeywordOrLabel,
    effectActiveOn,
    isOnFieldAnyZone,
    instIsCombined,
    bravesOf,
    combinedBraveColorsOk, opponentFieldColorCount,
    ownFieldOnlyColor,
    ownAllHaveFamily,
    ownAllHaveTeam,
    ownTeamAtLeast
} from "../../../shared/rules"
export type { KeywordInfo }
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
    findSpiritAny,
    hasAttackTriggersAsBlock,
    hasBlockTriggersAsAttack,
    blockTriggersAlsoOnAttack, requestActivationConfirm,
    resolveAction
} from "./EffectModules"
import { setTargetRedirect } from "./magic/redirect"
import { isOnceUsed, markOnceUsed, revertOnceUsed } from "./oncePerTurn"
import { finishSummonEffect } from "./keywords/burst"
import { keishoExcludedTeamAtLeast, soulCoreInReserve } from "./soulCore"
import type { CollectedTrigger } from "./blockDeclared"
import { fireFieldEventTriggers } from "./fieldEventTriggers"
export { resolveMagic } from "./magic/cast"
export { findMagicNegateSource, applyMagicNegateChoice, declineMagicNegateChoice } from "./magic/negate"
export { bothSidesPids, findBothSidesRedirectSource, bothSidesRedirectKeepPid, applyBothSidesRedirectToCandidates, BOTH_SIDES_REDIRECT_OPTIONS, applyMagicSideChoice, applyMagicRedirectChoice } from "./magic/redirect"
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
    if (timedContentsFor(state, ownerPid).some((c) => c.type === "suppressTrigger" && c.trigger === event)) return true
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
                noteCoverage(effect, "triggerSuppression")
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
    // 発揮する効果 id を絞る（fireEffect の「効果1つ」。付与された誘発は発揮しない）
    onlyEffectIds?: string[],
): void {
    // globalConstraint "noSummonTriggerByCost"（BS08共鳴する音叉の塔）：コストが低いスピリットの
    // 『このスピリットの召喚時』効果は発揮されない
    if (noSummonTriggerByCost(state, selfInstance, owner)) {
        log(state, `${getCard(selfInstance.cardId).name}：コストが低いため、召喚時効果は発揮されなかった。`)
        return
    }
    // ponytail: 召喚時効果の中で別のスピリットが召喚されたら、内側の分を発火した後に外側へ戻す。内側が選択で中断したときは外側の分が落ちる
    const outer = state.summonEffectSource
    state.summonEffectSource = { pid: owner, instanceId: selfInstance.instanceId, cost: getCard(selfInstance.cardId).cost }
    state.resolvingSummonTriggerPid = owner
    fireTrigger(state, owner, selfInstance, "onSummon", undefined, undefined, byFushi, undefined, undefined, onlyEffectIds)
    if (!state.pendingChoice) {
        delete state.resolvingSummonTriggerPid
        finishSummonEffect(state)
        if (outer !== undefined && state.summonEffectSource === undefined) state.summonEffectSource = outer
    }
}

// 「ターンに1回」の消費を戻す（発揮しなかったと分かったとき）。GameEngine の revertActivatedUse の誘発版
export function revertOncePerTurn(state: GameState, inst: CardInstance, effectId: string): void {
    revertOnceUsed(state, inst, effectId, "triggeredUsedTurn")
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
    onlyEffectIds?: string[], // fireSummonTrigger と同じ
    collect?: CollectedTrigger[], // 渡されたら解決せず、同時発揮の1件ずつとして積んで返る（blockDeclared.ts）
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
    if (instEffectsSuppressed(selfInstance) || nexusEffectsStopped(state, owner, selfInstance)) {
        log(state, `${getCard(selfInstance.cardId).name}の効果は発揮されなかった。`)
        return
    }
    // timedEffect の suppressTrigger（1体）：**この個体1体だけ**が対象の一時抑止（BS14-043月光姫マーニLv2）。
    // trigger:"onAttack"は【合体時】の『合体アタック時』も同時に防ぐ（どちらも内部的にonAttack）
    const timed = timedContentsOn(state, selfInstance)
    if (timed.some((c) => c.type === "suppressTrigger" && c.trigger === event)) {
        log(state, `${getCard(selfInstance.cardId).name}の効果は発揮されなかった。`)
        return
    }
    const card = getCard(selfInstance.cardId)
    const level = currentLevel(selfInstance).level
    // ブレイブチャージ：この個体の『アタック時』効果は、このターンの間『ブロック時』へ移る。
    // アタック時には発揮されなくなり（＝移し替え）、ブロック時に『ブロック時』効果と一緒に発揮される
    // ターン限定（ブレイブチャージ）に加え、継続付与（ドラグノ近衛兵）でも移し替えが起きる
    const movedToBlock =
        timed.some((c) => c.type === "triggerSwap" && c.from === "onAttack") ||
        hasAttackTriggersAsBlock(state, owner, selfInstance)
    // アタックシフト：このターンの間、両陣営スピリットすべての『ブロック時』効果は『アタック時』へ移る
    // （ブロック時には発揮されなくなり＝移し替え、アタック時に『アタック時』効果と一緒に発揮される。BS01-149）
    // アタックシフト（全体・このターン）に加えて、個体単位の移し替え（BS07マクラーンスラッシュ）と
    // 継続付与（BS07大械獣ギガ・テリウム）も見る
    const movedToAttack =
        timed.some((c) => c.type === "triggerSwap" && c.from === "onBlock") ||
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
            : (movedToAttack || blockTriggersAlsoOnAttack(state, owner, selfInstance)) && event === "onAttack"
              ? ["onAttack", "onBlock"]
              : [event]
    // src は**その効果エントリを持っているカードの個体**。ホスト自身のこともあれば、
    // 合体しているブレイヴのこともある（下の entries を参照）。
    // レベル判定と【合体時】のゲートは src で行う（ブレイヴは合体状態のレベル表を引く）
    const matches = (effect: EffectDef, src: CardInstance = selfInstance): effect is Extract<EffectDef, { kind: "triggered" }> => {
        if (effect.kind !== "triggered") return false
        if (!firedEvents.includes(effect.trigger)) return false
        if (onlyEffectIds !== undefined && !onlyEffectIds.includes(effect.id)) return false
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
        if (effect.oncePerTurn === true && isOnceUsed(state, owner, src, effect, "triggeredUsedTurn")) return false
        if (effect.condition === "selfWasAttacker") {
            // 26系【地鳴】の『アタック中』窓: selfがこのバトルのアタッカーのときだけ発火
            if (state.battle?.attackerInstanceId !== selfInstance.instanceId) return false
        }
        if (effect.condition && typeof effect.condition === "object") {
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
                        spiritHasKeywordOrLabel(state, owner, s, kw),
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
            } else if ("selfDestroyedByOwnEffect" in effect.condition) {
                const dc = selfInstance.pendingDestroyContext
                const want = effect.condition.selfDestroyedByOwnEffect.sourceFamily
                const fams = dc?.sourceCardId !== undefined ? getCard(dc.sourceCardId).family : []
                if (dc === undefined || dc.battle !== undefined || dc.sourcePid !== owner || !(Array.isArray(want) ? want : [want]).some((f) => fams.includes(f))) return false
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
            } else if ("ownAllHaveTeam" in effect.condition) {
                // 26系「自分のスピリット/ネクサスすべてが【X】を持つなら」：
                // 1体以上いて全員が指定チーム（CardData.team）所属のときのみ発火。0体では不成立
                if (!ownAllHaveTeam(state, owner, effect.condition.ownAllHaveTeam)) return false
            } else if ("ownAllHaveFamily" in effect.condition) {
                if (!ownAllHaveFamily(state, owner, effect.condition.ownAllHaveFamily)) return false
            } else if ("ownTeamAtLeast" in effect.condition) {
                // 26系「【X】を持つ自分のスピリットがN体以上いるなら」：
                // AuraCondition.ownTeamAtLeastと同じ判定（restedOnly指定時は疲労状態の個体だけを数える）
                if (!ownTeamAtLeast(state, owner, effect.condition.ownTeamAtLeast)) return false
            } else if ("soulCoreInReserve" in effect.condition) {
                // 26系「自分のリザーブに[ソウルコア]があるなら」
                if (!soulCoreInReserve(state.players[owner])) return false
            } else if ("ownKeishoExcludedTeamAtLeast" in effect.condition) {
                // 26系「この継召で【X】を持つカードをN枚以上除外していたなら」：
                // 直近の《継召》で除外したカード（keishoExcludedCardIds）で判定する
                if (!keishoExcludedTeamAtLeast(state, effect.condition.ownKeishoExcludedTeamAtLeast)) return false
            } else if ("summonedBy" in effect.condition) {
                // 26系「【Fチェンジ】で召喚していたなら」：発生源自身（src）の召喚経路が一致するときのみ発火
                if (src.summonedBy !== effect.condition.summonedBy) return false
            }
        }
        return true
    }
    // 付与された誘発効果（kind: "effectGrant"。アルカナビースト・ケン）：持ち主フィールドの発生源から
    // target/nameIncludes 一致でこのインスタンスに継続付与された誘発効果を、静的effectsの末尾に合成する
    // （grantedのlevelsは常に有効扱い。発生源自身もnameIncludes一致すれば対象に含む）
    // 加えて、timedEffect の grantTrigger でこの個体1体に直接付与された、このターン限りの
    // 誘発効果も同様に合成する（BS08メテオストーム）
    const tempGranted = timed
        .filter((g): g is Extract<TimedContent, { type: "grantTrigger" }> => g.type === "grantTrigger")
        .filter((g) => firedEvents.includes(g.trigger) && (g.battleRole === undefined || g.battleRole === battleRole))
        .filter((g) => {
            if (g.targetFilter === undefined) return true
            const other = targetInstanceId !== undefined ? findSpiritAny(state, targetInstanceId) : null
            return other != null && matchesTarget(state, other.pid, other.inst, g.targetFilter as unknown as ResolvedTargetFilter)
        })
        .map((g) => g.action)
    const grantedActions = onlyEffectIds !== undefined ? [] : [
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
    const resolveEntry = (entry: { effect: EffectDef; src: CardInstance }): void => {
        const effect = entry.effect as Extract<EffectDef, { kind: "triggered" }>
        // ターン1回の消費は**発揮する直前**に記録する（解決中に中断が入っても再発揮させない）。
        // 実際には発揮しなかったとき（コストを払えず不発／確認を断った）は下で巻き戻す
        // （RULES_BATSPI_WIKI.md。2026-09-16 ユーザー確定）
        if (effect.oncePerTurn === true) {
            markOnceUsed(state, owner, entry.src, effect, "triggeredUsedTurn")
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
            // 中の pay が確認で止まると、下の effectFizzled による巻き戻しは再開前に通り過ぎる。断った／不発のときに戻せるよう pay に渡す
            const action = effect.oncePerTurn === true ? markPays(effect.action, { onceRevert: { instanceId: entry.src.instanceId, effectId: effect.id } }) : effect.action
            resolveAction(state, owner, selfInstance, action, effect.eventTarget === "ignore" ? undefined : targetInstanceId)
            if (redirecting) delete state.magicRedirectTo
        }
        // コストを払えないなどで何も起きなかったら、「ターンに1回」の消費を戻す
        if (effect.oncePerTurn === true && state.effectFizzled) {
            revertOncePerTurn(state, entry.src, effect.id)
            delete state.effectFizzled
        }
    }
    if (collect !== undefined) {
        const label = `${state.players[owner].name}の${card.name}`
        const key = `${owner}:${selfInstance.cardId}`
        for (const entry of entries) {
            const effect = entry.effect
            if (!matches(effect, entry.src)) continue
            // frame 経由で解決される経路でも「ターンに1回」を消費済みにする（run 経由の markOnceUsed は冪等）
            if (effect.oncePerTurn === true) markOnceUsed(state, owner, entry.src, effect, "triggeredUsedTurn")
            const target = effect.eventTarget === "ignore" ? undefined : targetInstanceId
            collect.push({
                key,
                label,
                run: () => resolveEntry(entry),
                frame: {
                    kind: "action",
                    selfInstanceId: selfInstance.instanceId,
                    action: effect.oncePerTurn === true ? markPays(effect.action, { onceRevert: { instanceId: entry.src.instanceId, effectId: effect.id } }) : effect.action,
                    actorPid: owner,
                    ...(target !== undefined ? { targetInstanceId: target } : {}),
                    ...(effect.optional && state.interactiveTargets ? { confirmPrompt: `${getCard(entry.src.cardId).name}の効果を発動しますか？` } : {}),
                },
            })
        }
        for (const a of grantedActions) {
            collect.push({
                key,
                label,
                run: () => resolveAction(state, owner, selfInstance, a, targetInstanceId),
                frame: {
                    kind: "action",
                    selfInstanceId: selfInstance.instanceId,
                    action: a,
                    actorPid: owner,
                    ...(targetInstanceId !== undefined ? { targetInstanceId } : {}),
                },
            })
        }
        return
    }
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const effect = entry?.effect
        if (!entry || !effect || !matches(effect, entry.src)) continue
        resolveEntry(entry)
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
    // effectSources()：このターンだけの仮想発生源（マジックが貸した継続効果。BS03ブリッツ）も含める。
    // 破壊後に誘発する『バトル時』破壊されたとき等は、場を離れた直前の状態を見るので、誘発している個体自身も発生源に含める
    // ponytail: 同時に場を離れた別の発生源は拾わない。要るカードが出たら破壊直前の発生源を控える
    const fieldSources = effectSources(state, owner)
    const sources = fieldSources.includes(selfInstance) ? fieldSources : [...fieldSources, selfInstance]
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
            if (effect.keywordFilter && !spiritHasKeyword(state, owner, selfInstance, effect.keywordFilter)) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && owner !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && owner === state.turnPlayer) continue
            }
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

// 発動確認の文面（3種の誘発で同じ形を使う）
export function activationPrompt(inst: CardInstance): string {
    return `${getCard(inst.cardId).name}の効果を発動しますか？`
}

// optional な誘発の残りは、再開時も**発動確認から**始める（確認なしの自動発動を防ぐ）。
// exactOptionalPropertyTypes のため、付けないときはキー自体を出さない
export function confirmPromptIfOptional(
    state: GameState,
    inst: CardInstance,
    optional: boolean | undefined,
): { confirmPrompt?: string } {
    return optional === true && state.interactiveTargets ? { confirmPrompt: activationPrompt(inst) } : {}
}

// 発生源がまだ持ち主のフィールドに居るか（スピリット／ネクサスのどちらでも）。
// 「集めてから解決する」形では、先に解決した効果で発生源が破壊されうるので都度確かめる
export function isStillOnField(state: GameState, pid: PlayerId, instanceId: string): boolean {
    // 合体中のブレイヴも「場にいる」（効果の発生源になる。BRAVE.md §2.3）。
    // ここを spirits/nexuses だけにすると、【合体時】の fieldEvent が丸ごと飛ばされる
    return isOnFieldAnyZone(state.players[pid], instanceId)
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

