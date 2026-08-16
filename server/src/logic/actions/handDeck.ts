// 手札・デッキ・トラッシュ操作系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, Color, GameState, PlayerId } from "../../type"
import { createInstance, draw, getCard, log, minLevelCores, opponentOf, pushResumeFrames } from "../GameState"
import {
    tryFreeSummonOnHandDiscard,
    bothSidesPids,
    resistanceAgainst,
    countEffectCounter,
    destroySpirit,
    drawDoubleMultiplier,
    findSpiritAny,
    fireSummonTrigger,
    isResisted,
    millCapBonusFor,
    millDeck,
    notifyHandGained,
    pickAnySideByBp,
    pickAnySideCandidates,
    pickEnemyByBp,
    pickEnemyCandidates,
    requestCardChoice,
    requestChoice,
    resolveMagic,
    returnSpiritToDeckBottom,
    returnSpiritToDeckTop,
    returnSpiritToHand,
    tryInteractiveCardChoice,
    tryInteractiveTargetChoice,
} from "../EffectModules"
import { KEYWORDS, cardHasColor, effectiveBp, spiritHasKeyword, hasGlobalConstraint, hasKeyword, instHasColor, instMatchesCostFilter, matchesTarget } from "../../../../shared/rules"
import { effectiveCost } from "../../../../shared/cost"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"
import { COLOR_LABELS } from "../../../../data/constants"

const noopHandler: ActionHandler<"noop"> = () => {
    // 何もしない（PendingChoice.magicNegate のプレースホルダ）
}

const drawHandler: ActionHandler<"draw"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // side:"both"指定時は自分→相手の順で両者が引く（BS03巨猫ブリンクス：お互いドロー）。
        // 封印された魔導書Lv1が働くと片側だけになる（ドローは受ける側の利得なので相手が外れる）
        if (action.side === "both") {
            const pids = bothSidesPids(state, srcType, true)
            for (const pid of [owner, opp]) {
                if (!pids.includes(pid)) continue
                draw(state, pid, action.count * drawDoubleMultiplier(state, pid))
            }
        } else {
            draw(state, owner, action.count * drawDoubleMultiplier(state, owner))
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

const trashSpiritsToDeckBottomHandler: ActionHandler<"trashSpiritsToDeckBottom"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
        // トリックプランク：自分のトラッシュにあるスピリットカードを末尾（新しい方）から
        // 最大count枚、その順で自分のデッキの下に戻す（選択・順序の決定的簡略化）
        const player = state.players[owner]
        const indices: number[] = []
        for (let j = player.trashCards.length - 1; j >= 0 && indices.length < action.count; j--) {
            if (getCard(player.trashCards[j]!).type === "spirit") indices.push(j)
        }
        if (indices.length === 0) {
            log(state, `${sourceName}：トラッシュにスピリットカードがなかった。`)
            return
        }
        // indices は末尾（新しい方）→先頭の順に収集済み。この順のままデッキの下へ積む
        const movedIds = indices.map((j) => player.trashCards[j]!)
        for (const j of indices) player.trashCards.splice(j, 1)
        for (const id of movedIds) player.deck.push(id)
        log(
            state,
            `${player.name}はトラッシュの「${movedIds.map((id) => getCard(id).name).join("、")}」をデッキの下に戻した。`,
        )
        return
}

const discardHandAllHandler: ActionHandler<"discardHandAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const player = state.players[owner]
        const count = player.hand.length
        player.trashCards.push(...player.hand)
        player.hand = []
        log(state, `${player.name}は手札${count}枚をすべて破棄した。`)
        return
}

const discardOpponentHandler: ActionHandler<"discardOpponent"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // interactiveTargets時は選択式（選択者は破棄される相手本人）。forcedTargetPid指定時＝
        // 選択式の再突入呼び出し。選択者=破棄される相手本人のため、pendingChoice解決時に
        // resolveActionへ渡るowner引数は常にpending.pid（=破棄される側）になり、
        // opponentOf(owner)による逆算では元の効果所有者を指してしまう。そのため選択式に入った
        // 時点で対象プレイヤーIdをactionに固定して持ち回す
        const targetPid = action.forcedTargetPid ?? opp
        const target = state.players[targetPid]
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
            return
        }
        // cardTypeFilter（BS08関将龍皇ドラグロン：相手の手札を見てスピリットカード1枚を破棄）：
        // このカード種別のカードだけを候補にする。該当がなければ不発
        const matchesType = (cardId: string): boolean =>
            action.cardTypeFilter === undefined || getCard(cardId).type === action.cardTypeFilter
        if (state.interactiveTargets) {
            const indices = target.hand.map((_, i) => i).filter((i) => matchesType(target.hand[i]!))
            if (indices.length === 0) {
                log(state, `${sourceName}の手札破棄：対象になるカードがなかった。`)
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
            return
        }
        log(
            state,
            `${target.name}は手札「${discarded.join("、")}」を破棄した。`,
        )
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

const discardSelfOneHandler: ActionHandler<"discardSelfOne"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
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
const discardSelfChooseHandler: ActionHandler<"discardSelfChoose"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    if (action.count <= 0) return
    // 選択の解決から戻ってきた場合：選ばれた1枚を破棄する（残りは queue 側が処理する）
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
                `${sourceName}の手札破棄：破棄するカードを選んでください（残り${action.count}枚）`,
                "hand",
                indices,
                { type: "discardSelfChoose", count: 1 },
                action.count > 1 ? { type: "discardSelfChoose", count: action.count - 1 } : null,
            )
        ) {
            return
        }
    }
    // 決定的自動選択（テスト等）：手札末尾から count 枚を破棄する
    for (let i = 0; i < action.count; i++) {
        const cardId = player.hand.pop()
        if (cardId === undefined) {
            log(state, `${sourceName}の手札破棄：手札がなかった。`)
            return
        }
        player.trashCards.push(cardId)
        log(state, `${player.name}は手札から${getCard(cardId).name}を破棄した。`)
    }
}

// 機織のハーフェレシテLv1：手札のネクサスカード1枚の破棄をコストに、ボイドからコアを自身へ置く。
// どのネクサスを捨てるかは手札の先頭側に固定した決定的簡略化（「できる」の任意性は step.optional 側で扱う）
const discardHandNexusToVoidCoreSelfHandler: ActionHandler<"discardHandNexusToVoidCoreSelf"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
    if (!self) return
    const player = state.players[owner]
    const index = player.hand.findIndex((id) => getCard(id).type === "nexus")
    if (index === -1) {
        log(state, `${sourceName}：手札にネクサスカードがなかった。`)
        return
    }
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

// 公開ゾーンの残りをデッキの下へ戻す。実対戦では戻す順番を1枚ずつ選ばせる
// （スキップすると残りを現在の順のまま戻す）。カードは「デッキの下」へ行くため、
// 順番が結果に効く場面はごく限られるが、カードテキストどおり選べるようにしてある。
// toTop 指定時は「デッキの**上**に戻す」（BS06-107 セカンドサイト）。こちらは次に引く順そのものなので
// 順番の選択が結果に直結する。**先に選んだカードが上**になるよう、すでに戻した枚数（placed）の
// 位置へ順に差し込む（placed は選択の再入をまたいで action に持ち回る内部専用フィールド）
const revealReturnToDeckHandler: ActionHandler<"revealReturnToDeck"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const zone = state.revealedCards
    if (!zone || zone.pid !== owner) return
    const player = state.players[owner]
    const toTop = action.toTop === true
    const placed = action.placed ?? 0
    const where = toTop ? "上" : "下"
    const pushAllRemaining = (): void => {
        const remaining = zone.cardIds.length
        if (toTop) player.deck.splice(placed, 0, ...zone.cardIds)
        else for (const id of zone.cardIds) player.deck.push(id)
        if (remaining > 0) {
            log(state, `${player.name}は残り${remaining}枚をデッキの${where}に戻した。`)
        }
        delete state.revealedCards
    }
    // 選択された1枚を先に戻し、残りがあれば続けて選ばせる
    let nextPlaced = placed
    if (chosenCardIndex !== undefined) {
        const id = zone.cardIds[chosenCardIndex]
        if (id !== undefined) {
            zone.cardIds.splice(chosenCardIndex, 1)
            if (toTop) {
                player.deck.splice(placed, 0, id)
                nextPlaced = placed + 1
            } else {
                player.deck.push(id)
            }
            log(state, `${player.name}は${getCard(id).name}をデッキの${where}に戻した。`)
        }
    }
    if (zone.cardIds.length === 0) {
        delete state.revealedCards
        return
    }
    if (state.interactiveTargets && zone.cardIds.length >= 2) {
        requestCardChoice(
            state,
            owner,
            toTop
                ? `${sourceName}：デッキの上に戻す順番（残り${zone.cardIds.length}枚。先に選んだカードが上）`
                : `${sourceName}：デッキの下に戻す順番（残り${zone.cardIds.length}枚。スキップで現在の順のまま戻す）`,
            "reveal",
            zone.cardIds.map((_, i) => i),
            // 上に戻す側はスキップを許さない：スキップの後始末（flushRevealedCardsIfIdle）は
            // デッキの**下**へ戻すため、途中で抜けると残りが下に沈んでしまう。
            // 「好きな順番で戻す」は任意効果ではないので、最後まで選ばせるのが効果文どおりでもある
            !toTop,
            toTop ? { type: "revealReturnToDeck", toTop: true, placed: nextPlaced } : { type: "revealReturnToDeck" },
            self,
        )
        return
    }
    // 残り1枚（またはsmoke等の非対話）はそのまま戻す。nextPlaced を使うため pushAllRemaining の外で位置を合わせる
    if (toTop && nextPlaced !== placed) {
        const remaining = zone.cardIds.length
        player.deck.splice(nextPlaced, 0, ...zone.cardIds)
        log(state, `${player.name}は残り${remaining}枚をデッキの上に戻した。`)
        delete state.revealedCards
        return
    }
    pushAllRemaining()
}

