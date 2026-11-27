// 【バースト】のセットと発動
import { handGainDenial } from "../handGate"
import { noteCoverage } from "../../../../shared/coverage"
import { battlers } from "../../../../shared/rules/level"
import { requestActivationConfirm } from "../targeting"
import { markPayConfirmed, unpayableLine } from "../actions/pay"
import { negateBurstActivation } from "../burstNegate"
import { burstActivationFee, burstFeeUnpayable, payBurstActivationFee } from "../burstActivationFee"
import { withEffectTax } from "../effectTax"
import { canPayMagicCost, payMagicCostThenResolve } from "../magic/payThenResolve"
import { announceBurstMagicEffect } from "./burstMagicEffect"
import { emitEvent, hasBurstMagicFreeEffect, resolveAction } from "../EffectModules"
import { anyWaiting } from "../../../../shared/rules/waiting"
import type { CardInstance, Color, DeclaredBurst, EffectAction, EffectDef, EventBurstCheck, FieldEvent, GameState, PendingChoice, PlayerId, ResumeFrame } from "../../type"
import { currentLevel, fieldInstanceIdsOf, getCard, log, opponentOf, pushResumeFrames, suspend } from "../GameState"
import { fireFieldEventTriggers, notifyHandGained } from "../fieldEventTriggers"
import { onlyUsableDenial, burstActivationForbidden, effectActiveAtLevel, effectSources, timedContentsFor, timedPlayerRules } from "../../../../shared/rules"
import { effectiveCost, magicEffectiveColors } from "../../../../shared/cost"

import { instHasColor, matchesFamilyFilter, spiritHasKeyword } from "../../../../shared/rules"

// burstMagicFreeEffect（BS16-070）の選択肢ラベル。actions/control.tsのburstMagicFreeOrThenPayHandlerと
// 一致させること（circular import回避のためここでは定数を共有せず複製）
export const BURST_MAGIC_FREE_MAIN_LABEL = "コストを支払わずにメイン効果を発揮する"
export const BURST_MAGIC_FREE_FLASH_LABEL = "コストを支払わずにフラッシュ効果を発揮する"

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
    delete player.burstRevealedCardId
    // ⚠️ バーストは非公開ゾーンなので、セットした時点ではカード名をログに出さない（相手にも自分の
    // 画面にも同じログが配信されるため。GameState.viewFor は log を両者に同じ内容で配る）
    log(state, `${player.name}はバーストをセットした。`)
    fireFieldEventTriggers(state, pid, "ownBurstSet")
    fireFieldEventTriggers(state, opponentOf(pid), "opponentBurstSet")
}

// 発動した時点でバーストは公開される。効果の解決（対象選択を含む）より前に相手へ見せる
export function announceBurstActivation(state: GameState, pid: PlayerId, cardId: string): void {
    const name = getCard(cardId).name
    const logAt = state.log.length
    log(state, `${state.players[pid].name}はバースト（${name}）を発動した。`)
    state.players[pid].burstRevealedCardId = cardId
    emitEvent(state, { type: "burst", pid, cardName: name, cardId, logAt })
}

// バースト効果の解決から後を進める：thenPay（その後コストを支払うことで〜）→ カードをトラッシュへ → 「自分のバースト発動後」。
// 発動したバーストは、効果を発揮し終わるまでバーストエリアに残り「セット状態」として扱う（2026-09-28 ユーザー確認。
// 爆烈十紋刃のメイン効果が、発揮中の自分自身をトラッシュから手札に戻せてしまっていた）。
// どの段で選択待ちになっても、残りは再開スタックに積む。積まないと、選択の解決後に後始末をする処理が無く、
// カードがバーストエリアに残ったままになる（2026-09-28 発覚）
type BurstFinishFrame = Extract<ResumeFrame, { kind: "burstFinish" }>
export function continueBurstActivation(state: GameState, frame: BurstFinishFrame): void {
    if (state.winner) return
    if (state.pendingChoice) {
        pushResumeFrames(state, [frame])
        return
    }
    if (frame.stage === "finish") {
        if (frame.alsoDraw) resolveAction(state, frame.pid, null, { type: "draw", count: 1 })
        // 税を断った・払えなかったバーストは効果全体が発揮できないので、その後の thenPay も出さない
        const taxUnpaid = (state.burstTaxUnpaid ?? 0) > 0
        delete state.burstTaxUnpaid
        if (!taxUnpaid) tryBurstThenPay(state, frame.pid, frame.cardId, frame.thenPay, frame.handUse)
        if (state.winner) return
        if (state.pendingChoice) {
            pushResumeFrames(state, [{ ...frame, stage: "settle" }])
            return
        }
    }
    // handUse（手札からの発揮）はバーストエリアを経由せず、発動でもないので後始末と「バースト発動後」の誘発を飛ばす
    if (frame.handUse) return
    if (frame.stage !== "notify") {
        finishBurstActivation(state, frame.pid, frame.cardId, frame.actionType, frame.toHand ? { toHand: true } : undefined)
    }
    fireOwnBurstActivated(state, frame.pid, new Set(frame.before), frame.cardId)
}

