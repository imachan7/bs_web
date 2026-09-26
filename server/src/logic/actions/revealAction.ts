// オープン統合の器 reveal（docs/design/REVEAL_UNIFY.md §4）。
// reveal.ts（旧17 type の置き場）は増やさず、こちらに新設する。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { EffectAction, PlayerId } from "../../type"
import { createInstance, currentLevel, getCard, log, minLevelCores, pushResumeFrames, resolveInOrder } from "../GameState"
import { fireSummonSequence, fireSummonTrigger, notifyHandGained, requestCardChoice, resolveTensho } from "../EffectModules"
import { notifyNexusDeployed, resolveMagicEffects } from "../triggers"
import { hasKeyword, instHasColor, countSymbols, summonByEffectBlocked } from "../../../../shared/rules"

type RevealActionT = Extract<EffectAction, { type: "reveal" }>
type RevealPick = NonNullable<RevealActionT["pick"]>
type RevealDest = NonNullable<RevealActionT["dest"]>
type RevealStep = { kind: "pick"; cardId: string } | { kind: "rest" }

export function matchesPick(id: string, pick: RevealPick | undefined): boolean {
    if (!pick) return true
    const card = getCard(id)
    if (pick.cardType !== undefined) {
        const wanted = Array.isArray(pick.cardType) ? pick.cardType : [pick.cardType]
        if (!wanted.includes(card.type)) return false
    }
    if (pick.family !== undefined) {
        const wanted = Array.isArray(pick.family) ? pick.family : [pick.family]
        if (!wanted.some((f) => card.family.includes(f))) return false
    }
    if (pick.color !== undefined && !card.colors.includes(pick.color)) return false
    if (pick.keyword !== undefined && !hasKeyword(id, pick.keyword)) return false
    if (pick.nameIncludes !== undefined && !card.name.includes(pick.nameIncludes)) return false
    if (pick.cost !== undefined) {
        if (typeof pick.cost === "number") {
            if (card.cost !== pick.cost) return false
        } else {
            if (pick.cost.min !== undefined && card.cost < pick.cost.min) return false
            if (pick.cost.max !== undefined && card.cost > pick.cost.max) return false
        }
    }
    if (pick.hasBurst === true && !card.effects.some((e) => e.kind === "burst")) return false
    return true
}

// dest の失敗（型不一致・維持コア不足・召喚禁止）時の行き先。orHand指定時のみ手札、それ以外はトラッシュ
function failDest(ctx: ActionCtx, orHand: boolean | undefined, cardId: string): void {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    if (orHand) {
        player.hand.push(cardId)
        notifyHandGained(state, owner, 1)
        log(state, `${sourceName}：${getCard(cardId).name}を手札に加えた。`)
    } else {
        player.trashCards.push(cardId)
    }
}

