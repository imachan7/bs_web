// キーワード効果・誘発効果ハンドラの集約と実行
//
// 設計（data.md 5章の3層構成）:
//   - イベント層: TriggerEvent（onSummon など）を起点に発火する
//   - 効果データ層: カードの effects 配列（EffectDef）
//   - ハンドラ層: キーワードはレジストリ、アクションは resolveAction で解決
// 新キーワード／新アクションは「型を足す → ここにハンドラを足す」で完結する。
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

// globalConstraint "millCap"（BS05エターナルシールド）：pid自身のeffectSources（フィールド＋
// このターンの仮想発生源。lendSelfThisTurnで貸与可）を走査し、レベル有効な millCap のうち
// 最も厳しい（小さい）maxCountを返す（無ければInfinity）。ownNexusIndestructibleと同じく
// 発生源の持ち主のみに効く制約のため、両陣営を見るhasGlobalConstraintとは別の専用判定にしている
function millCapFor(state: GameState, pid: PlayerId): number {
    let cap = Infinity
    const sources = effectSources(state, pid)
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "millCap") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            cap = Math.min(cap, effect.constraint.maxCount)
        }
    }
    return cap
}

// globalConstraint "millCap" の perTurn:true 版（BS04侵されざる聖域Lv2）：pidのデッキが
// 相手の効果によって「このターンあと何枚まで」破棄可能かを返す（state.millCountThisTurnで累計管理。
// 無ければInfinity）。millCapForは1回のミル呼び出しあたりの上限（perTurn省略時）を返す既存の判定で、
// 両者は独立に適用する（perTurn:trueのエントリはmillCapForの対象にもなるため、1回のミルでも
// ターン上限を超える枚数は自動的に制限される）
function millCapPerTurnRemaining(state: GameState, pid: PlayerId): number {
    let remaining = Infinity
    const usedSoFar = state.millCountThisTurn[pid] ?? 0
    const sources = effectSources(state, pid)
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "millCap") continue
            if (!effect.constraint.perTurn) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            remaining = Math.min(remaining, effect.constraint.maxCount - usedSoFar)
        }
    }
    return Math.max(remaining, 0)
}

// バトルをしている両陣営のスピリット上のコアは、globalConstraint "battlingCoresProtected" が
// 有効な発生源が両陣営のフィールドにあれば効果によって取り除かれない（BS05茨の決戦地Lv1-2）。
// phase/turnはEffectDef側（globalConstraintエントリ自身）が持つ（発生源の持ち主基準のturn判定）
function isBattlingCoreProtected(state: GameState, inst: CardInstance): boolean {
    if (!isInCurrentBattle(state, inst)) return false
    return hasActiveGlobalConstraint(state, "battlingCoresProtected")
}

// globalConstraint "coreFloorByCost"（BS08聖なる柱状彫刻）：有効な発生源があれば、スピリット上のコアは
// そのカードのコスト（Lv1コスト）を下回るまで取り除けない。ネクサスは対象外（カードに「コスト」はあるが
// 効果文は「スピリットすべて」なのでtype==="spirit"のみに適用）。
// **簡略化**：removeCores/removeCoresToTrash/removeCoresToVoid（単体除去の共通処理）だけが尊重する。
// coreSqueezeAll/One・bothSidesCoreToTrash/Void・moveCoresLeavingOne・swapOpponentCores等、
// .coresを直接書き換える範囲効果はこの下限を見ない（data/card-notes.jsonに明記）
function coreFloorFor(state: GameState, inst: CardInstance): number {
    const card = getCard(inst.cardId)
    if (card.type !== "spirit") return 0
    if (!hasActiveGlobalConstraint(state, "coreFloorByCost")) return 0
    return card.cost
}

// 指定インスタンスが今まさにバトルの当事者（アタッカーかブロッカー）か
function isInCurrentBattle(state: GameState, inst: CardInstance): boolean {
    if (!state.battle) return false
    return (
        inst.instanceId === state.battle.attackerInstanceId ||
        inst.instanceId === state.battle.blockerInstanceId
    )
}

// 両陣営のフィールドに、指定タイプの globalConstraint が有効な発生源があるか。
// phase/turn は EffectDef 側（globalConstraint エントリ自身）が持つ（発生源の持ち主基準の turn 判定）
function hasActiveGlobalConstraint(state: GameState, type: string): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const sources = [...state.players[pid].field.spirits, ...state.players[pid].field.nexuses]
        for (const source of sources) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== type) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                return true
            }
        }
    }
    return false
}

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
    // ① 対象の絞り込み（マジック限定。絞り込み先の持ち主のスピリットだけが影響を受ける）
    const redirect = state.magicRedirectTo
    if (
        redirect !== undefined &&
        attempt.sourceType === "magic" &&
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
            // 支払えないなら受ける（手札が足りないときは耐性が成立しない）
            if (player.hand.length < effect.discardCount) continue
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

export function checkExhaustOnCoreChange(
    state: GameState,
    affectedPid: PlayerId,
    affectedInst: CardInstance,
    opts: { viaEffect: boolean; isRemoval: boolean } = { viaEffect: false, isRemoval: false },
): void {
    if (affectedInst.isRested) return
    // 発生源は「対象から見た相手」側が既定（夢魔の寝所／魔影街）。
    // scope:"any" の効果（ルビーの太陽Lv2＝陣営の指定が無い）は対象自身の陣営からも効く
    const sourcePids: PlayerId[] = [opponentOf(affectedPid), affectedPid]
    for (const sourcePid of sourcePids) {
        for (const source of effectSources(state, sourcePid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "exhaustOnManualCoreAdd") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (sourcePid === affectedPid && effect.scope !== "any") continue
                const wantsEffect = effect.trigger === "effect"
                if (wantsEffect !== opts.viaEffect) continue
                if (opts.isRemoval && !effect.onRemove) continue
                if (!opts.viaEffect && !effect.anyPhase && state.phase !== "main") continue
                if (effect.colorFilter !== undefined && !instHasColor(affectedInst, effect.colorFilter)) continue
                log(
                    state,
                    `${getCard(source.cardId).name}の効果で、${getCard(affectedInst.cardId).name}は疲労した。`,
                )
                exhaustSpirit(state, affectedPid, affectedInst)
                return
            }
        }
    }
}

// スピリットを疲労させる唯一の入口。すでに疲労していれば何もしない（誘発も起きない）。
// 実際に疲労したときだけ「疲労したとき」のフィールドイベントを発火する。
// アタック宣言・ブロック宣言・効果による疲労のいずれもここを通す
// （疲労の代入が13箇所に散っていて誘発点が無かったのを 2026-08-07 に一元化）。
export function exhaustSpirit(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    // 【暴風】の効果による疲労のとき、その【暴風】の持ち主を渡す。
    // 記録（BS06颶風高原Lv2）と "ownBofuExhausted" の発火（BS06ミストラルコア）に使う
    bofuSourcePid?: PlayerId,
): void {
    if (inst.isRested) return
    inst.isRested = true
    if (bofuSourcePid !== undefined && ownerPid !== bofuSourcePid) {
        state.bofuExhaustedThisBattle.push({ pid: ownerPid, instanceId: inst.instanceId })
        fireFieldEventTriggers(state, bofuSourcePid, "ownBofuExhausted", { pid: ownerPid, inst })
    }
    fireExhaustedTriggers(state, ownerPid, inst)
}

// スピリットを回復させる唯一の入口。すでに回復状態なら何もしない（誘発も起きない）。
// 実際に回復したときだけ「このスピリットが回復したとき」（onRefreshed）を発火する。
// リフレッシュステップ・効果による回復・【強襲】のいずれもここを通す
// （疲労を exhaustSpirit に一元化したのと同じ理由で、2026-08-09 に11箇所から集約した。BS07）
export function refreshSpirit(state: GameState, ownerPid: PlayerId, inst: CardInstance): void {
    if (!inst.isRested) return
    inst.isRested = false
    fireTrigger(state, ownerPid, inst, "onRefreshed")
}

// 「スピリットが疲労したとき」のフィールドイベント発火。
// ownSpiritExhausted は持ち主のフィールドから、anySpiritExhausted は両者のフィールドから
// （anyNexusDestroyed / ownNexusDestroyed と同じ組み合わせ）。self には疲労したスピリットを渡す。
// アタック宣言の疲労だけは、アタッカーが効果で消滅したときの「バトル不成立」判定を既存のガードに
// 任せるため doAttack 側で明示的にこの関数を呼んでいる（exhaustSpirit は経由しない）
export function fireExhaustedTriggers(state: GameState, ownerPid: PlayerId, inst: CardInstance): void {
    // 疲労したスピリットのコスト（道化師クランの付与コストも含む）を costFilter 用に渡す
    const eventInfo = { costs: instAllCosts(inst) }
    const colors = instColors(inst)
    if (state.winner) return
    fireFieldEventTriggers(state, ownerPid, "ownSpiritExhausted", { pid: ownerPid, inst }, colors, undefined, undefined, eventInfo)
    if (state.winner) return
    fireFieldEventTriggers(state, ownerPid, "anySpiritExhausted", { pid: ownerPid, inst }, colors, undefined, undefined, eventInfo)
    if (state.winner) return
    fireFieldEventTriggers(state, opponentOf(ownerPid), "anySpiritExhausted", { pid: ownerPid, inst }, colors, undefined, undefined, eventInfo)
}

// スクルディア：相手のスピリットから「回復できない」と指定されていて、
// その指定元が**疲労状態で持ち主のフィールドにいる**間は、リフレッシュステップで回復しない
export function isRefreshBlockedByMark(state: GameState, pid: PlayerId, inst: CardInstance): boolean {
    return state.players[opponentOf(pid)].field.spirits.some(
        (s) => s.isRested && s.noRefreshTargetInstanceId === inst.instanceId,
    )
}

// 【粉砕】: デッキ上から count 枚を持ち主のトラッシュへ送る（不足時はある分だけ）。
// デッキが0枚になっても敗北にはしない（敗北は既存どおりドロー不能時のみ、drawで判定）。
// actorPid（このミルを引き起こした実行者）を渡すと、actorPid !== pid（相手の効果による）のときのみ
// millCapFor(pid) の上限で count をクランプする（BS05エターナルシールド。自分自身のミル＝粉砕を
// 自分のデッキに向ける等では上限を適用しない。省略時は従来どおり上限なし）。
// 戻り値は実際に破棄した枚数（ownFunsaiMilledの発火判定・repeatPerCountに使う）
export function millDeck(
    state: GameState,
    pid: PlayerId,
    count: number,
    actorPid?: PlayerId,
    cause?: { sourceType?: "spirit" | "nexus" | "magic"; funsai?: true },
    // skipNegate: kind:"deckMillNegate" の確認で「無効にしない」が選ばれたあとの破棄。
    // 再び確認待ちへ積んで無限に確認を出すのを防ぐ（destroySpirit の skipRevive と同型）
    options?: { skipNegate?: true },
): number {
    let effectiveCount = count
    const byOpponent = actorPid !== undefined && actorPid !== pid
    // 「自分のデッキは破棄されない」（BS06ディスコンティニュー／BS08鳳翼の聖剣）。
    // millCap と同じく**相手の効果による破棄だけ**を止める（自分のコスト支払い等は通す）
    if (byOpponent && isDeckMillBlocked(state, pid)) {
        log(state, `${state.players[pid].name}のデッキは破棄されなかった。`)
        return 0
    }
    // 「コストを払って破棄を無効に**できる**」（BS08鳳翼の聖剣Lv2）。
    // 任意コストなので、ここでは破棄を見送って確認待ちへ積むだけにする（実際の破棄は断られたときに行う）
    if (byOpponent && !options?.skipNegate && tryQueueDeckMillNegate(state, pid, count, actorPid, cause)) {
        return 0
    }
    if (byOpponent) {
        effectiveCount = Math.min(effectiveCount, millCapFor(state, pid))
        // ターン累計の上限（BS04侵されざる聖域Lv2：ターンに5枚まで）
        effectiveCount = Math.min(effectiveCount, millCapPerTurnRemaining(state, pid))
    }
    const player = state.players[pid]
    const actual = Math.min(effectiveCount, player.deck.length)
    const milled: string[] = []
    for (let i = 0; i < actual; i++) {
        const cardId = player.deck.shift()
        if (cardId === undefined) break
        player.trashCards.push(cardId)
        milled.push(cardId)
    }
    log(state, `${player.name}のデッキを上から${actual}枚トラッシュへ送った。`)
    if (actorPid !== undefined && actorPid !== pid && actual > 0) {
        state.millCountThisTurn[pid] = (state.millCountThisTurn[pid] ?? 0) + actual
    }
    // 「相手のデッキを一度に◯枚以上破棄したとき」（アリゲイド）：破棄された側の相手のフィールドから発火する。
    // eventCount には実破棄枚数を渡し、minEventCount で閾値判定する
    if (actual > 0 && !state.winner) {
        fireFieldEventTriggers(state, opponentOf(pid), "opponentDeckMilled", undefined, undefined, undefined, actual)
    }
    // 破棄されたカード自身の『デッキから破棄されたとき』（kind:"onMilledFromDeck"）。
    // 上のフィールド誘発の**後**に処理する（破棄そのものは先に確定させる）
    if (byOpponent && milled.length > 0 && !state.winner) {
        resolveMilledFromDeck(state, pid, milled, cause)
        // 破棄されたマジックを手元へ（BS06混迷する魔法実験場Lv2）。
        // カード自身の効果（onMilledFromDeck）の方が優先なので、その解決の**後**に残りを拾う
        collectMilledMagicToTegamoto(state, pid, milled)
    }
    return actual
}

// kind:"milledMagicToTegamoto"（BS06混迷する魔法実験場Lv2）：破棄されたマジックカードを
// トラッシュから手元(tegamoto)へ移し、手札同様に使用できるものとして記録する
function collectMilledMagicToTegamoto(state: GameState, pid: PlayerId, milled: string[]): void {
    const active = effectSources(state, pid).some((source) =>
        getCard(source.cardId).effects.some(
            (e) =>
                e.kind === "milledMagicToTegamoto" &&
                effectActiveAtLevel(e.levels, currentLevel(source).level),
        ),
    )
    if (!active) return
    const player = state.players[pid]
    const moved: string[] = []
    for (const cardId of milled) {
        if (getCard(cardId).type !== "magic") continue
        const idx = player.trashCards.lastIndexOf(cardId)
        if (idx === -1) continue // onMilledFromDeck が先に取り除いたカード
        player.trashCards.splice(idx, 1)
        player.tegamoto.push(cardId)
        player.tegamotoPlayable.push(cardId)
        moved.push(getCard(cardId).name)
    }
    if (moved.length > 0) {
        log(
            state,
            `${player.name}は、破棄されたマジックカード${moved.length}枚（${moved.join("、")}）をオープンして手元に置いた。`,
        )
    }
}