// 発揮し終えたバーストの行き先（docs/design/BURST.md）。summon{from:"burst"} はアクション自身が場へ出すので
// バーストエリアを空にするだけ、それ以外（マジック相当）はトラッシュへ送る。
// **resolveMagicは経由しない**（マジックバーストは「バースト発動」であって「マジックの使用」ではないため。
// state.magicUsedThisTurn / ownMagicUsed・opponentMagicUsedの誤発火を避ける）
export function finishBurstActivation(
    state: GameState,
    pid: PlayerId,
    cardId: string,
    actionType: EffectAction["type"],
    opts?: { toHand?: true }, // returnSelfToHandAfter（docs/design/BURST.md）：既定の行き先（トラッシュ）を上書きして手札へ戻す（BS14-X02）
): void {
    const player = state.players[pid]
    // 召喚が成功していれば summon{from:"burst"} がバーストエリアを空にしているので、エリアに残っているときだけ行き先へ送る
    // （sequence／if／pay の中で召喚した場合に場とトラッシュへ二重に現れていた）。召喚の条件を満たさない・コア不足で不発のときも
    // エリアに残るので、召喚せずトラッシュへ置かれる（2026-10-22 ユーザー確認。BURST.md §5.5）
    if (player.burst === cardId) {
        player.burst = null
        player.burstSet = false
        if (opts?.toHand && !handGainDenial(state, { pid: pid, from: "other", cause: "effect" })) {
            player.hand.push(cardId)
            log(state, `${player.name}の${getCard(cardId).name}はバーストとして発動し、手札に戻った。`)
            notifyHandGained(state, pid, 1)
        } else {
            player.trashCards.push(cardId)
            log(state, `${player.name}の${getCard(cardId).name}はバーストとして発動し、トラッシュに置かれた。`)
        }
    }
}

function tryBurstThenPay(
    state: GameState,
    pid: PlayerId,
    cardId: string,
    thenPay: "main" | "flash" | undefined,
    handUse?: true,
): void {
    if (state.winner) return
    const card = getCard(cardId)
    // burstMagicFreeEffect持ちがいれば、こちらの分岐（無償選択肢つき）に委ねる（BS16-070）
    if (card.type === "magic" && !handUse && hasBurstMagicFreeEffect(state, pid)) {
        tryBurstMagicFreeOrThenPay(state, pid, cardId, thenPay)
        return
    }
    if (thenPay === undefined) return
    const entry = card.effects.find((e): e is Extract<EffectDef, { kind: "magic" }> => e.kind === "magic" && e.timing === thenPay)
    if (!entry) return
    const cost = effectiveCost(state, pid, card)
    // 払えないなら払う確認は出さず不発（2026-10-02 ユーザー確認。バースト自体の発動確認は済んでいる）。
    // 簡略化：判定するのはコストのコアだけで、効果本体（entry.action）が解決できるかは見ない
    if (!canPayMagicCost(state, pid, cost)) {
        log(state, unpayableLine(card.name, "コストのコアが足りない"))
        return
    }
    // 効果本体の解決可否は見ないが、相手のバーストを開く効果だけは相手のバーストが無ければ払わせない（BS18-084）
    const headAction = entry.action.type === "sequence" ? entry.action.actions[0] : entry.action
    if (headAction?.type === "revealOpponentBurst" && state.players[opponentOf(pid)].burst === null) {
        log(state, unpayableLine(card.name, "相手がバーストをセットしていない"))
        return
    }
    if (state.interactiveTargets) {
        requestActivationConfirm(
            state,
            pid,
            `${card.name}：コスト${cost}を支払って効果を発揮しますか？`,
            entry.action,
            null,
        )
        if (state.pendingChoice) state.pendingChoice.burstThenPay = { pid, cost, cardId, timing: thenPay }
        return
    }
    announceBurstMagicEffect(state, pid, cardId, thenPay)
    payMagicCostThenResolve(state, pid, cardId, cost, entry.action)
}

