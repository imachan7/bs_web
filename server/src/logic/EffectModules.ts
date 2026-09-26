// キーワード効果・誘発効果ハンドラの集約と実行
//
// 設計（data.md 5章の3層構成）:
//   - イベント層: TriggerEvent（onSummon など）を起点に発火する
//   - 効果データ層: カードの effects 配列（EffectDef）
//   - ハンドラ層: キーワードはレジストリ、アクションは resolveAction で解決
// キーワードごとの処理は keywords/（【バースト】は keywords/burst.ts）、デッキ破棄は zones/mill.ts、疲労・回復は state/exhaust.ts、
// 継続効果の再計算は state/continuous.ts、対象の選び方と選択待ちの発行は targeting.ts、召喚時の誘発と無償召喚は summon.ts に分けてある。
import { recordBp, refreshLevelAsOverrides } from "./state/continuous"
import { requestCardChoice } from "./targeting"
import type {
    CardInstance,
    CardType,
    Color,
    DestroyContext,
    EffectAction,
    EffectCounter,
    GameEvent,
    GameState,
    PaySource,
    PlayerId,
} from "../type"
import { CARD_DB, currentLevel, findNexus, findSpirit, getCard, log, instMinLevelCores, opponentOf } from "./GameState"
// 共有ルール層（shared/）へ移設した純粋述語。サーバー／クライアントで同一実装を使う。
// 外部から EffectModules 経由で import している箇所を壊さないため、再エクスポートで名前を残す
// 分割した triggers.ts の関数を内部でも使う（再エクスポートとは別に import が要る）。
// 相互 import になるが CommonJS の循環requireで安全（ファイル冒頭の注記を参照）
// 分割した removal.ts の関数を内部でも使う（再エクスポートとは別に import が要る）
import { destroySpirit, flushBounces } from "./removal"
import { fireFieldEventTriggers, notifyHandGained } from "./triggers"
import ACTION_HANDLERS from "./actions"
import type { ActionCtx } from "./actions/types"
import type { EffectAttempt, KeywordInfo, Resistance } from "../../../shared/rules"
export type { KeywordInfo }
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
    instIsCombined,
    opponentFieldColorCount,
} from "../../../shared/rules"
export { TENSHO_SUBSTITUTE_REST, TENSHO_SUBSTITUTE_DUMP, TENSHO_SUBSTITUTE_HAND, TENSHO_SUBSTITUTE_HAND_DUMP, tenshoSpecOf, tenshoCandidates, resolveTensho, fireTenshoEvent, flushPendingTenshoEvent, dumpAllCoresTensho, tenshoAfterTargetTrigger, applyTenshoSubstitute, applyTenshoSubstituteCrossSource, tenshoDumpAndDestroy } from "./keywords/tensho"
export { millCapBonusFor, hasFunsaiOnBlock, resolveFunsai } from "./keywords/funsai"
export { hasJugekiOnBlockReplace } from "./keywords/jugeki"
export { hasKyoshuOnBlock } from "./keywords/kyoshu"
export { bofuCountFor, hasBofuOnBlock, hasBofuChooserSelf } from "./keywords/bofu"
export { hasKoboOnBlock, resolveKoboOnBattleEnd } from "./keywords/kobo"
export { millDeck, applyDeckMillNegate, declineDeckMillNegate } from "./zones/mill"
export { checkExhaustOnCoreChange, exhaustSpirit, refreshSpirit, fireExhaustedTriggers, isRefreshBlockedByMark, canExhaustNexus } from "./state/exhaust"
import { checkExhaustOnCoreChange } from "./state/exhaust"
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

// 音鳥クルークのgrantFamilyChoiceAll用: 全カードの系統を重複なく集めたソート済みリスト。
// GameState.ts とはモジュール相互importの関係にあり、モジュール読み込み時点では
// CARD_DB がまだ初期化されていない可能性があるため、初回参照時に遅延計算してキャッシュする
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

// GameEvent からseqを除いたユニオン（分配条件型でバリアントごとに正しくOmitする。
// 組み込みのOmitを直接ユニオンへ適用するとバリアント固有プロパティが消えてしまうため）
type WithoutSeq<T> = T extends { seq: number } ? Omit<T, "seq"> : never

// state.events にイベントを1件積む（seqはstate.eventSeqをインクリメントして自動採番）。
// GameEngine.handleAction冒頭でstate.eventsをクリアするため、1アクションで発生した分だけが
// クライアントへ配信される（召喚・破壊・ドロー・ライフダメージ・マジック使用）
export function emitEvent(state: GameState, event: WithoutSeq<GameEvent>): void {
    state.eventSeq += 1
    state.events.push({ ...event, seq: state.eventSeq } as GameEvent)
}

// ---- キーワードレジストリ ----
// 挙動（召喚やコア移動の可否）は GameEngine / RuleValidator が hasKeyword で参照する。
// ここではキーワードの存在と表示名を一元管理する。

// 指定カードがそのキーワードを持つか。
// 「神速を持つスピリット」を参照する効果など、他カードの判定にも使い回せる。

// カードに効果の記述を持たない（＝バニラ）か。Wiki由来の効果原文（card.effect）が空文字のカードを指す
// （無法者の荒野／運命分かつ岐路／深緑の樹海／鋼に覆われた高空／子供部屋 午前0時／サファイアの城壁が参照）。

// 指定インスタンスが、実コストまたは道化師クランの tempAlsoCosts のいずれかで
// 指定コストとして扱われるか（コスト一致判定を行う既存箇所はすべてこちらを参照する）

// 効果が現在のレベルで有効か（levels が null ならレベル不問）

// 状態を考慮したキーワード判定：
//   静的キーワード（hasKeyword） ‖ 一時付与（tempKeywords。スピリットリンク等） ‖
//   持ち主フィールドからの継続付与（kind: "keywordGrant"。暴双龍ディラノス）
// フィールド上のスピリットを判定する箇所はこちらを使う（手札の静的判定は hasKeyword のまま）。

// spiritHasKeyword の「持ち主フィールドからの継続付与（kind: "keywordGrant"）」判定だけを切り出したもの。
// レベル判定を保ったまま静的キーワード判定を別途行いたい呼び出し元（resolveKoboOnBattleEnd）が
// 単独で参照できるようにする（BS04エンジン拡張バッチ1）