// 「自分のデッキは破棄されない」（globalConstraint "noDeckMillByOpponent"）が pid に対して有効か。
// millCapFor と同じく **pid 自身のフィールド（＋このターンの仮想発生源）** だけを見る
function isDeckMillBlocked(state: GameState, pid: PlayerId): boolean {
    for (const source of effectSources(state, pid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "noDeckMillByOpponent") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // 「このネクサスが配置されたターンの間」（BS08鳳翼の聖剣）
            if (effect.constraint.whileSourceDeployedTurnOnly && source.summonedTurn !== state.turn) continue
            return true
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

// kind:"deckMillNegate"（BS08鳳翼の聖剣Lv2）：この破棄を無効にできる発生源を探す。
// 見つかったら [発生源, エントリ] を返す。**支払えないなら候補にしない**（確認を出しても意味がないため）
function findDeckMillNegate(
    state: GameState,
    pid: PlayerId,
    cause?: { sourceType?: "spirit" | "nexus" | "magic"; funsai?: true },
): { source: CardInstance; effect: Extract<EffectDef, { kind: "deckMillNegate" }> } | null {
    for (const source of effectSources(state, pid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "deckMillNegate") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // 「相手の**スピリット**の効果で」。種別が渡っていない呼び出しでは、
            // onMilledFromDeck と同じく限定を緩めない側に倒して発火させない
            if (effect.by === "opponentSpiritEffect" && cause?.sourceType !== "spirit") continue
            // 「【粉砕】以外の」（【粉砕】は resolveFunsai だけが cause.funsai を立てる）
            if (effect.exceptFunsai && cause?.funsai === true) continue
            if (state.players[pid].life < effect.costOwnLifeToReserve) continue
            return { source, effect }
        }
    }
    return null
}

// 破棄を見送って確認待ちへ積む。積んだ（＝この破棄を保留した）なら true。
// 非対話（smoke）では確認を出せないので、その場で支払って無効にする（「〜できる」を常に発動する簡略化）
function tryQueueDeckMillNegate(
    state: GameState,
    pid: PlayerId,
    count: number,
    actorPid: PlayerId,
    cause?: { sourceType?: "spirit" | "nexus" | "magic"; funsai?: true },
): boolean {
    if (count <= 0 || state.winner) return false
    const found = findDeckMillNegate(state, pid, cause)
    if (!found) return false
    if (!state.interactiveTargets) {
        payDeckMillNegateCost(state, pid, found.source, found.effect)
        return true
    }
    ;(state.pendingDeckMillNegates ??= []).push({
        pid,
        sourceInstanceId: found.source.instanceId,
        effectId: found.effect.id,
        count,
        actorPid,
        ...(cause?.sourceType ? { sourceType: cause.sourceType } : {}),
    })
    return true
}

// 無効化のコスト（ライフのコアN個を持ち主のリザーブへ）を支払い、無効になった旨をログに出す
function payDeckMillNegateCost(
    state: GameState,
    pid: PlayerId,
    source: CardInstance,
    effect: Extract<EffectDef, { kind: "deckMillNegate" }>,
): void {
    const player = state.players[pid]
    const paid = effect.costOwnLifeToReserve
    player.life -= paid
    player.reserve += paid
    log(
        state,
        `${getCard(source.cardId).name}：${player.name}はライフのコア${paid}個をリザーブに置き、デッキの破棄を無効にした。（残りライフ${player.life}）`,
    )
}

// 保留していた「デッキ破棄の無効化」の確認で、承認されたときの処理。
// 発生源が場を離れている／ライフが足りなくなっているなら無効にできないので、見送っていた破棄を行う
export function applyDeckMillNegate(
    state: GameState,
    entry: NonNullable<PendingChoice["deckMillNegate"]>,
): void {
    const source = effectSources(state, entry.pid).find((s) => s.instanceId === entry.sourceInstanceId)
    const effect = source
        ? getCard(source.cardId).effects.find(
              (e): e is Extract<EffectDef, { kind: "deckMillNegate" }> =>
                  e.kind === "deckMillNegate" && e.id === entry.effectId,
          )
        : undefined
    if (!source || !effect || state.players[entry.pid].life < effect.costOwnLifeToReserve) {
        declineDeckMillNegate(state, entry)
        return
    }
    payDeckMillNegateCost(state, entry.pid, source, effect)
}

// 同上、断られたときの処理。見送っていた破棄をここで行う（skipNegate で確認の再入を防ぐ）
export function declineDeckMillNegate(
    state: GameState,
    entry: NonNullable<PendingChoice["deckMillNegate"]>,
): void {
    millDeck(
        state,
        entry.pid,
        entry.count,
        entry.actorPid,
        entry.sourceType ? { sourceType: entry.sourceType } : undefined,
        { skipNegate: true },
    )
}

// 破棄されたカードのうち kind:"onMilledFromDeck" を持つものを解決する。
// 発火したカードは**トラッシュから取り除いてから**処理する（マジックは即時発揮、ネクサスは無償配置）
function resolveMilledFromDeck(
    state: GameState,
    pid: PlayerId,
    milled: string[],
    cause?: { sourceType?: "spirit" | "nexus" | "magic" },
): void {
    const player = state.players[pid]
    for (const cardId of milled) {
        for (const effect of getCard(cardId).effects) {
            if (effect.kind !== "onMilledFromDeck") continue
            // 「相手の**スピリット**の効果で」（BS08鳳翼の聖剣）は発生源の種別まで一致を要求する。
            // 種別が渡っていない呼び出しでは、限定を緩めない側に倒して発火させない
            if (effect.by === "opponentSpiritEffect" && cause?.sourceType !== "spirit") continue
            const idx = player.trashCards.lastIndexOf(cardId)
            if (idx === -1) continue
            player.trashCards.splice(idx, 1)
            const name = getCard(cardId).name
            if (effect.then === "deployThisNexusFree") {
                const inst = createInstance(cardId, state.turn, 0)
                player.field.nexuses.push(inst)
                log(state, `${player.name}の${name}は、デッキから破棄されたためコストを支払わずに配置された。`)
                notifyNexusDeployed(state, pid)
            } else {
                log(state, `${player.name}の${name}は、デッキから破棄されたためコストを支払わずに発揮された。`)
                // 破棄されたマジックは「使用」ではなく効果だけが発揮される。トラッシュへは既に入れてあるので、
                // resolveMagic を通さず効果本体だけを解決する（コスト・無効化・使用時誘発を挟まない）
                player.trashCards.push(cardId)
                resolveMagicEffects(state, pid, cardId, "flash", undefined)
            }
            break
        }
    }
}

// 持ち主フィールドの funsaiBonus（崩壊する戦線／デモリッシュ）合計：【粉砕】の破棄枚数に加算する。
// effectSources() でこのターンだけの仮想発生源（マジックが貸した継続効果。lentOnly。BS06デモリッシュ）も含める
function funsaiBonusTotal(state: GameState, ownerPid: PlayerId): number {
    let total = 0
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "funsaiBonus") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // amountPerSymbolColor（BS08神造巨兵オリハルコン・ゴレム）：固定amountの代わりに、
            // 持ち主のフィールドが持つ指定色のシンボル総数を動的に加算する
            total += effect.amountPerSymbolColor
                ? countSymbols(state.players[ownerPid], [effect.amountPerSymbolColor])
                : (effect.amount ?? 0)
        }
    }
    return total
}

// 持ち主フィールドの millCapBonus（BS06マキシマムブレイク）合計：millPer.cap の上限値に加算する。
// funsaiBonusTotal と同じ考え方（effectSources経由でlendSelfThisTurnによる貸与にも対応）
export function millCapBonusFor(state: GameState, ownerPid: PlayerId): number {
    let total = 0
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "millCapBonus") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            total += effect.amount
        }
    }
    return total
}

// 持ち主フィールドの bofuCountBonus（BS08ゲラン准将Lv2）合計：【暴風】の指定数に加算する。
// funsaiBonusTotal と同じ考え方（effectSources経由でlendSelfThisTurnによる貸与にも対応）
function bofuCountBonusFor(state: GameState, ownerPid: PlayerId): number {
    let total = 0
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "bofuCountBonus") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            total += effect.amount
        }
    }
    return total
}

// このスピリットが持つ【暴風】の実効指定数（静的keywordのcount + bofuCountBonus合計）。
// 暴風を持たない（base=0）スピリットにはボーナスを加算しない。GameEngine.resolveBattleの
// hasBofuOnBlock分岐と、action:"bpBuffAllByBofuCount"の両方から参照する（BS08ゲラン准将／スナイピングブラスト）
export function bofuCountFor(state: GameState, ownerPid: PlayerId, inst: CardInstance): number {
    const level = currentLevel(inst).level
    let base = 0
    for (const effect of getCard(inst.cardId).effects) {
        if (effect.kind !== "keyword" || effect.keyword !== "bofu") continue
        if (!effectActiveAtLevel(effect.levels, level)) continue
        base = effect.count ?? 1
        break
    }
    if (base === 0) return 0
    return base + bofuCountBonusFor(state, ownerPid)
}

// 持ち主フィールドに funsaiOnBlock（士気高き大本営）が有効な発生源があるか
export function hasFunsaiOnBlock(state: GameState, ownerPid: PlayerId): boolean {
    const player = state.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "funsaiOnBlock") continue
            if (effectActiveAtLevel(effect.levels, level)) return true
        }
    }
    return false
}

// 持ち主のスピリットの【呪撃】が『ブロック時』へ差し替えられているか（BS06カウンターカース）。
// hasFunsaiOnBlock と違い**追加ではなく差し替え**なので、これが true の側はアタック時に呪撃を発揮しない。
// effectSources() でこのターンだけの仮想発生源（マジックが貸した継続効果）も含める
export function hasJugekiOnBlockReplace(state: GameState, ownerPid: PlayerId): boolean {
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "jugekiOnBlockReplace") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (effectActiveAtLevel(effect.levels, level)) return true
        }
    }
    return false
}

// 持ち主のフィールドに kyoshuOnBlock（BS07蹴撃の戦場跡Lv2）が有効な発生源があるか。
// hasFunsaiOnBlock と同型だが、phase 指定（相手のアタックステップ限定）を持つ
export function hasKyoshuOnBlock(state: GameState, ownerPid: PlayerId): boolean {
    const player = state.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "kyoshuOnBlock") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            return true
        }
    }
    return false
}

// kind:"lifeDamageMillGuard"（BS07六花の司書長サーガ）：defenderPid のライフが減る直前に呼ぶ。
// 発生源が有効なら持ち主のデッキを上から1枚破棄し、そのカードが match に一致していれば true（ライフを守る）。
// keepToHandIfType 指定時は、破棄したカードがその種別なら（守れたかを問わず）トラッシュでなく手札へ加える。
// 「〜できる」は自動適用の簡略化。発生源が複数あっても最初の1つだけを使う（デッキを何度も削らない）
export function tryLifeDamageMillGuard(state: GameState, defenderPid: PlayerId): boolean {
    const player = state.players[defenderPid]
    for (const source of effectSources(state, defenderPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "lifeDamageMillGuard") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            const cardId = player.deck.shift()
            if (cardId === undefined) {
                log(state, `${player.name}のデッキが尽きているため、${getCard(source.cardId).name}の効果は発揮されなかった。`)
                return false
            }
            const milled = getCard(cardId)
            const guarded = milled.type === effect.match.cardType && milled.colors.includes(effect.match.color)
            // keepToHandIfType（サーガLv2-3）：破棄したカードが指定種別なら手札へ。そうでなければトラッシュへ
            if (effect.keepToHandIfType !== undefined && milled.type === effect.keepToHandIfType) {
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

// 持ち主のフィールドに bofuOnBlock（BS07大風車の丘Lv2）が有効な発生源があるか。
// hasKyoshuOnBlock と同型で、こちらは phase に加えて turn 条件も持つ
export function hasBofuOnBlock(state: GameState, ownerPid: PlayerId): boolean {
    const player = state.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "bofuOnBlock") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
            return true
        }
    }
    return false
}

// 持ち主のフィールドに bofuChooserSelf（BS07ワールウィンド）が有効な発生源があるか。
// あるとき、【暴風】の疲労対象は「疲労させられる側」ではなく持ち主自身が選ぶ
export function hasBofuChooserSelf(state: GameState, ownerPid: PlayerId): boolean {
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "bofuChooserSelf") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
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

// 士気高き大本営の光芒版（BS03星降る巡礼地Lv2）：持ち主のスピリットの【光芒】を
// 『このスピリットのブロック時』にも発揮させる発生源が、持ち主のフィールドにあるか。
// 「**にも**」なのでアタック時の発揮はそのまま残る（移し替えではない）
export function hasKoboOnBlock(state: GameState, ownerPid: PlayerId): boolean {
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "koboOnBlock") continue
            if (effectActiveAtLevel(effect.levels, level)) return true
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
                // target:"ownAll" は発生源の持ち主のスピリットのみ
                if (effect.target === "ownAll" && sourcePid !== ownerPid) continue
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

// 【粉砕】の解決：spirit が現在レベルで粉砕を持つなら、相手のデッキを
// （現在レベル + funsaiBonus合計）枚破棄する（アタック時／funsaiOnBlockによるブロック時の共通処理）。
// 実破棄枚数が1以上なら fieldEvent "ownFunsaiMilled" を発火する（repeatPerCount対応）。
// 破棄したカードの種別内訳は state.lastFunsai に記録する（巨人王ランドルフ／二刀流のアムブローズ／
// 伝説巨人ジュードの「【粉砕】で破棄した◯枚につき」系onAttack効果が参照する。doAttackがアタック
// 宣言のたびにクリアするため、粉砕を持たないスピリットのアタックでは前回の値を拾わない）
export function resolveFunsai(
    state: GameState,
    ownerPid: PlayerId,
    spirit: CardInstance,
): void {
    // spiritHasKeyword: 静的keyword ‖ 一時付与 ‖ 継続付与（keywordGrant。lendSelfThisTurnによる
    // 仮想発生源からの貸与も含む。BS05サーキュラーソー・アーム）。既存の静的カードは全レベルで
    // 【粉砕】を持つため、レベル不問のこの判定に切り替えても挙動は変わらない
    if (!spiritHasKeyword(state, ownerPid, spirit, "funsai")) return
    const level = currentLevel(spirit).level
    const bonus = funsaiBonusTotal(state, ownerPid)
    const opponentPid = opponentOf(ownerPid)
    const trashCards = state.players[opponentPid].trashCards
    const beforeLen = trashCards.length
    // 【粉砕】の発生源は常にスピリット（onMilledFromDeck の by:"opponentSpiritEffect" 判定に使う）。
    // funsai:true は **ここだけ**が立てる（BS08鳳翼の聖剣Lv2「【粉砕】以外の」の判定用。
    // action:"mill" は効果文で「デッキを破棄する」と書かれた通常の効果なので立てない）
    const actual = millDeck(state, opponentPid, level + bonus, ownerPid, { sourceType: "spirit", funsai: true })
    if (actual > 0) {
        const milledCardIds = trashCards.slice(beforeLen, beforeLen + actual)
        let spirits = 0
        let nexuses = 0
        let magics = 0
        for (const cardId of milledCardIds) {
            const type = getCard(cardId).type
            if (type === "spirit") spirits++
            else if (type === "nexus") nexuses++
            else if (type === "magic") magics++
        }
        state.lastFunsai = { total: actual, spirits, nexuses, magics }
        fireFieldEventTriggers(state, ownerPid, "ownFunsaiMilled", undefined, undefined, undefined, actual)
    }
}

