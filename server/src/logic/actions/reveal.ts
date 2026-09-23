// デッキを公開して、手札に加える・召喚する・配置する・戻すアクション。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { GameState, PlayerId } from "../../type"
import { createInstance, currentLevel, getCard, log, minLevelCores, pushResumeFrames, suspend } from "../GameState"
import { summonFreeFromTrashIndex, fireSummonTrigger, fireSummonSequence, resolveTensho, notifyHandGained, requestCardChoice, requestActivationConfirm } from "../EffectModules"
import { notifyNexusDeployed, resolveMagicEffects } from "../triggers"
import { KEYWORDS, cardHasColor, countSymbols, hasKeyword, instHasColor, summonByEffectBlocked } from "../../../../shared/rules"

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
                // ownSymbols：自分のフィールドの指定色シンボル数（SD02-005 天使ヘルヴィム「自分の黄のシンボル1つにつき」）。
                // 軽減の集計と同じ countSymbols を使うので、シンボル固定（symbolFix）や
                // 追加シンボル（ダブルハート）もそのまま反映される
                : "ownSymbols" in countPer
                  ? countSymbols(player, [countPer.ownSymbols])
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
            // colorFilter：カードの色で絞る（SD01-034 エクストラドロー＝赤のスピリットカードのみ）。
            // familyFilter と同じくカード静的な色だけを見る（デッキ内にインスタンスが無いため）
            (action.colorFilter === undefined || getCard(id).colors.includes(action.colorFilter)) &&
            // 器BL：costFilter＝カード静的なコストが完全一致するもののみ（BS13-034ミノガメン：コスト2）
            (action.costFilter === undefined || getCard(id).cost === action.costFilter) &&
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
        // familyFilter指定時（BS13-074ゾディアックコンダクト）はkeywordの代わりに系統（配列＝OR）で絞る
        const matches = (id: string): boolean => {
            if (getCard(id).type !== "spirit") return false
            if (action.familyFilter !== undefined) {
                const wanted = Array.isArray(action.familyFilter) ? action.familyFilter : [action.familyFilter]
                return wanted.some((f) => getCard(id).family.includes(f))
            }
            return action.keyword !== undefined && hasKeyword(id, action.keyword)
        }
        const indices = revealed.map((id, i) => ({ id, i })).filter((x) => matches(x.id)).map((x) => x.i)
        if (indices.length === 0) {
            for (const id of revealed) player.trashCards.push(id)
            const label = action.familyFilter !== undefined
                ? "指定系統を持つスピリットカード"
                : `【${KEYWORDS[action.keyword!].label}】を持つスピリットカード`
            log(state, `${sourceName}：${label}がなかった。残り${revealed.length}枚をトラッシュに置いた。`)
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
    const { state, owner, self, sourceName } = ctx
        const player = state.players[owner]
        // countFromSelfLevel（BS11-007 輝龍皇ヘリオスドラゴン＝「このスピリットのLvと同じ枚数」）
        const revealCount = action.countFromSelfLevel && self ? currentLevel(self).level : action.count
        const revealed = player.deck.splice(0, revealCount)
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
            // costFilter（BS11-007＝コスト7以下）はカード静的なコストで判定する
            const costOk =
                action.costFilter === undefined ||
                ((action.costFilter.max === undefined || card.cost <= action.costFilter.max) &&
                    (action.costFilter.min === undefined || card.cost >= action.costFilter.min))
            if (card.type !== "spirit" || !wanted.some((f) => card.family.includes(f)) || !costOk || player.reserve < maintain) {
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

// BS15-009虚龍帝カタストロフドラゴン：デッキ上からcount枚を公開し、その中の指定キーワードを静的に
// 持つスピリットカードすべてを、コストを支払わず召喚する。revealAndSummonAllByFamilyと違い【転召】も
// 『召喚時』効果も**通常どおり発揮する**（効果文に「発揮されない」の記載が無いため）。
// pendingCardIds指定時は召喚1体ごとの中断（【転召】選択・召喚時効果の選択）から再開する
const revealAndSummonAllByKeywordHandler: ActionHandler<"revealAndSummonAllByKeyword"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
    const player = state.players[owner]
    let remaining: string[]
    if (action.pendingCardIds !== undefined) {
        remaining = action.pendingCardIds
    } else {
        const revealed = player.deck.splice(0, action.count)
        if (revealed.length === 0) {
            log(state, `${sourceName}：デッキにカードがないため公開できなかった。`)
            return
        }
        log(
            state,
            `${player.name}はデッキ上${revealed.length}枚（${revealed.map((id) => getCard(id).name).join("、")}）を公開した。`,
        )
        const matched: string[] = []
        const discarded: string[] = []
        for (const cardId of revealed) {
            const card = getCard(cardId)
            if (card.type === "spirit" && hasKeyword(cardId, action.keyword)) matched.push(cardId)
            else discarded.push(cardId)
        }
        if (discarded.length > 0) {
            player.trashCards.push(...discarded)
            log(state, `${player.name}は残り${discarded.length}枚をトラッシュに置いた。`)
        }
        remaining = matched
    }
    const summonNext = (): void => {
        while (remaining.length > 0) {
            const [cardId, ...rest] = remaining
            remaining = rest
            const card = getCard(cardId!)
            const maintain = minLevelCores(card)
            if (player.reserve < maintain) {
                player.trashCards.push(cardId!)
                log(state, `${sourceName}：コアが足りず${card.name}を召喚できなかった。`)
                continue
            }
            player.reserve -= maintain
            const inst = createInstance(cardId!, state.turn, maintain)
            player.field.spirits.push(inst)
            log(state, `${player.name}は${sourceName}の効果で${card.name}をコストを支払わずに召喚した。`)
            if (!state.winner) resolveTensho(state, owner, inst)
            if (state.pendingChoice) {
                pushResumeFrames(state, [
                    { kind: "action", selfInstanceId: inst.instanceId, action: { type: "summonSequence" } },
                    ...(remaining.length > 0
                        ? [{ kind: "action" as const, selfInstanceId: self ? self.instanceId : null, actorPid: owner, action: { ...action, pendingCardIds: remaining } }]
                        : []),
                ])
                return
            }
            if (!state.winner) fireSummonSequence(state, owner, inst)
            if (state.pendingChoice) {
                if (remaining.length > 0) {
                    pushResumeFrames(state, [
                        { kind: "action", selfInstanceId: self ? self.instanceId : null, actorPid: owner, action: { ...action, pendingCardIds: remaining } },
                    ])
                }
                return
            }
            if (state.winner) return
        }
    }
    summonNext()
}

// BS12-074 スターリードロー：デッキ上からcount枚をオープンし、系統一致のスピリット/（includeBraves時は）
// ブレイヴカードすべてを手札に加える。残りはトラッシュへ破棄する（召喚せず手札に加えるだけの版）
// 器BS16（BS16-007オーガ・ドラゴンLv1-2）：デッキ上からcount枚をオープンし、バースト効果を
// 持つカード1枚だけを手札に加える（複数あれば公開順の先頭。決定的簡略化）。残りは公開順のまま
// デッキの下へ戻す（「好きな順番で」は結果に影響しないため順番選択UIは持たない）
const revealTopBurstOneToHandRestBottomHandler: ActionHandler<"revealTopBurstOneToHandRestBottom"> = (ctx, action) => {
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
    const burstIndex = revealed.findIndex((cardId) => getCard(cardId).effects.some((e) => e.kind === "burst"))
    if (burstIndex === -1) {
        log(state, `${sourceName}：バースト効果を持つカードがなかった。`)
    } else {
        const cardId = revealed.splice(burstIndex, 1)[0]!
        player.hand.push(cardId)
        log(state, `${player.name}は${sourceName}の効果で、${getCard(cardId).name}を手札に加えた。`)
        notifyHandGained(state, owner, 1)
    }
    if (revealed.length > 0) {
        player.deck.push(...revealed)
        log(state, `${player.name}は残り${revealed.length}枚をデッキの下に戻した。`)
    }
}

const revealTopFamilyToHandHandler: ActionHandler<"revealTopFamilyToHand"> = (ctx, action) => {
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
    let gainedCount = 0
    let discardedCount = 0
    for (const cardId of revealed) {
        const card = getCard(cardId)
        const typeOk = card.type === "spirit" || (action.includeBraves && card.type === "brave")
        if (!typeOk || !wanted.some((f) => card.family.includes(f))) {
            player.trashCards.push(cardId)
            discardedCount++
            continue
        }
        player.hand.push(cardId)
        gainedCount++
        log(state, `${player.name}は${sourceName}の効果で、${card.name}を手札に加えた。`)
    }
    if (gainedCount === 0) {
        log(state, `${sourceName}：条件を満たすカードがなかった。`)
    }
    if (discardedCount > 0) {
        log(state, `${player.name}は残り${discardedCount}枚をトラッシュに置いた。`)
    }
    if (gainedCount > 0) notifyHandGained(state, owner, gainedCount)
    return
}

// BS14-086運命のルーレット：自分のデッキを上から1枚オープンし、無条件に手札へ加える。
// それが指定色（省略時は色不問）のマジックカードだったときだけ、自分のスピリット1体を回復させる
const revealTopToHandThenRefreshOwnHandler: ActionHandler<"revealTopToHandThenRefreshOwn"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const cardId = player.deck.shift()
    if (cardId === undefined) {
        log(state, `${sourceName}：デッキが尽きているため公開できなかった。`)
        return
    }
    const card = getCard(cardId)
    player.hand.push(cardId)
    log(state, `${player.name}はデッキを上から1枚（${card.name}）オープンし、手札に加えた。`)
    notifyHandGained(state, owner, 1)
    const matches = card.type === "magic" && (action.colorFilter === undefined || card.colors.includes(action.colorFilter))
    if (matches) {
        ctx.resolve({ type: "refreshOne" })
    }
}

