// 破壊されたときの復活（「フィールドに残る」の確認）・【不死】・デッキ破棄からの無償召喚

import type { CardData, CardInstance, Color, PendingChoice, DestroyContext, EffectDef, GameState, Phase, PlayerId } from "../type"
import { createInstance, currentLevel, getCard, log, instMinLevelCores, minLevelCores, opponentOf, pushResumeFrames, suspend } from "./GameState"

// removal.ts・triggers.ts・EffectModules.ts とは相互 import（CommonJS の循環 require で安全。removal.ts 冒頭の注記）
import { notifyHandGained, revertDestroyGroupUsage } from "./triggers"
import { destroySpirit } from "./removal"
import { detachBravesOnLeave, detachBravesOnLeaveFree } from "./brave"

import {
    effectiveCost,
    ownFieldSymbolColors,
} from "../../../shared/cost"
import {
    canDiscardHand,
    hostsOf,
    effectActiveAtLevel,
    effectiveBp,
    effectSources,
    hasArmorAgainst,
    hasHeavyArmorAgainst,
    hasKeyword,
    instHasColor,
    instIsCombined,
    instIsVanilla,
    isVirtualSource,
    instMatchesCostFilter,
    matchesFamilyFilter,
    lifeDamagePerSpiritRemaining,
    ownFieldOnlyColor,
    timedPlayerRules,
} from "../../../shared/rules"

import {
    canExhaustNexus,
    exhaustSpirit,
    fireSummonSequence,
    resolveTensho,
    lifeCostBlockedByFloor,
    tryOwnLifeFloorByCost,
    recordPlayerRule,
} from "./EffectModules"

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

// 「破壊される代わりに復活**できる**」の確認を**その場で**出す（保留リストに積まない）。
// 破壊はこの時点では行わない（対象は場に残ったまま）。答えが返ったら
// applyReviveConfirm / declineReviveConfirm が決着させる。docs/design/RESUME_STACK.md §7
function suspendReviveConfirm(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    effectId: string,
    sourceInstanceId: string,
    context?: DestroyContext,
): void {
    suspend(state, {
        pid: ownerPid,
        kind: "option",
        prompt: `${getCard(inst.cardId).name}：破壊される代わりに復活させますか？`,
        candidates: [],
        options: ["復活させる"],
        optional: true,
        confirm: true,
        reviveConfirm: {
            pid: ownerPid,
            instanceId: inst.instanceId,
            effectId,
            sourceInstanceId,
            ...(context ? { context } : {}),
        },
        action: { type: "noop" },
        selfInstanceId: inst.instanceId,
    })
}

// この個体を今このコンテキストで破壊しようとしたとき、
// 「破壊される代わりに復活させますか？」の確認が出るか（**副作用なし**）。
// 同時破壊で解決順をターンプレイヤーに聞くかどうかの判定にだけ使う
export function wouldAskReviveConfirm(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
    context?: DestroyContext,
): boolean {
    const inst = state.players[ownerPid].field.spirits.find((s) => s.instanceId === instanceId)
    if (!inst) return false
    return tryReviveOnDestroy(state, ownerPid, inst, context, undefined, true, "confirm")
}

// この破壊で成立しうる「フィールドに残る／戻る」のエントリを集める（**副作用ありに変わった**：
// 同時破壊グループが有効な間は、他の発生源（sourceInstanceId 付き＝scope:"ownAll"）の枠を
// `${sourceInstanceId}:${effectId}` 単位で仮消費する。自身の reviveOnDestroy（scope:"self"）は対象外
// （公式Q&A Q22359。fix/destroyed-trigger-once）。断った場合は declineReviveConfirm が戻す
// 破壊で誘発した効果を1列に並べるとき、列の項目として出すために使う（docs/design/TIMING_CHART.md）
export function collectReviveEntries(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    context?: DestroyContext,
): { effectId: string; sourceName: string }[] {
    const found: { effectId: string; sourceName: string; sourceInstanceId?: string; perDestroyed?: true }[] = []
    tryReviveOnDestroy(state, ownerPid, inst, context, undefined, undefined, undefined, found)
    const group = state.destroyGroup
    const result: { effectId: string; sourceName: string }[] = []
    for (const entry of found) {
        if (group && entry.sourceInstanceId !== undefined && entry.perDestroyed !== true) {
            const key = `${entry.sourceInstanceId}:${entry.effectId}`
            if (group.used.includes(key)) continue
            group.used.push(key)
        }
        result.push({ effectId: entry.effectId, sourceName: entry.sourceName })
    }
    return result
}

// 集めておいた「フィールドに残る／戻る」エントリを1つだけ適用する（列から選ばれたときに呼ぶ）。
// optional（「〜できる」）なら従来どおり持ち主に確認を出す。断れば破壊はそのまま進み、
// 列に残っている項目も解決される（pendingDestruction が消えないため）
export function applyReviveEntry(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    effectId: string,
    context?: DestroyContext,
): boolean {
    return tryReviveOnDestroy(state, ownerPid, inst, context, { effectId }, true)
}

