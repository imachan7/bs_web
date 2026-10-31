// キーワード効果・誘発効果ハンドラの集約と実行
// キーワードごとの処理は keywords/（【バースト】は keywords/burst.ts）、デッキ破棄は zones/mill.ts、疲労・回復は state/exhaust.ts、
// 継続効果の再計算は state/continuous.ts、対象の選び方と選択待ちの発行は targeting.ts、召喚時の誘発と無償召喚は summon.ts に分けてある。
import { coreRemovalAllowed } from "./coreGate"
import { entryActive } from "../../../shared/rules/effectStop"
import { noteAction, noteCoverage } from "../../../shared/coverage"
import { chimeiBase, chimeiBonus } from "./keywords/chimei"
import { recordBp, refreshLevelAsOverrides } from "./state/continuous"
import { requestCardChoice } from "./targeting"
import type {
    CardInstance,
    CardType,
    Color,
    DestroyContext,
    EffectAction,
    EffectCounter,
    EffectDef,
    GameEvent,
    GameState,
    PaySource,
    PlayerId,
    ResolvedTargetFilter,
} from "../type"
import { CARD_DB, currentLevel, findNexus, findSpirit, getCard, log, instMinLevelCores, noteMissedPayAsk, opponentOf, suspend } from "./GameState"
// shared/ の純粋述語。外部が EffectModules 経由で import しているため、再エクスポートで名前を残す
// triggers.ts とは相互 import になる（CommonJS の循環 require で安全）
import { destroySpirit, flushBounces } from "./removal"
import { wouldDeplete, soulCoreLeavesField, soulCoreInReserve, moveSoulCore, soulCoreOnInstance, normalReserveOf, normalCoresOn } from "./soulCore"
import { fireFieldEventTriggers, notifyHandGained } from "./fieldEventTriggers"
import ACTION_HANDLERS from "./actions"
import { matchesPick } from "./actions/revealAction"
import type { ActionCtx } from "./actions/types"
import { handGainDenial } from "./handGate"
import type { EffectAttempt, KeywordInfo, Resistance } from "../../../shared/rules"
import {
    activeConstraints,
    auraAmount,
    boardResistanceAgainst,
    auraAppliesTo,
    canDiscardHand,
    checkAuraCondition,
    costCantAct,
    countAuraCounter,
    countSpiritsWeighted,
    countSymbols,
    effectActiveAtLevel,
    effectActiveOn,
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
    instMatchesCostFilter,
    matchesFamilyFilter,
    spiritHasFamily,
    spiritHasKeyword,
    spiritHasKeywordOrLabel,
    instIsCombined,
    opponentFieldColorCount,
   
} from "../../../shared/rules"
import { lastCoresCount, lastDrawnCount, lastLeftCostOf, lastMovedCount, lastMovedOf, lastNexusCostOf, lastTargetsOf } from "./record"
import { checkExhaustOnCoreChange } from "./state/exhaust"
export type { KeywordInfo }
export { TENSHO_SUBSTITUTE_REST, TENSHO_SUBSTITUTE_DUMP, TENSHO_SUBSTITUTE_HAND, TENSHO_SUBSTITUTE_HAND_DUMP, tenshoSpecOf, tenshoCandidates, resolveTensho, fireTenshoEvent, flushPendingTenshoEvent, dumpAllCoresTensho, tenshoAfterTargetTrigger, applyTenshoSubstitute, applyTenshoSubstituteCrossSource, tenshoDumpAndDestroy } from "./keywords/tensho"
export { millCapBonusFor, hasFunsaiOnBlock, resolveFunsai } from "./keywords/funsai"
export { hasJugekiOnBlockReplace } from "./keywords/jugeki"
export { hasKyoshuOnBlock } from "./keywords/kyoshu"
export { bofuCountFor, hasBofuOnBlock, hasBofuChooserSelf } from "./keywords/bofu"
export { hasKoboOnBlock, resolveKoboOnBattleEnd } from "./keywords/kobo"
export { millDeck, applyDeckMillNegate, declineDeckMillNegate } from "./zones/mill"
import { millAllowed, noteMilled } from "./zones/mill"
export { checkExhaustOnCoreChange, exhaustSpirit, exhaustNexus, heavyExhaustSpirit, refreshSpirit, fireRefreshedSideEvents, fireExhaustedTriggers, isRefreshBlockedByMark, canExhaustNexus } from "./state/exhaust"
export { offerOpponentMainEndMagic, applyProvocationUse } from "./magic/cast"
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
    effectActiveOn,
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

// 全カードの系統の重複なしソート済みリスト。CARD_DB は GameState.ts との相互 import で読み込み時点では未初期化のことがあるため、初回参照時に遅延計算する
let allFamiliesCache: string[] | null = null
export function getAllFamilies(): string[] {
    if (allFamiliesCache === null) {
        allFamiliesCache = Array.from(
            new Set(Array.from(CARD_DB.values()).flatMap((c) => c.family)),
        ).sort()
    }
    return allFamiliesCache
}

// ---- クライアント演出用イベント ----

// GameEvent から seq を除いたユニオン（組み込みの Omit だとバリアント固有プロパティが消えるため、分配条件型にしている）
type WithoutSeq<T> = T extends { seq: number } ? Omit<T, "seq"> : never

// seq は state.eventSeq で自動採番。GameEngine.handleAction 冒頭で events をクリアするので、配信されるのは1アクション分だけ
export function emitEvent(state: GameState, event: WithoutSeq<GameEvent>): void {
    state.eventSeq += 1
    state.events.push({ ...event, seq: state.eventSeq } as GameEvent)
}

// ---- キーワードレジストリ ----
// 挙動（召喚やコア移動の可否）は GameEngine / RuleValidator が hasKeyword で参照する。ここは存在と表示名の管理のみ


// カードに効果の記述を持たない（＝バニラ）か。Wiki由来の効果原文（card.effect）が空文字のカードを指す

// 実コストまたは道化師クランの tempAlsoCosts のいずれかで指定コストとして扱われるか（コスト一致判定は必ずこちらを使う）

// 効果が現在のレベルで有効か（levels が null ならレベル不問）

// 状態を考慮したキーワード判定（静的 ‖ tempKeywords ‖ 持ち主フィールドからの keywordGrant）。

// spiritHasKeyword の keywordGrant 判定だけを切り出したもの。レベル判定を保ったまま静的判定を別に行う呼び出し元用

// このインスタンスが、いま解決中の効果を「受けない」状態か。破壊・コア除去・疲労・バウンス等の各ガードから呼ぶ。
// **新しい「効果を受けない」ルールはここへ足すこと**。
// 内訳: ① globalConstraint "battlingEffectImmune"：バトル中の両陣営スピリットはスピリット/マジックの効果を受けない（ネクサスの効果は通る）
// ② GameState.magicRedirectTo：対象が1体へ絞り込まれている間、同じ持ち主の他のスピリットはそのマジックの効果を受けない
// 【耐性を見る唯一の入口】この操作が、この対象に、この発生源から通るか。
// 防がれるなら理由（ResistanceCategory とログ用ラベル）を、通るなら null を返す。
//
// **相手のスピリット／ネクサスに何かをするハンドラは、個別の耐性述語を並べずにこれを1回呼ぶこと。**
// 判定表は shared/rules.boardResistanceAgainst（クライアントの対象ハイライトも同じ表を使う）。
// ここが上乗せするのは、効果解決中の一時状態で決まる ① 対象の絞り込み（state.magicRedirectTo） ② 相手のスピリットの『召喚時』効果を受けない（state.resolvingSummonTriggerPid）
// と、コストを支払わせる ③【迷彩】④円卓。③④は支払いの副作用があり shared/rules（純粋な述語の層）に置けない。
// クライアントの対象ハイライトに出ないのは正しい：【迷彩】は払えれば対象になり、円卓も対象にはなってよい
export function resistanceAgainst(
    state: GameState,
    targetOwnerPid: PlayerId,
    target: CardInstance,
    attempt: EffectAttempt,
): Resistance | null {
    // ① 対象の絞り込み（スピリット/マジックの効果が対象。ネクサスの効果は通る）。絞り込み先の持ち主のスピリットだけが影響を受ける。
    // 2026-08-14 ユーザー確認でマジック限定からスピリットの効果へ拡張した
    const redirect = state.magicRedirectTo
    if (
        redirect !== undefined &&
        (attempt.sourceType === "magic" || attempt.sourceType === "spirit") &&
        target.instanceId !== redirect.instanceId &&
        state.players[redirect.pid].field.spirits.some((s) => s.instanceId === target.instanceId)
    ) {
        return { category: "magicRedirect", label: "効果の対象が絞り込まれている" }
    }
    // ② 発生源がスピリットで、いま召喚時効果を解決中、かつその持ち主が対象の持ち主と異なるときだけ効く
    const summonPid = state.resolvingSummonTriggerPid
    if (
        attempt.pierce === undefined &&
        summonPid !== undefined &&
        attempt.sourceType === "spirit" &&
        summonPid !== targetOwnerPid &&
        activeConstraints(state, targetOwnerPid, target).some((c) => c.type === "immuneToOpponentSummonEffects")
    ) {
        return { category: "summonEffectImmune", label: "相手のスピリットの召喚時効果を受けない" }
    }
    const boardResisted = boardResistanceAgainst(state, targetOwnerPid, target, attempt)
    if (boardResisted) return boardResisted
    // ③ 【迷彩：N】（26系）。**盤面だけで決まる耐性を全部見たあと**に判定する（装甲などで元々対象に取れない個体にコストを請求しない）
    const meisaiToll = tryMeisaiToll(state, targetOwnerPid, target, attempt)
    if (meisaiToll) return meisaiToll
    // ④ コストを払って受けない耐性（円卓）。③同様、盤面の耐性を全部見たあとに判定する（先に払うと、元々防げていた対象化にまで手札を使ってしまう）。
    // 「一切の効果で防げない」なら払っても防げないので聞かない。【迷彩】は防ぐ効果ではなくコスト要求なので上で残す
    if (attempt.pierce !== undefined) return null
    return tryPayableTargetNegate(state, targetOwnerPid, target, attempt)
}

