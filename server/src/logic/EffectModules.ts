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
    pushResumeFrames,
    suspend,
} from "./GameState"
// 共有ルール層（shared/）へ移設した純粋述語。サーバー／クライアントで同一実装を使う。
// 外部から EffectModules 経由で import している箇所を壊さないため、再エクスポートで名前を残す
// 分割した triggers.ts の関数を内部でも使う（再エクスポートとは別に import が要る）。
// 相互 import になるが CommonJS の循環requireで安全（ファイル冒頭の注記を参照）
// 分割した removal.ts の関数を内部でも使う（再エクスポートとは別に import が要る）
import { destroySpirit } from "./removal"
import {
    fireFieldEventTriggers,
    fireSummonTrigger,
    fireTrigger,
    notifyHandGained,
    notifyNexusDeployed,
    notifySpiritCoresRemovedByOpponent,
    resolveMagicEffects,
} from "./triggers"
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
    // 「〜することで」は任意コスト。払うかどうかはプレイヤーの方針（GameAction "setPayToNegate"）を読む。
    // ここは装甲と同じ同期の述語なので、その場で選択を挟めない代わりに**あらかじめ盤面の状態にしておく**。
    // 未設定は true（従来どおり払って防ぐ）
    if (player.payToNegate === false) return null
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