// 【光芒】: バトル終了時、アタッカーがレベル有効で光芒を持つなら、
// このバトル中にアタッカー側が使用したマジックカードをトラッシュから手札へ戻す。
// state.battle が null になる前（clearBattle 直前）に、各呼び出し元から呼ぶ。
// attacker はローカル参照を渡す（BP比較でフィールドから除去済みでも cardId/cores は読み取れる。呪撃と同じ考え方）
export function resolveKoboOnBattleEnd(
    state: GameState,
    attackerPid: PlayerId,
    attacker: CardInstance | undefined,
): void {
    if (!state.battle || !attacker) return
    const usedMagicCardIds = state.battle.usedMagicCardIds?.[attackerPid]
    if (!usedMagicCardIds || usedMagicCardIds.length === 0) return
    const attackerLevel = currentLevel(attacker).level
    // 静的キーワードはレベル判定つきで判定する（spiritHasKeywordの静的分岐＝hasKeywordはレベルを見ないため、
    // ここだけは従来通り自前でレベルを確認する）。一時付与（tempKeywords。グリームホープ）・
    // 継続付与（keywordGrant）はspiritHasKeywordの非静的判定と同じヘルパーを利用する（BS04エンジン拡張バッチ1）
    const hasStaticKobo = getCard(attacker.cardId).effects.some(
        (e) => e.kind === "keyword" && e.keyword === "kobo" && effectActiveAtLevel(e.levels, attackerLevel),
    )
    const hasKobo =
        hasStaticKobo ||
        attacker.tempKeywords.some((k) => k.keyword === "kobo") ||
        hasContinuousKeywordGrant(state, attackerPid, attacker, "kobo")
    if (!hasKobo) return
    const player = state.players[attackerPid]
    let recovered = 0
    for (const cardId of usedMagicCardIds) {
        const idx = player.trashCards.lastIndexOf(cardId)
        if (idx === -1) continue
        player.trashCards.splice(idx, 1)
        player.hand.push(cardId)
        recovered++
        log(state, `【光芒】${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
    }
    notifyHandGained(state, attackerPid, recovered)
}

// 【転召】置換（tenshoCoreSubstitute）の選択肢ラベル。cores.ts の tenshoSubstituteChoice ハンドラと共有する
export const TENSHO_SUBSTITUTE_REST = "疲労してコアを維持する"
export const TENSHO_SUBSTITUTE_DUMP = "疲労せずコアを置く"

// 【転召】の解決：spirit が現在レベルで転召を持つなら、召喚コスト支払い後（doSummonの末尾）に呼ぶ。
// 自分の他スピリットからコストがminCost以上の候補を集め、上のコアすべてをdestへ置く
// （0体=不発、1体=自動選択、2体以上はinteractiveTargets時のみpendingChoice、それ以外はコスト最大を決定的選択）。
export function resolveTensho(
    state: GameState,
    ownerPid: PlayerId,
    spirit: CardInstance,
): void {
    const level = currentLevel(spirit).level
    const effect = getCard(spirit.cardId).effects.find(
        (e) => e.kind === "keyword" && e.keyword === "tensho" && effectActiveAtLevel(e.levels, level),
    )
    if (!effect || effect.kind !== "keyword") return
    const minCost = effect.minCost ?? 0
    const dest = effect.dest ?? "trash"
    // 場のスピリットのコストを条件にする判定なので、道化師クランの付与コストも見る。
    // tenshoSelfCostBonus（BS08冥機グングニル）：このコスト判定でだけ候補自身のコストに+amountする
    const candidates = state.players[ownerPid].field.spirits.filter(
        (s) =>
            s.instanceId !== spirit.instanceId &&
            (instMatchesCostFilter(s, { min: minCost }) ||
                getCard(s.cardId).cost + tenshoSelfCostBonus(state, ownerPid, s) >= minCost),
    )
    if (candidates.length === 0) {
        log(state, `【転召】${getCard(spirit.cardId).name}：対象がいなかった。`)
        return
    }
    if (candidates.length === 1) {
        const only = candidates[0]
        if (only) dumpAllCoresTensho(state, ownerPid, only, dest)
        return
    }
    if (state.interactiveTargets) {
        requestChoice(
            state,
            ownerPid,
            `【転召】コアを${dest === "void" ? "ボイドに置く" : "トラッシュに置く"}自分のスピリットを選択`,
            candidates.map((s) => s.instanceId),
            false,
            { type: "tenshoCoreDump", dest },
            spirit,
        )
        return
    }
    // 自動選択（プレイヤー選択の決定的簡略化）：コスト最大の1体。
    // 複数コストを持つ状態では「最大」を定義できないため、カード本来のコストのまま比較する
    const chosen = candidates.reduce((best, s) =>
        getCard(s.cardId).cost + tenshoSelfCostBonus(state, ownerPid, s) >
        getCard(best.cardId).cost + tenshoSelfCostBonus(state, ownerPid, best)
            ? s
            : best,
    )
    dumpAllCoresTensho(state, ownerPid, chosen, dest)
}

// kind:"tenshoSelfCostBonus"：【転召】の生贄候補列挙でだけ、その候補のコストに+amountする。
// 2種類を合算する:
//   ① 候補自身が持つエントリ（target 省略。BS08冥機グングニル＝「このスピリットをコスト+3」）
//   ② 持ち主フィールドの発生源が配る target:"ownAll" のエントリ
//      （BS08赤き砂の座Lv2＝「系統『冥主』を持つ自分のスピリットすべてをコスト+3」）
// 効くのはresolveTenshoの候補判定だけで、instAllCosts等の一般的なコスト計算には影響しない局所的な簡略化
function tenshoSelfCostBonus(state: GameState, ownerPid: PlayerId, inst: CardInstance): number {
    let bonus = 0
    const instLevel = currentLevel(inst).level
    for (const effect of getCard(inst.cardId).effects) {
        if (effect.kind !== "tenshoSelfCostBonus") continue
        if (effect.target === "ownAll") continue // 自身のエントリでも ownAll 版は②で数える
        if (!effectActiveAtLevel(effect.levels, instLevel)) continue
        bonus += effect.amount
    }
    for (const source of effectSources(state, ownerPid)) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "tenshoSelfCostBonus") continue
            if (effect.target !== "ownAll") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.familyFilter && !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)) continue
            bonus += effect.amount
        }
    }
    return bonus
}

// フィールドイベント誘発「自分の【転召】が解決したとき」（BS08関将龍皇ドラグロン）。
// dumpAllCoresTenshoが唯一の解決点なので、呼び出し側（自動/interactive選択のいずれの経路）から
// 「実際に転召が確定した」タイミングでちょうど1回ずつ呼ぶ
export function fireTenshoEvent(state: GameState, ownerPid: PlayerId, inst: CardInstance): void {
    fireFieldEventTriggers(state, ownerPid, "ownTensho", undefined, undefined, undefined, undefined, {
        families: [...getCard(inst.cardId).family],
        names: [getCard(inst.cardId).name],
    })
}

// 対象スピリットの上のコアすべてをdestへ置く（trash=持ち主のトラッシュ、void=消滅）。
// 維持コア割れは既存の消滅処理に委ねる（【転召】／resolveAction "tenshoCoreDump" 共通）
export function dumpAllCoresTensho(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    dest: "trash" | "void",
    skipSubstitute = false,
): void {
    // 「このスピリットが【転召】の対象になったとき」（BS08天使オリフィア）：唯一の解決点であるここで、
    // 対象になった本人（inst）自身の誘発を必ず発火する。tenshoCoreSubstituteで疲労を選んだ場合も
    // コアを失う場合も、対象になった事実は変わらないため分岐より前で一度だけ呼ぶ
    fireTrigger(state, ownerPid, inst, "onTenshoTarget")
    // constraint "tenshoCoreSubstitute"（BS05の竜使い6枚）：疲労していなければ、
    // 疲労することでコアを置いたものとして扱う（実際にはコアを失わない代替。すでに疲労中は通常のコア移動になる）。
    // 「疲労させることで」は任意なので、実対戦では疲労するかコアを置くかをプレイヤーに選ばせる
    // （skipSubstitute=true は「コアを置く」を選んだ後の再入。tenshoSubstituteChoice からのみ渡る）
    if (
        !skipSubstitute &&
        !inst.isRested &&
        activeConstraints(state, ownerPid, inst).some((c) => c.type === "tenshoCoreSubstitute")
    ) {
        if (state.interactiveTargets) {
            requestChoice(
                state,
                ownerPid,
                `【転召】${getCard(inst.cardId).name}：疲労してコアを維持しますか？`,
                [],
                false,
                { type: "tenshoSubstituteChoice", dest },
                inst,
                "option",
                [TENSHO_SUBSTITUTE_REST, TENSHO_SUBSTITUTE_DUMP],
            )
            return
        }
        // 自動時（テスト）はコアを失わない側を選ぶ決定的簡略化
        log(state, `【転召】${getCard(inst.cardId).name}は疲労し、コアをそのまま維持した。`)
        exhaustSpirit(state, ownerPid, inst)
        fireTenshoEvent(state, ownerPid, inst)
        return
    }
    fireTenshoEvent(state, ownerPid, inst)
    const player = state.players[ownerPid]
    const count = inst.cores
    inst.cores = 0
    if (dest === "trash") {
        player.trashCores += count
        log(state, `【転召】${getCard(inst.cardId).name}のコア${count}個をトラッシュに置いた。`)
    } else {
        log(state, `【転召】${getCard(inst.cardId).name}のコア${count}個をボイドに置いた。`)
    }
    if (inst.cores < instMinLevelCores(inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
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


// インスタンスのシンボル数：カードの静的シンボル数 + このターンの間の追加シンボル数（tempExtraSymbols。ダブルハート）。
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

// 効果でスピリットからリザーブへ置かれるコアの追加数（BS02チャウーLv2の coreReturnBonus）。
// 効果文が「お互いのスピリット上に置かれたコアが」と陣営を限定していないため、**両陣営の発生源**を見る。
// 走査は effectSources 経由＝このターンだけの仮想発生源（マジックが貸した継続効果）も含む
function coreReturnBonusFor(state: GameState): number {
    let bonus = 0
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, pid)) {
            const level = currentLevel(source).level
            for (const e of getCard(source.cardId).effects) {
                if (e.kind !== "coreReturnBonus") continue
                if (!effectActiveAtLevel(e.levels, level)) continue
                bonus += e.amount
            }
        }
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

// フィールド発生源から全スピリット／全ネクサスに効くグローバル制約（kind: "globalConstraint"）が
// 現在有効か判定する。両陣営のフィールド（スピリット＋ネクサス）を走査し、
// レベル条件を満たす該当制約が1つでもあれば true（発生源の持ち主は問わない）。

// 継続的なレベル置換（kind: "levelAs"）を再計算する。
// 全インスタンスの levelAsContinuous を一旦クリアしてから、両陣営フィールドの levelAs 効果を
// 走査して条件成立分を再適用する（毎回全消去→再構築でズレを防ぐ）。
// 発生源自身のレベル判定（sourceMinLevel）は rawLevel（コア数基準・上書き無視）で行い、
// currentLevel の再帰・自己参照を避ける。
// 呼び出し箇所: GameEngine.handleAction の事後フック／ターン開始処理の最後／ゲーム生成直後
export function refreshLevelAsOverrides(state: GameState): void {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const inst of [
            ...state.players[pid].field.spirits,
            ...state.players[pid].field.nexuses,
        ]) {
            delete inst.levelAsContinuous
            delete inst.namesAsContinuous
            delete inst.colorsAsContinuous
            delete inst.symbolsOverrideContinuous
            delete inst.armorColorsGranted
            delete inst.alsoCostsContinuous
            delete inst.treatedAsVanillaContinuous
            delete inst.effectsDisabledContinuous
        }
    }
    // treatAs "max" は対象インスタンス自身のカードが持つ最高Lvに解決する（斬竜刀のガイ／崩壊する戦線：
    // 対象ごとに異なりうるため、発生源でなく対象カードのlevelsを参照する）。
    // "coresScaled" はコア数で換算する（1個→Lv1、2個→Lv2、3個以上→"max"と同じ。サファイアの城壁）
    const resolveTreatAs = (treatAs: number | "max" | "coresScaled", inst: CardInstance): number => {
        const maxLevel = () => getCard(inst.cardId).levels.reduce((max, lv) => Math.max(max, lv.level), 0)
        if (treatAs === "max") return maxLevel()
        if (treatAs === "coresScaled") {
            if (inst.cores >= 3) return maxLevel()
            if (inst.cores === 2) return 2
            return 1
        }
        return treatAs
    }
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        // effectSources() でこのターンだけの仮想発生源（マジックが貸した継続効果。lendSelfThisTurn。
        // BS02-101リフレクションアーマー）も含める。keywordGrant/colorAs/levelAsはいずれも
        // 「誰が継続効果を出しているか」を問うA分類の走査のため、TURN_EFFECT_SOURCES.md §1 に沿う
        const sources = effectSources(state, pid)
        for (const source of sources) {
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind === "keywordGrant" && effect.keyword === "armor") {
                    // 継続付与の装甲（BS05白夜の虚空Lv2：転召持ちに装甲：赤/紫/緑/白を付与）。
                    // hasArmorAgainstはstateを受け取らない設計のため、対象スピリットのCardInstance.armorColorsGrantedへ
                    // 毎回再計算して反映する（levelAsContinuous/colorsAsContinuousと同じ「都度再構築」方式）
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    if (effect.phase !== undefined && state.phase !== effect.phase) continue
                    for (const spirit of player.field.spirits) {
                        if (effect.familyFilter && !matchesFamilyFilter(state, pid, spirit, effect.familyFilter)) continue
                        if (effect.colorFilter && !instHasColor(spirit, effect.colorFilter)) continue
                        if (effect.keywordFilter && !spiritHasKeyword(state, pid, spirit, effect.keywordFilter)) continue
                        // 実コストに加えて tempAlsoCosts（道化師クランの「コスト2としても扱う」）も見る
                        if (effect.costFilter && !instMatchesCostFilter(spirit, effect.costFilter)) continue
                        if (!spirit.armorColorsGranted) spirit.armorColorsGranted = []
                        for (const c of effect.colors ?? []) {
                            if (!spirit.armorColorsGranted.includes(c)) spirit.armorColorsGranted.push(c)
                        }
                    }
                    continue
                }
                if (effect.kind === "keyword" && effect.keyword === "armor" && effect.colorsFrom === "opponentFieldSymbols") {
                    // 【装甲：∞】：持ち主から見た相手フィールドのシンボル色を毎回算出して自身へ反映する
                    // （hasArmorAgainstはstateを受け取らない純粋述語のため、armorColorsGrantedへ都度全消去→再構築で渡す。
                    // BS06鎧神機ヴァルハランス。sourceは実在するカード自身＝effectSourcesが返す実フィールド発生源）
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    const oppColors = ownFieldSymbolColors(state, opponentOf(pid))
                    if (oppColors.size > 0) {
                        if (!source.armorColorsGranted) source.armorColorsGranted = []
                        for (const c of oppColors) {
                            if (!source.armorColorsGranted.includes(c)) source.armorColorsGranted.push(c)
                        }
                    }
                    continue
                }
                if (effect.kind === "vanillaAsGrant") {
                    // 「系統：『造兵』を持つ自分のスピリットすべてを、カードに効果の記述を持たない
                    // スピリットとしても扱う」（BS04スイッチヒッター）。instIsVanilla は state を受け取らない
                    // 純粋述語なので、対象の CardInstance.treatedAsVanillaContinuous へ毎回再構築して反映する
                    if (effect.lentOnly && !isVirtualSource(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    for (const spirit of player.field.spirits) {
                        if (
                            effect.familyFilter &&
                            !matchesFamilyFilter(state, pid, spirit, effect.familyFilter)
                        ) {
                            continue
                        }
                        if (effect.colorFilter !== undefined && !instHasColor(spirit, effect.colorFilter)) continue
                        spirit.treatedAsVanillaContinuous = true
                    }
                    continue
                }
                if (effect.kind === "spiritEffectsDisabledGrant") {
                    // 「自分のスピリットをブロックした【転召】を持たない相手のスピリットが持つ効果すべては
                    // 発揮されない」（BS07ルナースラッシュ）。treatedAsVanillaContinuous（＝対象判定用の述語）とは別物で、
                    // こちらは effectSources / activeConstraints / spiritHasKeyword / fireTrigger の
                    // 4か所が CardInstance.effectsDisabledContinuous を見て実際に発揮を止める
                    if (effect.lentOnly && !isVirtualSource(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    const targetPid = effect.target === "opponentAll" ? opponentOf(pid) : pid
                    for (const spirit of state.players[targetPid].field.spirits) {
                        if (
                            effect.familyFilter &&
                            !matchesFamilyFilter(state, targetPid, spirit, effect.familyFilter)
                        ) {
                            continue
                        }
                        // 【転召】を持たない相手のみ。除外判定にはこのスピリットの静的キーワードだけを見る
                        // （spiritHasKeyword は effectsDisabledContinuous を見るため、ここで使うと
                        //   「無効化したせいでキーワードが消え、次の再構築でも無効化され続ける」自己参照になる）
                        if (
                            effect.keywordExclude !== undefined &&
                            hasKeyword(spirit.cardId, effect.keywordExclude)
                        ) {
                            continue
                        }
                        // 「自分のスピリットをブロックした相手のスピリット」＝現在のバトルのブロッカーのみ
                        if (effect.blockingOnly && state.battle?.blockerInstanceId !== spirit.instanceId) continue
                        spirit.effectsDisabledContinuous = true
                    }
                    continue
                }
                if (effect.kind === "nameAsGrant") {
                    // 「コストNの自分のスピリットすべては、カード名に『◯◯』が入っているものとして扱う」
                    // （アルカナプリンス・オベロLv2／アルカナプリンセス・アンLv2）。
                    // cardNameContains は state を受け取らない純粋述語なので、colorsAsContinuous と同じく
                    // 対象の CardInstance.namesAsContinuous へ毎回再構築して反映する
                    if (effect.lentOnly && !isVirtualSource(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    for (const spirit of player.field.spirits) {
                        // 「コストNの自分のスピリット」は付与コスト（道化師クラン）も込みで判定する
                        if (effect.costFilter !== undefined && !instHasCost(spirit, effect.costFilter)) continue
                        if (effect.colorFilter !== undefined && !instHasColor(spirit, effect.colorFilter)) continue
                        if (!spirit.namesAsContinuous) spirit.namesAsContinuous = []
                        if (!spirit.namesAsContinuous.includes(effect.nameIncludes)) {
                            spirit.namesAsContinuous.push(effect.nameIncludes)
                        }
                    }
                    continue
                }
                if (effect.kind === "colorAs") {
                    // 発生源自身（target:"ownAll" は持ち主のスピリットすべて）が指定色としても扱われる
                    // （継続。百面相のフラットフェイス／妖精ティングリー）
                    if (effect.lentOnly && !isVirtualSource(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    // 仮想発生源は場に実在しないため、target:"self" の対象にはできない（TURN_EFFECT_SOURCES.md §4.1）
                    const targets = effect.target === "ownAll" ? player.field.spirits : [source]
                    for (const target of targets) {
                        if (!target.colorsAsContinuous) target.colorsAsContinuous = []
                        for (const c of effect.colors) {
                            if (!target.colorsAsContinuous.includes(c)) target.colorsAsContinuous.push(c)
                        }
                    }
                    continue
                }
                if (effect.kind === "symbolFix") {
                    // 持ち主の対象スピリット（familyFilter一致）のシンボルを、そのスピリット元々の
                    // シンボル1色目でcount個に固定する（継続。BS08海底に眠りし古代都市Lv2）
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    for (const spirit of player.field.spirits) {
                        if (effect.familyFilter && !matchesFamilyFilter(state, pid, spirit, effect.familyFilter)) continue
                        const baseColor = getCard(spirit.cardId).symbol[0]
                        if (!baseColor) continue
                        spirit.symbolsOverrideContinuous = new Array(effect.count).fill(baseColor)
                    }
                    continue
                }
                if (effect.kind === "alsoCostGrant") {
                    // 持ち主のスピリットすべてを「コストNとしても扱う」（継続。道化師クラン）。
                    // instHasCost / instMatchesCostFilter は state を受け取らない設計のため、
                    // 対象の CardInstance.alsoCostsContinuous へ毎回再計算して反映する
                    if (effect.lentOnly && !isVirtualSource(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    for (const spirit of player.field.spirits) {
                        if (!spirit.alsoCostsContinuous) spirit.alsoCostsContinuous = []
                        if (!spirit.alsoCostsContinuous.includes(effect.cost)) {
                            spirit.alsoCostsContinuous.push(effect.cost)
                        }
                    }
                    continue
                }
                if (effect.kind !== "levelAs") continue
                if (effect.lentOnly && !isVirtualSource(source)) continue
                if (
                    effect.sourceMinLevel !== undefined &&
                    rawLevel(source) < effect.sourceMinLevel
                ) {
                    continue
                }
                if (
                    effect.sourceLevels !== undefined &&
                    !effect.sourceLevels.includes(rawLevel(source))
                ) {
                    continue
                }
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                if (effect.condition) {
                    if ("maxOwnSpirits" in effect.condition) {
                        if (player.field.spirits.length > effect.condition.maxOwnSpirits) continue
                    } else if ("ownFieldHasFamily" in effect.condition) {
                        // 鼠人チューリヒ：発生源の持ち主のフィールドに指定系統を持つスピリットがいる間有効
                        const family = effect.condition.ownFieldHasFamily
                        if (!player.field.spirits.some((s) => spiritHasFamily(state, pid, s, family))) continue
                    } else if ("ownSpiritCountBelowOpponent" in effect.condition) {
                        // BS08ダークチュンポポLv2：自分のスピリットの体数が相手より少ない間だけ有効
                        const oppCount = state.players[opponentOf(pid)].field.spirits.length
                        if (player.field.spirits.length >= oppCount) continue
                    } else {
                        // 斬竜刀のガイ：自分か相手のどちらかのフィールドに指定色のスピリットがいる間有効
                        const color = effect.condition.anyFieldHasColorSpirit
                        const anySpirits = [
                            ...state.players.p1.field.spirits,
                            ...state.players.p2.field.spirits,
                        ]
                        if (!anySpirits.some((s) => instHasColor(s, color))) continue
                    }
                }
                if (effect.target === "self") {
                    source.levelAsContinuous = resolveTreatAs(effect.treatAs, source)
                } else if (effect.target === "ownNexusesAll") {
                    for (const nexus of player.field.nexuses) {
                        nexus.levelAsContinuous = resolveTreatAs(effect.treatAs, nexus)
                    }
                } else if (effect.target === "opponentNexusesAll") {
                    // 発生源の持ち主の相手の全ネクサス（ウッド・ゴレム：相手ネクサスのLv2効果を無効化する
                    // 簡略化としてLv1扱いにする。ネクサスのレベル表示も1になる）
                    for (const nexus of state.players[opponentOf(pid)].field.nexuses) {
                        nexus.levelAsContinuous = resolveTreatAs(effect.treatAs, nexus)
                    }
                } else if (effect.target === "ownSpiritsByKeyword") {
                    // キーワード判定はカード静的のみ（getCard(s.cardId).effectsにkind"keyword"かつ
                    // keyword一致のエントリがあるか。レベル・付与は見ない）
                    for (const spirit of player.field.spirits) {
                        const hasStaticKeyword = getCard(spirit.cardId).effects.some(
                            (e) => e.kind === "keyword" && e.keyword === effect.keywordFilter,
                        )
                        if (!hasStaticKeyword) continue
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "ownSpiritsByFamily") {
                    // マッスルチャージ：familyFilterの系統（配列＝OR）を持つ持ち主のスピリットすべてを
                    // それぞれの最高Lvとして扱う（BS06。matchesFamilyFilterはtempKeywords等の付与も考慮する）
                    for (const spirit of player.field.spirits) {
                        if (effect.familyFilter && !matchesFamilyFilter(state, pid, spirit, effect.familyFilter)) continue
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "ownSpiritsVanilla") {
                    // カードに効果の記述を持たない（バニラ）持ち主のスピリットすべて（サファイアの城壁）。
                    // summonedThisTurnOnly 指定時は「召喚されたターンの間」だけ（BS04心臓破りの巨大坂Lv2）
                    for (const spirit of player.field.spirits) {
                        if (!instIsVanilla(spirit)) continue
                        if (effect.summonedThisTurnOnly && spirit.summonedTurn !== state.turn) continue
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "opponentSpiritsAll") {
                    // 発生源の持ち主の相手のスピリットすべて（BS03フォーカード／BS04ジャッジメントライツ）
                    for (const spirit of state.players[opponentOf(pid)].field.spirits) {
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "allSpiritsByChosenColor") {
                    // 両陣営の、貸与時に選ばれた色（仮想発生源のlentChoiceColor）のスピリットすべてを
                    // それぞれの最高Lvとして扱う（BS02-111スピリットイリュージョン）
                    const chosenColor = source.lentChoiceColor
                    if (chosenColor) {
                        for (const spirit of [
                            ...state.players.p1.field.spirits,
                            ...state.players.p2.field.spirits,
                        ]) {
                            if (!instHasColor(spirit, chosenColor)) continue
                            spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                        }
                    }
                }
            }
        }
    }
    // クロスシザースのネクサス⇔コア数リンク（coresLinkedTo）を同期する。
    // リンク元スピリットが消えていれば両フィールドをクリアする
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const nexus of state.players[pid].field.nexuses) {
            if (!nexus.coresLinkedTo) continue
            const source = findInstanceAnywhere(state, nexus.coresLinkedTo)
            if (!source) {
                delete nexus.coresLinkedTo
                delete nexus.coresOverride
                continue
            }
            nexus.coresOverride = source.cores
        }
    }
}

// ---- スピリット／ネクサスの除去 ----

// スピリットを破壊（または消滅）：コアをリザーブへ戻し、カードをトラッシュへ。
// cause が "destroy" のときのみ破壊時効果（onDestroy）が誘発する。
export function destroySpirit(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
    cause: "destroy" | "deplete" = "destroy",
    context?: DestroyContext,
    // skipRevive: 復活の確認で「復活させない」が選ばれたあとの破壊。
    // 再び復活判定に入って無限に確認を出すのを防ぐ
    options?: { skipRevive?: true },
): void {
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex(
        (s) => s.instanceId === instanceId,
    )
    if (index === -1) return
    const inst = player.field.spirits[index]
    if (!inst) return
    const master = getCard(inst.cardId)

    // 復活チェック（cause==="destroy"のときのみ。維持コア割れ＝消滅は対象外）。
    // 破壊されるかわりに場に留まる。複数ソースがある場合は self由来→ownAll由来の順で最初の1つだけ適用。
    // 「〜できる」の任意発動は常に発動する簡略化とする。
    if (cause === "destroy" && !options?.skipRevive && tryReviveOnDestroy(state, ownerPid, inst, context)) {
        return
    }

    // 破壊直前のコア数を記録（リザーブへ移す前。漆黒鳥ヤタグロスの coreGainPer: selfCoresAtDestruction）
    inst.coresAtDestruction = inst.cores

    player.field.spirits.splice(index, 1)
    // 破壊されたスピリット上のコアは通常リザーブへ戻るが、
    // destroyedCoresToTrash（古龍の縄張りLv1）が有効な間はトラッシュへ置かれる
    if (destroyedCoresGoToTrash(state)) {
        player.trashCores += inst.cores
    } else {
        player.reserve += inst.cores
    }
    player.trashCards.push(inst.cardId)
    log(
        state,
        `${player.name}の${master.name}は${cause === "destroy" ? "破壊" : "消滅"}された。`,
    )
    emitEvent(state, { type: "destroy", pid: ownerPid, cardName: master.name })

    if (cause === "destroy") {
        fireTrigger(state, ownerPid, inst, "onDestroy")
    }
    // フィールドイベント誘発「自分のスピリットが破壊されたとき」：cause問わず（消滅も含む）持ち主側で発火
    // （侵食されゆく銀世界Lv2）。fireFieldEventTriggers の action がさらに destroySpirit を
    // 呼ぶカードは現対象に無いが、呼ぶ場合は再入（同一スピリットの二重破壊）に注意すること
    // 破壊されたスピリットの色（colorFilter判定用。祝福されし大聖堂）と、
    // バニラ判定・バトル破壊判定（vanillaOnly／byBattleOnly。運命分かつ岐路）を渡す
    // selfOverrideに破壊されたスピリット自身を渡す（BS05永久氷殿：maxBpFromSelfで「破壊されたスピリットのBP以下」を
    // 参照できるようにする。既存カードはselfを参照しないアクションのみのため挙動は変わらない）
    fireFieldEventTriggers(state, ownerPid, "ownSpiritDestroyed", { pid: ownerPid, inst }, master.colors, undefined, undefined, {
        vanilla: instIsVanilla(inst),
        byBattle: context?.battle !== undefined,
        // 破壊された時点でまだバトルが生きているので、アタッカー側だったかをここで確定させる
        // （clearBattle 後には判定できない。attackerOnly の判定に使う）
        wasAttacker: state.battle?.attackerInstanceId === inst.instanceId,
        families: master.family,
        // instAllCosts：破壊されたスピリットの本来のコストに加え、道化師クランの付与コストも含める
        costs: instAllCosts(inst),
    })
}

// 手札のカード自身が持つ「ライフが減ったとき、コストを支払わずに召喚できる」（BS08猫娘アニー）。
// ownLifeDamaged の発火点から呼ぶ。実対戦では確認を出し、非対話では自動で召喚する
export function tryHandFreeSummonOnLifeDamaged(state: GameState, pid: PlayerId): void {
    if (state.pendingChoice || state.winner) return
    const player = state.players[pid]
    for (let i = 0; i < player.hand.length; i++) {
        const cardId = player.hand[i]
        if (cardId === undefined) continue
        const effect = getCard(cardId).effects.find((e) => e.kind === "freeSummonFromHandOnLifeDamaged")
        if (!effect || effect.kind !== "freeSummonFromHandOnLifeDamaged") continue
        if (effect.phaseTurn) {
            if (state.phase !== effect.phaseTurn.phase) continue
            if (effect.phaseTurn.turn === "own" && pid !== state.turnPlayer) continue
            if (effect.phaseTurn.turn === "opponent" && pid === state.turnPlayer) continue
        }
        // 維持コアを置けないなら召喚できないので、確認自体を出さない
        if (player.reserve < minLevelCores(getCard(cardId))) continue
        if (state.interactiveTargets) {
            state.pendingChoice = {
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
                queue: [],
            }
            return
        }
        summonFreeFromHandIndex(state, pid, getCard(cardId).name, i)
        return
    }
}

// pendingChoice（手札からの無償召喚の確認）で「召喚する」が選ばれたときの後処理。
// 確認を出したあとに手札から失われていた場合は何もしない
export function applyHandFreeSummon(
    state: GameState,
    info: NonNullable<PendingChoice["handFreeSummon"]>,
): void {
    const index = state.players[info.pid].hand.indexOf(info.cardId)
    if (index === -1) return
    summonFreeFromHandIndex(state, info.pid, getCard(info.cardId).name, index)
}

// 「破壊される代わりに復活**できる**」の確認を保留リストへ積む。
// 破壊はこの時点では行わない（対象は場に残ったまま）。承認・拒否は handleAction の末尾で確認したあと、
// applyReviveConfirm / declineReviveConfirm が決着させる
function queueReviveConfirm(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    effectId: string,
    sourceInstanceId: string,
    context?: DestroyContext,
): void {
    ;(state.pendingReviveConfirms ??= []).push({
        pid: ownerPid,
        instanceId: inst.instanceId,
        effectId,
        sourceInstanceId,
        ...(context ? { context } : {}),
    })
    log(
        state,
        `${state.players[ownerPid].name}の${getCard(inst.cardId).name}は、破壊される代わりに復活するか確認を待っている。`,
    )
}

// 保留していた復活の確認で「復活させる」が選ばれたときの後処理。
// ここで初めてコストを支払い、復活先（場に残る／手札へ戻る）を適用する。
// コストを払えなければ復活は成立せず、そのまま破壊する
export function applyReviveConfirm(
    state: GameState,
    entry: NonNullable<PendingChoice["reviveConfirm"]>,
): void {
    const player = state.players[entry.pid]
    const inst = player.field.spirits.find((s) => s.instanceId === entry.instanceId)
    if (!inst) return // 確認を出したあとに場から居なくなっていたら何もしない
    // 保留したときと同じ判定経路を、対象のエントリだけに絞って**確定モード**で通す
    // （forced 指定時は optional の保留分岐に入らない）。コストが払えない等で成立しなければ破壊する
    if (!tryReviveOnDestroy(state, entry.pid, inst, entry.context, { effectId: entry.effectId })) {
        declineReviveConfirm(state, entry)
    }
}

// 保留していた復活の確認で「復活させない」が選ばれたときの後処理。見送っていた破壊をここで行う
export function declineReviveConfirm(
    state: GameState,
    entry: NonNullable<PendingChoice["reviveConfirm"]>,
): void {
    const player = state.players[entry.pid]
    const inst = player.field.spirits.find((s) => s.instanceId === entry.instanceId)
    if (!inst) return
    log(state, `${player.name}の${getCard(inst.cardId).name}は復活しなかった。`)
    destroySpirit(state, entry.pid, entry.instanceId, "destroy", entry.context, { skipRevive: true })
}

// reviveOnDestroy の判定と実行。復活できたら true を返す（呼び出し側 destroySpirit はそのまま return する）。
// 優先順位: instのカード自身が持つ scope:"self" の効果 → 持ち主フィールドの scope:"ownAll" の効果（先に見つかった方）。
function tryReviveOnDestroy(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    context?: DestroyContext,
    // 指定時は「このエントリだけを、確認済みとして確定させる」モード。
    // optional の保留分岐に入らず、他のエントリも見ない（applyReviveConfirm から渡る）
    forced?: { effectId: string },
): boolean {
    const player = state.players[ownerPid]
    const level = currentLevel(inst).level

    const matchesWhen = (when: {
        byOpponentEffect?: boolean
        byBattleVsArmorColor?: boolean
        byBattle?: boolean
        byBattleKillerLevel?: number
        byBattleKillerMaxBp?: number
    }): boolean => {
        if (when.byOpponentEffect) {
            if (context?.sourcePid === undefined || context.sourcePid === ownerPid) return false
        }
        if (when.byBattleVsArmorColor) {
            const attackerColors = context?.battle?.attackerColors
            if (attackerColors === undefined || !hasArmorAgainst(inst, attackerColors)) return false
        }
        if (when.byBattle && context?.battle === undefined) return false
        if (
            when.byBattleKillerLevel !== undefined &&
            context?.battle?.attackerLevel !== when.byBattleKillerLevel
        ) {
            return false
        }
        // BS08勝者のグリーンフィールドLv2：破壊した側（勝者）の実効BPがこれ以下のときのみ復活する
        if (
            when.byBattleKillerMaxBp !== undefined &&
            (context?.battle?.attackerBp === undefined || context.battle.attackerBp > when.byBattleKillerMaxBp)
        ) {
            return false
        }
        return true
    }

    const matchesPhaseTurn = (phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }): boolean => {
        if (!phaseTurn) return true
        if (state.phase !== phaseTurn.phase) return false
        if (phaseTurn.turn === "own" && ownerPid !== state.turnPlayer) return false
        if (phaseTurn.turn === "opponent" && ownerPid === state.turnPlayer) return false
        return true
    }

    const applyCost = (effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>): boolean => {
        if (effect.cost?.keepOneCoreRestToTrash) {
            const excess = inst.cores - 1
            if (excess > 0) {
                inst.cores = 1
                player.trashCores += excess
            }
            return true
        }
        if (effect.cost?.oneCoreToVoid) {
            // コア1個の個体は支払うと維持コア割れになるため不発
            if (inst.cores <= 1) return false
            inst.cores -= 1
            return true
        }
        if (effect.cost?.reserveOneToTrash) {
            // 持ち主のリザーブのコア1個を持ち主のトラッシュへ（リザーブ0なら不発）
            if (player.reserve <= 0) return false
            player.reserve -= 1
            player.trashCores += 1
            return true
        }
        if (effect.cost?.fieldOrReserveOneToTrash) {
            // 持ち主のリザーブのコア1個（無ければ自分のフィールド＝スピリット/ネクサス、
            // 発生源自身を除く、からコア1個）を持ち主のトラッシュへ（BS04宝石虫スカラベール）
            if (player.reserve > 0) {
                player.reserve -= 1
                player.trashCores += 1
                return true
            }
            const source = [...player.field.spirits, ...player.field.nexuses].find(
                (i) => i.instanceId !== inst.instanceId && i.cores > 0,
            )
            if (source) {
                source.cores -= 1
                player.trashCores += 1
                return true
            }
            return false
        }
        if (effect.cost?.handDiscardOne) {
            // 持ち主の手札1枚（末尾＝決定的簡略化）をトラッシュへ。手札0枚なら支払い不可＝不発（BS06暴かれた墓石Lv2）
            if (player.hand.length === 0) return false
            const cardId = player.hand.pop()!
            player.trashCards.push(cardId)
            return true
        }
        if (effect.cost?.millSelfOneMatching) {
            // BS07冥勇士デスカラビア：自分のデッキを上から1枚破棄し、そのカードが
            // 指定の色・種別（紫のスピリットカード）だったときだけ成立する
            const { color, cardType } = effect.cost.millSelfOneMatching
            const cardId = player.deck.shift()
            if (cardId === undefined) {
                log(state, `${player.name}のデッキが尽きているため、破壊時の効果は成立しなかった。`)
                return false
            }
            const milled = getCard(cardId)
            player.trashCards.push(cardId)
            log(state, `${player.name}はデッキを上から1枚（${milled.name}）破棄した。`)
            const ok = milled.type === cardType && milled.colors.includes(color)
            if (!ok) log(state, `${milled.name}は条件を満たさなかった。`)
            return ok
        }
        if (effect.cost?.exhaustOwnFamilyOne) {
            // BS07パオ・ペイール：持ち主の「想獣」の回復状態スピリット1体を疲労させる。
            // 破壊されようとしている個体自身は除く。候補は実効BP最小を選ぶ（犠牲を最小化する簡略化）
            const family = effect.cost.exhaustOwnFamilyOne
            const candidates = player.field.spirits.filter(
                (s) =>
                    s.instanceId !== inst.instanceId &&
                    !s.isRested &&
                    matchesFamilyFilter(state, ownerPid, s, family),
            )
            if (candidates.length === 0) return false
            const chosen = candidates.reduce((min, s) =>
                effectiveBp(state, ownerPid, s) < effectiveBp(state, ownerPid, min) ? s : min,
            )
            exhaustSpirit(state, ownerPid, chosen)
            return true
        }
        if (effect.cost?.ownLifeOneToVoid) {
            // BS08太陽石の神殿：持ち主のライフのコア1個をボイドへ（リザーブには戻らない）。
            // ライフ0なら支払い不可＝不発。支払った結果ライフが0になった場合はそのまま勝敗が決まる
            if (player.life <= 0) return false
            player.life -= 1
            log(state, `${player.name}はライフのコア1個をボイドに置いた。（残りライフ${player.life}）`)
            if (player.life <= 0 && !state.winner) {
                state.winner = opponentOf(ownerPid)
                log(state, `${state.players[opponentOf(ownerPid)].name}の勝利！`)
            }
            return true
        }
        return true
    }

    // oncePerTurn（BS06暴かれた墓石Lv2）：発生源（sourceInst）が同一ターンに既に復活を成立させていたら不発
    const oncePerTurnBlocked = (
        effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>,
        sourceInst: CardInstance,
    ): boolean => effect.oncePerTurn === true && sourceInst.reviveOnDestroyUsedTurn === state.turn
    const markOncePerTurn = (
        effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>,
        sourceInst: CardInstance,
    ): void => {
        if (effect.oncePerTurn) sourceInst.reviveOnDestroyUsedTurn = state.turn
    }

    // 復活時の状態反映：{rested}は場に留まったまま状態を変更、{toHand}は場から除去して手札へ戻す
    // （コアは持ち主のリザーブへ。トラッシュは経由しない。深緑の樹海Lv2）
    const applyRevived = (revived: { rested: boolean } | { toHand: true }): void => {
        if ("toHand" in revived) {
            const idx = player.field.spirits.findIndex((s) => s.instanceId === inst.instanceId)
            if (idx !== -1) player.field.spirits.splice(idx, 1)
            player.reserve += inst.cores
            player.hand.push(inst.cardId)
            notifyHandGained(state, ownerPid, 1)
        } else {
            inst.isRested = revived.rested
        }
    }

    const revivedLabel = (revived: { rested: boolean } | { toHand: true }): string =>
        "toHand" in revived ? "手札に戻った" : `${revived.rested ? "疲労" : "回復"}状態で自分のフィールドに戻った`

    // 持ち主のフィールド（スピリット）に指定カード名を持つ個体が1体以上いるか
    // （BS05プリンセス・スノーホワイト：自分のフィールドに[ドワッフー・セブン]がいるとき）
    const matchesRequireOwnFieldHasName = (name?: string): boolean => {
        if (name === undefined) return true
        return player.field.spirits.some((s) => getCard(s.cardId).name === name)
    }

    // 発生源の持ち主から見た相手フィールドのシンボル色数（重複除く）がこの値以下か
    // （BS06夢中漂う桃幻郷Lv2：相手フィールドにシンボルが1色しかない間）
    const matchesReviveCondition = (condition?: { opponentFieldSymbolColorsAtMost: number }): boolean => {
        if (!condition) return true
        const oppColors = ownFieldSymbolColors(state, opponentOf(ownerPid))
        return oppColors.size <= condition.opponentFieldSymbolColorsAtMost
    }

    const tryEffect = (effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>, sourceName: string): boolean => {
        if (forced && effect.id !== forced.effectId) return false
        if (!effectActiveAtLevel(effect.levels, level)) return false
        if (effect.vanillaFilter && !instIsVanilla(inst)) return false
        if (!matchesRequireOwnFieldHasName(effect.requireOwnFieldHasName)) return false
        if (!matchesReviveCondition(effect.condition)) return false
        if (!matchesWhen(effect.when)) return false
        if (!matchesPhaseTurn(effect.phaseTurn)) return false
        if (oncePerTurnBlocked(effect, inst)) return false
        // 「〜できる」＝任意（optional）は、実対戦では持ち主に確認してから確定させる。
        // 破壊処理の途中では中断できないので、いったん破壊を見送って（＝場に残して）保留へ積む
        if (effect.optional && state.interactiveTargets && !forced) {
            queueReviveConfirm(state, ownerPid, inst, effect.id, inst.instanceId, context)
            return true
        }
        if (!applyCost(effect)) return false
        markOncePerTurn(effect, inst)
        const name = getCard(inst.cardId).name
        // BS07ブラックリチュアル：「破壊時効果を発揮した自分のスピリットは手札に戻る」。
        // 既定では復活が成立すると破壊時効果は発揮されないので、場に留める（手札へ戻す）前に先に発揮させる
        if (effect.fireDestroyTriggerFirst) fireTrigger(state, ownerPid, inst, "onDestroy")
        applyRevived(effect.revived)
        log(
            state,
            `${player.name}の${name}は、${sourceName}の効果で破壊される代わりに${revivedLabel(effect.revived)}。`,
        )
        return true
    }

    // self由来（inst自身が持つ reviveOnDestroy）
    for (const effect of getCard(inst.cardId).effects) {
        if (effect.kind !== "reviveOnDestroy") continue
        if (effect.scope !== "self") continue
        if (tryEffect(effect, getCard(inst.cardId).name)) return true
    }

    // ownAll由来（持ち主フィールドの発生源から）。levelsは発生源のレベル条件のため、
    // instのlevelを見るtryEffectは使わず発生源のsourceLevelで判定する。
    // effectSources() でこのターンだけの仮想発生源（マジックが貸した継続効果。BS05リアニメイト）も含める
    const sources = effectSources(state, ownerPid)
    for (const source of sources) {
        if (source.instanceId === inst.instanceId) continue
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "reviveOnDestroy") continue
            if (forced && effect.id !== forced.effectId) continue
            if (effect.scope !== "ownAll") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.vanillaFilter && !instIsVanilla(inst)) continue
            if (effect.keywordFilter && !hasKeyword(inst.cardId, effect.keywordFilter)) continue
            // BS06夢中漂う桃幻郷：指定色を持つスピリットのみ対象
            if (effect.colorFilter && !instHasColor(inst, effect.colorFilter)) continue
            // 氷の魔女ヘル：指定系統を持つスピリットのみ対象（配列＝OR）
            if (effect.familyFilter && !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)) continue
            // BS03エスケープルート：カード静的な family 配列の要素数が指定数以上のスピリットのみ対象
            if (effect.minFamilies !== undefined && getCard(inst.cardId).family.length < effect.minFamilies) continue
            // 強者統べる大地：実効BPが閾値以上のスピリットのみ対象（破壊直前のBPで判定する）
            if (effect.minBp !== undefined && effectiveBp(state, ownerPid, inst) < effect.minBp) continue
            if (!matchesReviveCondition(effect.condition)) continue
            if (!matchesWhen(effect.when)) continue
            if (!matchesPhaseTurn(effect.phaseTurn)) continue
            if (oncePerTurnBlocked(effect, source)) continue
            // optional は self 由来と同じく保留する（発生源は source 側＝oncePerTurn の記録先）
            if (effect.optional && state.interactiveTargets && !forced) {
                queueReviveConfirm(state, ownerPid, inst, effect.id, source.instanceId, context)
                return true
            }
            if (!applyCost(effect)) continue
            markOncePerTurn(effect, source)
            const name = getCard(inst.cardId).name
            // BS07ブラックリチュアル：場に留める（手札へ戻す）前に破壊時効果を先に発揮させる
            if (effect.fireDestroyTriggerFirst) fireTrigger(state, ownerPid, inst, "onDestroy")
            applyRevived(effect.revived)
            log(
                state,
                `${player.name}の${name}は、${getCard(source.cardId).name}の効果で破壊される代わりに${revivedLabel(effect.revived)}。`,
            )
            return true
        }
    }

    return false
}

// 破壊対象ネクサスの持ち主（ownerPid）自身のフィールド（スピリット＋ネクサス）のみを走査し、
// レベル有効かつ condition（ownVanillaSpiritsAtLeast＝持ち主のバニラスピリット数）を満たす
// globalConstraint "ownNexusIndestructible" があるか判定する。
// hasGlobalConstraint は両陣営を走査する汎用判定だが、こちらは破壊対象の持ち主側のみに効く
// 制約（サファイアの城壁）専用の判定のため別関数にしている。
function hasOwnNexusIndestructible(state: GameState, ownerPid: PlayerId): boolean {
    const player = state.players[ownerPid]
    const instances = [...player.field.spirits, ...player.field.nexuses]
    for (const inst of instances) {
        const level = currentLevel(inst).level
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "ownNexusIndestructible") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.condition) {
                const vanillaCount = player.field.spirits.filter((s) =>
                    instIsVanilla(s),
                ).length
                if (vanillaCount < effect.condition.ownVanillaSpiritsAtLeast) continue
            }
            return true
        }
    }
    return false
}

// ネクサスを破壊する。破壊できたら true、破壊耐性（nexusIndestructible）で不発だった場合は false を返す
// （呼び出し側は戻り値でカウント・ドロー処理の可否を判定する。バスタースピア等）。
export function destroyNexus(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
    context?: DestroyContext,
): boolean {
    const player = state.players[ownerPid]
    const index = player.field.nexuses.findIndex(
        (n) => n.instanceId === instanceId,
    )
    if (index === -1) return false
    const inst = player.field.nexuses[index]
    if (!inst) return false
    // 破壊耐性（要塞皇オーディーンLv2-3等）：すべてのネクサスは破壊されない
    if (hasGlobalConstraint(state, "nexusIndestructible")) {
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}（ネクサス）は破壊されなかった（破壊耐性）。`,
        )
        return false
    }
    // 破壊耐性（サファイアの城壁Lv2）：破壊対象ネクサスの持ち主自身のフィールドに、
    // condition（バニラスピリット数）を満たす ownNexusIndestructible 発生源があれば破壊されない
    if (hasOwnNexusIndestructible(state, ownerPid)) {
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}（ネクサス）は破壊されなかった（破壊耐性）。`,
        )
        return false
    }
    player.field.nexuses.splice(index, 1)
    player.reserve += inst.cores
    player.trashCards.push(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）は破壊された。`)
    // フィールドイベント誘発「ネクサスが破壊されたとき」：破壊した/された側を問わず両陣営のフィールドから発火
    // （竜狩りのアーケオルニ）。バウンス（returnNexusToHand）はここを通らないため対象外
    fireFieldEventTriggers(state, ownerPid, "anyNexusDestroyed")
    fireFieldEventTriggers(state, opponentOf(ownerPid), "anyNexusDestroyed")
    // 直近に破壊されたネクサスを記録する（戦闘獣ジャッカーが「その破壊されたネクサス」を参照するため）
    state.lastDestroyedNexus = { pid: ownerPid, cardId: inst.cardId }
    // フィールドイベント誘発「自分のネクサスが破壊されたとき」：持ち主側のフィールドからのみ発火（シャークハンマー）。
    // 「**相手の**効果で破壊されたとき」限定のエントリ（BS07の各色ネクサス6枚）のために、
    // 効果による破壊か（sourceType あり）＋発生源が持ち主自身でないか、を eventInfo で渡す
    const byOpponentEffect =
        context?.sourceType !== undefined &&
        context.sourcePid !== undefined &&
        context.sourcePid !== ownerPid
    fireFieldEventTriggers(state, ownerPid, "ownNexusDestroyed", undefined, undefined, undefined, undefined, {
        byOpponentEffect,
    })
    return true
}

