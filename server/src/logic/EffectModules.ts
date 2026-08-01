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
    Color,
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
    minLevelCores,
    opponentOf,
    rawLevel,
} from "./GameState"
// 共有ルール層（shared/）へ移設した純粋述語。サーバー／クライアントで同一実装を使う。
// 外部から EffectModules 経由で import している箇所を壊さないため、再エクスポートで名前を残す
import ACTION_HANDLERS from "./actions"
import type { ActionCtx } from "./actions/types"
import type { KeywordInfo } from "../../../shared/rules"
export type { KeywordInfo }
import {
    activeConstraints,
    auraAmount,
    auraAppliesTo,
    checkAuraCondition,
    costCantAct,
    countAuraCounter,
    countSymbols,
    effectActiveAtLevel,
    effectiveBp,
    effectSources,
    hasArmorAgainst,
    hasContinuousKeywordGrant,
    hasGlobalConstraint,
    hasMagicImmunity,
    hasKeyword,
    instanceSymbolCount,
    instColors,
    instHasColor,
    instHasCost,
    isUntargetableByOpponent,
    isVanillaCard,
    isVirtualSource,
    cardNameContains,
    matchesTarget,
    KEYWORDS,
    instMatchesCostFilter,
    matchesCostFilter,
    matchesFamilyFilter,
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
    countSymbols,
    effectActiveAtLevel,
    effectiveBp,
    effectSources,
    hasArmorAgainst,
    hasContinuousKeywordGrant,
    hasGlobalConstraint,
    hasMagicImmunity,
    hasKeyword,
    instanceSymbolCount,
    instColors,
    instHasColor,
    instHasCost,
    isUntargetableByOpponent,
    isVanillaCard,
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
export function isEffectBlocked(
    state: GameState,
    inst: CardInstance,
    sourceType: "spirit" | "nexus" | "magic" | undefined,
): boolean {
    // ② 対象の絞り込み（マジック限定。絞り込み先の持ち主のスピリットだけが影響を受ける）
    const redirect = state.magicRedirectTo
    if (
        redirect !== undefined &&
        sourceType === "magic" &&
        inst.instanceId !== redirect.instanceId &&
        state.players[redirect.pid].field.spirits.some((s) => s.instanceId === inst.instanceId)
    ) {
        return true
    }
    // ① バトル中の効果免疫
    if (sourceType !== "spirit" && sourceType !== "magic") return false
    if (!isInCurrentBattle(state, inst)) return false
    return hasActiveGlobalConstraint(state, "battlingEffectImmune")
}

// スピリットのコアが効果／手動操作で増減したとき、相手フィールドの exhaustOnManualCoreAdd 持ち
// 発生源（レベル有効。effectSources経由でlendSelfThisTurnの貸与も対応）があれば、
// そのスピリットを疲労させる。
// opts省略時（従来のmoveCore/awaken呼び出し）＝手動操作かつ増加時のみ、持ち主の相手のメインステップ限定
// （夢魔の寝所）。opts.viaEffect:true＝効果（EffectAction）による増減時に判定し、フェーズ不問
// （BS05アブソーブシンボル。isRemoval:trueの減少側はeffect.onRemoveがある場合のみ反応する）
export function checkExhaustOnCoreChange(
    state: GameState,
    affectedPid: PlayerId,
    affectedInst: CardInstance,
    opts: { viaEffect: boolean; isRemoval: boolean } = { viaEffect: false, isRemoval: false },
): void {
    if (affectedInst.isRested) return
    if (!opts.viaEffect && state.phase !== "main") return
    const sourcePid = opponentOf(affectedPid)
    for (const source of effectSources(state, sourcePid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "exhaustOnManualCoreAdd") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            const wantsEffect = effect.trigger === "effect"
            if (wantsEffect !== opts.viaEffect) continue
            if (opts.viaEffect && opts.isRemoval && !effect.onRemove) continue
            affectedInst.isRested = true
            log(
                state,
                `${getCard(source.cardId).name}の効果で、${getCard(affectedInst.cardId).name}は疲労した。`,
            )
            return
        }
    }
}