// BS15-074三札之術メイン：自分のデッキを上から1枚オープンする。指定色のスピリットカードのときだけ
// 手札に加え、それ以外（色不一致・スピリット以外）のときはデッキの上に戻す
// （revealTopToHandThenRefreshOwnと違い、手札に残るかどうか自体が条件付き）
const revealTopToHandIfColorSpiritElseReturnToDeckHandler: ActionHandler<"revealTopToHandIfColorSpiritElseReturnToDeck"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const cardId = player.deck.shift()
    if (cardId === undefined) {
        log(state, `${sourceName}：デッキが尽きているため公開できなかった。`)
        return
    }
    const card = getCard(cardId)
    if (card.type === "spirit" && cardHasColor(card, action.colorFilter)) {
        player.hand.push(cardId)
        log(state, `${player.name}はデッキを上から1枚（${card.name}）オープンし、手札に加えた。`)
        notifyHandGained(state, owner, 1)
    } else {
        player.deck.unshift(cardId)
        log(state, `${player.name}はデッキを上から1枚（${card.name}）オープンし、デッキの上に戻した。`)
    }
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
    action: { returnToDeckBottomAtEndStep?: true; familyFilter?: unknown },
    cardId: string,
): void {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    // BS12-072海賊王の秘宝島Lv1：効果による召喚が両陣営で禁じられている間は発動しない
    if (summonByEffectBlocked(state)) {
        log(state, `${sourceName}：効果による召喚が禁じられているため発動しなかった。`)
        player.trashCards.push(cardId)
        return
    }
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
    // familyFilter指定時（BS13-074ゾディアックコンダクト）は系統版なので、キーワード版のような
    // 「【転召】を発揮したものとして扱う」特例は無い。**通常どおり【転召】を解決し**、
    // 召喚時効果・fieldEvent（ownSpiritSummoned等）も通常の召喚と同じく発揮させる
    if (action.familyFilter !== undefined) {
        log(state, `${player.name}は${sourceName}の効果で、${card.name}をコストを支払わずに召喚した。`)
        if (!state.winner) resolveTensho(state, owner, inst)
        if (!state.winner) fireSummonSequence(state, owner, inst)
        return
    }
    log(
        state,
        `${player.name}は${sourceName}の効果で、${card.name}をコストを支払わずに召喚した。` +
            "（【転召】を発揮したものとして扱うため、コアを置く必要はない）",
    )
    fireSummonTrigger(state, owner, inst)
}