// kind:"meisai"（【迷彩：N】。26系）：対戦相手がスピリットの効果でこのスピリットを指定するとき、指定する側へリザーブからコアN個のトラッシュ支払いを要求する。
// 支払えなければ指定できない＝候補列挙では除外され、実際に適用する1点でも効果は適用されない。持ち主自身の効果・マジック/ネクサスの効果には支払い不要。範囲効果は「指定」ではないので何もしない。
// **probing（候補列挙）では払わない**（tryPayableTargetNegate と同じ規約。払うのは実際に適用する1点だけ）
function tryMeisaiToll(
    state: GameState,
    targetOwnerPid: PlayerId,
    target: CardInstance,
    attempt: EffectAttempt,
): Resistance | null {
    // 「指定する」効果限定（範囲効果は対象外）・スピリットの効果限定・持ち主自身の効果には支払い不要
    if (attempt.scope !== "targeted") return null
    if (attempt.sourceType !== "spirit") return null
    if (attempt.actorPid === targetOwnerPid) return null
    // 対象はスピリット本体のみ（合体ブレイヴのレコードは見ない）
    const level = currentLevel(target).level
    const toll = getCard(target.cardId).effects.find(
        (e): e is Extract<EffectDef, { kind: "meisai" }> =>
            e.kind === "meisai" && effectActiveAtLevel(e.levels, level),
    )
    if (toll === undefined) return null
    // 対話では指定する側が支払い元を選んで払い済み（askMeisaiPayIfNeeded → resolveChoice）
    if (!attempt.probing && state.meisaiPaidFor === target.instanceId) {
        delete state.meisaiPaidFor
        return null
    }
    const plan = autoPayPlan(state, attempt.actorPid, toll.cost)
    if (plan === null) return { category: "meisai", label: "【迷彩】のコストが払えない" }
    if (attempt.probing) return null
    // 非対話（テスト・AI）は通常コアのリザーブ→フィールドの順に自動で払い、足りなければ[ソウルコア]も使う
    payCost(state, attempt.actorPid, toll.cost, plan.paySources, 0, plan.soulFromReserve)
    log(state, `${getCard(target.cardId).name}の【迷彩】：${state.players[attempt.actorPid].name}は${toll.cost}コストを支払った。`)
    return null
}

// kind:"meisai" で対象 target に掛かるコスト（無ければ undefined）
export function meisaiTollOf(target: CardInstance): number | undefined {
    const level = currentLevel(target).level
    return getCard(target.cardId).effects.find(
        (e): e is Extract<EffectDef, { kind: "meisai" }> => e.kind === "meisai" && effectActiveAtLevel(e.levels, level),
    )?.cost
}

// 「Nコスト支払う」をリザーブ＋フィールドのコアから自動で払う計画（2026-10-08 ユーザー確定: 支払い元はフィールドも含む）。
// 通常コアのリザーブ → ネクサス → コアの多いスピリット の順、最後にリザーブの[ソウルコア]。払えなければ null。
// ponytail: 支払い元スピリットの維持コア割れ（消滅）も避けない単純な貪欲法。AI が賢く払う必要が出たら見直す
// keepLevel1：スピリットの維持コア（Lv1）は残す（効果のコスト用。消滅させてまで払わない）
export function autoPayPlan(state: GameState, pid: PlayerId, need: number, keepLevel1 = false): { paySources: PaySource[]; soulFromReserve: boolean } | null {
    const player = state.players[pid]
    let rest = need - Math.max(0, normalReserveOf(player))
    const paySources: PaySource[] = []
    const fieldInsts = [...player.field.nexuses, ...[...player.field.spirits].sort((a, b) => b.cores - a.cores)]
    for (const inst of fieldInsts) {
        if (rest <= 0) break
        const allowed = coreRemovalAllowed(state, { ownerPid: pid, target: inst, amount: inst.cores, cause: "cost", actorPid: pid })
        // 破壊待機の個体は場を離れるので維持コアも払える（2026-10-15 ユーザー確認）
        const spare = keepLevel1 && player.field.spirits.includes(inst) && !inst.pendingDestruction ? inst.cores - instMinLevelCores(inst) : Infinity
        const take = Math.min(rest, normalCoresOn(player, inst), spare, allowed)
        if (take <= 0) continue
        paySources.push({ instanceId: inst.instanceId, count: take })
        rest -= take
    }
    let soulFromReserve = false
    if (rest > 0 && soulCoreInReserve(player)) {
        soulFromReserve = true
        rest -= 1
    }
    return rest > 0 ? null : { paySources, soulFromReserve }
}

// kind:"targetNegateByHandDiscard"：相手のスピリットの効果の対象になるたび、手札1枚を破棄して効果を受けない。
// **ここだけが耐性の中でコストを払う＝副作用がある**。attempt.probing のときは判定しない（防ぐのは実際に適用する1点だけ。1回の対象化につき1回だけ払う）。
// shared/rules には置けない（純粋な述語の層で、クライアントも同じ実装を呼ぶ）。クライアントの対象ハイライトにこの耐性が出ないのは**正しい**：対象にはなる
function tryPayableTargetNegate(
    state: GameState,
    targetOwnerPid: PlayerId,
    target: CardInstance,
    attempt: EffectAttempt,
): Resistance | null {
    if (attempt.probing) return null
    // 「効果の**対象**になるたび」なので範囲効果は対象外。相手のスピリットの効果限定
    if (attempt.scope !== "targeted") return null
    if (attempt.actorPid === targetOwnerPid) return null
    if (attempt.sourceType !== "spirit") return null
    const player = state.players[targetOwnerPid]
    // 実対戦では、対象が確定した時点で**守る側に聞いてある**（askPayToNegateIfNeeded → payNegateDecide）。
    // ここはその答えを読むだけ。答えは1回の対象化につき1つなので、**読んだら消費する**
    const decision = state.payNegateDecision
    if (decision !== undefined && decision.targetInstanceId === target.instanceId) {
        delete state.payNegateDecision
        // 破棄は聞いた時点で済ませてある（払ったならここでは手札に触らない）
        return decision.paid ? { category: "paidNegate", label: "手札を破棄して効果を受けなかった" } : null
    }
    for (const source of effectSources(state, targetOwnerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "targetNegateByHandDiscard") continue
            if (!entryActive(state, targetOwnerPid, source, effect, level)) continue
            if (effect.bySourceType !== attempt.sourceType) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && targetOwnerPid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && targetOwnerPid === state.turnPlayer) continue
            }
            if (!matchesFamilyFilter(state, targetOwnerPid, target, effect.familyFilter)) continue
            // BS11-065 満天の牧草地：メインステップは手札を破棄できない（COST_MODEL.md §1）
            if (player.hand.length < effect.discardCount || !canDiscardHand(state, targetOwnerPid)) continue
            // 対話中に答え無しで来た＝この経路が askPayToNegateIfNeeded を通していない。
            // 守る側に聞かずに手札を取らないので、払わず効果を受けさせて検査に記録する
            if (state.interactiveTargets) {
                noteMissedPayAsk(`${getCard(source.cardId).name}：${getCard(target.cardId).name}を対象にする効果（${attempt.op}）が払う確認を通らず適用された`)
                continue
            }
            noteCoverage(effect, "targetNegateByHandDiscard")
            const discarded = player.hand.splice(player.hand.length - effect.discardCount, effect.discardCount)
            player.trashCards.push(...discarded)
            log(
                state,
                `${getCard(source.cardId).name}：${player.name}は手札${effect.discardCount}枚を破棄し、${getCard(target.cardId).name}は効果を受けなかった。`,
            )
            return { category: "paidNegate", label: "手札を破棄して効果を受けなかった" }
        }
    }
    return null
}

// 「手札を破棄することで効果を受けない」を払うかどうか、守る側に聞く。聞いて中断したら true（呼び出し元はそのまま return。応答後に元のアクションが解決し直される）。
// 呼ぶ場所は **resistanceAgainst の直前**。効果の内容が分かった状態で聞けるのはここだけで、判定そのものは装甲と同じ同期の述語のままにできる。
// 【迷彩：N】（26系）：対話では指定する側に支払い元を選ばせる。払えないときは聞かない（tryMeisaiToll が対象から外す）。支払いは必須なので「支払う」1択
function askMeisaiPayIfNeeded(
    state: GameState,
    targetOwnerPid: PlayerId,
    target: CardInstance,
    attempt: EffectAttempt,
    resume: EffectAction,
    self: CardInstance | null,
    sourceName: string,
): boolean {
    if (state.meisaiPaidFor === target.instanceId) return false
    const need = meisaiTollOf(target)
    if (need === undefined) return false
    if (boardResistanceAgainst(state, targetOwnerPid, target, attempt)) return false
    if (autoPayPlan(state, attempt.actorPid, need) === null) return false
    suspend(state, {
        pid: attempt.actorPid,
        kind: "option",
        candidates: [],
        prompt: `${sourceName}：${getCard(target.cardId).name}の【迷彩：${need}】のコストを支払ってください`,
        options: ["支払う"],
        optional: false,
        action: resume,
        selfInstanceId: self ? self.instanceId : null,
        effectSource: {
            ...(attempt.sourceType !== undefined ? { type: attempt.sourceType } : {}),
            ...(attempt.sourceColors !== undefined ? { colors: [...attempt.sourceColors] } : {}),
        },
        meisaiPay: { pid: attempt.actorPid, targetInstanceId: target.instanceId, targetCardId: target.cardId, need },
    })
    return true
}

