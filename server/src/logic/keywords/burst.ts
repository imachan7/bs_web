// 【バースト】のセットと発動
import { requestActivationConfirm } from "../targeting"
import { resolveAction } from "../EffectModules"
import type { Color, EffectAction, EffectDef, FieldEvent, GameState, PendingChoice, PlayerId } from "../../type"
import { currentLevel, fieldInstanceIdsOf, getCard, log, opponentOf, suspend } from "../GameState"
import { burstConditionMet, fireFieldEventTriggers, notifyHandGained } from "../triggers"
import { effectActiveAtLevel, effectSources, timedContentsFor } from "../../../../shared/rules"
import { effectiveCost, magicEffectiveColors } from "../../../../shared/cost"

// バーストのセット共通処理（docs/design/BURST.md）。既にセット済みなら旧カードを先にトラッシュへ送る。
// 手札からの取り出し・ターン1回制限の消費は呼び出し側（GameEngine.doSetBurst / setBurstFromHandハンドラ）が行う
// （setBurstFromHandはターン1回制限を受けないため、ここでは触らない）
export function placeBurst(state: GameState, pid: PlayerId, cardId: string): void {
    const player = state.players[pid]
    if (player.burst !== null) {
        const oldName = getCard(player.burst).name
        player.trashCards.push(player.burst)
        // トラッシュは公開ゾーンなので、この時点でカード名を出しても非公開情報は漏れない
        log(state, `${player.name}は既にセットしていたバースト（${oldName}）をトラッシュに置いた。`)
    }
    player.burst = cardId
    player.burstSet = true
    // ⚠️ バーストは非公開ゾーンなので、セットした時点ではカード名をログに出さない（相手にも自分の
    // 画面にも同じログが配信されるため。GameState.viewFor は log を両者に同じ内容で配る）
    log(state, `${player.name}はバーストをセットした。`)
    fireFieldEventTriggers(state, pid, "ownBurstSet")
}

// バースト発動の後処理（docs/design/BURST.md）。summonBurstCardFree はアクション自身が場へ出すので
// バーストエリアを空にするだけ、それ以外（マジック相当）は解決後にトラッシュへ送る。
// 続けて thenPay（「その後コストを支払うことで、このカードのメイン/フラッシュ効果を発揮する」）を確認する。
// **resolveMagicは経由しない**（マジックバーストは「バースト発動」であって「マジックの使用」ではないため。
// state.magicUsedThisTurn / ownMagicUsed・opponentMagicUsedの誤発火を避ける）
export function finishBurstActivation(
    state: GameState,
    pid: PlayerId,
    cardId: string,
    actionType: EffectAction["type"],
    thenPay: "main" | "flash" | undefined,
    opts?: { toHand?: true }, // returnSelfToHandAfter（docs/design/BURST.md）：既定の行き先（トラッシュ）を上書きして手札へ戻す（BS14-X02）
): void {
    const player = state.players[pid]
    // sequence／if の中で召喚した場合は、summonBurstCardFree がバーストエリアを空にしているので下の分岐に入らない
    if (actionType !== "summonBurstCardFree") {
        if (player.burst === cardId) {
            player.burst = null
            player.burstSet = false
        }
        if (opts?.toHand) {
            player.hand.push(cardId)
            log(state, `${player.name}の${getCard(cardId).name}はバーストとして発動し、手札に戻った。`)
            notifyHandGained(state, pid, 1)
        } else {
            player.trashCards.push(cardId)
            log(state, `${player.name}の${getCard(cardId).name}はバーストとして発動し、トラッシュに置かれた。`)
        }
    } else if (player.burst === cardId) {
        // 通常はハンドラ自身（summonBurstCardFree）が空にしているはずだが、
        // 不発（コア不足等）だった場合に備えて念のため空にしておく
        player.burst = null
        player.burstSet = false
    }
    tryBurstThenPay(state, pid, cardId, thenPay)
}

