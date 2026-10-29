// ドローと手札破棄アクションのハンドラ（noop を含む）
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { EffectAction } from "../../type"
import { draw, getCard, log, opponentOf, pushResumeFrames } from "../GameState"
import { tryFreeSummonOnHandDiscard, bothSidesPids, countEffectCounter, drawDoubleMultiplier, findSpiritAny, handImmuneFor, requestCardChoice, requestChoice, spiritHasFamily, tryInteractiveCardChoice } from "../EffectModules"
import { KEYWORDS, canDiscardHand, instanceSymbolCount, hasGlobalConstraint, hasKeyword } from "../../../../shared/rules"
import { countedAmount } from "../counted"
import { recordDrawn, recordMoved } from "../record"

const noopHandler: ActionHandler<"noop"> = () => {
    // 何もしない（PendingChoice.magicNegate のプレースホルダ）
}

const drawHandler: ActionHandler<"draw"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcType } = ctx
        // BS15共通器：globalConstraint "noHandGainByEffect" が効いている間は、ドロー効果自体が
        // 発揮されない（お互い。BS15-052天蒼元帥チョウハッカイ）
        if (hasGlobalConstraint(state, "noHandGainByEffect")) {
            log(state, `${sourceName}：効果によって手札が増やせないため発動しなかった。`)
            return
        }
        // costSkipCoreStep：「ボイドからコアを自分のリザーブに置かないことで」＝そのコアステップの
        // コア置きを支払いに使う（step.beforeStepAction と対。BS10-087戦場に息づく命）。
        // コア置き区間がこのフラグを見て置かずに進む
        if (action.costSkipCoreStep === true) state.coreStepSkipped = true
        // countCounter（BS12-053オオヅツナナフシ：「相手の手札と同じ枚数」）：count×EffectCounterの値を枚数とする
        if (action.fillTo !== undefined && state.players[owner].hand.length >= action.fillTo) {
            log(state, `${sourceName}：手札がすでに${action.fillTo}枚以上のためドローしなかった。`)
            return
        }
        const count =
            action.fillTo !== undefined
                ? action.fillTo - state.players[owner].hand.length
                : action.countCounter !== undefined
                ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType, action.countMax)
                : action.count
        if (action.countCounter !== undefined && count === 0) {
            log(state, `${sourceName}：カウントが0のためドローしなかった。`)
            return
        }
        const handBefore = state.players[owner].hand.length
        // side:"both"指定時は自分→相手の順で両者が引く（BS03巨猫ブリンクス：お互いドロー）。
        // 封印された魔導書Lv1が働くと片側だけになる（ドローは受ける側の利得なので相手が外れる）
        if (action.side === "both") {
            const pids = bothSidesPids(state, srcType, true)
            for (const pid of [owner, opp]) {
                if (!pids.includes(pid)) continue
                draw(state, pid, count * drawDoubleMultiplier(state, pid))
            }
        } else {
            draw(state, owner, count * drawDoubleMultiplier(state, owner))
        }
        // 「ドローしたカード1枚につき」が読む（自分が引いたカードだけ）
        recordDrawn(state, state.players[owner].hand.length - handBefore)
        return
}