const deckRevealHandler: ActionHandler<"deckReveal"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // スワロウアイヴィー：自分のデッキ上からcount枚を公開し、pickTypeに一致する最初の
        // 1枚（省略時は先頭）を手札に加える。残りは元の順で山札の下に戻す。
        // 大天使ミカファール：countPer指定時は自分の指定色スピリット/ネクサス合計数ぶん公開し、
        // pickAllOfType指定時は一致するカードすべてを手札に加える。
        // 簡略化: 本来はプレイヤーが選ぶ／戻す順を選ぶ処理を、決定的な自動選択で代替する。
        const player = state.players[owner]
        // 公開ゾーン経由の再入（手札に加える1枚が選ばれて戻ってきた）は、**デッキに触る前に**処理して抜ける。
        // ここより下の splice(0, count) まで進むと、公開済みのカードとは別にデッキの上から
        // もう count 枚が抜かれ、そのまま捨てられる（実対戦でのみ通る経路のため長らく気付かれなかった。2026-08-11）
        if (chosenCardIndex !== undefined && state.revealedCards && state.revealedCards.pid === owner) {
            const zone = state.revealedCards.cardIds
            const pickedId = zone[chosenCardIndex]
            if (pickedId !== undefined) {
                zone.splice(chosenCardIndex, 1)
                player.hand.push(pickedId)
                log(state, `${player.name}は${getCard(pickedId).name}を手札に加えた。`)
                notifyHandGained(state, owner, 1)
            }
            // 公開ゾーンから取り出した残りは、この時点でデッキへは戻っていないので公開ゾーンを使って戻す
            ctx.resolve({ type: "revealReturnToDeck", ...(action.returnToTop ? { toTop: true as const } : {}) })
            return
        }
        const countPer = action.countPer
        const count = countPer
            ? "ownColorTotal" in countPer
                ? [...player.field.spirits, ...player.field.nexuses].filter(
                      (s) => instHasColor(s, countPer.ownColorTotal),
                  ).length
                : player.field.nexuses.length
            : action.count ?? 0
        const revealed = player.deck.splice(0, count)
        if (revealed.length === 0) {
            log(state, `${sourceName}：デッキにカードがないため公開できなかった。`)
            return
        }
        const revealedCount = revealed.length
        const revealedNames = revealed.map((id) => getCard(id).name).join("、")
        // pickNone：手札に加えるカードを選ばず、公開してそのまま戻すだけ（BS06-107 セカンドサイト）。
        // returnToTop と併用すると「好きな順番でデッキの上に戻す」になる
        if (action.pickNone) {
            state.revealedCards = { pid: owner, cardIds: [...revealed] }
            log(state, `${player.name}はデッキ上${revealedCount}枚（${revealedNames}）を公開した。`)
            ctx.resolve({ type: "revealReturnToDeck", ...(action.returnToTop ? { toTop: true as const } : {}) })
            return
        }
        if (action.pickAllOfType) {
            const picked = revealed.filter((id) => getCard(id).type === action.pickAllOfType)
            const remaining = revealed.filter((id) => getCard(id).type !== action.pickAllOfType)
            if (picked.length === 0) {
                log(
                    state,
                    `${player.name}はデッキ上${revealedCount}枚（${revealedNames}）を公開したが、一致するカードがなかった。`,
                )
            } else {
                for (const id of picked) player.hand.push(id)
                log(
                    state,
                    `${player.name}はデッキ上${revealedCount}枚（${revealedNames}）を公開し、${picked.map((id) => getCard(id).name).join("、")}を手札に加えた。`,
                )
                notifyHandGained(state, owner, picked.length)
            }
            for (const id of remaining) player.deck.push(id)
            return
        }
        // familyFilter：カード静的な系統のみで判定する（デッキ内のカードにはインスタンスが無く、
        // 継続付与された系統は考慮できないため。reductionGrant.familyFilter と同じ簡略化）
        const matchesFamily = (id: string): boolean => {
            if (action.familyFilter === undefined) return true
            const wanted = Array.isArray(action.familyFilter) ? action.familyFilter : [action.familyFilter]
            return wanted.some((f) => getCard(id).family.includes(f))
        }
        const matchesPick = (id: string): boolean =>
            (action.pickType === undefined || getCard(id).type === action.pickType) &&
            (action.nameIncludes === undefined || getCard(id).name.includes(action.nameIncludes)) &&
            matchesFamily(id)
        // 実対戦（interactiveTargets）では「その中から1枚を選び」をプレイヤーに選ばせる。
        // 公開ゾーン（state.revealedCards）へ積み、cardZone:"reveal" の card choice を出す。
        // 選択後は chosenCardIndex を持って再入し、下の pickIndex 経路に合流する
        if (state.interactiveTargets && !action.pickAllOfType) {
            const indices = revealed.map((id, i) => ({ id, i })).filter((x) => matchesPick(x.id)).map((x) => x.i)
            if (indices.length >= 2 && chosenCardIndex === undefined) {
                state.revealedCards = { pid: owner, cardIds: [...revealed] }
                log(state, `${player.name}はデッキ上${revealedCount}枚（${revealedNames}）を公開した。`)
                requestCardChoice(
                    state,
                    owner,
                    `${sourceName}：手札に加えるカードを選んでください`,
                    "reveal",
                    indices,
                    false,
                    action,
                    self,
                )
                return
            }
        }
        const pickIndex = revealed.findIndex(matchesPick)
        if (pickIndex === -1) {
            log(
                state,
                `${player.name}はデッキ上${revealedCount}枚（${revealedNames}）を公開したが、一致するカードがなかった。`,
            )
        } else {
            const [pickedId] = revealed.splice(pickIndex, 1)
            player.hand.push(pickedId!)
            log(
                state,
                `${player.name}はデッキ上${revealedCount}枚（${revealedNames}）を公開し、${getCard(pickedId!).name}を手札に加えた。`,
            )
            notifyHandGained(state, owner, 1)
        }
        // 残ったカードの処理：discardNonMatching指定時はトラッシュへ破棄（BS05天焦がす大聖火）、
        // returnToTop指定時は公開順のまま山札の上に戻す（BS06曲刀竜パラサウル）、
        // それ以外は公開順のまま山札の下に戻す（下に戻す＝push）
        if (action.discardNonMatching) {
            for (const id of revealed) player.trashCards.push(id)
            if (revealed.length > 0) {
                log(state, `${player.name}は残り${revealed.length}枚をトラッシュに置いた。`)
            }
        } else if (action.returnToTop) {
            player.deck.unshift(...revealed)
        } else {
            for (const id of revealed) player.deck.push(id)
        }
        return
}

const revealDiscardRestHandler: ActionHandler<"revealDiscardRest"> = (ctx) => {
    // 公開ゾーンの残りをすべてトラッシュへ（revealAndSummonKeyword の後始末専用）
    discardRevealedZone(ctx.state, ctx.owner, ctx.sourceName)
}

