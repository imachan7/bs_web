import type { ActionHandler, ActionRegistry } from "./types"
import type { EffectAction } from "../../type"
import { draw, getCard, log, opponentOf, pushResumeFrames } from "../GameState"
import { tryFreeSummonOnHandDiscard, bothSidesPids, countEffectCounter, destroySpirit, drawDoubleMultiplier, findSpiritAny, handImmuneFor, requestCardChoice, requestChoice, spiritHasFamily, tryInteractiveCardChoice } from "../EffectModules"
import { KEYWORDS, canDiscardHand, instanceSymbolCount, matchesFamilyFilter, hasGlobalConstraint, hasKeyword } from "../../../../shared/rules"

const noopHandler: ActionHandler<"noop"> = () => {
    // 何もしない（PendingChoice.magicNegate のプレースホルダ）
}

const drawHandler: ActionHandler<"draw"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcType, targetInstanceId } = ctx
        // BS15共通器：globalConstraint "noHandGainByEffect" が効いている間は、ドロー効果自体が
        // 発揮されない（お互い。BS15-052天蒼元帥チョウハッカイ）
        if (hasGlobalConstraint(state, "noHandGainByEffect")) {
            log(state, `${sourceName}：効果によって手札が増やせないため発動しなかった。`)
            return
        }
        // costDiscardOwnHandOne（BS15-040ネコマーダ）：自分の手札1枚（末尾＝決定的簡略化）を
        // 破棄することがコスト。手札0枚なら不発
        if (action.costDiscardOwnHandOne) {
            const player = state.players[owner]
            if (player.hand.length === 0) {
                log(state, `${sourceName}：破棄できる手札がないため発動しなかった。`)
                return
            }
            const cardId = player.hand.pop()!
            player.trashCards.push(cardId)
            log(state, `${player.name}は${sourceName}のコストとして手札1枚を破棄した。`)
            const { costDiscardOwnHandOne: _cdoh, ...rest } = action
            ctx.resolve(rest)
            return
        }
        // costDestroyOwnFamily（BS13-X02蛇皇神帝アスクレピオーズ）：指定系統の自分のスピリット1体を
        // 破壊することがコスト。破壊できる対象がいなければ不発（COST_MODEL.md §1）。
        // 何を犠牲にするかは候補2体以上ならプレイヤーが選ぶ（§2。summonFromHandFreeと同じ考え方）
        if (action.costDestroyOwnFamily !== undefined) {
            const player = state.players[owner]
            const sacrifices = player.field.spirits.filter((s) =>
                matchesFamilyFilter(state, owner, s, action.costDestroyOwnFamily!),
            )
            if (sacrifices.length === 0) {
                log(state, `${sourceName}：コストにできるスピリットがいないため発動しなかった。`)
                return
            }
            const { costDestroyOwnFamily: _paid, costSacrificeChosen: _flag, ...rest } = action
            if (action.costSacrificeChosen && targetInstanceId !== undefined) {
                const chosen = sacrifices.find((s) => s.instanceId === targetInstanceId)
                if (!chosen) {
                    log(state, `${sourceName}：指定されたスピリットはコストにできなかった。`)
                    return
                }
                log(state, `${player.name}は${sourceName}のコストとして${getCard(chosen.cardId).name}を破壊した。`)
                destroySpirit(state, owner, chosen.instanceId, "destroy", undefined)
                ctx.resolve(rest)
                return
            }
            if (state.interactiveTargets && sacrifices.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コストとして破壊する自分のスピリットを選んでください`,
                    sacrifices.map((s) => s.instanceId),
                    false,
                    { ...action, costSacrificeChosen: true },
                    self,
                )
                return
            }
            const victim = sacrifices[0]!
            log(state, `${player.name}は${sourceName}のコストとして${getCard(victim.cardId).name}を破壊した。`)
            destroySpirit(state, owner, victim.instanceId, "destroy", undefined)
            ctx.resolve(rest)
            return
        }
        // costSkipCoreStep：「ボイドからコアを自分のリザーブに置かないことで」＝そのコアステップの
        // コア置きを支払いに使う（step.beforeStepAction と対。BS10-087戦場に息づく命）。
        // コア置き区間がこのフラグを見て置かずに進む
        if (action.costSkipCoreStep === true) state.coreStepSkipped = true
        // countCounter（BS12-053オオヅツナナフシ：「相手の手札と同じ枚数」）：countを無視しEffectCounterの値を枚数とする
        const count =
            action.countCounter !== undefined
                ? countEffectCounter(state, owner, self, action.countCounter, srcType)
                : action.count
        if (action.countCounter !== undefined && count === 0) {
            log(state, `${sourceName}：カウントが0のためドローしなかった。`)
            return
        }
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
        return
}

const drawPerHandler: ActionHandler<"drawPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const count = countEffectCounter(state, owner, self, action.counter, srcType)
        if (count === 0) {
            log(state, `${sourceName}の可変ドロー：カウントが0のためドローしなかった。`)
            return
        }
        draw(state, owner, count * drawDoubleMultiplier(state, owner))
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
            return
        }
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

const discardOpponentDownToHandler: ActionHandler<"discardOpponentDownTo"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 奇術師オリバー：相手の手札がlimit枚を超えている場合のみ、limit枚になるまで破棄する
        const count = state.players[opp].hand.length - action.limit
        if (count <= 0) {
            log(state, `${sourceName}：相手の手札は${action.limit}枚以下のため発動しなかった。`)
            return
        }
        ctx.resolve({ type: "discardOpponent", count })
        return
}

const discardSelfDownToHandler: ActionHandler<"discardSelfDownTo"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    // BS14-089爆発する海底火山：自分の手札がlimit枚を超えている場合のみ、limit枚になるまで破棄する
    const count = state.players[owner].hand.length - action.limit
    if (count <= 0) {
        log(state, `${sourceName}：自分の手札は${action.limit}枚以下のため発動しなかった。`)
        return
    }
    ctx.resolve({ type: "discardSelfChoose", count })
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

// 自分の手札から count 枚を破棄する。実対戦（interactiveTargets）では1枚ずつ選ばせ、
// 残りぶんを queue に積んで同じアクションへ戻ってくる（discardSelfOne の選択機構を count 回ぶん繰り返す形）。
// 非interactive時は既存の決定的簡略化に合わせて手札の末尾から順に破棄する
// discardSelfChoose の cardType/keyword 絞り込み一致判定。両方省略時は手札全カードが対象（従来どおり）。
// pay.ts の判定表からも使う
export const discardSelfChooseEligible = (cardId: string, action: Extract<EffectAction, { type: "discardSelfChoose" }>): boolean => {
    if (action.cardType !== undefined) {
        const wanted = Array.isArray(action.cardType) ? action.cardType : [action.cardType]
        if (!wanted.includes(getCard(cardId).type)) return false
    }
    if (action.keyword !== undefined) {
        const wanted = Array.isArray(action.keyword) ? action.keyword : [action.keyword]
        if (!wanted.some((kw) => hasKeyword(cardId, kw))) return false
    }
    return true
}

const discardSelfChooseHandler: ActionHandler<"discardSelfChoose"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    if (action.count <= 0) return
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, owner)) {
        log(state, `${state.players[owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
    // 選択の解決から戻ってきた場合：選ばれた1枚を破棄する（残りは queue 側が処理する）
    if (chosenCardIndex !== undefined) {
        const cardId = player.hand[chosenCardIndex]
        if (cardId === undefined || !discardSelfChooseEligible(cardId, action)) {
            log(state, `${sourceName}の手札破棄：対象がいなかった。`)
            return
        }
        player.hand.splice(chosenCardIndex, 1)
        player.trashCards.push(cardId)
        log(state, `${player.name}は手札から${getCard(cardId).name}を破棄した。`)
        return
    }
    const indices = player.hand.map((_, i) => i).filter((i) => discardSelfChooseEligible(player.hand[i]!, action))
    if (indices.length === 0) {
        log(state, `${sourceName}の手札破棄：手札がなかった。`)
        return
    }
    if (state.interactiveTargets) {
        if (
            tryInteractiveCardChoice(
                state,
                owner,
                self,
                `${sourceName}の手札破棄：破棄するカードを選んでください（残り${action.count}枚）`,
                "hand",
                indices,
                { type: "discardSelfChoose", count: 1, ...(action.cardType !== undefined ? { cardType: action.cardType } : {}), ...(action.keyword !== undefined ? { keyword: action.keyword } : {}) },
                action.count > 1
                    ? {
                          type: "discardSelfChoose",
                          count: action.count - 1,
                          ...(action.cardType !== undefined ? { cardType: action.cardType } : {}),
                          ...(action.keyword !== undefined ? { keyword: action.keyword } : {}),
                      }
                    : null,
            )
        ) {
            return
        }
    }
    // 決定的自動選択（テスト等）：条件に合う候補の末尾から count 枚を破棄する
    for (let i = 0; i < action.count; i++) {
        const at = indices.pop()
        if (at === undefined) {
            log(state, `${sourceName}の手札破棄：手札がなかった。`)
            return
        }
        const cardId = player.hand[at]!
        player.hand.splice(at, 1)
        player.trashCards.push(cardId)
        log(state, `${player.name}は手札から${getCard(cardId).name}を破棄した。`)
    }
}

// 「自分の手札discardCount枚を破棄することで、自分はデッキからdrawCount枚ドローする」
// （BS10-019土星神龍クロノ・ボロス）。COST_MODEL.md §1：コストと効果の両方が完全に解決できる
// ときだけ発揮できる＝手札がdiscardCount枚未満なら不発（部分的に破棄しない）。
// discardCountは「残り破棄枚数」を持ち回る内部利用も兼ねる（1枚選ぶたびに-1して再入）
// 手札の指定種別1枚を破棄することで、相手のスピリットのコアを取り除く（BS11-075 トーテンタンツ）。
// コストと本体の両方が完全に解決できるときだけ発揮する（COST_MODEL.md §1）
const costDiscardHandTypeThenCoreRemoveHandler: ActionHandler<"costDiscardHandTypeThenCoreRemove"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, owner)) {
        log(state, `${state.players[owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
    // 選択の解決から戻ってきた場合：選ばれた1枚を破棄する（コア除去は remainingAction 側）
    if (chosenCardIndex !== undefined) {
        const cardId = player.hand[chosenCardIndex]
        if (cardId === undefined) {
            log(state, `${sourceName}：コストとして破棄する手札がなかった。`)
            return
        }
        player.hand.splice(chosenCardIndex, 1)
        player.trashCards.push(cardId)
        log(state, `${player.name}は${sourceName}のコストとして手札から${getCard(cardId).name}を破棄した。`)
        return
    }
    const indices = player.hand
        .map((cardId, i) => ({ cardId, i }))
        .filter(({ cardId }) => cardId !== undefined && action.cardTypes.includes(getCard(cardId).type))
        .map(({ i }) => i)
    if (indices.length === 0) {
        log(state, `${sourceName}：コストにできる手札がないため発動しなかった。`)
        return
    }
    const coreRemove: EffectAction = { type: "coreRemove", count: action.count }
    if (
        state.interactiveTargets &&
        tryInteractiveCardChoice(
            state,
            owner,
            self,
            `${sourceName}：コストとして破棄するカードを選んでください`,
            "hand",
            indices,
            { type: "costDiscardHandTypeThenCoreRemove", cardTypes: action.cardTypes, count: action.count },
            coreRemove,
        )
    ) {
        return
    }
    // 決定的自動選択：候補の末尾を破棄する
    const at = indices[indices.length - 1]!
    const cardId = player.hand[at]!
    player.hand.splice(at, 1)
    player.trashCards.push(cardId)
    log(state, `${player.name}は${sourceName}のコストとして手札から${getCard(cardId).name}を破棄した。`)
    ctx.resolve(coreRemove, {})
}

const costDiscardHandThenDrawHandler: ActionHandler<"costDiscardHandThenDraw"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, owner)) {
        log(state, `${state.players[owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
    // 選択の解決から戻ってきた場合：選ばれた1枚を破棄する（残り／ドローは remainingAction 側が処理する）
    if (chosenCardIndex !== undefined) {
        const cardId = player.hand[chosenCardIndex]
        if (cardId === undefined) {
            log(state, `${sourceName}：コストとして破棄する手札がなかった。`)
            return
        }
        player.hand.splice(chosenCardIndex, 1)
        player.trashCards.push(cardId)
        log(state, `${player.name}は${sourceName}のコストとして手札から${getCard(cardId).name}を破棄した。`)
        return
    }
    // ①コストを完全に払えるときだけ発揮できる（COST_MODEL.md §1）
    if (player.hand.length < action.discardCount) {
        log(state, `${sourceName}：手札が${action.discardCount}枚に満たないため発動しなかった。`)
        return
    }
    if (state.interactiveTargets) {
        const indices = player.hand.map((_, i) => i)
        if (
            tryInteractiveCardChoice(
                state,
                owner,
                self,
                `${sourceName}：コストとして破棄するカードを選んでください（残り${action.discardCount}枚）`,
                "hand",
                indices,
                { type: "costDiscardHandThenDraw", discardCount: 1, drawCount: action.drawCount },
                action.discardCount > 1
                    ? { type: "costDiscardHandThenDraw", discardCount: action.discardCount - 1, drawCount: action.drawCount }
                    : { type: "draw", count: action.drawCount },
            )
        ) {
            return
        }
    }
    // 決定的自動選択：手札末尾から discardCount 枚を破棄してからドロー
    for (let i = 0; i < action.discardCount; i++) {
        const cardId = player.hand.pop()
        if (cardId === undefined) break
        player.trashCards.push(cardId)
    }
    draw(state, owner, action.drawCount)
    log(state, `${sourceName}：手札${action.discardCount}枚を破棄し、自分はデッキから${action.drawCount}枚ドローした。`)
}

// BS13-044吟遊詩人のオルフェ：自分の手札1枚を破棄することで、相手の手札すべてを見て、
// その中のマジックカード1枚を破棄する（COST_MODEL.md §1：自分の手札1枚以上・相手の手札にマジック1枚以上の
// 両方が揃うときだけ発揮する）。costDiscardHandThenDrawの兄弟だが、効果側は discardOpponent への委譲
const costDiscardHandThenDiscardOpponentMagicHandler: ActionHandler<"costDiscardHandThenDiscardOpponentMagic"> = (ctx) => {
    const { state, owner, opp, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, owner)) {
        log(state, `${state.players[owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
    // 選択の解決から戻ってきた場合：選ばれた1枚を自分のコストとして破棄し、相手の手札破棄へ委譲する
    if (chosenCardIndex !== undefined) {
        const cardId = player.hand[chosenCardIndex]
        if (cardId === undefined) {
            log(state, `${sourceName}：コストとして破棄する手札がなかった。`)
            return
        }
        player.hand.splice(chosenCardIndex, 1)
        player.trashCards.push(cardId)
        log(state, `${player.name}は${sourceName}のコストとして手札から${getCard(cardId).name}を破棄した。`)
        ctx.resolve({ type: "discardOpponent", count: 1, cardTypeFilter: "magic", chooserIsSource: true })
        return
    }
    // ①コストとBの両方が完全に解決できるときだけ発揮できる（COST_MODEL.md §1）：
    // 自分の手札が1枚以上、かつ相手の手札にマジックカードが1枚以上
    if (player.hand.length < 1 || !state.players[opp].hand.some((id) => getCard(id).type === "magic")) {
        log(state, `${sourceName}：条件を満たさないため発動しなかった。`)
        return
    }
    if (
        tryInteractiveCardChoice(
            state,
            owner,
            self,
            `${sourceName}：コストとして破棄するカードを選んでください`,
            "hand",
            player.hand.map((_, i) => i),
            { type: "costDiscardHandThenDiscardOpponentMagic" },
            null,
        )
    ) {
        return
    }
    // 決定的自動選択：手札末尾を破棄してから相手の手札破棄へ委譲
    const cardId = player.hand.pop()
    if (cardId !== undefined) {
        player.trashCards.push(cardId)
        log(state, `${player.name}は${sourceName}のコストとして手札から${getCard(cardId).name}を破棄した。`)
    }
    ctx.resolve({ type: "discardOpponent", count: 1, cardTypeFilter: "magic", chooserIsSource: true })
}

// 機織のハーフェレシテLv1：手札のネクサスカード1枚の破棄をコストに、ボイドからコアを自身へ置く。
// どのネクサスを捨てるかは手札の先頭側に固定した決定的簡略化（「できる」の任意性は step.optional 側で扱う）
const discardHandNexusToVoidCoreSelfHandler: ActionHandler<"discardHandNexusToVoidCoreSelf"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    if (!self) return
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, owner)) {
        log(state, `${state.players[owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
    const player = state.players[owner]
    const nexusIndices = player.hand.map((id, i) => ({ id, i })).filter(({ id }) => getCard(id).type === "nexus").map(({ i }) => i)
    if (nexusIndices.length === 0) {
        log(state, `${sourceName}：手札にネクサスカードがなかった。`)
        return
    }
    // どのネクサスカードを破棄するかは持ち主が選ぶ（2026-09-02。PROCEDURES_AUDIT §5 の一般則）
    if (
        chosenCardIndex === undefined &&
        tryInteractiveCardChoice(
            state,
            owner,
            self,
            `${sourceName}：破棄するネクサスカードを選んでください`,
            "hand",
            nexusIndices,
            action,
            null,
        )
    ) {
        return
    }
    // 非対話（テスト・AI）と候補1枚のとき：手札の先頭側から
    const index = chosenCardIndex !== undefined && nexusIndices.includes(chosenCardIndex) ? chosenCardIndex : nexusIndices[0]!
    const [cardId] = player.hand.splice(index, 1)
    if (cardId === undefined) return
    player.trashCards.push(cardId)
    self.cores += action.count
    log(
        state,
        `${player.name}は${sourceName}の効果で、手札の${getCard(cardId).name}を破棄してボイドからコア${action.count}個を置いた。`,
    )
}

// 手札のネクサスカードをすべて破棄し、破棄した枚数ぶんドローする（ネクサスレジスター）。
// 効果文は「好きなだけ破棄する」だが、枚数を選ばせず全部破棄する決定的簡略化にしてある
// （ドロー枚数が最大になる選択なので、プレイヤーの不利にはならない）
const discardHandNexusesThenDrawHandler: ActionHandler<"discardHandNexusesThenDraw"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, owner)) {
        log(state, `${state.players[owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
    const player = state.players[owner]
    const nexusIndices: number[] = []
    for (let i = 0; i < player.hand.length; i++) {
        if (getCard(player.hand[i]!).type === "nexus") nexusIndices.push(i)
    }
    if (nexusIndices.length === 0) {
        log(state, `${sourceName}：手札にネクサスカードがなかった。`)
        return
    }
    // 後ろから抜くとインデックスがずれない
    const discarded: string[] = []
    for (let i = nexusIndices.length - 1; i >= 0; i--) {
        const [cardId] = player.hand.splice(nexusIndices[i]!, 1)
        if (cardId === undefined) continue
        player.trashCards.push(cardId)
        discarded.push(getCard(cardId).name)
    }
    log(
        state,
        `${player.name}は${sourceName}の効果で、手札のネクサス${discarded.length}枚（${discarded.reverse().join("、")}）をすべて破棄した。（「好きなだけ」は全部破棄として処理）`,
    )
    draw(state, owner, discarded.length * drawDoubleMultiplier(state, owner))
}

// ドローしてから手札を破棄する（ストームドロー：3枚引いて2枚破棄）。
// 破棄は discardSelfChoose に委譲するので、実対戦では引いた後の手札から選べる
const drawThenDiscardHandler: ActionHandler<"drawThenDiscard"> = (ctx, action) => {
    const { state, owner } = ctx
    draw(state, owner, action.drawCount * drawDoubleMultiplier(state, owner))
    if (state.winner) return
    ctx.resolve({ type: "discardSelfChoose", count: action.discardCount })
}

// SD02-004 神獣ハクタク：系統を1つ選び、その系統を持つ自分のスピリット1体につき1枚引く。
// **発生源自身も数える**（効果文が「このスピリット以外の」と書いていない）。
// interactiveTargets 時は系統を選ばせ、非対話では引ける枚数が多い方を選ぶ決定的簡略化
const drawPerChosenFamilyHandler: ActionHandler<"drawPerChosenFamily"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenOption } = ctx
    const countFor = (family: string): number =>
        state.players[owner].field.spirits.filter((sp) => spiritHasFamily(state, owner, sp, family)).length
    if (action.families.length === 0) return
    if (chosenOption === undefined && state.interactiveTargets && action.families.length >= 2) {
        requestChoice(
            state,
            owner,
            `${sourceName}：数える系統を選んでください`,
            [],
            false,
            action,
            self,
            "option",
            [...action.families],
        )
        return
    }
    const family =
        chosenOption !== undefined && action.families.includes(chosenOption)
            ? chosenOption
            : [...action.families].reduce((best, f) => (countFor(f) > countFor(best) ? f : best))
    const count = countFor(family)
    if (count === 0) {
        log(state, `${sourceName}：系統「${family}」を持つ自分のスピリットがいなかった。`)
        return
    }
    log(state, `${sourceName}：系統「${family}」の自分のスピリット${count}体ぶん引く。`)
    ctx.resolve({ type: "draw", count })
}

// BS15-076妖華吸血爪フラッシュ：自分の手札を好きなだけ破棄する（0枚から選べる）。破棄した1枚につき、
// 相手のスピリット1体のコア1個を相手のトラッシュに置く（同じスピリットを何度選んでもよい＝2026-09-16
// ユーザー確認。実装は毎回coreRemoveの通常の対象選択に委譲するのでそれが自然に成り立つ）
const discardHandAnyThenCoreRemoveHandler: ActionHandler<"discardHandAnyThenCoreRemove"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    if (chosenCardIndex !== undefined) {
        const cardId = player.hand[chosenCardIndex]
        if (cardId === undefined) return
        player.hand.splice(chosenCardIndex, 1)
        player.trashCards.push(cardId)
        log(state, `${player.name}は${sourceName}のコストとして${getCard(cardId).name}を破棄した。`)
        pushResumeFrames(state, [
            { kind: "action", selfInstanceId: self ? self.instanceId : null, actorPid: owner, action: { type: "coreRemove", count: 1, dest: "trash" as const } },
            { kind: "action", selfInstanceId: self ? self.instanceId : null, actorPid: owner, action },
        ])
        return
    }
    if (!state.interactiveTargets) {
        // 非対話：手札をすべて破棄し、その枚数ぶんまとめて1体からコアを取り除く（決定的簡略化）
        const n = player.hand.length
        if (n === 0) return
        const names = player.hand.map((id) => getCard(id).name)
        player.trashCards.push(...player.hand)
        player.hand = []
        log(state, `${player.name}は${sourceName}のコストとして手札${n}枚（${names.join("、")}）を破棄した。`)
        ctx.resolve({ type: "coreRemove", count: n, dest: "trash" })
        return
    }
    if (player.hand.length === 0) return
    const indices = player.hand.map((_, i) => i)
    requestCardChoice(
        state,
        owner,
        `${sourceName}：破棄する手札を選んでください（これ以上破棄しない場合は選ばない）`,
        "hand",
        indices,
        true,
        action,
        self,
        true,
    )
}

// 自分の手札を好きなだけ破棄し、破棄したカード1枚につき自分がデッキから1枚ドローする
// （BS08堕天使ミカファール。coreRemovePerHandDiscardの「破棄1枚につき〜」をドローに差し替えた版）
// BS08堕天使ミカファール：手札を好きなだけ破棄し、破棄した枚数ぶんドローする。
// **破棄を全部済ませてからまとめてドローする**のが要点。1枚ごとにドローすると、
// 引いたカードをそのまま次の破棄対象にできてデッキが尽きるまで回せてしまう。
// 途中経過は action に持ち回る（discardedSoFar＝ここまでに破棄した枚数、
// awaitingSkip＝「選択をスキップして戻ってきた＝破棄終了」の目印）
const drawPerHandDiscardHandler: ActionHandler<"drawPerHandDiscard"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, owner)) {
        log(state, `${state.players[owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
        const player = state.players[owner]
        const discarded = action.discardedSoFar ?? 0
        // まとめてドローして終える共通処理
        const finish = (): void => {
            if (discarded === 0) {
                log(state, `${sourceName}：手札を破棄しなかった。`)
                return
            }
            log(state, `${sourceName}：破棄した${discarded}枚ぶんドローする。`)
            draw(state, owner, discarded)
        }
        if (chosenCardIndex !== undefined) {
            const cardId = player.hand[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}：破棄する手札がなかった。`)
                finish()
                return
            }
            player.hand.splice(chosenCardIndex, 1)
            player.trashCards.push(cardId)
            log(state, `${player.name}は手札の「${getCard(cardId).name}」を破棄した。`)
            // ここではドローしない。続けて破棄するか再度尋ねる
            // （awaitingSkip は落とす。付けたままだと「選択をスキップして戻ってきた」と誤読される）
            const { awaitingSkip: _dropped, ...rest } = action
            ctx.resolve({ ...rest, discardedSoFar: discarded + 1 })
            return
        }
        // スキップされて戻ってきた＝これ以上破棄しない。ここで初めてドローする
        if (action.awaitingSkip) {
            finish()
            return
        }
        if (state.interactiveTargets) {
            if (player.hand.length === 0) {
                // 手札を出し切った場合もここへ来る（破棄済みぶんはドローする）
                if (discarded === 0) log(state, `${sourceName}：手札がなかった。`)
                else finish()
                return
            }
            requestCardChoice(
                state,
                owner,
                `${sourceName}：破棄する手札を選んでください（選ばなければ終了してドローに移ります）`,
                "hand",
                player.hand.map((_, i) => i),
                true,
                { ...action, discardedSoFar: discarded, awaitingSkip: true },
                self,
                // 手札が1枚でも「破棄しない」を選べるようにする（「好きなだけ」なので0枚も選択肢）
                true,
                // スキップ＝破棄終了。まとめてドローするためにハンドラへ戻す
                true,
            )
            return
        }
        // 非interactive時：手札をすべて破棄し、破棄枚数ぶん一括でドローする（決定的簡略化）
        const count = player.hand.length
        if (count === 0) {
            log(state, `${sourceName}：手札がなかった。`)
            return
        }
        const discardedNames = player.hand.map((cardId) => getCard(cardId).name)
        player.trashCards.push(...player.hand)
        player.hand = []
        log(state, `${player.name}は手札「${discardedNames.join("、")}」を破棄した。`)
        draw(state, owner, count)
}

// BS09-039探偵ペンタンLv1-2：自分の手札の指定カード名1枚を破棄することで、相手の手札1枚を
// 「内容を見ないで選び」その内容だけを見る。盤面は動かない。
// **どの1枚を選ぶかは今のところ先頭で固定**（裏向きの相手手札を選ぶUIが未実装のため。
// 選び方が情報を持たない＝どれを選んでも公平なので、決定的にしても不利益はない）
const costDiscardNamedThenPeekHandler: ActionHandler<"costDiscardNamedThenPeek"> = (ctx, action) => {
    const { state, owner, opp, sourceName } = ctx
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, owner)) {
        log(state, `${state.players[owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
    const player = state.players[owner]
    const index = player.hand.findIndex((id) => getCard(id).name === action.cardName)
    if (index === -1) {
        log(state, `${sourceName}：手札に[${action.cardName}]がなく、発動しなかった。`)
        return
    }
    const target = state.players[opp]
    if (target.hand.length === 0) {
        log(state, `${sourceName}：${target.name}の手札がなく、発動しなかった。`)
        return
    }
    const paid = player.hand.splice(index, 1)[0]!
    player.trashCards.push(paid)
    log(state, `${player.name}はコストとして${getCard(paid).name}を破棄した。`)
    // 「内容を見ないで選ぶ」は**ランダム**（SEMANTICS_AUDIT.md §3.14。
    // 先頭固定にすると、見る側が並び順から内容を推測できてしまう）
    const peeked = target.hand[Math.floor(Math.random() * target.hand.length)]!
    if (!player.peekedOpponentCardIds) player.peekedOpponentCardIds = []
    player.peekedOpponentCardIds.push(peeked)
    // ログには**カード名を出さない**（両者が読むため。見た本人は PlayerView から知る）
    log(state, `${player.name}は${target.name}の手札1枚の内容を見た。`)
}

// BS09-055転生の谷Lv1-2：自分の手札にある【転召】持ちスピリットカード1枚を破棄することで、
// ドローの枚数を+1する。手札に該当が無ければ**何も起きない**（払えないコストは発揮できない。COST_MODEL.md §1）
const costDiscardHandKeywordThenDrawHandler: ActionHandler<"costDiscardHandKeywordThenDraw"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, owner)) {
        log(state, `${state.players[owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
    // トラッシュのカードと同じく、手札のカードはカード静的なキーワード保有・種別で判定する。
    // cardType 省略時はスピリットカード（従来どおり）
    const eligible = (cardId: string): boolean => {
        if (getCard(cardId).type !== (action.cardType ?? "spirit")) return false
        if (action.keyword === undefined) return true
        const wanted = Array.isArray(action.keyword) ? action.keyword : [action.keyword]
        return wanted.some((kw) => hasKeyword(cardId, kw))
    }
    if (chosenCardIndex !== undefined) {
        const cardId = player.hand[chosenCardIndex]
        if (cardId === undefined || !eligible(cardId)) {
            log(state, `${sourceName}：破棄するカードがなかった。`)
            return
        }
        player.hand.splice(chosenCardIndex, 1)
        player.trashCards.push(cardId)
        log(state, `${player.name}はコストとして${getCard(cardId).name}を破棄した。`)
        draw(state, owner, action.count)
        return
    }
    const indices = player.hand.map((_, i) => i).filter((i) => eligible(player.hand[i]!))
    if (indices.length === 0) {
        const what =
            action.keyword !== undefined
                ? `【${(Array.isArray(action.keyword) ? action.keyword : [action.keyword]).map((kw) => KEYWORDS[kw].label).join("】/【")}】を持つ${action.cardType ?? "スピリット"}カード`
                : `${action.cardType === "nexus" ? "ネクサス" : action.cardType === "magic" ? "マジック" : "スピリット"}カード`
        log(state, `${sourceName}：${what}が手札になく、発動しなかった。`)
        return
    }
    if (tryInteractiveCardChoice(state, owner, self, `${sourceName}：コストとして破棄するカードを選んでください`, "hand", indices, action, null)) {
        return
    }
    // 自動時は先頭（決定的簡略化）
    const index = indices[0]!
    const cardId = player.hand[index]!
    player.hand.splice(index, 1)
    player.trashCards.push(cardId)
    log(state, `${player.name}はコストとして${getCard(cardId).name}を破棄した。`)
    draw(state, owner, action.count)
}

// BS09-058魔本収められし書架Lv2：持ち主が自分の手札からcount枚を選んで自分のデッキの一番上に戻す。
// opponentHandToDeckTop の自分版（選ぶのは戻す本人なので owner に選択を出す）
const handToOwnDeckTopHandler: ActionHandler<"handToOwnDeckTop"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    if (chosenCardIndex !== undefined) {
        const cardId = player.hand[chosenCardIndex]
        if (cardId === undefined) {
            log(state, `${sourceName}：対象の手札がなかった。`)
            return
        }
        player.hand.splice(chosenCardIndex, 1)
        player.deck.unshift(cardId)
        log(state, `${player.name}は手札1枚をデッキの上に戻した。`)
        return
    }
    if (player.hand.length === 0) {
        log(state, `${sourceName}：${player.name}の手札がなかった。`)
        return
    }
    if (state.interactiveTargets) {
        const indices = player.hand.map((_, i) => i)
        if (
            tryInteractiveCardChoice(
                state,
                owner,
                self,
                `${sourceName}：デッキの上に戻すカードを選んでください`,
                "hand",
                indices,
                { type: "handToOwnDeckTop", count: 1 },
                action.count > 1 ? { type: "handToOwnDeckTop", count: action.count - 1 } : null,
            )
        ) {
            return
        }
    }
    // 自動時は手札末尾から（本来は本人が選ぶ。決定的簡略化）
    let moved = 0
    for (let i = 0; i < action.count; i++) {
        const cardId = player.hand.pop()
        if (cardId === undefined) break
        player.deck.unshift(cardId)
        moved++
    }
    log(state, `${player.name}は手札${String(moved)}枚をデッキの上に戻した。`)
    return
}

// BS07魔札の占い師ディーシャLv2：相手は手札からcount枚を選んで自分のデッキの一番上に戻す。
// 選ぶのは戻される側（相手）なので、interactiveTargets では相手本人に選択を出す（discardOpponent と同じ形）
const opponentHandToDeckTopHandler: ActionHandler<"opponentHandToDeckTop"> = (ctx, action) => {
    const { state, opp, self, sourceName, chosenCardIndex } = ctx
        const target = state.players[opp]
        if (chosenCardIndex !== undefined) {
            const cardId = target.hand[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}：対象の手札がなかった。`)
                return
            }
            target.hand.splice(chosenCardIndex, 1)
            target.deck.unshift(cardId)
            log(state, `${target.name}は手札1枚をデッキの上に戻した。`)
            return
        }
        if (target.hand.length === 0) {
            log(state, `${sourceName}：${target.name}の手札がなかった。`)
            return
        }
        if (state.interactiveTargets) {
            const indices = target.hand.map((_, i) => i)
            if (
                tryInteractiveCardChoice(
                    state,
                    opp,
                    self,
                    `${sourceName}：デッキの上に戻すカードを選んでください`,
                    "hand",
                    indices,
                    { type: "opponentHandToDeckTop", count: 1 },
                    action.count > 1 ? { type: "opponentHandToDeckTop", count: action.count - 1 } : null,
                )
            ) {
                return
            }
        }
        // 自動時は手札末尾から（本来は相手が選ぶ。決定的簡略化）
        let moved = 0
        for (let i = 0; i < action.count; i++) {
            const cardId = target.hand.pop()
            if (cardId === undefined) break
            target.deck.unshift(cardId)
            moved++
        }
        log(state, `${target.name}は手札${moved}枚をデッキの上に戻した。`)
        return
}

const handlers = {
    drawPerChosenFamily: drawPerChosenFamilyHandler,
    draw: drawHandler,
    drawPer: drawPerHandler,
    drawUpTo: drawUpToHandler,
    discardHandAll: discardHandAllHandler,
    discardOpponent: discardOpponentHandler,
    discardOpponentDownTo: discardOpponentDownToHandler,
    discardSelfDownTo: discardSelfDownToHandler,
    randomOpponentHandMagicDiscard: randomOpponentHandMagicDiscardHandler,
    noop: noopHandler,
    discardSelfOne: discardSelfOneHandler,
    discardSelfChoose: discardSelfChooseHandler,
    costDiscardHandThenDraw: costDiscardHandThenDrawHandler,
    costDiscardHandThenDiscardOpponentMagic: costDiscardHandThenDiscardOpponentMagicHandler,
    costDiscardHandTypeThenCoreRemove: costDiscardHandTypeThenCoreRemoveHandler,
    discardHandNexusesThenDraw: discardHandNexusesThenDrawHandler,
    discardHandNexusToVoidCoreSelf: discardHandNexusToVoidCoreSelfHandler,
    drawThenDiscard: drawThenDiscardHandler,
    discardHandAnyThenCoreRemove: discardHandAnyThenCoreRemoveHandler,
    drawPerHandDiscard: drawPerHandDiscardHandler,
    costDiscardNamedThenPeek: costDiscardNamedThenPeekHandler,
    costDiscardHandKeywordThenDraw: costDiscardHandKeywordThenDrawHandler,
    handToOwnDeckTop: handToOwnDeckTopHandler,
    opponentHandToDeckTop: opponentHandToDeckTopHandler,
} satisfies Partial<ActionRegistry>

export default handlers