export function askPayToNegateIfNeeded(
    state: GameState,
    targetOwnerPid: PlayerId,
    target: CardInstance,
    attempt: EffectAttempt,
    resume: EffectAction,
    self: CardInstance | null,
    sourceName: string,
): boolean {
    // 非対話（テスト・自動解決）では聞かない。従来どおり払える限り自動で払う
    if (!state.interactiveTargets) return false
    if (attempt.probing) return false
    if (attempt.scope !== "targeted") return false
    if (attempt.actorPid === targetOwnerPid) return false
    if (attempt.sourceType !== "spirit") return false
    if (askMeisaiPayIfNeeded(state, targetOwnerPid, target, attempt, resume, self, sourceName)) return true
    // すでに答えが出ている（＝この中断から戻ってきた）なら聞き直さない
    if (state.payNegateDecision?.targetInstanceId === target.instanceId) return false
    // 盤面だけで決まる耐性で既に防げているなら、手札を使わせない（tryPayableTargetNegate と同じ順序）
    if (boardResistanceAgainst(state, targetOwnerPid, target, attempt)) return false
    const player = state.players[targetOwnerPid]
    for (const source of effectSources(state, targetOwnerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "targetNegateByHandDiscard") continue
            if (!entryActive(state, targetOwnerPid, source, effect, level)) continue
            if (effect.bySourceType !== attempt.sourceType) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && targetOwnerPid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && targetOwnerPid === state.turnPlayer) continue
            }
            if (!matchesFamilyFilter(state, targetOwnerPid, target, effect.familyFilter)) continue
            // BS11-065 満天の牧草地：メインステップは手札を破棄できない（COST_MODEL.md §1）
            if (player.hand.length < effect.discardCount || !canDiscardHand(state, targetOwnerPid)) continue
            requestCardChoice(
                state,
                // pid は**効果の実行者**（解決の主体。actorPid に入る）。
                // 選ぶのは守る側なので、下の chooserPid に targetOwnerPid を渡す。
                // ここを両方 targetOwnerPid にすると actorPid が立たず、
                // 再開時に効果が守る側のものとして解決されてしまう（＝耐性が自分の効果扱いで無効になる）
                attempt.actorPid,
                `${sourceName}の効果から${getCard(target.cardId).name}を守るために破棄する手札を選んでください（選ばなければ効果を受けます）`,
                "hand",
                player.hand.map((_, i) => i),
                true, // optional：スキップ＝効果を受ける
                {
                    type: "payNegateDecide",
                    targetInstanceId: target.instanceId,
                    discardCount: effect.discardCount,
                    sourceName: getCard(source.cardId).name,
                    resume,
                },
                self,
                false,
                true, // resolveOnSkip：スキップでも payNegateDecide へ戻して resume を解決する
                targetOwnerPid, // 選ぶのは守る側。解決は効果の実行者のまま
            )
            return true
        }
    }
    return false
}

// 自動で（または複数体のうちの1体として）決めた対象に効果を当てる直前の関門。聞いて中断したなら "asked"（呼び出し元はその対象を適用せず、残りを再開スタックへ積んで return する）、
// 受けないなら理由、通すなら null。resume は「この1体だけに当てる」アクション（payNegateDecide が targetInstanceId を渡し直して解決する）。非対話では聞かず resistanceAgainst が払える限り払う
export function gateTargetedApply(
    state: GameState,
    targetOwnerPid: PlayerId,
    target: CardInstance,
    attempt: EffectAttempt,
    resume: EffectAction,
    self: CardInstance | null,
    sourceName: string,
): Resistance | "asked" | null {
    if (askPayToNegateIfNeeded(state, targetOwnerPid, target, attempt, resume, self, sourceName)) return "asked"
    return resistanceAgainst(state, targetOwnerPid, target, attempt)
}

export function isResisted(
    state: GameState,
    targetOwnerPid: PlayerId,
    target: CardInstance,
    attempt: EffectAttempt,
): boolean {
    return resistanceAgainst(state, targetOwnerPid, target, attempt) !== null
}

// 無ければ undefined
function ownerPidOfInstance(state: GameState, inst: CardInstance): PlayerId | undefined {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const field = state.players[pid].field
        if (field.spirits.includes(inst) || field.nexuses.includes(inst)) return pid
    }
    return undefined
}

// スピリットのコアが増減したとき、相手フィールドの exhaustOnManualCoreAdd 持ち発生源（レベル有効。effectSources 経由で lendSelfThisTurn の貸与も対応）があれば、そのスピリットを疲労させる。
// opts 省略時＝手動操作かつ増加時のみ、持ち主の相手のメインステップ限定。opts.viaEffect:true＝効果による増減時に判定し、フェーズ不問
// （isRemoval:true の減少側は effect.onRemove がある場合のみ反応する）
// 破壊/消滅したスピリット上のコアをリザーブでなくトラッシュへ置くか。効果文が陣営を限定していないため、両陣営の発生源を見る
export function destroyedCoresGoToTrash(state: GameState): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, pid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "destroyedCoresToTrash") continue
                if (!entryActive(state, pid, source, effect, level)) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                noteCoverage(effect, "destroyedCoresToTrash")
                return true
            }
        }
    }
    return false
}

// summonCostHandDiscardPay：「スピリットカード**1枚**の召喚に」なので、手札破棄で支払った時点で貸与を使い切る（仮想発生源を1つ取り除く）。
// 使わずにターンが終われば turnVirtualInstances のリセットで消える
export function consumeSummonHandDiscardPay(state: GameState, pid: PlayerId): void {
    const list = state.players[pid].turnVirtualInstances
    const index = list.findIndex((inst) =>
        getCard(inst.cardId).effects.some((e) => e.kind === "summonCostHandDiscardPay"),
    )
    if (index === -1) return
    log(state, `${getCard(list[index]!.cardId).name}の効果は使い切られた。`)
    list.splice(index, 1)
}

// 発生源の持ち主のスピリット/マジックの効果による「BP◯以下を破壊する」判定の閾値ボーナス合計（kind:"destroyBpThresholdBonus"）。
// ブレイヴ自身・ネクサスの効果には効かないので、呼び出し側が srcType が spirit|magic のときだけ呼ぶこと
export function destroyBpThresholdBonusFor(state: GameState, ownerPid: PlayerId): number {
    let total = 0
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "destroyBpThresholdBonus") continue
            if (!entryActive(state, ownerPid, source, effect, level)) continue
            noteCoverage(effect, "destroyBpThresholdBonus")
            total += effect.amount
        }
    }
    return total
}

// 持ち主（targetPid）の**手札**が、相手のスピリット/ブレイヴ/マジックの効果を受けないか（globalConstraint:"handImmuneForPid"。ネクサスの効果は防がない＝sourceType:"nexus" は素通しする）。
// 手札を対象に取る処理の冒頭で呼ぶ
export function handImmuneFor(state: GameState, targetPid: PlayerId, sourceType: CardType | undefined): boolean {
    for (const source of effectSources(state, targetPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "handImmuneForPid") continue
            if (!entryActive(state, targetPid, source, effect, level)) continue
            // ネクサスの効果は既定では防がない＝意図的（BS12-067）。includeNexus指定時のみ防ぐ（BS14-082五角形の砦）
            if (sourceType === "nexus" && !effect.constraint.includeNexus) continue
            return true
        }
    }
    return false
}

// kind:"lifeDamageMillGuard"：defenderPid のライフが減る直前に呼ぶ。発生源が有効なら持ち主のデッキを上から1枚破棄し、そのカードが match に一致していれば true（ライフを守る）。
// keepToHandIfType 指定時は、破棄したカードがその種別なら（守れたかを問わず）トラッシュでなく手札へ加える。
// 「〜できる」は自動適用の簡略化。発生源が複数あっても最初の1つだけを使う（デッキを何度も削らない）
export function tryLifeDamageMillGuard(
    state: GameState,
    defenderPid: PlayerId,
    // アタッカー（attackerFilter を持つ効果の条件に使う）
    attacker?: CardInstance,
): boolean {
    const player = state.players[defenderPid]
    for (const source of effectSources(state, defenderPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "lifeDamageMillGuard") continue
            if (!entryActive(state, defenderPid, source, effect, level)) continue
            if (effect.turn === "own" && defenderPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && defenderPid === state.turnPlayer) continue
            // アタッカーが分からないときは働かせない側に倒す
            if (effect.attackerFilter) {
                if (!attacker) continue
                const { maxLevel, keywordExclude } = effect.attackerFilter
                if (maxLevel !== undefined && currentLevel(attacker).level > maxLevel) continue
                if (
                    keywordExclude !== undefined &&
                    spiritHasKeyword(state, opponentOf(defenderPid), attacker, keywordExclude)
                ) {
                    continue
                }
            }
            noteCoverage(effect, "lifeDamageMillGuard")
            const guardType = getCard(source.cardId).type
            if (millAllowed(state, { pid: defenderPid, count: 1, actorPid: defenderPid, sourceType: guardType }) < 1) return false
            const cardId = player.deck.shift()
            if (cardId === undefined) {
                log(state, `${player.name}のデッキが尽きているため、${getCard(source.cardId).name}の効果は発揮されなかった。`)
                return false
            }
            noteMilled(state, defenderPid, 1, defenderPid, guardType)
            const milled = getCard(cardId)
            const guarded =
                milled.type === effect.match.cardType &&
                (effect.match.color === undefined || milled.colors.includes(effect.match.color))
            const toHand =
                (effect.keepToHandIfType !== undefined && milled.type === effect.keepToHandIfType) ||
                (effect.keepToHandIfKeyword !== undefined && hasKeyword(cardId, effect.keepToHandIfKeyword))
            if (toHand && !handGainDenial(state, { pid: defenderPid, from: "deck", cause: "effect" })) {
                player.hand.push(cardId)
                log(state, `${player.name}はデッキを上から1枚（${milled.name}）破棄し、手札に加えた。`)
                notifyHandGained(state, defenderPid, 1)
            } else {
                player.trashCards.push(cardId)
                log(state, `${player.name}はデッキを上から1枚（${milled.name}）破棄した。`)
            }
            return guarded
        }
    }
    return false
}