const revealAndSummonKeywordHandler: ActionHandler<"revealAndSummonKeyword"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
        // BS05トランスマイグレーション：デッキ上からcount枚を公開し、その中の【転召】持ちスピリット
        // 1枚をコストを支払わず召喚する。残った公開カードはすべてトラッシュへ破棄する。
        // 「召喚できる」＝任意なので、interactiveTargets時は候補1枚でも選択（スキップ可）を出す
        const player = state.players[owner]

        // 公開ゾーン経由の再入：選ばれた1枚を召喚し、残りを破棄して終わる
        if (chosenCardIndex !== undefined && state.revealedCards) {
            const zone = state.revealedCards.cardIds
            const pickedId = zone[chosenCardIndex]
            if (pickedId !== undefined) {
                zone.splice(chosenCardIndex, 1)
                summonRevealedFree(ctx, action, pickedId)
            }
            // 残りの破棄は選択待ちの queue（revealDiscardRest）が担う。ここで消すと
            // 「スキップしたときだけ破棄されない」という非対称が生まれる
            return
        }

        const revealed = player.deck.splice(0, action.count)
        if (revealed.length === 0) {
            log(state, `${sourceName}：デッキにカードがないため公開できなかった。`)
            return
        }
        log(
            state,
            `${player.name}はデッキ上${revealed.length}枚（${revealed.map((id) => getCard(id).name).join("、")}）を公開した。`,
        )
        const matches = (id: string): boolean =>
            getCard(id).type === "spirit" && hasKeyword(id, action.keyword)
        const indices = revealed.map((id, i) => ({ id, i })).filter((x) => matches(x.id)).map((x) => x.i)
        if (indices.length === 0) {
            for (const id of revealed) player.trashCards.push(id)
            log(state, `${sourceName}：【${KEYWORDS[action.keyword].label}】を持つスピリットカードがなかった。残り${revealed.length}枚をトラッシュに置いた。`)
            return
        }
        if (state.interactiveTargets) {
            // 公開ゾーンへ積んでから選ばせる（候補1枚でも alwaysAsk で「召喚しない」を選べる）
            state.revealedCards = { pid: owner, cardIds: [...revealed] }
            requestCardChoice(
                state,
                owner,
                `${sourceName}：コストを支払わずに召喚するスピリットを選んでください`,
                "reveal",
                indices,
                true,
                action,
                self,
                true,
            )
            // 「残りは破棄する」は**選んでもスキップしても**走る必要がある。
            // スキップは doResolveChoice がハンドラを再入させないので、選択待ちの queue に
            // 後始末（revealDiscardRest）を積んでおく（積まないと flushRevealedCardsIfIdle が
            // デッキの下へ戻してしまい、効果文と食い違う）
            if (state.pendingChoice) {
                pushResumeFrames(state, [{ kind: "action", selfInstanceId: null, action: { type: "revealDiscardRest" } }])
            } else {
                discardRevealedZone(state, owner, sourceName)
            }
            return
        }
        // 自動時（テスト）はコスト最大の1枚を選ぶ決定的簡略化
        let bestIndex = indices[0]!
        for (const i of indices) {
            if (getCard(revealed[i]!).cost > getCard(revealed[bestIndex]!).cost) bestIndex = i
        }
        const [pickedId] = revealed.splice(bestIndex, 1)
        summonRevealedFree(ctx, action, pickedId!)
        for (const id of revealed) player.trashCards.push(id)
        if (revealed.length > 0) {
            log(state, `${player.name}は残り${revealed.length}枚をトラッシュに置いた。`)
        }
        return
}

// BS08魔帝龍騎ダーク・クリムゾン：デッキ上からcount枚を公開し、その中の指定系統を持つ
// スピリットカード**すべて**を、コストを支払わず、【転召】させずに召喚する（任意選択を挟まない範囲効果）。
// この効果で召喚されたスピリットの『召喚時』効果は発揮されない（revealAndSummonKeywordと対照的）。
// 系統不一致・維持コア不足で召喚できなかったカードはすべてトラッシュへ
const revealAndSummonAllByFamilyHandler: ActionHandler<"revealAndSummonAllByFamily"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
        const player = state.players[owner]
        const revealed = player.deck.splice(0, action.count)
        if (revealed.length === 0) {
            log(state, `${sourceName}：デッキにカードがないため公開できなかった。`)
            return
        }
        log(
            state,
            `${player.name}はデッキ上${revealed.length}枚（${revealed.map((id) => getCard(id).name).join("、")}）を公開した。`,
        )
        const wanted = Array.isArray(action.familyFilter) ? action.familyFilter : [action.familyFilter]
        let summonedCount = 0
        let discardedCount = 0
        for (const cardId of revealed) {
            const card = getCard(cardId)
            const maintain = minLevelCores(card)
            if (card.type !== "spirit" || !wanted.some((f) => card.family.includes(f)) || player.reserve < maintain) {
                player.trashCards.push(cardId)
                discardedCount++
                continue
            }
            player.reserve -= maintain
            const inst = createInstance(cardId, state.turn, maintain)
            player.field.spirits.push(inst)
            summonedCount++
            log(
                state,
                `${player.name}は${sourceName}の効果で、${card.name}をコストを支払わず、【転召】させずに召喚した。` +
                    "（このスピリットの召喚時効果は発揮されない）",
            )
        }
        if (summonedCount === 0) {
            log(state, `${sourceName}：召喚できるスピリットがいなかった。`)
        }
        if (discardedCount > 0) {
            log(state, `${player.name}は残り${discardedCount}枚をトラッシュに置いた。`)
        }
        return
}

// 公開ゾーンに残っているカードをすべて持ち主のトラッシュへ置き、公開ゾーンを閉じる
function discardRevealedZone(state: GameState, owner: PlayerId, sourceName: string): void {
    const zone = state.revealedCards
    if (!zone) return
    const player = state.players[owner]
    for (const id of zone.cardIds) player.trashCards.push(id)
    if (zone.cardIds.length > 0) {
        log(state, `${player.name}は${sourceName}で残った${zone.cardIds.length}枚をトラッシュに置いた。`)
    }
    delete state.revealedCards
}

// 公開したカード1枚をコストを支払わず召喚する。
//
// **召喚時効果は通常どおり発揮する**（効果文に「発揮されない」の記載が無い。
// summonFromHandFree / summonFromTrashFree とはここが違う）。
// 一方で **【転召】は解決しない**：効果文の「【転召】を発揮したものとして」は
// 「転召を済ませたものとして扱う＝スピリットを犠牲にしなくてよい」の意味。
// 通常の効果による召喚では転召を必ず行う（公式Q&A 2024-10-31）ので、
// **この一文を持つカードだけが例外**という関係になる
function summonRevealedFree(
    ctx: ActionCtx,
    action: { returnToDeckBottomAtEndStep?: true },
    cardId: string,
): void {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const card = getCard(cardId)
    const maintain = minLevelCores(card)
    if (player.reserve < maintain) {
        log(state, `${sourceName}：リザーブが足りず${card.name}を召喚できなかった。`)
        player.trashCards.push(cardId)
        return
    }
    player.reserve -= maintain
    const inst = createInstance(cardId, state.turn, maintain)
    if (action.returnToDeckBottomAtEndStep) inst.returnToDeckBottomAtEndStep = true
    player.field.spirits.push(inst)
    log(
        state,
        `${player.name}は${sourceName}の効果で、${card.name}をコストを支払わずに召喚した。` +
            "（【転召】を発揮したものとして扱うため、コアを置く必要はない）",
    )
    fireSummonTrigger(state, owner, inst)
}