// BS12-083マジックランプ：公開ゾーンから選んだ1枚のネクサスカードを、維持コアのみリザーブから払って
// フィールドへ配置する（コストは支払わない）。summonRevealedFreeのネクサス版
function placeNexusRevealedFree(ctx: ActionCtx, cardId: string): void {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const card = getCard(cardId)
    const maintain = minLevelCores(card)
    if (player.reserve < maintain) {
        log(state, `${sourceName}：リザーブが足りず${card.name}を配置できなかった。`)
        player.trashCards.push(cardId)
        return
    }
    player.reserve -= maintain
    const inst = createInstance(cardId, state.turn, maintain)
    player.field.nexuses.push(inst)
    log(state, `${player.name}は${sourceName}の効果で、${card.name}をコストを支払わずに配置した。`)
    notifyNexusDeployed(state, owner)
}

const revealAndPlaceNexusFreeHandler: ActionHandler<"revealAndPlaceNexusFree"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]

    // 公開ゾーン経由の再入：選ばれた1枚を配置し、残りは選択待ちの queue（revealDiscardRest）が破棄する
    if (chosenCardIndex !== undefined && state.revealedCards) {
        const zone = state.revealedCards.cardIds
        const pickedId = zone[chosenCardIndex]
        if (pickedId !== undefined) {
            zone.splice(chosenCardIndex, 1)
            placeNexusRevealedFree(ctx, pickedId)
        }
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
    const indices = revealed.map((id, i) => ({ id, i })).filter((x) => getCard(x.id).type === "nexus").map((x) => x.i)
    if (indices.length === 0) {
        for (const id of revealed) player.trashCards.push(id)
        log(state, `${sourceName}：ネクサスカードがなかった。残り${revealed.length}枚をトラッシュに置いた。`)
        return
    }
    if (state.interactiveTargets) {
        state.revealedCards = { pid: owner, cardIds: [...revealed] }
        requestCardChoice(
            state,
            owner,
            `${sourceName}：コストを支払わずに配置するネクサスを選んでください`,
            "reveal",
            indices,
            true,
            action,
            self,
            true,
        )
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
    placeNexusRevealedFree(ctx, pickedId!)
    for (const id of revealed) player.trashCards.push(id)
    if (revealed.length > 0) {
        log(state, `${player.name}は残り${revealed.length}枚をトラッシュに置いた。`)
    }
    return
}

// BS14-X06千貌の魔神ニャルラ・トラップ：相手のデッキを上からcount枚オープンし、その中の1枚を
// 相手のデッキの下に、残りを好きな順番で相手のデッキの上に戻す。deckReveal/revealReturnToDeckは
// state.revealedCards.pid===owner前提（効果の持ち主自身のデッキ専用）なので相手のデッキには使えず、
// 専用の器にした。公開ゾーン（state.revealedCards）自体は表示用に流用する
const revealOpponentDeckPickBottomRestTopHandler: ActionHandler<"revealOpponentDeckPickBottomRestTop"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, chosenCardIndex } = ctx
    const oppPlayer = state.players[opp]

    // phase "chooseTop"：残りを1枚ずつ好きな順番でデッキの上へ（先に選んだカードが上）
    if (action.phase === "chooseTop") {
        const pool = action.pool ?? []
        const placed = action.placed ?? 0
        let nextPlaced = placed
        if (chosenCardIndex !== undefined) {
            const id = pool[chosenCardIndex]
            if (id !== undefined) {
                pool.splice(chosenCardIndex, 1)
                oppPlayer.deck.splice(placed, 0, id)
                nextPlaced = placed + 1
                log(state, `${sourceName}：${getCard(id).name}を${oppPlayer.name}のデッキの上に戻した。`)
            }
        }
        if (pool.length === 0) {
            delete state.revealedCards
            return
        }
        if (state.interactiveTargets && pool.length >= 2) {
            requestCardChoice(
                state,
                owner,
                `${sourceName}：${oppPlayer.name}のデッキの上に戻す順番（残り${pool.length}枚。先に選んだカードが上）`,
                "reveal",
                pool.map((_, i) => i),
                false,
                { type: "revealOpponentDeckPickBottomRestTop", count: action.count, phase: "chooseTop", pool, placed: nextPlaced },
                self,
            )
            return
        }
        // 非対話：残りは公開順のまま機械的にデッキの上へ戻す
        oppPlayer.deck.splice(nextPlaced, 0, ...pool)
        delete state.revealedCards
        return
    }

    // phase "chooseBottom"：1枚を選んで相手のデッキの下へ。残りはchooseTopへ引き継ぐ
    if (action.phase === "chooseBottom") {
        const pool = action.pool ?? []
        if (chosenCardIndex !== undefined) {
            const id = pool[chosenCardIndex]
            if (id !== undefined) {
                pool.splice(chosenCardIndex, 1)
                oppPlayer.deck.push(id)
                log(state, `${sourceName}：${getCard(id).name}を${oppPlayer.name}のデッキの下に戻した。`)
            }
        }
        state.revealedCards = { pid: opp, cardIds: pool }
        ctx.resolve({ type: "revealOpponentDeckPickBottomRestTop", count: action.count, phase: "chooseTop", pool })
        return
    }

    // 初回：相手のデッキ上からcount枚オープンする
    const revealed = oppPlayer.deck.splice(0, action.count)
    if (revealed.length === 0) {
        log(state, `${sourceName}：${oppPlayer.name}のデッキにカードがないため公開できなかった。`)
        return
    }
    state.revealedCards = { pid: opp, cardIds: [...revealed] }
    log(state, `${sourceName}：${oppPlayer.name}のデッキ上${revealed.length}枚（${revealed.map((id) => getCard(id).name).join("、")}）を公開した。`)
    if (state.interactiveTargets && revealed.length >= 2) {
        requestCardChoice(
            state,
            owner,
            `${sourceName}：${oppPlayer.name}のデッキの下に戻すカードを選んでください`,
            "reveal",
            revealed.map((_, i) => i),
            false,
            { type: "revealOpponentDeckPickBottomRestTop", count: action.count, phase: "chooseBottom", pool: revealed },
            self,
        )
        return
    }
    // 非対話：末尾（新しい方）を機械的にデッキの下へ、残りはchooseTopへ
    const pool = [...revealed]
    const bottomId = pool.pop()
    if (bottomId !== undefined) {
        oppPlayer.deck.push(bottomId)
        log(state, `${sourceName}：${getCard(bottomId).name}を${oppPlayer.name}のデッキの下に戻した。`)
    }
    ctx.resolve({ type: "revealOpponentDeckPickBottomRestTop", count: action.count, phase: "chooseTop", pool })
}