// ── 【不死】（BS09）──────────────────────────────────────────────────────
// トラッシュにある【不死】持ちのスピリットカードは、指定コストの自分のスピリットが破壊されたとき、
// **通常のコストを支払って**召喚できる（『お互いのアタックステップ』限定）。
// ⚠️ 同じ破壊に対する「フィールドに残る」と**同時発揮**で、ターンプレイヤーが決める解決順が
//    結果を変える（残るを先に解決すると破壊されなかったことになり、【不死】は発動できない）。
// docs/design/BS09_PLAN.md §3 ／ docs/design/TIMING_CHART.md §0-3

// この破壊で【不死】の確認が出るトラッシュのカード位置を列挙する（**副作用なし**）。
// 召喚コスト＋維持コアをリザーブから払えないものは、確認自体を出さないので除く
// 破壊された個体が【不死】の引き金として持つコストの一覧。
// 本来のコストに加えて「破壊されたとき、このコストとしても扱う」ぶんを足す（BS11-064 闇の聖剣Lv1）
export function destroyedCostsOf(inst: CardInstance): number[] {
    return [getCard(inst.cardId).cost, ...(inst.alsoCostsWhenDestroyed ?? [])]
}

// 破壊された個体が【不死：系統】の引き金として持つ系統の一覧（静的な系統。BS13-014 闇騎士アグラヴェイン）
export function destroyedFamiliesOf(inst: CardInstance): string[] {
    return getCard(inst.cardId).family
}

// 【不死】召喚で実際に払うコスト。このターン最初の1回だけ0になる制約があれば0
// （BS14-098ダークリボーン。維持コアはここに含まない＝通常どおり要る）
function fushiCostOf(state: GameState, ownerPid: PlayerId, card: CardData): number {
    if (timedPlayerRules(state, ownerPid).some((c) => c.type === "freeFushiSummonForPid")) return 0
    return effectiveCost(state, ownerPid, card)
}

// kind:"fushiFreeByExhaust"（BS15-064冥府へ続く魔門Lv2）：未疲労のこのネクサスがあれば、
// カード記載コストが effect.maxCost 以下の【不死】スピリットを、このネクサスを疲労させることで
// コストを支払わずに召喚できる（維持コアは通常どおり要る）。該当する発生源のinstanceIdを返す
// （複数あれば最初に見つかったものを使う。決定的簡略化）
function fushiFreeExhaustSource(state: GameState, ownerPid: PlayerId, card: CardData): string | null {
    const player = state.players[ownerPid]
    for (const nexus of player.field.nexuses) {
        if (nexus.isRested) continue
        const level = currentLevel(nexus).level
        const hit = getCard(nexus.cardId).effects.some(
            (e) => e.kind === "fushiFreeByExhaust" && effectActiveAtLevel(e.levels, level) && card.cost <= e.maxCost,
        )
        if (hit) return nexus.instanceId
    }
    return null
}

export function fushiCandidates(
    state: GameState,
    ownerPid: PlayerId,
    destroyedCosts: number[],
    destroyedFamilies: string[] = [],
): number[] {
    // 『お互いのアタックステップ』：アタックステップ以外では発揮しない
    if (state.phase !== "attack") return []
    const player = state.players[ownerPid]
    const found: number[] = []
    for (let i = 0; i < player.trashCards.length; i++) {
        const cardId = player.trashCards[i]
        if (cardId === undefined) continue
        const card = getCard(cardId)
        if (card.type !== "spirit") continue
        const hit = card.effects.some((e) => {
            if (e.kind !== "keyword" || e.keyword !== "fushi") return false
            if ((e.triggerCosts ?? []).some((c) => destroyedCosts.includes(c))) return true
            const triggerFamilies = e.triggerFamilies
            if (triggerFamilies === undefined) return false
            const families = Array.isArray(triggerFamilies) ? triggerFamilies : [triggerFamilies]
            return families.some((f) => destroyedFamilies.includes(f))
        })
        if (!hit) continue
        const maintain = minLevelCores(card)
        // 通常どおりコスト+維持コアを払えるか。払えなくても、未疲労のLv2魔門があり
        // コストがmaxCost以下なら、維持コアだけで無償召喚の候補になる（BS15-064）
        const canPayNormally = player.reserve >= fushiCostOf(state, ownerPid, card) + maintain
        const canPayFree = player.reserve >= maintain && fushiFreeExhaustSource(state, ownerPid, card) !== null
        if (!canPayNormally && !canPayFree) continue
        found.push(i)
    }
    return found
}