const recoverSpiritFromTrashHandler: ActionHandler<"recoverSpiritFromTrash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 鎖縛の武舞台Lv1-2：お互い、トラッシュからカードを手札に戻せない
        if (hasGlobalConstraint(state, "noTrashRecovery")) {
            log(state, `${sourceName}：トラッシュからカードを手札に戻せないため発動しなかった。`)
            return
        }
        // interactiveTargets時は選択式（選択者=使用者。cardZone:"trash"）
        const player = state.players[owner]
        // BS07ドラグロン占術師：手札に戻したカードが指定系統のときだけ、続けて相手1体を破壊する。
        // トラッシュのカードが対象なのでカード静的な family で判定する（回収条件の familyOk と同じ扱い）
        const followUp = (recoveredIds: string[]): void => {
            // 「ドローしないことで」（BS07常闇の聖堂Lv2）：ドロー自体が支払い。
            // **実際に手札へ戻せたときだけ**支払う（対象がいなくて不発なら、ドローはそのまま行う）。
            // ドローより前に発火する区間（step.beforeDraw）から呼ばれるので、この後の区間が引かずに進む
            if (action.costSkipDraw && recoveredIds.length > 0) state.drawStepSkipped = true
            const spec = action.thenDestroyIfFamily
            if (spec === undefined) return
            const wanted = Array.isArray(spec.family) ? spec.family : [spec.family]
            const hit = recoveredIds.some((id) => wanted.some((f) => getCard(id).family.includes(f)))
            if (!hit) return
            ctx.resolve({ type: "destroy", filter: { maxBp: spec.maxBp }, count: 1 })
        }
        // familyFilter 指定時はその系統（配列＝OR）を持つスピリットカードのみ対象。
        // トラッシュのカードが対象のため、判定はカード静的な family で行う（BS04鋼葉の樹林＝甲獣）
        const familyOk = (cardId: string): boolean => {
            if (action.familyFilter === undefined) return true
            const wanted = Array.isArray(action.familyFilter)
                ? action.familyFilter
                : [action.familyFilter]
            return wanted.some((f) => getCard(cardId).family.includes(f))
        }
        // keywordFilter（BS08ターンインフェルノ＝【転召】持ち）：トラッシュのカードが対象なので
        // カード静的なキーワード保有（hasKeyword）で判定する
        const keywordOk = (cardId: string): boolean =>
            action.keywordFilter === undefined || hasKeyword(cardId, action.keywordFilter)
        // nameIncludes（BS08アルカナクィーン・パラス＝「アルカナ」）：トラッシュのカードが対象なので
        // カード静的な名前（cardId基準）で判定する
        const nameOk = (cardId: string): boolean =>
            action.nameIncludes === undefined || getCard(cardId).name.includes(action.nameIncludes)
        // colorFilter（BS09-015獄獣ガシャベルスLv3＝黄）：トラッシュのカードが対象なので
        // カード静的な colors で判定する（多色カードはいずれかが一致すればよい）
        const colorOk = (cardId: string): boolean =>
            action.colorFilter === undefined || getCard(cardId).colors.includes(action.colorFilter)
        const isRecoverable = (cardId: string): boolean =>
            getCard(cardId).type === "spirit" && familyOk(cardId) && keywordOk(cardId) && nameOk(cardId) && colorOk(cardId)
        // BS07ブリュナグオン：【呪撃】を持つ自分のスピリット1体を破壊することがコスト。
        // 払えなければ何も起きない。**何を犠牲にするかは候補2体以上ならプレイヤーが選ぶ**（COST_MODEL.md §2）。
        // 選ばせたあとは costDestroyOwnKeyword を落とした action で入り直し、二重に払わないようにする
        // （exhaust の chooserIsTarget と同じ「解決済みの軸を落として再入する」書き方）
        if (action.costDestroyOwnKeyword !== undefined && chosenCardIndex === undefined) {
            const kw = action.costDestroyOwnKeyword
            const candidates = player.field.spirits.filter((sp) => spiritHasKeyword(state, owner, sp, kw))
            if (candidates.length === 0) {
                log(state, `${sourceName}：【${KEYWORDS[kw].label}】を持つ自分のスピリットがいないため発動しなかった。`)
                return
            }
            // B（トラッシュから戻せるカード）が無ければ発揮できない（COST_MODEL.md §1）。
            // 以前は先に自分のスピリットを破壊してからトラッシュを見ていたため、払い損になっていた
            if (!player.trashCards.some(isRecoverable)) {
                log(state, `${sourceName}：トラッシュに戻せるスピリットカードがないため発動しなかった。`)
                return
            }
            const { costDestroyOwnKeyword: _paid, costSacrificeChosen: _flag, ...rest } = action
            if (action.costSacrificeChosen && targetInstanceId !== undefined) {
                const chosen = candidates.find((sp) => sp.instanceId === targetInstanceId)
                if (!chosen) {
                    log(state, `${sourceName}：指定されたスピリットはコストにできなかった。`)
                    return
                }
                log(state, `${player.name}は${sourceName}のコストとして${getCard(chosen.cardId).name}を破壊した。`)
                destroySpirit(state, owner, chosen.instanceId, "destroy", { sourcePid: owner })
                ctx.resolve(rest)
                return
            }
            if (state.interactiveTargets && candidates.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コストとして破壊する自分のスピリットを選んでください`,
                    candidates.map((sp) => sp.instanceId),
                    false,
                    { ...action, costSacrificeChosen: true },
                    self,
                )
                return
            }
            // 非対話・候補1体：実効BP最小を自動選択（犠牲を最小化する決定的簡略化）
            const victim = candidates.reduce((min, sp) =>
                effectiveBp(state, owner, sp) < effectiveBp(state, owner, min) ? sp : min,
            )
            destroySpirit(state, owner, victim.instanceId, "destroy", { sourcePid: owner })
        }
        if (chosenCardIndex !== undefined) {
            const cardId = player.trashCards[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}のスピリット回収：対象がいなかった。`)
                return
            }
            player.trashCards.splice(chosenCardIndex, 1)
            player.hand.push(cardId)
            log(state, `${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
            notifyHandGained(state, owner, 1)
            followUp([cardId])
            return
        }
        // all指定時はcountを無視し、該当カードすべてを手札に戻す（BS03ネクロマンシー：系統「無魔」すべて）
        if (action.all) {
            const indices: number[] = []
            for (let j = 0; j < player.trashCards.length; j++) {
                if (isRecoverable(player.trashCards[j]!)) indices.push(j)
            }
            if (indices.length === 0) {
                log(state, `${sourceName}のスピリット回収：トラッシュに対象がいなかった。`)
                return
            }
            const recoveredIds = indices.map((j) => player.trashCards[j]!)
            // インデックスが大きい順に取り除く（splice時のズレを防ぐ）
            for (let k = indices.length - 1; k >= 0; k--) {
                player.trashCards.splice(indices[k]!, 1)
            }
            player.hand.push(...recoveredIds)
            log(
                state,
                `${player.name}は「${recoveredIds.map((id) => getCard(id).name).join("、")}」をトラッシュから手札に戻した。`,
            )
            notifyHandGained(state, owner, recoveredIds.length)
            followUp(recoveredIds)
            return
        }
        if (state.interactiveTargets) {
            const indices = player.trashCards
                .map((id, i) => ({ id, i }))
                .filter(({ id }) => isRecoverable(id))
                .map(({ i }) => i)
            if (
                tryInteractiveCardChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}のスピリット回収：手札に戻すカードを選んでください`,
                    "trash",
                    indices,
                    { ...action, count: 1 },
                    action.count > 1 ? { ...action, count: action.count - 1 } : null,
                )
            ) {
                return
            }
        }
        // 既存の決定的自動選択：トラッシュの末尾（新しい方）からスピリットカードを探して
        // count枚手札に戻す（本来は好きな1枚を選べるが、決定的な自動選択で簡略化）
        let recovered = 0
        const recoveredIds: string[] = []
        for (let i = 0; i < action.count; i++) {
            let idx = -1
            for (let j = player.trashCards.length - 1; j >= 0; j--) {
                if (isRecoverable(player.trashCards[j]!)) {
                    idx = j
                    break
                }
            }
            if (idx === -1) {
                log(state, `${sourceName}のスピリット回収：トラッシュに対象がいなかった。`)
                break
            }
            const cardId = player.trashCards[idx]!
            player.trashCards.splice(idx, 1)
            player.hand.push(cardId)
            recovered++
            recoveredIds.push(cardId)
            log(state, `${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
        }
        notifyHandGained(state, owner, recovered)
        followUp(recoveredIds)
        return
}

const recoverMagicFromTrashHandler: ActionHandler<"recoverMagicFromTrash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 鎖縛の武舞台Lv1-2：お互い、トラッシュからカードを手札に戻せない
        if (hasGlobalConstraint(state, "noTrashRecovery")) {
            log(state, `${sourceName}：トラッシュからカードを手札に戻せないため発動しなかった。`)
            return
        }
        // interactiveTargets時は選択式（選択者=使用者。cardZone:"trash"）
        const player = state.players[owner]
        // colors（BS09-039探偵ペンタン＝紫／BS09-043クロックダイル＝紫・黄）：
        // トラッシュのカードが対象なのでカード静的な colors で判定する（配列＝いずれかでOR）
        const magicOk = (cardId: string): boolean =>
            getCard(cardId).type === "magic" &&
            (action.colors === undefined || action.colors.some((c) => getCard(cardId).colors.includes(c)))
        if (chosenCardIndex !== undefined) {
            const cardId = player.trashCards[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}のマジック回収：対象がいなかった。`)
                return
            }
            player.trashCards.splice(chosenCardIndex, 1)
            player.hand.push(cardId)
            log(state, `${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
            notifyHandGained(state, owner, 1)
            return
        }
        if (state.interactiveTargets) {
            const indices = player.trashCards
                .map((id, i) => ({ id, i }))
                .filter(({ id }) => magicOk(id))
                .map(({ i }) => i)
            if (indices.length >= 2) {
                requestCardChoice(
                    state,
                    owner,
                    `${sourceName}のマジック回収：手札に戻すカードを選んでください`,
                    "trash",
                    indices,
                    false,
                    action,
                    self,
                )
                return
            }
        }
        // 既存の決定的自動選択：トラッシュの末尾（新しい方）からマジックカードを探して
        // 1枚手札に戻す（recoverSpiritFromTrashと同じ考え方。本来は好きな1枚を選べるが
        // 決定的な自動選択で簡略化）
        let idx = -1
        for (let j = player.trashCards.length - 1; j >= 0; j--) {
            if (magicOk(player.trashCards[j]!)) {
                idx = j
                break
            }
        }
        if (idx === -1) {
            log(state, `${sourceName}のマジック回収：トラッシュに対象がいなかった。`)
            return
        }
        const cardId = player.trashCards[idx]!
        player.trashCards.splice(idx, 1)
        player.hand.push(cardId)
        log(state, `${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
        notifyHandGained(state, owner, 1)
        return
}

// トラッシュにある指定色のマジックカード1枚を、手札にあるときと同様にコストを支払って使用する
// （BS08堕天使ミカファールLv2-3）。フィールドのコアは使えずリザーブのみで支払う簡略化
const castMagicFromTrashByColorHandler: ActionHandler<"castMagicFromTrashByColor"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
        const player = state.players[owner]
        const isEligible = (cardId: string): boolean => {
            const c = getCard(cardId)
            return c.type === "magic" && (action.colorFilter === undefined || cardHasColor(c, action.colorFilter))
        }
        const perform = (idx: number): void => {
            const cardId = player.trashCards[idx]
            if (cardId === undefined) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            const card = getCard(cardId)
            const cost = effectiveCost(state, owner, card)
            if (player.reserve < cost) {
                log(state, `${sourceName}：${card.name}のコストを支払えないため発動しなかった。`)
                return
            }
            player.trashCards.splice(idx, 1)
            player.reserve -= cost
            player.trashCards.push(cardId)
            log(state, `${player.name}はトラッシュの${card.name}を手札にあるときと同様に使用した。（コスト${cost}）`)
            state.magicUsedThisTurn[owner] = (state.magicUsedThisTurn[owner] ?? 0) + 1
            const hasMain = card.effects.some((e) => e.kind === "magic" && e.timing === "main")
            const timing: "main" | "flash" = state.battle ? "flash" : hasMain ? "main" : "flash"
            // マジックミラー用の記録（GameEngine.doCastMagicと同じ理由でresolveMagicの後にする。
            // 解決中に書き換わっていれば（トラッシュから使ったカード自身がマジックミラーだった場合）上書きしない）
            const beforeLastMagicCast = state.lastMagicCast
            resolveMagic(state, owner, cardId, timing)
            if (state.lastMagicCast === beforeLastMagicCast) {
                state.lastMagicCast = { pid: owner, cardId, timing }
            }
        }
        if (chosenCardIndex !== undefined) {
            perform(chosenCardIndex)
            return
        }
        if (state.interactiveTargets) {
            const indices = player.trashCards
                .map((id, i) => ({ id, i }))
                .filter(({ id }) => isEligible(id))
                .map(({ i }) => i)
            if (indices.length === 0) {
                log(state, `${sourceName}：トラッシュに対象がいなかった。`)
                return
            }
            requestCardChoice(
                state,
                owner,
                `${sourceName}：トラッシュから使用するマジックを選んでください（選ばなければ発動しません）`,
                "trash",
                indices,
                true,
                action,
                self,
            )
            return
        }
        // 非interactive時：コストを支払える中で最もコストが高いものを自動選択（決定的簡略化）
        let bestIdx = -1
        let bestCost = -1
        for (let i = 0; i < player.trashCards.length; i++) {
            const cardId = player.trashCards[i]!
            if (!isEligible(cardId)) continue
            const cost = effectiveCost(state, owner, getCard(cardId))
            if (cost <= player.reserve && cost > bestCost) {
                bestCost = cost
                bestIdx = i
            }
        }
        if (bestIdx === -1) {
            log(state, `${sourceName}：トラッシュに対象がいなかった。`)
            return
        }
        perform(bestIdx)
}

