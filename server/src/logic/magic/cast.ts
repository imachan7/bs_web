import type { CardData, GameState, PlayerId, EffectAction, PaySource, PendingChoice, EffectDef } from "../../type"
import { getCard, opponentOf, suspend, findInstanceAnywhere, log } from "../GameState"
import { findMagicFreeGrantSource, hasMagicRestriction, effectiveCost } from "../../../../shared/cost"
import { emitEvent, payCost, resolveAction } from "../EffectModules"
import { isRedirectOptional, askBothSidesRedirect, findMagicRedirectSourceForCard } from "./redirect"
import { findMagicNegateSource, payMagicNegate } from "./negate"
import { resolveMagicEffects, fireMagicUsedTriggers } from "./resolve"
import { matchesTarget } from "../../../../shared/rules"
import { validateCastMagic } from "../RuleValidator"
import { passFlashPriority, MAGIC_FREE_OPTIONS, COUNT_IS_BODIES } from "../GameEngine"

export function resolveMagic(
    state: GameState,
    owner: PlayerId,
    cardId: string,
    timing: "main" | "flash",
    targetInstanceId?: string,
    // 「コストを支払って」使用されたか（BS11-X05 魔導双神ジェミナイズ用。既定はtrue＝通常の使用手続き。
    // 軽減で実質0コストでも支払った扱い。「コストを支払わずに使用」の経路だけがfalseを渡す）
    paidCost = true,
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
    // 「あえてコストを払って使う」を選んでいたら、1枚きりの無償枠は消費しない（2026-08-15 ユーザー確認）。
    // doCastMagic が直前に立てるフラグなので、読んだらすぐ消す
    const declinedFree = state.magicFreeDeclined === true
    delete state.magicFreeDeclined
    if (!declinedFree) consumeOncePerBattleMagicFree(state, owner, card)
    emitEvent(state, { type: "magic", pid: owner, cardName: card.name })

    // マジックの無効化（鏡の回廊Lv2／今後の【氷壁】）。効果を1つも解決する前に判定する。
    // 実対戦（interactiveTargets）では防御側に「無効にするか」を確認し、
    // 自動解決（テスト・非interactive）ではコストを払える限り無効にする
    const negate = findMagicNegateSource(state, owner, card)
    if (negate) {
        if (state.interactiveTargets) {
            suspend(state, {
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
                    paidCost,
                },
                action: { type: "noop" },
                selfInstanceId: negate.inst.instanceId,
            })
            return
        }
        payMagicNegate(state, negate, card)
        fireMagicUsedTriggers(state, owner, card, timing, paidCost)
        return
    }

    // 対象の絞り込み（BS04サンク／BS05スノーホワイト）は「〜にできる」＝任意なので、
    // 守る側に1回だけ確認する。**このマジックの効果のどれかで実際に絞り込みが起こる場合だけ聞く**
    // （聞いても意味がない場面で確認を出さないため）。答えはマジックの解決中ずっと使い回す
    delete state.magicRedirectDecision
    if (state.interactiveTargets) {
        const redirectSource = findMagicRedirectSourceForCard(state, owner, card, timing, targetInstanceId)
        if (redirectSource && isRedirectOptional(redirectSource)) {
            suspend(state, {
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
                    paidCost,
                },
                action: { type: "noop" },
                selfInstanceId: redirectSource.instanceId,
            })
            return
        }
    }

    if (askBothSidesRedirect(state, owner, card, timing, targetInstanceId, paidCost)) return
    resolveMagicEffects(state, owner, cardId, timing, targetInstanceId, paidCost)
}