// 選ばれた1枚（すでに元のゾーンから除いてある）を dest へ送る
function applyPicked(ctx: ActionCtx, action: Extract<EffectAction, { type: "revealApplyOne" }>): void {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const cardId = action.cardId
    const card = getCard(cardId)
    const dest: RevealDest = action.dest ?? "hand"
    switch (dest) {
        case "hand":
            player.hand.push(cardId)
            notifyHandGained(state, owner, 1)
            log(state, `${player.name}は${sourceName}の効果で、${card.name}を手札に加えた。`)
            return
        case "deckBottom":
            state.players[action.srcPid].deck.push(cardId)
            log(state, `${sourceName}：${card.name}をデッキの下に戻した。`)
            return
        case "tegamoto":
            player.tegamoto.push(cardId)
            log(state, `${player.name}は${sourceName}の効果で、${card.name}を手元に置いた。`)
            return
        case "placeNexus": {
            if (card.type !== "nexus") {
                player.trashCards.push(cardId)
                return
            }
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
            return
        }
        case "cast": {
            if (card.type !== "magic") {
                failDest(ctx, action.orHand, cardId)
                return
            }
            log(state, `${sourceName}：${card.name}のフラッシュ効果をコストを支払わずに使用した。`)
            resolveMagicEffects(state, owner, cardId, "flash", undefined)
            return
        }
        case "summon": {
            // ブレイヴはスピリット状態で召喚する（旧 revealTopSummonFreeOrHand と同じ）
            if (card.type !== "spirit" && card.type !== "brave") {
                failDest(ctx, action.orHand, cardId)
                return
            }
            if (summonByEffectBlocked(state)) {
                log(state, `${sourceName}：効果による召喚が禁じられているため発動しなかった。`)
                failDest(ctx, action.orHand, cardId)
                return
            }
            const maintain = minLevelCores(card)
            if (player.reserve < maintain) {
                log(state, `${sourceName}：リザーブが足りず${card.name}を召喚できなかった。`)
                failDest(ctx, action.orHand, cardId)
                return
            }
            player.reserve -= maintain
            const inst = createInstance(cardId, state.turn, maintain)
            if (action.returnToDeckBottomAtEndStep) inst.returnToDeckBottomAtEndStep = true
            player.field.spirits.push(inst)
            log(state, `${player.name}は${sourceName}の効果で、${card.name}をコストを支払わずに召喚した。`)
            if (action.tensho === undefined) {
                if (!state.winner) resolveTensho(state, owner, inst)
                if (state.pendingChoice) {
                    pushResumeFrames(state, [
                        {
                            kind: "action",
                            selfInstanceId: inst.instanceId,
                            actorPid: owner,
                            action: { type: "revealFinishSummon", ...(action.noSummonEffects ? { noSummonEffects: true as const } : {}) },
                        },
                    ])
                    return
                }
                if (action.noSummonEffects) {
                    log(state, `${sourceName}：『召喚時』効果は発揮されない。`)
                    return
                }
                if (!state.winner) fireSummonSequence(state, owner, inst)
                return
            }
            if (action.noSummonEffects) {
                log(state, `${sourceName}：『召喚時』効果は発揮されない。`)
                return
            }
            // asIfDone：【転召】を発揮したものとして扱うため resolveTensho は呼ばない。
            // 召喚時効果は fireSummonTrigger のみ（fieldEvent ownSpiritSummoned は起こさない。旧revealAndSummonKeywordの挙動を踏襲）
            if (action.tensho === "asIfDone") {
                if (!state.winner) fireSummonTrigger(state, owner, inst)
                return
            }
            // none：転召させない。効果は通常どおり
            if (!state.winner) fireSummonSequence(state, owner, inst)
            return
        }
    }
}

const revealApplyOneHandler: ActionHandler<"revealApplyOne"> = (ctx, action) => {
    applyPicked(ctx, action)
}

const revealFinishSummonHandler: ActionHandler<"revealFinishSummon"> = (ctx, action) => {
    const { state, owner, self } = ctx
    if (!self || state.winner) return
    if (action.noSummonEffects) return
    fireSummonSequence(state, owner, self)
}

const revealRestHandler: ActionHandler<"revealRest"> = (ctx, action) => {
    const { state, owner, sourceName, self, chosenCardIndex } = ctx
    const destPlayer = state.players[action.destPid]
    const rest = action.rest ?? "deckBottom"
    if (rest === "trash" || rest === "hand") {
        const zone = state.revealedCards
        const ids = zone ? zone.cardIds : []
        if (ids.length > 0) {
            if (rest === "trash") {
                destPlayer.trashCards.push(...ids)
                log(state, `${destPlayer.name}は残り${ids.length}枚をトラッシュに置いた。`)
            } else {
                destPlayer.hand.push(...ids)
                notifyHandGained(state, action.destPid, ids.length)
                log(state, `${destPlayer.name}は残り${ids.length}枚を手札に加えた。`)
            }
        }
        if (zone) delete state.revealedCards
        return
    }
    // deckTop／deckBottom：戻す順番を1枚ずつ選ばせる（使用者(ctx.owner)が選ぶ。公開したのが相手のデッキでも同じ）
    const toTop = rest === "deckTop"
    const placed = action.placed ?? 0
    const pool = action.pool ? [...action.pool] : [...(state.revealedCards?.cardIds ?? [])]
    // 選択待ちの間は表示のために公開中へ戻しているので、再開時も必ず消す（残すとエンジンの後始末が同じカードをもう一度戻す）
    delete state.revealedCards
    let nextPlaced = placed
    if (chosenCardIndex !== undefined) {
        const id = pool[chosenCardIndex]
        if (id !== undefined) {
            pool.splice(chosenCardIndex, 1)
            if (toTop) {
                destPlayer.deck.splice(placed, 0, id)
                nextPlaced = placed + 1
            } else {
                destPlayer.deck.push(id)
            }
            log(state, `${destPlayer.name}は${getCard(id).name}をデッキの${toTop ? "上" : "下"}に戻した。`)
        }
    }
    if (pool.length === 0) return
    if (state.interactiveTargets && pool.length >= 2) {
        state.revealedCards = { pid: action.destPid, cardIds: pool }
        requestCardChoice(
            state,
            owner,
            `${sourceName}：${destPlayer.name}のデッキの${toTop ? "上" : "下"}に戻す順番（残り${pool.length}枚。先に選んだカードが${toTop ? "上" : "下寄り"}）`,
            "reveal",
            pool.map((_, i) => i),
            false,
            { type: "revealRest", destPid: action.destPid, rest, pool, placed: nextPlaced },
            self,
        )
        return
    }
    if (toTop) destPlayer.deck.splice(nextPlaced, 0, ...pool)
    else destPlayer.deck.push(...pool)
}