// kind:"ownLifeFloor" の costSelfToTrash 版：自分のライフが0になるとき、このネクサスをトラッシュに置いてライフを0にしない。呼び出し側が life<=0 を検知した直後（勝敗確定の直前）に呼ぶ。
// 払わなければ即敗北なので対話確認を省いた自動払いの簡略化。支払えたら true を返し、life を floor まで戻す
export function tryOwnLifeFloorByCost(state: GameState, pid: PlayerId): boolean {
    const player = state.players[pid]
    for (const source of effectSources(state, pid)) {
        const index = player.field.nexuses.findIndex((n) => n.instanceId === source.instanceId)
        if (index === -1) continue
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "ownLifeFloor") continue
            if (!effect.constraint.costSelfToTrash) continue
            if (!entryActive(state, pid, source, effect, level)) continue
            player.field.nexuses.splice(index, 1)
            player.trashCards.push(source.cardId)
            soulCoreLeavesField(player, source) // 案B-inside: 先に[ソウルコア]退避
            player.reserve += source.cores
            player.life = effect.constraint.floor
            log(
                state,
                `${player.name}は${getCard(source.cardId).name}を自分のトラッシュに置いた。（ライフは0にならず${effect.constraint.floor}のまま）`,
            )
            if (effect.constraint.then) {
                resolveAction(state, pid, null, effect.constraint.then)
            }
            return true
        }
    }
    return false
}

// kind:"summonedExhaustGrant"：ownerPid のフィールドに「相手のスピリットは召喚されたとき疲労する」を持つ有効な発生源があるか（condition.selfRested は発生源自身が疲労状態のときのみ）。
// GameEngine.doSummon が、召喚した側から見た相手（=この付与の持ち主）に対して呼ぶ
export function hasSummonedExhaustGrant(state: GameState, ownerPid: PlayerId): boolean {
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "summonedExhaustGrant") continue
            if (!entryActive(state, ownerPid, source, effect, level)) continue
            if (effect.condition?.selfRested && !source.isRested) continue
            noteCoverage(effect, "summonedExhaustGrant")
            return true
        }
    }
    return false
}

// kind:"burstMagicFreeEffect"：ownerPid のフィールドに、自分のバーストがマジックで発動したときコストを支払わずメイン/フラッシュを発揮できる発生源が有効か
export function hasBurstMagicFreeEffect(state: GameState, ownerPid: PlayerId): boolean {
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "burstMagicFreeEffect") continue
            if (!entryActive(state, ownerPid, source, effect, level)) continue
            noteCoverage(effect, "burstMagicFreeEffect")
            return true
        }
    }
    return false
}

// kind:"attackTriggersAsBlockGrant"：対象スピリットの『アタック時』効果が『ブロック時』へ**移し替え**られているか。
// target:"anyAll" は両陣営のスピリットが対象になりうるので、**両プレイヤーの発生源**を走査する。
// phaseTurn は発生源の持ち主基準で判定する（『相手のアタックステップ』＝発生源の持ち主が非ターンプレイヤー）
// kind:"blockTriggersAsAttackGrant"：hasAttackTriggersAsBlock の逆向き（『ブロック時』効果を『アタック時』へ移す）
export function hasBlockTriggersAsAttack(state: GameState, ownerPid: PlayerId, inst: CardInstance): boolean {
    return blockTriggersGrant(state, ownerPid, inst, false)
}

// 付け替えず両方で発揮する版（alsoBlock）。発揮の判定のたびに読む
export function blockTriggersAlsoOnAttack(state: GameState, ownerPid: PlayerId, inst: CardInstance): boolean {
    return blockTriggersGrant(state, ownerPid, inst, true)
}

function blockTriggersGrant(state: GameState, ownerPid: PlayerId, inst: CardInstance, both: boolean): boolean {
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "blockTriggersAsAttackGrant") continue
            if ((effect.alsoBlock === true) !== both) continue
            if (!entryActive(state, ownerPid, source, effect, level)) continue
            if (effect.whileOwnBurstSet === true && !state.players[ownerPid].burstSet) continue
            if (effect.phaseTurn) {
                const { phase, turn } = effect.phaseTurn
                if (state.phase !== phase) continue
                if (turn === "own" && ownerPid !== state.turnPlayer) continue
                if (turn === "opponent" && ownerPid === state.turnPlayer) continue
            }
            if (effect.familyFilter && !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)) {
                continue
            }
            noteCoverage(effect, "blockTriggersAsAttackGrant")
            return true
        }
    }
    return false
}

export function hasAttackTriggersAsBlock(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): boolean {
    for (const sourcePid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, sourcePid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "attackTriggersAsBlockGrant") continue
                if (!entryActive(state, sourcePid, source, effect, level)) continue
                // target:"ownAll" は発生源の持ち主のスピリットのみ、target:"self" は発生源自身のみ
                if (effect.target === "ownAll" && sourcePid !== ownerPid) continue
                if (effect.target === "self" && source.instanceId !== inst.instanceId) continue
                if (effect.phaseTurn) {
                    const { phase, turn } = effect.phaseTurn
                    if (state.phase !== phase) continue
                    if (turn === "own" && sourcePid !== state.turnPlayer) continue
                    if (turn === "opponent" && sourcePid === state.turnPlayer) continue
                }
                if (
                    effect.familyFilter &&
                    !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)
                ) {
                    continue
                }
                noteCoverage(effect, "attackTriggersAsBlockGrant")
                if (effect.keywordFilter && !spiritHasKeyword(state, ownerPid, inst, effect.keywordFilter)) {
                    continue
                }
                return true
            }
        }
    }
    return false
}

// 状態を考慮した系統判定（静的系統 ‖ familyGrant による付与）。aura の familyFilter・{ ownFamily } カウンタ・keywordGrant の familyFilter は
// 付与された系統もカウントに含めるため、すべてこちらを参照する

// FamilyFilter（string | string[]）共通の判定：配列指定時はいずれかの系統を持てばよい（OR）

// ---- 常時BP修正（オーラ） ----


// ---- 制約（ブロック可否など） ----

// 相手の「対象を取る」効果の対象にならないか（常時、またはフェザーバリアの一時免疫）。対象自動選択・明示ターゲットの両方で参照する

// 【装甲：色】：inst が sourceColors の相手効果を受けないか（対象・範囲の両方から参照する）。
// sourceColors が不明（undefined）な場合は装甲を判定できないため false（＝防がない）とする。

// 状態を考慮した色判定：master色 ‖ tempColors ‖ colorsAsContinuous

// インスタンスのシンボル数：静的シンボル数 + このターンの追加数（timedExtraSymbols）。GameEngine のライフダメージ計算・ownFieldHasMinSymbolSpirit 条件が共用する。
// state/ownerPid は将来の拡張用に受け取るが現状は未使用

// 【相手のマジックの効果を受けない】（immunityGrant, against:"magic"）：ownerPid のフィールド（スピリット＋ネクサス）に、レベル有効・familyFilter一致（省略時は不問）の発生源が1つでもあれば、inst は相手のマジックの効果を受けない。
// 呼び出し側は「効果の発生源が実際にマジックか（sourceType === "magic"）」を先に判定してから呼ぶこと（対象側にだけ知識を閉じるため）

// kind:"lifeDamageNegate"：ブロックされなかったアタッカーの実効BPが、発生源（defenderPid側）の実効BP以下のとき、ライフダメージそのものを打ち消すか。
// バトルによるライフ被弾（doTakeLife）専用。lifeCrush等バトル外のライフ減少には適用しない
export function hasLifeDamageNegate(
    state: GameState,
    defenderPid: PlayerId,
    attackerPid: PlayerId,
    attacker: CardInstance | undefined,
): boolean {
    if (!attacker) return false
    const attackerBp = effectiveBp(state, attackerPid, attacker)
    const player = state.players[defenderPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "lifeDamageNegate") continue
            if (!entryActive(state, defenderPid, source, effect, sourceLevel)) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && defenderPid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && defenderPid === state.turnPlayer) continue
            }
            if (attackerBp <= effectiveBp(state, defenderPid, source)) {
                noteCoverage(effect, "lifeDamageNegate")
                return true
            }
        }
    }
    return false
}

// このスピリットに効果でコアが置かれるときの追加数（coreBonus）。コアを置く各アクション（coreCharge / voidCoreToSelf / voidCoreToOther）が参照する
function coreBonusFor(inst: CardInstance): number {
    const level = currentLevel(inst).level
    let bonus = 0
    for (const e of getCard(inst.cardId).effects) {
        if (e.kind !== "coreBonus") continue
        if (!effectActiveAtLevel(e.levels, level)) continue
        noteCoverage(e, "coreBonus")
        bonus += e.amount
    }
    return bonus
}

// 持ち主のドローステップで引く枚数の追加数（kind: "drawStepBonus"）。uniqueByName は同名の発生源を1回だけ数える
export function drawStepBonusFor(state: GameState, pid: PlayerId): number {
    const player = state.players[pid]
    const counted = new Set<string>()
    let bonus = 0
    for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
        const level = currentLevel(inst).level
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "drawStepBonus" || !entryActive(state, pid, inst, effect, level)) continue
            if (effect.uniqueByName) {
                const name = getCard(inst.cardId).name
                if (counted.has(name)) continue
                counted.add(name)
            }
            noteCoverage(effect, "drawStepBonus")
            bonus += effect.amount
        }
    }
    return bonus
}

// 持ち主のコアステップで得られるコアの追加数（kind:"coreStepBonus"）。フィールド（スピリット＋ネクサス）の発動条件を満たす発生源をすべて合算する。
// ownFieldHasNames 指定時は、指定カード名すべてが持ち主のスピリットにそろっているときのみ。PhaseManager から呼ぶ
export function coreStepBonusFor(state: GameState, pid: PlayerId): number {
    const player = state.players[pid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    let bonus = 0
    for (const inst of sources) {
        const level = currentLevel(inst).level
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "coreStepBonus") continue
            if (!entryActive(state, pid, inst, effect, level)) continue
            if (effect.condition) {
                const cond = effect.condition
                const ok =
                    "ownFieldHasNames" in cond
                        ? cond.ownFieldHasNames.every((name) =>
                              player.field.spirits.some((s) => getCard(s.cardId).name === name),
                          )
                        : player.field.spirits.some((s) => spiritHasFamily(state, pid, s, cond.ownFieldHasFamily))
                if (!ok) continue
            }
            noteCoverage(effect, "coreStepBonus")
            bonus += effect.amount
        }
    }
    return bonus
}