// burstMagicFreeEffect持ち（BS16-070）の分岐：「コストを払ってthenPay」「無償でメイン」「無償でフラッシュ」
// 「発揮しない」の中から選ぶ。thenPayを持たないバーストマジックでも無償の2択は出せる
function tryBurstMagicFreeOrThenPay(
    state: GameState,
    pid: PlayerId,
    cardId: string,
    thenPay: "main" | "flash" | undefined,
): void {
    const card = getCard(cardId)
    const player = state.players[pid]
    const magicEntry = (timing: "main" | "flash") =>
        card.effects.find((e): e is Extract<EffectDef, { kind: "magic" }> => e.kind === "magic" && e.timing === timing)
    const mainEntry = magicEntry("main")
    const flashEntry = magicEntry("flash")
    const payEntry = thenPay !== undefined ? magicEntry(thenPay) : undefined
    const payCost = payEntry ? effectiveCost(state, pid, card) : 0
    const canPay = payEntry !== undefined && canPayMagicCost(state, pid, payCost)
    const resolveFree = (entry: ReturnType<typeof magicEntry>): void => {
        if (!entry) return
        announceBurstMagicEffect(state, pid, cardId, entry.timing)
        // マジックの「使用」ではないのでresolveMagicは通さない（Q22399。docs/design/BURST.md §7.1）
        resolveAction(state, pid, null, markPayConfirmed(entry.action), undefined, magicEffectiveColors(state, pid, card), "magic", undefined, undefined, cardId)
    }
    if (!state.interactiveTargets) {
        // 非対話の既定：無償でフラッシュがあればそれ、無ければ無償でメイン（2026-09-28ユーザー決定）
        if (flashEntry) return resolveFree(flashEntry)
        if (mainEntry) return resolveFree(mainEntry)
        if (canPay && payEntry) {
            announceBurstMagicEffect(state, pid, cardId, payEntry.timing)
            payMagicCostThenResolve(state, pid, cardId, payCost, payEntry.action)
        }
        return
    }
    const options: string[] = []
    if (canPay) options.push(`コスト${payCost}を支払って${thenPay === "main" ? "メイン" : "フラッシュ"}効果を発揮する`)
    if (mainEntry) options.push(BURST_MAGIC_FREE_MAIN_LABEL)
    if (flashEntry) options.push(BURST_MAGIC_FREE_FLASH_LABEL)
    if (options.length === 0) return
    suspend(state, {
        pid,
        kind: "option",
        prompt: `${card.name}：コストを支払わずに効果を発揮しますか？`,
        candidates: [],
        options,
        optional: true,
        action: { type: "burstMagicFreeOrThenPay", cardId, ...(payEntry && thenPay !== undefined ? { payTiming: thenPay, payCost } : {}) },
        selfInstanceId: null,
    })
}

// noBurstEffectForPid：効果の解決だけを飛ばす。宣言は成立済みなのでカードはトラッシュへ行き、発動後の誘発も起きる
export function burstEffectBlocked(state: GameState, pid: PlayerId, cardId: string): boolean {
    const card = getCard(cardId)
    const hit = timedPlayerRules(state, pid).some((r) => r.type === "noBurstEffectForPid" && (r.cost === undefined || (card.cost >= r.cost.min && card.cost <= r.cost.max)))
    if (hit) log(state, `${card.name}：効果によりバースト効果を発揮できなかった。`)
    return hit
}

// バーストの解決がすべて終わった後（ownBurstActivated）。**発動開始時点で場にいた発生源にだけ発火させる**
// （before＝発動開始時点のフィールドのinstanceId集合。summon{from:"burst"}で新しく場に出た個体には
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
    state.lastBurstActivated = { pid, cardId, summoned: state.players[pid].field.spirits.some((s) => !before.has(s.instanceId)) }
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

// 召喚時効果を発揮した印（効果を解決した・確認で「発動する」を押した）。入れ子のどの段でも、その発生源の分に付ける
export function markSummonEffectResolved(state: GameState, self: CardInstance): void {
    for (const src of state.summonEffectSources ?? []) if (src.instanceId === self.instanceId) src.resolved = true
}

// 召喚時効果を解決しきった地点で呼ぶ（選択を挟んだときは handleAction の事後フック）。
// 実際に発揮していたら、召喚した側の相手に【相手の『召喚時』発揮後】を発火する（2026-09-27 ユーザー確認。BURST.md §10 C）
// 内側（末尾）から1つずつ閉じる。選択待ちが残っていれば何もしない
export function finishSummonEffect(state: GameState): void {
    if (state.pendingChoice) return
    const src = state.summonEffectSources?.pop()
    if (src === undefined) return
    if (!src.resolved || state.winner) return
    if (src.cardId !== undefined && src.level !== undefined) state.lastOpponentSummonEffect = { cardId: src.cardId, level: src.level }
    fireFieldEventTriggers(state, opponentOf(src.pid), "opponentSummonEffectResolved", undefined, src.colors, undefined, undefined, { costs: [src.cost] })
}