// デッキを上から1枚オープンし、マジックならフラッシュ効果を無償で即時使用できる。
// 使わない／マジック以外なら手札に加える（BS11-058 神弓鳥ペリュトーン）
// デッキを上から1枚オープンし、スピリット/ブレイヴならコストを支払わずに召喚する。
// それ以外（または召喚できなかったとき）は手札に加える（BS11-X05 魔導双神ジェミナイズ）
const revealTopSummonFreeOrHandHandler: ActionHandler<"revealTopSummonFreeOrHand"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const top = player.deck[0]
    if (top === undefined) {
        log(state, `${sourceName}：デッキが0枚のため何も起きなかった。`)
        return
    }
    const card = getCard(top)
    log(state, `${sourceName}：デッキの上から${card.name}をオープンした。`)
    if (card.type === "spirit" || card.type === "brave") {
        // トラッシュ経由ではなく、いったんトラッシュ末尾へ置いてから召喚経路に載せる
        player.deck.shift()
        player.trashCards.push(top)
        const before = player.field.spirits.length + player.field.combinedBraves.length
        summonFreeFromTrashIndex(state, owner, sourceName, player.trashCards.length - 1)
        const summoned = player.field.spirits.length + player.field.combinedBraves.length > before
        if (summoned) return
        // 維持コアが足りない等で召喚できなかったら手札に加える（「残ったカードは手札に加える」）
        const at = player.trashCards.lastIndexOf(top)
        if (at !== -1) player.trashCards.splice(at, 1)
        player.hand.push(top)
        log(state, `${sourceName}：召喚できなかったので${card.name}を手札に加えた。`)
        return
    }
    player.deck.shift()
    player.hand.push(top)
    log(state, `${sourceName}：${card.name}を手札に加えた。`)
}