// このインスタンスが、いま解決中の効果を「受けない」状態か。
// 破壊・コア除去・疲労・バウンス等の各ガード（装甲／マジック効果耐性と同じ箇所＝5ファイル18箇所）から呼ぶ。
// **新しい「効果を受けない」ルールはここへ足すこと**（ガード地点を再び18箇所さわらずに済む）。
// 現在の内訳:
//   ① 茨の決戦地Lv2（globalConstraint "battlingEffectImmune"）：バトル中の両陣営スピリットは、
//      お互いのスピリット/マジックの効果を受けない（ネクサスの効果は通る＝カードテキストどおり）
//   ② アルカナソルジャー・サンクLv2（GameState.magicRedirectTo）：相手のマジックの対象が
//      サンク1体へ絞り込まれている間、同じ持ち主の**他の**スピリットはそのマジックの効果を受けない
// 【耐性を見る唯一の入口】この操作が、この対象に、この発生源から通るか。
// 防がれるなら理由（ResistanceCategory とログ用ラベル）を、通るなら null を返す。
//
// **相手のスピリット／ネクサスに何かをするハンドラは、個別の耐性述語を並べずにこれを1回呼ぶこと。**
// 「どの耐性を見るべきか」を呼び出し側に判断させるのをやめるための入口で、
// 判定表そのものは shared/rules.boardResistanceAgainst にある（クライアントの対象ハイライトも同じ表を使う）。
// ここが上乗せするのは、盤面ではなく**効果解決中の一時状態**で決まる2軸だけ:
//   ① 対象の絞り込み（kind:"magicTargetRedirect"。state.magicRedirectTo）
//   ② 相手のスピリットの『召喚時』効果を受けない（state.resolvingSummonTriggerPid）
export function resistanceAgainst(
    state: GameState,
    targetOwnerPid: PlayerId,
    target: CardInstance,
    attempt: EffectAttempt,
): Resistance | null {
    // ① 対象の絞り込み（**スピリット/マジックの効果**が対象。ネクサスの効果は通る。
    // 絞り込み先の持ち主のスピリットだけが影響を受ける。2026-08-14 ユーザー確認で
    // マジック限定からスピリットの効果へ拡張した。BS09-038ティンカ／BS05-040スノーホワイト）
    const redirect = state.magicRedirectTo
    if (
        redirect !== undefined &&
        (attempt.sourceType === "magic" || attempt.sourceType === "spirit") &&
        target.instanceId !== redirect.instanceId &&
        state.players[redirect.pid].field.spirits.some((s) => s.instanceId === target.instanceId)
    ) {
        return { category: "magicRedirect", label: "効果の対象が絞り込まれている" }
    }
    // ② 相手のスピリットの『このスピリットの召喚時』効果を受けない（BS05リトルナイト・ランスロットLv3）。
    // 発生源がスピリットで、いま召喚時効果を解決中であり、その持ち主が対象の持ち主と異なるときだけ効く
    const summonPid = state.resolvingSummonTriggerPid
    if (
        summonPid !== undefined &&
        attempt.sourceType === "spirit" &&
        summonPid !== targetOwnerPid &&
        activeConstraints(state, targetOwnerPid, target).some((c) => c.type === "immuneToOpponentSummonEffects")
    ) {
        return { category: "summonEffectImmune", label: "相手のスピリットの召喚時効果を受けない" }
    }
    const boardResisted = boardResistanceAgainst(state, targetOwnerPid, target, attempt)
    if (boardResisted) return boardResisted
    // ③ コストを払って受けない耐性（BS08竜騎集う円卓Lv2）。**盤面だけで決まる耐性を全部見たあと**に判定する
    // （先に払うと、装甲などで元々防げていた対象化にまで手札を使ってしまう）
    return tryPayableTargetNegate(state, targetOwnerPid, target, attempt)
}

// kind:"targetNegateByHandDiscard"（BS08竜騎集う円卓Lv2）：
// 「相手のスピリットの効果の対象になるたび、自分の手札1枚を破棄することで、その効果を受けない」。
//
// **ここだけが耐性の中でコストを払う＝副作用がある**。そのため2点に注意:
//   - attempt.probing（候補を数えているだけ）のときは判定しない。対象にはなってよく、
//     防ぐのは実際に適用する1点だけ（そこでしか呼ばれないので、1回の対象化につき1回だけ払う）
//   - shared/rules には置けない（あちらは純粋な述語の層で、クライアントも同じ実装を呼ぶ）。
//     クライアントの対象ハイライトにこの耐性が出ないのは**正しい**：対象にはなるため
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
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.bySourceType !== attempt.sourceType) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && targetOwnerPid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && targetOwnerPid === state.turnPlayer) continue
            }
            if (!matchesFamilyFilter(state, targetOwnerPid, target, effect.familyFilter)) continue
            // 支払えないなら受ける（手札が足りないときは耐性が成立しない）。
            // BS11-065 満天の牧草地：メインステップは手札を破棄できない（COST_MODEL.md §1）
            if (player.hand.length < effect.discardCount || !canDiscardHand(state, targetOwnerPid)) continue
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

// 「手札を破棄することで効果を受けない」を**払うかどうか、守る側に聞く**。
// 聞いて中断したら true を返す（呼び出し元はそのまま return する。応答後に元のアクションが解決し直される）。
//
// 呼ぶ場所は **resistanceAgainst の直前**（対象が確定してから適用するまでの間）。
// 効果の内容（どのカードの効果で、どのスピリットが対象か）が分かった状態で聞けるのはここだけで、
// 判定そのものは装甲と同じ同期の述語のままにしておける。
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
    if (attempt.probing) return false // 候補を数えているだけの問い合わせでは聞かない
    if (attempt.scope !== "targeted") return false
    if (attempt.actorPid === targetOwnerPid) return false
    if (attempt.sourceType !== "spirit") return false
    // すでに答えが出ている（＝この中断から戻ってきた）なら聞き直さない
    if (state.payNegateDecision?.targetInstanceId === target.instanceId) return false
    // 盤面だけで決まる耐性で既に防げているなら、手札を使わせない（tryPayableTargetNegate と同じ順序）
    if (boardResistanceAgainst(state, targetOwnerPid, target, attempt)) return false
    const player = state.players[targetOwnerPid]
    for (const source of effectSources(state, targetOwnerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "targetNegateByHandDiscard") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.bySourceType !== attempt.sourceType) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && targetOwnerPid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && targetOwnerPid === state.turnPlayer) continue
            }
            if (!matchesFamilyFilter(state, targetOwnerPid, target, effect.familyFilter)) continue
            // 払えないなら聞かない（そのまま効果を受ける）。
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