function stepToFrame(ctx: ActionCtx, action: RevealActionT, srcPid: PlayerId, step: RevealStep): { kind: "action"; selfInstanceId: string | null; actorPid: PlayerId; action: EffectAction } {
    const base = { kind: "action" as const, selfInstanceId: ctx.self ? ctx.self.instanceId : null, actorPid: ctx.owner }
    if (step.kind === "pick") {
        return {
            ...base,
            action: {
                type: "revealApplyOne",
                cardId: step.cardId,
                srcPid,
                ...(action.dest !== undefined ? { dest: action.dest } : {}),
                ...(action.tensho !== undefined ? { tensho: action.tensho } : {}),
                ...(action.noSummonEffects ? { noSummonEffects: true as const } : {}),
                ...(action.orHand ? { orHand: true as const } : {}),
                ...(action.returnToDeckBottomAtEndStep ? { returnToDeckBottomAtEndStep: true as const } : {}),
            },
        }
    }
    return { ...base, action: { type: "revealRest", destPid: srcPid, ...(action.rest !== undefined ? { rest: action.rest } : {}) } }
}

// pick済み（あれば）→ rest の順で解決する。resolveInOrder が中断（【転召】の対象選択等）の
// 残りを再開スタックへ積むので、ここでは自分でループやフラグ管理をしない（RESUME_STACK.md §9）
function runSteps(ctx: ActionCtx, action: RevealActionT, srcPid: PlayerId, steps: RevealStep[]): void {
    resolveInOrder(ctx.state, steps, {
        resolve: (step) => {
            if (step.kind === "pick") {
                const frame = stepToFrame(ctx, action, srcPid, step)
                applyPicked(ctx, frame.action as Extract<EffectAction, { type: "revealApplyOne" }>)
            } else {
                revealRestHandler(ctx, { type: "revealRest", destPid: srcPid, ...(action.rest !== undefined ? { rest: action.rest } : {}) })
            }
        },
        frame: (step) => stepToFrame(ctx, action, srcPid, step),
    })
}