// kind:"burst" の走査本体（docs/design/BURST.md）。fireFieldEventTriggers の末尾から呼ぶほか、
// BS16バッチ0：破壊後バースト（event:"ownSpiritDestroyed"）はトラッシュ行き確定後に
// removal.ts の fireQueuedDestroyBursts が単独で呼ぶ（selfOverrideは{pid, cardId}の軽量版でよい。
// 破壊済みの個体はもうCardInstance実体が無いため）
// 宣言のあとのバースト判定を順に行う。発動の確認などで中断したら、残りを後ろへ積む
export function fireEventBursts(state: GameState, checks: EventBurstCheck[]): void {
    for (let i = 0; i < checks.length; i++) {
        if (state.winner) return
        const c = checks[i]!
        fireBurstOnEvent(state, c.pid, c.event, c.subject, c.colors, c.targetInstanceId, c.info, c.setCardId)
        if (state.pendingChoice) {
            if (i + 1 < checks.length) pushResumeFrames(state, [eventBurstsFrame(state, checks.slice(i + 1))])
            return
        }
    }
}

// バーストの確認を後回しにするフレーム。条件を満たした時点でセットされていたカードを控える
// （後からセットしたバーストは、その条件では発動できない。BURST.md §1.4）
export function eventBurstsFrame(state: GameState, checks: EventBurstCheck[]): Extract<ResumeFrame, { kind: "eventBursts" }> {
    return { kind: "eventBursts", checks: checks.map((c) => (c.setCardId !== undefined ? c : { ...c, setCardId: state.players[c.pid].burst })) }
}

// セットしているバーストカード自身が「効果を受けない」耐性を持つか。持つなら発動を止める効果をすべて無視して発動できる（Q7012）。
// プレイヤーに掛かるコスト（発動の支払いなど）は耐性で防げない（Q7016）ので、ここには入れない。
// 今のカードプールに該当カードは無い。カードデータに耐性の欄が入ったらここで読む
export function burstCardIgnoresEffects(_cardId: string): boolean {
    return false
}