// resistanceAgainst の真偽値版（理由を使わない呼び出し側用）
export function isResisted(
    state: GameState,
    targetOwnerPid: PlayerId,
    target: CardInstance,
    attempt: EffectAttempt,
): boolean {
    return resistanceAgainst(state, targetOwnerPid, target, attempt) !== null
}

// 指定インスタンスがどちらのプレイヤーのフィールドにあるか（スピリット／ネクサス。無ければ undefined）
function ownerPidOfInstance(state: GameState, inst: CardInstance): PlayerId | undefined {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const field = state.players[pid].field
        if (field.spirits.includes(inst) || field.nexuses.includes(inst)) return pid
    }
    return undefined
}

// スピリットのコアが効果／手動操作で増減したとき、相手フィールドの exhaustOnManualCoreAdd 持ち
// 発生源（レベル有効。effectSources経由でlendSelfThisTurnの貸与も対応）があれば、
// そのスピリットを疲労させる。
// opts省略時（従来のmoveCore/awaken呼び出し）＝手動操作かつ増加時のみ、持ち主の相手のメインステップ限定
// （夢魔の寝所）。opts.viaEffect:true＝効果（EffectAction）による増減時に判定し、フェーズ不問
// （BS05アブソーブシンボル。isRemoval:trueの減少側はeffect.onRemoveがある場合のみ反応する）
// 破壊/消滅したスピリット上のコアをリザーブでなくトラッシュへ置くか（古龍の縄張りLv1）。
// 効果文が「スピリットが破壊されたとき」と陣営を限定していないため、両陣営の発生源を見る
export function destroyedCoresGoToTrash(state: GameState): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, pid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "destroyedCoresToTrash") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                return true
            }
        }
    }
    return false
}

// BS08ビクティム（kind:"summonCostHandDiscardPay"）：「スピリットカード**1枚**の召喚に」なので、
// 実際に手札破棄で支払った時点で貸与を使い切る（＝仮想発生源を1つ取り除く）。
// 使わずにターンが終われば turnVirtualInstances のリセットで自然に消える
export function consumeSummonHandDiscardPay(state: GameState, pid: PlayerId): void {
    const list = state.players[pid].turnVirtualInstances
    const index = list.findIndex((inst) =>
        getCard(inst.cardId).effects.some((e) => e.kind === "summonCostHandDiscardPay"),
    )
    if (index === -1) return
    log(state, `${getCard(list[index]!.cardId).name}の効果は使い切られた。`)
    list.splice(index, 1)
}

// 器BS16：発生源の持ち主（ownerPid）のスピリット/マジックの効果による「BP◯以下を破壊する」判定の
// 閾値ボーナス合計（kind:"destroyBpThresholdBonus"。BS16-061暗雲射す鬼ヶ島）。ブレイヴ自身の効果・
// ネクサスの効果には効かないので、呼び出し側がsrcType（"spirit"|"magic"）のときだけ呼ぶこと
export function destroyBpThresholdBonusFor(state: GameState, ownerPid: PlayerId): number {
    let total = 0
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "destroyBpThresholdBonus") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            total += effect.amount
        }
    }
    return total
}

// 発生源の持ち主（targetPid）の**手札**が、相手のスピリット/ブレイヴ/マジックの効果を受けないか
// （globalConstraint:"handImmuneForPid"。ネクサスの効果は防がない＝sourceType:"nexus"は素通しする。
// BS12-067月光集める塔Lv1）。discardOpponent等の手札を対象に取る処理の冒頭で呼ぶ
export function handImmuneFor(state: GameState, targetPid: PlayerId, sourceType: CardType | undefined): boolean {
    for (const source of effectSources(state, targetPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "handImmuneForPid") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // ネクサスの効果は既定では防がない＝意図的（BS12-067）。includeNexus指定時のみ防ぐ（BS14-082五角形の砦）
            if (sourceType === "nexus" && !effect.constraint.includeNexus) continue
            return true
        }
    }
    return false
}

// kind:"lifeDamageMillGuard"（BS07六花の司書長サーガ）：defenderPid のライフが減る直前に呼ぶ。
// 発生源が有効なら持ち主のデッキを上から1枚破棄し、そのカードが match に一致していれば true（ライフを守る）。
// keepToHandIfType 指定時は、破棄したカードがその種別なら（守れたかを問わず）トラッシュでなく手札へ加える。
// 「〜できる」は自動適用の簡略化。発生源が複数あっても最初の1つだけを使う（デッキを何度も削らない）
export function tryLifeDamageMillGuard(
    state: GameState,
    defenderPid: PlayerId,
    // アタッカー。attackerFilter を持つ効果（SD02-012 天の城門）が条件に使う
    attacker?: CardInstance,
): boolean {
    const player = state.players[defenderPid]
    for (const source of effectSources(state, defenderPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "lifeDamageMillGuard") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.turn === "own" && defenderPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && defenderPid === state.turnPlayer) continue
            // attackerFilter（SD02-012 天の城門＝「【転召】を持たない相手のLv1スピリットのアタック」）。
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
            const cardId = player.deck.shift()
            if (cardId === undefined) {
                log(state, `${player.name}のデッキが尽きているため、${getCard(source.cardId).name}の効果は発揮されなかった。`)
                return false
            }
            const milled = getCard(cardId)
            const guarded =
                milled.type === effect.match.cardType &&
                (effect.match.color === undefined || milled.colors.includes(effect.match.color))
            // keepToHandIfType（サーガLv2-3）：破棄したカードが指定種別なら手札へ。そうでなければトラッシュへ。
            // keepToHandIfKeyword（SD02-012 天の城門）：そのキーワードを静的に持つときも手札へ
            const toHand =
                (effect.keepToHandIfType !== undefined && milled.type === effect.keepToHandIfType) ||
                (effect.keepToHandIfKeyword !== undefined && hasKeyword(cardId, effect.keepToHandIfKeyword))
            if (toHand) {
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

// BS14-084永久凍土の王都：「自分のライフが0になるとき、このネクサスを自分のトラッシュに置くことで、
// 自分のライフは0にならない」（globalConstraint "ownLifeFloor" の costSelfToTrash 版）。
// 呼び出し側が life<=0 を検知した直後（勝敗確定の直前）に呼ぶ。払わない理由が無い（払わなければ即敗北）ため
// 対話確認を省いた自動払いの簡略化。支払えたら true を返し、life を floor まで戻す（0にはならない）
// 「自分のライフは0にならない」（BS14-084永久凍土の王都）が働いている間は、
// **ライフのコアをコストとして払って0にすることもできない**（2026-09-16 ユーザー確定）。
// 払えばライフが0になる＝床の効果が止めるので、コストを完全に支払えない。
// COST_MODEL.md の一般則「AとBの両方が完全に解決できるときだけ発揮できる」により、その効果は発揮できない。
// 対象は「自分のライフのコアN個を置くことで」を持つ4枚（太陽石の神殿／星鳥クージャ／神獣バーロン／鳳翼の聖剣）
export function lifeCostBlockedByFloor(state: GameState, pid: PlayerId, amount = 1): boolean {
    const player = state.players[pid]
    for (const source of effectSources(state, pid)) {
        if (!player.field.nexuses.some((n) => n.instanceId === source.instanceId)) continue
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "ownLifeFloor") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (player.life - amount < effect.constraint.floor) return true
        }
    }
    return false
}

