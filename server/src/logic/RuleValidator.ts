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
    instMinLevelCores,
    minLevelCores,
    opponentOf,
} from "./GameState"
import { AWAKEN_FROM_RESERVE, altSummonFromHandCheck, canAwaken, canAwakenFromReserve, cantActByCost, directAttackFilter, hasHandKeywordGrant, instCostCantAct, isFlashLockedFor, mustAttackThisTurn, sokuPayableInstanceIds } from "../../../shared/rules"
import type { AltSummonFromHandOption } from "../../../shared/rules"
import { battleSwapSummonCheck, braveCombineCandidates, isSummonableCardType } from "../../../shared/summon"
import { blockRequiredCount, canBlock, matchesDirectedAttackFilter } from "../../../shared/block"
// コスト計算は shared/cost.ts に一本化（クライアントの表示計算と同一実装）。
// effectiveCost は多数の箇所から RuleValidator 経由で import されているため再エクスポートで名前を残す
import {
    canPayNexusCostByMill,
    canPaySummonCostByHandDiscard,
    effectiveCost,
    hasMagicFreeGrant,
    hasMagicCostLock,
    hasMagicRestriction,
    ownFieldSymbolColors,
} from "../../../shared/cost"
export { effectiveCost }
import { boardResistanceAgainst, braveKeepCores, cantSpiritStateBrave, coresCantBeRemoved, instColors, matchesBraveCondition } from "../../../shared/rules"
import {
    activeConstraints,
    effectActiveAtLevel,
    effectiveBp,
    effectSources,
    hasGlobalConstraint,
    hasKeyword,
    hasMagicImmunity,
    instHasColor,
    isResisted,
    KEYWORDS,
    matchesFamilyFilter,
    spiritHasKeyword,
    tenshoCandidates,
    tenshoSpecOf,
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
// need はコストと「置くコア（維持コア）」の合計。
// フィールドのコア（paySources）はコストにも置くコアにも充当できる（利用者確認 2026-08-01）ため、
// 上限は need であって cost ではない
export function validatePaySources(
    state: GameState,
    pid: PlayerId,
    need: number,
    paySources: PaySource[] | undefined,
): string | null {
    const player = state.players[pid]
    if (!paySources || paySources.length === 0) {
        if (player.reserve < need) return "コアが足りません"
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
        // 「コアを取り除けない」のカード（BS10-X01 幻羅星龍ガイ・アスラ）は、**プレイヤーの操作でも取り除けない**
        if (coresCantBeRemoved(state, pid, inst)) return "そのカードのコアは支払いに使えません"
        total += src.count
    }
    if (total > need) return "必要数を超えてコアを支払うことはできません"
    if (player.reserve < need - total) return "コアが足りません"
    return null
}

// paySources の合計を求める（他の検証・召喚コスト計算で使い回す）
function paySourcesTotal(paySources: PaySource[] | undefined): number {
    return (paySources ?? []).reduce((sum, s) => sum + s.count, 0)
}

// このターンの間、この pid は手札のカードを使えないか（BS11-082 ウィッグバインド）。
// 使えないなら理由の文字列、使えるなら null。**召喚・配置・マジック使用のすべてが通る入口**で見る
function handCardBanned(state: GameState, pid: PlayerId, cardId: string): string | null {
    for (const c of state.turnConstraints) {
        if (c.type !== "cantUseHandCardsForPid" || c.pid !== pid) continue
        const colors = getCard(cardId).colors
        if (c.allowedColor !== undefined && colors.includes(c.allowedColor)) continue
        if (c.bannedColors !== undefined && !c.bannedColors.some((col) => colors.includes(col))) continue
        return "効果により、このターンはこのカードを使えません"
    }
    return null
}

export function validateSummon(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    paySources?: PaySource[],
    level?: number,
    substituteInstanceId?: string,
    discardHandIndices?: number[],
    // 指定時は**ダイレクトブレイヴ**（合体先のスピリットを選んで、合体した状態で召喚する）。
    // docs/design/BRAVE.md §5。省略時、ブレイヴは**スピリットとして**通常どおり召喚される（§1.1）
    braveTargetInstanceId?: string,
    // 指定時は kind:"altSummonFromHand" の代替召喚（BS10-058）：召喚コストを支払わず、
    // 指定したネクサスをデッキの下に戻すことがコストになる
    altSummonNexusInstanceIds?: string[],
): string | null {
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const banned = handCardBanned(state, pid, cardId)
    if (banned) return banned
    // ブレイヴは単体で場に出すと**スピリットとして扱われる**ので、どちらもここを通る（§1.1）
    if (!isSummonableCardType(card.type)) return "スピリットカードではありません"

    // BS11-X02 滅神星龍ダークヴルム・ノヴァLv3：相手はブレイヴをスピリット状態にできない
    // （＝合体先を指定しないブレイヴの召喚を止める）
    if (card.type === "brave" && braveTargetInstanceId === undefined && cantSpiritStateBrave(state, pid)) {
        return "相手の効果により、ブレイヴをスピリット状態にできません"
    }

    // ダイレクトブレイヴの追加検証（§5.3）
    if (braveTargetInstanceId !== undefined) {
        if (card.type !== "brave") return "ブレイヴカードではありません"
        const host = player.field.spirits.find((sp) => sp.instanceId === braveTargetInstanceId)
        if (host === undefined) return "合体先のスピリットが自分のフィールドにいません"
        if ((host.braveRefs ?? []).length > 0) return "そのスピリットには既にブレイヴが合体しています"
        if (!matchesBraveCondition(state, pid, host, cardId)) return "そのスピリットは合体条件を満たしていません"
        // 合体中のブレイヴはコアを持たない（Lv1が0コア）。レベル指定は受け付けない
        if (level !== undefined && level !== 1) return "ダイレクトブレイヴではレベルを指定できません"
    }

    // kind:"battleSwapSummon"（BS07ブラックカラカロッサム）：バトル中の自分のスピリット1体を
    // 手札に戻すことを**追加コスト**として、フラッシュで疲労状態の召喚を行う。
    // 効果文に「コストを支払わずに」が無いので、**召喚コストは通常どおり支払う**。
    // タイミングとフィールド上限の検証だけが通常経路と異なるため、ここで完結させて早期 return する。
    //
    // 判定本体は共有層の battleSwapSummonCheck に置いてある。クライアントUIの発動可否表示
    // （canBattleSwapSummon）と同じ実装を通すことで、「UIにボタンが出るのにサーバーが弾く」
    // 種類のズレを構造的に防ぐ（activatableAbility で実際に起きた事故と同じ轍を踏まないため）
    if (substituteInstanceId !== undefined) {
        const swap = battleSwapSummonCheck(state, pid, handIndex, substituteInstanceId)
        if (typeof swap === "string") return swap
        // 召喚コスト＋置くコア（最小レベルの維持コア）を通常どおり支払えるか。
        // 支払い元の妥当性はサーバー専用の検証なので共有層には置いていない。
        // フィールドのコアも支払い元にできる（【神速】のリザーブ限定ルールはこのカードには掛からない）
        const swapPayError = validatePaySources(state, pid, swap.totalCores, paySources)
        if (swapPayError) {
            return swapPayError === "コアが足りません"
                ? `コアが足りません（コスト+置くコアで${swap.totalCores}個必要）`
                : swapPayError
        }
        return null
    }

    // 神速：フラッシュタイミングなら手札から召喚できる（自分・相手ターン問わず）
    // grantKeywordToHandCardで一時的に神速を付与された手札カードも同様に扱う（ビートプリースト）
    const hasTempSoku = (player.tempHandKeywordGrants ?? []).some(
        (g) => g.cardId === cardId && g.keyword === "soku",
    )
    // 緑芽吹く原野Lv2：場の発生源が手札のカードに継続的に【神速】を与えている（手札には書き込まない）
    const hasFieldSoku = hasHandKeywordGrant(state, pid, card, "soku")
    const flashSummon = state.isFlashTiming && (hasKeyword(cardId, "soku") || hasTempSoku || hasFieldSoku)
    if (!flashSummon) {
        const timing = checkMainTiming(state, pid)
        if (timing) return timing
    } else {
        // フラッシュ中の神速召喚は優先権を持つプレイヤーのみ
        if (pid !== state.priorityPlayer) return "現在フラッシュの優先権がありません"
        // lockFlash 適用中は手札のカード（神速召喚も含む）を使用できない
        if (isFlashLockedFor(state, pid)) {
            return "効果により、フラッシュで手札のカードを使用できません"
        }
    }

    // フィールドのスピリット数上限（旋風渦巻く渓谷＝5体以上召喚できない）。
    // 効果文が『お互いのメインステップ』のため、メインステップの通常召喚のみを制限する（神速召喚は対象外）
    // ダイレクトブレイヴは合体するだけでスピリットの**体数が増えない**ので、上限の対象外
    if (!flashSummon && state.phase === "main" && braveTargetInstanceId === undefined) {
        const cap = maxSpiritsOnField(state)
        if (cap !== null && player.field.spirits.length >= cap) {
            return `効果により、スピリットは${cap}体までしか召喚できません`
        }
    }

    // 相手からの「コストX以下のスピリットはターンにN体まで」制限（BS08夢想法師サンゾール）
    const summonLimitError = summonLimitByCostForOpponentError(state, pid, card)
    if (summonLimitError) return summonLimitError

    // 【神速】召喚の支払い制限：基礎ルールではリザーブからのみ支払える。
    // kind:"sokuPaySourceGrant"（旋風渦巻く渓谷Lv2／甲殻戦士ロングホーンLv2-3）が
    // 許可したインスタンスの上のコアだけ、例外的に使える
    if (flashSummon && paySources && paySources.length > 0) {
        const allowed = sokuPayableInstanceIds(state, pid)
        for (const src of paySources) {
            if (!allowed.has(src.instanceId)) {
                return "【神速】での召喚は、コアをリザーブから支払う必要があります"
            }
        }
    }

    // kind:"altSummonFromHand"（BS10-058）：召喚コストを支払わず、指定したネクサスを
    // 自分のデッキの下に戻すことがコスト。COST_MODEL.md §1＝支払いと召喚の両方が成立するときだけ発揮できる
    let altSummon: AltSummonFromHandOption | null = null
    if (altSummonNexusInstanceIds !== undefined) {
        const result = altSummonFromHandCheck(state, pid, handIndex)
        if (typeof result === "string") return result
        if (altSummonNexusInstanceIds.length !== result.count) {
            return `ネクサスを${result.count}個指定してください`
        }
        const seen = new Set<string>()
        for (const id of altSummonNexusInstanceIds) {
            if (seen.has(id)) return "同じネクサスを重複して指定しています"
            seen.add(id)
            if (!result.candidateNexusIds.includes(id)) return "指定したネクサスはこの召喚のコストに使えません"
        }
        // コストとして戻すネクサスを、維持コアの支払い元（paySources）に二重で使うことはできない
        for (const src of paySources ?? []) {
            if (seen.has(src.instanceId)) return "コストとして戻すネクサスは支払い元に使えません"
        }
        altSummon = result
    }
    const cost = altSummon !== null ? 0 : effectiveCost(state, pid, card)
    // レベル指定時はそのレベルのコア数を置く（省略時はLv1）。
    // ダイレクトブレイヴは合体状態のLv1が0コアなので、置くコアの検証も要らない（§5.3）
    if (braveTargetInstanceId === undefined) {
        const placeError = validateSummonLevel(card, level)
        if (placeError) return placeError
    }
    // 【転召】：コアを置く対象になる自分のスピリットがいなければ召喚できない（2026-08-13 修正）。
    // 以前は召喚を通したうえで「対象がいなかった」とログするだけで、犠牲なしに出せてしまっていた。
    // 判定は召喚するレベル（省略時はLv1）で持つ【転召】について行う
    const tensho = tenshoSpecOf(card, level ?? 1)
    if (tensho) {
        const candidates = tenshoCandidates(state, pid, tensho.minCost)
        if (candidates.length === 0) {
            return tensho.minCost > 0
                ? `【転召】でコアを置く、コスト${tensho.minCost}以上の自分のスピリットがいません`
                : "【転召】でコアを置く自分のスピリットがいません"
        }
        // **支払いで消えるスピリットは、支払い後には場にいない**（2026-08-21 利用者報告）。
        // 【転召】は召喚コストの支払い**後**に解決するので、フィールドのコアを支払い元にして
        // 候補が維持コアを割ると、対象がいないまま召喚が成立してしまっていた
        // （payCost が支払い後に維持コア割れを "deplete" で消滅させる。判定はそこと同じ式）
        const paidBy = new Map<string, number>()
        for (const src of paySources ?? []) paidBy.set(src.instanceId, src.count)
        const survivors = candidates.filter(
            (s) => s.cores - (paidBy.get(s.instanceId) ?? 0) >= instMinLevelCores(s),
        )
        if (survivors.length === 0) {
            return "その支払いでは、【転召】でコアを置く自分のスピリットがいなくなります"
        }
    }
    const maintain =
        braveTargetInstanceId !== undefined
            ? 0 // ダイレクトブレイヴは維持コアを置かない
            : level === undefined
              ? minLevelCores(card)
              : (coresForLevel(card, level) ?? 0)
    // BS08ビクティム：召喚コストの一部・全部を手札破棄で支払える（置くコアは対象外）。
    // doSummon と同じ関数で枚数を出すので、検証と実行がズレない
    const discardError = validateSummonHandDiscard(state, pid, handIndex, cost, discardHandIndices)
    if (discardError) return discardError
    const discardPaid = summonHandDiscardPayAmount(state, pid, cost, maintain, paySources, discardHandIndices)
    // フィールドのコアはコストにも「置くコア」にも充当できる（need = cost + maintain）
    const payError = validatePaySources(state, pid, cost - discardPaid + maintain, paySources)
    if (payError) {
        return payError === "コアが足りません"
            ? `コアが足りません（コスト+置くコアで${cost + maintain}個必要）`
            : payError
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

// globalConstraint "summonLimitByCostForOpponent"（BS08夢想法師サンゾール：相手はコスト4以下を
// ターンに1体まで）: pidの**相手**フィールドにこの制約の発生源があれば、pid自身のこのターンの
// 該当コスト以下の召喚数（CardInstance.summonedTurnで計測）が上限に達していないか検証する
function summonLimitByCostForOpponentError(state: GameState, pid: PlayerId, card: CardData): string | null {
    const opponent = state.players[opponentOf(pid)]
    for (const inst of [...opponent.field.spirits, ...opponent.field.nexuses]) {
        const level = currentLevel(inst).level
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "summonLimitByCostForOpponent") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            const { maxCost, limit } = effect.constraint
            if (card.cost > maxCost) continue
            const countThisTurn = state.players[pid].field.spirits.filter(
                (s) => s.summonedTurn === state.turn && getCard(s.cardId).cost <= maxCost,
            ).length
            if (countThisTurn >= limit) {
                return `効果により、コスト${maxCost}以下のスピリットはこのターンあと召喚できません`
            }
        }
    }
    return null
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
    millPay?: number,
): string | null {
    const timing = checkMainTiming(state, pid)
    if (timing) return timing
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const bannedNexus = handCardBanned(state, pid, cardId)
    if (bannedNexus) return bannedNexus
    if (card.type !== "nexus") return "ネクサスカードではありません"

    const cost = effectiveCost(state, pid, card)
    const placeError = validateSummonLevel(card, level)
    if (placeError) return placeError
    const maintain = level === undefined ? minLevelCores(card) : (coresForLevel(card, level) ?? 0)
    // 栄光の表彰台Lv1：配置コストを「コスト1につきデッキ1枚破棄」で払える（置くコアは不可）。
    // **コア払いとの併用はできない**ので、配置の時点でどちらか一方に決める（millPay は 0 か実効コスト）
    if (millPay !== undefined && millPay > 0 && !canPayNexusCostByMill(state, pid)) {
        return "デッキの破棄でコストを支払える効果がありません"
    }
    if (millPay !== undefined && millPay > 0 && millPay !== cost) {
        return `配置コストはコアとデッキ破棄のどちらか一方で支払います（デッキで払うなら${cost}枚）`
    }
    if (millPay !== undefined && millPay > player.deck.length) return "デッキの残り枚数が足りません"
    const millPaid = nexusMillPayAmount(state, pid, cost, maintain, paySources, millPay)
    // フィールドのコアはコストにも「置くコア」にも充当できる（need = cost + maintain）
    const payError = validatePaySources(state, pid, cost + maintain - millPaid, paySources)
    if (payError) {
        // 配置コストをデッキ破棄で払う場合、コアで要るのは置くコアだけ
        const label = millPaid > 0 ? "置くコア" : "コスト+置くコア"
        return payError === "コアが足りません" ? `コアが足りません（${label}で${cost + maintain - millPaid}個必要）` : payError
    }
    return null
}

// ネクサスの配置コストをデッキ破棄で支払う枚数を決める（栄光の表彰台Lv1）。
// **コア払いとの併用はできない**（2026-08-24 ユーザー確認）。返る値は 0（全額コア）か
// cost（全額デッキ破棄）のどちらかで、その中間はない。置くコアは常にコア払い。
// millPay が渡っていれば「デッキで払う／払わない」の意思表示として使い、
// 渡っていなければ「コアで足りるならコア、足りなければ全額デッキ」を自動で選ぶ
// （AI・旧クライアント向けのフォールバック）。
// validateSetNexus と doSetNexus が同じ値を出すよう、必ずこの関数を通すこと
export function nexusMillPayAmount(
    state: GameState,
    pid: PlayerId,
    cost: number,
    maintain: number,
    paySources: PaySource[] | undefined,
    // プレイヤーが選んだ支払い方法（GameAction.setNexus.millPay）。0＝コアで払う／cost＝デッキで払う
    millPay?: number,
): number {
    if (!canPayNexusCostByMill(state, pid)) return 0
    const player = state.players[pid]
    if (cost > player.deck.length) return 0 // 全額は払えない＝デッキ破棄という選択肢自体がない
    if (millPay !== undefined) return millPay > 0 ? cost : 0
    const fromSources = (paySources ?? []).reduce((sum, s) => sum + Math.max(0, s.count), 0)
    const available = player.reserve + fromSources
    return available < cost + maintain ? cost : 0
}

// スピリットの召喚コストのうち、手札破棄で支払う枚数を決める（BS08ビクティム）。
// nexusMillPayAmount とまったく同じ方針で、「どこまで手札破棄で払うか」は**プレイヤーが選ぶ**
// （渡っていなければコアで足りない分だけを自動で回す）。上限は3つの小さい方:
//   ① 召喚コスト（置くコアは手札破棄で払えない）
//   ② コアで足りない分
//   ③ 手札の残り枚数から**召喚するカード自身の1枚を除いた数**
// validateSummon と doSummon が同じ値を出すよう、必ずこの関数を通すこと
export function summonHandDiscardPayAmount(
    state: GameState,
    pid: PlayerId,
    cost: number,
    maintain: number,
    paySources: PaySource[] | undefined,
    // プレイヤーが選んだ破棄対象（GameAction.summon.discardHandIndices）。
    // 渡っていればその枚数を採用し、渡っていなければ「コアで足りない分」を自動で回す
    discardHandIndices?: number[],
): number {
    if (!canPaySummonCostByHandDiscard(state, pid)) return 0
    const player = state.players[pid]
    // 上限は「コスト」と「召喚するカード自身を除いた手札枚数」
    const cap = Math.min(cost, Math.max(0, player.hand.length - 1))
    if (discardHandIndices !== undefined) return Math.min(discardHandIndices.length, cap)
    const fromSources = (paySources ?? []).reduce((sum, s) => sum + Math.max(0, s.count), 0)
    const available = player.reserve + fromSources
    const shortfall = Math.max(0, cost + maintain - available)
    return Math.min(shortfall, cap)
}

// プレイヤーが選んだ破棄対象そのものの妥当性（枚数ではなく指定内容）を検証する。
// 枚数の上限は summonHandDiscardPayAmount がクランプするので、ここでは
// 「そもそも指定してよい状況か」「指すカードが実在し、重複せず、召喚するカード自身でないか」を見る
function validateSummonHandDiscard(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    cost: number,
    discardHandIndices: number[] | undefined,
): string | null {
    if (discardHandIndices === undefined || discardHandIndices.length === 0) return null
    if (!canPaySummonCostByHandDiscard(state, pid)) {
        return "手札の破棄でコストを支払える効果がありません"
    }
    const player = state.players[pid]
    const seen = new Set<number>()
    for (const i of discardHandIndices) {
        if (!Number.isInteger(i) || i < 0 || i >= player.hand.length) return "破棄する手札の指定が不正です"
        if (i === handIndex) return "召喚するカード自身は破棄できません"
        if (seen.has(i)) return "同じ手札を重複して指定しています"
        seen.add(i)
    }
    if (discardHandIndices.length > cost) return "コストを超えて手札を破棄することはできません"
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
    // 手元（tegamoto）からの使用は手札ではないので、手札の使用禁止は掛からない
    const bannedMagic = fromTegamoto ? null : handCardBanned(state, pid, cardId)
    if (bannedMagic) return bannedMagic
    if (card.type !== "magic") return "マジックカードではありません"

    // 手元(tegamoto)からの使用は、scope:"allMagicHandAndTegamoto"の無償化（ミカファールLv2）が
    // 有効な場合のみ許可する（凱旋門Lv2のnoFreeCastOpponentが有効なら無償化自体が打ち消される）
    if (fromTegamoto) {
        // BS06混迷する魔法実験場Lv2 が手元へ置いたカードは「手札にあるときと同様に」使える
        // （＝無償ではなく通常どおりコストを支払う）。使用権は PlayerState.tegamotoPlayable に持つ
        const playableAsHand = player.tegamotoPlayable.includes(cardId)
        if (
            !playableAsHand &&
            (!hasMagicFreeGrant(state, pid, card, true) ||
                hasMagicRestriction(state, pid, "noFreeCastOpponent"))
        ) {
            return "手元のマジックカードを使用できる効果がありません"
        }
    }

    // 作戦参謀フォクシン：フィールドに発生源があれば、お互いターンに1回しかマジックの効果を使用できない
    if (hasMagicRestriction(state, pid, "oncePerTurnAll") && (state.magicUsedThisTurn[pid] ?? 0) >= 1) {
        return "このターンはすでにマジックの効果を使用しているため使用できません"
    }
    // 青嵐の虚空Lv2：どちらかのフィールドに発生源があれば、お互い指定コスト以下のマジックを使用できない
    if (hasMagicCostLock(state, card)) {
        return "このコストのマジックは、場の効果によって使用できません"
    }
    // 螺旋の塔Lv2：相手フィールドに発生源があれば、マジックのコストはすべてリザーブから支払う
    // （フィールドのコアを支払い元に指定できない）
    if (hasMagicRestriction(state, pid, "reserveOnlyOpponent") && (paySources ?? []).length > 0) {
        return "このマジックのコストはすべてリザーブから支払わなくてはなりません"
    }
    // 力奪う凱旋門：相手フィールドに発生源があれば、自分のフィールドのシンボル色と一致しない色のマジックは使用できない
    const fieldSymbolColors = ownFieldSymbolColors(state, pid)
    if (
        hasMagicRestriction(state, pid, "colorLockOpponent") &&
        !card.colors.some((c) => fieldSymbolColors.has(c))
    ) {
        return "このマジックの色と一致するシンボルが自分のフィールドにないため使用できません"
    }

    // SD02-011 獣皇子バハムンドLv2-3：相手フィールドに発生源があれば、
    // **自分（使用者）のトラッシュにあるマジックカード**と同じ色を含むマジックは使用できない。
    // colorLockOpponent の裏返しで、トラッシュが育つほど使える色が減る
    if (hasMagicRestriction(state, pid, "trashColorLockOpponent")) {
        const lockedColors = new Set<Color>()
        for (const trashed of state.players[pid].trashCards) {
            const t = getCard(trashed)
            if (t.type !== "magic") continue
            for (const c of t.colors) lockedColors.add(c)
        }
        if (card.colors.some((c) => lockedColors.has(c))) {
            return "自分のトラッシュにある同じ色のマジックがあるため、このマジックは使用できません"
        }
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
        // 耐性の判定は resistanceAgainst に一本化してある（マジックの対象指定なので magic / targeted）。
        // ここを個別述語で書くと、装甲・完全耐性のように**この経路にだけ無い軸**が生まれる
        if (
            enemyTarget &&
            isResisted(state, opponentOf(pid), enemyTarget, {
                op: "other",
                scope: "targeted",
                actorPid: pid,
                sourceType: "magic",
                sourceColors: card.colors,
            })
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
        if (isFlashLockedFor(state, pid)) {
            return "効果により、フラッシュで手札のカードを使用できません"
        }
        // 「ブロック宣言後のフラッシュタイミングで使えない」（BS11-078 ブレイヴフラッシュ）。
        // ブロックされているかは blockerInstanceId で見る（ブロックしない＝takeLife はその場で
        // ライフ処理まで進むので、そもそもここに来る窓が無い）
        if (
            state.battle.blockerInstanceId !== null &&
            card.effects.some((e) => e.kind === "magic" && e.timing === "flash" && e.afterBlockForbidden)
        ) {
            return "このマジックはブロック宣言後のフラッシュタイミングでは使用できません"
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
        // 軍師ショウジョウジ／鎖縛の武舞台Lv2：フラッシュ効果（timing:"flash"のエントリしか無く、
        // メインステップからそのまま使用しようとしている場合）の使用を禁止する
        if (
            usedTiming === "flash" &&
            (hasMagicRestriction(state, pid, "noFlashAll") || hasMagicRestriction(state, pid, "noFlashOpponent"))
        ) {
            return "このターン、マジックカードのフラッシュ効果を使用できません"
        }
    }

    const payError = validatePaySources(state, pid, effectiveCost(state, pid, card), paySources)
    if (payError) return payError
    return null
}

// メインステップの任意合体（docs/design/BRAVE.md §6.4）。
// 合体先の候補列挙は braveCombineCandidates に一本化する（サーバーとUIで判定を共有し、
// 「UIにボタンが出るのにサーバーが弾く」ズレを構造的に防ぐ。§5.0 の規則）
export function validateCombineBrave(
    state: GameState,
    pid: PlayerId,
    braveInstanceId: string,
    hostInstanceId: string,
): string | null {
    const timing = checkMainTiming(state, pid)
    if (timing) return timing
    const player = state.players[pid]
    const brave = findSpirit(player, braveInstanceId)
    if (!brave) return "対象のブレイヴが見つかりません"
    if (getCard(brave.cardId).type !== "brave") return "ブレイヴカードではありません"
    // スピリット状態のブレイヴに他のブレイヴは合体できない（§1.2）
    if ((brave.braveRefs ?? []).length > 0) return "ブレイヴが合体しているため合体できません"
    if (!braveCombineCandidates(state, pid, brave.cardId).includes(hostInstanceId)) {
        return "そのスピリットには合体できません"
    }
    return null
}

// メインステップの任意分離（§6.4）。**効果による分離（コア不要）とは別の手順**で、
// スピリット状態のLv1維持コスト以上のコアを置く必要がある
export function validateDetachBrave(
    state: GameState,
    pid: PlayerId,
    braveInstanceId: string,
    paySources?: PaySource[],
): string | null {
    const timing = checkMainTiming(state, pid)
    if (timing) return timing
    const player = state.players[pid]
    const brave = player.field.combinedBraves.find((b) => b.instanceId === braveInstanceId)
    if (!brave) return "合体しているブレイヴが見つかりません"
    // 異魔神ブレイヴ（実体1つ・参照2本）は片方だけ外す形が未確定なので、当面は対象外にする（§11.6）
    const hosts = player.field.spirits.filter((sp) => (sp.braveRefs ?? []).some((r) => r.instanceId === braveInstanceId))
    if (hosts.length !== 1) return "このブレイヴは分離できません"
    // BS11-X02 Lv3：相手はブレイヴをスピリット状態にできない（分離した先がスピリット状態になる）
    if (cantSpiritStateBrave(state, pid)) return "相手の効果により、ブレイヴをスピリット状態にできません"
    return validatePaySources(state, pid, braveKeepCores(brave), paySources)
}

export function validateMoveCore(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    direction: "add" | "remove",
    confirmDeplete?: true,
): string | null {
    const timing = checkMainTiming(state, pid)
    if (timing) return timing
    const player = state.players[pid]
    // ネクサスもレベルを上げ下げできる（コアを置く／戻す）。
    // ネクサスの Lv1 は全カード0コアのため、下の維持コア判定でそのまま0まで戻せる
    const inst = findSpirit(player, instanceId) ?? findNexus(player, instanceId)
    if (!inst) return "対象のカードが見つかりません"
    if (direction === "add") {
        if (player.reserve < 1) return "リザーブにコアがありません"
    } else {
        if (inst.cores < 1) return "コアが置かれていません"
        // 「コアを取り除けない」のカード（BS10-X01 幻羅星龍ガイ・アスラ）は、**プレイヤーの操作でも取り除けない**（constraint:"coresCantBeRemoved"。2026-08-25 ユーザー確認）
        if (coresCantBeRemoved(state, pid, inst)) return "このカードのコアは取り除けません"
        const need = instMinLevelCores(inst)
        // confirmDeplete：維持コア割れを承知のうえで取り除く（doMoveCore がそのスピリットを消滅させる）。
        // コアを他のスピリットや召喚コストへ回すために、自分のスピリットをあえて退かせる操作
        // （2026-08-23 ユーザー要望。クライアントが確認を取ってからこのフラグを立てる）
        if (inst.cores - 1 < need && !confirmDeplete) {
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
    // 覚醒の保持判定はクライアントの覚醒バッジ表示と同一の共有実装（静的キーワードのレベル指定を尊重する）
    if (!canAwaken(state, pid, target)) return "このスピリットは【覚醒】を持ちません"
    if (count < 1) return "移動するコア数が不正です"
    if (instanceId === fromInstanceId) return "移動元と移動先が同じです"
    // ディノゾールLv2：【覚醒】の効果が「自分のスピリット上か自分のリザーブから」に書き換わっている間だけ、
    // リザーブを移動元にできる（番兵 AWAKEN_FROM_RESERVE）
    if (fromInstanceId === AWAKEN_FROM_RESERVE) {
        if (!canAwakenFromReserve(state, pid)) {
            return "リザーブから【覚醒】できる効果がありません"
        }
        if (player.reserve < count) return "リザーブのコアが足りません"
        return null
    }
    const from = findSpirit(player, fromInstanceId)
    if (!from) return "コアの移動元スピリットが見つかりません"
    if (from.cores < count) return "移動元のコアが足りません"
    // 「コアを取り除けない」のカード（BS10-X01 幻羅星龍ガイ・アスラ）は、**プレイヤーの操作でも取り除けない**
    if (coresCantBeRemoved(state, pid, from)) return "そのスピリットのコアは取り除けません"
    return null
}

// 起動能力（kind: "activated"）の発動可否。コストを払って任意発動する能力の汎用検証。
export function validateActivateAbility(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    effectId: string,
): string | null {
    // ネクサスの起動能力もある（BS11-067 白き楯の長城Lv2＝コアを払ってバトル終了）ので、
    // スピリットで見つからなければネクサスも探す
    const inst =
        findSpirit(state.players[pid], instanceId) ??
        state.players[pid].field.nexuses.find((n) => n.instanceId === instanceId)
    if (!inst) return "対象のカードが見つかりません"
    const level = currentLevel(inst).level
    const effect = getCard(inst.cardId).effects.find(
        (e) => e.kind === "activated" && e.id === effectId,
    )
    if (!effect || effect.kind !== "activated") return "起動能力が見つかりません"
    if (!effectActiveAtLevel(effect.levels, level)) {
        return "現在のレベルでは発動できません"
    }
    // 発動可能タイミング
    if (effect.timing === "flashBattle") {
        if (!state.isFlashTiming || !state.battle) {
            return "フラッシュタイミングではありません"
        }
    } else if (effect.timing === "main") {
        // 『自分のメインステップ』：自分のターンのメインステップ中なら、任意のタイミングで発動できる。
        // バトル中（フラッシュ）は対象外で、フラッシュ優先権も見ない（下の優先権チェックを飛ばす）
        const mainTiming = checkMainTiming(state, pid)
        if (mainTiming) return mainTiming
        if (state.pendingChoice) return "他の効果の解決中です"
    } else if (effect.timing === "flash") {
        // flashBattleと異なり、バトル外（自分のメインステップ）でも発動できる（BS08機人フィアラル）。
        // このエンジンにはバトル外の「フラッシュ優先権」窓が無いため、自分のメインステップを
        // 唯一のバトル外発動タイミングとする決定的簡略化（castMagicのmainForbidden無し・main不在
        // フラッシュ専用マジックの扱いと同じ考え方）
        const inBattleFlash = state.isFlashTiming && state.battle !== null
        const inOwnMain = !state.battle && state.turnPlayer === pid && state.phase === "main"
        if (!inBattleFlash && !inOwnMain) {
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
    // フラッシュ優先権（手札のカードではなくスピリットの能力なので lockFlash は適用しない）。
    // timing:"main" はフラッシュの窓ではないので優先権を見ない
    if (effect.timing !== "main" && pid !== state.priorityPlayer) {
        return "現在フラッシュの優先権がありません"
    }
    // 「ターンに1回」：発生源1体につきターン1回（同名が2体いればそれぞれ1回使える）
    if (effect.oncePerTurn && inst.activatedUsedTurn?.[effectId] === state.turn) {
        return "この効果はこのターンすでに使いました"
    }
    // コスト支払い可否。exhaustSelf（BS07桜の妖精オウカ）は既に疲労していると払えない。
    // cost 省略時は追加コストなし（BS08帝竜騎サイクル）
    if (effect.cost !== undefined) {
        if ("exhaustSelf" in effect.cost) {
            if (inst.isRested) return "すでに疲労しています"
        } else if ("selfCoresToTrash" in effect.cost) {
            // 発生源自身の上のコアを払う（BS11-067 白き楯の長城Lv2）
            if (inst.cores < effect.cost.selfCoresToTrash) return "コアが足りません"
        } else if (state.players[pid].reserve < effect.cost.reserveToTrash) {
            return "コアが足りません"
        }
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
    // フィールド全体制約（BS08赤き砂の座）：コア1個しか置いていないスピリットはアタックできない（ブロックは可能）
    if (inst.cores === 1 && hasGlobalConstraint(state, "singleCoreCantAttack")) {
        return "コア1個しか置いていないスピリットはアタックできません"
    }
    // フィールド全体制約（BS05白夜の虚空／青嵐の虚空）：コストがmaxCost以下のスピリットはアタックできない
    if (instCostCantAct(state, inst)) {
        return "コストが低いためアタックできません"
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
        const targetFilter = directAttackFilter(state, pid, inst)
        if (targetFilter === null) {
            return "このスピリットは指定アタックできません"
        }
        const target = findSpirit(state.players[opponentOf(pid)], targetSpiritInstanceId)
        if (!target) return "指定した相手スピリットが見つかりません"
        // 対象条件の判定はクライアントの指定アタック対象ハイライトと同一の共有実装を使う
        const filterError = matchesDirectedAttackFilter(targetFilter, target, state, opponentOf(pid))
        if (filterError) return filterError
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
    // ブロック宣言はフラッシュタイミングの外（フラッシュ①終了後）でのみ行える。
    // 優先権の有無に関わらず、フラッシュタイミング中は宣言できない
    if (state.isFlashTiming) {
        return "フラッシュタイミング中はブロックを宣言できません"
    }
    if (state.battle.blockerInstanceId) return "すでにブロックしています"
    const inst = findSpirit(state.players[pid], instanceId)
    if (!inst) return "対象のスピリットが見つかりません"
    // 複数体ブロック（blockRequiresCount。BS10-X03巨蟹武神キャンサード）：必要数がそろうまで
    // 宣言を貯めるので、同じ個体を二度は選べない
    if ((state.battle.pendingBlockerIds ?? []).includes(instanceId)) {
        return "そのスピリットはすでにブロック宣言しています"
    }
    // 疲労状態でのブロック可否（canBlockWhileRested。BS06計画された場外乱闘）はアタッカー情報が要るため、
    // 下のcanBlock呼び出し（共有実装）にまとめて判定させる（ここでは早期リターンしない）
    if (currentLevel(inst).level < 1) return "レベル1未満のためブロックできません"
    // フィールド全体制約（魔帝の墓標）：コア1個しか置いていないスピリットはブロックできない
    if (inst.cores === 1 && hasGlobalConstraint(state, "singleCoreCantAct")) {
        return "コア1個しか置いていないスピリットはブロックできません"
    }
    // フィールド全体制約（BS05白夜の虚空／青嵐の虚空）：コストがmaxCost以下のスピリットはブロックできない
    if (instCostCantAct(state, inst)) {
        return "コストが低いためブロックできません"
    }
    // このターンの間だけの全体制約（ヘビィゲート）：コストがmaxCost以下のスピリットはブロックできない
    if (cantActByCost(state, inst, "block")) {
        return "このターンの間、このスピリットはブロックできません"
    }

    const attackerPid = opponentOf(pid)
    const attacker = findSpirit(
        state.players[attackerPid],
        state.battle.attackerInstanceId,
    )

    // 制約判定（cantBlock / cantBlockLowerBp / unblockableBy）はクライアントの
    // ブロック可能ハイライトと同一の共有実装を使う
    const reason = canBlock(state, pid, inst, attackerPid, attacker)
    if (reason) return reason
    // 複数体ブロック：必要な体数をそろえられないならブロックそのものができない
    // （1体だけ宣言して止まると「1体でブロックできた」ことになってしまう）
    const required = blockRequiredCount(state, attackerPid, attacker)
    if (required > 1) {
        const declared = state.battle.pendingBlockerIds ?? []
        const available = state.players[pid].field.spirits.filter(
            (sp) =>
                sp.instanceId === instanceId ||
                declared.includes(sp.instanceId) ||
                canBlock(state, pid, sp, attackerPid, attacker) === null,
        ).length
        if (available < required) {
            return `ブロックするにはスピリット${String(required)}体が必要です`
        }
    }
    return null
}

// このターンの間だけ有効な全体制約（turnConstraints）により、指定スピリットがアタック/ブロック
// できないか（ヘビィゲート：コストがmaxCost以下のスピリットはすべて対象）

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
        // フィールド全体制約（BS08赤き砂の座）でアタックできない個体もアタック強制の対象外
        if (inst.cores === 1 && hasGlobalConstraint(state, "singleCoreCantAttack")) continue
        // フィールド全体制約（BS05白夜の虚空／青嵐の虚空）でアタックできない個体もアタック強制の対象外
        if (instCostCantAct(state, inst)) continue
        // このターンの間だけの全体制約（ヘビィゲート）でアタックできない個体もアタック強制の対象外
        if (cantActByCost(state, inst)) continue
        const constraints = activeConstraints(state, pid, inst)
        // cantAttack を持つスピリットはそもそもアタックできないため、mustAttack強制の対象外
        if (constraints.some((c) => c.type === "cantAttack")) continue
        if (constraints.some((c) => c.type === "mustAttack") || mustAttackThisTurn(state, pid, inst)) {
            return `${getCard(inst.cardId).name}は必ずアタックしなければなりません`
        }
    }
    return null
}

// 強制ブロック（kind: "mustBlockGrant"）：アタッカーの持ち主のフィールドに、
// レベル有効・phase/turn一致・familyFilter一致（省略時は全アタッカー）の発生源があるか判定する。
// firstAttackOnly 指定時はそのターンの最初のアタック（attacksThisTurn === 1）のみ対象。
// マッチした発生源の blockerMaxBp（BS05ワーニングアタック：BP3000以下の合法ブロッカーがいるときのみ強制）を
// 呼び出し側へ返す（未指定なら制限なし＝undefined）
function hasMustBlockAgainst(
    state: GameState,
    attackerPid: PlayerId,
    attacker: CardInstance,
): { blockerMaxBp?: number; source: CardInstance } | null {
    // effectSources() でこのターンだけの仮想発生源（マジックが貸した継続効果）も含めて走査する
    for (const inst of effectSources(state, attackerPid)) {
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
            return effect.blockerMaxBp === undefined
                ? { source: inst }
                : { blockerMaxBp: effect.blockerMaxBp, source: inst }
        }
    }
    return null
}

// 「可能ならば必ずブロックする」の判定用：実際にブロック宣言が通るスピリットが1体でもいるか。
// hasBlocker（回復状態か見るだけ）と違い validateBlock を実際に通すため、cantBlock や
// unblockableBy で実際にはブロックできない場合に強制ブロックで詰まない。
// maxBp 指定時は実効BPがこれ以下の個体だけを合法ブロッカーの候補にする
// （BS05ワーニングアタック：BP3000以下の合法ブロッカーがいるときだけライフ受けを拒否する）
function hasLegalBlocker(
    state: GameState,
    pid: PlayerId,
    maxBp?: number,
    // ブロックを強制している効果の発生源。渡すと、**その効果を受けない個体は数えない**。
    // 【激突】も強制ブロックも「相手のスピリットを対象とした効果」なので、装甲などで防げる
    // （バトスピ Wiki「激突」：赤に対する装甲を持つスピリットしかいなければ強制を無視できる。
    //  2026-08-16 ユーザー指摘で判明。それまでブロック可否しか見ておらず耐性を素通りしていた）
    forcedBy?: { pid: PlayerId; inst: CardInstance },
): boolean {
    return state.players[pid].field.spirits.some((s) => {
        if (maxBp !== undefined && effectiveBp(state, pid, s) > maxBp) return false
        if (validateBlock(state, pid, s.instanceId) !== null) return false
        if (forcedBy && blockForceResisted(state, pid, s, forcedBy)) return false
        return true
    })
}

// ブロックの強制を、その個体が「効果を受けない」で弾くか。
// 範囲効果（「相手のスピリットすべては」）として判定する
function blockForceResisted(
    state: GameState,
    pid: PlayerId,
    blocker: CardInstance,
    forcedBy: { pid: PlayerId; inst: CardInstance },
): boolean {
    const sourceCard = getCard(forcedBy.inst.cardId)
    return (
        boardResistanceAgainst(state, pid, blocker, {
            op: "other",
            scope: "area",
            actorPid: forcedBy.pid,
            sourceType: sourceCard.type,
            sourceColors: instColors(forcedBy.inst),
        }) !== null
    )
}

export function validateTakeLife(state: GameState, pid: PlayerId): string | null {
    if (!state.battle) return "バトルが発生していません"
    if (pid !== opponentOf(state.turnPlayer)) return "防御側ではありません"
    // ブロック宣言済みならライフでは受けられない
    if (state.battle.blockerInstanceId) return "すでにブロックしています"
    // 複数体ブロック（blockRequiresCount）で1体目まで宣言した後は、宣言を撤回してライフで受けることはできない。
    // 宣言の分割はエンジン側の都合であって、ルール上のブロック宣言は1回きりの決定だから
    if ((state.battle.pendingBlockerIds ?? []).length > 0) {
        return "ブロック宣言の途中です。残りのブロッカーを選んでください"
    }
    // ライフで受ける宣言はフラッシュタイミングの外（フラッシュ①終了後）でのみ行える。
    // 優先権の有無に関わらず、フラッシュタイミング中は宣言できない
    if (state.isFlashTiming) {
        return "フラッシュタイミング中はライフで受けられません"
    }
    const attacker = findSpirit(
        state.players[state.turnPlayer],
        state.battle.attackerInstanceId,
    )
    // 【激突】持ちのアタック時はブロック強制。
    // 判定は hasLegalBlocker（validateBlock を実際に通る個体がいるか）で行う。
    // hasBlocker（疲労とレベルしか見ない）だと、cantBlock 等で実際にはブロックできない個体を
    // 「ブロックできる」と誤判定し、防御側がブロックもライフ受けもできない詰みになる（part65 §C）。
    // 強制ブロック（mustBlockGrant）と同じ「可能ならば」の解釈に揃えてある
    if (
        attacker &&
        spiritHasKeyword(state, state.turnPlayer, attacker, "clash") &&
        hasLegalBlocker(state, pid, undefined, { pid: state.turnPlayer, inst: attacker })
    ) {
        return "【激突】によりブロックしなければなりません"
    }
    // 強制ブロック（燃えさかる戦場Lv2＝ターン最初のアタック／BS04翼持つ者の空域Lv2＝翼竜・空牙のアタック／
    // BS05ワーニングアタック＝BP3000以下限定）。ブロック宣言が実際に通るスピリットがいるときのみ強制する（「可能ならば」）
    const mustBlock = attacker && hasMustBlockAgainst(state, state.turnPlayer, attacker)
    if (
        mustBlock &&
        hasLegalBlocker(state, pid, mustBlock.blockerMaxBp, { pid: state.turnPlayer, inst: mustBlock.source })
    ) {
        return "相手の効果により、可能ならば必ずブロックしなければなりません"
    }
    return null
}