// oncePerBattle の magicFreeGrant を「このバトルで1枚使った」として記録する。
// resolveMagic の冒頭（＝マジックの使用が確定した時点）で呼ぶ。コスト0の判定自体は
// その手前の支払い経路（shared/cost.ts effectiveCost）で済んでいるため、ここでは記録だけを行う
export function consumeOncePerBattleMagicFree(state: GameState, pid: PlayerId, cardData: CardData): void {
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

// クライアントが**先に選んだ対象**をそのまま使ってよいかを見る（2026-08-21 利用者確定）。
//
// マジックだけは「クライアントが対象を選んでから castMagic を送る」作りになっており、
// 送られる対象が効果の条件を満たしているとは限らない。対象選択はサーバー側（pendingChoice）へ
// 一本化するのが本筋だが、クライアントが追いつくまでの間、ここで受け口を絞って壊れないようにする:
//
//   - 効果の filter を満たさない対象 → 捨てる（従来は「対象条件を満たさない」でマジックだけ消費されていた）
//   - count が2以上＝**複数体が対象** → 捨てる（1体だけ渡されると残りの体数ぶんが失われる）
//   - chooserIsTarget＝**選ぶのは相手** → 捨てる（使用者が選ぶと相手の選択権を奪う）
//
// 捨てたときは「対象未指定」として解決へ進むので、サーバー側が正しい候補を出して選ばせる。
// なお anySide（自分か相手のどちらでも選べる）は、片側しか選べないのがクライアント側の制限で、
// サーバーには届かないため、ここでは救済できない（UI側の修正が要る）
export function usableMagicTarget(
    state: GameState,
    cardId: string,
    timing: "main" | "flash",
    targetInstanceId: string | undefined,
): string | undefined {
    if (targetInstanceId === undefined) return undefined
    const effect = getCard(cardId).effects.find((e) => e.kind === "magic" && e.timing === timing)
    if (!effect || effect.kind !== "magic") return targetInstanceId
    const action = effect.action as EffectAction & {
        count?: number
        chooserIsTarget?: true
        filter?: Record<string, unknown>
    }
    if (action.chooserIsTarget) return undefined
    if (typeof action.count === "number" && action.count > 1 && COUNT_IS_BODIES.has(action.type)) {
        return undefined
    }
    if (action.filter === undefined) return targetInstanceId
    const found = findInstanceAnywhere(state, targetInstanceId)
    if (!found) return targetInstanceId // 見つからない対象は validateCastMagic 側の判定に任せる
    const ownerPid = state.players.p1.field.spirits.some((sp) => sp.instanceId === targetInstanceId)
        ? "p1"
        : "p2"
    // filter は self 相対の軸（"selfBp" 等）を持たない前提（マジックには発生源スピリットがいない）。
    // 判定できない軸が来た場合も matchesTarget が false を返すので、捨てる側に倒れる
    return matchesTarget(state, ownerPid, found, action.filter as never) ? targetInstanceId : undefined
}

export function doCastMagic(
    state: GameState,
    pid: PlayerId,
    handIndex: number,
    targetInstanceId?: string,
    paySources?: PaySource[],
    fromTegamoto?: boolean,
    // undefined＝まだ聞いていない / true＝無償で使う / false＝あえてコストを払う。
    // 確認から戻ってきたときだけ true/false が入る
    freeChoice?: boolean,
): string | null {
    const error = validateCastMagic(state, pid, handIndex, targetInstanceId, paySources, fromTegamoto)
    if (error) return error

    const player = state.players[pid]
    const cardId = fromTegamoto ? player.tegamoto[handIndex] : player.hand[handIndex]
    if (cardId === undefined) return fromTegamoto ? "手元にカードがありません" : "手札にカードがありません"
    const card = getCard(cardId)

    // マジック無償化（kind:"magicFreeGrant"）の使用時確認（2026-08-15 ユーザー確認）。
    // 無償化を持つカードすべてで毎回聞く。**あえてコストを払う**道を残すのは、
    // 無償化の枠が1枚きりのカード（大天使イスフィール）で枠を温存できるようにするため。
    // **払える見込みがあるときだけ**聞く（払えないなら無償で使う以外に道がなく、聞いても意味がない）。
    // 見込みはリザーブだけで見る簡略化（フィールドのコアで払う場合は確認が出ないが、
    // その場合も無償で使えることに変わりはないので不利益にならない）
    const paidCost = effectiveCost(state, pid, card, true)
    const isFree = paidCost > 0 && effectiveCost(state, pid, card) === 0
    if (freeChoice === undefined && state.interactiveTargets && isFree && player.reserve >= paidCost) {
        suspend(state, {
            pid,
            kind: "option",
            prompt: `${card.name}：コストを支払わずに使用しますか？（支払う場合のコストは${paidCost}）`,
            candidates: [],
            options: MAGIC_FREE_OPTIONS,
            optional: false,
            magicFreeChoice: {
                handIndex,
                ...(targetInstanceId !== undefined ? { targetInstanceId } : {}),
                ...(paySources !== undefined ? { paySources } : {}),
                ...(fromTegamoto !== undefined ? { fromTegamoto } : {}),
            },
            action: { type: "noop" },
            selfInstanceId: null,
        })
        return null
    }
    // あえて払うことを選んだ場合だけ無償化を無視する。
    // resolveMagic は magicFreeDeclined を見て oncePerBattle の枠を消費しない
    const declinedFree = isFree && freeChoice === false
    const cost = effectiveCost(state, pid, card, declinedFree)
    if (declinedFree) state.magicFreeDeclined = true

    payCost(state, pid, cost, paySources)
    if (fromTegamoto) {
        player.tegamoto.splice(handIndex, 1)
        // 手元の使用権（BS06混迷する魔法実験場Lv2）も1件ぶん消費する。
        // cardId の多重集合として持っているので、同名が複数あってもどれを消しても等価
        const playableIdx = player.tegamotoPlayable.indexOf(cardId)
        if (playableIdx !== -1) player.tegamotoPlayable.splice(playableIdx, 1)
    } else {
        player.hand.splice(handIndex, 1)
    }
    player.trashCards.push(cardId)
    log(state, `${player.name}は${card.name}を使用した。（コスト${cost}）`)
    // このターンのマジック使用回数を加算（作戦参謀フォクシンのoncePerTurnAll判定用）
    state.magicUsedThisTurn[pid] = (state.magicUsedThisTurn[pid] ?? 0) + 1

    // 使用タイミングに応じた効果を実行。メインステップでメイン効果がなければフラッシュ効果を使う。
    // マジックミラー用：このフラッシュタイミングで直前に使用したマジックとして記録する
    // （clearBattleでバトルごとにクリアされる。BS08マジックミラー）。
    // **resolveMagicの後で、かつ解決中に書き換わっていなければ**記録すること：
    // この使用自体がマジックミラーだった場合、マジックミラー自身の解決（action:"magicMirrorRepeat"）が
    // 「直前に使用されたマジック」を読んでからここと同じ場所を書き換える。先に（resolveMagicの前に）
    // 記録すると自分自身を読んでしまい、後で（無条件に）書き換えるとマジックミラー側の記録を潰してしまう
    const beforeLastMagicCast = state.lastMagicCast
    if (state.battle) {
        // クライアントが先に選んだ対象は、効果の条件に合うものだけ採用する（usableMagicTarget）
        const target = usableMagicTarget(state, cardId, "flash", targetInstanceId)
        resolveMagic(state, pid, cardId, "flash", target)
        if (state.lastMagicCast === beforeLastMagicCast) {
            state.lastMagicCast = {
                pid,
                cardId,
                timing: "flash",
                ...(target !== undefined ? { targetInstanceId: target } : {}),
            }
        }
        // フラッシュで使用したら優先権を相手へ移し、再応答の機会を与える
        passFlashPriority(state, pid)
    } else {
        const hasMain = card.effects.some(
            (e) => e.kind === "magic" && e.timing === "main",
        )
        const timing = hasMain ? "main" : "flash"
        const target = usableMagicTarget(state, cardId, timing, targetInstanceId)
        resolveMagic(state, pid, cardId, timing, target)
        if (state.lastMagicCast === beforeLastMagicCast) {
            state.lastMagicCast = {
                pid,
                cardId,
                timing,
                ...(target !== undefined ? { targetInstanceId: target } : {}),
            }
        }
    }
    if (state.winner) state.battle = null
    return null
}

// kind:"magic" usableAtOpponentMainEnd（BS15-079プロボケイション）：相手（＝これからアタックステップに
// 入ろうとしているプレイヤー）から見た相手の手札に、この特殊タイミングで使えるマジックがあり、
// かつコストを払えるときだけ確認を出す。出した（＝アタックステップへの遷移を保留した）なら true。
// 非対話（smoke）では確認を出さず、払えるなら自動で使用する。
// 戻り値：確認を出した＝"suspended"／自動で使用した＝"used"／何もしなかった＝null。
// endTurnIfDeclined はメインから直接ターン終了した経路（使わなければそのままターン終了を続ける）
export function offerOpponentMainEndMagic(
    state: GameState,
    attackingPid: PlayerId,
    endTurnIfDeclined?: true,
): "suspended" | "used" | null {
    const holderPid = opponentOf(attackingPid)
    const player = state.players[holderPid]
    const cardId = player.hand.find((id) => {
        const card = getCard(id)
        return card.effects.some((e) => e.kind === "magic" && e.timing === "flash" && e.usableAtOpponentMainEnd)
    })
    if (cardId === undefined) return null
    const cost = effectiveCost(state, holderPid, getCard(cardId))
    if (player.reserve < cost) return null
    if (!state.interactiveTargets) {
        applyProvocationUse(state, { pid: holderPid, cardId })
        return "used"
    }
    suspend(state, {
        pid: holderPid,
        kind: "option",
        prompt: `${getCard(cardId).name}：コスト${cost}を支払って使用しますか？`,
        candidates: [],
        options: ["使用する"],
        optional: true,
        confirm: true,
        provocationUse: { pid: holderPid, cardId, ...(endTurnIfDeclined ? { endTurnIfDeclined } : {}) },
        action: { type: "noop" },
        selfInstanceId: null,
    })
    return "suspended"
}

// プロボケイションの使用確定：コストを払い、手札から取り除いてフラッシュ効果を解決する
export function applyProvocationUse(state: GameState, entry: NonNullable<PendingChoice["provocationUse"]>): void {
    const player = state.players[entry.pid]
    const handIndex = player.hand.indexOf(entry.cardId)
    if (handIndex === -1) return
    const card = getCard(entry.cardId)
    const cost = effectiveCost(state, entry.pid, card)
    if (player.reserve < cost) return
    player.reserve -= cost
    player.hand.splice(handIndex, 1)
    player.trashCards.push(entry.cardId)
    log(state, `${player.name}は${card.name}を使用した。（コスト${cost}）`)
    const effect = card.effects.find(
        (e): e is Extract<EffectDef, { kind: "magic" }> => e.kind === "magic" && e.timing === "flash" && e.usableAtOpponentMainEnd === true,
    )
    if (effect) resolveAction(state, entry.pid, null, effect.action)
}