// 対象スピリットへ「効果で」コアを置く共通処理。coreBonus ぶんをボイドから追加する。ownerPid は inst の持ち主（checkExhaustOnCoreChange の viaEffect 判定用）
export function placeCoresOnSpirit(
    state: GameState,
    inst: CardInstance,
    baseCount: number,
    ownerPid: PlayerId,
): void {
    inst.cores += baseCount
    const bonus = coreBonusFor(inst)
    if (bonus > 0) {
        inst.cores += bonus
        log(
            state,
            `${getCard(inst.cardId).name}の効果で、置かれるコアが${bonus}個追加された。`,
        )
    }
    checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: false })
}

// ボイドからコアcount個を直接、持ち主のトラッシュに置く。スピリット上のコアを取り除く処理ではないので checkExhaustOnCoreChange は呼ばない
export function voidCoreToOwnTrash(state: GameState, ownerPid: PlayerId, count: number): void {
    state.players[ownerPid].trashCores += count
}


// 継続効果で「Lvコスト」が上がり、維持コア（Lv1）を下回った個体を消滅させる。コアが減ったのではなく**必要なコア数が増えた**ことで起きるので、コアを動かす各所の判定では拾えない。
// プレイヤーに手番が戻る地点（GameEngine.handleAction の事後フック）でまとめて掃除する（2026-08-14 ユーザー確認）。levelCostBonusContinuous が乗っている個体だけを見るので既存の挙動は変わらない
export function sweepLevelCostDepletion(state: GameState): void {
    for (let guard = 0; guard < 20; guard++) {
        if (state.winner || state.pendingChoice) return
        let destroyed = false
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            for (const inst of [...state.players[pid].field.spirits]) {
                if ((inst.levelCostBonusContinuous ?? 0) === 0) continue
                if (!wouldDeplete(state, pid, inst)) continue
                destroySpirit(state, pid, inst.instanceId, "deplete")
                destroyed = true
                if (state.winner || state.pendingChoice) return
            }
        }
        if (!destroyed) return
        // 消滅で発生源やフィールドの数が変われば、継続効果を組み直してもう一巡する
        refreshLevelAsOverrides(state)
    }
}

// ---- アクションの実行 ----


// コストと「置くコア」をまとめて支払う。paySources（フィールド上のコア）から取ったぶんは**先にコストへ充当し、余りを置くコアへ回す**。
// コスト充当分はトラッシュへ、置くコアに回った分はトラッシュを経由せずカードの上へ。不足分はリザーブから支払う。
// 戻り値は「置くコアのうちフィールドから賄えた数」で、呼び出し側はリザーブから引く数を maintain - placedFromField にする。
// 支払い後、維持コア（Lv1）を下回った支払い元スピリットは消滅する。
export function payCost(
    state: GameState,
    pid: PlayerId,
    cost: number,
    paySources?: PaySource[],
    maintain = 0,
    // リザーブの[ソウルコア]をコスト支払い1個ぶんとして使う（行き先はトラッシュ。docs/design/SOULCORE.md 部品3）。
    // リザーブから支払いが1個以上あるときだけ消費される（フィールドで全額賄えたなら使われない）
    paySoulCoreFromReserve?: boolean,
): number {
    const player = state.players[pid]
    let takenFromField = 0
    let soulPaidFromField = 0 // フィールドの[ソウルコア]をコスト（→トラッシュ）に使った個数
    let soulPlacedFromField = 0 // フィールドの[ソウルコア]を維持コア（→新しい個体）に使った個数
    if (paySources && paySources.length > 0) {
        for (const src of paySources) {
            const inst = findSpirit(player, src.instanceId) ?? findNexus(player, src.instanceId)
            if (!inst) continue
            // [ソウルコア]の使い分け（2026-10-06 ユーザー確認）:
            //  - includeSoulCore → コストとしてトラッシュへ
            //  - soulCoreToMaintain → 維持コア（置くコア）として新しい個体の上へ。
            //    ここでは一旦リザーブへ移し、placeSummonedSpirit が placeSoulCoreOnSummoned で
            //    新しい個体へ移す（転召で中断しても不変条件が保たれる）
            const soulOnSrc = soulCoreOnInstance(player, src.instanceId)
            const soulToCost = soulPaidFromField === 0 && soulPlacedFromField === 0 && src.includeSoulCore === true && soulOnSrc && cost >= 1 ? 1 : 0
            const soulToMaintain = soulPaidFromField === 0 && soulPlacedFromField === 0 && src.soulCoreToMaintain === true && soulOnSrc && maintain >= 1 && !soulToCost ? 1 : 0
            const soulUnit = soulToCost + soulToMaintain
            const paid = Math.min(src.count, inst.cores)
            inst.cores -= paid - soulUnit
            if (soulToCost > 0) {
                moveSoulCore(player, { zone: "trash" }, inst)
                log(state, `${player.name}は${getCard(inst.cardId).name}の[ソウルコア]をコストの支払いに使った。`)
            }
            if (soulToMaintain > 0) {
                moveSoulCore(player, { zone: "reserve" }, inst)
                log(state, `${player.name}は${getCard(inst.cardId).name}の[ソウルコア]を置くコアに使う。`)
            }
            soulPaidFromField += soulToCost
            soulPlacedFromField += soulToMaintain
            takenFromField += paid
        }
    }
    // フィールドから取ったコアはコスト優先で充当し、余りを置くコアへ（上限は maintain）。
    // 維持コア行きの[ソウルコア]（soulPlacedFromField）はコストに充当しない
    const costFromField = Math.min(takenFromField - soulPlacedFromField, cost)
    const placedFromField = Math.min(takenFromField - costFromField, maintain)
    const costFromReserve = cost - costFromField
    // リザーブの[ソウルコア]は moveSoulCore が reserve-1/trash+1（コスト1個ぶん）を担当するので、下の2行はそのぶんを差し引いた通常コアの支払い
    const useSoulFromReserve = paySoulCoreFromReserve === true && costFromReserve >= 1 && soulCoreInReserve(player)
    if (useSoulFromReserve) {
        moveSoulCore(player, { zone: "trash" })
        log(state, `${player.name}はリザーブの[ソウルコア]をコストの支払いに使った。`)
    }
    player.reserve -= costFromReserve - (useSoulFromReserve ? 1 : 0)
    // [ソウルコア]（リザーブ由来・フィールド由来のどちらも）のぶんは moveSoulCore が trashCores に足しているため引く
    player.trashCores += costFromField + costFromReserve - (useSoulFromReserve ? 1 : 0) - soulPaidFromField
    // 置くコアに回りきらなかった余剰はリザーブへ戻す（validate 側で弾いているので通常は0）
    const surplus = takenFromField - costFromField - placedFromField
    if (surplus > 0) player.reserve += surplus
    if (takenFromField > 0) {
        const placedNote = placedFromField > 0 ? `（うち${placedFromField}個は置くコアに充当）` : ""
        log(state, `${player.name}はフィールドのコア${takenFromField}個を含めて支払った。${placedNote}`)
    }
    // （ここは意図的に findSpirit のみを検索する。ネクサスは維持コアの概念がなく
    //   自然に消滅対象から外れるため、findNexus を併用しないこと）
    if (paySources) {
        for (const src of paySources) {
            const inst = findSpirit(player, src.instanceId)
            if (inst && !inst.pendingDestruction && wouldDeplete(state, pid, inst)) {
                destroySpirit(state, pid, inst.instanceId, "deplete")
            }
        }
    }
    return placedFromField
}

export function findSpiritAny(
    state: GameState,
    instanceId: string,
): { pid: PlayerId; inst: CardInstance } | null {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const inst = state.players[pid].field.spirits.find(
            (s) => s.instanceId === instanceId,
        )
        if (inst) return { pid, inst }
    }
    return null
}

// マジックによる BP バフ（timedEffect の bp）が対象に適用された直後にフックし、条件を満たせば magicBuffBonus 分の BP+ を追加する。
// 『このスピリットのアタック時』／『自分のアタックステップ』条件は「バトル中または自分のアタックステップ」で近似する簡略化とし、判定は state.phase === "attack" のみとする。
export function applyMagicBuffBonus(
    state: GameState,
    target: CardInstance,
    srcType?: CardType,
    srcColors?: Color[],
): void {
    if (srcType !== "magic") return
    if (state.phase !== "attack") return
    const found = findSpiritAny(state, target.instanceId)
    if (!found) return
    const targetOwner = found.pid
    // **発生源はスピリットとは限らない**（ネクサスも、マジックが貸した仮想発生源もあり得る）ので effectSources で走査する（2026-08-16 修正。以前はスピリットだけを見ていた）
    for (const source of effectSources(state, targetOwner)) {
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "magicBuffBonus") continue
            if (!entryActive(state, targetOwner, source, effect, currentLevel(source).level)) continue
            // 『自分のアタックステップ』限定。state.phase === "attack" は確認済みなので、ここでは誰のターンかだけを見る
            if (effect.turn === "own" && targetOwner !== state.turnPlayer) continue
            if (effect.turn === "opponent" && targetOwner === state.turnPlayer) continue
            if (effect.colorFilter && !(srcColors ?? []).includes(effect.colorFilter)) continue
            if (effect.target === "self") {
                if (source.instanceId !== target.instanceId) continue
            } else if (effect.target === "ownAll") {
                // 対象となった持ち主のスピリットすべて（色不問、発生源自身も含む）
            } else {
                // ownOthers：発生源以外の、持ち主の緑スピリットが対象のときのみ
                if (source.instanceId === target.instanceId) continue
                if (!instHasColor(target, "green")) continue
            }
            noteCoverage(effect, "magicBuffBonus")
            recordBp(state, targetOwner, target, effect.amountBonus, "turn")
            log(
                state,
                `${getCard(source.cardId).name}の効果で${getCard(target.cardId).name}はさらにBP+${effect.amountBonus}（ターン終了時まで）。`,
            )
        }
    }
}