// ネクサスを持ち主の手札へ戻す（バウンス）：コアはリザーブへ、カードは手札へ。
// 破壊ではないため destroyNexus とは別処理（ネクサスに onDestroy はまだないが将来のため命名を揃える）。
export function returnNexusToHand(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
): void {
    const player = state.players[ownerPid]
    const index = player.field.nexuses.findIndex(
        (n) => n.instanceId === instanceId,
    )
    if (index === -1) return
    const inst = player.field.nexuses[index]
    if (!inst) return
    player.field.nexuses.splice(index, 1)
    player.reserve += inst.cores
    player.hand.push(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）は手札に戻った。`)
    notifyHandGained(state, ownerPid, 1)
}

// スピリットを持ち主の手札へ戻す（バウンス）：コアはリザーブへ、カードは手札へ。
// 破壊ではないため onDestroy は誘発しない（destroySpirit とは別処理）。
export function returnSpiritToHand(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): void {
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex(
        (s) => s.instanceId === inst.instanceId,
    )
    if (index === -1) return
    player.field.spirits.splice(index, 1)
    player.reserve += inst.cores
    player.hand.push(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}は手札に戻った。`)
    notifyHandGained(state, ownerPid, 1)
    // フィールドイベント誘発「自分のスピリットが手札に戻ったとき」（BS01リターンドロー）。
    // self には戻ったスピリットを渡す（すでにフィールドからは外れている）
    if (!state.winner) {
        fireFieldEventTriggers(state, ownerPid, "ownSpiritReturnedToHand", { pid: ownerPid, inst }, instColors(inst))
    }
}