function tryBurstThenPay(
    state: GameState,
    pid: PlayerId,
    cardId: string,
    thenPay: "main" | "flash" | undefined,
): void {
    if (thenPay === undefined) return
    if (state.winner) return
    const card = getCard(cardId)
    const entry = card.effects.find((e): e is Extract<EffectDef, { kind: "magic" }> => e.kind === "magic" && e.timing === thenPay)
    if (!entry) return
    const cost = effectiveCost(state, pid, card)
    const player = state.players[pid]
    // 「コストを支払えるときだけ発揮できる」＝COST_MODEL.md §1。払えないなら確認自体を出さずスキップ
    if (player.reserve < cost) return
    if (state.interactiveTargets) {
        requestActivationConfirm(
            state,
            pid,
            `${card.name}：コスト${cost}を支払って効果を発揮しますか？`,
            entry.action,
            null,
        )
        if (state.pendingChoice) state.pendingChoice.burstThenPay = { pid, cost, cardId }
        return
    }
    player.reserve -= cost
    log(state, `${player.name}は${card.name}のコスト${cost}を支払った。`)
    // 色は magicEffectiveColors を通す（BS15-015吸血令嬢エサルフリーダ Lv1-3。BS15_PLAN.md §7.3）
    resolveAction(state, pid, null, entry.action, undefined, magicEffectiveColors(state, pid, card), "magic", undefined, undefined, cardId)
}

// バーストの解決がすべて終わった後（ownBurstActivated）。**発動開始時点で場にいた発生源にだけ発火させる**
// （before＝発動開始時点のフィールドのinstanceId集合。summonBurstCardFreeで新しく場に出た個体には
// 発火しない。2026-09-11 ユーザー確認）
export function fireOwnBurstActivated(
    state: GameState,
    pid: PlayerId,
    before: Set<string>,
    cardId: string,
): void {
    if (state.winner) return
    const after = fieldInstanceIdsOf(state, pid)
    const excludeInstanceIds = [...after].filter((id) => !before.has(id))
    fireFieldEventTriggers(
        state,
        pid,
        "ownBurstActivated",
        undefined,
        undefined,
        undefined,
        undefined,
        { burstCost: getCard(cardId).cost },
        undefined,
        undefined,
        excludeInstanceIds,
    )
}

// 召喚時効果を解決しきった地点で呼ぶ（選択を挟んだときは handleAction の事後フック）。
// 実際に発揮していたら、召喚した側の相手に【相手の『召喚時』発揮後】を発火する（2026-09-27 ユーザー確認。BURST.md §10 C）
export function finishSummonEffect(state: GameState): void {
    const src = state.summonEffectSource
    if (src === undefined || state.pendingChoice) return
    delete state.summonEffectSource
    if (!src.resolved || state.winner) return
    fireFieldEventTriggers(state, opponentOf(src.pid), "opponentSummonEffectResolved", undefined, undefined, undefined, undefined, { costs: [src.cost] })
}