export function tryOwnLifeFloorByCost(state: GameState, pid: PlayerId): boolean {
    const player = state.players[pid]
    for (const source of effectSources(state, pid)) {
        // 発生源自身がまだフィールドのネクサスにいなければ支払いようがない（既にトラッシュ等）
        const index = player.field.nexuses.findIndex((n) => n.instanceId === source.instanceId)
        if (index === -1) continue
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "ownLifeFloor") continue
            if (!effect.constraint.costSelfToTrash) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            player.field.nexuses.splice(index, 1)
            player.trashCards.push(source.cardId)
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

// kind:"summonedExhaustGrant"（天使長ファニム）：ownerPidのフィールドに、
// 「相手のスピリットは召喚されたとき疲労する」を持つ発生源が有効か（condition.selfRestedは発生源自身が
// 疲労状態のときのみ）。GameEngine.doSummonが召喚した側から見た相手（=このgrantの持ち主）に対して呼ぶ
export function hasSummonedExhaustGrant(state: GameState, ownerPid: PlayerId): boolean {
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "summonedExhaustGrant") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.condition?.selfRested && !source.isRested) continue
            return true
        }
    }
    return false
}

// kind:"attackTriggersAsBlockGrant" の継続付与（BS04ドラグノ近衛兵）：
// 対象スピリットの『アタック時』効果が『ブロック時』へ**移し替え**られているか。
// target:"anyAll" は両陣営のスピリットが対象になりうるので、**両プレイヤーの発生源**を走査する。
// phaseTurn は発生源の持ち主基準で判定する（『相手のアタックステップ』＝発生源の持ち主が非ターンプレイヤー）
// kind:"blockTriggersAsAttackGrant"（BS07大械獣ギガ・テリウム）：
// 対象スピリットの『ブロック時』効果を『アタック時』へ移す継続付与が有効か。
// hasAttackTriggersAsBlock の逆向きで、判定の形はそろえてある
export function hasBlockTriggersAsAttack(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): boolean {
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "blockTriggersAsAttackGrant") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
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
                if (!effectActiveAtLevel(effect.levels, level)) continue
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
                if (effect.keywordFilter && !spiritHasKeyword(state, ownerPid, inst, effect.keywordFilter)) {
                    continue
                }
                return true
            }
        }
    }
    return false
}

// 状態を考慮した系統判定：
//   静的系統（CardData.family） ‖ 持ち主フィールドからの継続付与（kind: "familyGrant"。ポム／生み出される尖兵）
// aura の familyFilter・AuraCounter/EffectCounter の { ownFamily }・keywordGrant の familyFilter は
// すべてこちらを参照する（familyGrant で付与された系統もカウントに含めるため）。

// FamilyFilter（string | string[]）共通の判定ヘルパー：配列指定時はいずれかの系統を持てばよい（OR）。
// aura.familyFilter・AuraCounter の { ownFamily }・bpBuffAll/bpBuff.familyFilter・keywordGrant.familyFilter は
// すべてこちらを参照する（BS04エンジン拡張バッチ1）

// ---- 常時BP修正（オーラ） ----

// フィールド上の指定インスタンスがスピリットとして存在するか

// ---- 制約（ブロック可否など） ----

// 相手の「対象を取る」効果の対象にならないか（クイーン・ワルキューレの常時、
// またはフェザーバリアの一時免疫）。対象自動選択・明示ターゲットの両方で参照する。

// 【装甲：色】：inst が sourceColors の相手効果を受けないか（対象・範囲の両方から参照する）。
// sourceColors が不明（undefined）な場合は装甲を判定できないため false（＝防がない）とする。

// 状態を考慮した色判定：master色 ‖ 一時付与された色（tempColors。アディショナルカラー） ‖
// 継続的な色置換（colorsAsContinuous。百面相のフラットフェイス）

// インスタンスのシンボル数：カードの静的シンボル数 + このターンの間の追加シンボル数（timedExtraSymbols。ダブルハート）。
// GameEngineのライフダメージ計算・magicのownFieldHasMinSymbolSpirit条件・bpBuffのminSymbols対象フィルタが共用する
// （BS04エンジン拡張バッチ1。state/ownerPidは将来の拡張用に受け取るが現状は未使用）

// 【相手のマジックの効果を受けない】（kind: "immunityGrant"、対象 ownAll）：
// ownerPid のフィールド（スピリット＋ネクサス）を走査し、レベル有効・familyFilter一致（省略時は不問）の
// immunityGrant（against: "magic"）を持つ発生源が1つでもあれば、inst は相手のマジックの効果を受けない。
// 呼び出し側は「効果の発生源が実際にマジックか（sourceType === "magic"）」を先に判定してから呼ぶこと
// （装甲の hasArmorAgainst が sourceColors を受け取るのと同じ考え方で、対象側にだけ知識を閉じる）。