// 「バーストを発動できない」を1か所にまとめた判定（BURST.md §2。Q7012・Q7015）。true＝発動できない（セットされたまま残る）
function burstActivationBlocked(
    state: GameState,
    holderPid: PlayerId,
    burstCardId: string,
    event: FieldEvent,
    eventInfo?: { lifeLossByNoOwnBurst?: boolean },
): boolean {
    if (burstCardIgnoresEffects(burstCardId)) return false
    // noOwnBurst 付きの placeCores で減ったライフ（N14）：その減少では、ライフが減った本人のバーストは発動できない（相手のバーストは別）
    if (eventInfo?.lifeLossByNoOwnBurst === true) return true
    // 相手の noBurstActivationByEvent／ByColor／burstOnlyOwnFieldSymbolColors
    if (burstActivationForbidden(state, holderPid, event, burstCardId)) return true
    if (burstFeeUnpayable(state, holderPid, burstCardId)) return true
    const timed = timedContentsFor(state, holderPid)
    // 「このスピリットのバトル時、相手はバーストを発動できない」（BS15-X03）。colors 指定時はその色のバーストカードだけ（BS19-060）
    if (timed.some((c) => c.type === "battleLock" && c.lock === "burst" && (c.colors === undefined || getCard(burstCardId).colors.some((col) => c.colors!.includes(col))))) return true
    // playerRule "noBurstActivation"（N13）。byEvent 指定時はそのバースト条件のバーストだけ
    return timed.some((c) => c.type === "playerRule" && c.rule.type === "noBurstActivation" && (c.rule.byEvent === undefined || c.rule.byEvent === event))
}


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
        members?: { colors: Color[]; cost: number; families: string[] }[]
        lifeLossByNoOwnBurst?: boolean
    },
    setCardId?: string | null, // 確認を後回しにした経路だけ渡る（EventBurstCheck.setCardId）
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
        if (setCardId !== undefined && setCardId !== burstCardId) continue
        // 宣言済みで適用を待っているバーストは、同じ解決の中の次の条件で宣言し直さない
        if (state.declaredBursts?.some((d) => d.pid === holderPid && d.cardId === burstCardId)) continue
        let effect = getCard(burstCardId).effects.find(
            (e): e is Extract<EffectDef, { kind: "burst" }> => e.kind === "burst" && e.event === event,
        )
        // BS15共通器：globalConstraint "burstAltEventFromOpponentSummon"（発生源=holder自身）が
        // 効いている間、event:"opponentSummonEffectResolved"のバーストは alsoOn の事象でも拾う
        // （省略時は"ownLifeDamaged"。BS15-069太陰の宮廷Lv2。X016 は alsoOn:"ownSpiritDestroyed"）
        const altEventHere = effectSources(state, holderPid).some((src) => {
            const srcLevel = currentLevel(src).level
            return getCard(src.cardId).effects.some(
                (e) =>
                    e.kind === "globalConstraint" &&
                    e.constraint.type === "burstAltEventFromOpponentSummon" &&
                    (e.constraint.alsoOn ?? "ownLifeDamaged") === event &&
                    effectActiveAtLevel(e.levels, srcLevel),
            )
        })
        if (!effect && altEventHere) {
            effect = getCard(burstCardId).effects.find(
                (e): e is Extract<EffectDef, { kind: "burst" }> => e.kind === "burst" && e.event === "opponentSummonEffectResolved",
            )
            // 破壊が絡む代替は、「相手による」の判定（byOpponentEffectOnly と同じ。バトル破壊を含む）を通す
            if (effect && event === "ownSpiritDestroyed" && !eventInfo?.byOpponentEffect) continue
        }
        if (!effect) continue
        if (burstActivationBlocked(state, holderPid, burstCardId, effect.event, eventInfo)) continue
        // subjectSide：fieldEvent の同名軸と同じ判定（own=バーストの持ち主自身の事象、opponent=その相手の事象）
        if (effect.subjectSide === "own" && selfOverride?.pid !== holderPid) continue
        if (effect.subjectSide === "opponent" && (selfOverride === undefined || selfOverride.pid === holderPid)) continue
        // byOpponentEffectOnly / destroyedColorFilter：fieldEvent の同名軸と同じ判定（event: "ownSpiritDestroyed" 限定）
        if (effect.byOpponentEffectOnly && !eventInfo?.byOpponentEffect) continue
        if (effect.destroyedColorFilter !== undefined && !(eventColors ?? []).includes(effect.destroyedColorFilter)) continue
        // destroyedMinBp は発動の条件ではなく効果の条件。満たさなくても発動はでき、適用の時点で不発になる（applyDeclaredBurst）
        // 効果の条件（condition）・発揮できない・税は、適用の時点で判定する（applyDeclaredBursts）
        // destroyedAsTarget：破壊された個体はもう場に無く、トラッシュには cardId でしか残らないので、
        // instanceId ではなく **cardId** を渡す（受け手は recoverMagicFromTrash の onlyBurstDestroyedCard）
        const destroyedCardId = effect.destroyedAsTarget ? selfOverride?.cardId : undefined
        const alsoDraw = effect.alsoDrawIfDestroyedColor !== undefined && (eventColors ?? []).includes(effect.alsoDrawIfDestroyedColor)
        // 破壊後バーストのコストが1つの値に決まらない（同時破壊で複数体・値違い）ときは、発動者が使う値を1つ選ぶ
        // （対話：選択肢／非対話：最大値）
        const distinctCosts = [...new Set(eventInfo?.costs ?? [])]
        // event:"ownLifeDamaged"限定：ライフを減らしたスピリット
        const lifeDamagerId = event === "ownLifeDamaged" ? (targetInstanceId ?? state.battle?.lifeDamagers?.at(-1)) : undefined
        const record: DeclaredBurst = {
            pid: holderPid,
            cardId: burstCardId,
            event: effect.event,
            ...(targetInstanceId !== undefined ? { targetInstanceId } : {}),
            ...(destroyedCardId !== undefined ? { destroyedCardId } : {}),
            ...(alsoDraw ? { alsoDraw: true as const } : {}),
            ...(distinctCosts.length > 0 ? { eventCost: Math.max(...distinctCosts) } : {}),
            ...(eventColors && eventColors.length > 0 ? { eventColors } : {}),
            ...(lifeDamagerId !== undefined ? { lifeDamagerId } : {}),
            ...(eventInfo?.members !== undefined ? { members: eventInfo.members } : {}),
            ...(eventInfo?.destroyedBp !== undefined ? { destroyedBp: eventInfo.destroyedBp } : {}),
        }
        noteCoverage(effect, "burst")
        // 発動（宣言）は常に任意。実対戦では確認を出し、非対話（テスト）では自動で宣言する
        if (state.interactiveTargets) {
            const prompt = `${getCard(burstCardId).name}のバーストを発動しますか？`
            if (distinctCosts.length > 1) {
                // コストの選択肢つき確認（「発動する」の代わりに「コストNで発動する」を並べる）
                suspend(state, {
                    pid: holderPid,
                    kind: "option",
                    prompt,
                    candidates: [],
                    options: distinctCosts.map((c) => `コスト${c}で発動する`),
                    optional: true,
                    confirm: true,
                    action: { type: "noop" },
                    selfInstanceId: null,
                })
            } else {
                const fee = burstActivationFee(state, holderPid, burstCardId)
                requestActivationConfirm(state, holderPid, `${prompt}${fee > 0 ? `（コスト${fee}を支払います）` : ""}`, { type: "noop" }, null)
            }
            // ⚠️ 対話モードでは、この1件を確認してから返る。同時に相手側も条件を満たしていた場合、
            // その宣言は今回は提示しない簡略化（1事象につき先着1件。docs/design/BURST.md）
            const pending = state.pendingChoice as PendingChoice | null
            if (pending) pending.burstActivate = { ...record, ...(distinctCosts.length > 1 ? { eventCostOptions: distinctCosts } : {}) }
            return
        }
        if (negateBurstActivation(state, holderPid, burstCardId, { kind: "card", ignoreCondition: false })) continue
        declareBurst(state, record)
    }
}