// 【粉砕】: デッキ上から count 枚を持ち主のトラッシュへ送る（不足時はある分だけ）。
// デッキが0枚になっても敗北にはしない（敗北は既存どおりドロー不能時のみ、drawで判定）。
// actorPid（このミルを引き起こした実行者）を渡すと、actorPid !== pid（相手の効果による）のときのみ
// millCapFor(pid) の上限で count をクランプする（BS05エターナルシールド。自分自身のミル＝粉砕を
// 自分のデッキに向ける等では上限を適用しない。省略時は従来どおり上限なし）。
// 戻り値は実際に破棄した枚数（ownFunsaiMilledの発火判定・repeatPerCountに使う）
export function millDeck(state: GameState, pid: PlayerId, count: number, actorPid?: PlayerId): number {
    let effectiveCount = count
    if (actorPid !== undefined && actorPid !== pid) {
        effectiveCount = Math.min(effectiveCount, millCapFor(state, pid))
        // ターン累計の上限（BS04侵されざる聖域Lv2：ターンに5枚まで）
        effectiveCount = Math.min(effectiveCount, millCapPerTurnRemaining(state, pid))
    }
    const player = state.players[pid]
    const actual = Math.min(effectiveCount, player.deck.length)
    for (let i = 0; i < actual; i++) {
        const cardId = player.deck.shift()
        if (cardId === undefined) break
        player.trashCards.push(cardId)
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
    return actual
}

// 持ち主フィールドの funsaiBonus（崩壊する戦線）合計：【粉砕】の破棄枚数に加算する
function funsaiBonusTotal(state: GameState, ownerPid: PlayerId): number {
    const player = state.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    let total = 0
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "funsaiBonus") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            total += effect.amount
        }
    }
    return total
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