// 硝子の女神フレイア：ブロックされなかったアタッカーの実効BPが、発生源（defenderPid側）の
// 実効BP以下のとき、ライフダメージそのものを打ち消すか（kind: "lifeDamageNegate"）。
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
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && defenderPid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && defenderPid === state.turnPlayer) continue
            }
            if (attackerBp <= effectiveBp(state, defenderPid, source)) return true
        }
    }
    return false
}

// このスピリットに効果でコアが置かれるときの追加数（グラーバの coreBonus）。
// コアを置く各アクション（coreCharge / voidCoreToSelf / voidCoreToOther）が参照する。
function coreBonusFor(inst: CardInstance): number {
    const level = currentLevel(inst).level
    let bonus = 0
    for (const e of getCard(inst.cardId).effects) {
        if (e.kind !== "coreBonus") continue
        if (!effectActiveAtLevel(e.levels, level)) continue
        bonus += e.amount
    }
    return bonus
}

// 持ち主のコアステップで得られるコアの追加数（kind: "coreStepBonus"）を集計する。
// フィールド（スピリット＋ネクサス）から発動条件を満たす発生源をすべて合算する
// （ownFieldHasNames指定時は、指定カード名すべてが持ち主のスピリットにそろっているときのみ。ベル・ダンディア）。
// PhaseManagerのコアステップから呼ぶ。
export function coreStepBonusFor(state: GameState, pid: PlayerId): number {
    const player = state.players[pid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    let bonus = 0
    for (const inst of sources) {
        const level = currentLevel(inst).level
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "coreStepBonus") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
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
            bonus += effect.amount
        }
    }
    return bonus
}

// 対象スピリットへ「効果で」コアを置く共通処理。coreBonus（グラーバ）ぶんをボイドから追加する。
// ownerPid: inst の持ち主（checkExhaustOnCoreChange のviaEffect判定に使う。BS05アブソーブシンボル）
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

// ボイドからコアcount個を直接、持ち主のトラッシュに置く（無限に湧くボイドが原資。
// スピリット上のコアを取り除く処理ではないためcheckExhaustOnCoreChangeは呼ばない。
// returnNexusToHandのvoidCoreToOwnTrashIfOpponentと、BS03ブリッツのvoidCoreToOwnTrashが共有する）
export function voidCoreToOwnTrash(state: GameState, ownerPid: PlayerId, count: number): void {
    state.players[ownerPid].trashCores += count
}

// globalConstraint "voidCoreBlockedOutsideCoreStep"（BS10-056蒼天大聖モンゴクウ）：
// お互い、コアステップ以外でボイドからフィールド/リザーブにコアを置けない。ライフ・トラッシュへは対象外
// （voidCoreToOwnTrash / lifeCharge の from:"void" はこれを呼ばない）。
// ボイドから直接置く各アクション（coreGain系／voidCoreToSelf系／voidCoreToOther系／
// voidCoreToAllOwnByFamily／voidCoreToOwnNexuses／voidCoreToTarget／voidCoreToOwnByKeyword／
// voidCoresToNexusLevel／coreDrainAllOthers／destroyのvoidCoreToSelfPerDestroyed）が冒頭で呼ぶ
export function voidCorePlacementBlocked(state: GameState): boolean {
    if (state.phase === "core") return false
    return hasGlobalConstraint(state, "voidCoreBlockedOutsideCoreStep")
}

// フィールド発生源から全スピリット／全ネクサスに効くグローバル制約（kind: "globalConstraint"）が
// 現在有効か判定する。両陣営のフィールド（スピリット＋ネクサス）を走査し、
// レベル条件を満たす該当制約が1つでもあれば true（発生源の持ち主は問わない）。