function suspendFushiSummon(state: GameState, ownerPid: PlayerId, trashIndex: number): void {
    const cardId = state.players[ownerPid].trashCards[trashIndex]
    if (cardId === undefined) return
    const card = getCard(cardId)
    const player = state.players[ownerPid]
    const maintain = minLevelCores(card)
    const canPayNormally = player.reserve >= fushiCostOf(state, ownerPid, card) + maintain
    const freeSource = fushiFreeExhaustSource(state, ownerPid, card)
    const canPayFree = freeSource !== null && player.reserve >= maintain
    // 払える側だけ選択肢に出す（COST_MODEL.md §1：払えない道は提示しない）。
    // 魔門（BS15-064 Lv2）で無償召喚できないときは、従来どおり「召喚する」1つだけの確認にする
    const options: string[] = []
    if (canPayFree) {
        if (canPayNormally) options.push("コストを支払って召喚する")
        options.push("魔門を疲労させて無償で召喚する")
    } else if (canPayNormally) {
        options.push("召喚する")
    }
    if (options.length === 0) return
    suspend(state, {
        pid: ownerPid,
        kind: "option",
        prompt: canPayFree
            ? `${card.name}：【不死】でトラッシュから召喚しますか？（通常のコスト${String(fushiCostOf(state, ownerPid, card))}）`
            : `${card.name}：【不死】でトラッシュからコスト${String(fushiCostOf(state, ownerPid, card))}を支払って召喚しますか？`,
        candidates: [],
        options,
        optional: true,
        confirm: true,
        fushiSummon: {
            pid: ownerPid,
            cardId,
            trashIndex,
            ...(canPayFree ? { freeNexusInstanceId: freeSource } : {}),
        },
        action: { type: "noop" },
        selfInstanceId: null,
    })
}

// 【不死】の確認で「召喚する」が選ばれたときの後処理。**コストはここで支払う**
// 【不死】1枚を解決する。実対戦では「召喚しますか？」の確認を出し、非対話では確認せず召喚する
// （既存の任意効果と同じ簡略化）。破壊で誘発した効果の列から呼ばれる
export function fushiSummonOrConfirm(state: GameState, ownerPid: PlayerId, trashIndex: number): void {
    if (state.interactiveTargets) {
        suspendFushiSummon(state, ownerPid, trashIndex)
        return
    }
    const cardId = state.players[ownerPid].trashCards[trashIndex]
    if (cardId === undefined) return
    const player = state.players[ownerPid]
    const card = getCard(cardId)
    const maintain = minLevelCores(card)
    // 非対話（AI・テスト）の既定：通常どおり払えるならそちらを優先する（召喚時効果も発揮できて得なため）。
    // 払えないときだけ、未疲労のLv2魔門があれば無償召喚を使う（BS15-064冥府へ続く魔門）
    const canPayNormally = player.reserve >= fushiCostOf(state, ownerPid, card) + maintain
    if (!canPayNormally) {
        const freeSource = fushiFreeExhaustSource(state, ownerPid, card)
        if (freeSource !== null && player.reserve >= maintain) {
            applyFushiSummon(state, { pid: ownerPid, cardId, trashIndex, freeNexusInstanceId: freeSource }, true)
            return
        }
    }
    applyFushiSummon(state, { pid: ownerPid, cardId, trashIndex })
}

export function applyFushiSummon(
    state: GameState,
    info: NonNullable<PendingChoice["fushiSummon"]>,
    // true指定時：info.freeNexusInstanceId のネクサスを疲労させ、コストを支払わずに召喚する
    // （維持コアは通常どおり要る）。召喚時効果は発揮されない（skipOnSummonと同じ印。BS15-064冥府へ続く魔門Lv2）
    useFree?: true,
): void {
    const player = state.players[info.pid]
    // 確認を出したあとにトラッシュが動いている可能性があるので、位置が食い違えばカードIDで取り直す
    const index =
        player.trashCards[info.trashIndex] === info.cardId
            ? info.trashIndex
            : player.trashCards.indexOf(info.cardId)
    if (index === -1) return
    const card = getCard(info.cardId)
    const maintain = minLevelCores(card)
    const freeNexus =
        useFree && info.freeNexusInstanceId !== undefined
            ? player.field.nexuses.find((n) => n.instanceId === info.freeNexusInstanceId && !n.isRested)
            : undefined
    if (useFree && !freeNexus) {
        log(state, `${player.name}は魔門を疲労させて【不死】を無償で召喚できなかった。`)
        return
    }
    const cost = freeNexus ? 0 : fushiCostOf(state, info.pid, card)
    if (player.reserve < cost + maintain) {
        log(state, `${player.name}は【不死】のコストを支払えず、${card.name}を召喚できなかった。`)
        return
    }
    player.trashCards.splice(index, 1)
    if (freeNexus) {
        exhaustSpirit(state, info.pid, freeNexus)
    } else {
        // コスト0になる制約は**このターン最初の1回だけ**なので、使ったらここで取り除く（BS14-098）
        const freeIndex = state.timedEffects.findIndex(
            (r) => r.target.kind === "player" && r.target.pid === info.pid && r.content.some((c) => c.type === "playerRule" && c.rule.type === "freeFushiSummonForPid"),
        )
        if (freeIndex !== -1) state.timedEffects.splice(freeIndex, 1)
        // 召喚コストはリザーブからトラッシュへ（通常の召喚と同じ）
        player.reserve -= cost
        player.trashCores += cost
    }
    // 維持コアはリザーブからスピリットの上へ（無償召喚でも通常どおり要る）
    player.reserve -= maintain
    const inst = createInstance(info.cardId, state.turn, maintain)
    player.field.spirits.push(inst)
    log(
        state,
        `${player.name}は【不死】で${card.name}をトラッシュから召喚した。` +
            (freeNexus ? `（${getCard(freeNexus.cardId).name}を疲労させ、コストを支払わずに）` : `（コスト${String(cost)}）`),
    )
    // 「召喚」なので【転召】は通常どおり解決する（無償召喚でも必ず行う。skipOnSummonと同じ規則）
    if (!state.winner) resolveTensho(state, info.pid, inst)
    if (state.winner) return
    // 無償召喚（魔門を疲労させた場合）は召喚時効果を発揮しない（BS15-064冥府へ続く魔門Lv2の明記どおり）
    if (freeNexus) {
        log(state, `${card.name}：『召喚時』効果は発揮されない。`)
        return
    }
    if (state.pendingChoice) {
        // 【転召】の途中で中断したら、召喚時効果以降は再開フレームに任せる（doSummon と同じ形）
        pushResumeFrames(state, [
            { kind: "action", selfInstanceId: inst.instanceId, action: { type: "summonSequence", byFushi: true } },
        ])
        return
    }
    // 【不死】も「召喚」なので、召喚時効果だけでなく「自分のスピリットが召喚されたとき」の
    // フィールド誘発も通常どおり起こす（byFushi=true。BS09-013ミミズクロ／BS09-071イモータルドロー）
    fireSummonSequence(state, info.pid, inst, true)
}