// スピリットを持ち主のデッキの一番上へ戻す：コアはリザーブへ、カードはデッキトップへ。
// 破壊ではないため onDestroy は誘発しない。
export function returnSpiritToDeckTop(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): void {
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex(
        (s) => s.instanceId === inst.instanceId,
    )
    if (index === -1) return
    player.field.spirits.splice(index, 1)
    player.reserve += inst.cores
    player.deck.unshift(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}はデッキの一番上に戻った。`)
}

// スピリットをデッキの一番下へ戻す（returnSpiritToDeckTop のデッキ下版。BS04グラシアルブレス）。
// 上に置くか下に置くかだけの違いなので、コアの戻し先など他の扱いは揃えてある
export function returnSpiritToDeckBottom(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): void {
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex(
        (s) => s.instanceId === inst.instanceId,
    )
    if (index === -1) return
    player.field.spirits.splice(index, 1)
    player.reserve += inst.cores
    player.deck.push(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}はデッキの一番下に戻った。`)
}

// 相手のスピリットからコアを奪う効果が、そのスピリットに届くか（＝耐性で弾かれないか）。
//
// **なぜ必要か**: コアを1体ずつ選んで取る効果（coreRemove 等）は、対象選びの中で
// pickEnemyByBp / pickEnemyCandidates が装甲・免疫を弾いてくれる。しかし「範囲でまとめて奪う」
// 効果（幻龍シェイロン・氷の女神フリッグ等）は候補を自前で走査するため、その経路を通らず
// **【装甲】を素通りしていた**（2026-08-10 修正）。
// 現在は耐性の唯一の入口（resistanceAgainst）へ委譲している。この関数はコア除去用の別名にすぎず、
// **新しく書くハンドラは resistanceAgainst を直接呼んでよい**
export function canTakeCoresFrom(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    actorPid: PlayerId,
    srcColors?: Color[],
    srcType?: "spirit" | "nexus" | "magic",
): boolean {
    return !isResisted(state, ownerPid, inst, {
        op: "coreRemove",
        scope: "area",
        actorPid,
        ...(srcType !== undefined ? { sourceType: srcType } : {}),
        ...(srcColors !== undefined ? { sourceColors: srcColors } : {}),
    })
}