const revealHandler: ActionHandler<"reveal"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, chosenCardIndex } = ctx
    const from = action.from ?? "ownDeck"
    const srcPid: PlayerId = from === "opponentDeck" ? opp : owner
    const srcPlayer = state.players[srcPid]
    const pickCount = action.pickCount ?? 1

    // 再入：候補から1枚選ばれた（pickだけを解決する。「残り」はここでは触らない）。
    // スキップは resolveOnSkip を使わないためここへは来ない（PendingChoiceが黙って解消するだけ）。
    // 「残り」の処理は呼び出し元（下のinteractive分岐）が選んでもスキップしても必ず走るように
    // pushResumeFrames で別途キューへ積む（revealDiscardRest と同じ考え方）
    if (chosenCardIndex !== undefined) {
        if (from === "hand") {
            const pickedId = srcPlayer.hand[chosenCardIndex]
            if (pickedId !== undefined) {
                srcPlayer.hand.splice(chosenCardIndex, 1)
                state.lastMoved = [pickedId]
                runSteps(ctx, action, srcPid, [{ kind: "pick", cardId: pickedId }])
            }
            return
        }
        const zone = state.revealedCards
        const pickedId = zone ? zone.cardIds[chosenCardIndex] : undefined
        if (pickedId !== undefined && zone) {
            zone.cardIds.splice(chosenCardIndex, 1)
            runSteps(ctx, action, srcPid, [{ kind: "pick", cardId: pickedId }])
        }
        return
    }

    if (from === "hand") {
        const indices = srcPlayer.hand.map((id, i) => ({ id, i })).filter((x) => matchesPick(x.id, action.pick)).map((x) => x.i)
        if (indices.length === 0) {
            state.lastMoved = []
            log(state, `${sourceName}：対象がなかった。`)
            return
        }
        if (state.interactiveTargets && (indices.length >= 2 || action.optional === true)) {
            requestCardChoice(state, owner, `${sourceName}：カードを選んでください`, "hand", indices, action.optional === true, action, self, action.optional === true)
            return
        }
        let best = indices[0]!
        for (const i of indices) if (getCard(srcPlayer.hand[i]!).cost > getCard(srcPlayer.hand[best]!).cost) best = i
        const cardId = srcPlayer.hand[best]!
        srcPlayer.hand.splice(best, 1)
        state.lastMoved = [cardId]
        runSteps(ctx, action, srcPid, [{ kind: "pick", cardId }])
        return
    }

    // ownDeck／opponentDeck：count 枚（またはcountPer・countFromSelfLevel）をオープンする
    const countPer = action.countPer
    const count = action.countFromSelfLevel && self
        ? currentLevel(self).level
        : countPer
          ? "ownColorTotal" in countPer
              ? [...state.players[owner].field.spirits, ...state.players[owner].field.nexuses].filter((s) => instHasColor(s, countPer.ownColorTotal)).length
              : "ownSymbols" in countPer
                ? countSymbols(state.players[owner], [countPer.ownSymbols])
                : state.players[owner].field.nexuses.length
          : action.count ?? 0
    const revealed = srcPlayer.deck.splice(0, count)
    state.lastMoved = [...revealed]
    if (revealed.length === 0) {
        log(state, `${sourceName}：デッキにカードがないため公開できなかった。`)
        return
    }
    log(state, `${srcPlayer.name}はデッキ上${revealed.length}枚（${revealed.map((id) => getCard(id).name).join("、")}）を公開した。`)
    state.revealedCards = { pid: srcPid, cardIds: revealed }

    if (pickCount === 0) {
        runSteps(ctx, action, srcPid, [{ kind: "rest" }])
        return
    }

    if (pickCount === "all") {
        const matched = revealed.filter((id) => matchesPick(id, action.pick))
        // 選んだものは公開中から外す（残すと「残り」の後始末で同じカードがもう一度送られる）
        state.revealedCards = { pid: srcPid, cardIds: revealed.filter((id) => !matchesPick(id, action.pick)) }
        const steps: RevealStep[] = matched.map((cardId) => ({ kind: "pick" as const, cardId }))
        steps.push({ kind: "rest" })
        runSteps(ctx, action, srcPid, steps)
        return
    }

    // pickCount 1
    const indices = revealed.map((id, i) => ({ id, i })).filter((x) => matchesPick(x.id, action.pick)).map((x) => x.i)
    if (indices.length === 0) {
        runSteps(ctx, action, srcPid, [{ kind: "rest" }])
        return
    }
    // 候補が1枚なら選ぶ余地が無い（任意＝「〜できる」なら使うかどうかを聞くので1枚でも出す）
    if (state.interactiveTargets && (indices.length >= 2 || action.optional === true)) {
        requestCardChoice(state, owner, `${sourceName}：カードを選んでください`, "reveal", indices, action.optional === true, action, self, action.optional === true)
        // 「残り」は選んでもスキップしても必ず走る必要がある。同期解決済み（pendingChoiceが立っていない）なら
        // ここで直接、まだ選択待ちならキューに積んで pick の続き（【転召】の選択など）の後に回す
        if (state.pendingChoice) {
            pushResumeFrames(state, [
                {
                    kind: "action",
                    selfInstanceId: self ? self.instanceId : null,
                    actorPid: owner,
                    action: { type: "revealRest", destPid: srcPid, ...(action.rest !== undefined ? { rest: action.rest } : {}) },
                },
            ])
        } else {
            runSteps(ctx, action, srcPid, [{ kind: "rest" }])
        }
        return
    }
    let best = indices[0]!
    for (const i of indices) if (getCard(revealed[i]!).cost > getCard(revealed[best]!).cost) best = i
    const zone = state.revealedCards
    const [pickedId] = zone.cardIds.splice(best, 1)
    runSteps(ctx, action, srcPid, [{ kind: "pick", cardId: pickedId! }, { kind: "rest" }])
}

const handlers = {
    reveal: revealHandler,
    revealApplyOne: revealApplyOneHandler,
    revealRest: revealRestHandler,
    revealFinishSummon: revealFinishSummonHandler,
} satisfies Partial<ActionRegistry>

export default handlers