// 【粉砕】の解決：spirit が現在レベルで粉砕を持つなら、相手のデッキを
// （現在レベル + funsaiBonus合計）枚破棄する（アタック時／funsaiOnBlockによるブロック時の共通処理）。
// 実破棄枚数が1以上なら fieldEvent "ownFunsaiMilled" を発火する（repeatPerCount対応）
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
    const actual = millDeck(state, opponentOf(ownerPid), level + bonus, ownerPid)
    if (actual > 0) {
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
    const candidates = state.players[ownerPid].field.spirits.filter(
        (s) => s.instanceId !== spirit.instanceId && getCard(s.cardId).cost >= minCost,
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
    // 自動選択（プレイヤー選択の決定的簡略化）：コスト最大の1体
    const chosen = candidates.reduce((best, s) =>
        getCard(s.cardId).cost > getCard(best.cardId).cost ? s : best,
    )
    dumpAllCoresTensho(state, ownerPid, chosen, dest)
}

// 対象スピリットの上のコアすべてをdestへ置く（trash=持ち主のトラッシュ、void=消滅）。
// 維持コア割れは既存の消滅処理に委ねる（【転召】／resolveAction "tenshoCoreDump" 共通）
export function dumpAllCoresTensho(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    dest: "trash" | "void",
): void {
    // constraint "tenshoCoreSubstitute"（BS05白亜の竜使いアルブス）：疲労していなければ、
    // 疲労することでコアを置いたものとして扱う（実際にはコアを失わない代替。すでに疲労中は通常のコア移動になる）
    if (!inst.isRested && activeConstraints(state, ownerPid, inst).some((c) => c.type === "tenshoCoreSubstitute")) {
        inst.isRested = true
        log(state, `【転召】${getCard(inst.cardId).name}は疲労し、コアをそのまま維持した。`)
        return
    }
    const player = state.players[ownerPid]
    const count = inst.cores
    inst.cores = 0
    if (dest === "trash") {
        player.trashCores += count
        log(state, `【転召】${getCard(inst.cardId).name}のコア${count}個をトラッシュに置いた。`)
    } else {
        log(state, `【転召】${getCard(inst.cardId).name}のコア${count}個をボイドに置いた。`)
    }
    if (inst.cores < minLevelCores(getCard(inst.cardId))) {
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

// 相手のカード効果を一切受けないか（フェザーバリア）。範囲効果（destroyAll 等）にも免疫。
// ワルキューレの untargetable は範囲には無力なので、こちらは immuneToOpponentThisTurn のみ。
export function isImmuneToArea(inst: CardInstance): boolean {
    return inst.immuneToOpponentThisTurn
}

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

// 【疲労しない】（kind: "exhaustImmunityGrant"）：inst（targetOwnerPidの持ち主）が、相手の効果による
// 疲労を受けないか。呼び出し側は「疲労させようとしている側がtargetOwnerPidと異なる場合のみ」呼ぶこと
// （自分の効果による疲労は防がない。トランプの王国）
export function isExhaustImmune(
    state: GameState,
    targetOwnerPid: PlayerId,
    inst: CardInstance,
): boolean {
    const player = state.players[targetOwnerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "exhaustImmunityGrant") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (!spiritHasFamily(state, targetOwnerPid, inst, effect.familyFilter)) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && targetOwnerPid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && targetOwnerPid === state.turnPlayer) continue
            }
            return true
        }
    }
    return false
}

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
            delete inst.colorsAsContinuous
            delete inst.armorColorsGranted
            delete inst.alsoCostsContinuous
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
                        if (effect.familyFilter && !spiritHasFamily(state, pid, spirit, effect.familyFilter)) continue
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
                if (effect.condition) {
                    if ("maxOwnSpirits" in effect.condition) {
                        if (player.field.spirits.length > effect.condition.maxOwnSpirits) continue
                    } else if ("ownFieldHasFamily" in effect.condition) {
                        // 鼠人チューリヒ：発生源の持ち主のフィールドに指定系統を持つスピリットがいる間有効
                        const family = effect.condition.ownFieldHasFamily
                        if (!player.field.spirits.some((s) => spiritHasFamily(state, pid, s, family))) continue
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
                } else if (effect.target === "ownSpiritsVanilla") {
                    // カードに効果の記述を持たない（バニラ）持ち主のスピリットすべて（サファイアの城壁）
                    for (const spirit of player.field.spirits) {
                        if (!isVanillaCard(getCard(spirit.cardId))) continue
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
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
    if (cause === "destroy" && tryReviveOnDestroy(state, ownerPid, inst, context)) {
        return
    }

    // 破壊直前のコア数を記録（リザーブへ移す前。漆黒鳥ヤタグロスの coreGainPer: selfCoresAtDestruction）
    inst.coresAtDestruction = inst.cores

    player.field.spirits.splice(index, 1)
    player.reserve += inst.cores
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
        vanilla: isVanillaCard(master),
        byBattle: context?.battle !== undefined,
        families: master.family,
        cost: master.cost,
    })
}

