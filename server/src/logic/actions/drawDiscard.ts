// ドローと手札破棄アクションのハンドラ（noop を含む）
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { EffectAction, GameState, PlayerId } from "../../type"
import { draw, getCard, log, opponentOf, pushResumeFrames } from "../GameState"
import { tryFreeSummonOnHandDiscard, bothSidesPids, countEffectCounter, drawDoubleMultiplier, findSpiritAny, handImmuneFor, requestCardChoice, requestChoice, resolveAction, spiritHasFamily, tryInteractiveCardChoice } from "../EffectModules"
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
        const count =
            action.countCounter !== undefined
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

const drawUpToHandler: ActionHandler<"drawUpTo"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
        // フォースドロー：自分の手札がsize枚になるまでデッキから引く（既にsize枚以上ならno-op）
        const player = state.players[owner]
        const need = action.size - player.hand.length
        if (need <= 0) {
            log(state, `${sourceName}：手札がすでに${action.size}枚以上のためドローしなかった。`)
            return
        }
        draw(state, owner, need)
        return
}


type DiscardAction = Extract<EffectAction, { type: "discard" }>

// side:"both" は自分→相手の順に各自が自分で選ぶ。自分側が選択待ちに入ったら相手側は再開スタックへ回す
// （外側から積むので、自分の残り枚数のフレームより後に実行される）
function discardBothHands(ctx: ActionCtx, action: DiscardAction): void {
    const { state, owner, opp, self, srcType } = ctx
    const pids = bothSidesPids(state, srcType)
    for (const pid of [owner, opp]) {
        if (!pids.includes(pid)) continue
        if (action.count === "all" ? state.players[pid].hand.length === 0 : (action.count ?? 1) <= 0) continue
        const one: EffectAction = { type: "discard", from: "hand", side: "own", count: action.count ?? 1 }
        if (state.pendingChoice) {
            pushResumeFrames(state, [{ kind: "action", selfInstanceId: self ? self.instanceId : null, action: one, actorPid: pid }])
            return
        }
        resolveAction(state, pid, self, one)
    }
}

function discardBurstOf(state: GameState, pid: PlayerId, sourceName: string): void {
    const player = state.players[pid]
    const cardId = player.burst
    if (cardId === null) {
        recordMoved(state, [])
        log(state, `${sourceName}：${player.name}はバーストをセットしていなかった。`)
        return
    }
    player.burst = null
    player.burstSet = false
    player.trashCards.push(cardId)
    recordMoved(state, [cardId])
    log(state, `${sourceName}：${player.name}のバーストを破棄した。`)
}

function discardTegamotoOf(state: GameState, pid: PlayerId, sourceName: string): void {
    const target = state.players[pid]
    const ids = [...target.tegamoto]
    recordMoved(state, ids)
    if (ids.length === 0) {
        log(state, `${sourceName}：${target.name}の手元にカードがなかった。`)
        return
    }
    target.trashCards.push(...ids)
    target.tegamoto = []
    target.tegamotoPlayable = [] // 手元が空になるので使用権も残さない
    log(state, `${sourceName}：${target.name}の手元「${ids.map((id) => getCard(id).name).join("、")}」を破棄した。`)
}

const discardHandler: ActionHandler<"discard"> = (ctx, action) => {
    const { state, owner, opp, self, srcType, srcColors, sourceName } = ctx
    // countCounter は枚数に直してから入り直す（side:"both" の各自にも同じ枚数）
    if (action.countCounter !== undefined) {
        const n = countedAmount(state, owner, self, typeof action.count === "number" ? action.count : 1, action.countCounter, srcType)
        if (n <= 0) {
            log(state, `${sourceName}：カウントが0のため発動しなかった。`)
            return
        }
        const { countCounter: _cc, ...rest } = action
        ctx.resolve({ ...rest, count: n }, { sourceType: srcType, sourceColors: srcColors })
        return
    }
    if (action.from === "hand") {
        if (action.side === "both") discardBothHands(ctx, action)
        else discardHand(ctx, action)
        return
    }
    const sides = action.side === "both" ? bothSidesPids(state, srcType) : [action.side === "own" ? owner : opp]
    for (const pid of [owner, opp]) {
        if (!sides.includes(pid)) continue
        if (action.from === "burst") discardBurstOf(state, pid, sourceName)
        else discardTegamotoOf(state, pid, sourceName)
    }
}

