// 手札・デッキ・トラッシュ操作系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionHandler, ActionRegistry } from "./types"
import type { PlayerId } from "../../type"
import { draw, getCard, log, opponentOf } from "../GameState"
import {
    countEffectCounter,
    drawDoubleMultiplier,
    findSpiritAny,
    isImmuneToArea,
    isBattlingEffectImmune,
    millDeck,
    notifyHandGained,
    pickEnemyByBp,
    pickEnemyCandidates,
    requestCardChoice,
    requestChoice,
    returnSpiritToDeckTop,
    returnSpiritToHand,
    tryInteractiveCardChoice,
    tryInteractiveTargetChoice,
} from "../EffectModules"
import { effectiveBp, hasArmorAgainst, hasMagicImmunity, instHasColor } from "../../../../shared/rules"

const drawHandler: ActionHandler<"draw"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        draw(state, owner, action.count * drawDoubleMultiplier(state, owner))
        return
}

const drawPerHandler: ActionHandler<"drawPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const count = countEffectCounter(state, owner, self, action.counter)
        if (count === 0) {
            log(state, `${sourceName}の可変ドロー：カウントが0のためドローしなかった。`)
            return
        }
        draw(state, owner, count * drawDoubleMultiplier(state, owner))
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
            return
        }
        if (target.hand.length === 0) {
            log(state, `${sourceName}の手札破棄：${target.name}の手札がなかった。`)
            return
        }
        if (state.interactiveTargets) {
            const indices = target.hand.map((_, i) => i)
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
                        ? { type: "discardOpponent", count: action.count - 1, forcedTargetPid: targetPid }
                        : null,
                )
            ) {
                return
            }
        }
        // 既存の決定的自動選択：本来は相手が選ぶが、簡略化して手札末尾からcount枚を破棄する
        const discarded: string[] = []
        for (let i = 0; i < action.count; i++) {
            const cardId = target.hand.pop()
            if (cardId === undefined) break
            target.trashCards.push(cardId)
            discarded.push(getCard(cardId).name)
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

const deckRevealHandler: ActionHandler<"deckReveal"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // スワロウアイヴィー：自分のデッキ上からcount枚を公開し、pickTypeに一致する最初の
        // 1枚（省略時は先頭）を手札に加える。残りは元の順で山札の下に戻す。
        // 大天使ミカファール：countPer指定時は自分の指定色スピリット/ネクサス合計数ぶん公開し、
        // pickAllOfType指定時は一致するカードすべてを手札に加える。
        // 簡略化: 本来はプレイヤーが選ぶ／戻す順を選ぶ処理を、決定的な自動選択で代替する。
        const player = state.players[owner]
        const count = action.countPer
            ? [...player.field.spirits, ...player.field.nexuses].filter(
                  (s) => instHasColor(s, action.countPer!.ownColorTotal),
              ).length
            : action.count ?? 0
        const revealed = player.deck.splice(0, count)
        if (revealed.length === 0) {
            log(state, `${sourceName}：デッキにカードがないため公開できなかった。`)
            return
        }
        const revealedCount = revealed.length
        const revealedNames = revealed.map((id) => getCard(id).name).join("、")
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
        const pickIndex = revealed.findIndex(
            (id) =>
                (action.pickType === undefined || getCard(id).type === action.pickType) &&
                (action.nameIncludes === undefined || getCard(id).name.includes(action.nameIncludes)),
        )
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
        // それ以外は公開順のまま山札の下に戻す（下に戻す＝push）
        if (action.discardNonMatching) {
            for (const id of revealed) player.trashCards.push(id)
            if (revealed.length > 0) {
                log(state, `${player.name}は残り${revealed.length}枚をトラッシュに置いた。`)
            }
        } else {
            for (const id of revealed) player.deck.push(id)
        }
        return
}

const recoverSpiritFromTrashHandler: ActionHandler<"recoverSpiritFromTrash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // interactiveTargets時は選択式（選択者=使用者。cardZone:"trash"）
        const player = state.players[owner]
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
            return
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
        const isRecoverable = (cardId: string): boolean =>
            getCard(cardId).type === "spirit" && familyOk(cardId)
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
            log(state, `${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
        }
        notifyHandGained(state, owner, recovered)
        return
}

const recoverMagicFromTrashHandler: ActionHandler<"recoverMagicFromTrash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // interactiveTargets時は選択式（選択者=使用者。cardZone:"trash"）
        const player = state.players[owner]
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
                .filter(({ id }) => getCard(id).type === "magic")
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
            if (getCard(player.trashCards[j]!).type === "magic") {
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

const millHandler: ActionHandler<"mill"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 【粉砕】：相手（side:"own"指定時は自分）のデッキ上からcount枚をトラッシュへ送る
        const targetPid = action.side === "own" ? owner : opponentOf(owner)
        millDeck(state, targetPid, action.count, owner)
        return
}

const millPerHandler: ActionHandler<"millPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const raw = countEffectCounter(state, owner, self, action.counter)
        let count = raw * (action.multiplier ?? 1)
        if (action.cap !== undefined) count = Math.min(count, action.cap)
        if (count === 0) {
            log(state, `${sourceName}の可変粉砕：カウントが0のため粉砕しなかった。`)
            return
        }
        const targetPid = action.side === "own" ? owner : opponentOf(owner)
        millDeck(state, targetPid, count, owner)
        return
}

const returnToHandHandler: ActionHandler<"returnToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 対象指定時はその1体のみ手札へ戻す
        if (targetInstanceId) {
            const found = findSpiritAny(state, targetInstanceId)
            if (!found) {
                log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                return
            }
            if (
                isBattlingEffectImmune(state, found.inst, srcType) ||
                (found.pid !== owner &&
                    (hasArmorAgainst(found.inst, srcColors) ||
                        (srcType === "magic" && hasMagicImmunity(state, found.pid, found.inst))))
            ) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった。`)
                return
            }
            returnSpiritToHand(state, found.pid, found.inst)
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
        if (state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, limitBp, undefined, srcColors, srcType)
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
            const target = pickEnemyByBp(state, opp, limitBp, undefined, srcColors, srcType)
            if (!target) {
                log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                break
            }
            returnSpiritToHand(state, opp, target)
        }
        return
}