// このフラッシュタイミングで相手が直前に使用したマジックの効果を、自分が使用したものとして
// もう一度だけ発揮する（BS08マジックミラー）。[マジックミラー]自身は対象にできない
const magicMirrorRepeatHandler: ActionHandler<"magicMirrorRepeat"> = (ctx, _action) => {
    const { state, owner, sourceName } = ctx
        const last = state.lastMagicCast
        if (!last || last.pid === owner) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        const lastCard = getCard(last.cardId)
        if (lastCard.name === "マジックミラー") {
            log(state, `${sourceName}：[マジックミラー]自身は対象にできない。`)
            return
        }
        log(state, `${sourceName}：${lastCard.name}の効果をもう一度発揮する。`)
        state.lastMagicCast = {
            pid: owner,
            cardId: last.cardId,
            timing: last.timing,
            ...(last.targetInstanceId !== undefined ? { targetInstanceId: last.targetInstanceId } : {}),
        }
        resolveMagic(state, owner, last.cardId, last.timing, last.targetInstanceId)
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

const recoverAllMagicFromTrashByColorChoiceHandler: ActionHandler<"recoverAllMagicFromTrashByColorChoice"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenOption } = ctx
        // 鎖縛の武舞台Lv1-2：お互い、トラッシュからカードを手札に戻せない
        if (hasGlobalConstraint(state, "noTrashRecovery")) {
            log(state, `${sourceName}：トラッシュからカードを手札に戻せないため発動しなかった。`)
            return
        }
        // 大天使ヴァリエル：緑/黄から1色を指定し、自分のトラッシュにある指定色のマジックカードすべてを手札に戻す
        const player = state.players[owner]
        const recoverColor = (color: Color): void => {
            const indices: number[] = []
            for (let i = 0; i < player.trashCards.length; i++) {
                const c = getCard(player.trashCards[i]!)
                if (c.type === "magic" && cardHasColor(c, color)) indices.push(i)
            }
            if (indices.length === 0) {
                log(state, `${sourceName}：色「${COLOR_LABELS[color]}」のマジックカードがトラッシュになかった。`)
                return
            }
            const names: string[] = []
            // 後ろのインデックスから順に取り除く（spliceでインデックスがずれないように）
            for (let i = indices.length - 1; i >= 0; i--) {
                const idx = indices[i]!
                const cardId = player.trashCards[idx]!
                player.trashCards.splice(idx, 1)
                player.hand.push(cardId)
                names.unshift(getCard(cardId).name)
            }
            log(
                state,
                `${player.name}は色「${COLOR_LABELS[color]}」のマジックカード「${names.join("、")}」をトラッシュから手札に戻した。`,
            )
            notifyHandGained(state, owner, names.length)
        }
        if (chosenOption !== undefined) {
            const entry = (Object.entries(COLOR_LABELS) as [Color, string][]).find(
                ([, label]) => label === chosenOption,
            )
            if (entry) recoverColor(entry[0])
            return
        }
        // 候補色（action.colorsのうちトラッシュに該当マジックがある色）を集計する
        const tally = new Map<Color, number>()
        for (const cardId of player.trashCards) {
            const c = getCard(cardId)
            if (c.type !== "magic") continue
            for (const color of action.colors) {
                if (cardHasColor(c, color)) tally.set(color, (tally.get(color) ?? 0) + 1)
            }
        }
        if (tally.size === 0) {
            log(state, `${sourceName}：対象の色のマジックカードがトラッシュになかった。`)
            return
        }
        if (state.interactiveTargets && tally.size > 1) {
            requestChoice(
                state,
                owner,
                `${sourceName}：色を1つ指定してください`,
                [],
                false,
                action,
                self,
                "option",
                [...tally.keys()].map((c) => COLOR_LABELS[c]),
            )
            return
        }
        // 非対話時（候補1色以下も含む）：該当枚数最多の色を自動選択（同数はaction.colorsの先頭を優先）
        let chosen: Color | null = null
        let best = 0
        for (const color of action.colors) {
            const count = tally.get(color) ?? 0
            if (count > best) {
                best = count
                chosen = color
            }
        }
        if (!chosen) {
            log(state, `${sourceName}：対象の色がなかった。`)
            return
        }
        recoverColor(chosen)
        return
}

// BS09-084ドラゴニックハウル：自分のデッキを上から1枚破棄し、**そのカードと同じコスト**の
// 相手のスピリットすべてを破壊する。デッキが0枚なら破棄できないので不発
const millThenDestroySameCostHandler: ActionHandler<"millThenDestroySameCost"> = (ctx) => {
    const { state, owner, sourceName, srcColors, srcType } = ctx
    const player = state.players[owner]
    const top = player.deck[0]
    if (top === undefined) {
        log(state, `${sourceName}：自分のデッキが0枚のため発動しなかった。`)
        return
    }
    const milled = millDeck(state, owner, 1, owner)
    if (milled === 0) {
        log(state, `${sourceName}：デッキを破棄できなかった。`)
        return
    }
    const cost = getCard(top).cost
    log(state, `${sourceName}：破棄したのは${getCard(top).name}（コスト${String(cost)}）。`)
    ctx.resolve({ type: "destroyAll", filter: { cost: { min: cost, max: cost } } }, {
        sourceColors: srcColors,
        sourceType: srcType,
    })
}

const millHandler: ActionHandler<"mill"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 【粉砕】：相手（side:"own"指定時は自分）のデッキ上からcount枚をトラッシュへ送る
        const targetPid = action.side === "own" ? owner : opponentOf(owner)
        millDeck(state, targetPid, action.count, owner, srcType ? { sourceType: srcType } : undefined)
        return
}