// kind:"burst" の走査本体（docs/design/BURST.md）。fireFieldEventTriggers の末尾から呼ぶほか、
// BS16バッチ0：破壊後バースト（event:"ownSpiritDestroyed"）はトラッシュ行き確定後に
// removal.ts の fireQueuedDestroyBursts が単独で呼ぶ（selfOverrideは{pid, cardId}の軽量版でよい。
// 破壊済みの個体はもうCardInstance実体が無いため）
export function fireBurstOnEvent(
    state: GameState,
    pid: PlayerId,
    event: FieldEvent,
    selfOverride: { pid: PlayerId; cardId?: string } | undefined,
    eventColors: Color[] | undefined,
    targetInstanceId: string | undefined,
    eventInfo?: {
        byOpponentEffect?: boolean
        destroyedBp?: number
        costs?: number[]
    },
): void {
    // 同時に条件を満たした場合は防御側（ターンプレイヤーでない側）の宣言を優先する＝走査順を固定するだけでよい
    // （2026-09-11 ユーザー確認）
    const order: PlayerId[] = [opponentOf(state.turnPlayer), state.turnPlayer]
    for (const holderPid of order) {
        // バースト条件は持ち主から見た事象（「自分のライフ減少後」の自分＝持ち主）。事象は当事者 pid 側で発火される（BURST.md §10 A・B）
        if (holderPid !== pid) continue
        const holder = state.players[holderPid]
        const burstCardId = holder.burst
        if (burstCardId === null) continue
        let effect = getCard(burstCardId).effects.find(
            (e): e is Extract<EffectDef, { kind: "burst" }> => e.kind === "burst" && e.event === event,
        )
        // BS15共通器：globalConstraint "burstAltEventFromOpponentSummon"（発生源=holder自身）が
        // 効いている間、event:"opponentSummonEffectResolved"のバーストは"ownLifeDamaged"でも拾う
        // （BS15-069太陰の宮廷Lv2）
        const hasBurstAltEvent = effectSources(state, holderPid).some((src) => {
            const srcLevel = currentLevel(src).level
            return getCard(src.cardId).effects.some(
                (e) =>
                    e.kind === "globalConstraint" &&
                    e.constraint.type === "burstAltEventFromOpponentSummon" &&
                    effectActiveAtLevel(e.levels, srcLevel),
            )
        })
        if (!effect && event === "ownLifeDamaged" && hasBurstAltEvent) {
            effect = getCard(burstCardId).effects.find(
                (e): e is Extract<EffectDef, { kind: "burst" }> => e.kind === "burst" && e.event === "opponentSummonEffectResolved",
            )
        }
        if (!effect) continue
        // 「このスピリットのバトル時、相手はバーストを発動できない」（BS15-X03鳥武帝スザクロス・ソウソー）
        if (timedContentsFor(state, holderPid).some((c) => c.type === "battleLock" && c.lock === "burst")) continue
        // subjectSide：fieldEvent の同名軸と同じ判定（own=バーストの持ち主自身の事象、opponent=その相手の事象）
        if (effect.subjectSide === "own" && selfOverride?.pid !== holderPid) continue
        if (effect.subjectSide === "opponent" && (selfOverride === undefined || selfOverride.pid === holderPid)) continue
        // byOpponentEffectOnly / destroyedColorFilter：fieldEvent の同名軸と同じ判定（event: "ownSpiritDestroyed" 限定）
        if (effect.byOpponentEffectOnly && !eventInfo?.byOpponentEffect) continue
        if (effect.destroyedColorFilter !== undefined && !(eventColors ?? []).includes(effect.destroyedColorFilter)) continue
        if (effect.destroyedMinBp !== undefined && (eventInfo?.destroyedBp ?? 0) < effect.destroyedMinBp) continue
        // condition：バーストの宣言自体はここまで来た時点で成立している。満たさないときはactionの解決だけを飛ばす
        // （「このスピリットカードを召喚する」等が空振りし、finishBurstActivationの既定どおりトラッシュへ置かれる）
        const actionToRun: EffectAction = burstConditionMet(state, holderPid, effect.condition) ? effect.action : { type: "noop" }
        // destroyedAsTarget：破壊された個体はもう場に無く、トラッシュには cardId でしか残らないので、
        // instanceId ではなく **cardId** を渡す（受け手は recoverMagicFromTrash の onlyBurstDestroyedCard）
        const destroyedCardId = effect.destroyedAsTarget ? selfOverride?.cardId : undefined
        // alsoDrawIfDestroyedColor（BS14-X02）：eventColorsはここでしか手に入らないため、宣言時点でbool化しておく
        const alsoDraw = effect.alsoDrawIfDestroyedColor !== undefined && (eventColors ?? []).includes(effect.alsoDrawIfDestroyedColor)
        // BS16バッチ0：破壊後バーストのコストが1つの値に決まらない（同時破壊で複数体・値違い）ときは、
        // 発動者が使う値を1つ選ぶ（対話：選択肢／非対話：最大値。1つだけ・全部同じならそのまま）
        const costs = eventInfo?.costs ?? []
        const distinctCosts = [...new Set(costs)]
        // event:"ownLifeDamaged"限定：ライフを減らしたスピリットのinstanceId（EffectCounter等が読む先はstate.burstEventLifeDamagerId）
        const lifeDamagerId = event === "ownLifeDamaged" ? (targetInstanceId ?? state.battle?.lifeDamagers?.at(-1)) : undefined
        // 発動は常に任意（バーストは宣言制。空打ち＝条件未達での宣言は不可なので、ここに来た時点で条件は満たしている）。
        // 実対戦では発動確認を出し、非対話（テスト）では従来どおり自動で発動する
        if (state.interactiveTargets) {
            if (distinctCosts.length > 1) {
                // コストの選択肢つき確認（「発動する」の代わりに「コストNで発動する」を並べる）
                suspend(state, {
                    pid: holderPid,
                    kind: "option",
                    prompt: `${getCard(burstCardId).name}のバーストを発動しますか？`,
                    candidates: [],
                    options: distinctCosts.map((c) => `コスト${c}で発動する`),
                    optional: true,
                    confirm: true,
                    action: actionToRun,
                    selfInstanceId: null,
                })
            } else {
                requestActivationConfirm(state, holderPid, `${getCard(burstCardId).name}のバーストを発動しますか？`, actionToRun, null)
            }
            // ⚠️ 対話モードでは、この1件を確認してから返る。同時に相手側も条件を満たしていた場合、
            // その宣言は今回は提示しない簡略化（1事象につき先着1件。docs/design/BURST.md）
            // 上の早期 return で pendingChoice は null に絞られているため、型注釈付きの局所変数で読み直す
            const pending = state.pendingChoice as PendingChoice | null
            if (pending) {
                pending.burstActivate = {
                    pid: holderPid,
                    cardId: burstCardId,
                    ...(effect.thenPay !== undefined ? { thenPay: effect.thenPay } : {}),
                    ...(destroyedCardId !== undefined ? { destroyedCardId } : {}),
                    ...(alsoDraw ? { alsoDraw: true as const } : {}),
                    ...(effect.returnSelfToHandAfter ? { toHand: true as const } : {}),
                    // BS15共通器：EffectCounter "burstEventCost" が読む値を確認の再入まで持ち回る
                    // （BS15-084爆砕轟神掌／BS15-X06鉄の覇王サイゴード・ゴレム）
                    ...(distinctCosts.length > 1
                        ? { burstEventCostOptions: distinctCosts }
                        : costs[0] !== undefined
                          ? { burstEventCost: costs[0] }
                          : {}),
                    ...(eventColors && eventColors.length > 0 ? { burstEventColors: eventColors } : {}),
                    ...(lifeDamagerId !== undefined ? { burstEventLifeDamagerId: lifeDamagerId } : {}),
                }
            }
            return
        }
        const before = fieldInstanceIdsOf(state, holderPid)
        // バースト効果を解決している間だけ目印を立てる（coreReturnBonus.ownBurstOnly。BS14-019）
        state.resolvingBurstPid = holderPid
        // BS15共通器：EffectCounter "burstEventCost" 用（BS15-084／BS15-X06）。非対話では最大値を使う
        if (distinctCosts.length > 0) state.burstEventCost = Math.max(...distinctCosts)
        else delete state.burstEventCost
        // BS16共通器：条件{burstDestroyedColor}用
        if (eventColors && eventColors.length > 0) state.burstEventColors = eventColors
        else delete state.burstEventColors
        if (lifeDamagerId !== undefined) state.burstEventLifeDamagerId = lifeDamagerId
        else delete state.burstEventLifeDamagerId
        // バーストのカードの色と種別を渡す（【装甲】などの効果耐性はバースト効果にも効く。【氷壁】は resolveMagic にしか無いので対象外のまま。BURST.md §7）。
        // 色は magicEffectiveColors を通す（紫のマジックのバースト効果にも015が効くように。BS15_PLAN.md §7.3）
        const burstCard = getCard(burstCardId)
        resolveAction(
            state,
            holderPid,
            null,
            actionToRun,
            destroyedCardId ?? targetInstanceId,
            magicEffectiveColors(state, holderPid, burstCard),
            burstCard.type,
            undefined,
            undefined,
            burstCardId,
        )
        delete state.resolvingBurstPid
        if (alsoDraw && !state.winner && !state.pendingChoice) resolveAction(state, holderPid, null, { type: "draw", count: 1 })
        finishBurstActivation(state, holderPid, burstCardId, actionToRun.type, effect.thenPay, effect.returnSelfToHandAfter ? { toHand: true } : undefined)
        if (state.pendingChoice) return
        fireOwnBurstActivated(state, holderPid, before, burstCardId)
    }
}