// 継続的なレベル置換（kind: "levelAs"）を再計算する。
// 全インスタンスの levelAsContinuous を一旦クリアしてから、両陣営フィールドの levelAs 効果を
// 走査して条件成立分を再適用する（毎回全消去→再構築でズレを防ぐ）。
// 発生源自身のレベル判定（sourceMinLevel）は rawLevel（コア数基準・上書き無視）で行い、
// currentLevel の再帰・自己参照を避ける。
// 呼び出し箇所: GameEngine.handleAction の事後フック／ターン開始処理の最後／ゲーム生成直後
// 継続効果で「Lvコスト」が上がった結果、維持コア（Lv1）を下回った個体を消滅させる。
// コアが減ったのではなく**必要なコア数が増えた**ことで起きるので、コアを動かす各所の
// 判定では拾えない。プレイヤーに手番が戻る地点（GameEngine.handleAction の事後フック）で
// まとめて掃除する（BS09-017蛇凰神バァラル。2026-08-14 ユーザー確認）。
// levelCostBonusContinuous が乗っている個体だけを見るので、既存の挙動は変わらない
export function sweepLevelCostDepletion(state: GameState): void {
    for (let guard = 0; guard < 20; guard++) {
        if (state.winner || state.pendingChoice) return
        let destroyed = false
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            for (const inst of [...state.players[pid].field.spirits]) {
                if ((inst.levelCostBonusContinuous ?? 0) === 0) continue
                if (inst.cores >= instMinLevelCores(inst)) continue
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

// destroy/destroyExhausted/exhaust の costFilter 共通判定（BS04エンジン拡張バッチ2）。
// 指定なしは常にtrue、max/minはそれぞれ対象コストの上限/下限

// summonFromHandFree 共通の召喚実行部：指定した手札インデックスのスピリットを、
// 維持コアのみリザーブから払ってフィールドへ配置する（onSummon効果は発揮させない）。
// プレイヤー選択（chosenCardIndex）・自動選択（コスト最大）どちらの経路からも呼ぶ
// コストと「召喚/配置したカードの上に置くコア」をまとめて支払う。
//
// paySources（自分のフィールドのスピリット/ネクサス上のコア）から取ったぶんは、
// **先にコストへ充当し、余りを置くコアへ回す**。コスト充当分はトラッシュへ行き、
// 置くコアに回った分はそのままカードの上へ置かれる（＝トラッシュを経由しない）。
// 不足分はリザーブから支払う。
// 戻り値は「置くコアのうちフィールドから賄えた数」で、呼び出し側はリザーブから引く数を
// maintain - placedFromField にする。
// 支払い後、維持コア（Lv1）を下回った支払い元スピリットは消滅する。
export function payCost(
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

// instanceId から両プレイヤーのフィールドを検索し、対象スピリットと持ち主を返す
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

// 騎獣スレイプホース：マジックによるBPバフ（bpBuff）が対象に適用された直後にフックし、
// 条件を満たせばさらに magicBuffBonus 分のBP+を追加する。
// 効果文の『このスピリットのアタック時』／『自分のアタックステップ』条件は「バトル中または
// 自分のアタックステップ」で近似する簡略化とし、判定は state.phase === "attack" のみとする。
// actions/* の分割モジュールから参照するため export している
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
    // **発生源はスピリットとは限らない**。BS06-085 混迷する魔法実験場（ネクサス）を
    // スピリットだけ走査していたために一度も働かせられていなかった（2026-08-16 修正）。
    // effectSources ならネクサスも、マジックが貸した仮想発生源も含む
    for (const source of effectSources(state, targetOwner)) {
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "magicBuffBonus") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            // 『自分のアタックステップ』限定（BS02-033騎獣スレイプホースLv3）。
            // 上で state.phase === "attack" は確認済みなので、ここでは誰のターンかだけを見る
            if (effect.turn === "own" && targetOwner !== state.turnPlayer) continue
            if (effect.turn === "opponent" && targetOwner === state.turnPlayer) continue
            if (effect.colorFilter && !(srcColors ?? []).includes(effect.colorFilter)) continue
            if (effect.target === "self") {
                if (source.instanceId !== target.instanceId) continue
            } else if (effect.target === "ownAll") {
                // BS06混迷する魔法実験場：対象となった持ち主のスピリットすべて（色不問、発生源自身も含む）
            } else {
                // ownOthers：発生源以外の、持ち主の緑スピリットが対象のときのみ
                if (source.instanceId === target.instanceId) continue
                if (!instHasColor(target, "green")) continue
            }
            recordBp(state, targetOwner, target, effect.amountBonus, "turn")
            log(
                state,
                `${getCard(source.cardId).name}の効果で${getCard(target.cardId).name}はさらにBP+${effect.amountBonus}（ターン終了時まで）。`,
            )
        }
    }
}

// 疲労状態の相手スピリット数（draw / bpBuff の "exhaustedEnemies" カウンタ）
function countExhaustedEnemies(state: GameState, owner: PlayerId, opp: PlayerId, sourceType?: CardType): number {
    return countSpiritsWeighted(state, owner, opp, (s) => s.isRested, sourceType)
}

// selfBuff / bpBuff / voidCoreToSelf / draw / coreGain 共通のカウンタ集計（BS03バッチで統一）。
// readyEnemies / exhaustedEnemies / opponentHand は相手（opponentOf(owner)）基準、
// ownReserve / ownNexuses / ownExhausted / ownOtherSpirits / { ownFamily } / { ownNameIncludes } は
// 自分（owner）のフィールド基準、allNexuses は両者基準、selfCoresAtDestruction は
// self（破壊時点のコア数を destroySpirit が記録済み）基準、lastBattleDestroyedCores は state 直下の記録値
// actions/* の分割モジュールから参照するため export している
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
    if (counter === "readyEnemies") {
        return countSpiritsWeighted(state, owner, opp, (s) => !s.isRested, sourceType)
    }
    if (counter === "exhaustedEnemies") return countExhaustedEnemies(state, owner, opp, sourceType)
    if (counter === "opponentHand") return state.players[opp].hand.length
    if (counter === "ownOtherSpirits") {
        return countSpiritsWeighted(state, owner, owner, (s) => s.instanceId !== self?.instanceId, sourceType)
    }
    if (counter === "ownReserve") return state.players[owner].reserve
    if (counter === "ownLife") return state.players[owner].life
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
        // 両陣営の疲労スピリット数の合計（BS05大甲帝デスタウロス：疲労状態のスピリット1体につき）
        return (
            countSpiritsWeighted(state, owner, owner, (s) => s.isRested, sourceType) +
            countExhaustedEnemies(state, owner, opp, sourceType)
        )
    }
    if (counter === "selfCoresAtDestruction") return self?.coresAtDestruction ?? 0
    if (counter === "lastBattleDestroyedCores") return state.lastBattleDestroyedCores
    if (counter === "lastBattleDestroyedCost") return state.lastBattleDestroyedCost
    // selfBofuCount：selfの【暴風】静的keywordの指定数のみ（ボーナス・ブレイヴ合流は見ない。
    // 旧voidCoreToSelfPerBofuCountHandlerと同じ値に揃える。bofuCountFor（実効指定数）とは別軸）
    if (counter === "selfBofuCount") {
        if (!self) return 0
        const level = currentLevel(self).level
        const entry = getCard(self.cardId).effects.find(
            (e) => e.kind === "keyword" && e.keyword === "bofu" && effectActiveAtLevel(e.levels, level),
        )
        return entry && entry.kind === "keyword" ? (entry.count ?? 1) : 0
    }
    if (counter === "opponentTrashCores") return state.players[opp].trashCores
    // selfSymbols：このスピリット（self）自身が持つシンボル数（BS05碧緑の竜使いグリューン）
    if (counter === "selfSymbols") {
        if (!self) return 0
        // 合体中のブレイヴが発生源のときは、**合体スピリット全体**のシンボル数を数える
        // （合体中は1体として扱う。2026-09-02 ユーザー確認。BS11-052 魔銃ヴェスパー）。
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
    // BS09-018暗空の勇者皇ザンバ：「このスピリットのLvと同じ個数」
    if (counter === "selfLevel") return self ? currentLevel(self).level : 0
    if (counter === "burstEventCost") return state.burstEventCost ?? 0
    if (counter === "lastMoved") return state.lastMoved?.length ?? 0
    // BS13-020ブッシュベイベ：「このスピリット上のコア1個につき」
    if (counter === "selfCores") return self?.cores ?? 0
    // targetSymbols：対象を選んだ後に logic/counted.ts が数えるため、このカウンタが直接ここに来ることは無い
    // （マジックはself=nullで対象基準のため。フォールスルー防止のためのプレースホルダ。BS06サベージパワー）
    if (counter === "targetSymbols") return 0
    // targetSameFamilyOwn も同様（logic/counted.ts が対象を選んだ後に数える。SD02-015 フレンドリーパワー）
    if (counter === "targetSameFamilyOwn") return 0
    // restedEnemyNexuses：相手の疲労状態のネクサス数（BS09-080エグゾーストネクサス）
    if (counter === "restedEnemyNexuses") {
        return state.players[opp].field.nexuses.filter((n) => n.isRested).length
    }
    // ownRestedNexuses：自分の疲労状態のネクサス数（【強襲】がネクサスを疲労させる。BS07ネクサスアタック）
    if (counter === "ownRestedNexuses") {
        return state.players[owner].field.nexuses.filter((n) => n.isRested).length
    }
    // 直前の【粉砕】で破棄した総枚数／うちスピリットカードの枚数（resolveFunsaiが記録。BS03巨人王ランドルフ／BS04二刀流のアムブローズ）
    if (counter === "lastFunsaiTotal") return state.lastFunsai?.total ?? 0
    if (counter === "lastFunsaiSpirits") return state.lastFunsai?.spirits ?? 0
    // ownCombinedSpirits：自分のフィールドの合体スピリット数（BS10-029木星神龍ノブナガード・ゼウシス）
    if (counter === "ownCombinedSpirits") {
        return state.players[owner].field.spirits.filter((s) => instIsCombined(s)).length
    }
    // ownBraveSpirits：自分のフィールドでスピリット状態のブレイヴ数（BS12-004ドラゴン・フェゼント）
    if (counter === "ownBraveSpirits") {
        return state.players[owner].field.spirits.filter((s) => getCard(s.cardId).type === "brave").length
    }
    // battlingOpponentCombinedSymbols：selfが参加しているバトルの相手側が合体スピリットのときだけそのシンボル数（BS12-036星犬ポメラン）
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
    // battlingOpponentSymbols：battlingOpponentCombinedSymbolsの合体限定を外した版（BS13-056ホーク・ブレイカー【合体時】）
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
    // { ownKeyword: Keyword }：自分フィールドで指定キーワードを持つスピリット数（BS05双剣虎ジェン・フー）
    if ("ownKeyword" in counter) {
        return countSpiritsWeighted(
            state,
            owner,
            owner,
            (s) => spiritHasKeyword(state, owner, s, counter.ownKeyword),
            sourceType,
        )
    }
    // { ownNameIncludes: string }：自分フィールドで、カード名に指定文字列を含むスピリット数
    if ("ownNameIncludes" in counter) {
        return countSpiritsWeighted(
            state,
            owner,
            owner,
            (s) => cardNameContains(s, counter.ownNameIncludes),
            sourceType,
        )
    }
    // { anyNameIncludes: string }：両陣営のフィールドで、カード名に指定文字列を含むスピリット数
    // （ownNameIncludesの両陣営版。BS06アルカナナイト・ヘクス：修飾なしの「スピリット1体につき」）
    if ("anyNameIncludes" in counter) {
        return (
            countSpiritsWeighted(state, owner, "p1", (s) => cardNameContains(s, counter.anyNameIncludes), sourceType) +
            countSpiritsWeighted(state, owner, "p2", (s) => cardNameContains(s, counter.anyNameIncludes), sourceType)
        )
    }
    // { ownColor: Color }：自分フィールドの指定色スピリット数
    if ("ownColor" in counter) {
        return countSpiritsWeighted(state, owner, owner, (s) => instHasColor(s, counter.ownColor), sourceType)
    }
    // { enemyCost: {max,min} }：相手フィールドのコスト条件を満たすスピリット数（BS07バジリザード）。
    // 道化師クランの付与コストも見る（instMatchesCostFilter）
    if ("enemyCost" in counter) {
        return countSpiritsWeighted(
            state,
            owner,
            opp,
            (s) => instMatchesCostFilter(s, counter.enemyCost),
            sourceType,
        )
    }
    // { ownNexusColor: Color }：自分フィールドの指定色ネクサス数（BS03武器コレクターのゴドフリー）
    if ("ownNexusColor" in counter) {
        return state.players[owner].field.nexuses.filter((n) =>
            instHasColor(n, counter.ownNexusColor),
        ).length
    }
    // { ownNexusNameIncludes: string }：自分フィールドで、カード名に指定文字列を含むネクサス数
    // （同名重複もそのまま数える。BS13-045巨人船長イアソンLv2：「古代戦艦」ネクサス1つにつき）
    if ("ownNexusNameIncludes" in counter) {
        return state.players[owner].field.nexuses.filter((n) =>
            cardNameContains(n, counter.ownNexusNameIncludes),
        ).length
    }
    // { ownColorSymbols: Color }：自分フィールドの指定色シンボルの合計数。
    // **ネクサスのシンボルも数える**（2026-08-20 修正。以前は field.spirits だけを見ていたため
    // BS04-X16機動要塞キャッスル・ゴレム「自分の青シンボル1つにつき」がネクサス分を取りこぼしていた）。
    // 軽減計算と同じ countSymbols に寄せることで、symbolFix によるシンボル固定・バウンス待機の除外・
    // 付与色（colorAs / tempColors）の扱いもまとめて揃う
    if ("ownColorSymbols" in counter) {
        return countSymbols(state.players[owner], [counter.ownColorSymbols])
    }
    // { ownFamily: string | string[] }：自分のフィールドの指定系統スピリット数（familyGrant による付与も含む）。
    // 配列＝いずれかの系統でOR（BS10-X02双魚賊神ピスケガレオン：「光導」/「星魂」）
    // （onDestroy等で発火する場合、selfはこの時点ですでにフィールドから除去済みのため含まれない）
    const wantedFamilies = Array.isArray(counter.ownFamily) ? counter.ownFamily : [counter.ownFamily]
    return state.players[owner].field.spirits.filter((s) =>
        wantedFamilies.some((f) => spiritHasFamily(state, owner, s, f)),
    ).length
}

