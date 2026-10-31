// 行動可否判定（召喚条件、コスト支払い可否など）
// 各関数はエラー理由の文字列を返し、問題なければ null を返す
import { coreGainAllowed } from "./coreGainCap"
import { coreRemovalAllowed } from "./coreGate"
import { entryActive } from "../../../shared/rules/effectStop"
import { noteCoverage } from "../../../shared/coverage"
import { canPayFreeSummonSurcharge } from "./summonSurcharge"
import { moveCardCandidates } from "./actions/moveCards"
import type { CardData, CardInstance, CardType, Color, EffectAction, EffectDef, GameState, PaySource, PlayerId } from "../type"
import { summonFromHandFreeCandidateMatches } from "./summon"
import { summonDenial } from "./summonGate"
import { normalReserveOf, soulCoreInReserve, soulCoreOnInstance, keishoExcludedTeamAtLeast } from "./soulCore"
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
    placedCoresForSummon,
} from "./GameState"
import { mustAttackOnceBlocksEnd, mustBeAttackTargetIds, spiritCouldAttackNow, AWAKEN_FROM_RESERVE, activatedActionResolvable, braveCombineOntoSelfCandidates, cardHasColor, altSummonFromHandCheck, attackOncePerTurnLimitApplies, attackOncePerTurnByCostLimitApplies, attackTotalOncePerTurnLimitApplies, canAwaken, canAwakenFromReserve, cantActByTimed, directAttackFilter, hasHandKeywordGrant, flashSummonFromHandNow, instCostCantAct, instCantAttackByOpponentCost, instCantAttackByCost, attackTollTotal, attackPayTollCount, instCantAttackByFewOwnSpirits, isFlashLockedFor, isVanillaCard, mustAttackThisTurn, sokuPayableInstanceIds, hostsOf, burstSetCoresRequired, payAssistCandidates, instAttackRequiresCoreToll, mustAttackFirst } from "../../../shared/rules"
import type { AltSummonFromHandOption } from "../../../shared/rules"
import { canDiscardHand, handCardBanned, magicUseWindowDenial, ownHandKeyword, zoneSpiritEffectsDisabled } from "../../../shared/rules"
import { battleSwapSummonCheck, braveCombineCandidates, canCombineBraveCount, isSummonableCardType } from "../../../shared/summon"
import { blockExhaustSpiritRequired, blockPayCost, blockReserveToTrashCount, blockRequiredCount, canBlock, matchesDirectedAttackFilter } from "../../../shared/block"
// コスト計算は shared/cost.ts に一本化（クライアントの表示計算と同一実装）。
// effectiveCost は多数の箇所から RuleValidator 経由で import されているため再エクスポートで名前を残す
import {
    canPayNexusCostByMill,
    canPaySummonCostByHandDiscard,
    effectiveCost,
    exTrashReductionCandidateIndices,
    exSymbolsOfTrashCard,
    hasMagicFreeGrant,
    hasMagicCostLock,
    hasMagicRestriction,
    ownFieldSymbolColors,
    summonSurcharge,
} from "../../../shared/cost"
export { effectiveCost }
import { boardResistanceAgainst, ownAllHaveFamily, ownAllHaveTeam, ownTeamAtLeast, timedContentsOn, timedPlayerRules, magicColorBanned, braveKeepCores, cantSpiritStateBrave, instColors, matchesBraveCondition, timedMagicLocked, spiritHasLabeledKeyword, noteHeldKeyword } from "../../../shared/rules"
import {
    activeConstraints,
    effectiveBp,
    effectSources,
    hasGlobalConstraint,
    hasKeyword,
    hasMagicImmunity,
    instHasColor,
    isResisted,
    KEYWORDS,
    matchesFamilyFilter,
    tenshoCandidates,
    tenshoSpecOf,
    autoPayPlan,
} from "./EffectModules"
import { COLOR_LABELS } from "../../../data/constants"
import { magicConditionFailure } from "../../../shared/magicCondition"
import { isOnceUsed, isOncePerBattleUsed } from "./oncePerTurn"
import { effectCostDiscountNexus, unpayablePayReason } from "./actions/pay"
import { magicTargetMissing } from "./magic/targetRequirement"
import { magicUseTiming } from "../../../shared/magicTiming"







function checkMainTiming(state: GameState, pid: PlayerId): string | null {
    if (state.turnPlayer !== pid) return "自分のターンではありません"
    if (state.phase !== "main") return "メインステップではありません"
    if (state.battle) return "バトル中は使用できません"
    return null
}

// コスト支払いの妥当性検証。paySources 未指定・空ならリザーブのみで cost を賄えるか見る。
// need はコストと「置くコア（維持コア）」の合計。
// フィールドのコア（paySources）はコストにも置くコアにも充当できる（利用者確認 2026-08-01）ため、
// 上限は need であって cost ではない
export function validatePaySources(
    state: GameState,
    pid: PlayerId,
    need: number,
    paySources: PaySource[] | undefined,
    paySoulCoreFromReserve?: boolean,
): string | null {
    const player = state.players[pid]
    const soulFromReserve = paySoulCoreFromReserve === true
    if (soulFromReserve && !soulCoreInReserve(player)) return "リザーブに[ソウルコア]がありません"
    // 案B-inside: reserve の数値には[ソウルコア]が含まれる。使わないなら通常コアぶんを差し引く
    const usableReserve = soulFromReserve ? player.reserve : normalReserveOf(player)
    if (!paySources || paySources.length === 0) {
        if (usableReserve < need) return "コアが足りません"
        return null
    }
    const seen = new Set<string>()
    let total = 0
    let soulIncluded = false
    for (const src of paySources) {
        if (seen.has(src.instanceId)) return "支払い元が重複しています"
        seen.add(src.instanceId)
        // [ソウルコア]込みの支払い（2026-10-06 ユーザー確認: 個体の上の[ソウルコア]もコストとして使える）。
        // [ソウルコア]は1個なので、含める指定ができる支払い元は1か所まで
        if (src.includeSoulCore === true || src.soulCoreToMaintain === true) {
            if (src.includeSoulCore === true && src.soulCoreToMaintain === true) {
                return "[ソウルコア]をコストと維持コアの両方に使うことはできません"
            }
            if (soulIncluded) return "[ソウルコア]を含める支払い元は1か所までです"
            if (!soulCoreOnInstance(player, src.instanceId)) return "その支払い元に[ソウルコア]が載っていません"
            soulIncluded = true
        }
        const inst = findSpirit(player, src.instanceId) ?? findNexus(player, src.instanceId)
        if (!inst) return "支払い元が見つかりません"
        if (src.count < 1) return "支払うコア数が不正です"
        // 案B-inside: coresには[ソウルコア]が含まれる。[ソウルコア]込みの指定なら全コア、
        // そうでなければ[ソウルコア]を差し引いた通常コア数が支払い上限
        const capacity = src.includeSoulCore === true ? inst.cores : inst.cores - (soulCoreOnInstance(player, src.instanceId) ? 1 : 0)
        if (src.count > capacity) return "支払い元のコアが足りません"
        // 「コアを取り除けない」は**プレイヤーの操作でも取り除けない**
        if (coreRemovalAllowed(state, { ownerPid: pid, target: inst, amount: src.count, cause: "cost", actorPid: pid }) < src.count) return "そのカードのコアは支払いに使えません"
        total += src.count
    }
    if (total > need) return "必要数を超えてコアを支払うことはできません"
    if (usableReserve < need - total) return "コアが足りません"
    return null
}