// reviveOnDestroy の判定と実行。復活できたら true を返す（呼び出し側 destroySpirit はそのまま return する）。
// 優先順位: instのカード自身が持つ scope:"self" の効果 → 持ち主フィールドの scope:"ownAll" の効果（先に見つかった方）。
function tryReviveOnDestroy(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    context?: DestroyContext,
): boolean {
    const player = state.players[ownerPid]
    const level = currentLevel(inst).level

    const matchesWhen = (when: {
        byOpponentEffect?: boolean
        byBattleVsArmorColor?: boolean
        byBattle?: boolean
        byBattleKillerLevel?: number
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
        return true
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

    const tryEffect = (effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>, sourceName: string): boolean => {
        if (!effectActiveAtLevel(effect.levels, level)) return false
        if (effect.vanillaFilter && !isVanillaCard(getCard(inst.cardId))) return false
        if (!matchesRequireOwnFieldHasName(effect.requireOwnFieldHasName)) return false
        if (!matchesWhen(effect.when)) return false
        if (!matchesPhaseTurn(effect.phaseTurn)) return false
        if (!applyCost(effect)) return false
        const name = getCard(inst.cardId).name
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
            if (effect.scope !== "ownAll") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.vanillaFilter && !isVanillaCard(getCard(inst.cardId))) continue
            if (effect.keywordFilter && !hasKeyword(inst.cardId, effect.keywordFilter)) continue
            // 氷の魔女ヘル：指定系統を持つスピリットのみ対象（配列＝OR）
            if (effect.familyFilter && !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)) continue
            // 強者統べる大地：実効BPが閾値以上のスピリットのみ対象（破壊直前のBPで判定する）
            if (effect.minBp !== undefined && effectiveBp(state, ownerPid, inst) < effect.minBp) continue
            if (!matchesWhen(effect.when)) continue
            if (!matchesPhaseTurn(effect.phaseTurn)) continue
            if (!applyCost(effect)) continue
            const name = getCard(inst.cardId).name
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
                    isVanillaCard(getCard(s.cardId)),
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
    // フィールドイベント誘発「自分のネクサスが破壊されたとき」：持ち主側のフィールドからのみ発火（シャークハンマー）
    fireFieldEventTriggers(state, ownerPid, "ownNexusDestroyed")
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
): void {
    if (isBattlingCoreProtected(state, inst)) {
        log(state, `${getCard(inst.cardId).name}は、バトル中のためコアを取り除けなかった。`)
        return
    }
    const player = state.players[ownerPid]
    const removed = Math.min(count, inst.cores)
    inst.cores -= removed
    player.reserve += removed
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}からコア${removed}個を取り除いた。`,
    )
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (inst.cores < minLevelCores(getCard(inst.cardId))) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1)
    }
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
): void {
    if (isBattlingCoreProtected(state, inst)) {
        log(state, `${getCard(inst.cardId).name}は、バトル中のためコアを取り除けなかった。`)
        return
    }
    const player = state.players[ownerPid]
    const removed = Math.min(count, inst.cores)
    inst.cores -= removed
    player.trashCores += removed
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}のコア${removed}個をトラッシュに置いた。`,
    )
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (inst.cores < minLevelCores(getCard(inst.cardId))) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1)
    }
}