// 召喚が済んだ後にまとめて走る処理：『このスピリットの召喚時』効果 →「自分のスピリットが
// 召喚されたとき」のフィールド誘発 → 天使長ファニムの疲労付与、の順。
//
// **【転召】より後に呼ぶこと**（2026-08-13 修正）。以前は召喚時効果が転召より先に発揮されていた。
// 正しい順序は「召喚できるかの判定 → 転召の対象選択 → 対象の消滅 → 召喚 → 召喚時効果」。
// 転召の対象選択で中断した場合は、GameEngine が action:"summonSequence" として
// pendingChoice.queue に積み直すので、選択の解決後にここへ合流する
export function fireSummonSequence(state: GameState, pid: PlayerId, inst: CardInstance): void {
    if (state.winner) return
    const player = state.players[pid]
    // 転召でコアが尽きて消滅していれば、もう何もしない
    if (!player.field.spirits.some((s) => s.instanceId === inst.instanceId)) return
    fireSummonTrigger(state, pid, inst)
    const stillOnField = (): boolean => player.field.spirits.some((s) => s.instanceId === inst.instanceId)
    if (!state.winner && stillOnField()) {
        fireFieldEventTriggers(state, pid, "ownSpiritSummoned", { pid, inst }, undefined, undefined, undefined, {
            families: getCard(inst.cardId).family,
        })
    }
    // 天使長ファニム：召喚した側（pid）から見た相手が summonedExhaustGrant を持つ間、
    // 召喚されたこのスピリットは疲労する
    if (!state.winner && stillOnField() && hasSummonedExhaustGrant(state, opponentOf(pid))) {
        exhaustSpirit(state, pid, inst)
    }
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
// そのカードが指定レベルで持つ【転召】（無ければ null）。
// 召喚の可否判定（RuleValidator.validateSummon）と解決（resolveTensho）で同じ実装を通す
// entry は【転召】の keyword エントリそのもの（実行時カバレッジ計測が __eid を読む）
export function tenshoSpecOf(
    card: CardData,
    level: number,
): { entry: EffectDef; minCost: number; dest: "trash" | "void" } | null {
    const effect = card.effects.find(
        (e) => e.kind === "keyword" && e.keyword === "tensho" && effectActiveAtLevel(e.levels, level),
    )
    if (!effect || effect.kind !== "keyword") return null
    return { entry: effect, minCost: effect.minCost ?? 0, dest: effect.dest ?? "trash" }
}

// 【転召】でコアを置く対象になれる自分のスピリット。
// 場のスピリットのコストを条件にする判定なので、道化師クランの付与コストも見る。
// tenshoSelfCostBonus（BS08冥機グングニル）：このコスト判定でだけ候補自身のコストに+amountする。
// excludeInstanceId には召喚された本人を渡す（召喚前の可否判定では省略する＝場にまだいないため）
export function tenshoCandidates(
    state: GameState,
    ownerPid: PlayerId,
    minCost: number,
    excludeInstanceId?: string,
): CardInstance[] {
    return state.players[ownerPid].field.spirits.filter(
        (s) =>
            s.instanceId !== excludeInstanceId &&
            (instMatchesCostFilter(s, { min: minCost }) ||
                getCard(s.cardId).cost + tenshoSelfCostBonus(state, ownerPid, s) >= minCost),
    )
}

export function resolveTensho(
    state: GameState,
    ownerPid: PlayerId,
    spirit: CardInstance,
): void {
    const level = currentLevel(spirit).level
    const spec = tenshoSpecOf(getCard(spirit.cardId), level)
    if (!spec) return
    const { minCost, dest } = spec
    const candidates = tenshoCandidates(state, ownerPid, minCost, spirit.instanceId)
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
    // 誘発が選択で中断したら、残り（置換の判断以降）を再開フレームに積んでここで止める。
    // 【転召】の手順は「コアを外す＋対象スピリットの効果発揮 → 対象の消滅 → 召喚時効果」の順で、
    // **消滅は効果の発揮が解決しきってから**でなければならない（2026-08-13 ユーザー確認）
    if (state.pendingChoice) {
        pushResumeFrames(state, [{
            kind: "action",
            selfInstanceId: inst.instanceId,
            actorPid: ownerPid,
            action: { type: "tenshoResume", dest, stage: "afterTargetTrigger", ...(skipSubstitute ? { skipSubstitute: true } as const : {}) },
        }])
        return
    }
    tenshoAfterTargetTrigger(state, ownerPid, inst, dest, skipSubstitute)
}

// dumpAllCoresTensho の後半：置換（疲労で代替）の判断 → 『転召が解決したとき』の誘発 → コア処理。
// onTenshoTarget の誘発で中断したときは、再開フレーム（tenshoResume "afterTargetTrigger"）から呼ばれる
export function tenshoAfterTargetTrigger(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    dest: "trash" | "void",
    skipSubstitute: boolean,
): void {
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
    // 『転召が解決したとき』の誘発が中断したら、コア処理と消滅は選択が終わってから。
    // ここを見ていなかったため、選択待ちのまま destroySpirit が走り、
    // その先の『破壊されたとき』の誘発が中断できない状態になっていた（2026-08-13 修正）
    if (state.pendingChoice) {
        pushResumeFrames(state, [{
            kind: "action",
            selfInstanceId: inst.instanceId,
            actorPid: ownerPid,
            action: { type: "tenshoResume", dest, stage: "afterEvent" },
        }])
        return
    }
    tenshoDumpAndDestroy(state, ownerPid, inst, dest)
}

// 【転召】の最終段：対象の上のコアをすべて dest へ置き、維持コア割れなら消滅させる。
// 手順上「対象スピリットの消滅」は転召の効果発揮がすべて解決した後に来るので、
// 中断をまたぐときはここだけを再開フレームで呼び直す
export function tenshoDumpAndDestroy(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    dest: "trash" | "void",
): void {
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
        pushResumeFrames(state, [{
            kind: "action",
            selfInstanceId: self ? self.instanceId : null,
            action: remainingAction,
            ...(chooser !== owner ? { actorPid: owner } : {}),
        }])
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
        pushResumeFrames(state, [{
            kind: "action",
            selfInstanceId: self ? self.instanceId : null,
            action: remainingAction,
        }])
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
function countExhaustedEnemies(state: GameState, owner: PlayerId, opp: PlayerId, sourceType?: CardType): number {
    return countSpiritsWeighted(state, owner, opp, (s) => s.isRested, sourceType)
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
    suspend(state, {
        pid,
        kind: "option",
        prompt,
        candidates: [],
        options: ["発動する"],
        optional: true,
        confirm: true,
        action,
        selfInstanceId: self ? self.instanceId : null,
    })
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
    // 選ぶのが効果の持ち主ではない場合の選択者（「**相手は**〜する」。BS07ブリシンガメンの首飾り）。
    // 解決自体は発生源の持ち主の効果として行うため、actorPid に owner を残す（tryInteractiveTargetChoice と同じ形）
    chooserPid?: PlayerId,
): void {
    if (kind === "option") {
        // 選択肢固定式：意図的な選択を必要とするため候補が1件でも自動選択しない
        suspend(state, {
            pid,
            kind: "option",
            prompt,
            candidates: [],
            options: options ?? [],
            optional,
            action,
            selfInstanceId: self ? self.instanceId : null,
        })
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
    suspend(state, {
        pid: chooserPid ?? pid,
        kind: "target",
        prompt,
        candidates,
        optional,
        action,
        selfInstanceId: self ? self.instanceId : null,
        ...(chooserPid !== undefined && chooserPid !== pid ? { actorPid: pid } : {}),
    })
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
    // スキップされたときも action を（cardIndex なしで）解決する。選び終わってから
    // 後処理がある効果で使う（PendingChoice.resolveOnSkip。BS08堕天使ミカファール）
    resolveOnSkip = false,
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
    suspend(state, {
        pid,
        kind: "card",
        prompt,
        candidates: [],
        cardZone,
        cardOwner: pid,
        cardIndices,
        optional,
        ...(resolveOnSkip ? { resolveOnSkip: true as const } : {}),
        action,
        selfInstanceId: self ? self.instanceId : null,
    })
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
    fireBattleWonTriggers,
    fireStepTriggers,
    fireFieldEventTriggers,
    notifyHandGained,
    notifyNexusDeployed,
    bothSidesPids,
    battleBp,
    applyJugekiCoreToVoid,
    notifySpiritCoresRemovedByOpponent,
    findMagicNegateSource,
    resolveMagic,
    applyMagicRedirectChoice,
    applyMagicNegateChoice,
    declineMagicNegateChoice,
} from "./triggers"

// ---- スピリット／ネクサスの除去（server/src/logic/removal.ts へ分割。2026-08-10）----
// 呼び出し側を変えずに済むよう、ここから再エクスポートする
export {
    destroySpirit,
    tryHandFreeSummonOnLifeDamaged,
    applyHandFreeSummon,
    applyReviveConfirm,
    declineReviveConfirm,
    destroyNexus,
    returnNexusToHand,
    returnSpiritToHand,
    returnSpiritToDeckTop,
    returnSpiritToDeckBottom,
    canTakeCoresFrom,
    removeCores,
    removeCoresToTrash,
    removeCoresToVoid,
} from "./removal"