// 器AR：BS13-034ミノガメン「相手のデッキ破棄効果で破棄されたこのカードは、コストを支払わずに
// 召喚できる。さらに、このターンの間、自分のデッキは破棄されない」。「できる」＝任意なので確認を出す
// （非対話は自動で召喚する。fushiSummonと同じ形）。破棄されたその瞬間にしか呼ばれない
// （BS13_PLAN.md §1 #27＝トラッシュに残っていてもあとから召喚はできない）
export function spiritMillFreeSummonOrConfirm(state: GameState, ownerPid: PlayerId, trashIndex: number): void {
    const cardId = state.players[ownerPid].trashCards[trashIndex]
    if (cardId === undefined) return
    if (!state.interactiveTargets) {
        applySpiritMillFreeSummon(state, { pid: ownerPid, cardId, trashIndex })
        return
    }
    suspend(state, {
        pid: ownerPid,
        kind: "option",
        prompt: `${getCard(cardId).name}：コストを支払わずに召喚しますか？`,
        candidates: [],
        options: ["召喚する"],
        optional: true,
        confirm: true,
        spiritMillFreeSummon: { pid: ownerPid, cardId, trashIndex },
        action: { type: "noop" },
        selfInstanceId: null,
    })
}

export function declineSpiritMillFreeSummon(state: GameState, info: NonNullable<PendingChoice["spiritMillFreeSummon"]>): void {
    log(state, `${getCard(info.cardId).name}：召喚しなかった。`)
}