// 発動の宣言を確定する：発動の支払いと告知をして、適用を待つ列に積む。効果はここでは解決しない
export function declareBurst(state: GameState, record: DeclaredBurst): void {
    payBurstActivationFee(state, record.pid, record.cardId)
    announceBurstActivation(state, record.pid, record.cardId)
    ;(state.declaredBursts ??= []).push(record)
}

// 宣言したバーストの効果を適用する。条件を満たした効果とそれに伴う解決を最後まで処理し、以降に解決する効果が無くなってから
// （BURST.md §1.4。2026-11-15 ユーザー決定）。同時に宣言があれば防御側から。
// force：流れの側で時点が決まっている所（バトルの step 5・アタックをライフで受けた直後）は、バトルの続きが再開スタックに残っていても適用する
// 戻り値＝適用した数
export function applyDeclaredBursts(state: GameState, force = false): number {
    let applied = 0
    for (;;) {
        const list = state.declaredBursts
        if (!list || list.length === 0) {
            delete state.declaredBursts
            return applied
        }
        if (state.winner || state.pendingChoice || state.currentEffectSource !== undefined || anyWaiting(state)) return applied
        if ((state.pendingBraveKeeps?.length ?? 0) > 0 || (state.pendingCoreDestinations?.length ?? 0) > 0) return applied
        if (!force && state.resumeStack.length > 0) return applied
        const at = Math.max(0, list.findIndex((d) => d.pid !== state.turnPlayer))
        const [d] = list.splice(at, 1)
        if (d) applyDeclaredBurst(state, d)
        applied++
    }
}

function applyDeclaredBurst(state: GameState, d: DeclaredBurst): void {
    // 宣言の後でバーストエリアを離れた（破棄されたなど）
    if (state.players[d.pid].burst !== d.cardId) return
    const card = getCard(d.cardId)
    const effect = card.effects.find((e): e is Extract<EffectDef, { kind: "burst" }> => e.kind === "burst" && e.event === d.event)
    if (!effect) return
    // 宣言から適用までに効果の条件を満たさなくなっても、発動は取り消されない。action の解決だけを飛ばす
    // （「このスピリットカードを召喚する」等も発揮せず、finishBurstActivation の既定どおりトラッシュへ置かれる）
    const blocked = burstEffectBlocked(state, d.pid, d.cardId)
    // destroyedMinBp：破壊の出来事の BP が足りなければ不発（トラッシュへ。発動自体は取り消されない）
    const minBpMet = effect.destroyedMinBp === undefined || (d.destroyedBp ?? 0) >= effect.destroyedMinBp
    const baseAction: EffectAction = burstConditionMet(state, d.pid, effect.condition, d.members) && !blocked && minBpMet ? markPayConfirmed(effect.action) : { type: "noop" }
    const actionToRun = withEffectTax(state, d.pid, "burst", d.cardId, baseAction)
    const before = fieldInstanceIdsOf(state, d.pid)
    // EffectCounter "burstEventCost"・条件 {burstDestroyedColor} などが読む出来事の情報。別の宣言の値と混ざらないよう、適用の直前に立てる
    if (d.eventCost !== undefined) state.burstEventCost = d.eventCost
    else delete state.burstEventCost
    if (d.eventColors !== undefined) state.burstEventColors = d.eventColors
    else delete state.burstEventColors
    if (d.lifeDamagerId !== undefined) state.burstEventLifeDamagerId = d.lifeDamagerId
    else delete state.burstEventLifeDamagerId
    // バーストのカードの色と種別を渡す（【装甲】などの効果耐性はバースト効果にも効く。BURST.md §7）。色は magicEffectiveColors を通す（BS15_PLAN.md §7.3）。
    // 対話では出来事の対象（ライフを減らしたスピリットなど）を渡さない：渡すと、対象を選ぶ効果がそれを選択済みの対象として扱う
    const target = state.interactiveTargets ? d.destroyedCardId : (d.destroyedCardId ?? d.targetInstanceId)
    resolveAction(state, d.pid, null, actionToRun, target, magicEffectiveColors(state, d.pid, card), card.type, undefined, undefined, d.cardId, undefined, true)
    continueBurstActivation(state, {
        kind: "burstFinish",
        stage: "finish",
        pid: d.pid,
        cardId: d.cardId,
        actionType: baseAction.type,
        ...(effect.thenPay !== undefined && !blocked ? { thenPay: effect.thenPay } : {}),
        ...(effect.returnSelfToHandAfter ? { toHand: true as const } : {}),
        ...(d.alsoDraw ? { alsoDraw: true as const } : {}),
        before: [...before],
    })
}