// コアを取り除いてボイドへ送る（消滅させる。リザーブ・トラッシュどちらも増えない）。
// 維持コア（Lv1）を下回ったら消滅させる（BS04ヴェノムショット）。actorPidの扱いはremoveCoresと同じ
export function removeCoresToVoid(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
    actorPid?: PlayerId,
): void {
    if (isBattlingCoreProtected(state, inst)) {
        log(state, `${getCard(inst.cardId).name}は、バトル中のためコアを取り除けなかった。`)
        return
    }
    const player = state.players[ownerPid]
    const removed = Math.min(count, inst.cores)
    inst.cores -= removed
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}のコア${removed}個をボイドに置いた。`,
    )
    if (removed > 0) checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: true })
    if (inst.cores < minLevelCores(getCard(inst.cardId))) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
    if (actorPid !== undefined && actorPid !== ownerPid && removed > 0) {
        notifySpiritCoresRemovedByOpponent(state, ownerPid, 1)
    }
}

// ---- アクションの実行 ----

// destroy/destroyExhausted/exhaust の costFilter 共通判定（BS04エンジン拡張バッチ2）。
// 指定なしは常にtrue、max/minはそれぞれ対象コストの上限/下限


// 相手スピリットから BP <= maxBp かつ extraPredicate を満たすものをすべて集める
// （pickEnemyByBp の自動選択・対象選択式の候補列挙の両方から使う共通フィルタ）
// sourceColors: 効果発生源の色（装甲判定用。不明なら undefined＝装甲を貫通しない）
// sourceType: 効果発生源の種別（マジック効果耐性判定用。"magic" のときのみ hasMagicImmunity を追加チェック）
export function pickEnemyCandidates(
    state: GameState,
    targetPid: PlayerId,
    maxBp: number,
    extraPredicate: (s: CardInstance) => boolean = () => true,
    sourceColors?: Color[],
    sourceType?: "spirit" | "nexus" | "magic",
): CardInstance[] {
    return state.players[targetPid].field.spirits.filter(
        // targetPid はアクターの相手フィールド。免疫スピリット・装甲該当・マジック効果耐性該当は対象選択から除外する
        (s) =>
            effectiveBp(state, targetPid, s) <= maxBp &&
            !isUntargetableByOpponent(s) &&
            !isEffectBlocked(state, s, sourceType) &&
            !hasArmorAgainst(s, sourceColors) &&
            !(sourceType === "magic" && hasMagicImmunity(state, targetPid, s)) &&
            extraPredicate(s),
    )
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
): CardInstance | null {
    const candidates = pickEnemyCandidates(state, targetPid, maxBp, extraPredicate, sourceColors, sourceType)
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
): boolean {
    if (!state.interactiveTargets) return false
    if (candidates.length < 2) return false
    requestChoice(
        state,
        owner,
        prompt,
        candidates.map((s) => s.instanceId),
        false,
        firstAction,
        self,
    )
    if (remainingAction && state.pendingChoice) {
        state.pendingChoice.queue.unshift({
            selfInstanceId: self ? self.instanceId : null,
            action: remainingAction,
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
    cardZone: "hand" | "trash",
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
            "（このスピリットの召喚時効果は発揮されない）",
    )
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
): CardInstance | null {
    if (targetInstanceId) {
        const found = findSpiritAny(state, targetInstanceId)
        if (!found) return null
        if (minSymbols !== undefined && instanceSymbolCount(found.inst) < minSymbols) {
            return null
        }
        return found.inst
    }
    const mine = state.players[owner].field.spirits.filter(
        (s) => minSymbols === undefined || instanceSymbolCount(s) >= minSymbols,
    )
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
function countExhaustedEnemies(state: GameState, opp: PlayerId): number {
    return state.players[opp].field.spirits.filter((s) => s.isRested).length
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
        return state.players[opp].field.spirits.filter((s) => !s.isRested).length
    }
    if (counter === "exhaustedEnemies") return countExhaustedEnemies(state, opp)
    if (counter === "opponentHand") return state.players[opp].hand.length
    if (counter === "ownOtherSpirits") {
        return state.players[owner].field.spirits.filter(
            (s) => s.instanceId !== self?.instanceId,
        ).length
    }
    if (counter === "ownReserve") return state.players[owner].reserve
    if (counter === "ownNexuses") return state.players[owner].field.nexuses.length
    if (counter === "allNexuses") {
        return (
            state.players.p1.field.nexuses.length + state.players.p2.field.nexuses.length
        )
    }
    if (counter === "ownExhausted") {
        return state.players[owner].field.spirits.filter((s) => s.isRested).length
    }
    if (counter === "allExhausted") {
        // 両陣営の疲労スピリット数の合計（BS05大甲帝デスタウロス：疲労状態のスピリット1体につき）
        return (
            state.players[owner].field.spirits.filter((s) => s.isRested).length +
            countExhaustedEnemies(state, opp)
        )
    }
    if (counter === "selfCoresAtDestruction") return self?.coresAtDestruction ?? 0
    if (counter === "lastBattleDestroyedCores") return state.lastBattleDestroyedCores
    if (counter === "opponentTrashCores") return state.players[opp].trashCores
    // selfSymbols：このスピリット（self）自身が持つシンボル数（BS05碧緑の竜使いグリューン）
    if (counter === "selfSymbols") return self ? instanceSymbolCount(self) : 0
    // { ownKeyword: Keyword }：自分フィールドで指定キーワードを持つスピリット数（BS05双剣虎ジェン・フー）
    if ("ownKeyword" in counter) {
        return state.players[owner].field.spirits.filter((s) =>
            spiritHasKeyword(state, owner, s, counter.ownKeyword),
        ).length
    }
    // { ownNameIncludes: string }：自分フィールドで、カード名に指定文字列を含むスピリット数
    if ("ownNameIncludes" in counter) {
        return state.players[owner].field.spirits.filter((s) =>
            getCard(s.cardId).name.includes(counter.ownNameIncludes),
        ).length
    }
    // { ownColor: Color }：自分フィールドの指定色スピリット数
    if ("ownColor" in counter) {
        return state.players[owner].field.spirits.filter((s) =>
            instHasColor(s, counter.ownColor),
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
    cardZone: "hand" | "trash",
    cardIndices: number[],
    optional: boolean,
    action: EffectAction,
    self: CardInstance | null,
): void {
    if (cardIndices.length === 0) {
        log(state, `${self ? getCard(self.cardId).name : "効果"}：対象がいなかった。`)
        return
    }
    const only = cardIndices[0]
    if (cardIndices.length === 1 && only !== undefined) {
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
// battleRole は onBattle 専用の追加引数：勝利した側の役割（attacker/blocker）を渡す。
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
    const card = getCard(selfInstance.cardId)
    const level = currentLevel(selfInstance).level
    // ブレイブチャージ：この個体の『アタック時』効果は、このターンの間『ブロック時』へ移る。
    // アタック時には発揮されなくなり（＝移し替え）、ブロック時に『ブロック時』効果と一緒に発揮される
    const movedToBlock = selfInstance.attackTriggersAsBlockThisTurn === true
    if (movedToBlock && event === "onAttack") {
        return
    }
    const firedEvents: TriggerEvent[] =
        movedToBlock && event === "onBlock" ? ["onBlock", "onAttack"] : [event]
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
            }
        }
        return true
    }
    // 付与された誘発効果（kind: "effectGrant"。アルカナビースト・ケン）：持ち主フィールドの発生源から
    // target/nameIncludes 一致でこのインスタンスに継続付与された誘発効果を、静的effectsの末尾に合成する
    // （grantedのlevelsは常に有効扱い。発生源自身もnameIncludes一致すれば対象に含む）
    const grantedActions = collectGrantedTriggerActions(state, owner, selfInstance, event)

    const effects = card.effects
    for (let i = 0; i < effects.length; i++) {
        const effect = effects[i]
        if (!effect || !matches(effect)) continue
        resolveAction(state, owner, selfInstance, effect.action, targetInstanceId)
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
): EffectAction[] {
    const sources = [
        ...state.players[owner].field.spirits,
        ...state.players[owner].field.nexuses,
    ]
    const actions: EffectAction[] = []
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "effectGrant") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.granted.trigger !== event) continue
            if (
                effect.nameIncludes &&
                !getCard(selfInstance.cardId).name.includes(effect.nameIncludes)
            ) {
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
            // lentOnly：仮想発生源からのみ有効（実在カードが同じエントリを持っても恒久化させない）
            if (effect.lentOnly && !isVirtualSource(inst)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.turn === "own" && winnerPid !== state.turnPlayer) continue
            if (effect.vanillaWinnerOnly && !isVanillaCard(getCard(winnerInst.cardId))) continue
            // 勝利したスピリットのカード名で絞る（BS04獣使いドヴェルグ＝「鎧装獣」／ニーベルングリング＝「ジーク」）
            if (
                effect.winnerNameContains !== undefined &&
                !cardNameContains(winnerInst, effect.winnerNameContains)
            ) {
                continue
            }
            const actionSelf = effect.selfMode === "source" ? inst : winnerInst
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

// 指定ステップに到達したときの誘発（ネクサス・スピリット共通）を、
// ターンプレイヤー側 → 相手側の順に、各プレイヤー内ではスピリット→ネクサスの順で発火する。
// 1件実行するたびに勝敗をチェックし、決着していれば残りは発火させない。
// refreshedInstanceIds はリフレッシュステップで実際に回復（isRested: true → false）した
// インスタンスの集合（PhaseManagerが渡す）。selfWasRefreshedThisStep 条件の判定に使う（省略可）
export function fireStepTriggers(
    state: GameState,
    step: Phase,
    refreshedInstanceIds?: Set<string>,
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
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.condition === "handNotGreaterThanOpponent" && !checkStepCondition(state, pid, effect.condition)) continue
                if (effect.condition === "selfWasRefreshedThisStep" && !refreshedInstanceIds?.has(inst.instanceId)) continue
                if (effect.condition && typeof effect.condition === "object" && "ownColorTotalAtLeast" in effect.condition) {
                    // 道化師クラン：自分のフィールドに指定色のスピリット+ネクサスが合計count以上あるときのみ発火
                    const { color, count } = effect.condition.ownColorTotalAtLeast
                    const total = instances.filter((s) => instHasColor(s, color)).length
                    if (total < count) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownFamilyCountAtLeast" in effect.condition) {
                    // 王蛇の住処：自分のフィールドに指定系統（配列＝OR）のスピリットがcount体以上いるときのみ発火
                    const { family, count } = effect.condition.ownFamilyCountAtLeast
                    const total = state.players[pid].field.spirits.filter((s) =>
                        matchesFamilyFilter(state, pid, s, family),
                    ).length
                    if (total < count) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownHandAtLeast" in effect.condition) {
                    // 水蛇シーサーペンタ：持ち主の手札が指定枚数以上のときのみ発火（Lvごとに閾値が変わる）
                    if (state.players[pid].hand.length < effect.condition.ownHandAtLeast) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownNameIncludesCountAtLeast" in effect.condition) {
                    // 郵便ペンタン：カード名にいずれかの文字列を含む自分のスピリットが合計count体以上いるときのみ発火
                    const { names, count } = effect.condition.ownNameIncludesCountAtLeast
                    const total = state.players[pid].field.spirits.filter((s) =>
                        names.some((n) => getCard(s.cardId).name.includes(n)),
                    ).length
                    if (total < count) continue
                }
                resolveAction(state, pid, inst, effect.action)
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
        families?: string[]
        magicCost?: number
        magicTiming?: "main" | "flash"
        cost?: number
    },
): void {
    const player = state.players[pid]
    const instances = [...player.field.spirits, ...player.field.nexuses]
    for (const inst of instances) {
        const card = getCard(inst.cardId)
        const level = currentLevel(inst).level
        for (const effect of card.effects) {
            if (effect.kind !== "fieldEvent") continue
            if (effect.event !== event) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            if (effect.turn === "own" && pid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && pid === state.turnPlayer) continue
            if (effect.colorFilter !== undefined && !(eventColors ?? []).includes(effect.colorFilter)) continue
            if (effect.vanillaOnly && !eventInfo?.vanilla) continue
            if (effect.byBattleOnly && !eventInfo?.byBattle) continue
            // 破壊/消滅したスピリットのコストで絞る（BS05天使クレイオ：コスト2）
            if (effect.costFilter !== undefined && !matchesCostFilter(eventInfo?.cost ?? -1, effect.costFilter)) continue
            // 「一度に◯枚以上破棄したとき」（アリゲイド）：eventCount が閾値以上のときのみ
            if (effect.minEventCount !== undefined && (eventCount ?? 0) < effect.minEventCount) continue
            // 相手のマジック使用（氷の女神フリッグ）：コスト／タイミングの一致で絞る
            if (effect.magicCostEquals !== undefined && eventInfo?.magicCost !== effect.magicCostEquals) continue
            if (effect.magicTiming !== undefined && eventInfo?.magicTiming !== effect.magicTiming) continue
            if (effect.familyFilter !== undefined) {
                // 配列指定はいずれかの系統を持てばよい（OR。BS04七龍帝の玉座＝古竜/龍帝）
                const wanted = Array.isArray(effect.familyFilter)
                    ? effect.familyFilter
                    : [effect.familyFilter]
                if (!wanted.some((f) => eventInfo?.families?.includes(f))) continue
            }
            // 召喚されたスピリットがこのキーワードを静的に持つときのみ（BS05最古龍の顎：転召持ちが召喚されたとき）
            if (
                effect.keywordFilter !== undefined &&
                !hasKeyword((selfOverride?.inst ?? inst).cardId, effect.keywordFilter)
            ) {
                continue
            }
            if (effect.condition) {
                if (effect.condition === "selfIsAttacking") {
                    // キノコノコ：発生源自身が現在のバトルのアタッカーであるときのみ
                    if (!state.battle || state.battle.attackerInstanceId !== inst.instanceId) continue
                } else if ("ownColorTotalAtLeast" in effect.condition) {
                    // 花の子リップ：発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上
                    const { color, count } = effect.condition.ownColorTotalAtLeast
                    const sources = [...player.field.spirits, ...player.field.nexuses]
                    const total = sources.filter((s) => instHasColor(s, color)).length
                    if (total < count) continue
                } else if ("ownFamilyCountAtLeast" in effect.condition) {
                    // 魔力満ちる泉：発生源の持ち主のフィールドに指定系統のスピリットがcount体以上
                    const { family, count } = effect.condition.ownFamilyCountAtLeast
                    const total = player.field.spirits.filter((s) =>
                        matchesFamilyFilter(state, pid, s, family),
                    ).length
                    if (total < count) continue
                } else {
                    // 修理屋バラン・バラン：発生源の持ち主のフィールドに指定色のネクサスがある
                    const color = effect.condition.ownFieldHasColorNexus
                    if (!player.field.nexuses.some((n) => instHasColor(n, color))) continue
                }
            }
            // repeatPerCount（バラン・バラン「置かれるたび」）: 実破棄枚数ぶんアクションを繰り返す
            const repeatTimes = effect.repeatPerCount && eventCount ? eventCount : 1
            for (let i = 0; i < repeatTimes; i++) {
                // selfMode:"source" 指定時は、イベント対象ではなく発生源自身を self にする
                // （BS04鎧装獣ヘイズ・ルーン：相手のコスト1以下がアタックしたとき「このスピリットは回復する」）
                if (effect.selfMode === "source") {
                    resolveAction(state, pid, inst, effect.action, targetInstanceId)
                } else if (selfOverride) {
                    resolveAction(
                        state,
                        selfOverride.pid,
                        selfOverride.inst,
                        effect.action,
                        targetInstanceId,
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

// フィールドイベント誘発「自分のスピリット上のコアが相手の効果でリザーブ/トラッシュへ置かれたとき」
// （極光の大地）。spiritOwnerPid視点で発火し、affectedCount=影響を受けたスピリット数。
// removeCores / removeCoresToTrash（actorPid !== ownerPidのとき）から呼ばれる
export function notifySpiritCoresRemovedByOpponent(
    state: GameState,
    spiritOwnerPid: PlayerId,
    affectedCount: number,
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
    const defenderPid = opponentOf(casterPid)
    for (const inst of state.players[defenderPid].field.spirits) {
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "magicTargetRedirect") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(inst).level)) continue
            // 『相手のターン』＝発生源の持ち主がターンプレイヤーでないとき
            if (effect.turn === "opponent" && defenderPid === state.turnPlayer) continue
            if (targetInstanceId !== undefined && targetInstanceId !== inst.instanceId) continue
            // そもそもこのアクションの絞り込みに合致しなければ「対象に含む」ではない
            // （例: BP3000以下を破壊するマジックに対し、BP4000のサンクは対象外＝絞り込みは起きない）
            if (!redirectTargetMatches(state, defenderPid, inst, action)) continue
            state.magicRedirectTo = { pid: defenderPid, instanceId: inst.instanceId }
            log(
                state,
                `${getCard(inst.cardId).name}：このマジックの効果の対象を、このスピリットのみにした。`,
            )
            return
        }
    }
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
    emitEvent(state, { type: "magic", pid: owner, cardName: card.name })
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
                const total = state.players[owner].field.spirits.filter((s) =>
                    spiritHasFamily(state, owner, s, family),
                ).length
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