function discardHand(ctx: ActionCtx, action: DiscardAction): void {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId, chosenCardIndex } = ctx
    const targetPid = action.forcedTargetPid ?? (action.side === "own" ? owner : opp)
    const target = state.players[targetPid]
    if (action.downTo !== undefined) {
        const n = target.hand.length - action.downTo
        if (n <= 0) log(state, `${sourceName}：${target.name}の手札は${action.downTo}枚以下のため発動しなかった。`)
        else { const { downTo: _, ...rest } = action; ctx.resolve({ ...rest, count: n }, { sourceType: srcType, sourceColors: srcColors }) }
        return
    }
    // countAttackerSymbols：countを無視し、targetInstanceIdが指すスピリット（fieldEvent ownLifeDamaged が渡すアタッカー）の
    // シンボル数を枚数にして入り直す
    if (action.countAttackerSymbols) {
        const attacker = targetInstanceId ? findSpiritAny(state, targetInstanceId) : null
        const { countAttackerSymbols: _cas, ...rest } = action
        ctx.resolve({ ...rest, count: attacker ? instanceSymbolCount(attacker.inst) : 0 }, { sourceType: srcType, sourceColors: srcColors })
        return
    }
    // forcedTargetPid＝選択式の再突入。選択者は破棄される本人で、再突入時の owner は pending.pid になり元の効果所有者を指さないため、
    // 対象プレイヤーは最初に action へ固定して持ち回る
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
        if (action.count === "all") {
            const ids = [...target.hand]
            recordMoved(state, ids)
            if (ids.length === 0) {
                log(state, `${sourceName}：手札がないため破棄しなかった。`)
                return
            }
            target.trashCards.push(...ids)
            target.hand = []
            log(state, `${target.name}は手札${ids.length}枚をすべて破棄した。`)
            if (targetPid !== owner) for (const id of ids) tryFreeSummonOnHandDiscard(state, targetPid, id, srcType, owner)
            return
        }
        const count = action.count ?? 1
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
            recordMoved(state, [cardId])
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
            recordMoved(state, [cardId])
            log(state, `${target.name}は手札「${getCard(cardId).name}」を破棄した。`)
            // BS09-025忍者サルトベ：相手のスピリットの効果で破棄されたカード自身が召喚できる
            tryFreeSummonOnHandDiscard(state, targetPid, cardId, srcType, owner)
            return
        }
        if (count <= 0) {
            recordMoved(state, [])
            return
        }
        if (target.hand.length === 0) {
            recordMoved(state, [])
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
            const discardedIds: string[] = []
            for (let i = 0; i < count; i++) {
                const indices = target.hand.map((_, j) => j).filter((j) => matchesType(target.hand[j]!))
                const pick = indices[Math.floor(Math.random() * indices.length)]
                if (pick === undefined) break
                const [cardId] = target.hand.splice(pick, 1)
                if (cardId === undefined) break
                target.trashCards.push(cardId)
                discardedIds.push(cardId)
                discardedRandom.push(getCard(cardId).name)
                // BS09-025忍者サルトベ：相手のスピリットの効果で破棄されたカード自身が召喚できる
                tryFreeSummonOnHandDiscard(state, targetPid, cardId, srcType, owner)
            }
            recordMoved(state, discardedIds)
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
                    { ...action, count, forcedTargetPid: targetPid },
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
            recordMoved(state, [cardId])
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
                    { type: "discard", from: "hand", side: action.side, count: 1, forcedTargetPid: targetPid },
                    count > 1
                        ? {
                              type: "discard",
                              from: "hand",
                              side: action.side,
                              count: count - 1,
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
        const discardedIds: string[] = []
        for (let i = 0; i < count; i++) {
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
            discardedIds.push(cardId)
            discarded.push(getCard(cardId).name)
            // BS09-025忍者サルトベ：相手のスピリットの効果で破棄されたカード自身が召喚できる
            tryFreeSummonOnHandDiscard(state, targetPid, cardId, srcType, owner)
        }
        recordMoved(state, discardedIds)
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
    drawUpTo: drawUpToHandler,
    discard: discardHandler,
    randomOpponentHandMagicDiscard: randomOpponentHandMagicDiscardHandler,
    noop: noopHandler,
} satisfies Partial<ActionRegistry>

export default handlers