// オープンしたバーストのカードを、バーストとして発動させる（reveal の dest:"activateBurst"。BS16-X01）。
// 後始末（finishBurstActivation）がバーストエリアのカードを前提にするので、いったんエリアに戻してから解決する
// ignoreCondition：バースト条件を無視する発動（BS18）。発動の原因になった出来事は起きていないので、
// 出来事の情報を読む効果（破壊されたスピリットの色・コスト、ライフを減らしたスピリット）は読む先を消して不発にする
// 戻り値 false＝相手の「バーストを発動できない」で発動できなかった（バースト条件を無視してもカード自身の条件は残る。2026-10-23 ユーザー確認）
// negateChecked：BS21-052 の無効化を断られた後の呼び直し
export function activateBurstCard(state: GameState, owner: PlayerId, cardId: string, ignoreCondition = false, negateChecked = false): boolean {
    const player = state.players[owner]
    const card = getCard(cardId)
    const effect = card.effects.find((e): e is Extract<EffectDef, { kind: "burst" }> => e.kind === "burst")
    if (!effect) {
        player.trashCards.push(cardId)
        return true
    }
    if (onlyUsableDenial(state, owner, cardId)) return false
    if ((ignoreCondition && burstActivationBlocked(state, owner, cardId, effect.event)) || burstFeeUnpayable(state, owner, cardId)) return false
    noteCoverage(effect, "burst")
    player.burst = cardId
    player.burstSet = true
    if (!negateChecked && negateBurstActivation(state, owner, cardId, { kind: "card", ignoreCondition })) return true
    payBurstActivationFee(state, owner, cardId)
    announceBurstActivation(state, owner, cardId)
    const blocked = burstEffectBlocked(state, owner, cardId)
    // destroyedMinBp は破壊の出来事が無い経路（ignoreCondition・reveal）では満たせないので不発。バースト条件を無視しても効果の条件は残る
    const baseAction: EffectAction = (ignoreCondition || burstConditionMet(state, owner, effect.condition)) && !blocked && effect.destroyedMinBp === undefined ? markPayConfirmed(effect.action) : { type: "noop" }
    const actionToRun = withEffectTax(state, owner, "burst", cardId, baseAction)
    const before = fieldInstanceIdsOf(state, owner)
    if (ignoreCondition) {
        delete state.burstEventCost
        delete state.burstEventColors
        delete state.burstEventLifeDamagerId
    }
    resolveAction(state, owner, null, actionToRun, undefined, magicEffectiveColors(state, owner, card), card.type, undefined, undefined, cardId, undefined, true)
    continueBurstActivation(state, {
        kind: "burstFinish",
        stage: "finish",
        pid: owner,
        cardId,
        actionType: baseAction.type,
        ...(effect.thenPay !== undefined && !blocked ? { thenPay: effect.thenPay } : {}),
        ...(effect.returnSelfToHandAfter ? { toHand: true as const } : {}),
        before: [...before],
    })
    return true
}