// BS12-065大樹茂る天守閣Lv2／BS12-X03独眼武神マンティクス・マサムネ：デッキ上から1枚オープンし、
// その系統を持つスピリットカードなら任意でコストを支払わず召喚する。召喚しない／対象でないときは破棄する
// （revealTopSummonFreeOrHandと違い外れは手札でなくトラッシュ）。
const revealTopSummonFreeByFamilyHandler: ActionHandler<"revealTopSummonFreeByFamily"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]

    // 公開ゾーンからの再入：選ばれれば召喚（転召・召喚時効果とも通常どおり発揮）、残り0枚の後始末はキューが担う
    if (chosenCardIndex !== undefined && state.revealedCards) {
        const zone = state.revealedCards.cardIds
        const pickedId = zone[chosenCardIndex]
        if (pickedId !== undefined) {
            zone.splice(chosenCardIndex, 1)
            player.trashCards.push(pickedId)
            summonFreeFromTrashIndex(state, owner, sourceName, player.trashCards.length - 1)
        }
        return
    }

    const top = player.deck[0]
    if (top === undefined) {
        log(state, `${sourceName}：デッキが0枚のため何も起きなかった。`)
        return
    }
    const cardData = getCard(top)
    const wanted = Array.isArray(action.familyFilter) ? action.familyFilter : [action.familyFilter]
    const eligible = cardData.type === "spirit" && wanted.some((f) => cardData.family.includes(f))
    if (!eligible) {
        player.deck.shift()
        player.trashCards.push(top)
        log(state, `${sourceName}：デッキの上から${cardData.name}をオープンし、破棄した。`)
        return
    }
    player.deck.shift()
    log(state, `${sourceName}：デッキの上から${cardData.name}をオープンした。`)
    if (state.interactiveTargets) {
        state.revealedCards = { pid: owner, cardIds: [top] }
        requestCardChoice(
            state,
            owner,
            `${sourceName}：${cardData.name}をコストを支払わずに召喚しますか？（召喚しない場合は破棄します）`,
            "reveal",
            [0],
            true,
            action,
            self,
            true,
        )
        if (state.pendingChoice) {
            pushResumeFrames(state, [{ kind: "action", selfInstanceId: null, action: { type: "revealDiscardRest" } }])
        } else {
            discardRevealedZone(state, owner, sourceName)
        }
        return
    }
    // 非対話は召喚する側に倒す
    player.trashCards.push(top)
    summonFreeFromTrashIndex(state, owner, sourceName, player.trashCards.length - 1)
}

