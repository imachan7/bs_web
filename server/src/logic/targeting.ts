// 効果の対象の選び方（候補の列挙・自動選択）と、プレイヤーへの選択待ち（pendingChoice）の発行
import { findSpiritAny, isResisted, resolveAction } from "./EffectModules"
import type { CardInstance, CardType, Color, EffectAction, FamilyFilter, GameState, Keyword, PlayerId } from "../type"
import { getCard, log, opponentOf, pushResumeFrames, suspend } from "./GameState"
import { applyBothSidesRedirectToCandidates, bothSidesRedirectKeepPid } from "./triggers"
import type { EffectAttempt } from "../../../shared/rules"
import {
    effectiveBp,
    instanceSymbolCount,
    instIsVanilla,
    cardNameContains,
    matchesFamilyFilter,
    spiritHasKeyword,
    instIsCombined,
} from "../../../shared/rules"

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
    sourceType?: CardType,
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
            // **バウンス待機中は「戻ることに無関係な効果」の対象にならない**
            // （バトスピ Wiki「バウンスについて」。破壊待機中は対象に取れるので扱いが違う）
            !s.pendingBounce &&
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
    sourceType?: CardType,
    op: EffectAttempt["op"] = "other",
): CardInstance[] {
    const opp = opponentOf(owner)
    // 封印された魔導書Lv1：マジックの効果なら、片側だけに変更する選択が済んでいる場合がある
    return applyBothSidesRedirectToCandidates(state, sourceType, [
        ...pickEnemyCandidates(state, opp, Infinity, matches, sourceColors, sourceType, op),
        // 自分側もバウンス待機中は対象外（相手側は pickEnemyCandidates が弾く）
        ...state.players[owner].field.spirits.filter((s) => !s.pendingBounce && matches(s)),
    ])
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
    sourceType?: CardType,
    op: EffectAttempt["op"] = "other",
): { pid: PlayerId; inst: CardInstance } | null {
    const opp = opponentOf(owner)
    // 封印された魔導書Lv1：片側だけに変更する選択が済んでいれば、その側からしか選ばない
    const keepPid = bothSidesRedirectKeepPid(state, sourceType)
    const oppCandidate =
        keepPid !== null && keepPid !== opp
            ? null
            : pickEnemyByBp(state, opp, maxBp, matches, sourceColors, sourceType, op)
    const ownCandidates =
        keepPid !== null && keepPid !== owner
            ? []
            : state.players[owner].field.spirits.filter(
                  (s) => !s.pendingBounce && effectiveBp(state, owner, s) <= maxBp && matches(s),
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
    sourceType?: CardType,
    op: EffectAttempt["op"] = "other",
): CardInstance | null {
    const candidates = pickEnemyCandidates(state, targetPid, maxBp, extraPredicate, sourceColors, sourceType, op)
    if (candidates.length === 0) return null
    return candidates.reduce((best, s) =>
        effectiveBp(state, targetPid, s) > effectiveBp(state, targetPid, best) ? s : best,
    )
}

// destroy.lowestCost（BS12-084マーキュリーゴブレット）：相手スピリットからコスト最小のものを1体選ぶ
// （同コストは実効BP最大。pickEnemyByBpのBP最大既定を裏返した版）
export function pickEnemyLowestCost(
    state: GameState,
    targetPid: PlayerId,
    extraPredicate: (s: CardInstance) => boolean = () => true,
    sourceColors?: Color[],
    sourceType?: CardType,
): CardInstance | null {
    const candidates = pickEnemyCandidates(state, targetPid, Infinity, extraPredicate, sourceColors, sourceType, "other")
    if (candidates.length === 0) return null
    return candidates.reduce((best, s) => {
        const sCost = getCard(s.cardId).cost
        const bestCost = getCard(best.cardId).cost
        if (sCost !== bestCost) return sCost < bestCost ? s : best
        return effectiveBp(state, targetPid, s) > effectiveBp(state, targetPid, best) ? s : best
    })
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

// bpBuff の「対象になれるか」の判定。
// minSymbols（シンボル数下限）・keywordFilter（キーワード保持。BS07ネクサスアタック＝【強襲】持ち）・
// nameContains（カード名。BS07ウィリアンスラッシュ＝「勇者」。配列＝OR。BS08ダークパワー）・
// attackingOnly（BS07桜の妖精オウカ＝アタックしているスピリット）・
// familyFilter（系統。BS07ニードルショット＝「剣獣」）は、
// どれも「対象になれるか」の絞り込み。対象指定・自動選択の両方で同じ条件を適用する。
// anySide の候補列挙（actions/buff.ts）からも呼ぶため export している
export function bpBuffTargetPasses(
    state: GameState,
    owner: PlayerId,
    inst: CardInstance,
    minSymbols?: number,
    keywordFilter?: Keyword,
    nameContains?: string | string[],
    attackingOnly?: boolean,
    familyFilter?: FamilyFilter,
    combinedFilter?: boolean,
    vanillaFilter?: boolean,
): boolean {
    if (minSymbols !== undefined && instanceSymbolCount(inst) < minSymbols) return false
    if (keywordFilter !== undefined && !spiritHasKeyword(state, owner, inst, keywordFilter)) return false
    if (nameContains !== undefined) {
        const names = Array.isArray(nameContains) ? nameContains : [nameContains]
        if (!names.some((n) => cardNameContains(inst, n))) return false
    }
    if (attackingOnly && state.battle?.attackerInstanceId !== inst.instanceId) return false
    if (familyFilter !== undefined && !matchesFamilyFilter(state, owner, inst, familyFilter)) return false
    if (combinedFilter !== undefined && instIsCombined(inst) !== combinedFilter) return false
    // vanillaFilter（BS12-083マジックランプ「効果の記述を持たないスピリット1体をBP+」）
    if (vanillaFilter === true && !instIsVanilla(inst)) return false
    return true
}

// bpBuff の対象選択：
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
    combinedFilter?: boolean,
    vanillaFilter?: boolean,
): CardInstance | null {
    const passes = (inst: CardInstance): boolean =>
        bpBuffTargetPasses(state, owner, inst, minSymbols, keywordFilter, nameContains, attackingOnly, familyFilter, combinedFilter, vanillaFilter)
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
    // 断ったときに「ターンに1回」の消費を戻す対象（oncePerTurn を持つ triggered / fieldEvent。2026-09-16）
    revertTriggered?: { instanceId: string; effectId: string },
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
        ...(revertTriggered ? { revertTriggered } : {}),
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
    // kind:"option" 限定：選択肢を −／＋ の増減表示で出す（BS10-103グロウイングソード）
    stepper?: true,
): void {
    if (kind === "option") {
        // 選択肢固定式：意図的な選択を必要とするため候補が1件でも自動選択しない。
        // kind:"target" と同じく chooserPid で「選ぶのは相手／解決は発生源の持ち主」を表せる
        // （doResolveChoice が actorPid を見て resolveAction の owner を決めるので、
        //   装甲・効果耐性の判定が発生源基準のまま保たれる。BS02-094 ブラッディレイン）
        suspend(state, {
            pid: chooserPid ?? pid,
            kind: "option",
            prompt,
            candidates: [],
            options: options ?? [],
            optional,
            action,
            selfInstanceId: self ? self.instanceId : null,
            ...(stepper === true ? { stepper: true as const } : {}),
            ...(chooserPid !== undefined && chooserPid !== pid ? { actorPid: pid } : {}),
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
    // 選ぶのが効果の持ち主ではない場合の選択者（requestChoice の chooserPid と同じ考え方）。
    // 「相手の効果から自分を守るために、**守る側が自分の手札を捨てる**」（BS08竜騎集う円卓Lv2）のように、
    // 選択者・ゾーンの持ち主と、効果の実行者が別人になる場合に使う。
    // 解決自体は元の実行者（pid）の効果として続けるため actorPid に pid を残す
    chooserPid?: PlayerId,
): void {
    if (cardIndices.length === 0) {
        log(state, `${self ? getCard(self.cardId).name : "効果"}：対象がいなかった。`)
        return
    }
    const only = cardIndices[0]
    // chooserPid があるときは「選ばない」も意味を持つ選択なので、候補1枚でも自動解決しない
    if (!alwaysAsk && chooserPid === undefined && cardIndices.length === 1 && only !== undefined) {
        resolveAction(state, pid, self, action, undefined, undefined, undefined, undefined, only)
        return
    }
    suspend(state, {
        pid: chooserPid ?? pid,
        kind: "card",
        prompt,
        candidates: [],
        cardZone,
        cardOwner: chooserPid ?? pid,
        cardIndices,
        optional,
        ...(resolveOnSkip ? { resolveOnSkip: true as const } : {}),
        action,
        selfInstanceId: self ? self.instanceId : null,
        ...(chooserPid !== undefined && chooserPid !== pid ? { actorPid: pid } : {}),
    })
}