export function applySpiritMillFreeSummon(
    state: GameState,
    info: NonNullable<PendingChoice["spiritMillFreeSummon"]>,
): void {
    const player = state.players[info.pid]
    const index =
        player.trashCards[info.trashIndex] === info.cardId
            ? info.trashIndex
            : player.trashCards.indexOf(info.cardId)
    if (index === -1) return
    const card = getCard(info.cardId)
    player.trashCards.splice(index, 1)
    const inst = createInstance(info.cardId, state.turn, minLevelCores(card))
    player.field.spirits.push(inst)
    log(state, `${player.name}は${card.name}をコストを支払わずに召喚した。`)
    // 「さらに、このターンの間、自分のデッキは破棄されない」＝**この召喚が成立したときだけ**付く（§1 #27）
    recordPlayerRule(state, info.pid, { type: "noDeckMillByOpponentForPid" })
    log(state, `${player.name}：このターンの間、デッキは相手の効果で破棄されない。`)
    if (!state.winner) resolveTensho(state, info.pid, inst)
    if (state.winner) return
    if (state.pendingChoice) {
        pushResumeFrames(state, [
            { kind: "action", selfInstanceId: inst.instanceId, action: { type: "summonSequence" } },
        ])
        return
    }
    fireSummonSequence(state, info.pid, inst)
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
    if (!tryReviveOnDestroy(state, entry.pid, inst, entry.context, { effectId: entry.effectId, skipConfirm: true })) {
        declineReviveConfirm(state, entry)
        return
    }
    // 復活が成立した＝破壊されていない（場に残る／手札へ戻るのどちらでも）
    state.lastReviveDestroyed = false
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
    // 同時破壊グループの仮消費を戻す（このsourceInstanceIdはscope:"self"のときは元々マークしていないので
    // 何もしない。次に破壊される1体でまたこの発生源の枠を提示できるようにする。fix/destroyed-trigger-once）
    revertDestroyGroupUsage(state, entry.sourceInstanceId, entry.effectId)
    // 破壊バッチが中断から再開したときに「破壊できた数」へ算入できるよう結果を残す
    state.lastReviveDestroyed = destroySpirit(
        state,
        entry.pid,
        entry.instanceId,
        "destroy",
        entry.context,
        { skipRevive: true },
    )
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
    // skipConfirm 指定時は optional の確認をスキップして即適用する（applyReviveConfirm＝
    // 既に持ち主が「はい」と答えたあとの経路。指定しなければ optional は従来どおり確認を出す）
    forced?: { effectId: string; skipConfirm?: true },
    // true なら「破壊される代わりに復活できる」の確認を**その場で**出す（保留リストに積まない）。
    // ①の破壊（destroySpirits のバッチ経由）だけが立てる。②は渡さず保留へ（destroySpirit の注記）
    allowSuspend?: boolean,
    // **判定だけ**して結果を返す下見モード（確認も復活も実行しない）。
    //   "confirm" ＝「復活しますか？」の確認が出るか（＝任意の復活があるか）
    //   "any"     ＝任意・強制を問わず、そもそも復活が成立しうるか（【不死】との解決順の判定に使う）
    // ⚠️ "any" はコストが払えるかまでは見ない近似（副作用なしで確かめられないため）
    probe?: "confirm" | "any",
    // 指定時は**適用せず、条件を満たすエントリを集めるだけ**（破壊で誘発した効果を1列に並べるとき、
    // 「フィールドに残る／戻る」を列の項目として出すために使う。docs/design/TIMING_CHART.md）。
    // sourceInstanceId／perDestroyed は scope:"ownAll"（他の発生源）のときだけ載る
    // （collectReviveEntries が同時破壊グループの重複判定に使う。scope:"self" は対象外＝常に載らない）
    collect?: { effectId: string; sourceName: string; sourceInstanceId?: string; perDestroyed?: true }[],
): boolean {
    const player = state.players[ownerPid]
    const level = currentLevel(inst).level

    const matchesWhen = (when: {
        byOpponentEffect?: boolean
        byOpponent?: boolean
        byBattleVsArmorColor?: boolean
        byBattleVsHeavyArmorColor?: boolean
        byBattle?: boolean
        byBattleKillerLevel?: number
        byBattleKillerMaxBp?: number
    }): boolean => {
        if (when.byOpponentEffect) {
            if (context?.sourcePid === undefined || context.sourcePid === ownerPid) return false
        }
        // 「相手によって破壊されたとき」＝相手の効果 **または** バトルのBP比較（BS12-X05）。
        // 自分の効果で自分を破壊した場合は含まない
        if (when.byOpponent) {
            const byOppEffect = context?.sourcePid !== undefined && context.sourcePid !== ownerPid
            if (!byOppEffect && context?.battle === undefined) return false
        }
        if (when.byBattleVsArmorColor) {
            const attackerColors = context?.battle?.attackerColors
            if (attackerColors === undefined || !hasArmorAgainst(state, inst, attackerColors)) return false
        }
        // 器AI：byBattleVsArmorColorの【重装甲】版（BS13-067光導く巨塔）
        if (when.byBattleVsHeavyArmorColor) {
            const attackerColors = context?.battle?.attackerColors
            if (attackerColors === undefined || !hasHeavyArmorAgainst(inst, attackerColors)) return false
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

    const matchesPhaseTurn = (phaseTurn?: { phase?: Phase; turn: "own" | "opponent" | "both" }): boolean => {
        if (!phaseTurn) return true
        // phase 省略＝ステップ不問（turn 条件だけ見る）
        if (phaseTurn.phase !== undefined && state.phase !== phaseTurn.phase) return false
        if (phaseTurn.turn === "own" && ownerPid !== state.turnPlayer) return false
        if (phaseTurn.turn === "opponent" && ownerPid === state.turnPlayer) return false
        return true
    }

    const applyCost = (
        effect: Extract<EffectDef, { kind: "reviveOnDestroy" }>,
        source?: CardInstance,
    ): boolean => {
        // 発生源自身のコアを払う（BS11-066 発見されし世界樹Lv2＝このネクサス上のコア3個）
        if (effect.cost?.sourceCoresToTrash !== undefined) {
            const need = effect.cost.sourceCoresToTrash
            if (!source || source.cores < need) return false
            source.cores -= need
            player.trashCores += need
            return true
        }
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
        if (effect.cost?.oneCoreToTrash) {
            // BS09-063花の宮殿：対象のコア1個を持ち主のトラッシュへ。**コア1個でも支払う**ので、
            // 支払った結果0個になった個体は待機解除の後に維持コア割れで消滅する（2026-08-14 ユーザー確認）
            if (inst.cores <= 0) return false
            inst.cores -= 1
            player.trashCores += 1
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
            // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない（コストとしての破棄も止まる。COST_MODEL.md §1）
            if (!canDiscardHand(state, ownerPid)) return false
            const cardType = effect.cost.handDiscardCardType
            if (cardType !== undefined) {
                // BS10-046龍仙公主：手札の末尾から指定種別のカードを探して破棄する。
                // 該当が無ければ支払い不可＝不発（指定なしの既存挙動＝末尾1枚は変えない）
                let index = -1
                for (let i = player.hand.length - 1; i >= 0; i--) {
                    if (getCard(player.hand[i]!).type === cardType) {
                        index = i
                        break
                    }
                }
                if (index === -1) return false
                const cardId = player.hand.splice(index, 1)[0]!
                player.trashCards.push(cardId)
                return true
            }
            // 持ち主の手札1枚（末尾＝決定的簡略化）をトラッシュへ。手札0枚なら支払い不可＝不発（BS06暴かれた墓石Lv2）
            if (player.hand.length === 0) return false
            const cardId = player.hand.pop()!
            player.trashCards.push(cardId)
            return true
        }
        if (effect.cost?.millSelfOneMatching) {
            // BS07冥勇士デスカラビア：自分のデッキを上から1枚破棄し、そのカードが
            // 指定の色・種別（紫のスピリットカード）だったときだけ成立する
            const { color, cardType, thenHandIfNameIncludes } = effect.cost.millSelfOneMatching
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
            // BS15共通器：thenHandIfNameIncludes（BS15-043ショーグンペンタン）。成立の可否と独立に、
            // カード名が一致すればトラッシュから手札へ移す（CONJUNCTION.md「さらに」）
            if (thenHandIfNameIncludes !== undefined && milled.name.includes(thenHandIfNameIncludes)) {
                const idx = player.trashCards.lastIndexOf(cardId)
                if (idx !== -1) {
                    player.trashCards.splice(idx, 1)
                    player.hand.push(cardId)
                    notifyHandGained(state, ownerPid, 1)
                    log(state, `${player.name}は${milled.name}を手札に加えた。`)
                }
            }
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
            // ライフ0なら支払い不可＝不発。支払った結果ライフが0になった場合はそのまま勝敗が決まる。
            // ただし「ライフは0にならない」が働いている間は払って0にできない＝支払い不可（2026-09-16 ユーザー確定）
            if (player.life <= 0) return false
            if (lifeCostBlockedByFloor(state, ownerPid)) return false
            player.life -= 1
            log(state, `${player.name}はライフのコア1個をボイドに置いた。（残りライフ${player.life}）`)
            if (player.life <= 0 && !state.winner) {
                state.winner = opponentOf(ownerPid)
                log(state, `${state.players[opponentOf(ownerPid)].name}の勝利！`)
            }
            return true
        }
        // 器AR：BS13-036星鳥クージャ「自分のライフのコア1個を自分のリザーブに置くことで」
        if (effect.cost?.ownLifeOneToReserve) {
            if (player.life <= 0) return false
            if (lifeCostBlockedByFloor(state, ownerPid)) return false
            player.life -= 1
            player.reserve += 1
            log(state, `${player.name}はライフのコア1個を自分のリザーブに置いた。（残りライフ${player.life}）`)
            if (player.life <= 0 && !state.winner) {
                state.winner = opponentOf(ownerPid)
                log(state, `${state.players[opponentOf(ownerPid)].name}の勝利！`)
            }
            return true
        }
        // 器AR：BS13-040金星神龍ヴィーナ・フェーザー「自分のデッキを上から3枚破棄することで」。
        // millSelfOneMatchingと違い一致判定は無く、あるだけ破棄すれば成立する（デッキが空でも0枚破棄で成立）
        if (effect.cost?.millSelfCount !== undefined) {
            const n = Math.min(effect.cost.millSelfCount, player.deck.length)
            for (let i = 0; i < n; i++) {
                const cardId = player.deck.shift()!
                player.trashCards.push(cardId)
            }
            log(state, `${player.name}はデッキを上から${n}枚破棄した。`)
            return true
        }
        // 器AR：BS13-X05麒麟星獣リーン「このスピリットと同じ系統を持つ自分のスピリット1体を疲労させることで」
        if (effect.cost?.exhaustOwnSameFamilyOne) {
            const family = getCard(inst.cardId).family
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
        // 器BW：BS14-X02呪の覇王カオティック・セイメイLv3【呪滅撃】「相手のライフのコア1個を相手のトラッシュに置くことで」。
        // 支払うのは**相手**のライフ（ownLifeOneToVoid等の自分版とは別軸）。相手のライフが0なら支払い不可＝不発。
        // 支払った結果相手のライフが0になれば、そのまま持ち主の勝利が決まる
        if (effect.cost?.opponentLifeOneToTrash) {
            const oppPid = opponentOf(ownerPid)
            const oppPlayer = state.players[oppPid]
            if (oppPlayer.life <= 0) return false
            // 神将「お互いのライフは、ターンごとにスピリット1体からmaxまでしか減らされない」（BS15共通器）。
            // このスピリット（inst）による今ターンぶんの許容がすでに0なら、コストとして払えない
            if (lifeDamagePerSpiritRemaining(state, inst) <= 0) return false
            oppPlayer.life -= 1
            oppPlayer.trashCores += 1
            inst.lifeDealtThisTurn = (inst.lifeDealtThisTurn ?? 0) + 1
            log(state, `${oppPlayer.name}はライフのコア1個をトラッシュに置いた。（残りライフ${oppPlayer.life}）`)
            if (oppPlayer.life <= 0 && !state.winner) {
                // BS14-084永久凍土の王都：**相手の効果で**ライフが0になる瞬間も守る
                // （効果文「自分のライフが0になるとき」は原因を限定していない。2026-09-13 ユーザー判断）。
                // コスト自体は支払われた（ライフは実際に0まで減った）うえで、王都が0を回避する
                if (!tryOwnLifeFloorByCost(state, oppPid)) {
                    state.winner = ownerPid
                    log(state, `${player.name}の勝利！`)
                }
            }
            return true
        }
        // BS14-X05神獣鳥アン・ズール：「自分のバースト1つを破棄することで」。
        // バーストがセットされていなければ支払い不可＝不発
        if (effect.cost?.discardOwnBurst) {
            if (player.burst === null) return false
            player.trashCards.push(player.burst)
            player.burst = null
            player.burstSet = false
            log(state, `${player.name}は${getCard(inst.cardId).name}のコストとして自分のバーストを破棄した。`)
            return true
        }
        // BS14-064レボルシング・ゼヨンLv2：「自分のネクサス1つを疲労させることで」。
        // 相手のconstraintで疲労させられない間は支払い不可＝不発（canExhaustNexus）
        if (effect.cost?.exhaustOwnNexusOne) {
            if (!canExhaustNexus(state, ownerPid)) return false
            const candidates = player.field.nexuses.filter((n) => !n.isRested)
            if (candidates.length === 0) return false
            const chosen = candidates.reduce((min, n) => (n.cores < min.cores ? n : min))
            chosen.isRested = true
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
    const applyRevived = (revived: { rested: boolean } | { toHand: true; braveStay?: "rested" | "refreshed" } | { toBurst: true }): void => {
        // 復活が成立した＝**破壊待機状態が解除された**（TIMING_CHART.md §1.5）。
        // 印を消さないと、以後この個体は「疲労も回復もできず、破壊もされない」ままになる
        delete inst.pendingDestruction
        if ("toBurst" in revived) {
            // BS15-004ハンゾウ・シノビ・ドラゴン：トラッシュへ置かれる代わりに持ち主のバーストエリアへ
            // （placeBurstと同じ規則：既にセットしていたバーストはトラッシュへ押し出される。
            // EffectModulesからのimportは循環参照になるためここでは直接書く）
            const idx = player.field.spirits.findIndex((s) => s.instanceId === inst.instanceId)
            if (idx !== -1) player.field.spirits.splice(idx, 1)
            player.reserve += inst.cores
            detachBravesOnLeave(state, ownerPid, inst)
            if (player.burst !== null) {
                player.trashCards.push(player.burst)
            }
            player.burst = inst.cardId
            player.burstSet = true
        } else if ("toHand" in revived) {
            const idx = player.field.spirits.findIndex((s) => s.instanceId === inst.instanceId)
            if (idx !== -1) player.field.spirits.splice(idx, 1)
            player.reserve += inst.cores
            player.hand.push(inst.cardId)
            notifyHandGained(state, ownerPid, 1)
            // 器AT：braveStay指定時は、通常の「残す」確認（コア支払い）を経ずに無償・強制で残す
            if (revived.braveStay !== undefined) {
                detachBravesOnLeaveFree(state, ownerPid, inst, revived.braveStay === "rested")
            } else {
                detachBravesOnLeave(state, ownerPid, inst) // 合体していたブレイヴを外す（§6.1.1。コアを移した後。§6.3.1）
            }
        } else {
            inst.isRested = revived.rested
            // 支払いでコアが維持コアを下回った場合は、待機解除の直後に消滅する
            // （cause:"deplete" は復活判定に入らないので再帰しない。BS09-063花の宮殿＝コア1個の個体）
            if (inst.cores < instMinLevelCores(inst)) {
                destroySpirit(state, ownerPid, inst.instanceId, "deplete")
            }
        }
    }

    const revivedLabel = (revived: { rested: boolean } | { toHand: true; braveStay?: "rested" | "refreshed" } | { toBurst: true }): string =>
        "toBurst" in revived ? "バーストとしてセットされた" : "toHand" in revived ? "手札に戻った" : `${revived.rested ? "疲労" : "回復"}状態で自分のフィールドに戻った`

    // 持ち主のフィールド（スピリット）に指定カード名を持つ個体が1体以上いるか
    // （BS05プリンセス・スノーホワイト：自分のフィールドに[ドワッフー・セブン]がいるとき）
    const matchesRequireOwnFieldHasName = (name?: string): boolean => {
        if (name === undefined) return true
        return player.field.spirits.some((s) => getCard(s.cardId).name === name)
    }

    // 発生源の持ち主から見た相手フィールドのシンボル色数（重複除く）がこの値以下か
    // （BS06夢中漂う桃幻郷Lv2：相手フィールドにシンボルが1色しかない間）
    const matchesReviveCondition = (
        condition?: { opponentFieldSymbolColorsAtMost: number } | { ownBurstSet: boolean } | { ownFieldOnlyColor: Color; spiritsOnly?: true },
    ): boolean => {
        if (!condition) return true
        if ("ownBurstSet" in condition) return (player.burst !== null) === condition.ownBurstSet
        if ("ownFieldOnlyColor" in condition) return ownFieldOnlyColor(state, ownerPid, condition.ownFieldOnlyColor, condition.spiritsOnly)
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
        // allowSuspend（destroySpirits のバッチ経由）なら**その場で**確認を出す。
        // それ以外の呼び出し元はまだ中断を受け止められないので、従来どおり保留へ積む
        // （移行の途中。残りの呼び出し元は docs/design/RESUME_STACK.md §7）
        // collect：条件を満たしたのでここで拾う。適用はせず、次のエントリも見に行く（false を返す）
        if (collect) {
            collect.push({ effectId: effect.id, sourceName })
            return false
        }
        if (effect.optional && state.interactiveTargets && !forced?.skipConfirm) {
            if (probe) return true // 下見：ここで確認が出る
            if (allowSuspend) {
                suspendReviveConfirm(state, ownerPid, inst, effect.id, inst.instanceId, context)
            } else {
                queueReviveConfirm(state, ownerPid, inst, effect.id, inst.instanceId, context)
            }
            return true
        }
        // 任意でない復活（＝確認を出さずに確定する）。"any" は復活しうるので true、
        // "confirm" は確認が出ないので次のエントリを見に行く
        if (probe) return probe === "any"
        if (!applyCost(effect, inst)) return false
        markOncePerTurn(effect, inst)
        const name = getCard(inst.cardId).name
        // BS15-030愛の女神ロヴンLv2：復活成立とセットで、場を離れる前にボイドからコアをリザーブへ置く
        if (effect.alsoVoidCoreToReserve) {
            player.reserve += effect.alsoVoidCoreToReserve
            log(state, `${sourceName}：ボイドからコア${effect.alsoVoidCoreToReserve}個を${player.name}のリザーブに置いた。`)
        }
        // BS07ブラックリチュアル：「破壊時効果を発揮した自分のスピリットは手札に戻る」。
        // 既定では復活が成立すると破壊時効果は発揮されないので、場に留める（手札へ戻す）前に先に発揮させる
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

    // 合体中ブレイヴの scope:"self" + whileCombined 由来（BS12-052デス・ヘイズ：
    // 合体しているホスト＝instが破壊されるとき、ブレイヴ自身が持つ「このスピリットは戻る」を代わりに適用する）。
    // effectSources() は合体中ブレイヴも含むが、あちらは scope:"ownAll"（複数対象への一般則）用の走査。
    // scope:"self" はカードの持ち主＝ブレイヴ自身を指すため、ホストと一致するかをここで別途見る。
    // レベルはブレイヴ自身のレベルで判定し（ホストのlevelではない）、tryEffectの内部再判定はlevels:nullで無効化する
    for (const brave of state.players[ownerPid].field.combinedBraves) {
        if (!hostsOf(state.players[ownerPid], brave).some((h) => h.instanceId === inst.instanceId)) continue
        const braveLevel = currentLevel(brave).level
        for (const effect of getCard(brave.cardId).effects) {
            if (effect.kind !== "reviveOnDestroy") continue
            if (effect.scope !== "self" || effect.whileCombined !== true) continue
            if (!effectActiveAtLevel(effect.levels, braveLevel)) continue
            if (tryEffect({ ...effect, levels: null }, getCard(brave.cardId).name)) return true
        }
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
            if (effect.lentOnly && !isVirtualSource(source)) continue
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
            // BS12-068光の聖剣Lv2：合体スピリットのみ対象
            if (effect.combinedOnly && !instIsCombined(inst)) continue
            // 強者統べる大地：実効BPが閾値以上のスピリットのみ対象（破壊直前のBPで判定する）
            if (effect.minBp !== undefined && effectiveBp(state, ownerPid, inst) < effect.minBp) continue
            // BS14-109アルターミラージュ：コストが閾値以上のスピリットのみ対象（instMatchesCostFilterで判定＝付与コストも見る）
            if (effect.minCost !== undefined && !instMatchesCostFilter(inst, { min: effect.minCost })) continue
            if (!matchesReviveCondition(effect.condition)) continue
            if (!matchesWhen(effect.when)) continue
            if (!matchesPhaseTurn(effect.phaseTurn)) continue
            if (oncePerTurnBlocked(effect, source)) continue
            // collect：条件を満たしたのでここで拾う。適用はせず、次の発生源も見に行く
            if (collect) {
                collect.push({
                    effectId: effect.id,
                    sourceName: getCard(source.cardId).name,
                    sourceInstanceId: source.instanceId,
                    ...(effect.perDestroyed ? { perDestroyed: true as const } : {}),
                })
                continue
            }
            // optional は self 由来と同じ扱い（発生源は source 側＝oncePerTurn の記録先）。
            // allowSuspend が渡っていれば**その場で**確認を出す（渡っていなければ従来どおり保留へ）
            if (effect.optional && state.interactiveTargets && !forced?.skipConfirm) {
                if (probe) return true // 下見：ここで確認が出る
                if (allowSuspend) {
                    suspendReviveConfirm(state, ownerPid, inst, effect.id, source.instanceId, context)
                } else {
                    queueReviveConfirm(state, ownerPid, inst, effect.id, source.instanceId, context)
                }
                return true
            }
            // 任意でない復活。"any" は復活しうるので true、"confirm" は次の発生源を見に行く
            if (probe === "any") return true
            if (probe) continue
            if (!applyCost(effect, source)) continue
            markOncePerTurn(effect, source)
            const name = getCard(inst.cardId).name
            if (effect.alsoVoidCoreToReserve) {
                player.reserve += effect.alsoVoidCoreToReserve
                log(state, `${getCard(source.cardId).name}：ボイドからコア${effect.alsoVoidCoreToReserve}個を${player.name}のリザーブに置いた。`)
            }
            // BS07ブラックリチュアル：場に留める（手札へ戻す）前に破壊時効果を先に発揮させる
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