// 効果ドロー倍化（封印された魔導書）：owner のフィールドにレベル有効かつ phaseTurn 一致の
// kind:"drawDouble" があれば2を返す（重複しない＝複数あっても2倍まで）。
// draw アクションの枚数確定箇所からのみ参照する（deckReveal・通常のドローステップは対象外）
export function drawDoubleMultiplier(state: GameState, owner: PlayerId): number {
    const player = state.players[owner]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "drawDouble") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (state.phase !== effect.phaseTurn.phase) continue
            if (effect.phaseTurn.turn === "own" && owner !== state.turnPlayer) continue
            return 2
        }
    }
    return 1
}

// 効果アクションを実行する。
//   owner = 効果の使用者、self = 効果の発生源スピリット（マジックは null）
//   sourceColors = 効果発生源の色（装甲判定用）。省略時は self のカード色から求める（マジックは呼び出し側で明示する）
//   sourceCardId = 発生源のカードID。省略時は self.cardId から求める。マジックはselfがnullのため
//     resolveMagicが明示的にcard.cardIdを渡す（lendSelfThisTurn専用。TURN_EFFECT_SOURCES.md §3.3）

// ── 「効果でコアが置かれた」の検出（fieldEvent "opponentCorePlaced"。SD01-029 蠢く地下墓地Lv1）──
// docs/design/EFFECT_SOURCE_CONTEXT.md
//
// コアが増える箇所はエンジン中に28箇所あり、そのすべてに通知を足すと必ず書き漏れる
// （RESUME_STACK.md §5(a) と同じ「呼び出し元が対応していない」問題）。
// 代わりに resolveAction の**1箇所**で、効果1つの前後にコアの居場所を突き合わせる。
//
// 「置いた」の数え方は**増えた側だけの合計**にする。効果文が出所を限定していないため、
// リザーブからスピリットへ移したものも、スピリットからスピリットへ移したものも1個と数える
// （2026-08-16 ユーザー確認）。減った側を差し引くと移動が0個になってしまうので引かない。
type CorePlaces = Record<PlayerId, { reserve: number; byInstance: Map<string, number> }>