function countExhaustedEnemies(state: GameState, owner: PlayerId, opp: PlayerId, sourceType?: CardType): number {
    return countSpiritsWeighted(state, owner, opp, (s) => s.isRested, sourceType)
}

// selfBuff / timedEffect の bp / voidCoreToSelf / draw / coreGain 共通のカウンタ集計。数える側の基準：
// readyEnemies / exhaustedEnemies / opponentHand は相手（opponentOf(owner)）、ownReserve / ownNexuses / ownExhausted / ownOtherSpirits / { ownFamily } / { ownNameIncludes } は自分（owner）のフィールド、
// allNexuses は両者、selfCoresAtDestruction は self（破壊時点のコア数を destroySpirit が記録済み）、lastBattleDestroyedCores は state 直下の記録値
export function countEffectCounter(
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    counter: EffectCounter,
    // 数えている効果の発生源の種別（ActionHandler の ctx.srcType をそのまま渡す）。
    // 「自分のスピリット/マジックの効果で数えるとき」のような限定（シーサーズ／スリーカード）の判定に使う
    sourceType?: CardType,
): number {
    const opp = opponentOf(owner)
    if (counter === "ownAttacksThisTurn") return state.turnPlayer === owner ? state.attacksThisTurn : 0
    if (counter === "readyEnemies") {
        return countSpiritsWeighted(state, owner, opp, (s) => !s.isRested, sourceType)
    }
    if (counter === "exhaustedEnemies") return countExhaustedEnemies(state, owner, opp, sourceType)
    if (counter === "opponentHand") return state.players[opp].hand.length
    if (counter === "ownHand") return state.players[owner].hand.length
    if (counter === "lastDestroyedChimei") return lastMovedOf(state).filter((id) => chimeiBase(id) > 0).reduce((n, id) => n + chimeiBase(id) + chimeiBonus(state, owner), 0)
    if (counter === "ownOtherSpirits") {
        return countSpiritsWeighted(state, owner, owner, (s) => s.instanceId !== self?.instanceId, sourceType)
    }
    if (counter === "ownReserve") return state.players[owner].reserve
    if (counter === "keishoExcludedCount") return state.keishoExcludedCardIds?.length ?? 0
    if (counter === "selfBp") return self ? effectiveBp(state, owner, self) : 0
    if (typeof counter === "object" && "keishoExcludedFamily" in counter) {
        return (state.keishoExcludedCardIds ?? []).filter((id) => getCard(id).family.some((f) => counter.keishoExcludedFamily.includes(f))).length
    }
    if (counter === "opponentReserve") return state.players[opponentOf(owner)].reserve
    if (counter === "ownLife") return state.players[owner].life
    if (counter === "opponentLife") return state.players[opponentOf(owner)].life
    if (counter === "opponentFieldColors") return opponentFieldColorCount(state, owner)
    if (counter === "opponentFieldSpiritColors") return opponentFieldColorCount(state, owner, true)
    if (counter === "selfBraveCount") return self?.braveRefs?.length ?? 0
    if (counter === "ownNexuses") return state.players[owner].field.nexuses.length
    if (counter === "allNexuses") {
        return (
            state.players.p1.field.nexuses.length + state.players.p2.field.nexuses.length
        )
    }
    if (counter === "ownExhausted") {
        return countSpiritsWeighted(state, owner, owner, (s) => s.isRested, sourceType)
    }
    if (counter === "allExhausted") {
        // 両陣営の疲労スピリット数の合計
        return (
            countSpiritsWeighted(state, owner, owner, (s) => s.isRested, sourceType) +
            countExhaustedEnemies(state, owner, opp, sourceType)
        )
    }
    if (counter === "selfCoresAtDestruction") return self?.coresAtDestruction ?? 0
    if (counter === "lastBattleDestroyedCores") return state.lastBattleDestroyedCores
    if (counter === "lastBattleDestroyedBp") return state.lastBattleDestroyedBp
    if (counter === "lastBattleDestroyedCost") return state.lastBattleDestroyedCost
    // 26系【地鳴】の減算: このバトルでブロックした相手のスピリットカードのうち、バトル終了時点で
    // 防御側のトラッシュにあったカードのコスト合計（ブロックされていなければ0）
    if (counter === "lastBattleBlockerTrashCost") return state.lastBattleBlockerTrashCost
    // 減算算術の被減数になる定数（【地鳴：N】のN）
    if (typeof counter === "object" && "const" in counter) return counter.const
    // selfBofuCount：self の【暴風】静的 keyword の指定数のみ（ボーナス・ブレイヴ合流は見ない）。bofuCountFor（実効指定数）とは別軸
    if (counter === "selfBofuCount") {
        if (!self) return 0
        const level = currentLevel(self).level
        const entry = getCard(self.cardId).effects.find(
            (e) => e.kind === "keyword" && e.keyword === "bofu" && effectActiveAtLevel(e.levels, level),
        )
        const bofuCount = entry && entry.kind === "keyword" ? (entry.count ?? 1) : 0
        if (entry && bofuCount > 0) noteCoverage(entry, "keyword")
        return bofuCount
    }
    if (counter === "opponentTrashCores") return state.players[opp].trashCores
    if (counter === "selfSymbols") {
        if (!self) return 0
        // 合体中のブレイヴが発生源のときは、**合体スピリット全体**のシンボル数を数える（合体中は1体として扱う。2026-09-02 ユーザー確認）。
        // ホスト側が発生源のときは instanceSymbolCount がブレイヴぶんを含んでいるので変わらない
        if (self.braveCombined) {
            for (const p of ["p1", "p2"] as const) {
                const host = state.players[p].field.spirits.find((sp) =>
                    (sp.braveRefs ?? []).some((r) => r.instanceId === self.instanceId),
                )
                if (host) return instanceSymbolCount(host)
            }
        }
        return instanceSymbolCount(self)
    }
    if (counter === "selfLevel") return self ? currentLevel(self).level : 0
    if (counter === "burstEventCost") return state.burstEventCost ?? 0
    if (counter === "lastMoved") return lastMovedCount(state)
    if (counter === "lastTargetCount") return lastTargetsOf(state).length
    if (counter === "lastCores") return lastCoresCount(state)
    if (counter === "lastDrawn") return lastDrawnCount(state)
    if (counter === "lastNexusCost") return lastNexusCostOf(state)
    if (counter === "lastBp") {
        return lastTargetsOf(state).reduce((n, id) => {
            const f = findSpiritAny(state, id)
            return n + (f ? effectiveBp(state, f.pid, f.inst) : 0)
        }, 0)
    }
    if (counter === "bothNexusColors") return new Set([...state.players.p1.field.nexuses, ...state.players.p2.field.nexuses].flatMap(instColors)).size
    // 場から離れたカードは離れたときのコスト（増減込み。2026-10-08 ユーザー確認）
    if (counter === "lastCost") return lastMovedOf(state).reduce((n, id) => n + (lastLeftCostOf(state, id) ?? getCard(id).cost), 0)
    if (typeof counter === "object" && "div" in counter) {
        const [a, d] = counter.div
        return Math.floor(countEffectCounter(state, owner, self, a, sourceType) / d)
    }
    if (typeof counter === "object" && "plus" in counter) {
        const [a, n] = counter.plus
        return countEffectCounter(state, owner, self, a, sourceType) + (typeof n === "number" ? n : countEffectCounter(state, owner, self, n, sourceType))
    }
    if (typeof counter === "object" && "minus" in counter) {
        const [a, b] = counter.minus
        return Math.max(0, countEffectCounter(state, owner, self, a, sourceType) - countEffectCounter(state, owner, self, b, sourceType))
    }
    if (counter === "ownCoresTotal" || counter === "opponentCoresTotal") {
        const p = state.players[counter === "ownCoresTotal" ? owner : opp]
        const onField = [...p.field.spirits, ...p.field.nexuses, ...p.field.combinedBraves].reduce((n, i) => n + i.cores, 0)
        return onField + p.reserve + p.trashCores
    }
    if (counter === "selfCores") return self?.cores ?? 0
    // targetSymbols：対象を選んだ後に logic/counted.ts が数えるため、このカウンタが直接ここに来ることは無い（フォールスルー防止のプレースホルダ）
    if (counter === "targetSymbols") return 0
    // targetSameFamilyOwn も同様（logic/counted.ts が対象を選んだ後に数える）
    if (counter === "targetSameFamilyOwn" || counter === "targetBofuCount") return 0
    if (counter === "restedEnemyNexuses") {
        return state.players[opp].field.nexuses.filter((n) => n.isRested).length
    }
    if (counter === "ownRestedNexuses") {
        return state.players[owner].field.nexuses.filter((n) => n.isRested).length
    }
    // 直前の【粉砕】で破棄した総枚数／うちスピリットカードの枚数（resolveFunsai が記録）
    if (counter === "lastFunsaiTotal") return state.lastFunsai?.total ?? 0
    if (counter === "lastFunsaiSpirits") return state.lastFunsai?.spirits ?? 0
    if (counter === "ownCombinedSpirits") {
        return state.players[owner].field.spirits.filter((s) => instIsCombined(s)).length
    }
    if (counter === "ownBraveSpirits") {
        return state.players[owner].field.spirits.filter((s) => getCard(s.cardId).type === "brave").length
    }
    // battlingOpponentCombinedSymbols：self が参加しているバトルの相手側が合体スピリットのときだけそのシンボル数
    if (counter === "battlingOpponentCombinedSymbols") {
        if (!state.battle || !self) return 0
        const otherId =
            state.battle.attackerInstanceId === self.instanceId
                ? state.battle.blockerInstanceId
                : state.battle.attackerInstanceId
        if (!otherId) return 0
        const otherInst = state.players[opp].field.spirits.find((s) => s.instanceId === otherId)
        if (!otherInst || !instIsCombined(otherInst)) return 0
        return instanceSymbolCount(otherInst)
    }
    // battlingOpponentSymbols：battlingOpponentCombinedSymbols の合体限定を外した版
    if (counter === "battlingOpponentSymbols") {
        if (!state.battle || !self) return 0
        const otherId =
            state.battle.attackerInstanceId === self.instanceId
                ? state.battle.blockerInstanceId
                : state.battle.attackerInstanceId
        if (!otherId) return 0
        const otherInst = state.players[opp].field.spirits.find((s) => s.instanceId === otherId)
        return otherInst ? instanceSymbolCount(otherInst) : 0
    }
    if ("ownKeyword" in counter) {
        const keywords = Array.isArray(counter.ownKeyword) ? counter.ownKeyword : [counter.ownKeyword]
        return countSpiritsWeighted(
            state,
            owner,
            owner,
            (s) => keywords.some((k) => spiritHasKeywordOrLabel(state, owner, s, k)),
            sourceType,
        )
    }
    if ("opponentSpirits" in counter) {
        const filter = counter.opponentSpirits as unknown as ResolvedTargetFilter
        return countSpiritsWeighted(state, owner, opp, (s) => matchesTarget(state, opp, s, filter), sourceType)
    }
    if ("ownTrashCards" in counter) {
        const pick = counter.ownTrashCards
        return state.players[owner].trashCards.filter((id) => matchesPick(id, pick)).length
    }
    if ("ownFieldCards" in counter) {
        const filter = counter.ownFieldCards as unknown as ResolvedTargetFilter
        const f = state.players[owner].field
        return [...f.spirits, ...f.nexuses].filter((x) => matchesTarget(state, owner, x, filter, self?.instanceId)).length
    }
    if ("ownSpirits" in counter) {
        const filter = counter.ownSpirits as unknown as ResolvedTargetFilter
        return countSpiritsWeighted(state, owner, owner, (s) => matchesTarget(state, owner, s, filter, self?.instanceId), sourceType)
    }
    if ("ownNameIncludes" in counter) {
        return countSpiritsWeighted(
            state,
            owner,
            owner,
            (s) => cardNameContains(s, counter.ownNameIncludes),
            sourceType,
        )
    }
    // { anyNameIncludes: string }：ownNameIncludes の両陣営版
    if ("anyNameIncludes" in counter) {
        return (
            countSpiritsWeighted(state, owner, "p1", (s) => cardNameContains(s, counter.anyNameIncludes), sourceType) +
            countSpiritsWeighted(state, owner, "p2", (s) => cardNameContains(s, counter.anyNameIncludes), sourceType)
        )
    }
    if ("ownColor" in counter) {
        return countSpiritsWeighted(state, owner, owner, (s) => instHasColor(s, counter.ownColor), sourceType)
    }
    // { enemyCost: {max,min} }：道化師クランの付与コストも見る（instMatchesCostFilter）
    if ("enemyCost" in counter) {
        return countSpiritsWeighted(
            state,
            owner,
            opp,
            (s) => instMatchesCostFilter(s, counter.enemyCost),
            sourceType,
        )
    }
    if ("ownNexusColor" in counter) {
        return state.players[owner].field.nexuses.filter((n) =>
            instHasColor(n, counter.ownNexusColor),
        ).length
    }
    // { ownNexusNameIncludes }：同名重複もそのまま数える
    if ("ownNexusNameIncludes" in counter) {
        return state.players[owner].field.nexuses.filter((n) =>
            cardNameContains(n, counter.ownNexusNameIncludes),
        ).length
    }
    // { ownColorSymbols: Color }：**ネクサスのシンボルも数える**（2026-08-20 修正。以前は field.spirits だけを見ていて取りこぼしていた）。
    // 軽減計算と同じ countSymbols に寄せることで、symbolFix によるシンボル固定・バウンス待機の除外・付与色（colorAs / tempColors）の扱いも揃う
    if ("ownColorSymbols" in counter) {
        return countSymbols(state.players[owner], [counter.ownColorSymbols])
    }
    // { ownFamily }：familyGrant による付与も含む。配列＝いずれかの系統でOR
    // （onDestroy等で発火する場合、selfはこの時点ですでにフィールドから除去済みのため含まれない）
    const wantedFamilies = Array.isArray(counter.ownFamily) ? counter.ownFamily : [counter.ownFamily]
    return state.players[owner].field.spirits.filter((s) =>
        wantedFamilies.some((f) => spiritHasFamily(state, owner, s, f)),
    ).length
}