const discardHandAllHandler: ActionHandler<"discardHandAll"> = (ctx, action) => {
    const { state, owner, opp, sourceName } = ctx
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, owner)) {
        log(state, `${state.players[owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
        const player = state.players[owner]
        const count = player.hand.length
        // thenDrawOpponentHand（BS12-053オオヅツナナフシ：「そうしたとき、相手の手札と同じ枚数ドローする」）は
        // 手札が0枚（＝破棄が起きない）なら発揮しない。「そうしたとき」＝破棄を完全に解決した後に数える
        if (count === 0) {
            log(state, `${sourceName}：手札がないため破棄しなかった。`)
            recordMoved(state, [])
            return
        }
        recordMoved(state, [...player.hand])
        player.trashCards.push(...player.hand)
        player.hand = []
        log(state, `${player.name}は手札${count}枚をすべて破棄した。`)
        if (action.thenDrawOpponentHand) {
            const n = state.players[opp].hand.length
            if (n === 0) {
                log(state, `${sourceName}：相手の手札が0枚のためドローしなかった。`)
                return
            }
            draw(state, owner, n)
        }
        return
}

const discardOpponentHandler: ActionHandler<"discardOpponent"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (action.downTo !== undefined) {
            const count = state.players[opp].hand.length - action.downTo
            if (count <= 0) log(state, `${sourceName}：相手の手札は${action.downTo}枚以下のため発動しなかった。`)
            else { const { downTo: _, ...rest } = action; ctx.resolve({ ...rest, count }) }
            return
        }
        // countAttackerSymbols（BS13-064蛇教徒の宮殿Lv2）：countを無視し、targetInstanceIdが指す
        // スピリット（fieldEvent event:"ownLifeDamaged"が渡すアタッカー）のシンボル数を破棄枚数として使う。
        // 一度だけ解決し、countAttackerSymbolsを落としたactionへ入り直す（他のcountCounter系と同じ考え方）
        if (action.countAttackerSymbols) {
            const attacker = targetInstanceId ? findSpiritAny(state, targetInstanceId) : null
            const resolvedCount = attacker ? instanceSymbolCount(attacker.inst) : 0
            const { countAttackerSymbols: _cas, ...rest } = action
            ctx.resolve({ ...rest, count: resolvedCount })
            return
        }
        // interactiveTargets時は選択式（選択者は破棄される相手本人）。forcedTargetPid指定時＝
        // 選択式の再突入呼び出し。選択者=破棄される相手本人のため、pendingChoice解決時に
        // resolveActionへ渡るowner引数は常にpending.pid（=破棄される側）になり、
        // opponentOf(owner)による逆算では元の効果所有者を指してしまう。そのため選択式に入った
        // 時点で対象プレイヤーIdをactionに固定して持ち回す
        const targetPid = action.forcedTargetPid ?? opp
        const target = state.players[targetPid]
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, targetPid)) {
        log(state, `${state.players[targetPid].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
        // revealAllHandIfNone（BS12-072海賊王の秘宝島Lv2）：破棄できないときのフォールバック。
        // その場で見せて終わり＝ゲーム状態は変えずログにだけ出す（§1 #15。2026-09-07ユーザー確認）
        const revealAllHandFallback = (): void => {
            if (!action.revealAllHandIfNone) return
            if (target.hand.length === 0) {
                log(state, `${sourceName}：${target.name}の手札は無かった。`)
                return
            }
            log(
                state,
                `${sourceName}：${target.name}は手札すべてを公開した「${target.hand.map((id) => getCard(id).name).join("、")}」。`,
            )
        }
        // BS12-067月光集める塔Lv1：発生源の持ち主の手札は、相手のスピリット/ブレイヴ/マジックの効果を受けない
        // （ネクサスの効果は防がない）。自分自身の効果はそもそもtargetPid===ownerで弾かれない
        if (owner !== targetPid && handImmuneFor(state, targetPid, srcType)) {
            log(state, `${sourceName}の手札破棄：${target.name}の手札は効果を受けなかった。`)
            return
        }
        // chooserIsSource の選択から戻ってきた：公開ゾーンから1枚をトラッシュへ、**残りは手札へ戻す**。
        // 公開ゾーンは手札からカードを移して作る（コピーではない）。コピーにすると
        // 同じカードが手札と公開ゾーンに二重に数えられ、保存則チェックが落ちる
        if (action.chooserIsSource && chosenCardIndex !== undefined) {
            const revealed = state.revealedCards
            if (!revealed) return
            const cardId = revealed.cardIds[chosenCardIndex]
            const rest = revealed.cardIds.filter((_, i) => i !== chosenCardIndex)
            delete state.revealedCards
            target.hand.push(...rest)
            if (cardId === undefined) {
                log(state, `${sourceName}の手札破棄：対象がいなかった。`)
                return
            }
            target.trashCards.push(cardId)
            log(state, `${target.name}は手札「${getCard(cardId).name}」を破棄した。`)
            tryFreeSummonOnHandDiscard(state, targetPid, cardId, srcType, owner)
            return
        }
        if (chosenCardIndex !== undefined) {
            const cardId = target.hand[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}の手札破棄：対象がいなかった。`)
                return
            }
            target.hand.splice(chosenCardIndex, 1)
            target.trashCards.push(cardId)
            log(state, `${target.name}は手札「${getCard(cardId).name}」を破棄した。`)
            // BS09-025忍者サルトベ：相手のスピリットの効果で破棄されたカード自身が召喚できる
            tryFreeSummonOnHandDiscard(state, targetPid, cardId, srcType, owner)
            return
        }
        if (target.hand.length === 0) {
            log(state, `${sourceName}の手札破棄：${target.name}の手札がなかった。`)
            revealAllHandFallback()
            return
        }
        // cardTypeFilter（BS08関将龍皇ドラグロン：相手の手札を見てスピリットカード1枚を破棄）：
        // このカード種別のカードだけを候補にする。該当がなければ不発
        const matchesType = (cardId: string): boolean =>
            action.cardTypeFilter === undefined || getCard(cardId).type === action.cardTypeFilter
        // random 指定時は**誰も選ばない**。効果文「自分は、相手の手札1枚を内容を見ないで破棄する」は
        // 自分も相手も中身を見ないので、選択式にすると相手が不要牌を差し出せてしまう
        // （髑髏騎士ズ・ガイン／巨猫ブリンクス。2026-08-17 ユーザー確認）
        if (action.random) {
            const discardedRandom: string[] = []
            for (let i = 0; i < action.count; i++) {
                const indices = target.hand.map((_, j) => j).filter((j) => matchesType(target.hand[j]!))
                const pick = indices[Math.floor(Math.random() * indices.length)]
                if (pick === undefined) break
                const [cardId] = target.hand.splice(pick, 1)
                if (cardId === undefined) break
                target.trashCards.push(cardId)
                discardedRandom.push(getCard(cardId).name)
                // BS09-025忍者サルトベ：相手のスピリットの効果で破棄されたカード自身が召喚できる
                tryFreeSummonOnHandDiscard(state, targetPid, cardId, srcType, owner)
            }
            if (discardedRandom.length === 0) {
                log(state, `${sourceName}の手札破棄：対象になるカードがなかった。`)
                return
            }
            log(state, `${target.name}は手札「${discardedRandom.join("、")}」をランダムに破棄した。`)
            return
        }
        // chooserIsSource：効果文が「自分は相手の**手札すべてを見て**、その中の◯◯カード1枚を破棄する」。
        // 選ぶのは発生源の持ち主なので、相手の手札を公開ゾーンへ載せて自分に選ばせる
        // （相手は自分の手札を既に知っているため、公開しても情報は漏れない。2026-08-17 ユーザー確認）
        if (action.chooserIsSource) {
            const eligible = target.hand.map((_, i) => i).filter((i) => matchesType(target.hand[i]!))
            if (eligible.length === 0) {
                log(state, `${sourceName}の手札破棄：対象になるカードがなかった。`)
                return
            }
            if (state.interactiveTargets) {
                // 効果文どおり**手札すべて**を見せる（選べるのは該当種別だけ＝cardIndices で絞る）。
                // カードは手札から公開ゾーンへ**移す**（選択後に、選ばれた1枚以外を手札へ戻す）
                state.revealedCards = { pid: targetPid, cardIds: [...target.hand] }
                target.hand = []
                requestCardChoice(
                    state,
                    owner,
                    `${sourceName}：${target.name}の手札から破棄するカードを選んでください`,
                    "reveal",
                    eligible,
                    false,
                    { ...action, forcedTargetPid: targetPid },
                    self,
                )
                return
            }
            // 非対話：自分が選ぶので**自分に有利な1枚**＝該当カードのうちコスト最大を落とす（決定的簡略化）
            let best = eligible[0]!
            for (const i of eligible) {
                if (getCard(target.hand[i]!).cost > getCard(target.hand[best]!).cost) best = i
            }
            const [cardId] = target.hand.splice(best, 1)
            if (cardId === undefined) return
            target.trashCards.push(cardId)
            log(state, `${target.name}は手札「${getCard(cardId).name}」を破棄した。`)
            tryFreeSummonOnHandDiscard(state, targetPid, cardId, srcType, owner)
            return
        }
        if (state.interactiveTargets) {
            const indices = target.hand.map((_, i) => i).filter((i) => matchesType(target.hand[i]!))
            if (indices.length === 0) {
                log(state, `${sourceName}の手札破棄：対象になるカードがなかった。`)
                revealAllHandFallback()
                return
            }
            if (
                tryInteractiveCardChoice(
                    state,
                    targetPid,
                    self,
                    `${sourceName}の手札破棄：破棄するカードを選んでください`,
                    "hand",
                    indices,
                    { type: "discardOpponent", count: 1, forcedTargetPid: targetPid },
                    action.count > 1
                        ? {
                              type: "discardOpponent",
                              count: action.count - 1,
                              forcedTargetPid: targetPid,
                              ...(action.cardTypeFilter !== undefined ? { cardTypeFilter: action.cardTypeFilter } : {}),
                          }
                        : null,
                )
            ) {
                return
            }
        }
        // 既存の決定的自動選択：本来は相手が選ぶが、簡略化して手札末尾からcount枚を破棄する
        // （cardTypeFilter指定時は末尾から見て最初に一致した1枚を破棄する）
        const discarded: string[] = []
        for (let i = 0; i < action.count; i++) {
            const idx = (() => {
                for (let j = target.hand.length - 1; j >= 0; j--) {
                    if (matchesType(target.hand[j]!)) return j
                }
                return -1
            })()
            if (idx === -1) break
            const [cardId] = target.hand.splice(idx, 1)
            if (cardId === undefined) break
            target.trashCards.push(cardId)
            discarded.push(getCard(cardId).name)
            // BS09-025忍者サルトベ：相手のスピリットの効果で破棄されたカード自身が召喚できる
            tryFreeSummonOnHandDiscard(state, targetPid, cardId, srcType, owner)
        }
        if (discarded.length === 0) {
            log(state, `${sourceName}の手札破棄：対象になるカードがなかった。`)
            revealAllHandFallback()
            return
        }
        log(
            state,
            `${target.name}は手札「${discarded.join("、")}」を破棄した。`,
        )
        return
}

// 「内容を見ないで選ぶ」＝誰も選ばないランダム（決定的簡略化をしない。SEMANTICS_AUDIT.md §3.14）。
// discardOpponent の random+cardTypeFilter とは違い、**候補をマジックに絞ってから選ばない**
// （フィルタしてから選ぶと必ずマジックが当たってしまい、印刷テキストの「内容を見ないで」に反する）
const randomOpponentHandMagicDiscardHandler: ActionHandler<"randomOpponentHandMagicDiscard"> = (ctx) => {
    const { state, owner, opp, sourceName, srcType } = ctx
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, opp)) {
        log(state, `${state.players[opp].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
    const target = state.players[opp]
    if (target.hand.length === 0) {
        log(state, `${sourceName}：${target.name}の手札がなかった。`)
        return
    }
    const pick = Math.floor(Math.random() * target.hand.length)
    const cardId = target.hand[pick]!
    if (getCard(cardId).type === "magic") {
        target.hand.splice(pick, 1)
        target.trashCards.push(cardId)
        log(state, `${sourceName}：${target.name}の手札から内容を見ないで選んだ「${getCard(cardId).name}」はマジックカードだったため破棄した。`)
        // BS09-025忍者サルトベ：相手のスピリットの効果で破棄されたカード自身が召喚できる
        tryFreeSummonOnHandDiscard(state, opp, cardId, srcType, owner)
    } else {
        log(state, `${sourceName}：${target.name}の手札から内容を見ないで選んだ「${getCard(cardId).name}」はマジックカードではなかったため、そのまま手札に残った。`)
    }
    return
}



const discardSelfOneHandler: ActionHandler<"discardSelfOne"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, owner)) {
        log(state, `${state.players[owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
        // 自分の手札1枚をトラッシュへ（手札0ならno-op）。
        // interactiveTargets時は選択式（選択者＝効果所有者本人。cardZone:"hand"）
        const player = state.players[owner]
        if (chosenCardIndex !== undefined) {
            const cardId = player.hand[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}の手札破棄：対象がいなかった。`)
                return
            }
            player.hand.splice(chosenCardIndex, 1)
            player.trashCards.push(cardId)
            log(state, `${player.name}は手札から${getCard(cardId).name}を破棄した。`)
            return
        }
        if (player.hand.length === 0) {
            log(state, `${sourceName}の手札破棄：手札がなかった。`)
            return
        }
        if (state.interactiveTargets) {
            const indices = player.hand.map((_, i) => i)
            if (
                tryInteractiveCardChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}の手札破棄：破棄するカードを選んでください`,
                    "hand",
                    indices,
                    { type: "discardSelfOne" },
                    null,
                )
            ) {
                return
            }
        }
        // 既存の決定的自動選択（テスト等 interactiveTargets=false）：手札末尾1枚を破棄
        const cardId = player.hand.pop()
        if (cardId === undefined) {
            log(state, `${sourceName}の手札破棄：手札がなかった。`)
            return
        }
        player.trashCards.push(cardId)
        log(state, `${player.name}は手札から${getCard(cardId).name}を破棄した。`)
        return
}

// pay.ts の判定表からも使う
// 「自分の手札discardCount枚を破棄することで、自分はデッキからdrawCount枚ドローする」
// （BS10-019土星神龍クロノ・ボロス）。COST_MODEL.md §1：コストと効果の両方が完全に解決できる
// ときだけ発揮できる＝手札がdiscardCount枚未満なら不発（部分的に破棄しない）。
// discardCountは「残り破棄枚数」を持ち回る内部利用も兼ねる（1枚選ぶたびに-1して再入）
// 手札の指定種別1枚を破棄することで、相手のスピリットのコアを取り除く（BS11-075 トーテンタンツ）。
// コストと本体の両方が完全に解決できるときだけ発揮する（COST_MODEL.md §1）




// BS09-055転生の谷Lv1-2：自分の手札にある【転召】持ちスピリットカード1枚を破棄することで、
// ドローの枚数を+1する。手札に該当が無ければ**何も起きない**（払えないコストは発揮できない。COST_MODEL.md §1）



const handlers = {
    draw: drawHandler,
    discardHandAll: discardHandAllHandler,
    discardOpponent: discardOpponentHandler,
    randomOpponentHandMagicDiscard: randomOpponentHandMagicDiscardHandler,
    noop: noopHandler,
    discardSelfOne: discardSelfOneHandler,
} satisfies Partial<ActionRegistry>

export default handlers