// BS08冥将アマイモン：自分のデッキを上から、指定系統を持つスピリットカードが出るまで（上限maxCount枚）破棄し、
// 出ればそのカード1枚を手札に戻す。デッキ切れ・上限到達まで出なければ手札には戻らない
const millUntilFamilyToHandHandler: ActionHandler<"millUntilFamilyToHand"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const wanted = Array.isArray(action.family) ? action.family : [action.family]
    let found: string | undefined
    let milled = 0
    for (let i = 0; i < action.maxCount; i++) {
        const cardId = player.deck.shift()
        if (cardId === undefined) break
        player.trashCards.push(cardId)
        milled++
        const candidate = getCard(cardId)
        if (candidate.type === "spirit" && wanted.some((f) => candidate.family.includes(f))) {
            found = cardId
            break
        }
    }
    log(state, `${sourceName}：デッキを上から${milled}枚破棄した。`)
    if (found === undefined) {
        log(state, `${sourceName}：対象のスピリットカードが出なかった。`)
        return
    }
    const idx = player.trashCards.lastIndexOf(found)
    if (idx === -1) return
    player.trashCards.splice(idx, 1)
    player.hand.push(found)
    log(state, `${player.name}は${sourceName}の効果で${getCard(found).name}を手札に戻した。`)
    notifyHandGained(state, owner, 1)
}

const millPerHandler: ActionHandler<"millPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const raw = countEffectCounter(state, owner, self, action.counter, srcType)
        let count = raw * (action.multiplier ?? 1)
        // マキシマムブレイク（kind:"millCapBonus"）：持ち主のスピリットの効果によるデッキ破棄枚数の
        // 上限（cap）に+amountする
        if (action.cap !== undefined) count = Math.min(count, action.cap + millCapBonusFor(state, owner))
        if (count === 0) {
            log(state, `${sourceName}の可変粉砕：カウントが0のため粉砕しなかった。`)
            return
        }
        const targetPid = action.side === "own" ? owner : opponentOf(owner)
        millDeck(state, targetPid, count, owner, srcType ? { sourceType: srcType } : undefined)
        return
}

const millPerLoserCostHandler: ActionHandler<"millPerLoserCost"> = (ctx) => {
    const { state, owner, sourceName, srcType } = ctx
        // 名誉ある御前試合：直前のバトルで破壊された相手のスピリットのコストと同じ枚数、相手のデッキを破棄する
        const cost = state.lastBattleDestroyedCost
        if (cost === 0) {
            log(state, `${sourceName}：直前のバトルで破壊されたスピリットがいなかった。`)
            return
        }
        millDeck(state, opponentOf(owner), cost, owner, srcType ? { sourceType: srcType } : undefined)
        return
}

const returnToHandHandler: ActionHandler<"returnToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // filter指定時は対象自動選択・明示ターゲット（誘発が渡すtargetInstanceId）の両方に絞り込みを適用する
        // （BS06レインディア：ブロックしたスピリットが系統「空牙」のときのみ手札に戻す）
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}の手札戻し：BP参照元がいなかった。`)
            return
        }
        // 「〜することで」の任意コスト（BS07剣王獣ビャク・ガロウLv2）。
        // **A（コスト）と B（効果）の両方が成立するときだけ払う**（COST_MODEL.md §1）。
        // 以前はここで払ってから対象を探していたため、戻せる相手がいなくてもコアを失っていた。
        // 体数のしきい値は「候補が1体以上」。B を体数ぶん満たせるかまで求めるかは保留中（COST_MODEL.md §1）
        if (action.costReserveToTrash !== undefined) {
            const player = state.players[owner]
            if (player.reserve < action.costReserveToTrash) {
                log(state, `${sourceName}：リザーブのコアが足りず発動しなかった。`)
                return
            }
            const costLimitBp = action.maxBpFromSelf && self ? effectiveBp(state, owner, self) : Infinity
            const costMatches = (s: CardInstance): boolean =>
                matchesTarget(state, opp, s, filter, self?.instanceId)
            const hasTarget =
                targetInstanceId !== undefined
                    ? findSpiritAny(state, targetInstanceId) !== undefined
                    : (action.anySide
                          ? pickAnySideCandidates(
                                state,
                                owner,
                                (s) => effectiveBp(state, owner, s) <= costLimitBp && costMatches(s),
                                srcColors,
                                srcType,
                                "bounce",
                            )
                          : pickEnemyCandidates(state, opp, costLimitBp, costMatches, srcColors, srcType, "bounce")
                      ).length >= 1
            if (!hasTarget) {
                log(state, `${sourceName}：手札に戻せる対象がいないため発動しなかった。`)
                return
            }
            player.reserve -= action.costReserveToTrash
            player.trashCores += action.costReserveToTrash
            log(state, `${player.name}はリザーブのコア${action.costReserveToTrash}個をトラッシュに置いた。`)
        }
        // 対象指定時はその1体のみ手札へ戻す
        if (targetInstanceId) {
            const found = findSpiritAny(state, targetInstanceId)
            if (!found) {
                log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                return
            }
            const resisted = resistanceAgainst(state, found.pid, found.inst, attemptOf(ctx, "bounce", "targeted"))
            if (resisted) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                return
            }
            if (!matchesTarget(state, found.pid, found.inst, filter, self?.instanceId)) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の対象条件を満たさない。`)
                return
            }
            returnSpiritToHand(state, found.pid, found.inst, sourceName)
            return
        }
        // maxBpFromSelf：selfの実効BP以下の相手のみ（selfが「召喚されたスピリット」になる
        // fieldEvent "ownSpiritSummoned" 用。BS04鋼葉の樹林Lv2）
        if (action.maxBpFromSelf && !self) {
            log(state, `${sourceName}の手札戻し：BP参照元がいなかった。`)
            return
        }
        const limitBp = action.maxBpFromSelf && self ? effectiveBp(state, owner, self) : Infinity
        // countPerOpponentNexus指定時はcountを無視し、相手のネクサス数を対象数として使う
        // （BS05幻獣王リーン：相手のネクサス1つにつき）
        const resolvedCount = action.countPerOpponentNexus
            ? state.players[opp].field.nexuses.length
            : action.count
        if (resolvedCount === 0) {
            log(state, `${sourceName}の手札戻し：相手にネクサスがなかった。`)
            return
        }
        // anySide：自分/相手どちらのスピリットも対象にできる（destroy等のanySideと同じ非対称ルール。
        // 相手側候補には装甲・マジック効果耐性を尊重し、自分側には適用しない）
        if (action.anySide) {
            const matchesBp = (s: CardInstance) =>
                effectiveBp(state, owner, s) <= limitBp && matchesTarget(state, opp, s, filter, self?.instanceId)
            const anySideCandidates = pickAnySideCandidates(state, owner, matchesBp, srcColors, srcType, "bounce")
            if (
                state.interactiveTargets &&
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}の手札戻し：対象を選んでください`,
                    anySideCandidates,
                    { ...action, count: 1 },
                    resolvedCount > 1
                        ? { ...action, count: resolvedCount - 1, countPerOpponentNexus: false }
                        : null,
                )
            ) {
                return
            }
            for (let i = 0; i < resolvedCount; i++) {
                const target = pickAnySideByBp(state, owner, limitBp, matchesBp, srcColors, srcType, "bounce")
                if (!target) {
                    log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                    break
                }
                returnSpiritToHand(state, target.pid, target.inst, sourceName)
            }
            return
        }
        // バウンス耐性（against:"bounce"。BS06恐竜姫ジュラ）は、候補列挙へ op:"bounce" を渡すことで効く
        const matchesFilter = (s: CardInstance) => matchesTarget(state, opp, s, filter, self?.instanceId)
        if (state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, limitBp, matchesFilter, srcColors, srcType, "bounce")
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}の手札戻し：対象を選んでください`,
                    candidates,
                    { ...action, count: 1 },
                    resolvedCount > 1 ? { ...action, count: resolvedCount - 1, countPerOpponentNexus: false } : null,
                )
            ) {
                return
            }
        }
        // 未指定時は相手フィールドのBP最大をresolvedCount回自動選択
        for (let i = 0; i < resolvedCount; i++) {
            const target = pickEnemyByBp(state, opp, limitBp, matchesFilter, srcColors, srcType, "bounce")
            if (!target) {
                log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                break
            }
            returnSpiritToHand(state, opp, target, sourceName)
        }
        return
}