// 効果ドロー倍化：owner のフィールドにレベル有効かつ phaseTurn 一致の kind:"drawDouble" があれば2を返す（複数あっても2倍まで）。
// draw アクションの枚数確定箇所からのみ参照する（deckReveal・通常のドローステップは対象外）
export function drawDoubleMultiplier(state: GameState, owner: PlayerId): number {
    const player = state.players[owner]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "drawDouble") continue
            if (!entryActive(state, owner, source, effect, level)) continue
            if (state.phase !== effect.phaseTurn.phase) continue
            if (effect.phaseTurn.turn === "own" && owner !== state.turnPlayer) continue
            noteCoverage(effect, "drawDouble")
            return 2
        }
    }
    return 1
}

// 効果アクションを実行する。owner = 効果の使用者、self = 効果の発生源スピリット（マジックは null）。
// sourceColors = 発生源の色（装甲判定用）。省略時は self のカード色（マジックは呼び出し側で明示する）
// sourceCardId = 発生源のカードID。省略時は self.cardId。マジックは self が null のため resolveMagic が明示的に渡す（lendSelfThisTurn 専用。TURN_EFFECT_SOURCES.md §3.3）

// ── 「効果でコアが置かれた」の検出（fieldEvent "opponentCorePlaced"）──
// docs/design/EFFECT_SOURCE_CONTEXT.md
//
// コアが増える箇所はエンジン中に28箇所あり、そのすべてに通知を足すと必ず書き漏れる
// （RESUME_STACK.md §5(a) と同じ「呼び出し元が対応していない」問題）。
// 代わりに resolveAction の**1箇所**で、効果1つの前後にコアの居場所を突き合わせる。
//
// 「置いた」の数え方は**増えた側だけの合計**にする。効果文が出所を限定していないため、
// リザーブからスピリットへ移したものも、スピリットからスピリットへ移したものも1個と数える
// （2026-08-16 ユーザー確認）。減った側を差し引くと移動が0個になってしまうので引かない。
type CorePlaces = Record<PlayerId, { reserve: number; life: number; byInstance: Map<string, number> }>

// 監視するカードが1枚も場に無いなら、スナップショット自体を省く（毎アクション走るため）
function hasCorePlacedWatcher(state: GameState): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
            for (const effect of getCard(inst.cardId).effects) {
                if (effect.kind === "fieldEvent" && (effect.event === "opponentCorePlaced" || effect.event === "coresGainedFromVoid" || effect.event === "lifeCorePlaced")) return true
            }
        }
    }
    return false
}

function snapshotCorePlaces(state: GameState): CorePlaces {
    const snap = {} as CorePlaces
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        const byInstance = new Map<string, number>()
        for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
            byInstance.set(inst.instanceId, inst.cores)
        }
        snap[pid] = { reserve: player.reserve, life: player.life, byInstance }
    }
    return snap
}

// 増えたコアの個数を数え、置かれた側の**相手**のフィールドから "opponentCorePlaced" を発火する
// （「持ち主から見て相手のフィールド/リザーブにコアが置かれたとき」）
function fireCorePlacedFromDiff(state: GameState, before: CorePlaces): void {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        const prev = before[pid]
        let placed = Math.max(0, player.reserve - prev.reserve)
        for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
            // この効果の間に場に出たカード（スナップショットに無い）は、そこに置かれたコアも「置いた」分
            placed += Math.max(0, inst.cores - (prev.byInstance.get(inst.instanceId) ?? 0))
        }
        if (placed > 0) fireFieldEventTriggers(state, opponentOf(pid), "opponentCorePlaced", undefined, undefined, undefined, placed)
    }
    fireCoreGainEvents(state, before)
}

// coresGainedFromVoid / lifeCorePlaced。ボイドから増えたぶん＝コア総数（リザーブ+場+ライフ）の純増。
// 同じ効果でトラッシュ等へ減らすと純増が相殺されて数え漏れる（簡略化）。増えた置き場所が純増より多いときは後ろから削る
function fireCoreGainEvents(state: GameState, before: CorePlaces): void {
    const src = state.currentEffectSource
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        const prev = before[pid]
        const places: NonNullable<GameState["lastCoresGained"]>["places"] = []
        const lifeUp = Math.max(0, player.life - prev.life)
        const resUp = Math.max(0, player.reserve - prev.reserve)
        if (resUp > 0) places.push({ where: "reserve", n: resUp })
        if (lifeUp > 0) places.push({ where: "life", n: lifeUp })
        let totalBefore = prev.reserve + prev.life
        let totalAfter = player.reserve + player.life
        for (const v of prev.byInstance.values()) totalBefore += v
        for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
            totalAfter += inst.cores
            const up = inst.cores - (prev.byInstance.get(inst.instanceId) ?? 0)
            if (up > 0) places.push({ where: "instance", instanceId: inst.instanceId, n: up })
        }
        const info = {
            gainerPid: pid,
            ...(src ? { causePid: src.pid } : {}),
            ...(src?.type !== undefined ? { causeType: src.type, destroySourceType: src.type } : {}),
            ...(src?.instanceId !== undefined ? { sourceInstanceId: src.instanceId } : {}),
        }
        const gained = totalAfter - totalBefore
        if (gained > 0) {
            let excess = places.reduce((a, p) => a + p.n, 0) - gained
            for (let i = places.length - 1; i >= 0 && excess > 0; i--) {
                const cut = Math.min(excess, places[i]!.n)
                places[i]!.n -= cut
                excess -= cut
            }
            state.lastCoresGained = { gainerPid: pid, places: places.filter((p) => p.n > 0) }
            for (const w of ["p1", "p2"] as PlayerId[]) fireFieldEventTriggers(state, w, "coresGainedFromVoid", undefined, undefined, undefined, gained, info)
        }
        if (lifeUp > 0) for (const w of ["p1", "p2"] as PlayerId[]) fireFieldEventTriggers(state, w, "lifeCorePlaced", undefined, undefined, undefined, lifeUp, info)
    }
}