// kind:"burst" の condition 判定（docs/design/BURST.md）。未指定なら常に満たす
export function burstConditionMet(
    state: GameState,
    pid: PlayerId,
    condition: Extract<EffectDef, { kind: "burst" }>["condition"],
    // 破壊後バーストのときだけ渡る（破壊されたメンバーごとの色・コスト・系統）
    members?: { colors: Color[]; cost: number; families: string[] }[],
): boolean {
    if (condition === undefined) return true
    const player = state.players[pid]
    if ("ownLifeAtMost" in condition) return player.life <= condition.ownLifeAtMost
    if ("ownNexusAtLeast" in condition) return player.field.nexuses.length >= condition.ownNexusAtLeast
    if ("ownTrashColorCountAtLeast" in condition) {
        const { color, count } = condition.ownTrashColorCountAtLeast
        return player.trashCards.filter((id) => getCard(id).colors.includes(color)).length >= count
    }
    if ("ownTrashCardTypeCountAtLeast" in condition) {
        const { cardType, count } = condition.ownTrashCardTypeCountAtLeast
        return player.trashCards.filter((id) => getCard(id).type === cardType).length >= count
    }
    // BS15-017エンプレス・ヨウクィーン：自分の手札が5枚以上のとき
    if ("ownHandAtLeast" in condition) return player.hand.length >= condition.ownHandAtLeast
    // BS15-026軍師鳥ショカツリョー：自分と相手のフィールドに疲労状態のスピリットが合計でこれ以上いるとき
    if ("bothFieldsRestedSpiritsAtLeast" in condition) {
        const restedCount = (p: typeof player) => p.field.spirits.filter((s) => s.isRested).length
        return restedCount(player) + restedCount(state.players[opponentOf(pid)]) >= condition.bothFieldsRestedSpiritsAtLeast
    }
    // BS15共通器：BS15-043ショーグンペンタン「自分の黄のスピリットが3体以上いるとき」
    if ("ownColorCountAtLeast" in condition) {
        const { color, count } = condition.ownColorCountAtLeast
        return player.field.spirits.filter((s) => instHasColor(s, color)).length >= count
    }
    // BS15共通器：BS15-053コジロンド・ゴレム「自分のフィールドに【粉砕】/【大粉砕】を持つスピリットが1体以上いるとき」
    if ("ownFieldHasKeywordAny" in condition) {
        return player.field.spirits.some((s) => condition.ownFieldHasKeywordAny.some((k) => spiritHasKeyword(state, pid, s, k)))
    }
    // BS15共通器：BS15-083秘剣燕返「相手の手札が5枚以上のとき」
    if ("opponentHandAtLeast" in condition) {
        return state.players[opponentOf(pid)].hand.length >= condition.opponentHandAtLeast
    }
    // BS16共通器：このバースト発動時に破壊された（同時破壊なら全メンバーの）色にこの色が含まれるか
    if ("burstDestroyedColor" in condition) {
        // 条件の評価は burstEventColors を積む前なので、破壊メンバーが渡っていればそちらから読む
        const c = condition.burstDestroyedColor
        return members !== undefined ? members.some((m) => m.colors.includes(c)) : (state.burstEventColors ?? []).includes(c)
    }
    if ("burstDestroyed" in condition) {
        const { colors, minCost, family } = condition.burstDestroyed
        const fam = family === undefined ? undefined : Array.isArray(family) ? family : [family]
        return (members ?? []).some(
            (m) =>
                (colors === undefined || colors.some((c) => m.colors.includes(c))) &&
                (minCost === undefined || m.cost >= minCost) &&
                (fam === undefined || fam.some((f) => m.families.includes(f))),
        )
    }
    // 器BS16：発生源の持ち主のフィールドに指定系統（配列＝OR）のスピリットがcount体以上いるか
    // （BS16-005ゴエモン・シーフ・ドラゴン：「系統：「覇皇」/「雄将」を持つ自分のスピリットがいるとき」）
    if ("ownFamilyCountAtLeast" in condition) {
        const { family, count } = condition.ownFamilyCountAtLeast
        return player.field.spirits.filter((s) => matchesFamilyFilter(state, pid, s, family)).length >= count
    }
    // ownFamilyCountAtLeastの相手版（BS16-027：「系統：『覇皇』/『雄将』を持つ相手のスピリットがいるとき」）
    if ("opponentFamilyCountAtLeast" in condition) {
        const { family, count } = condition.opponentFamilyCountAtLeast
        const oppPlayer = state.players[opponentOf(pid)]
        return oppPlayer.field.spirits.filter((s) => matchesFamilyFilter(state, opponentOf(pid), s, family)).length >= count
    }
    // フィールド（スピリット・ネクサス・合体中のブレイヴの上）＋リザーブ＋トラッシュのコアの合計。
    // ライフとソウルコアは数えない（効果文が挙げている3つのゾーンだけ。BS14-X03）
    const fieldCores =
        battlers(player).reduce((n, i) => n + i.cores, 0) +
        player.field.nexuses.reduce((n, i) => n + i.cores, 0) +
        player.field.combinedBraves.reduce((n, i) => n + i.cores, 0)
    return fieldCores + player.reserve + player.trashCores >= condition.ownCoresTotalAtLeast
}