const returnAllToHandHandler: ActionHandler<"returnAllToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // filter指定時はさらにTargetFilterの軸で絞り込む（既存costFilterは残す。BS06鎧神機ヴァルハランスLv3＝BP4000以下）
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}：BP参照元がいなかった。`)
            return
        }
        // 指定側のスピリットのうちコスト条件を満たすものすべてを各持ち主の手札へ戻す（相手側のみ装甲・免疫を尊重）
        const sides: PlayerId[] = action.side === "both" ? bothSidesPids(state, srcType) : [opp]
        let returned = 0
        for (const pid of sides) {
            // returnSpiritToHand が field.spirits を破壊的に変更するため、対象をスナップショットしてから戻す
            const targets = state.players[pid].field.spirits.filter((s) => {
                // 場のスピリットのコストを条件にする判定なので、道化師クランの付与コストも見る
                if (!instMatchesCostFilter(s, action.costFilter)) return false
                if (!matchesTarget(state, pid, s, filter, self?.instanceId)) return false
                if (isResisted(state, pid, s, attemptOf(ctx, "bounce", "area"))) return false
                return true
            })
            for (const s of targets) {
                returnSpiritToHand(state, pid, s, sourceName)
                returned++
            }
        }
        if (returned === 0) log(state, `${sourceName}：手札に戻す対象がいなかった。`)
        return
}

// グラシアルブレス：自分のスピリットcount体をデッキの下へ戻すことをコストに、
// 相手のスピリットcount体もデッキの下へ戻す。自分がcount体戻せないなら不発。
// 「好きな順番で」はコスト最小から（自分）／実効BP上位から（相手）の決定的簡略化
const returnBothSidesToDeckBottomHandler: ActionHandler<"returnBothSidesToDeckBottom"> = (ctx, action) => {
    const { state, owner, opp, sourceName, srcColors, srcType } = ctx
    const ownSpirits = [...state.players[owner].field.spirits]
    if (ownSpirits.length < action.count) {
        log(state, `${sourceName}：自分のスピリットが${action.count}体いないため発動しなかった。`)
        return
    }
    ownSpirits.sort((a, b) => getCard(a.cardId).cost - getCard(b.cardId).cost)
    for (const inst of ownSpirits.slice(0, action.count)) {
        returnSpiritToDeckBottom(state, owner, inst, sourceName)
    }
    let returned = 0
    for (let i = 0; i < action.count; i++) {
        const target = pickEnemyByBp(state, opp, Infinity, undefined, srcColors, srcType, "bounce")
        if (!target) break
        returnSpiritToDeckBottom(state, opp, target, sourceName)
        returned++
    }
    if (returned === 0) {
        log(state, `${sourceName}：相手のスピリットがいなかった。`)
    }
}

// BS09-039探偵ペンタンLv1-2：自分の手札の指定カード名1枚を破棄することで、相手の手札1枚を
// 「内容を見ないで選び」その内容だけを見る。盤面は動かない。
// **どの1枚を選ぶかは今のところ先頭で固定**（裏向きの相手手札を選ぶUIが未実装のため。
// 選び方が情報を持たない＝どれを選んでも公平なので、決定的にしても不利益はない）
const costDiscardNamedThenPeekHandler: ActionHandler<"costDiscardNamedThenPeek"> = (ctx, action) => {
    const { state, owner, opp, sourceName } = ctx
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
    const peeked = target.hand[0]!
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
    // トラッシュのカードと同じく、手札のカードはカード静的なキーワード保有・種別で判定する。
    // cardType 省略時はスピリットカード（従来どおり）
    const eligible = (cardId: string): boolean =>
        getCard(cardId).type === (action.cardType ?? "spirit") &&
        (action.keyword === undefined || hasKeyword(cardId, action.keyword))
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
                ? `【${KEYWORDS[action.keyword].label}】を持つ${action.cardType ?? "スピリット"}カード`
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

// BS06颶風高原Lv2：このバトル中に自分の【暴風】で疲労させた相手のスピリットすべてをデッキの下へ。
// 戻す順番は選べず記録順（プレイヤー選択の決定的簡略化）
const returnBofuExhaustedToDeckBottomHandler: ActionHandler<"returnBofuExhaustedToDeckBottom"> = (ctx) => {
    const { state, owner, sourceName, srcColors, srcType } = ctx
        const records = state.bofuExhaustedThisBattle
        if (records.length === 0) {
            log(state, `${sourceName}：【暴風】で疲労させた相手のスピリットがいなかった。`)
            return
        }
        let returned = 0
        for (const rec of [...records]) {
            if (rec.pid === owner) continue // 自分側が疲労した記録は対象外（「相手のスピリット」）
            const inst = state.players[rec.pid].field.spirits.find((sp) => sp.instanceId === rec.instanceId)
            if (!inst) continue // 既に場から居ない個体は飛ばす
            // **対象を記録から引いているので、他のハンドラのように候補選びの中で耐性を弾けない**。
            // 相手側スピリットへの範囲効果として、returnAllToHand と同じ耐性判定をここで行う
            const resisted = resistanceAgainst(state, rec.pid, inst, attemptOf(ctx, "bounce", "area"))
            if (resisted) {
                log(state, `${getCard(inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                continue
            }
            returnSpiritToDeckBottom(state, rec.pid, inst, sourceName)
            returned += 1
        }
        if (returned === 0) {
            log(state, `${sourceName}：デッキの下に戻せるスピリットがいなかった。`)
        }
        return
}

const returnToDeckTopHandler: ActionHandler<"returnToDeckTop"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // count 指定（BS07ブリシンガメンの首飾り＝3体）：1体ぶんの処理を count 回繰り返す。
        // 戻す順番は選べず、毎回その時点の実効BP最大から（プレイヤー選択の決定的簡略化）
        if (action.count !== undefined && action.count > 1 && targetInstanceId === undefined) {
            const { count: _n, ...single } = action
            for (let i = 0; i < action.count; i++) {
                ctx.resolve(single, { sourceColors: srcColors, sourceType: srcType })
                if (state.pendingChoice || state.winner) return
            }
            return
        }
        // filter（BS09-X38要塞騎神オーディーンType-X＝【転召】を持たない相手3体）：候補の絞り込み。
        // 自動選択・明示ターゲットの両方に効かせる
        const resolvedFilter = action.filter === undefined ? undefined : normalizeFilter(ctx, { filter: action.filter })
        const filterOk = (pid: PlayerId, s: CardInstance): boolean =>
            resolvedFilter === undefined ||
            (resolvedFilter !== SELF_REQUIRED && matchesTarget(state, pid, s, resolvedFilter, self?.instanceId))
        // anySide：自分/相手どちらのスピリットも対象にできる（destroy等のanySideと同じ非対称ルール。
        // 相手側候補には装甲・マジック効果耐性を尊重し、自分側には適用しない）
        if (targetInstanceId === undefined && state.interactiveTargets) {
            const candidates = (action.anySide
                ? pickAnySideCandidates(state, owner, () => true, srcColors, srcType, "bounce")
                : pickEnemyCandidates(state, opp, Infinity, (s) => filterOk(opp, s), srcColors, srcType, "bounce")
            ).filter((s) => action.anySide === undefined || filterOk(opp, s))
            if (candidates.length >= 2) {
                // chooserIsTarget（BS07ブリシンガメンの首飾り）：「**相手は**、相手のスピリット3体を〜戻す」。
                // 選ぶのは戻される側だが、解決は発生源の持ち主の効果として行う（actorPid）
                requestChoice(
                    state,
                    owner,
                    action.chooserIsTarget
                        ? `${sourceName}：デッキの上に戻す自分のスピリットを選んでください`
                        : `${sourceName}のデッキ戻し：対象を選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                    "target",
                    undefined,
                    action.chooserIsTarget ? opp : undefined,
                )
                return
            }
        }
        const found = targetInstanceId
            ? findSpiritAny(state, targetInstanceId)
            : action.anySide
              ? pickAnySideByBp(state, owner, Infinity, () => true, srcColors, srcType, "bounce")
              : (() => {
                    const t = pickEnemyByBp(state, opp, Infinity, (sp) => filterOk(opp, sp), srcColors, srcType, "bounce")
                    return t ? { pid: opp, inst: t } : null
                })()
        if (!found) {
            log(state, `${sourceName}のデッキ戻し：対象がいなかった。`)
            return
        }
        // targetInstanceId 指定（＝明示的に選ばれた対象）のときだけ改めて耐性を見る。
        // 自動選択の経路は候補選びの中で既に弾かれている
        const deckTopResisted = targetInstanceId
            ? resistanceAgainst(state, found.pid, found.inst, attemptOf(ctx, "bounce", "targeted"))
            : null
        if (deckTopResisted) {
            log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${deckTopResisted.label}）。`)
            return
        }
        returnSpiritToDeckTop(state, found.pid, found.inst, sourceName)
        return
}

const returnSelfToHandHandler: ActionHandler<"returnSelfToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (!self) return
        const player = state.players[owner]
        // 破壊時に呼ばれる。このとき自分のカードは**破壊待機状態でまだフィールドにいる**ので、
        // そこから手札へ移す（TIMING_CHART.md §1.5。乗っていたコアはリザーブへ）。
        // 破壊待機状態を解いてから抜けるので、あとで commitPendingDestruction がトラッシュへ送ることはない
        if (self.pendingDestruction) {
            const fieldIdx = player.field.spirits.findIndex((s) => s.instanceId === self.instanceId)
            if (fieldIdx >= 0) {
                player.field.spirits.splice(fieldIdx, 1)
                player.reserve += self.cores
            }
            delete self.pendingDestruction
            player.hand.push(self.cardId)
            log(state, `${getCard(self.cardId).name}は手札に戻った。`)
            notifyHandGained(state, owner, 1)
            return
        }
        // 破壊以外の経路（既にトラッシュへ送られている場合）への保険
        const idx = player.trashCards.lastIndexOf(self.cardId)
        if (idx >= 0) {
            player.trashCards.splice(idx, 1)
            player.hand.push(self.cardId)
            log(state, `${getCard(self.cardId).name}は手札に戻った。`)
            notifyHandGained(state, owner, 1)
        }
        return
}