// コアを取り除き、維持コア（Lv1）を下回ったら消滅させる
// actorPid: このコア除去を引き起こした実行者（省略時は通知なし）。
// actorPid !== ownerPid（自分以外の効果でコアが取り除かれた）のとき、
// フィールドイベント「ownSpiritCoresRemovedByOpponent」を発火する（極光の大地）
export function removeCores(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
    actorPid?: PlayerId,
): number {
    // 戻り値＝**実際に取り除けた数**。バトル中の保護（BS05茨の決戦地Lv1）やコア下限
    // （BS08聖なる柱状彫刻）で減る場合があるため、呼び出し側が残数を数えるときは必ずこれを使う
    if (isBattlingCoreProtected(state, inst)) {
        log(state, `${getCard(inst.cardId).name}は、バトル中のためコアを取り除けなかった。`)
        return 0
    }
    const player = state.players[ownerPid]
    // coreReturnBonus（BS02チャウーLv2）：効果でリザーブへ置かれるコアの数を+する（両陣営の発生源が効く）。
    // 元のコア数を超えては取れないので、加算してから inst.cores で頭打ちにする
    const bonus = coreReturnBonusFor(state)
    if (bonus > 0 && inst.cores > count) {
        log(state, `リザーブに置かれるコアが${Math.min(bonus, inst.cores - count)}個追加された。`)
    }
    // coreFloorByCost（BS08聖なる柱状彫刻）：有効なら、このカードのコストを下回るまでは取り除けない
    const floor = coreFloorFor(state, inst)
    const removed = Math.min(count + bonus, Math.max(0, inst.cores - floor))
    inst.cores -= removed
    player.reserve += removed
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}からコア${removed}個を取り除いた。`,
    )
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (inst.cores < instMinLevelCores(inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1, removed)
    }
    return removed
}

// コアを取り除いて持ち主のトラッシュへ置き、維持コア（Lv1）を下回ったら消滅させる
// （魔帝の墓標Lv2「そのスピリット上のコア1個をトラッシュに置かなければならない」）
// actorPidの扱いはremoveCoresと同じ
export function removeCoresToTrash(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
    actorPid?: PlayerId,
): number {
    // 戻り値＝**実際に取り除けた数**。バトル中の保護（BS05茨の決戦地Lv1）やコア下限
    // （BS08聖なる柱状彫刻）で減る場合があるため、呼び出し側が残数を数えるときは必ずこれを使う
    if (isBattlingCoreProtected(state, inst)) {
        log(state, `${getCard(inst.cardId).name}は、バトル中のためコアを取り除けなかった。`)
        return 0
    }
    const player = state.players[ownerPid]
    // coreFloorByCost（BS08聖なる柱状彫刻）：有効なら、このカードのコストを下回るまでは取り除けない
    const removed = Math.min(count, Math.max(0, inst.cores - coreFloorFor(state, inst)))
    inst.cores -= removed
    player.trashCores += removed
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}のコア${removed}個をトラッシュに置いた。`,
    )
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (inst.cores < instMinLevelCores(inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1, removed)
    }
    return removed
}