// 監視するカードが1枚も場に無いなら、スナップショット自体を省く（毎アクション走るため）
function hasCorePlacedWatcher(state: GameState): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
            for (const effect of getCard(inst.cardId).effects) {
                if (effect.kind === "fieldEvent" && effect.event === "opponentCorePlaced") return true
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
        snap[pid] = { reserve: player.reserve, byInstance }
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
        if (placed <= 0) continue
        fireFieldEventTriggers(state, opponentOf(pid), "opponentCorePlaced", undefined, undefined, undefined, placed)
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
): void {
    if (self !== null && state.summonEffectSource?.instanceId === self.instanceId) state.summonEffectSource.resolved = true
    const opp = opponentOf(owner)
    const sourceName = self ? getCard(self.cardId).name : "効果"
    const srcColors = sourceColors ?? (self ? instColors(self) : undefined)
    // マジック効果耐性（ポークン）判定用。self があればそのカード種別（マジックはself=nullなので
    // 呼び出し側=resolveMagicが明示的に"magic"を渡す）
    const srcType = sourceType ?? (self ? getCard(self.cardId).type : undefined)
    const srcCardId = sourceCardId ?? (self ? self.cardId : undefined)
    // 相手スピリットを破壊する際に渡す破壊コンテキスト（reviveOnDestroy判定用）。
    // exactOptionalPropertyTypes対応：srcTypeがundefinedのときはプロパティ自体を省略する
    const destroyContext: DestroyContext = {
        sourcePid: owner,
        ...(srcType !== undefined ? { sourceType: srcType } : {}),
        // 発生源の色（「相手の**赤の**スピリット/マジックの効果では破壊されない」の判定用。SD01-032 機械神の加護）
        ...(srcColors !== undefined ? { sourceColors: srcColors } : {}),
        // 発生源インスタンス（「その効果を発揮したスピリット」を対象にする軸用。BS10-012アントイーター/BS10-014闇騎士マリス）
        ...(self ? { sourceInstanceId: self.instanceId } : {}),
    }

    // アクション本体は server/src/logic/actions/ のドメイン別モジュールに分割されている。
    // ACTION_HANDLERS は ActionRegistry（全 EffectAction.type を網羅）として型付けされているため、
    // ハンドラの書き漏れはコンパイル時に検出される
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
    const handler = ACTION_HANDLERS[action.type] as (c: ActionCtx, a: EffectAction) => void
    // いま解決中の効果の発生源を state に載せる（docs/design/EFFECT_SOURCE_CONTEXT.md）。
    // 「**相手の〈色〉の効果で**〜されたとき」（fieldEvent.sourceColorFilter）が読む。
    // ネストした resolveAction は自分の値で上書きし、抜けるときに前の値へ戻す
    const outerEffectSource = state.currentEffectSource
    const isOutermostEffect = outerEffectSource === undefined
    state.currentEffectSource = {
        pid: owner,
        ...(srcType !== undefined ? { type: srcType } : {}),
        ...(srcColors !== undefined ? { colors: srcColors } : {}),
        // BS15共通器：selfが確定しているときだけ発生源インスタンスを載せる（BS15-042オリンピアの天使アラトロンLv2）
        ...(self !== null && self !== undefined ? { instanceId: self.instanceId } : {}),
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
//
// 4640行まで肥大化したため「イベント発火」セクションを triggers.ts へ移した。
// **呼び出し側（57ファイル）を変えずに済むよう、ここから再エクスポートする。**
// 相互 import になるが、GameState.ts ↔ EffectModules.ts と同じ CommonJS の循環requireで安全に動く
export {
    isTriggerSuppressed,
    fireSummonTrigger,
    fireTrigger,
    fireCombinedAttackTrigger,
    fireBattleWonTriggers,
    fireStepTriggers,
    fireFieldEventTriggers,
    notifyHandGained,
    notifyNexusDeployed,
    fireNexusDeployed,
    applyBothSidesRedirectToCandidates,
    bothSidesPids,
    bothSidesRedirectKeepPid,
    battleBp,
    applyJugekiCoreToVoid,
    notifySpiritCoresRemovedByOpponent,
    findMagicNegateSource,
    resolveMagic,
    applyMagicRedirectChoice,
    applyMagicSideChoice,
    applyMagicRepeatChoice,
    applyMagicNegateChoice,
    declineMagicNegateChoice,
    revertOncePerTurn,
    revertDestroyGroupUsage,
} from "./triggers"

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
    bpBuffTargetPasses,
    pickBpBuffTarget,
    pickOwnKeywordTarget,
    requestActivationConfirm,
    requestChoice,
    requestCardChoice,
} from "./targeting"
export { placeBurst, finishBurstActivation, fireOwnBurstActivated } from "./keywords/burst"
export { fireSummonSequence, summonFreeFromHandIndex, summonFreeFromTrashIndex } from "./summon"