const handMagicToTegamotoDrawHandler: ActionHandler<"handMagicToTegamotoDraw"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // マジックブック：自分の手札にあるマジックカードを好きなだけ手元(tegamoto)に置き、
        // 置いた枚数ぶんデッキから引く。**置き終わってからまとめて引く**のが要点で、
        // 1枚ごとに引くと引いたマジックカードをそのまま次に置けてしまう
        // （drawPerHandDiscard と同じ不具合。2026-08-10 修正）
        const player = state.players[owner]
        const placed = action.placedSoFar ?? 0
        const finish = (): void => {
            if (placed === 0) {
                log(state, `${sourceName}：手元に置かなかった。`)
                return
            }
            log(state, `${sourceName}：手元に置いた${placed}枚ぶんデッキから引く。`)
            draw(state, owner, placed)
        }
        if (chosenCardIndex !== undefined) {
            const cardId = player.hand[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}：対象がいなかった。`)
                finish()
                return
            }
            player.hand.splice(chosenCardIndex, 1)
            player.tegamoto.push(cardId)
            log(state, `${player.name}は${getCard(cardId).name}を手元に置いた。`)
            // ここでは引かない。続けて置くか再度尋ねる（awaitingSkip は落とす）
            const { awaitingSkip: _dropped, ...rest } = action
            ctx.resolve({ ...rest, placedSoFar: placed + 1 })
            return
        }
        // スキップされて戻ってきた＝これ以上置かない。ここで初めて引く
        if (action.awaitingSkip) {
            finish()
            return
        }
        const indices: number[] = []
        for (let i = 0; i < player.hand.length; i++) {
            if (getCard(player.hand[i]!).type === "magic") indices.push(i)
        }
        if (indices.length === 0) {
            // 手札のマジックを出し切った場合もここへ来る（置いたぶんは引く）
            if (placed === 0) log(state, `${sourceName}：手札にマジックカードがなかった。`)
            else finish()
            return
        }
        if (state.interactiveTargets) {
            requestCardChoice(
                state,
                owner,
                `${sourceName}：手元に置くマジックカードを選んでください（選ばなければ終了してドローに移ります）`,
                "hand",
                indices,
                true,
                { ...action, placedSoFar: placed, awaitingSkip: true },
                self,
                // 候補が1枚でも「置かない」を選べるようにする（「好きなだけ」なので0枚も選択肢）
                true,
                // スキップ＝終了。まとめて引くためにハンドラへ戻す
                true,
            )
            return
        }
        // 非interactive時：手札のマジックカードすべてを一括で手元へ移動し、同数ドロー（決定的簡略化）
        const movedNames: string[] = []
        for (let i = player.hand.length - 1; i >= 0; i--) {
            const cardId = player.hand[i]!
            if (getCard(cardId).type !== "magic") continue
            player.hand.splice(i, 1)
            player.tegamoto.push(cardId)
            movedNames.unshift(getCard(cardId).name)
        }
        if (movedNames.length > 0) draw(state, owner, movedNames.length)
        log(
            state,
            `${player.name}は手元にマジックカード「${movedNames.join("、")}」を置き、デッキから${movedNames.length}枚引いた。`,
        )
        return
}

const revealHandMagicToTegamotoDrawHandler: ActionHandler<"revealHandMagicToTegamotoDraw"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
        // 占いペンタン：handMagicToTegamotoDrawの単発版。自分の手札にあるマジックカード1枚を
        // オープンして手元に置き、1枚ドローする（「〜することで」の任意コストはtriggered.optionalで表現）
        const player = state.players[owner]
        if (chosenCardIndex !== undefined) {
            const cardId = player.hand[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            player.hand.splice(chosenCardIndex, 1)
            player.tegamoto.push(cardId)
            draw(state, owner, 1)
            log(
                state,
                `${player.name}は${getCard(cardId).name}をオープンして手元に置き、デッキから1枚引いた。`,
            )
            return
        }
        const indices: number[] = []
        for (let i = 0; i < player.hand.length; i++) {
            if (getCard(player.hand[i]!).type === "magic") indices.push(i)
        }
        if (indices.length === 0) {
            log(state, `${sourceName}：手札にマジックカードがなかった。`)
            return
        }
        if (state.interactiveTargets) {
            requestCardChoice(
                state,
                owner,
                `${sourceName}：オープンして手元に置くマジックカードを選んでください`,
                "hand",
                indices,
                false,
                action,
                self,
            )
            return
        }
        // 非interactive時：手札末尾（新しい方）の該当カード1枚を機械的に選ぶ（決定的簡略化）
        const idx = indices[indices.length - 1]!
        const cardId = player.hand[idx]!
        player.hand.splice(idx, 1)
        player.tegamoto.push(cardId)
        draw(state, owner, 1)
        log(
            state,
            `${player.name}は${getCard(cardId).name}をオープンして手元に置き、デッキから1枚引いた。`,
        )
        return
}

const discardOpponentTegamotoDestroyPerHandler: ActionHandler<"discardOpponentTegamotoDestroyPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 透明人間エクリア：相手の手元(tegamoto)にあるカードすべてを相手のトラッシュへ破棄し、
        // その枚数ぶん相手のスピリットを破壊する（既存destroyアクションへcount委譲。BP不問=maxBpなし）
        const target = state.players[opp]
        const count = target.tegamoto.length
        if (count === 0) {
            log(state, `${sourceName}：${target.name}の手元にカードがなかった。`)
            return
        }
        const discardedNames = target.tegamoto.map((cardId) => getCard(cardId).name)
        target.trashCards.push(...target.tegamoto)
        target.tegamoto = []
        target.tegamotoPlayable = [] // 手元が空になるので使用権も残さない
        log(
            state,
            `${sourceName}：${target.name}の手元「${discardedNames.join("、")}」を破棄した。`,
        )
        ctx.resolve({ type: "destroy", count })
        return
}

const handlers = {
    draw: drawHandler,
    drawPer: drawPerHandler,
    drawUpTo: drawUpToHandler,
    trashSpiritsToDeckBottom: trashSpiritsToDeckBottomHandler,
    discardHandAll: discardHandAllHandler,
    discardOpponent: discardOpponentHandler,
    discardOpponentDownTo: discardOpponentDownToHandler,
    noop: noopHandler,
    discardSelfOne: discardSelfOneHandler,
    discardSelfChoose: discardSelfChooseHandler,
    discardHandNexusesThenDraw: discardHandNexusesThenDrawHandler,
    discardHandNexusToVoidCoreSelf: discardHandNexusToVoidCoreSelfHandler,
    drawThenDiscard: drawThenDiscardHandler,
    deckReveal: deckRevealHandler,
    revealAndSummonKeyword: revealAndSummonKeywordHandler,
    revealAndSummonAllByFamily: revealAndSummonAllByFamilyHandler,
    revealReturnToDeck: revealReturnToDeckHandler,
    revealDiscardRest: revealDiscardRestHandler,
    recoverSpiritFromTrash: recoverSpiritFromTrashHandler,
    recoverMagicFromTrash: recoverMagicFromTrashHandler,
    recoverAllMagicFromTrashByColorChoice: recoverAllMagicFromTrashByColorChoiceHandler,
    castMagicFromTrashByColor: castMagicFromTrashByColorHandler,
    magicMirrorRepeat: magicMirrorRepeatHandler,
    drawPerHandDiscard: drawPerHandDiscardHandler,
    millThenDestroySameCost: millThenDestroySameCostHandler,
    mill: millHandler,
    millUntilFamilyToHand: millUntilFamilyToHandHandler,
    millPer: millPerHandler,
    millPerLoserCost: millPerLoserCostHandler,
    returnToHand: returnToHandHandler,
    returnAllToHand: returnAllToHandHandler,
    returnToDeckTop: returnToDeckTopHandler,
    returnBofuExhaustedToDeckBottom: returnBofuExhaustedToDeckBottomHandler,
    costDiscardNamedThenPeek: costDiscardNamedThenPeekHandler,
    costDiscardHandKeywordThenDraw: costDiscardHandKeywordThenDrawHandler,
    handToOwnDeckTop: handToOwnDeckTopHandler,
    opponentHandToDeckTop: opponentHandToDeckTopHandler,
    returnBothSidesToDeckBottom: returnBothSidesToDeckBottomHandler,
    returnSelfToHand: returnSelfToHandHandler,
    handMagicToTegamotoDraw: handMagicToTegamotoDrawHandler,
    revealHandMagicToTegamotoDraw: revealHandMagicToTegamotoDrawHandler,
    discardOpponentTegamotoDestroyPer: discardOpponentTegamotoDestroyPerHandler,
} satisfies Partial<ActionRegistry>

export default handlers