export function resolveAction(
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    action: EffectAction,
    targetInstanceId?: string,
    sourceColors?: Color[],
    sourceType?: CardType,
    chosenOption?: string,
    chosenCardIndex?: number,
    sourceCardId?: string,
    paySources?: PaySource[],
    // バースト効果の入口（burst.ts／choice.ts／handBurstEffect.ts）だけが true を渡す。入れ子と再開は下で引き継ぐ
    burst?: true,
): void {
    // 召喚時効果を発揮した印。pay は払えないと発動していないので、確認を済ませたか払った時点で付ける（pay.ts）
    if (self !== null && state.summonEffectSource?.instanceId === self.instanceId && action.type !== "pay") state.summonEffectSource.resolved = true
    const opp = opponentOf(owner)
    const sourceName = self ? getCard(self.cardId).name : "効果"
    const srcColors = sourceColors ?? (self ? instColors(self) : undefined)
    // マジック効果耐性判定用のカード種別（マジックは self=null なので、呼び出し側=resolveMagic が明示的に"magic"を渡す）
    const srcType = sourceType ?? (self ? getCard(self.cardId).type : undefined)
    // マジックの効果を入れ子で解くとき sourceCardId は渡らないので、同じ持ち主の外側の効果の発生源カードを引き継ぐ
    const srcCardId = sourceCardId ?? (self ? self.cardId : state.currentEffectSource?.pid === owner ? state.currentEffectSource.cardId : undefined)
    // 相手スピリットを破壊する際に渡す破壊コンテキスト（reviveOnDestroy判定用）。
    // exactOptionalPropertyTypes対応：srcTypeがundefinedのときはプロパティ自体を省略する
    const destroyContext: DestroyContext = {
        sourcePid: owner,
        ...(srcType !== undefined ? { sourceType: srcType } : {}),
        // 発生源の色（「相手の**赤の**スピリット/マジックの効果では破壊されない」の判定用）
        ...(srcColors !== undefined ? { sourceColors: srcColors } : {}),
        // 発生源インスタンス（「その効果を発揮したスピリット」を対象にする軸用）
        ...(self ? { sourceInstanceId: self.instanceId } : {}),
        ...(srcCardId !== undefined ? { sourceCardId: srcCardId } : {}),
    }

    // アクション本体は actions/ のドメイン別モジュール。ACTION_HANDLERS は全 EffectAction.type を網羅する型なので、書き漏れはコンパイル時に検出される
    const ctx: ActionCtx = {
        state,
        owner,
        opp,
        self,
        sourceName,
        srcColors,
        srcType,
        sourceCardId: srcCardId,
        destroyContext,
        targetInstanceId,
        chosenOption,
        chosenCardIndex,
        paySources,
        resolve: (next, opts) =>
            resolveAction(
                state,
                owner,
                opts?.self === undefined ? self : opts.self,
                next,
                opts?.targetInstanceId,
                opts?.sourceColors,
                opts?.sourceType,
                opts?.chosenOption,
                opts?.chosenCardIndex,
            ),
    }
    noteAction(action)
    const handler = ACTION_HANDLERS[action.type] as (c: ActionCtx, a: EffectAction) => void
    // いま解決中の効果の発生源を state に載せる（docs/design/EFFECT_SOURCE_CONTEXT.md。fieldEvent.sourceColorFilter が読む）。
    // ネストした resolveAction は自分の値で上書きし、抜けるときに前の値へ戻す
    const outerEffectSource = state.currentEffectSource
    const isOutermostEffect = outerEffectSource === undefined
    // 引き継ぐのは「インスタンスを持たない同じカードの解決」だけ（バーストで召喚されたスピリットの召喚時効果は引き継がない）
    const resumed = state.resumeBurst
    const inBurst =
        burst === true ||
        (outerEffectSource?.burst === true && self === null && owner === outerEffectSource.pid && srcCardId === outerEffectSource.cardId) ||
        (outerEffectSource === undefined && resumed !== undefined && self === null && owner === resumed.pid && (srcCardId === undefined || srcCardId === resumed.cardId))
    state.currentEffectSource = {
        ...(inBurst ? { burst: true as const } : {}),
        pid: owner,
        ...(srcType !== undefined ? { type: srcType } : {}),
        ...(srcColors !== undefined ? { colors: srcColors } : {}),
        // self が確定しているときだけ発生源インスタンスを載せる
        ...(self !== null && self !== undefined ? { instanceId: self.instanceId } : {}),
        ...(srcCardId !== undefined ? { cardId: srcCardId } : {}),
    }
    // 「効果でコアが置かれた」の検出用スナップショット。**一番外側の効果でだけ**取る
    // （ネストで取ると同じ配置を二重に数える）。監視するカードが場に無ければ何もしない
    const coreSnapshot = isOutermostEffect && hasCorePlacedWatcher(state) ? snapshotCorePlaces(state) : undefined
    handler(ctx, action)
    // コアの居場所を突き合わせ、増えた側だけを合計して "opponentCorePlaced" を発火する。
    // **currentEffectSource を戻す前に**呼ぶ（sourceColorFilter がこれを読むため）
    if (coreSnapshot) fireCorePlacedFromDiff(state, coreSnapshot)
    // exactOptionalPropertyTypes：undefined の代入ではなくプロパティごと消す
    if (outerEffectSource === undefined) delete state.currentEffectSource
    else state.currentEffectSource = outerEffectSource
    // バウンス待機状態のカードを、**この効果の解決が終わった時点で**まとめて手札／デッキへ移す
    // （Wiki「バウンスについて」：待機中の「戻るとき」効果は割り込まず、解決後に発揮する）。
    // 選択待ちで中断している間はまだ解決が終わっていないので、待機のまま残す
    if (!state.pendingChoice) flushBounces(state)

}

// ---- イベント発火（server/src/logic/triggers.ts へ分割。2026-08-10）----
// 呼び出し側（57ファイル）を変えずに済むよう、ここから再エクスポートする。相互 import は GameState.ts ↔ EffectModules.ts と同じ CommonJS の循環 require で安全
export { isTriggerSuppressed, fireSummonTrigger, fireTrigger, fireCombinedAttackTrigger, applyBothSidesRedirectToCandidates, bothSidesPids, bothSidesRedirectKeepPid, notifySpiritCoresRemovedByOpponent, findMagicNegateSource, resolveMagic, applyMagicRedirectChoice, applyMagicSideChoice, applyMagicRepeatChoice, applyMagicNegateChoice, declineMagicNegateChoice, revertOncePerTurn, revertDestroyGroupUsage } from "./triggers"
export { applyJugekiCoreToVoid } from "./keywords/jugeki"
export { fireBattleWonTriggers, fireStepTriggers, fireBpReachedTriggers, battleBp } from "./stepTriggers"
export { fireFieldEventTriggers, notifyHandGained, notifyNexusDeployed, fireNexusDeployed } from "./fieldEventTriggers"

// ---- スピリット／ネクサスの除去・ブレイヴ・復活（removal.ts・brave.ts・revive.ts へ分割）----
// 呼び出し側を変えずに済むよう、ここから再エクスポートする
export {
    destroySpiritsFrom,
    destroyTargetsBatch,
    applyDestroyBatchAfter,
    resumeDestroyBatch,
    destroySpirit,
    tryFreeSummonOnHandDiscard,
    tryHandFreeSummonOnLifeDamaged,
    applyHandFreeSummon,
    destroyNexus,
    returnNexusToHand,
    returnNexusToDeckTop,
    returnNexusToDeckBottom,
    returnSpiritToHand,
    returnSpiritToDeckTop,
    returnSpiritToDeckBottom,
    flushBounces,
    fireBounceTriggers,
    markBounce,
    canTakeCoresFrom,
    coreFloorFor,
    removeCores,
    removeCoresToTrash,
    removeCoresToVoid,
} from "./removal"
export { attachBrave, detachBraveByEffect, detachBraveByOwnerChoice, returnCombinedBraveToHand, returnCombinedBraveToDeckBottom, destroyCombinedBrave, detachBraveVoluntary, detachBravesOnLeave, flushBraveKeeps, applyBraveKeep, declineBraveKeep } from "./brave"
export { applyReviveEntry, collectReviveEntries, fushiSummonOrConfirm, applyReviveConfirm, declineReviveConfirm } from "./revive"

// ---- 継続効果の再計算・対象の選び方・【バースト】・召喚（state/continuous.ts・targeting.ts・keywords/burst.ts・summon.ts へ分割。2026-09-26）----
// 呼び出し側を変えずに済むよう、ここから再エクスポートする
export { recordTimed, recordPlayerRule, recordBp, refreshLevelAsOverrides } from "./state/continuous"
export {
    pickEnemyCandidates,
    pickAnySideCandidates,
    pickAnySideByBp,
    pickEnemyByBp,
    pickEnemyLowestCost,
    tryInteractiveTargetChoice,
    tryInteractiveCardChoice,
    pickOwnKeywordTarget,
    requestActivationConfirm,
    requestChoice,
    requestCardChoice,
    requestUpToChoice,
} from "./targeting"
export { placeBurst, finishBurstActivation, fireOwnBurstActivated, continueBurstActivation, announceBurstActivation } from "./keywords/burst"
export { fireSummonSequence, summonFreeFromHandIndex, summonFreeFromTrashIndex } from "./summon"