// BS14-081神樹の切り株都市：デッキから取り除かず先にオープンし、対象でない／召喚しないときは
// 何もしない（＝取り除いていないのでそのままデッキの上に残る）
const revealTopSummonFreeOrReturnToDeckHandler: ActionHandler<"revealTopSummonFreeOrReturnToDeck"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
    const player = state.players[owner]
    const top = player.deck[0]
    if (top === undefined) {
        log(state, `${sourceName}：デッキが0枚のため何も起きなかった。`)
        return
    }
    const cardData = getCard(top)
    // 確認から戻ってきた（yes）：ここで初めてデッキから取り除いて召喚する
    if (action.confirmed) {
        player.deck.shift()
        player.trashCards.push(top)
        summonFreeFromTrashIndex(state, owner, sourceName, player.trashCards.length - 1)
        return
    }
    const eligible =
        (action.cardType === undefined || cardData.type === action.cardType) &&
        (action.colorFilter === undefined || cardHasColor(cardData, action.colorFilter))
    log(state, `${sourceName}：デッキの上から${cardData.name}をオープンした。`)
    if (!eligible) {
        log(state, `${sourceName}：${cardData.name}は対象ではなかったため、デッキの上に残した。`)
        return
    }
    if (state.interactiveTargets) {
        requestActivationConfirm(
            state,
            owner,
            `${sourceName}：${cardData.name}をコストを支払わずに召喚しますか？（召喚しない場合はデッキの上に残ります）`,
            { ...action, confirmed: true },
            self,
        )
        return
    }
    // 非対話は召喚する側に倒す
    player.deck.shift()
    player.trashCards.push(top)
    summonFreeFromTrashIndex(state, owner, sourceName, player.trashCards.length - 1)
}