function paySourcesTotal(paySources: PaySource[] | undefined): number {
    return (paySources ?? []).reduce((sum, s) => sum + s.count, 0)
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
    shinsokuAssistInstanceIds?: string[],
    exReductionTrashIndices?: number[],
    paySoulCoreFromReserve?: boolean,
    placeSoulCoreFromReserve?: boolean,
): string | null {
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const banned = handCardBanned(state, pid, cardId)
    if (banned) return banned
    // ブレイヴは単体で場に出すと**スピリットとして扱われる**ので、どちらもここを通る（§1.1）
    if (!isSummonableCardType(card.type)) return "スピリットカードではありません"

    // 相手はブレイヴをスピリット状態にできない＝合体先を指定しないブレイヴの召喚を止める
    if (card.type === "brave" && braveTargetInstanceId === undefined && cantSpiritStateBrave(state, pid)) {
        return "相手の効果により、ブレイヴをスピリット状態にできません"
    }

    if (braveTargetInstanceId !== undefined) {
        if (card.type !== "brave") return "ブレイヴカードではありません"
        const host = player.field.spirits.find((sp) => sp.instanceId === braveTargetInstanceId)
        if (host === undefined) return "合体先のスピリットが自分のフィールドにいません"
        if (getCard(host.cardId).type === "brave") return "スピリット状態のブレイヴにはブレイヴを合体できません"
        if (!canCombineBraveCount(state, pid, host, cardId)) return "そのスピリットには既にブレイヴが合体しています"
        if (!matchesBraveCondition(state, pid, host, cardId)) return "そのスピリットは合体条件を満たしていません"
        // 合体中のブレイヴはコアを持たない（Lv1が0コア）。レベル指定は受け付けない
        if (level !== undefined && level !== 1) return "ダイレクトブレイヴではレベルを指定できません"
    }

    // kind:"battleSwapSummon"：バトル中の自分のスピリット1体を手札に戻すことを**追加コスト**として、
    // フラッシュで疲労状態の召喚を行う。「コストを支払わずに」が無いので召喚コストは通常どおり支払う。
    // 判定本体は共有層の battleSwapSummonCheck。クライアントの発動可否表示と同じ実装を通し、
    // 「UIにボタンが出るのにサーバーが弾く」ズレを構造的に防ぐ
    if (substituteInstanceId !== undefined) {
        const swap = battleSwapSummonCheck(state, pid, handIndex, substituteInstanceId)
        if (typeof swap === "string") return swap
        // 召喚コスト＋維持コアを通常どおり支払えるか。支払い元の妥当性はサーバー専用なので共有層に置かない。
        // フィールドのコアも支払い元にできる（【神速】のリザーブ限定は掛からない）
        const swapPayError = validatePaySources(state, pid, swap.totalCores, paySources)
        if (swapPayError) {
            return swapPayError === "コアが足りません"
                ? `コアが足りません（コスト+置くコアで${swap.totalCores}個必要）`
                : swapPayError
        }
        return null
    }

    // grantKeywordToHandCard の一時付与も同様に扱う
    const hasTempSoku = (player.tempHandKeywordGrants ?? []).some(
        (g) => g.cardId === cardId && g.keyword === "soku",
    )
    // 場の発生源が手札のカードに継続的に【神速】を与えている場合（手札には書き込まない）
    const hasFieldSoku = hasHandKeywordGrant(state, pid, card, "soku")
    const staticSoku = ownHandKeyword(state, cardId, "soku")
    if (state.isFlashTiming && staticSoku) {
        const sokuEntry = getCard(cardId).effects.find((e) => e.kind === "keyword" && e.keyword === "soku")
        if (sokuEntry) noteCoverage(sokuEntry, "keyword")
    }
    // 付与された【神速】も手札のスピリットの効果として止まる（2026-10-23 ユーザー確認。BS18-052）
    const grantedSoku = (hasTempSoku || hasFieldSoku) && !zoneSpiritEffectsDisabled(state, cardId)
    const flashSummon = state.isFlashTiming && (staticSoku || grantedSoku || flashSummonFromHandNow(state, pid, cardId))
    if (!flashSummon) {
        const timing = checkMainTiming(state, pid)
        if (timing) return timing
    } else {
        // フラッシュ中の神速召喚：優先権・lockFlash は validateHandFlash に共有
        const flashError = validateHandFlash(state, pid)
        if (flashError) return flashError
    }

    const denial = summonDenial(state, { pid, cardId, from: "hand", cause: "normal", braveTargetInstanceId, ...(flashSummon ? { flash: true as const } : {}) })
    if (denial) return denial

    // 【神速】召喚の支払い制限：基礎ルールではリザーブからのみ。kind:"sokuPaySourceGrant" が許可した
    // インスタンスの上のコアだけ例外的に使える
    if (flashSummon && paySources && paySources.length > 0) {
        const allowed = sokuPayableInstanceIds(state, pid)
        for (const src of paySources) {
            if (!allowed.has(src.instanceId)) {
                return "【神速】での召喚は、コアをリザーブから支払う必要があります"
            }
        }
    }

    let shinsokuDiscount = 0
    if (shinsokuAssistInstanceIds && shinsokuAssistInstanceIds.length > 0) {
        const candidates = new Map(payAssistCandidates(state, pid, { cardId, flash: flashSummon }).map((c) => [c.instanceId, c.discount]))
        const seen = new Set<string>()
        for (const id of shinsokuAssistInstanceIds) {
            if (seen.has(id)) return "同じスピリットを重複して指定しています"
            seen.add(id)
            const discount = candidates.get(id)
            if (discount === undefined) return "指定したスピリットはこの効果を使えません"
            shinsokuDiscount += discount
        }
    }

    // kind:"altSummonFromHand"：召喚コストを支払わず、指定したネクサスをデッキの下に戻すことがコスト。
    // COST_MODEL.md §1＝支払いと召喚の両方が成立するときだけ発揮できる
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
    // 《継召》のEXシンボル除外軽減：候補はトラッシュのEXシンボル持ちカードに限る。無効な指定（候補外・重複）はエラー。
    // 軽減シンボルと同じ色だけが軽減に使われる（赤軽減なら赤のEXシンボルのみ）
    let exReductionSymbols: Color[] = []
    if (exReductionTrashIndices && exReductionTrashIndices.length > 0) {
        const candidates = exTrashReductionCandidateIndices(state, pid, card)
        const seen = new Set<number>()
        for (const idx of exReductionTrashIndices) {
            if (!candidates.includes(idx)) return "指定したトラッシュのカードは《継召》の軽減に使えません"
            if (seen.has(idx)) return "同じカードを重複して指定しています"
            seen.add(idx)
        }
        exReductionSymbols = exReductionTrashIndices.flatMap((idx) => exSymbolsOfTrashCard(state, pid, idx))
    }
    const cost = Math.max(
        0,
        (altSummon !== null ? summonSurcharge(state, pid, card) : effectiveCost(state, pid, card, false, exReductionSymbols)) - shinsokuDiscount,
    )
    // レベル指定時はそのレベルのコア数を置く（省略時はLv1）。
    // ダイレクトブレイヴは合体状態のLv1が0コアなので、置くコアの検証も要らない（§5.3）
    if (braveTargetInstanceId === undefined) {
        const placeError = validateSummonLevel(card, level)
        if (placeError) return placeError
    }
    // 【転召】：コアを置く対象の自分のスピリットがいなければ召喚できない（2026-08-13 修正。
    // 以前は犠牲なしで出せてしまっていた）。召喚するレベル（省略時Lv1）で持つ【転召】について判定する
    const tensho = zoneSpiritEffectsDisabled(state, cardId) ? null : tenshoSpecOf(card, level ?? 1)
    if (tensho) {
        const candidates = tenshoCandidates(state, pid, tensho.minCost, undefined, tensho.familyFilter)
        if (candidates.length === 0) {
            const locked = state.players[pid].field.spirits.find((s) => coreRemovalAllowed(state, { ownerPid: pid, target: s, amount: s.cores, cause: "tensho", actorPid: pid }) < s.cores)
            if (locked) {
                return `【転召】の対象がいません（${getCard(locked.cardId).name}はコアを取り除けないため対象にできません）`
            }
            if (tensho.familyFilter) {
                const families = [tensho.familyFilter].flat().join("/")
                return `【転召】でコアを置く、系統：「${families}」を持つ自分のスピリットがいません`
            }
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
    const maintain = placedCoresForSummon(card, level, {
        braveTarget: braveTargetInstanceId !== undefined,
        placeSoulCoreFromReserve,
    })
    // [ソウルコア]の使い方の排他と維持コアとして置けるか（2026-10-06 ユーザー確定）
    if (paySoulCoreFromReserve === true && placeSoulCoreFromReserve === true) {
        return "[ソウルコア]をコストと維持コアの両方に使うことはできません"
    }
    if (placeSoulCoreFromReserve === true) {
        if (!soulCoreInReserve(player)) return "リザーブに[ソウルコア]がありません"
        if (maintain < 1) return "このカードはコアを置かないため[ソウルコア]を維持コアにできません"
    }
    if (paySources?.some((s) => s.soulCoreToMaintain === true) && maintain < 1) {
        return "このカードはコアを置かないため[ソウルコア]を維持コアにできません"
    }
    // doSummon と同じ関数で枚数を出すので、検証と実行がズレない
    const discardError = validateSummonHandDiscard(state, pid, handIndex, cost, discardHandIndices)
    if (discardError) return discardError
    const discardPaid = summonHandDiscardPayAmount(state, pid, cost, maintain, paySources, discardHandIndices)
    // フィールドのコアはコストにも「置くコア」にも充当できる（need = cost + maintain）
    // 維持コアとして置くときもリザーブの[ソウルコア]は支払いに使える（使い方が違うだけ）
    const payError = validatePaySources(state, pid, cost - discardPaid + maintain, paySources, paySoulCoreFromReserve === true || placeSoulCoreFromReserve === true)
    if (payError) {
        return payError === "コアが足りません"
            ? `コアが足りません（コスト+置くコアで${cost + maintain}個必要）`
            : payError
    }
    return null
}

// 【烈神速】：お互いのアタックステップのフラッシュで、トラッシュのコア5個以上を自分のフィールド/リザーブに置くことで
// コストを支払わず手札から召喚する。【神速】とは別のキーワードなので validateSummon の flashSummon には乗せず専用検証にする
export function validateResshinsokuSummon(state: GameState, pid: PlayerId, handIndex: number): string | null {
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const banned = handCardBanned(state, pid, cardId)
    if (banned) return banned
    if (!isSummonableCardType(card.type)) return "スピリットカードではありません"
    if (!ownHandKeyword(state, cardId, "resshinsoku")) return "【烈神速】を持っていません"
    if (!state.isFlashTiming || state.phase !== "attack") {
        return "お互いのアタックステップのフラッシュタイミングでのみ使用できます"
    }
    const flashError = validateHandFlash(state, pid)
    if (flashError) return flashError
    // 【烈神速】の「トラッシュのコア」にソウルコアも含めて数える（配置は段5まで通常コアのみ）
    // 案B-inside: trashCores には[ソウルコア]が含まれるため、烈神速の閾値は数値だけで見てよい
    if (player.trashCores < 5) return "自分のトラッシュのコアが5個以上必要です"
    // 【烈神速】はスピリットの効果なので、黒き聖杯の上限が掛かる（Q22409）
    if (coreGainAllowed(state, { pid, from: "trash", to: "reserve", count: player.trashCores, srcType: "spirit" }) < player.trashCores) return "効果により、トラッシュのコアすべてを置けません"
    if (!canPayFreeSummonSurcharge(state, pid, card)) return "相手の効果による召喚の追加コストを払えません"
    return summonDenial(state, { pid, cardId, from: "hand", cause: "normal", flash: true })
}

export function validateSwapSoulCore(state: GameState, pid: PlayerId, fromInstanceId: string, toInstanceId: string): string | null {
    if (state.battle || state.phase !== "main" || state.turnPlayer !== pid) {
        return "メインステップの自分のターンにしか交換できません"
    }
    const player = state.players[pid]
    if (fromInstanceId === toInstanceId) return "同じ個体同士では交換できません"
    const from = findSpirit(player, fromInstanceId) ?? findNexus(player, fromInstanceId)
    const to = findSpirit(player, toInstanceId) ?? findNexus(player, toInstanceId)
    if (!from || !to) return "自分のスピリット/ネクサスが見つかりません"
    if (!soulCoreOnInstance(player, fromInstanceId)) return "[ソウルコア]が載った個体を選んでください"
    if (to.cores - (soulCoreOnInstance(player, toInstanceId) ? 1 : 0) < 1) return "通常コア1個以上が置かれた個体と交換できます"
    // 「コアを取り除けない」は、プレイヤーの操作でも取り除けない。交換にも効く
    if (coreRemovalAllowed(state, { ownerPid: pid, target: from, amount: 1, cause: "player", actorPid: pid }) < 1 || coreRemovalAllowed(state, { ownerPid: pid, target: to, amount: 1, cause: "player", actorPid: pid }) < 1) {
        return "コアを取り除けない個体とは交換できません"
    }
    return null
}

// 召喚／配置のレベル指定を検証する（未指定＝Lv1は常に有効）。
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
    paySoulCoreFromReserve?: boolean,
    placeSoulCoreFromReserve?: boolean,
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
    const maintain = placedCoresForSummon(card, level, { placeSoulCoreFromReserve })
    // 配置コストを「コスト1につきデッキ1枚破棄」で払える（置くコアは不可）。
    // **コア払いとの併用はできない**ので、配置の時点でどちらか一方に決める（millPay は 0 か実効コスト）
    if (millPay !== undefined && millPay > 0 && !canPayNexusCostByMill(state, pid)) {
        return "デッキの破棄でコストを支払える効果がありません"
    }
    if (millPay !== undefined && millPay > 0 && millPay !== cost) {
        return `配置コストはコアとデッキ破棄のどちらか一方で支払います（デッキで払うなら${cost}枚）`
    }
    if (millPay !== undefined && millPay > player.deck.length) return "デッキの残り枚数が足りません"
    const millPaid = nexusMillPayAmount(state, pid, cost, maintain, paySources, millPay)
    // [ソウルコア]の使い方の排他と維持コアとして置けるか（2026-10-06）
    if (paySoulCoreFromReserve === true && placeSoulCoreFromReserve === true) {
        return "[ソウルコア]をコストと維持コアの両方に使うことはできません"
    }
    if (placeSoulCoreFromReserve === true) {
        if (!soulCoreInReserve(player)) return "リザーブに[ソウルコア]がありません"
        if (maintain < 1) return "このネクサスはコアを置かないため[ソウルコア]を維持コアにできません"
    }
    if (paySources?.some((s) => s.soulCoreToMaintain === true) && maintain < 1) {
        return "このネクサスはコアを置かないため[ソウルコア]を維持コアにできません"
    }
    // フィールドのコアはコストにも「置くコア」にも充当できる（need = cost + maintain）
    const payError = validatePaySources(state, pid, cost + maintain - millPaid, paySources, paySoulCoreFromReserve === true || placeSoulCoreFromReserve === true)
    if (payError) {
        const label = millPaid > 0 ? "置くコア" : "コスト+置くコア"
        return payError === "コアが足りません" ? `コアが足りません（${label}で${cost + maintain - millPaid}個必要）` : payError
    }
    return null
}

// バーストのセット（docs/design/BURST.md）：自分のターンのメインステップ限定・ターン1回。
// 対象カードが kind:"burst" を持たないなら拒否する（公式ルールは敗北だが、誤操作で敗北させるのは
// 体験が悪いので拒否に簡略化する。2026-09-11 ユーザー確認）。setBurstFromHand（効果によるセット）は
// この検証を経由しない別経路のため、ターン1回制限を受けない
export function validateSetBurst(state: GameState, pid: PlayerId, handIndex: number): string | null {
    const timing = checkMainTiming(state, pid)
    if (timing) return timing
    const player = state.players[pid]
    if (player.burstSetThisTurn) return "バーストのセットはターンに1回までです"
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    if (!getCard(cardId).effects.some((e) => e.kind === "burst")) return "バースト効果を持たないカードです"
    // 相手はリザーブのコアを指定数トラッシュへ置かなければセットできない（足りなければ手札に残る）
    const required = burstSetCoresRequired(state, pid)
    if (required > 0 && player.reserve < required) {
        return `相手の効果により、バーストのセットにはリザーブのコアが${required}個必要です`
    }
    return null
}

// ネクサスの配置コストをデッキ破棄で支払う枚数を決める。
// **コア払いとの併用はできない**（2026-08-24 ユーザー確認）。返る値は 0（全額コア）か cost（全額デッキ破棄）のみ。
// millPay が渡っていればその意思表示、無ければ「コアで足りるならコア、足りなければ全額デッキ」を自動選択（AI・旧クライアント向け）。
// validateSetNexus と doSetNexus が同じ値を出すよう、必ずこの関数を通すこと
export function nexusMillPayAmount(
    state: GameState,
    pid: PlayerId,
    cost: number,
    maintain: number,
    paySources: PaySource[] | undefined,
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

// スピリットの召喚コストのうち、手札破棄で支払う枚数を決める。「どこまで手札破棄で払うか」は**プレイヤーが選ぶ**
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
    discardHandIndices?: number[],
): number {
    if (!canPaySummonCostByHandDiscard(state, pid)) return 0
    const player = state.players[pid]
    const cap = Math.min(cost, Math.max(0, player.hand.length - 1))
    if (discardHandIndices !== undefined) return Math.min(discardHandIndices.length, cap)
    const fromSources = (paySources ?? []).reduce((sum, s) => sum + Math.max(0, s.count), 0)
    const available = player.reserve + fromSources
    const shortfall = Math.max(0, cost + maintain - available)
    return Math.min(shortfall, cap)
}

// プレイヤーが選んだ破棄対象の妥当性（枚数ではなく指定内容）を検証する。枚数の上限は summonHandDiscardPayAmount がクランプする
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

// バトル中に手札のカードを使うときの共通検証（フラッシュマジック・神速召喚・kind:"handActivated" の3者で共有。BS15_PLAN.md §7.2）。
// 優先権を持つプレイヤーのみ／lockFlash 適用中は使えない
export function validateHandFlash(state: GameState, pid: PlayerId, cardType?: CardType): string | null {
    if (!state.isFlashTiming) return "フラッシュタイミングではありません"
    if (pid !== state.priorityPlayer) return "現在フラッシュの優先権がありません"
    if (isFlashLockedFor(state, pid, cardType)) {
        return "効果により、フラッシュで手札のカードを使用できません"
    }
    return null
}

// 手札から使うフラッシュ（kind:"handActivated"）の検証。バトル中の共通判定は validateHandFlash に任せ、
// ここは手札に実在するかとタイミング（phase一致）だけを見る
export function validateUseHandAbility(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    effectId: string,
): string | null {
    const player = state.players[pid]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const card = getCard(cardId)
    const effect = zoneSpiritEffectsDisabled(state, cardId) ? undefined : card.effects.find((e) => e.kind === "handActivated" && e.id === effectId)
    if (!effect || effect.kind !== "handActivated") return "その効果は使用できません"
    if (effect.cost.discardSelf && !canDiscardHand(state, pid)) return "手札を破棄できません"
    if (effect.phase !== undefined && state.phase !== effect.phase) {
        return "このステップでは使用できません"
    }
    if (effect.timing === "flash") {
        if (!state.battle) return "フラッシュタイミングではありません"
        const flashError = validateHandFlash(state, pid)
        if (flashError) return flashError
    }
    return null
}

export function validateCastMagic(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    targetInstanceId?: string,
    paySources?: PaySource[],
    fromTegamoto?: boolean,
    exReductionTrashIndices?: number[],
    paySoulCoreFromReserve?: boolean,
    // 「自分の◯シンボルがあれば[ソウルコア]だけで使用できる」（kind:"soulCoreOnlyCast"）で使用する
    useSoulCoreOnly?: boolean,
    timing?: "main" | "flash",
): string | null {
    const player = state.players[pid]
    const cardId = fromTegamoto ? player.tegamoto[handIndex] : player.hand[handIndex]
    if (cardId === undefined) return fromTegamoto ? "手元にカードがありません" : "手札にカードがありません"
    const card = getCard(cardId)
    const bannedMagic = fromTegamoto ? null : handCardBanned(state, pid, cardId)
    if (bannedMagic) return bannedMagic
    if (card.type !== "magic") return "マジックカードではありません"
    // battleLock "magic"（BS16-X06）：手札・手元どちらの経路でも「使用」自体を止める。バースト発動は別経路なので掛からない
    if (timedMagicLocked(state, pid)) return "効果により、このバトルの間マジックを使用できません"
    if (magicColorBanned(state, pid, card.colors)) return "効果により、この色のマジックは使用できません"

    // 手元(tegamoto)からの使用は、scope:"allMagicHandAndTegamoto" の無償化が有効な場合のみ許可する
    // （noFreeCastOpponent が有効なら無償化自体が打ち消される）
    if (fromTegamoto) {
        // 手元へ置かれたカードは「手札にあるときと同様に」使える（無償ではなく通常どおりコストを支払う）。使用権は PlayerState.tegamotoPlayable
        const playableAsHand = player.tegamotoPlayable.includes(cardId)
        if (
            !playableAsHand &&
            (!hasMagicFreeGrant(state, pid, card, true) ||
                hasMagicRestriction(state, pid, "noFreeCastOpponent"))
        ) {
            return "手元のマジックカードを使用できる効果がありません"
        }
    }

    // フィールドに発生源があれば、お互いターンに1回しかマジックの効果を使用できない
    if (hasMagicRestriction(state, pid, "oncePerTurnAll") && (state.magicUsedThisTurn[pid] ?? 0) >= 1) {
        return "このターンはすでにマジックの効果を使用しているため使用できません"
    }
    // どちらかのフィールドに発生源があれば、お互い指定コスト以下のマジックを使用できない
    if (hasMagicCostLock(state, card)) {
        return "このコストのマジックは、場の効果によって使用できません"
    }
    // 相手フィールドに発生源があれば、マジックのコストはすべてリザーブから支払う（フィールドのコアを支払い元にできない）
    if (hasMagicRestriction(state, pid, "reserveOnlyOpponent") && (paySources ?? []).length > 0) {
        return "このマジックのコストはすべてリザーブから支払わなくてはなりません"
    }
    // 相手フィールドに発生源があれば、マジックのコストをスピリット上のコアでは支払えない
    // （reserveOnlyOpponentと違いネクサス上のコアは支払える。paySourcesはどちらのinstanceIdも受け付けるためfindSpiritで判定）
    if (
        hasMagicRestriction(state, pid, "noSpiritCoresOpponent") &&
        (paySources ?? []).some((src) => findSpirit(player, src.instanceId) !== undefined)
    ) {
        return "このマジックのコストは、相手のスピリット上のコアでは支払えません"
    }
    // 相手フィールドに発生源があれば、自分のフィールドのシンボル色と一致しない色のマジックは使用できない
    const fieldSymbolColors = ownFieldSymbolColors(state, pid)
    if (
        hasMagicRestriction(state, pid, "colorLockOpponent") &&
        !card.colors.some((c) => fieldSymbolColors.has(c))
    ) {
        return "このマジックの色と一致するシンボルが自分のフィールドにないため使用できません"
    }

    // 相手フィールドに発生源があれば、**使用者のトラッシュにあるマジックカード**と同じ色を含むマジックは使用できない
    // （colorLockOpponent の裏返し）
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

    if (targetInstanceId !== undefined) {
        const exists =
            findSpirit(state.players[pid], targetInstanceId) !== undefined ||
            findSpirit(state.players[opponentOf(pid)], targetInstanceId) !==
                undefined
        if (!exists) return "対象のスピリットが見つかりません"
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

    // ownTurnForbidden：発生源の持ち主のターン中はこのマジックを使用できない（battle/main どちらの経路でも宣言自体を拒否）
    if (
        state.turnPlayer === pid &&
        card.effects.some((e) => e.kind === "magic" && e.timing === "flash" && e.ownTurnForbidden)
    ) {
        return "このマジックは自分のターンでは使用できません"
    }
    // 「この効果は〜ないと使えない」（useCondition）：使う前に見る（2026-09-26 ユーザー確認）。
    // 使うことになる timing のエントリで判定する
    const useTiming = magicUseTiming(card, !!state.battle, timing)
    if (useTiming === null) return timing === "main" ? "フラッシュタイミングではメイン効果を使用できません" : "このマジックにはその効果がありません"
    for (const e of card.effects) {
        if (e.kind !== "magic" || e.timing !== useTiming || !e.useCondition) continue
        const failure = magicConditionFailure(state, pid, e.useCondition)
        if (failure) return `${failure}ため、このマジックは使用できません`
    }
    // 「〜とき、〜する」（condition）も、そのタイミングの効果がすべて条件を満たさず不発になるなら使用できない
    // （2026-10-29 ユーザー指摘。対象がいないマジックと同じ考え方＝targetRequirement.ts）
    const useEntries = card.effects.filter((e) => e.kind === "magic" && e.timing === useTiming)
    const condFailures = useEntries.map((e) => (e.kind === "magic" && e.condition ? magicConditionFailure(state, pid, e.condition) : null))
    if (condFailures.length > 0 && condFailures.every((f) => f !== null)) return `${condFailures[0]}ため、このマジックは使用できません`
    if (state.phase === "main" && card.effects.some((e) => e.kind === "castRestriction" && e.notInMainStep)) {
        return "このカードはメインステップでは使用できない"
    }
    const usedKey = `${card.name}|${useTiming}`
    if (
        card.effects.some((e) => e.kind === "magic" && e.timing === useTiming && e.oncePerTurnByName) &&
        state.magicEffectsUsedByName?.[pid]?.includes(usedKey)
    ) {
        return "このカードの効果はこのターンすでに使用しています"
    }
    const windowDenial = magicUseWindowDenial(state, pid, cardId, useTiming)
    if (windowDenial) return windowDenial
    if (state.battle) {
        const flashError = validateHandFlash(state, pid, fromTegamoto ? undefined : "magic")
        if (flashError) return flashError
        if (!card.flash) return "このマジックはフラッシュタイミングで使用できません"
        // 「ブロック宣言後のフラッシュで使えない」。ブロックされているかは blockerInstanceId で見る
        // （ブロックしない＝takeLife はその場でライフ処理まで進むので、ここに来る窓が無い）
        if (
            state.battle.blockerInstanceId !== null &&
            card.effects.some((e) => e.kind === "magic" && e.timing === "flash" && e.afterBlockForbidden)
        ) {
            return "このマジックはブロック宣言後のフラッシュタイミングでは使用できません"
        }
    } else {
        const timing = checkMainTiming(state, pid)
        if (timing) return timing
        const usedEntries = card.effects.filter(
            (e): e is Extract<EffectDef, { kind: "magic" }> =>
                e.kind === "magic" && e.timing === useTiming,
        )
        if (usedEntries.length > 0 && usedEntries.every((e) => e.mainForbidden)) {
            return "このマジックはメインステップでは使用できません"
        }
        // メインステップからフラッシュ効果を使うことを禁止する
        if (
            useTiming === "flash" &&
            (hasMagicRestriction(state, pid, "noFlashAll") || hasMagicRestriction(state, pid, "noFlashOpponent"))
        ) {
            return "このターン、マジックカードのフラッシュ効果を使用できません"
        }
    }

    if (magicTargetMissing(state, pid, card, useTiming)) return "効果の対象がいないため、このマジックは使用できません"
    // 「〜することで」を払えない・後半を解決できないなら使用できない（COST_MODEL §1）。使うタイミングの効果がすべてそうなるときだけ拒否する
    const payFailures = useEntries.map((e) => (e.kind === "magic" && e.action.type === "pay" ? unpayablePayReason(state, pid, e.action, card) : null))
    if (payFailures.length > 0 && payFailures.every((f) => f !== null)) return `${payFailures[0]}ため、このマジックは使用できません`

    // 《継召》のEXシンボル除外軽減（validateSummon と同じ検証）：候補はトラッシュのEXシンボル持ちカードに限り、
    let exReductionSymbols: Color[] = []
    if (exReductionTrashIndices && exReductionTrashIndices.length > 0) {
        const candidates = exTrashReductionCandidateIndices(state, pid, card)
        const seen = new Set<number>()
        for (const idx of exReductionTrashIndices) {
            if (!candidates.includes(idx)) return "指定したトラッシュのカードは《継召》の軽減に使えません"
            if (seen.has(idx)) return "同じカードを重複して指定しています"
            seen.add(idx)
        }
        exReductionSymbols = exReductionTrashIndices.flatMap((idx) => exSymbolsOfTrashCard(state, pid, idx))
    }
    if (useSoulCoreOnly) {
        const soulOnly = card.effects.find((e): e is Extract<EffectDef, { kind: "soulCoreOnlyCast" }> => e.kind === "soulCoreOnlyCast")
        if (!soulOnly) return "このマジックは[ソウルコア]だけで使用できません"
        if (!ownFieldSymbolColors(state, pid, soulOnly.symbolAs).has(soulOnly.color)) return "自分のフィールドに指定色のシンボルがありません"
        // [ソウルコア]の所在は文言上限定されない。リザーブでも自分のスピリット/ネクサスの上でも使える
        // （2026-10-06 ユーザー確認。トラッシュの[ソウルコア]は支払いに使えないものとする）
        if (player.soulCore === null || player.soulCore.zone === "trash") return "[ソウルコア]がありません"
        if (paySources && paySources.some((s) => s.soulCoreToMaintain === true)) {
            return "マジックはコアを置かないため[ソウルコア]を維持コアにできません"
        }
        if (paySources && paySources.length > 0) return "[ソウルコア]だけで使用する場合は他のコアを支払えません"
    }
    const payError = useSoulCoreOnly
        ? null // [ソウルコア]だけで使用するとき通常コアの支払い検証は不要（コスト0として扱う）
        : validatePaySources(state, pid, effectiveCost(state, pid, card, false, exReductionSymbols), paySources, paySoulCoreFromReserve)
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
    if (activeConstraints(state, pid, hosts[0]!).some((c) => c.type === "cantSeparate")) {
        return "この合体スピリットは分離できません"
    }
    if (cantSpiritStateBrave(state, pid)) return "相手の効果により、ブレイヴをスピリット状態にできません"
    // 分離は「置くコア」だけの支払い。[ソウルコア]はコスト（→トラッシュ）としてのみ使えるため含められない
    if (paySources?.some((s) => s.includeSoulCore === true)) return "[ソウルコア]はコストとしてのみ支払えます"
    return validatePaySources(state, pid, braveKeepCores(brave), paySources)
}

export function validateMoveCore(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    direction: "add" | "remove",
    confirmDeplete?: true,
    // [ソウルコア]を動かすメインステップ操作（docs/design/SOULCORE.md §1.4の自由なコア移動の一部。
    // add=リザーブの[ソウルコア]をこの個体へ、remove=この個体の[ソウルコア]をリザーブへ）
    soulCore?: boolean,
): string | null {
    const timing = checkMainTiming(state, pid)
    if (timing) return timing
    const player = state.players[pid]
    // ネクサスもレベルを上げ下げできる。ネクサスの Lv1 は全カード0コアのため、維持コア判定でそのまま0まで戻せる
    const inst = findSpirit(player, instanceId) ?? findNexus(player, instanceId)
    if (!inst) return "対象のカードが見つかりません"
    if (soulCore) {
        // [ソウルコア]の移動検証: 通常コアの数値は不動のため reserve/cores の検証は不要。
        // 取り除くと維持コアを割るときは通常コアと同じ confirmDeplete の確認が要る
        if (direction === "add") {
            if (!soulCoreInReserve(player)) return "リザーブに[ソウルコア]がありません"
        } else {
            if (!soulCoreOnInstance(player, instanceId)) return "この個体に[ソウルコア]がありません"
            if (coreRemovalAllowed(state, { ownerPid: pid, target: inst, amount: 1, cause: "player", actorPid: pid }) < 1) return "このカードのコアは取り除けません"
            if (inst.cores - 1 < instMinLevelCores(inst) && !confirmDeplete) {
                return "維持コア（Lv1）を下回るため[ソウルコア]を取り除けません"
            }
        }
        return null
    }
    if (direction === "add") {
        if (player.reserve < 1) return "リザーブにコアがありません"
        // 案B-inside: リザーブに[ソウルコア]しか無いなら通常の＋では動かせない（魂＋を使う）
        if (normalReserveOf(player) < 1) return "リザーブに[ソウルコア]しかありません"
    } else {
        if (inst.cores < 1) return "コアが置かれていません"
        if (inst.cores - (soulCoreOnInstance(player, instanceId) ? 1 : 0) < 1) return "このカードには[ソウルコア]しか置かれていません"
        // プレイヤーの操作でも、取り除けない系の禁止・バトル中の保護・下限が効く（2026-08-25 / 10-30 ユーザー確認）
        if (coreRemovalAllowed(state, { ownerPid: pid, target: inst, amount: 1, cause: "player", actorPid: pid }) < 1) return "このカードのコアは取り除けません"
        const need = instMinLevelCores(inst)
        // confirmDeplete：維持コア割れを承知のうえで取り除く（doMoveCore がそのスピリットを消滅させる）。
        // クライアントが確認を取ってからこのフラグを立てる（2026-08-23 ユーザー要望）
        if (inst.cores - 1 < need && !confirmDeplete) {
            return "維持コア（Lv1）を下回るためコアを取り除けません"
        }
    }
    return null
}

export function validateAwaken(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    fromInstanceId: string,
    count: number,
): string | null {
    if (!state.isFlashTiming) return "フラッシュタイミングではありません"
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
        if (!canAwakenFromReserve(state, pid, target)) {
            return "リザーブから【覚醒】できる効果がありません"
        }
        if (player.reserve < count) return "リザーブのコアが足りません"
        return null
    }
    const from = findSpirit(player, fromInstanceId)
    if (!from) return "コアの移動元スピリットが見つかりません"
    if (from.cores < count) return "移動元のコアが足りません"
    if (coreRemovalAllowed(state, { ownerPid: pid, target: from, amount: count, cause: "effect", actorPid: pid }) < count) return "そのスピリットのコアは取り除けません"
    return null
}

export function validateActivateAbility(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    effectId: string,
): string | null {
    // ネクサスの起動能力もあるのでスピリットで見つからなければネクサスも探す。
    // 【合体時】の起動能力は合体しているブレイヴが持つので combinedBraves も探す（その場合レベル・バトル参加・疲労はホストを見る）
    const brave = state.players[pid].field.combinedBraves.find((b) => b.instanceId === instanceId)
    const inst =
        findSpirit(state.players[pid], instanceId) ??
        state.players[pid].field.nexuses.find((n) => n.instanceId === instanceId) ??
        brave
    if (!inst) return "対象のカードが見つかりません"
    const host = brave ? hostsOf(state.players[pid], brave)[0] : inst
    if (!host) return "合体先のスピリットが見つかりません"
    const level = currentLevel(host).level
    const effect = getCard(inst.cardId).effects.find(
        (e) => e.kind === "activated" && e.id === effectId,
    )
    if (!effect || effect.kind !== "activated") return "起動能力が見つかりません"
    if (effect.whileCombined && !brave) return "合体しているときだけ発動できます"
    if (!effect.whileCombined && brave) return "この効果は合体中のブレイヴからは発動できません"
    if (!entryActive(state, pid, inst, effect, level)) {
        return "現在のレベルでは発動できません"
    }
    if (effect.ownTurnOnly && state.turnPlayer !== pid) return "このターンでは発動できません"
    if (effect.timing === "flashBattle") {
        if (!state.isFlashTiming || !state.battle) {
            return "フラッシュタイミングではありません"
        }
    } else if (effect.timing === "main") {
        // 『自分のメインステップ』：自分のターンのメインステップ中なら任意のタイミングで発動できる。バトル中は対象外で優先権も見ない
        const mainTiming = checkMainTiming(state, pid)
        if (mainTiming) return mainTiming
        if (state.pendingChoice) return "他の効果の解決中です"
    } else if (effect.timing === "flash") {
        // flashBattleと異なり、バトル外（自分のメインステップ）でも発動できる。
        // バトル外の「フラッシュ優先権」窓が無いため、自分のメインステップを唯一のバトル外発動タイミングとする決定的簡略化
        const inBattleFlash = state.isFlashTiming && state.battle !== null
        const inOwnMain = !state.battle && state.turnPlayer === pid && state.phase === "main"
        if (!inBattleFlash && !inOwnMain) {
            return "フラッシュタイミングではありません"
        }
    }
    // ステップ・手番の明示（『自分のアタックステップ』等）。timing だけでは絞れないぶんをここで見る
    if (effect.phaseTurn) {
        if (state.phase !== effect.phaseTurn.phase) return "このステップでは発動できません"
        const turnOk =
            effect.phaseTurn.turn === "both" ||
            (effect.phaseTurn.turn === "own") === (state.turnPlayer === pid)
        if (!turnOk) return "このターンでは発動できません"
    }
    if (effect.action.type === "combineOwnBrave" && effect.action.hostSelf && braveCombineOntoSelfCandidates(state, pid, inst).length === 0) {
        return "合体させられるブレイヴがいません"
    }
    if (effect.condition === "selfInBattle") {
        if (
            !state.battle ||
            (state.battle.attackerInstanceId !== instanceId &&
                state.battle.blockerInstanceId !== instanceId)
        ) {
            return "このスピリットはバトルに参加していません"
        }
    }
    // 『アタック中』窓：self が現在のバトルのアタッカーのときだけ（ブロッカーは含まない）
    if (effect.condition === "selfAttacking") {
        if (!state.battle || state.battle.attackerInstanceId !== instanceId) {
            return "このスピリットのアタック中しか発動できません"
        }
    }
    if (effect.condition === "selfBlocking") {
        if (!state.battle || state.battle.blockerInstanceId !== instanceId) {
            return "このスピリットのブロック中しか発動できません"
        }
    }
    // 自分のスピリット/ネクサスすべてが指定チーム所属のときだけ。0体では不成立
    if (typeof effect.condition === "object" && "ownAllHaveTeam" in effect.condition) {
        if (!ownAllHaveTeam(state, pid, effect.condition.ownAllHaveTeam)) {
            return "自分のスピリット/ネクサスすべてが指定チームを持っていません"
        }
    }
    if (typeof effect.condition === "object" && "ownAllHaveFamily" in effect.condition) {
        if (!ownAllHaveFamily(state, pid, effect.condition.ownAllHaveFamily)) {
            return "自分のスピリット/ネクサスすべてが指定系統を持っていません"
        }
    }
    if (typeof effect.condition === "object" && "ownTeamAtLeast" in effect.condition) {
        if (!ownTeamAtLeast(state, pid, effect.condition.ownTeamAtLeast)) {
            return "条件となるチーム所属の自分のスピリットが足りません"
        }
    }
    if (typeof effect.condition === "object" && "soulCoreInReserve" in effect.condition) {
        if (!soulCoreInReserve(state.players[pid])) {
            return "リザーブに[ソウルコア]がありません"
        }
    }
    if (typeof effect.condition === "object" && "ownKeishoExcludedTeamAtLeast" in effect.condition) {
        if (!keishoExcludedTeamAtLeast(state, effect.condition.ownKeishoExcludedTeamAtLeast)) {
            return "この継召で除外したチーム所属カードが条件に足りません"
        }
    }
    if (typeof effect.condition === "object" && "selfRested" in effect.condition) {
        if (!inst.isRested) {
            return "この効果は疲労状態のときしか使えません"
        }
    }
    if (typeof effect.condition === "object" && "summonedBy" in effect.condition) {
        if (inst.summonedBy !== effect.condition.summonedBy) {
            return "このスピリットはこの効果が要求する経路で召喚されていません"
        }
    }
    // フラッシュ優先権（手札のカードではなくスピリットの能力なので lockFlash は適用しない）。
    // timing:"main" はフラッシュの窓ではないので優先権を見ない
    if (effect.timing !== "main" && pid !== state.priorityPlayer) {
        return "現在フラッシュの優先権がありません"
    }
    // 「ターンに1回」：既定は発生源1体につき1回。onceScope:"name" は同名で1回
    if (effect.oncePerTurn && isOnceUsed(state, pid, inst, effect, "activatedUsedTurn")) {
        return "この効果はこのターンすでに使いました"
    }
    // 〔バトル1回〕（oncePerBattle）：このバトルで発動済みなら拒否（バトル終了で枠は戻る）
    if (effect.oncePerBattle && isOncePerBattleUsed(state, inst, effect.id)) {
        return "この効果はバトルに1回しか使えません"
    }
    // コスト支払い可否。exhaustSelf は既に疲労していると払えない。cost 省略時は追加コストなし
    if (effect.cost === undefined && effect.action.type === "pay" && !activatedActionResolvable(state, pid, inst, effect.action)) {
        return "コストを払えないか、効果の対象がいません"
    }
    if (effect.cost !== undefined) {
        if (!activatedActionResolvable(state, pid, inst, effect.action)) return "効果の対象がいません"
        if ("exhaustSelf" in effect.cost) {
            if (host.isRested) return "すでに疲労しています"
        } else if ("selfCoresToTrash" in effect.cost) {
            if (host.cores < effect.cost.selfCoresToTrash) return "コアが足りません"
            if (coreRemovalAllowed(state, { ownerPid: pid, target: host, amount: effect.cost.selfCoresToTrash, cause: "cost", actorPid: pid }) < effect.cost.selfCoresToTrash) return "コアを取り除けません"
        } else if ("discardHandFamily" in effect.cost) {
            if (!canDiscardHand(state, pid)) return "手札を破棄できません"
            const wanted = Array.isArray(effect.cost.discardHandFamily)
                ? effect.cost.discardHandFamily
                : [effect.cost.discardHandFamily]
            const hasCard = state.players[pid].hand.some(
                (cardId) => getCard(cardId).type === "spirit" && wanted.some((f) => getCard(cardId).family.includes(f)),
            )
            if (!hasCard) return "破棄できるカードが手札にありません"
        } else if ("discardHandColor" in effect.cost) {
            if (!canDiscardHand(state, pid)) return "手札を破棄できません"
            const color = effect.cost.discardHandColor
            const hasCard = state.players[pid].hand.some((cardId) => cardHasColor(getCard(cardId), color))
            if (!hasCard) return "破棄できるカードが手札にありません"
        } else if ("exhaustOwnFamilyOne" in effect.cost) {
            const family = effect.cost.exhaustOwnFamilyOne
            const hasCandidate = state.players[pid].field.spirits.some(
                (s) => !s.isRested && matchesFamilyFilter(state, pid, s, family),
            )
            if (!hasCandidate) return "疲労させられるスピリットがいません"
        } else if ("discardHandOne" in effect.cost) {
            if (!canDiscardHand(state, pid)) return "手札を破棄できません"
            if (host.isRested) return "すでに疲労しています"
            if (state.players[pid].hand.length < 1) return "破棄できるカードが手札にありません"
        } else if ("discardHandKeyword" in effect.cost) {
            if (!canDiscardHand(state, pid)) return "手札を破棄できません"
            const keyword = effect.cost.discardHandKeyword
            const hasCard = state.players[pid].hand.some(
                (cardId) => getCard(cardId).type === "spirit" && hasKeyword(cardId, keyword),
            )
            if (!hasCard) return "破棄できるカードが手札にありません"
        } else if (autoPayPlan(state, pid, Math.max(0, effect.cost.reserveToTrash - (effectCostDiscountNexus(state, pid, inst.cardId)?.amount ?? 0)), true) === null) {
            return "コアが足りません"
        }
    }
    // summon{from:"hand"} に requireCandidate があるとき、手札に候補が1枚もなければ起動自体を拒否する
    // （受理すると「バウンスだけ起きて必須の召喚が不発」になるため。sequence/if の中も走査）
    for (const action of effectActionsDeep(effect.action)) {
        if (action.type === "moveCards" && action.requireCandidate === true) {
            if (moveCardCandidates(state, pid, action, undefined, inst.cardId).length === 0) return "手札に召喚できる対象がありません"
        }
        if (action.type === "summon" && action.from === "hand" && action.requireCandidate === true) {
            const hasCandidate = state.players[pid].hand.some((cardId) =>
                summonFromHandFreeCandidateMatches(state, pid, inst, action, cardId),
            )
            if (!hasCandidate) return "手札に召喚できる対象がありません"
        }
    }
    return null
}

// 起動効果の action ツリーから summon{from:"hand"} 等を再帰的に収集する（sequence と if/then/else を辿る）
function effectActionsDeep(action: EffectAction, acc: EffectAction[] = []): EffectAction[] {
    acc.push(action)
    if (action.type === "sequence") {
        for (const a of action.actions) effectActionsDeep(a, acc)
    } else if (action.type === "if") {
        effectActionsDeep(action.then, acc)
        if (action.else) effectActionsDeep(action.else, acc)
    }
    return acc
}

export function validateAttack(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    targetSpiritInstanceId?: string,
    paySources?: PaySource[],
    paySoulCoreFromReserve?: boolean,
): string | null {
    if (state.turnPlayer !== pid) return "自分のターンではありません"
    if (state.phase !== "attack") return "アタックステップではありません"
    if (state.turn === 1) return "先攻1ターン目はアタックできません"
    if (state.battle) return "バトルの解決中です"
    const inst = findSpirit(state.players[pid], instanceId)
    if (!inst) return "対象のスピリットが見つかりません"
    if (inst.isRested) return "疲労しているためアタックできません"
    if (cantActByTimed(state, inst)) return "このターンの間、このスピリットはアタックできません"
    if (currentLevel(inst).level < 1) return "レベル1未満のためアタックできません"
    const first = state.players[pid].field.spirits.find(
        (s) => s.instanceId !== instanceId && mustAttackFirst(state, s) && mustAttackNow(state, pid, s),
    )
    if (first) return `${getCard(first.cardId).name}がこのステップの最初にアタックしなければなりません`
    if (inst.cores === 1 && hasGlobalConstraint(state, "singleCoreCantAct")) {
        return "コア1個しか置いていないスピリットはアタックできません"
    }
    if (inst.cores === 1 && hasGlobalConstraint(state, "singleCoreCantAttack")) {
        return "コア1個しか置いていないスピリットはアタックできません"
    }
    if (instCostCantAct(state, inst)) {
        return "コストが低いためアタックできません"
    }
    if (instCantAttackByOpponentCost(state, pid, inst)) {
        return "コストによりアタックできません"
    }
    if (instCantAttackByCost(state, inst)) {
        return "コストによりアタックできません"
    }
    if (instCantAttackByFewOwnSpirits(state, pid, inst)) {
        return "自分のフィールドのスピリットが少ないためアタックできません"
    }
    // アタックにはリザーブのコア1個の支払いが要る。リザーブが空ならアタック不可（支払い自体は GameEngine.doAttack が自動で行う）
    const toll = attackTollTotal(state, pid, inst)
    const payToll = attackPayTollCount(state, pid, inst)
    if (toll > 0 && state.players[pid].reserve < toll - payToll) {
        return `リザーブのコアが${String(toll - payToll)}個ないためアタックできません`
    }
    // attackPayToll（26RSD06-011）はフィールドのコアも含めて払える（2026-10-11 ユーザー確認）。
    // paySources 省略時はリザーブだけで払う（AI・旧クライアント）
    if (payToll > 0) {
        if (!paySources || paySources.length === 0) {
            if (state.players[pid].reserve < toll) return `リザーブのコアが${String(toll)}個ないためアタックできません`
        } else {
            const payError = validatePaySources(state, pid, payToll, paySources, paySoulCoreFromReserve)
            if (payError) return `アタックするには${String(payToll)}コスト必要です（${payError}）`
            const fromSelf = paySources.find((s) => s.instanceId === instanceId)
            if (fromSelf && inst.cores - fromSelf.count < minLevelCores(getCard(inst.cardId))) {
                return "アタックするスピリットの維持コアを支払いに使うことはできません"
            }
        }
    } else if (paySources && paySources.length > 0) {
        return "このアタックにコストは要りません"
    }
    if (activeConstraints(state, pid, inst).some((c) => c.type === "cantAttack")) {
        return "このスピリットはアタックできません"
    }
    if (attackOncePerTurnLimitApplies(state, inst)) {
        return "このスピリットは既にこのターンアタックしています"
    }
    if (attackTotalOncePerTurnLimitApplies(state, pid, inst)) {
        return "このターンはコストの低いスピリットがすでにアタックしています"
    }
    if (attackOncePerTurnByCostLimitApplies(state, inst)) {
        return "このスピリットは既にこのターンアタックしています"
    }

    const forcedTargets = mustBeAttackTargetIds(state, pid, inst)
    if (forcedTargets.length > 0) {
        if (targetSpiritInstanceId === undefined) return "相手の効果により、相手のスピリットを指定してアタックしなければなりません"
        if (!forcedTargets.includes(targetSpiritInstanceId)) return "相手の効果により、指定されたスピリットしか指定できません"
    }

    if (targetSpiritInstanceId !== undefined) {
        const targetFilter = directAttackFilter(state, pid, inst)
        if (targetFilter === null) {
            return "このスピリットは指定アタックできません"
        }
        const target = findSpirit(state.players[opponentOf(pid)], targetSpiritInstanceId)
        if (!target) return "指定した相手スピリットが見つかりません"
        // アタッカーを渡す＝【装甲】/【重装甲】で効果を受けない個体は指定できない
        const filterError = matchesDirectedAttackFilter(targetFilter, target, state, opponentOf(pid), {
            pid,
            inst,
        })
        if (filterError) return filterError
    }
    return null
}

// 効果で「可能ならブロックしなければならない」と指定され、いまブロックできる自分のスピリット（26RSD03-007）。
// 支払いが要るブロックは任意なので強制しない（hasLegalBlocker と同じ）
function forcedBlockers(state: GameState, pid: PlayerId): CardInstance[] {
    if (!state.battle) return []
    const attackerPid = opponentOf(pid)
    const attacker = findSpirit(state.players[attackerPid], state.battle.attackerInstanceId)
    if (blockPayCost(state, attackerPid, attacker) > 0 || blockReserveToTrashCount(state, attackerPid, attacker) > 0 || blockExhaustSpiritRequired(state, attackerPid, attacker)) return []
    return state.players[pid].field.spirits.filter(
        (s) => timedContentsOn(state, s).some((c) => c.type === "mustBlock") && currentLevel(s).level >= 1 && !instCostCantAct(state, s) && canBlock(state, pid, s, attackerPid, attacker) === null,
    )
}

export function validateBlock(
    state: GameState,
    pid: PlayerId,
    instanceId: string,
    paySources?: PaySource[],
    paySoulCoreFromReserve?: boolean,
): string | null {
    if (!state.battle) return "バトルが発生していません"
    if (pid !== opponentOf(state.turnPlayer)) return "防御側ではありません"
    // ブロック宣言はフラッシュタイミングの外（フラッシュ①終了後）でのみ可。優先権の有無に関わらずフラッシュ中は宣言できない
    if (state.isFlashTiming) {
        return "フラッシュタイミング中はブロックを宣言できません"
    }
    if (state.battle.blockerInstanceId) return "すでにブロックしています"
    const inst = findSpirit(state.players[pid], instanceId)
    if (!inst) return "対象のスピリットが見つかりません"
    // 複数体ブロック（blockRequiresCount）：必要数がそろうまで宣言を貯めるので同じ個体を二度は選べない
    if ((state.battle.pendingBlockerIds ?? []).includes(instanceId)) {
        return "そのスピリットはすでにブロック宣言しています"
    }
    // 疲労状態でのブロック可否（canBlockWhileRested）はアタッカー情報が要るため、下の canBlock（共有実装）にまとめて判定させる
    if (currentLevel(inst).level < 1) return "レベル1未満のためブロックできません"
    if (inst.cores === 1 && hasGlobalConstraint(state, "singleCoreCantAct")) {
        return "コア1個しか置いていないスピリットはブロックできません"
    }
    if (instCostCantAct(state, inst)) {
        return "コストが低いためブロックできません"
    }
    const costAttacker = state.battle ? findSpirit(state.players[opponentOf(pid)], state.battle.attackerInstanceId) : undefined
    for (const c of costAttacker ? timedContentsOn(state, costAttacker) : []) {
        if (c.type !== "blockCost") continue
        if (c.cost === "reserveCoreToTrash" && normalReserveOf(state.players[pid]) < c.count) return `リザーブのコアが${String(c.count)}個ないためブロックできません`
        if (c.cost === "discardMagic" && !canDiscardHand(state, pid)) return "手札を破棄できないためブロックできません"
        if (c.cost === "discardMagic" && state.players[pid].hand.filter((id) => getCard(id).type === "magic").length < c.count) {
            return "手札にマジックカードがないためブロックできません"
        }
    }
    const reserveToll = blockReserveToTrashCount(state, opponentOf(pid), costAttacker)
    if (reserveToll > 0 && normalReserveOf(state.players[pid]) < reserveToll) return `リザーブのコアが${String(reserveToll)}個ないためブロックできません`
    if (blockExhaustSpiritRequired(state, opponentOf(pid), costAttacker) && !state.players[pid].field.spirits.some((sp) => sp.instanceId !== instanceId && !sp.isRested)) {
        return "疲労させるスピリットがいないためブロックできません"
    }
    const forced = forcedBlockers(state, pid)
    if (forced.length > 0 && !forced.some((s) => s.instanceId === instanceId)) return "相手の効果により、指定されたスピリットでブロックしなければなりません"
    const payNeed = blockPayCost(state, opponentOf(pid), costAttacker)
    if (payNeed > 0) {
        const payError = validatePaySources(state, pid, payNeed, paySources, paySoulCoreFromReserve)
        if (payError) return `ブロックするには${String(payNeed)}コスト必要です（${payError}）`
        // ブロックするスピリット自身から払って維持コアを割ると、宣言と同時に消滅してしまう
        const fromSelf = paySources?.find((s) => s.instanceId === instanceId)
        if (fromSelf && inst.cores - fromSelf.count < minLevelCores(getCard(inst.cardId))) {
            return "ブロックするスピリットの維持コアを支払いに使うことはできません"
        }
    } else if (paySources && paySources.length > 0) {
        return "このブロックにコストは要りません"
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
        const forcedDeclared = declared.filter((id) => !state.players[pid].field.spirits.some((sp) => sp.instanceId === id)).length
        if (available + forcedDeclared < required) {
            return `ブロックするにはスピリット${String(required)}体が必要です`
        }
    }
    return null
}


export function validatePass(state: GameState, pid: PlayerId): string | null {
    if (!state.battle || !state.isFlashTiming) return "フラッシュタイミングではありません"
    if (pid !== state.priorityPlayer) return "現在フラッシュの優先権がありません"
    return null
}

function mustAttackNow(state: GameState, pid: PlayerId, inst: CardInstance): boolean {
    if (!spiritCouldAttackNow(state, pid, inst)) return false
    const constraints = activeConstraints(state, pid, inst)
    return constraints.some((c) => c.type === "mustAttack") || mustAttackThisTurn(state, pid, inst)
}

// ターン終了の妥当性。「必ずアタック」制約（mustAttack）を持ち現在アタック可能な自分のスピリットが1体でもいれば拒否する（メイン・アタックステップ両方）
export function validateEndTurn(state: GameState, pid: PlayerId): string | null {
    if (state.turnPlayer !== pid) return "自分のターンではありません"
    if (state.phase !== "main" && state.phase !== "attack") {
        return "ターンを終了できるステップではありません"
    }
    if (state.battle) return "バトルの解決中です"
    // BS15-X04 の追加メインステップの後にアタックステップは無い
    if (state.extraMainStep) return null
    // 第2メインステップの後にもアタックステップは無いため、mustAttack はターン終了を妨げない
    if (state.secondMainStep) return null

    // 先攻1ターン目はアタック自体が禁止のため、mustAttack はターン終了を妨げない
    if (state.turn === 1) return null

    for (const inst of state.players[pid].field.spirits) {
        if (mustAttackNow(state, pid, inst)) return `${getCard(inst.cardId).name}は必ずアタックしなければなりません`
    }
    // メインからの終了でもアタックステップは来るので、phase だけ attack にした写しで宣言可否を見る
    const atAttack = { ...state, phase: "attack" as const }
    if (mustAttackOnceBlocksEnd(state, pid, (i, t) => validateAttack(atAttack, pid, i.instanceId, t) === null)) return "このターンは、可能ならば1回以上アタックしなければなりません"
    return null
}

// 強制ブロック（kind:"mustBlockGrant"）：アタッカーの持ち主のフィールドに、レベル有効・phase/turn一致・familyFilter一致
// （省略時は全アタッカー）の発生源があるか判定する。firstAttackOnly 指定時はそのターン最初のアタックのみ。
// マッチした発生源の blockerMaxBp を呼び出し側へ返す（未指定なら制限なし＝undefined）
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
            if (!entryActive(state, attackerPid, inst, effect, level)) continue
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
            noteCoverage(effect, "mustBlockGrant")
            return effect.blockerMaxBp === undefined
                ? { source: inst }
                : { blockerMaxBp: effect.blockerMaxBp, source: inst }
        }
    }
    return null
}