const returnAllToHandHandler: ActionHandler<"returnAllToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 指定側のスピリットのうちコスト条件を満たすものすべてを各持ち主の手札へ戻す（相手側のみ装甲・免疫を尊重）
        const sides: PlayerId[] = action.side === "both" ? ["p1", "p2"] : [opp]
        let returned = 0
        for (const pid of sides) {
            // returnSpiritToHand が field.spirits を破壊的に変更するため、対象をスナップショットしてから戻す
            const targets = state.players[pid].field.spirits.filter((s) => {
                const cost = getCard(s.cardId).cost
                if (action.costFilter?.max !== undefined && cost > action.costFilter.max) return false
                if (action.costFilter?.min !== undefined && cost < action.costFilter.min) return false
                if (isBattlingEffectImmune(state, s, srcType)) return false
                if (pid !== owner && (hasArmorAgainst(s, srcColors) || (srcType === "magic" && hasMagicImmunity(state, pid, s)) || isImmuneToArea(s))) return false
                return true
            })
            for (const s of targets) {
                returnSpiritToHand(state, pid, s)
                returned++
            }
        }
        if (returned === 0) log(state, `${sourceName}：手札に戻す対象がいなかった。`)
        return
}

const returnToDeckTopHandler: ActionHandler<"returnToDeckTop"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (targetInstanceId === undefined && state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, Infinity, undefined, srcColors, srcType)
            if (candidates.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}のデッキ戻し：対象を選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
        }
        const found = targetInstanceId
            ? findSpiritAny(state, targetInstanceId)
            : (() => {
                  const t = pickEnemyByBp(state, opp, Infinity, undefined, srcColors, srcType)
                  return t ? { pid: opp, inst: t } : null
              })()
        if (!found) {
            log(state, `${sourceName}のデッキ戻し：対象がいなかった。`)
            return
        }
        if (
            targetInstanceId &&
            (isBattlingEffectImmune(state, found.inst, srcType) ||
                (found.pid !== owner &&
                    (hasArmorAgainst(found.inst, srcColors) ||
                        (srcType === "magic" && hasMagicImmunity(state, found.pid, found.inst)))))
        ) {
            log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった。`)
            return
        }
        returnSpiritToDeckTop(state, found.pid, found.inst)
        return
}

const returnSelfToHandHandler: ActionHandler<"returnSelfToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (!self) return
        const player = state.players[owner]
        // 破壊時に呼ばれるため、直前にトラッシュへ送られた自分のカードを手札へ戻す
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
        // 置いた枚数ぶんデッキから引く。chosenCardIndexが渡された＝choiceで1枚選ばれた経路。
        // 1枚移動+1ドロー後、手札にまだマジックカードが残っていれば同じactionで再度resolveActionし、
        // choiceを繰り返す（optional=trueのためスキップで終了する）
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
                `${player.name}は${getCard(cardId).name}を手元に置き、デッキから1枚引いた。`,
            )
            ctx.resolve(action)
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
                `${sourceName}：手元に置くマジックカードを選んでください（選ばなければ終了）`,
                "hand",
                indices,
                true,
                action,
                self,
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
    discardHandAll: discardHandAllHandler,
    discardOpponent: discardOpponentHandler,
    discardOpponentDownTo: discardOpponentDownToHandler,
    discardSelfOne: discardSelfOneHandler,
    deckReveal: deckRevealHandler,
    recoverSpiritFromTrash: recoverSpiritFromTrashHandler,
    recoverMagicFromTrash: recoverMagicFromTrashHandler,
    mill: millHandler,
    millPer: millPerHandler,
    returnToHand: returnToHandHandler,
    returnAllToHand: returnAllToHandHandler,
    returnToDeckTop: returnToDeckTopHandler,
    returnSelfToHand: returnSelfToHandHandler,
    handMagicToTegamotoDraw: handMagicToTegamotoDrawHandler,
    discardOpponentTegamotoDestroyPer: discardOpponentTegamotoDestroyPerHandler,
} satisfies Partial<ActionRegistry>

export default handlers