// コアを取り除いてボイドへ送る（消滅させる。リザーブ・トラッシュどちらも増えない）。
// 維持コア（Lv1）を下回ったら消滅させる（BS04ヴェノムショット）。actorPidの扱いはremoveCoresと同じ
export function removeCoresToVoid(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
    actorPid?: PlayerId,
): number {
    // 戻り値＝**実際に取り除けた数**。バトル中の保護（BS05茨の決戦地Lv1）やコア下限
    // （BS08聖なる柱状彫刻）で減る場合があるため、呼び出し側が残数を数えるときは必ずこれを使う
    if (isBattlingCoreProtected(state, inst)) {
        log(state, `${getCard(inst.cardId).name}は、バトル中のためコアを取り除けなかった。`)
        return 0
    }
    const player = state.players[ownerPid]
    // coreFloorByCost（BS08聖なる柱状彫刻）：有効なら、このカードのコストを下回るまでは取り除けない
    const removed = Math.min(count, Math.max(0, inst.cores - coreFloorFor(state, inst)))
    inst.cores -= removed
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}のコア${removed}個をボイドに置いた。`,
    )
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (inst.cores < instMinLevelCores(inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1, removed)
    }
    return removed
}

// ---- アクションの実行 ----

// destroy/destroyExhausted/exhaust の costFilter 共通判定（BS04エンジン拡張バッチ2）。
// 指定なしは常にtrue、max/minはそれぞれ対象コストの上限/下限


// 相手スピリットから BP <= maxBp かつ extraPredicate を満たすものをすべて集める
// （pickEnemyByBp の自動選択・対象選択式の候補列挙の両方から使う共通フィルタ）。
// 耐性は resistanceAgainst に一本化してある（**個別の述語をここに書き足さないこと**）。
// targetPid はアクターの相手フィールドなので、実行者は opponentOf(targetPid) で確定する。
// scope は常に "targeted"（対象を1体選ぶ経路なので「相手の効果の対象にならない」が効く）。
// op: バウンス耐性・疲労耐性はこれを渡さないと効かない。**戻す／疲労させる効果の候補列挙では必ず渡すこと**
export function pickEnemyCandidates(
    state: GameState,
    targetPid: PlayerId,
    maxBp: number,
    extraPredicate: (s: CardInstance) => boolean = () => true,
    sourceColors?: Color[],
    sourceType?: "spirit" | "nexus" | "magic",
    op: EffectAttempt["op"] = "other",
): CardInstance[] {
    const attempt: EffectAttempt = {
        op,
        scope: "targeted",
        actorPid: opponentOf(targetPid),
        // **候補を数えているだけ**なので probing。コストを払って防ぐ耐性（竜騎集う円卓Lv2）は
        // ここでは成立させない（対象にはなってよく、払うのは実際に適用する1点だけ）
        probing: true,
        ...(sourceType !== undefined ? { sourceType } : {}),
        ...(sourceColors !== undefined ? { sourceColors } : {}),
    }
    return state.players[targetPid].field.spirits.filter(
        (s) =>
            effectiveBp(state, targetPid, s) <= maxBp &&
            !isResisted(state, targetPid, s, attempt) &&
            extraPredicate(s),
    )
}

// 「自分か相手のスピリット1体」を対象にする効果（action.anySide）の候補列挙。
// 相手側には装甲・マジック効果耐性・効果ブロックを適用し、**自分側には適用しない**
// （pickEnemyCandidates と同じ非対称ルール。自分の効果は自分のスピリットには免疫が働かない）。
// 並び順は相手側→自分側（自動選択時の同値優先も相手側が先になる）
export function pickAnySideCandidates(
    state: GameState,
    owner: PlayerId,
    matches: (s: CardInstance) => boolean,
    sourceColors?: Color[],
    sourceType?: "spirit" | "nexus" | "magic",
    op: EffectAttempt["op"] = "other",
): CardInstance[] {
    const opp = opponentOf(owner)
    return [
        ...pickEnemyCandidates(state, opp, Infinity, matches, sourceColors, sourceType, op),
        ...state.players[owner].field.spirits.filter(matches),
    ]
}

// 「自分か相手のスピリット1体」を対象にする効果（action.anySide）の自動選択（非対話時）で使う共通ロジック。
// 相手側は pickEnemyByBp（装甲・マジック効果耐性・効果ブロックを尊重）、自分側は matches のみで候補を集め、
// 実効BPが高い方を選ぶ（同値は相手側を優先。destroyExhaustedのanySide自動選択と同じ非対称ルール）
export function pickAnySideByBp(
    state: GameState,
    owner: PlayerId,
    maxBp: number,
    matches: (s: CardInstance) => boolean,
    sourceColors?: Color[],
    sourceType?: "spirit" | "nexus" | "magic",
    op: EffectAttempt["op"] = "other",
): { pid: PlayerId; inst: CardInstance } | null {
    const opp = opponentOf(owner)
    const oppCandidate = pickEnemyByBp(state, opp, maxBp, matches, sourceColors, sourceType, op)
    const ownCandidates = state.players[owner].field.spirits.filter(
        (s) => effectiveBp(state, owner, s) <= maxBp && matches(s),
    )
    const ownCandidate =
        ownCandidates.length > 0
            ? ownCandidates.reduce((best, s) =>
                  effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
              )
            : null
    if (oppCandidate && ownCandidate) {
        return effectiveBp(state, owner, ownCandidate) > effectiveBp(state, opp, oppCandidate)
            ? { pid: owner, inst: ownCandidate }
            : { pid: opp, inst: oppCandidate }
    }
    if (oppCandidate) return { pid: opp, inst: oppCandidate }
    if (ownCandidate) return { pid: owner, inst: ownCandidate }
    return null
}

// 相手スピリットから BP <= maxBp かつ extraPredicate を満たすものの中で
// 最もBPが高いものを1体選ぶ（疲労状態の絞り込みなどにも使い回す）
export function pickEnemyByBp(
    state: GameState,
    targetPid: PlayerId,
    maxBp: number,
    extraPredicate: (s: CardInstance) => boolean = () => true,
    sourceColors?: Color[],
    sourceType?: "spirit" | "nexus" | "magic",
    op: EffectAttempt["op"] = "other",
): CardInstance | null {
    const candidates = pickEnemyCandidates(state, targetPid, maxBp, extraPredicate, sourceColors, sourceType, op)
    if (candidates.length === 0) return null
    return candidates.reduce((best, s) =>
        effectiveBp(state, targetPid, s) > effectiveBp(state, targetPid, best) ? s : best,
    )
}

// interactiveTargets 有効時、count で複数体を処理するアクション（destroy/exhaust/destroyExhausted/
// returnToHand）の対象選択を requestChoice に委ねる共通ヘルパー。
// candidates が2件以上のときだけ pendingChoice を立てて true を返す（呼び出し側はそのまま return する）。
// 0/1件のときは false を返し、呼び出し側の既存の自動選択ループにフォールバックさせる。
// firstAction は今回1体分（count:1）、remainingAction は残り(count-1)分（無ければ null）。
// 呼び出し側で action の具体的なユニオン枝を保ったまま組み立てて渡す（ジェネリクスにすると
// EffectAction 全体のunionに対する交差型判定でTSエラーになるため、呼び出し側で narrowing する）。
export function tryInteractiveTargetChoice(
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    prompt: string,
    candidates: CardInstance[],
    firstAction: EffectAction,
    remainingAction: EffectAction | null,
    chooserPid?: PlayerId,
): boolean {
    if (!state.interactiveTargets) return false
    if (candidates.length < 2) return false
    // chooserPid 指定時は「選ぶのは chooserPid・効果を解決するのは owner」に分ける
    // （PendingChoice.actorPid。【暴風】＝相手が相手自身のスピリットを選んで疲労させる）
    const chooser = chooserPid ?? owner
    requestChoice(
        state,
        chooser,
        prompt,
        candidates.map((s) => s.instanceId),
        false,
        firstAction,
        self,
    )
    if (state.pendingChoice && chooser !== owner) state.pendingChoice.actorPid = owner
    if (remainingAction && state.pendingChoice) {
        state.pendingChoice.queue.unshift({
            selfInstanceId: self ? self.instanceId : null,
            action: remainingAction,
            ...(chooser !== owner ? { actorPid: owner } : {}),
        })
    }
    return true
}

// tryInteractiveTargetChoice のカード版：interactiveTargets有効時、count等で複数回に分けて
// 処理するカード選択アクション（discardOpponent/recoverSpiritFromTrash）の選択を
// requestCardChoice に委ねる共通ヘルパー。candidates(インデックス配列)が2件以上のときだけ
// pendingChoice を立てて true を返す（呼び出し側はそのまま return する）。
// 0/1件のときは false を返し、呼び出し側の既存の自動選択にフォールバックさせる。
export function tryInteractiveCardChoice(
    state: GameState,
    pid: PlayerId,
    self: CardInstance | null,
    prompt: string,
    cardZone: "hand" | "trash" | "reveal",
    cardIndices: number[],
    firstAction: EffectAction,
    remainingAction: EffectAction | null,
): boolean {
    if (!state.interactiveTargets) return false
    if (cardIndices.length < 2) return false
    requestCardChoice(state, pid, prompt, cardZone, cardIndices, false, firstAction, self)
    if (remainingAction && state.pendingChoice) {
        state.pendingChoice.queue.unshift({
            selfInstanceId: self ? self.instanceId : null,
            action: remainingAction,
        })
    }
    return true
}

// summonFromHandFree 共通の召喚実行部：指定した手札インデックスのスピリットを、
// 維持コアのみリザーブから払ってフィールドへ配置する（onSummon効果は発揮させない）。
// プレイヤー選択（chosenCardIndex）・自動選択（コスト最大）どちらの経路からも呼ぶ
export function summonFreeFromHandIndex(
    state: GameState,
    owner: PlayerId,
    sourceName: string,
    handIndex: number,
    skipTensho?: true,
): void {
    const player = state.players[owner]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    const card = getCard(cardId)
    const maintain = minLevelCores(card)
    if (player.reserve < maintain) {
        log(state, `${sourceName}：リザーブが足りず${card.name}を召喚できなかった。`)
        return
    }
    player.hand.splice(handIndex, 1)
    player.reserve -= maintain
    const inst = createInstance(cardId, state.turn, maintain)
    player.field.spirits.push(inst)
    log(
        state,
        `${player.name}は${sourceName}の効果で、${card.name}をコストを支払わずに召喚した。` +
            (skipTensho
                ? "（このスピリットの召喚時効果は発揮されない。【転召】も発揮したものとして扱う）"
                : "（このスピリットの召喚時効果は発揮されない）"),
    )
    // 【転召】は**コストを支払わない召喚でも必ず行う**（公式Q&A 2024-10-31：BS02ディバインウィンドで
    // 転召持ちを召喚しても転召は無視できない）。「召喚時効果は発揮されない」は転召を免除しない。
    // skipTensho指定時のみ例外（BS08雷帝竜騎レイブリッツ：「【転召】させずに召喚できる」の明記あり）
    if (!state.winner && !skipTensho) resolveTensho(state, owner, inst)
}

// summonFromTrashFree 共通の召喚実行部：summonFreeFromHandIndexのトラッシュ版。
// 指定したトラッシュインデックスのスピリットを、維持コアのみリザーブから払ってフィールドへ配置する
// （onSummon効果は発揮させない）。プレイヤー選択（chosenCardIndex）・自動選択（コスト最大）どちらの経路からも呼ぶ
export function summonFreeFromTrashIndex(
    state: GameState,
    owner: PlayerId,
    sourceName: string,
    trashIndex: number,
): void {
    const player = state.players[owner]
    const cardId = player.trashCards[trashIndex]
    if (cardId === undefined) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    const card = getCard(cardId)
    const maintain = minLevelCores(card)
    if (player.reserve < maintain) {
        log(state, `${sourceName}：リザーブが足りず${card.name}を召喚できなかった。`)
        return
    }
    player.trashCards.splice(trashIndex, 1)
    player.reserve -= maintain
    const inst = createInstance(cardId, state.turn, maintain)
    player.field.spirits.push(inst)
    log(
        state,
        `${player.name}は${sourceName}の効果で、トラッシュから${card.name}をコストを支払わずに召喚した。` +
            "（このスピリットの召喚時効果は発揮されない）",
    )
    // 【転召】は**コストを支払わない召喚でも必ず行う**（公式Q&A 2024-10-31：BS02ディバインウィンドで
    // 転召持ちを召喚しても転召は無視できない）。「召喚時効果は発揮されない」は転召を免除しない
    if (!state.winner) resolveTensho(state, owner, inst)
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

// 騎獣スレイプホース：マジックによるBPバフ（bpBuff/bpBuffPer）が対象に適用された直後にフックし、
// 条件を満たせばさらに magicBuffBonus 分のBP+を追加する。
// 効果文の『このスピリットのアタック時』／『自分のアタックステップ』条件は「バトル中または
// 自分のアタックステップ」で近似する簡略化とし、判定は state.phase === "attack" のみとする。
// actions/* の分割モジュールから参照するため export している
export function applyMagicBuffBonus(
    state: GameState,
    target: CardInstance,
    srcType?: "spirit" | "nexus" | "magic",
    srcColors?: Color[],
): void {
    if (srcType !== "magic") return
    if (state.phase !== "attack") return
    const found = findSpiritAny(state, target.instanceId)
    if (!found) return
    const targetOwner = found.pid
    for (const source of state.players[targetOwner].field.spirits) {
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "magicBuffBonus") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
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
            target.tempBpBuff += effect.amountBonus
            log(
                state,
                `${getCard(source.cardId).name}の効果で${getCard(target.cardId).name}はさらにBP+${effect.amountBonus}（ターン終了時まで）。`,
            )
        }
    }
}

// bpBuff / bpBuffPer 共通の対象選択：
// 対象指定があれば両プレイヤーから検索、なければバトル中の自分スピリット優先、
// いなければ自分フィールドの先頭スピリット
// minSymbols指定時、対象（明示指定・自動選択とも）はシンボル数がこれ以上のスピリットのみ有効
// （ライトニングバリスタ等。BS04エンジン拡張バッチ1）
// actions/* の分割モジュールから参照するため export している
export function pickBpBuffTarget(
    state: GameState,
    owner: PlayerId,
    targetInstanceId?: string,
    minSymbols?: number,
    keywordFilter?: Keyword,
    nameContains?: string | string[],
    attackingOnly?: boolean,
    familyFilter?: FamilyFilter,
): CardInstance | null {
    // minSymbols（シンボル数下限）・keywordFilter（キーワード保持。BS07ネクサスアタック＝【強襲】持ち）・
    // nameContains（カード名。BS07ウィリアンスラッシュ＝「勇者」。配列＝OR。BS08ダークパワー）・
    // attackingOnly（BS07桜の妖精オウカ＝アタックしているスピリット）・
    // familyFilter（系統。BS07ニードルショット＝「剣獣」）は、
    // どれも「対象になれるか」の絞り込み。対象指定・自動選択の両方で同じ条件を適用する
    const passes = (inst: CardInstance): boolean => {
        if (minSymbols !== undefined && instanceSymbolCount(inst) < minSymbols) return false
        if (keywordFilter !== undefined && !spiritHasKeyword(state, owner, inst, keywordFilter)) return false
        if (nameContains !== undefined) {
            const names = Array.isArray(nameContains) ? nameContains : [nameContains]
            if (!names.some((n) => cardNameContains(inst, n))) return false
        }
        if (attackingOnly && state.battle?.attackerInstanceId !== inst.instanceId) return false
        if (familyFilter !== undefined && !matchesFamilyFilter(state, owner, inst, familyFilter)) return false
        return true
    }
    if (targetInstanceId) {
        const found = findSpiritAny(state, targetInstanceId)
        if (!found) return null
        if (!passes(found.inst)) return null
        return found.inst
    }
    const mine = state.players[owner].field.spirits.filter(passes)
    let target: CardInstance | null = null
    if (state.battle) {
        target =
            mine.find(
                (s) =>
                    s.instanceId === state.battle?.attackerInstanceId ||
                    s.instanceId === state.battle?.blockerInstanceId,
            ) ?? null
    }
    if (!target) target = mine[0] ?? null
    return target
}

// grantKeyword 共通の対象選択：自分のスピリットのみが対象（targetInstanceId は自分側のみ有効）。
// 対象指定があれば自分フィールドから検索、なければバトル中の自分スピリット優先、
// いなければ自分フィールドの先頭スピリット
export function pickOwnKeywordTarget(
    state: GameState,
    owner: PlayerId,
    targetInstanceId?: string,
): CardInstance | null {
    const mine = state.players[owner].field.spirits
    if (targetInstanceId) {
        return mine.find((s) => s.instanceId === targetInstanceId) ?? null
    }
    let target: CardInstance | null = null
    if (state.battle) {
        target =
            mine.find(
                (s) =>
                    s.instanceId === state.battle?.attackerInstanceId ||
                    s.instanceId === state.battle?.blockerInstanceId,
            ) ?? null
    }
    if (!target) target = mine[0] ?? null
    return target
}

// 疲労状態の相手スピリット数（drawPer / bpBuffPer の "exhaustedEnemies" カウンタ）
function countExhaustedEnemies(state: GameState, owner: PlayerId, opp: PlayerId): number {
    return countSpiritsWeighted(state, owner, opp, (s) => s.isRested)
}

// selfBuffPer / bpBuffPer / voidCoreToSelfPer / drawPer / coreGainPer 共通のカウンタ集計（BS03バッチで統一）。
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
): number {
    const opp = opponentOf(owner)
    if (counter === "readyEnemies") {
        return countSpiritsWeighted(state, owner, opp, (s) => !s.isRested)
    }
    if (counter === "exhaustedEnemies") return countExhaustedEnemies(state, owner, opp)
    if (counter === "opponentHand") return state.players[opp].hand.length
    if (counter === "ownOtherSpirits") {
        return countSpiritsWeighted(state, owner, owner, (s) => s.instanceId !== self?.instanceId)
    }
    if (counter === "ownReserve") return state.players[owner].reserve
    if (counter === "ownNexuses") return state.players[owner].field.nexuses.length
    if (counter === "allNexuses") {
        return (
            state.players.p1.field.nexuses.length + state.players.p2.field.nexuses.length
        )
    }
    if (counter === "ownExhausted") {
        return countSpiritsWeighted(state, owner, owner, (s) => s.isRested)
    }
    if (counter === "allExhausted") {
        // 両陣営の疲労スピリット数の合計（BS05大甲帝デスタウロス：疲労状態のスピリット1体につき）
        return (
            countSpiritsWeighted(state, owner, owner, (s) => s.isRested) +
            countExhaustedEnemies(state, owner, opp)
        )
    }
    if (counter === "selfCoresAtDestruction") return self?.coresAtDestruction ?? 0
    if (counter === "lastBattleDestroyedCores") return state.lastBattleDestroyedCores
    if (counter === "opponentTrashCores") return state.players[opp].trashCores
    // selfSymbols：このスピリット（self）自身が持つシンボル数（BS05碧緑の竜使いグリューン）
    if (counter === "selfSymbols") return self ? instanceSymbolCount(self) : 0
    // targetSymbols：bpBuffPerハンドラが対象選択後に個別計算するため、このカウンタが直接ここに来ることは無い
    // （マジックはself=nullで対象基準のため。フォールスルー防止のためのプレースホルダ。BS06サベージパワー）
    if (counter === "targetSymbols") return 0
    // ownRestedNexuses：自分の疲労状態のネクサス数（【強襲】がネクサスを疲労させる。BS07ネクサスアタック）
    if (counter === "ownRestedNexuses") {
        return state.players[owner].field.nexuses.filter((n) => n.isRested).length
    }
    // 直前の【粉砕】で破棄した総枚数／うちスピリットカードの枚数（resolveFunsaiが記録。BS03巨人王ランドルフ／BS04二刀流のアムブローズ）
    if (counter === "lastFunsaiTotal") return state.lastFunsai?.total ?? 0
    if (counter === "lastFunsaiSpirits") return state.lastFunsai?.spirits ?? 0
    // { ownKeyword: Keyword }：自分フィールドで指定キーワードを持つスピリット数（BS05双剣虎ジェン・フー）
    if ("ownKeyword" in counter) {
        return countSpiritsWeighted(state, owner, owner, (s) =>
            spiritHasKeyword(state, owner, s, counter.ownKeyword),
        )
    }
    // { ownNameIncludes: string }：自分フィールドで、カード名に指定文字列を含むスピリット数
    if ("ownNameIncludes" in counter) {
        return countSpiritsWeighted(state, owner, owner, (s) =>
            cardNameContains(s, counter.ownNameIncludes),
        )
    }
    // { anyNameIncludes: string }：両陣営のフィールドで、カード名に指定文字列を含むスピリット数
    // （ownNameIncludesの両陣営版。BS06アルカナナイト・ヘクス：修飾なしの「スピリット1体につき」）
    if ("anyNameIncludes" in counter) {
        return (
            countSpiritsWeighted(state, owner, "p1", (s) => cardNameContains(s, counter.anyNameIncludes)) +
            countSpiritsWeighted(state, owner, "p2", (s) => cardNameContains(s, counter.anyNameIncludes))
        )
    }
    // { ownColor: Color }：自分フィールドの指定色スピリット数
    if ("ownColor" in counter) {
        return countSpiritsWeighted(state, owner, owner, (s) => instHasColor(s, counter.ownColor))
    }
    // { enemyCost: {max,min} }：相手フィールドのコスト条件を満たすスピリット数（BS07バジリザード）。
    // 道化師クランの付与コストも見る（instMatchesCostFilter）
    if ("enemyCost" in counter) {
        return countSpiritsWeighted(state, owner, opp, (s) =>
            instMatchesCostFilter(s, counter.enemyCost),
        )
    }
    // { ownNexusColor: Color }：自分フィールドの指定色ネクサス数（BS03武器コレクターのゴドフリー）
    if ("ownNexusColor" in counter) {
        return state.players[owner].field.nexuses.filter((n) =>
            instHasColor(n, counter.ownNexusColor),
        ).length
    }
    // { ownColorSymbols: Color }：自分フィールドのスピリットが持つ指定色シンボルの合計数
    if ("ownColorSymbols" in counter) {
        return state.players[owner].field.spirits.reduce(
            (sum, s) =>
                sum + getCard(s.cardId).symbol.filter((c) => c === counter.ownColorSymbols).length,
            0,
        )
    }
    // { ownFamily: string }：自分のフィールドの指定系統スピリット数（familyGrant による付与も含む）
    // （onDestroy等で発火する場合、selfはこの時点ですでにフィールドから除去済みのため含まれない）
    return state.players[owner].field.spirits.filter((s) =>
        spiritHasFamily(state, owner, s, counter.ownFamily),
    ).length
}

// 効果ドロー倍化（封印された魔導書）：owner のフィールドにレベル有効かつ phaseTurn 一致の
// kind:"drawDouble" があれば2を返す（重複しない＝複数あっても2倍まで）。
// draw / drawPer アクションの枚数確定箇所からのみ参照する（deckReveal・通常のドローステップは対象外）
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
export function resolveAction(
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    action: EffectAction,
    targetInstanceId?: string,
    sourceColors?: Color[],
    sourceType?: "spirit" | "nexus" | "magic",
    chosenOption?: string,
    chosenCardIndex?: number,
    sourceCardId?: string,
): void {
    const opp = opponentOf(owner)
    const sourceName = self ? getCard(self.cardId).name : "効果"
    const srcColors = sourceColors ?? (self ? instColors(self) : undefined)
    // マジック効果耐性（ポークン）判定用。self があればそのカード種別（マジックはself=nullなので
    // 呼び出し側=resolveMagicが明示的に"magic"を渡す）
    const srcType = sourceType ?? (self ? getCard(self.cardId).type : undefined)
    const srcCardId = sourceCardId ?? (self ? self.cardId : undefined)
    // 相手スピリットを破壊する際に渡す破壊コンテキスト（reviveOnDestroy判定用）。
    // exactOptionalPropertyTypes対応：srcTypeがundefinedのときはプロパティ自体を省略する
    const destroyContext: DestroyContext =
        srcType !== undefined ? { sourcePid: owner, sourceType: srcType } : { sourcePid: owner }

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
    handler(ctx, action)

}

// 「〜できる」（EffectDef.triggered.optional）の発動確認。
// 選択肢は「発動する」1つだけで、スキップ（選ばない）＝発動しない。
// confirm:true により、選んだラベルは chosenOption として action に渡らない
// （渡すと grantColorChoice / grantFamilyChoiceAll のように選択肢を解釈するアクションが誤動作する）
export function requestActivationConfirm(
    state: GameState,
    pid: PlayerId,
    prompt: string,
    action: EffectAction,
    self: CardInstance | null,
): void {
    state.pendingChoice = {
        pid,
        kind: "option",
        prompt,
        candidates: [],
        options: ["発動する"],
        optional: true,
        confirm: true,
        action,
        selfInstanceId: self ? self.instanceId : null,
        queue: [],
    }
}

// 選択を要するアクションの共通ヘルパー。候補が0件なら不発、1件なら即座に解決、
// 2件以上なら state.pendingChoice を立てて GameAction "resolveChoice" を待つ
export function requestChoice(
    state: GameState,
    pid: PlayerId,
    prompt: string,
    candidates: string[],
    optional: boolean,
    action: EffectAction,
    self: CardInstance | null,
    kind: "target" | "option" = "target",
    options?: string[],
): void {
    if (kind === "option") {
        // 選択肢固定式：意図的な選択を必要とするため候補が1件でも自動選択しない
        state.pendingChoice = {
            pid,
            kind: "option",
            prompt,
            candidates: [],
            options: options ?? [],
            optional,
            action,
            selfInstanceId: self ? self.instanceId : null,
            queue: [],
        }
        return
    }
    if (candidates.length === 0) {
        log(state, `${self ? getCard(self.cardId).name : "効果"}：対象がいなかった。`)
        return
    }
    const only = candidates[0]
    if (candidates.length === 1 && only !== undefined) {
        resolveAction(state, pid, self, action, only)
        return
    }
    state.pendingChoice = {
        pid,
        kind: "target",
        prompt,
        candidates,
        optional,
        action,
        selfInstanceId: self ? self.instanceId : null,
        queue: [],
    }
}

// requestChoice の kind:"card" 版：自分の手札／トラッシュのカードから選ばせる共通ヘルパー。
// 候補が0件なら不発、1件なら即座に resolveAction（chosenCardIndex渡し）で解決、
// 2件以上なら state.pendingChoice(kind:"card") を立てて GameAction "resolveChoice"（cardIndex）を待つ。
// pid＝選択するプレイヤー＝ゾーンの持ち主（cardOwner）。discardOpponentのように選択者が
// 効果の使用者と異なる場合は、呼び出し側が pid にその選択者を渡す（resolveAction の owner
// 引数と食い違うため、対象特定は action 側に埋め込んで持ち回ること。discardOpponent の
// forcedTargetPid を参照）
export function requestCardChoice(
    state: GameState,
    pid: PlayerId,
    prompt: string,
    cardZone: "hand" | "trash" | "reveal",
    cardIndices: number[],
    optional: boolean,
    action: EffectAction,
    self: CardInstance | null,
    // 候補が1枚でも自動解決せず必ず選択を出す。「〜できる」（任意発動）の効果で、
    // 候補が1枚しかないときも「やらない」を選べるようにするために使う（BS05トランスマイグレーション）
    alwaysAsk = false,
): void {
    if (cardIndices.length === 0) {
        log(state, `${self ? getCard(self.cardId).name : "効果"}：対象がいなかった。`)
        return
    }
    const only = cardIndices[0]
    if (!alwaysAsk && cardIndices.length === 1 && only !== undefined) {
        resolveAction(state, pid, self, action, undefined, undefined, undefined, undefined, only)
        return
    }
    state.pendingChoice = {
        pid,
        kind: "card",
        prompt,
        candidates: [],
        cardZone,
        cardOwner: pid,
        cardIndices,
        optional,
        action,
        selfInstanceId: self ? self.instanceId : null,
        queue: [],
    }
}

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
            resolveAction(state, owner, selfInstance, effect.action, targetInstanceId)
        }
        // 選択待ちが立ったら、残りの一致エントリ＋付与分をqueueに積んで中断する
        if (state.pendingChoice) {
            const remaining = effects.slice(i + 1).filter(matches)
            state.pendingChoice.queue.push(
                ...remaining.map((e) => ({ selfInstanceId: selfInstance.instanceId, action: e.action })),
                ...grantedActions.map((a) => ({ selfInstanceId: selfInstance.instanceId, action: a })),
            )
            return
        }
    }
    for (let i = 0; i < grantedActions.length; i++) {
        const grantedAction = grantedActions[i]
        if (!grantedAction) continue
        resolveAction(state, owner, selfInstance, grantedAction, targetInstanceId)
        if (state.pendingChoice) {
            const remaining = grantedActions.slice(i + 1)
            state.pendingChoice.queue.push(
                ...remaining.map((a) => ({ selfInstanceId: selfInstance.instanceId, action: a })),
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
                    const total = countSpiritsWeighted(state, pid, pid, (s) =>
                        matchesFamilyFilter(state, pid, s, family),
                    )
                    if (total < count) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownHandAtLeast" in effect.condition) {
                    // 水蛇シーサーペンタ：持ち主の手札が指定枚数以上のときのみ発火（Lvごとに閾値が変わる）
                    if (state.players[pid].hand.length < effect.condition.ownHandAtLeast) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownRefreshedSpiritsAtLeast" in effect.condition) {
                    // 紫水晶の森Lv2：自分のフィールドに回復状態のスピリットが指定体数以上いるときのみ発火
                    const refreshed = countSpiritsWeighted(state, pid, pid, (s) => !s.isRested)
                    if (refreshed < effect.condition.ownRefreshedSpiritsAtLeast) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownNameIncludesCountAtLeast" in effect.condition) {
                    // 郵便ペンタン：カード名にいずれかの文字列を含む自分のスピリットが合計count体以上いるときのみ発火
                    const { names, count } = effect.condition.ownNameIncludesCountAtLeast
                    const total = countSpiritsWeighted(state, pid, pid, (s) =>
                        names.some((n) => cardNameContains(s, n)),
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
    },
): void {
    const player = state.players[pid]
    // effectSources()：このターンだけの仮想発生源（マジックが貸した継続効果。lendSelfThisTurn。
    // BS05ソウルクラッシュ）も含める。「誰が誘発効果を出しているか」を問うA分類の走査
    // （TURN_EFFECT_SOURCES.md §1）
    const instances = effectSources(state, pid)
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
                    const total = countSpiritsWeighted(state, pid, pid, (s) =>
                        matchesFamilyFilter(state, pid, s, family),
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
    for (const ownerPid of all) {
        for (const source of effectSources(state, ownerPid)) {
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "bothSidesTargetRedirect") continue
                if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
                const excluded = beneficial ? opponentOf(ownerPid) : ownerPid
                log(
                    state,
                    `${getCard(source.cardId).name}：このマジックの効果の対象を${state.players[opponentOf(excluded)].name}のみに変更した。（どちらに変更するかは簡略化）`,
                )
                return all.filter((p) => p !== excluded)
            }
        }
    }
    return all
}

// 果て無き地平線Lv1（kind:"battleBpAsLevel"）：バトルのBP比較のときだけ、指定レベルのスピリットが
// 別のレベルのBPを使う。effectiveBp（バフ・オーラ込み）に「使うレベルのBP − 本来のレベルのBP」の差を足す形で
// 実装するので、BP増減の効果とは独立して働く。GameEngine.resolveBattle からのみ呼ぶ
// （効果の対象条件やオーラのBP判定には影響させない ＝「バトルでBPを比べるとき」の限定を守る）
export function battleBp(state: GameState, pid: PlayerId, inst: CardInstance): number {
    const base = effectiveBp(state, pid, inst)
    const level = currentLevel(inst).level
    for (const source of effectSources(state, pid)) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "battleBpAsLevel") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.fromLevel !== level) continue
            // keywordFilter（BS06神葉樹の森Lv2）：指定キーワードを持つスピリットのみ対象
            if (effect.keywordFilter && !spiritHasKeyword(state, pid, inst, effect.keywordFilter)) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && pid === state.turnPlayer) continue
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
function setMagicRedirect(
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
export function findMagicNegateSource(
    state: GameState,
    casterPid: PlayerId,
    card: CardData,
): { pid: PlayerId; inst: CardInstance; effect: Extract<EffectDef, { kind: "magicNegate" }> } | null {
    const defenderPid = opponentOf(casterPid)
    for (const inst of effectSources(state, defenderPid)) {
        const level = currentLevel(inst).level
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "magicNegate") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            if (effect.turn === "own" && defenderPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && defenderPid === state.turnPlayer) continue
            // 【氷壁：赤】＝赤のマジックのみ無効にできる
            if (effect.colors !== undefined && !effect.colors.some((c) => card.colors.includes(c))) continue
            if (effect.oncePerTurn && inst.magicNegateUsedTurn === state.turn) continue
            // コストを払えないなら発動できない
            if ("exhaustSelf" in effect.cost) {
                if (inst.isRested) continue
            } else if (inst.cores < effect.cost.selfCoresToVoid) {
                continue
            }
            return { pid: defenderPid, inst, effect }
        }
    }
    return null
}

// 無効化のコストを支払い、ログを残す。呼び出し側はこのあとマジックの効果を解決しない
function payMagicNegate(
    state: GameState,
    found: { pid: PlayerId; inst: CardInstance; effect: Extract<EffectDef, { kind: "magicNegate" }> },
    card: CardData,
): void {
    const { pid, inst, effect } = found
    if ("exhaustSelf" in effect.cost) {
        exhaustSpirit(state, pid, inst)
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
    consumeOncePerBattleMagicFree(state, owner, card)
    emitEvent(state, { type: "magic", pid: owner, cardName: card.name })

    // マジックの無効化（鏡の回廊Lv2／今後の【氷壁】）。効果を1つも解決する前に判定する。
    // 実対戦（interactiveTargets）では防御側に「無効にするか」を確認し、
    // 自動解決（テスト・非interactive）ではコストを払える限り無効にする
    const negate = findMagicNegateSource(state, owner, card)
    if (negate) {
        if (state.interactiveTargets) {
            state.pendingChoice = {
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
                queue: [],
            }
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
            state.pendingChoice = {
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
                queue: [],
            }
            return
        }
    }

    resolveMagicEffects(state, owner, cardId, timing, targetInstanceId)
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
function resolveMagicEffects(
    state: GameState,
    owner: PlayerId,
    cardId: string,
    timing: "main" | "flash",
    targetInstanceId?: string,
): void {
    // BS07大天使イスフィール：使用者のフィールドに magicRepeatGrant が有効な発生源があれば、
    // 効果の並びをもう1周する。判定は1周目を始める前に固定する（1周目の結果で発生源が場を離れても
    // 「発揮後にもう1度」は約束どおり行う）
    const repeat = hasMagicRepeatGrant(state, owner, true)
    runMagicActions(state, owner, cardId, timing, targetInstanceId)
    // 選択待ちで中断したときは、残りの効果を pendingChoice の queue が引き継いでいるのでここで抜ける
    if (state.pendingChoice) return
    if (repeat && !state.winner) {
        log(state, `${getCard(cardId).name}の効果をもう1度発揮する。`)
        runMagicActions(state, owner, cardId, timing, targetInstanceId)
        if (state.pendingChoice) return
    }
    fireMagicUsedTriggers(state, owner, getCard(cardId), timing)
}

// 使用者pidのフィールドに kind:"magicRepeatGrant" の有効な発生源があるか（BS07大天使イスフィール）。
// consume=true のときは oncePerBattle の発生源を「このバトルで使い切った」として記録する
// （呼び出し元は resolveMagicEffects の1箇所だけ。ここが再発揮を確定させる時点なので、
// 消費もここで行う。無償化側とは消費点が違うのでリストを分けている＝BattleState のコメント参照）
function hasMagicRepeatGrant(state: GameState, pid: PlayerId, consume = false): boolean {
    for (const source of effectSources(state, pid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "magicRepeatGrant") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.condition === "selfInBattle" && !isSelfInBattle(state, source.instanceId)) continue
            if (effect.oncePerBattle) {
                if (!state.battle) continue // バトル外では消費を記録できないので成立させない
                const used = (state.battle.oncePerBattleMagicRepeatUsed ??= [])
                if (used.includes(source.instanceId)) continue
                if (consume) used.push(source.instanceId)
            }
            return true
        }
    }
    return false
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
                const total = countSpiritsWeighted(state, owner, owner, (s) =>
                    spiritHasFamily(state, owner, s, family),
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
        setMagicRedirect(state, owner, targetInstanceId, effect.action)
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
            state.pendingChoice.queue.push(
                ...remaining.map((e) => ({ selfInstanceId: null, action: e.action })),
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