// 「可能ならば必ずブロックする」の判定用：実際にブロック宣言が通るスピリットが1体でもいるか。
// hasBlocker（回復状態か見るだけ）と違い validateBlock を実際に通すので、cantBlock や unblockableBy で
// ブロックできない場合に強制ブロックで詰まない。maxBp 指定時は実効BPがこれ以下の個体だけを候補にする
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
        // コストの支払いは任意なので、支払いが要るブロックは強制できない
        if (state.battle) {
            const atk = findSpirit(state.players[opponentOf(pid)], state.battle.attackerInstanceId)
            if (blockPayCost(state, opponentOf(pid), atk) > 0 || blockReserveToTrashCount(state, opponentOf(pid), atk) > 0 || blockExhaustSpiritRequired(state, opponentOf(pid), atk)) return false
        }
        if (forcedBy && blockForceResisted(state, pid, s, forcedBy)) return false
        return true
    })
}

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
    // ライフで受ける宣言もフラッシュタイミングの外でのみ可
    if (state.isFlashTiming) {
        return "フラッシュタイミング中はライフで受けられません"
    }
    const attacker = findSpirit(
        state.players[state.turnPlayer],
        state.battle.attackerInstanceId,
    )
    // 【激突】持ちのアタック時はブロック強制。判定は kind:"keyword" 宣言の levels を尊重する
    // （Lv2書きはLv1アタックでは強制しない。一時付与も spiritHasLabeledKeyword で拾う）。
    // hasBlocker（疲労とレベルしか見ない）だと cantBlock 等でブロックできない個体を数えて防御側が詰むため
    // hasLegalBlocker（validateBlock を実際に通る個体）で判定する（part65 §C）。強制ブロック（mustBlockGrant）と同じ「可能ならば」の解釈
    if (
        attacker &&
        spiritHasLabeledKeyword(state, state.turnPlayer, attacker, "clash") &&
        hasLegalBlocker(state, pid, undefined, { pid: state.turnPlayer, inst: attacker })
    ) {
        noteHeldKeyword(state, state.turnPlayer, attacker, "clash")
        return "【激突】によりブロックしなければなりません"
    }
    if (forcedBlockers(state, pid).length > 0) return "相手の効果により、指定されたスピリットでブロックしなければなりません"
    // 強制ブロック（mustBlockGrant）。ブロック宣言が実際に通るスピリットがいるときのみ強制する（「可能ならば」）
    const mustBlock = attacker && hasMustBlockAgainst(state, state.turnPlayer, attacker)
    if (
        mustBlock &&
        hasLegalBlocker(state, pid, mustBlock.blockerMaxBp, { pid: state.turnPlayer, inst: mustBlock.source })
    ) {
        return "相手の効果により、可能ならば必ずブロックしなければなりません"
    }
    return null
}