const revealTopCastMagicFreeOrHandHandler: ActionHandler<"revealTopCastMagicFreeOrHand"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenOption } = ctx
    const player = state.players[owner]
    // 使用するかの確認から戻ってきた（オープン済みのカードは deck の先頭のまま持ち回る）
    if (chosenOption !== undefined) {
        const cardId = player.deck[0]
        if (cardId === undefined) return
        player.deck.shift()
        log(state, `${sourceName}：${getCard(cardId).name}のフラッシュ効果をコストを支払わずに使用した。`)
        resolveMagicEffects(state, owner, cardId, "flash", undefined)
        return
    }
    const top = player.deck[0]
    if (top === undefined) {
        log(state, `${sourceName}：デッキが0枚のため何も起きなかった。`)
        return
    }
    log(state, `${sourceName}：デッキの上から${getCard(top).name}をオープンした。`)
    if (getCard(top).type === "magic") {
        if (state.interactiveTargets) {
            suspend(state, {
                pid: owner,
                kind: "option",
                prompt: `${sourceName}：${getCard(top).name}のフラッシュ効果をコストを支払わずに使用しますか？（使用しない場合は手札に加えます）`,
                candidates: [],
                options: ["使用する"],
                optional: true,
                confirm: true,
                skipLabel: "手札に加える",
                action,
                selfInstanceId: self ? self.instanceId : null,
            })
            return
        }
        // 非対話は使用する側に倒す
        player.deck.shift()
        log(state, `${sourceName}：${getCard(top).name}のフラッシュ効果をコストを支払わずに使用した。`)
        resolveMagicEffects(state, owner, top, "flash", undefined)
        return
    }
    player.deck.shift()
    player.hand.push(top)
    log(state, `${sourceName}：${getCard(top).name}を手札に加えた。`)
}

const handlers = {
    deckReveal: deckRevealHandler,
    revealAndSummonKeyword: revealAndSummonKeywordHandler,
    revealAndPlaceNexusFree: revealAndPlaceNexusFreeHandler,
    revealAndSummonAllByFamily: revealAndSummonAllByFamilyHandler,
    revealAndSummonAllByKeyword: revealAndSummonAllByKeywordHandler,
    revealTopFamilyToHand: revealTopFamilyToHandHandler,
    revealTopBurstOneToHandRestBottom: revealTopBurstOneToHandRestBottomHandler,
    revealTopToHandThenRefreshOwn: revealTopToHandThenRefreshOwnHandler,
    revealTopToHandIfColorSpiritElseReturnToDeck: revealTopToHandIfColorSpiritElseReturnToDeckHandler,
    revealReturnToDeck: revealReturnToDeckHandler,
    revealDiscardRest: revealDiscardRestHandler,
    revealOpponentDeckPickBottomRestTop: revealOpponentDeckPickBottomRestTopHandler,
    revealTopSummonFreeOrHand: revealTopSummonFreeOrHandHandler,
    revealTopSummonFreeOrReturnToDeck: revealTopSummonFreeOrReturnToDeckHandler,
    revealTopSummonFreeByFamily: revealTopSummonFreeByFamilyHandler,
    revealTopCastMagicFreeOrHand: revealTopCastMagicFreeOrHandHandler,
} satisfies Partial<ActionRegistry>

export default handlers
