// カードを選んで動かす統合の器（旧 toHand／toDeck ほか「選ぶ＋送る」の type をここへ寄せる）
import type { ActionCtx, ActionHandler, ActionRegistry, ResolveOpts } from "./types"
import type { CardInstance, CardPick, CardType, EffectAction, GameState, PlayerId, PlayerState } from "../../type"
import { createInstance, getCard, log, minLevelCores, opponentOf, pushResumeFrames, resolveInOrder, suspend } from "../GameState"
import { fchangeCostAs, flushSummonBatch, startSummonBatch } from "../summon"
import { canPayFreeSummonSurcharge } from "../summonSurcharge"
import { notifyHandGained, payCost, recordTimed, resolveMagic, summonFreeFromHandIndex, summonFreeFromTrashIndex } from "../EffectModules"
import { canDiscardHand, hasGlobalConstraint, instMinLevelCores, isTrashCardProtected, opponentCantReturnFromTrashToHand, timedMagicLocked, magicColorBanned, trashCardNameMatches } from "../../../../shared/rules"
import { effectiveCost } from "../RuleValidator"
import { COLOR_LABELS } from "../../../../data/constants"
import { normalCoresOn } from "../soulCore"
import { fireNexusDeployed } from "../fieldEventTriggers"
import { recordMagicUsed } from "../record"
import { countedAmount } from "../counted"
import { matchesPick } from "./revealAction"
import { lastMovedOf, recordMoved } from "../record"

type MoveCards = Extract<EffectAction, { type: "moveCards" }>

// 読み替え・再入で、きっかけのカード・発生源の色と種別・選択結果をそのまま渡す（ctx.resolve は省略した値を引き継がない）
function carry(ctx: ActionCtx): ResolveOpts {
    return { targetInstanceId: ctx.targetInstanceId, sourceColors: ctx.srcColors, sourceType: ctx.srcType, chosenOption: ctx.chosenOption, chosenCardIndex: ctx.chosenCardIndex }
}

function millEventIndices(zone: string[], ids: string[]): Set<number> {
    const left = new Map<string, number>()
    for (const id of ids) left.set(id, (left.get(id) ?? 0) + 1)
    const out = new Set<number>()
    for (let j = zone.length - 1; j >= 0; j--) {
        const n = left.get(zone[j]!) ?? 0
        if (n === 0) continue
        left.set(zone[j]!, n - 1)
        out.add(j)
    }
    return out
}

function destLabel(action: MoveCards): string {
    switch (action.dest) {
        case "hand":
            return "手札に戻す"
        case "deckTop":
            return "デッキの上に戻す"
        case "deckBottom":
            return "デッキの下に戻す"
        case "placeNexus":
            return "配置する"
        case "summon":
            return "召喚する"
        case "cast":
            return "使用する"
        case "trash":
            return "破棄する"
        case "exMark":
            return "EXシンボルとして扱う"
        default:
            return "選ぶ"
    }
}

// 候補（ゾーンのインデックス）。選び終わるまでゾーンは変わらないので、選択の途中でも同じ値になる
export function moveCardCandidates(state: GameState, owner: PlayerId, action: MoveCards, targetInstanceId?: string, selfCardId?: string): number[] {
    const zonePid = action.side === "opponent" ? opponentOf(owner) : owner
    const player = state.players[zonePid]
    const zone = action.from === "hand" ? player.hand : player.trashCards
    // fromEvent：その回に破棄されたカード（state.lastDeckMill）だけ。同じ cardId が複数あるときは新しい方から枚数ぶん当てる
    const fromEventIdx = action.fromEvent ? millEventIndices(zone, state.lastDeckMill?.pid === zonePid ? state.lastDeckMill.cardIds : []) : undefined
    // 同名が複数あるときは最後に置かれた1枚（直前にバトルで破壊されたカード）だけ
    const battleLoserIdx = action.onlyLastBattleDestroyed && state.lastBattleDestroyedCardId !== undefined ? zone.lastIndexOf(state.lastBattleDestroyedCardId) : undefined
    const lastMoved = action.lastMovedOnly ? lastMovedOf(state) : undefined
    // トラッシュのカード名は trashNameAs の別名でも一致する
    const { nameIncludes, ...pickRest } = action.pick ?? {}
    const nameOk = (id: string): boolean => nameIncludes === undefined || (action.from === "trash" ? trashCardNameMatches(id, nameIncludes) : getCard(id).name.includes(nameIncludes))
    return zone
        .map((id, j) => ({ id, j }))
        .filter(
            ({ id, j }) =>
                (matchesPick(id, pickRest, undefined, selfCardId) || fchangeAsCostMatches(state, zonePid, action, id, pickRest, selfCardId)) &&
                nameOk(id) &&
                (!action.onlyEventCard || id === targetInstanceId) &&
                (action.from === "hand" || !isTrashCardProtected(id)) &&
                (fromEventIdx === undefined || fromEventIdx.has(j)) &&
                (!action.onlyLastBattleDestroyed || (battleLoserIdx !== undefined && battleLoserIdx === j)) &&
                (lastMoved === undefined || lastMoved.includes(id)),
        )
        .map(({ j }) => j)
}

// 【Fチェンジ】で召喚するときだけ、手札のカードが「コストMにできる」なら、そのコストでも候補にする
function fchangeAsCostMatches(state: GameState, pid: PlayerId, action: MoveCards, id: string, pick: CardPick, selfCardId?: string): boolean {
    if (action.summonedBy !== "fchange") return false
    const asCost = fchangeCostAs(state, pid, id)
    return asCost !== undefined && matchesPick(id, pick, asCost, selfCardId)
}

// pay の then に置けるか（「書いてある数どおり」動かせるか）。upTo は0枚でも成り立つので扱わない
export function moveCardsPayable(state: GameState, owner: PlayerId, self: CardInstance | null, action: MoveCards, srcType: CardType | undefined): boolean {
    // 「好きなだけ」（count:"all"＋upTo）は0枚でも払える。ほかの upTo は数が決まらないので扱わない
    // 召喚・配置・使用の「できる」(upTo) は、候補が1枚でもあれば成り立つ（払ったあとで選ばずに終えることはできる。26RSD07-001）
    if (action.upTo && (action.count === "all" || !(action.dest === "summon" || action.dest === "placeNexus" || action.dest === "cast"))) return action.count === "all"
    if (action.from === "hand" && action.dest === "trash" && !canDiscardHand(state, action.side === "opponent" ? opponentOf(owner) : owner)) return false
    if (action.from === "trash" && action.dest === "hand" && (hasGlobalConstraint(state, "noTrashRecovery") || opponentCantReturnFromTrashToHand(state, owner))) return false
    const found = moveCardCandidates(state, owner, action).length
    // 召喚・配置・使用は1枚でもあれば成り立つ（旧 summonFromTrashFree と同じ）
    if (action.count === "all" || action.costBudget !== undefined || action.dest === "summon" || action.dest === "placeNexus" || action.dest === "cast") return found >= 1
    const need = action.countCounter !== undefined ? countedAmount(state, owner, self, action.count, action.countCounter, srcType) : action.count
    return found >= need
}

// 【操霊】での召喚か（selfSummonCost.viaSoryo 用。【操霊】の効果は summonedBy:"soryo" を持つ）
function viaSoryo(action: MoveCards): boolean {
    return action.dest === "summon" && action.summonedBy === "soryo"
}

// 払えるか（自動で選ぶときに払えないカードを避ける。pay:"cost" の召喚は候補そのものから外す＝旧 summonFromTrashFree.payCost と同じ）
function affordable(state: GameState, pid: PlayerId, action: MoveCards, cardId: string, soryo = false): boolean {
    const player = state.players[pid]
    const card = getCard(cardId)
    const fieldCores = [...player.field.spirits, ...player.field.nexuses].reduce((sum, i) => sum + i.cores, 0)
    if (action.dest === "summon") return action.pay === "cost" ? player.reserve + fieldCores >= minLevelCores(card) + effectiveCost(state, pid, card, false, [], soryo, action.from === "hand") : canPayFreeSummonSurcharge(state, pid, card, minLevelCores(card), true)
    if (action.dest === "cast") return action.pay === "cost" ? player.reserve >= effectiveCost(state, pid, card) : true
    if (action.pay === "fieldCoresOnly") return fieldCoresSpendable(player).reduce((sum, x) => sum + x.max, 0) >= effectiveCost(state, pid, card)
    return player.reserve >= minLevelCores(card)
}

// フィールドから取り出せるコア（維持コアぶんは残す。案B-inside：[ソウルコア]は動かさない）
export function fieldCoresSpendable(player: PlayerState): { inst: CardInstance; max: number }[] {
    return [
        ...player.field.nexuses.map((n) => ({ inst: n, max: normalCoresOn(player, n) })),
        ...player.field.spirits.map((sp) => ({ inst: sp, max: sp.pendingDestruction ? sp.cores : Math.max(0, sp.cores - instMinLevelCores(sp)) })),
    ].filter((x) => x.max > 0)
}

// 1枚を送る。送れたら true（払えない・種別が違うなどで送れなければゾーンに残して false）
function sendOne(ctx: ActionCtx, action: MoveCards, pid: PlayerId, j: number): boolean {
    const { state, sourceName } = ctx
    const player = state.players[pid]
    const zone = action.from === "hand" ? player.hand : player.trashCards
    const cardId = zone[j]
    if (cardId === undefined) return false
    const card = getCard(cardId)
    if (action.dest === "trash" && action.from === "hand") {
        zone.splice(j, 1)
        player.trashCards.push(cardId)
        log(state, `${player.name}は手札から${card.name}を破棄した。`)
        return true
    }
    if (action.dest === "summon" && action.from === "hand") {
        const before = zone.length
        summonFreeFromHandIndex(state, pid, sourceName, j, action.skipTensho, {
            ...(action.pay === "cost" ? { payCost: true as const, ...(ctx.paySources ? { paySources: ctx.paySources } : {}) } : {}),
            ...(action.skipOnSummon ? { skipOnSummon: true as const } : {}),
            summonedBy: action.summonedBy ?? "freeEffect",
            surchargeBatch: true,
        })
        return zone.length < before
    }
    if (action.dest === "summon") {
        if (action.from !== "trash") return false
        const before = zone.length
        summonFreeFromTrashIndex(state, pid, sourceName, j, {
            ...(action.summonedBy ? { summonedBy: action.summonedBy } : {}),
            ...(action.pay === "cost" ? { payCost: true as const, ...(ctx.paySources ? { paySources: ctx.paySources } : {}) } : {}),
            ...(action.skipOnSummon ? { skipOnSummon: true as const } : {}),
            ...(action.destroyAtBattleEnd ? { destroyAtBattleEnd: true as const } : {}),
            surchargeBatch: true,
        })
        return zone.length < before
    }
    if (action.dest === "exMark") {
        if (action.from !== "trash" || action.exColor === undefined) return false
        recordTimed(state, { content: [{ type: "playerRule", rule: { type: "trashCardAsEx", cardId, color: action.exColor } }], target: { kind: "player", pid }, until: "step", ownerPid: ctx.owner })
        log(state, `${sourceName}：このステップの間、トラッシュの${card.name}の${COLOR_LABELS[action.exColor]}シンボル1つを${COLOR_LABELS[action.exColor]}のEXシンボルとして扱う。`)
        return true
    }
    if (action.dest === "cast" && action.pay === "cost") return castWithCost(ctx, pid, zone, j)
    if (action.dest === "placeNexus" && action.pay === "fieldCoresOnly") return deployByFieldCores(ctx, pid, zone, j)
    // コストを支払わない配置／使用：オープンしたカードと同じ送り先の処理に渡す
    if (card.type !== (action.dest === "cast" ? "magic" : "nexus") || !affordable(state, pid, action, cardId)) return false
    zone.splice(j, 1)
    ctx.resolve({ type: "revealApplyOne", cardId, srcPid: pid, dest: action.dest === "cast" ? "cast" : "placeNexus" })
    return true
}

// BS09-065名工集いし大工房Lv2：**自分のフィールドのコアだけ**を使ってコストを支払って配置する（リザーブは使わない。2026-08-14 ユーザー確認）。
// 取るのはネクサス上→コアの多いスピリットの順で、**維持コアを割る個体からは取らない**（決定的簡略化）
function deployByFieldCores(ctx: ActionCtx, pid: PlayerId, zone: string[], j: number): boolean {
    const { state, sourceName } = ctx
    const player = state.players[pid]
    const cardId = zone[j]!
    const cost = effectiveCost(state, pid, getCard(cardId))
    const pool = fieldCoresSpendable(player)
    if (pool.reduce((sum, x) => sum + x.max, 0) < cost) {
        log(state, `${sourceName}：フィールドのコアが足りないため配置できなかった。`)
        return false
    }
    let remaining = cost
    for (const x of [...pool].sort((a, b) => b.max - a.max)) {
        if (remaining <= 0) break
        const take = Math.min(remaining, x.max)
        x.inst.cores -= take
        player.trashCores += take
        remaining -= take
    }
    zone.splice(j, 1)
    const inst = createInstance(cardId, state.turn, minLevelCores(getCard(cardId)))
    player.field.nexuses.push(inst)
    log(state, `${player.name}はフィールドのコア${String(cost)}個を支払い、トラッシュから${getCard(cardId).name}を配置した。`)
    fireNexusDeployed(state, pid, inst)
    return true
}

// トラッシュのマジックを、手札にあるときと同様にコストを支払って使用する（BS08堕天使ミカファールLv2-3）。
// 支払い元はリザーブ＋フィールドのスピリット/ネクサス上のコア（手札から使うときと同じ。2026-08-24 ユーザー確認）
function castWithCost(ctx: ActionCtx, pid: PlayerId, zone: string[], j: number): boolean {
    const { state, sourceName } = ctx
    const player = state.players[pid]
    const cardId = zone[j]!
    // battleLock "magic"（BS16-X06）：トラッシュからの使用も「使用」に含む
    if (timedMagicLocked(state, pid)) {
        log(state, `${sourceName}：効果によりマジックを使用できなかった。`)
        return false
    }
    const card = getCard(cardId)
    if (magicColorBanned(state, pid, card.colors)) {
        log(state, `${sourceName}：効果によりこの色のマジックを使用できなかった。`)
        return false
    }
    const cost = effectiveCost(state, pid, card)
    const fromField = (ctx.paySources ?? []).reduce((sum, src) => {
        const inst = player.field.spirits.find((i) => i.instanceId === src.instanceId) ?? player.field.nexuses.find((i) => i.instanceId === src.instanceId)
        return sum + Math.min(Math.max(0, src.count), inst?.cores ?? 0)
    }, 0)
    if (player.reserve + fromField < cost) {
        log(state, `${sourceName}：${card.name}のコストを支払えないため発動しなかった。`)
        return false
    }
    zone.splice(j, 1)
    payCost(state, pid, cost, ctx.paySources)
    zone.push(cardId)
    log(state, `${player.name}はトラッシュの${card.name}を手札にあるときと同様に使用した。（コスト${cost}）`)
    recordMagicUsed(state, pid, cardId)
    const hasMain = card.effects.some((e) => e.kind === "magic" && e.timing === "main")
    const timing: "main" | "flash" = state.battle ? "flash" : hasMain ? "main" : "flash"
    // マジックミラー用の記録（解決中に書き換わっていれば＝使ったカード自身がマジックミラーなら上書きしない）
    const beforeLastMagicCast = state.lastMagicCast
    state.keishoExcludedCardIds = []
    resolveMagic(state, pid, cardId, timing)
    if (state.lastMagicCast === beforeLastMagicCast) state.lastMagicCast = { pid, cardId, timing }
    return true
}

// 召喚・配置・使用は1枚ずつ送り、残りは選び直す（【転召】などの選択で止まりうるため、先にまとめて抜かない）。
// count は残りの枚数、costBudget は残りの予算として減らしていく
function moveOneAtATime(ctx: ActionCtx, action: MoveCards, cands: number[]): void {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const pid = action.side === "opponent" ? opponentOf(owner) : owner
    const player = state.players[pid]
    const zone = action.from === "hand" ? player.hand : player.trashCards
    const done = action.done ?? []
    // 1回の効果で続けて召喚するあいだだけ余分の支払い済みを持つ
    if (done.length === 0 && action.dest === "summon") {
        delete state.summonSurchargePaid
        if (action.count === "all" || action.count >= 2 || action.costBudget !== undefined) startSummonBatch(state)
    }
    const end = (): void => {
        recordMoved(state, done)
        if (action.dest === "summon") flushSummonBatch(state, pid)
        if (done.length === 0) log(state, `${sourceName}：${action.from === "hand" ? "手札" : "トラッシュ"}に対象がなかった。`)
    }
    const deliver = (j: number): void => {
        const cardId = zone[j]!
        // 召喚の余分の支払い待ちで止まったときは、払ったあとの再開で召喚される（待ちが立っていれば失敗ではない）
        if (!sendOne(ctx, action, pid, j) && !state.pendingChoice) {
            end()
            return
        }
        const { asked: _a, picked: _p, ...rest } = action
        const next: MoveCards = {
            ...rest,
            count: action.count === "all" ? "all" : action.count - 1,
            done: [...done, cardId],
            ...(action.costBudget !== undefined ? { costBudget: action.costBudget - getCard(cardId).cost } : {}),
        }
        if (state.winner) return
        if (state.pendingChoice) pushResumeFrames(state, [{ kind: "action", selfInstanceId: self ? self.instanceId : null, actorPid: owner, action: next }])
        else ctx.resolve(next, { ...carry(ctx), chosenCardIndex: undefined })
    }
    if (chosenCardIndex !== undefined) {
        deliver(chosenCardIndex)
        return
    }
    // 選択を出したあとスキップされた（resolveOnSkip で cardIndex なしに戻る）
    if (action.asked) {
        end()
        return
    }
    const choosable = cands.filter(
        (j) =>
            (action.costBudget === undefined || getCard(zone[j]!).cost <= action.costBudget) &&
            (action.dest !== "summon" || (action.pay !== "cost" ? canPayFreeSummonSurcharge(state, pid, getCard(zone[j]!), 0, true) : affordable(state, pid, action, zone[j]!, viaSoryo(action)))),
    )
    if ((action.count !== "all" && action.count <= 0) || choosable.length === 0) {
        end()
        return
    }
    // 支払いがあるときと「N枚まで」は候補1枚でも聞く（やめる・支払い元を選ぶ機会がここにしか無い）
    const optional = action.pay !== undefined || action.upTo === true
    if (state.interactiveTargets && action.costBudget === undefined && (choosable.length >= 2 || optional)) {
        const chooser = action.chooserIsTarget ? pid : owner
        suspend(state, {
            pid: chooser,
            ...(chooser !== owner ? { actorPid: owner } : {}),
            kind: "card",
            prompt: `${sourceName}：${destLabel(action)}カードを選んでください${optional ? "（選ばない場合は終了します）" : ""}`,
            candidates: [],
            cardZone: action.from === "revealed" ? "reveal" : action.from,
            cardOwner: pid,
            cardIndices: choosable,
            optional,
            ...(optional ? { resolveOnSkip: true } : {}),
            action: { ...action, asked: true },
            selfInstanceId: self ? self.instanceId : null,
        })
        return
    }
    // 自動（テスト・AI）：手札の破棄は末尾（新しい方）から。ほかは払えるものの中でコスト最大、同コストは新しい方
    if (action.dest === "trash") {
        deliver(choosable[choosable.length - 1]!)
        return
    }
    const pool = choosable.filter((j) => affordable(state, pid, action, zone[j]!, viaSoryo(action)))
    const best = (pool.length > 0 ? pool : choosable).reduce((b, j) => (getCard(zone[j]!).cost >= getCard(zone[b]!).cost ? j : b))
    deliver(best)
}

// オープン中のカード（GameState.revealedCards）から。pick 無し・count:"all" でデッキ/トラッシュ/手札行きは「残り」（revealRest：デッキへは戻す順番を選ばせる）。
// それ以外は選んだ1枚ずつ revealApplyOne へ送る。count:1 の自動選択はコスト最大（同コストは前）、2以上と "all" は前から（旧 reveal のまま）
function moveRevealed(ctx: ActionCtx, action: MoveCards): void {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const zone = state.revealedCards
    if (!zone) return
    const dest = action.dest
    if (dest === "exMark") return
    if (action.pick === undefined && action.count === "all") {
        if (dest !== "deckTop" && dest !== "deckBottom" && dest !== "deckTopOrBottom" && dest !== "trash" && dest !== "hand") return
        ctx.resolve({ type: "revealRest", destPid: zone.pid, rest: dest }, { sourceColors: ctx.srcColors, sourceType: ctx.srcType })
        return
    }
    if (dest === "deckTop" || dest === "deckTopOrBottom") return
    const applyOne = (cardId: string): EffectAction => ({
        type: "revealApplyOne",
        cardId,
        srcPid: zone.pid,
        dest,
        ...(action.tensho !== undefined ? { tensho: action.tensho } : {}),
        ...(action.noSummonEffects ? { noSummonEffects: true as const } : {}),
        ...(action.orHand ? { orHand: true as const } : {}),
        ...(action.returnToDeckBottomAtEndStep ? { returnToDeckBottomAtEndStep: true as const } : {}),
        ...(action.destroyAtBattleEnd ? { destroyAtBattleEnd: true as const } : {}),
        ...(action.pay === "cost" && (dest === "summon" || dest === "summonOrPlace") ? { pay: "cost" as const } : {}),
    })
    // 取り出した順に送る（途中で選択待ちになったら残りは再開スタックへ）
    const sendAll = (ids: string[], after?: EffectAction): void => {
        const together = ids.length >= 2 && (dest === "summon" || dest === "summonOrPlace")
        if (together) startSummonBatch(state)
        const frames = [...ids.map(applyOne), ...(after ? [after] : []), ...(together ? [{ type: "summonBatchFlush" } as const] : [])]
        resolveInOrder(state, frames, {
            resolve: (a) => ctx.resolve(a, { sourceColors: ctx.srcColors, sourceType: ctx.srcType }),
            frame: (a) => ({ kind: "action" as const, selfInstanceId: self ? self.instanceId : null, actorPid: owner, action: a }),
        })
    }
    // 通常のコストを支払う召喚は、リザーブだけで払えるカードに限る（オープン中の選択に支払い元を選ぶ場が無い）
    const reserve = state.players[owner].reserve
    const payable = (id: string): boolean => action.pay !== "cost" || (dest !== "summon" && dest !== "summonOrPlace") || reserve >= minLevelCores(getCard(id)) + effectiveCost(state, owner, getCard(id), false, [], false, false)
    const candidates = (): number[] => zone.cardIds.map((id, i) => ({ id, i })).filter((x) => matchesPick(x.id, action.pick, undefined, ctx.sourceCardId) && payable(x.id)).map((x) => x.i)
    if (chosenCardIndex !== undefined) {
        const [id] = zone.cardIds.splice(chosenCardIndex, 1)
        if (id === undefined) return
        const left = typeof action.count === "number" ? action.count - 1 : 0
        sendAll([id], left > 0 ? { ...action, count: left, upTo: true } : undefined)
        return
    }
    const cands = candidates()
    if (cands.length === 0 || (typeof action.count === "number" && action.count <= 0)) return
    if (action.count === "all") {
        const ids = cands.map((i) => zone.cardIds[i]!)
        zone.cardIds = zone.cardIds.filter((_, i) => !cands.includes(i))
        sendAll(ids)
        return
    }
    const n = action.count
    if (state.interactiveTargets) {
        // 2枚以上は「Nまで」（選ばずに終えられる。続きの選択も upTo を引き継ぐ）。1枚は「できる」なら候補1枚でも聞く
        const optional = n >= 2 || action.upTo === true || action.optional === true
        if (cands.length >= 2 || optional) {
            suspend(state, {
                pid: owner,
                kind: "card",
                prompt: n >= 2 || action.upTo ? `${sourceName}：カードを選んでください（あと${n}枚まで。選ばずに終えることもできる）` : `${sourceName}：カードを選んでください`,
                candidates: [],
                cardZone: "reveal",
                cardIndices: cands,
                optional,
                action,
                selfInstanceId: self ? self.instanceId : null,
            })
            return
        }
    }
    if (n >= 2) {
        const take = cands.slice(0, n)
        const ids = take.map((i) => zone.cardIds[i]!)
        zone.cardIds = zone.cardIds.filter((_, i) => !take.includes(i))
        sendAll(ids)
        return
    }
    let best = cands[0]!
    for (const i of cands) if (getCard(zone.cardIds[i]!).cost > getCard(zone.cardIds[best]!).cost) best = i
    const [id] = zone.cardIds.splice(best, 1)
    sendAll([id!])
}

// ⚠️ 選び終わるまでゾーンから抜かない（インデックスで控える）。途中で抜くと「どのゾーンにも無いカード」ができ、保存則の検査に引っかかる。
// 「count枚まで」でも upTo が無ければ途中でやめられず、候補が尽きるか count 枚まで選ばせる。
// upTo 指定時は0〜count枚を選べる（2026-09-28ユーザー決定。途中で1枚も選ばずに終えられる）
const moveCardsHandler: ActionHandler<"moveCards"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcType, chosenCardIndex } = ctx
    if (action.from === "revealed") {
        moveRevealed(ctx, action)
        return
    }
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (action.from === "hand" && action.dest === "trash" && !canDiscardHand(state, action.side === "opponent" ? opp : owner)) {
        recordMoved(state, [])
        log(state, `${state.players[action.side === "opponent" ? opp : owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
    if (action.downTo !== undefined) {
        const { downTo, ...rest } = action
        const n = state.players[action.side === "opponent" ? opp : owner].hand.length - downTo
        if (n <= 0) {
            recordMoved(state, [])
            log(state, `${sourceName}：手札は${downTo}枚以下のため発動しなかった。`)
            return
        }
        ctx.resolve({ ...rest, count: n }, carry(ctx))
        return
    }
    // 手札へ戻す禁止は、トラッシュから手札へのときだけ（配置／召喚には掛からない）
    if (action.from === "trash" && action.dest === "hand" && (hasGlobalConstraint(state, "noTrashRecovery") || opponentCantReturnFromTrashToHand(state, owner))) {
        log(state, `${sourceName}：トラッシュからカードを手札に戻せないため発動しなかった。`)
        return
    }
    // countCounter：一度だけ数え、countCounter を落とした action へ入り直す（選択の再入で数え直さない）
    if (action.countCounter !== undefined) {
        const n = countedAmount(state, owner, self, typeof action.count === "number" ? action.count : 1, action.countCounter, srcType)
        if (n === 0) {
            recordMoved(state, [])
            log(state, `${sourceName}：カウントが0のため発動しなかった。`)
            return
        }
        const { countCounter: _cc, ...rest } = action
        ctx.resolve({ ...rest, count: n }, carry(ctx))
        return
    }
    const zonePid = action.side === "opponent" ? opp : owner
    const player = state.players[zonePid]
    const zone = action.from === "hand" ? player.hand : player.trashCards
    const picked = action.picked ?? []
    const chooser = action.chooserIsTarget ? zonePid : owner
    const toDeck = action.dest === "deckTop" || action.dest === "deckBottom"
    const all = moveCardCandidates(state, owner, action, ctx.targetInstanceId, ctx.sourceCardId ?? self?.cardId)
    const choosable = (exclude: number[]): number[] => all.filter((j) => !exclude.includes(j))
    // 召喚・配置・使用と、手札の破棄（旧 discardSelfChoose：選んだ1枚をその場で捨ててから次を聞く）は1枚ずつ送る
    if (action.dest === "summon" || action.dest === "placeNexus" || action.dest === "cast" || action.dest === "exMark" || (action.from === "hand" && action.dest === "trash")) {
        moveOneAtATime(ctx, action, all)
        return
    }

    // all：候補すべて。選び終わるまでゾーンは変わらないので毎回同じ値になる
    const count = action.count === "all" ? choosable([]).length : action.count
    const finish = (inOrder: number[]): void => {
        const order = action.exact && inOrder.length < count ? [] : inOrder
        if (order.length === 0) {
            recordMoved(state, []) // 「戻したなら」が前の記録を拾わないように
            log(state, `${sourceName}：${toDeck ? "デッキに戻せるカードがなかった。" : `${action.from === "hand" ? "手札" : "トラッシュ"}に対象がなかった。`}`)
            return
        }
        const movedIds = order.map((j) => zone[j]!)
        for (const j of [...order].sort((a, b) => b - a)) zone.splice(j, 1)
        recordMoved(state, movedIds)
        const names = `「${movedIds.map((id) => getCard(id).name).join("、")}」`
        if (toDeck) {
            for (const id of movedIds) {
                if (action.dest === "deckTop") player.deck.unshift(id)
                else player.deck.push(id)
            }
            // 手札は非公開なので名前を出さない
            const what = action.from === "hand" ? (action.revealed ? `手札の${names}を見せて` : `手札${movedIds.length}枚`) : `トラッシュの${names}`
            log(state, `${player.name}は${what}をデッキの${action.dest === "deckTop" ? "上" : "下"}に戻した。`)
            return
        }
        if (action.dest === "trash") {
            player.trashCards.push(...movedIds)
            log(state, `${player.name}は手札${names}を破棄した。`)
            return
        }
        player.hand.push(...movedIds)
        log(state, `${player.name}は${names}をトラッシュから手札に戻した。`)
        notifyHandGained(state, zonePid, movedIds.length)
    }

    // costBudget：コストの大きい順に、合計が予算以下になる範囲で取れるだけ（同コストは古い方。旧 recoverSpiritFromTrash.costBudget のまま）
    if (action.costBudget !== undefined) {
        let remaining = action.costBudget
        const order: number[] = []
        for (;;) {
            const best = choosable(order)
                .filter((j) => getCard(zone[j]!).cost <= remaining)
                .reduce<number | undefined>((b, j) => (b === undefined || getCard(zone[j]!).cost > getCard(zone[b]!).cost ? j : b), undefined)
            if (best === undefined) break
            order.push(best)
            remaining -= getCard(zone[best]!).cost
        }
        finish(order)
        return
    }

    const ask = (soFar: number[], candidates: number[], optional: boolean): void => {
        suspend(state, {
            pid: chooser,
            kind: "card",
            prompt: optional
                ? `${sourceName}：${destLabel(action)}カードを選んでください（最大${count}枚。${soFar.length}枚選択済み）`
                : `${sourceName}：${destLabel(action)}カードを選んでください（${soFar.length + 1}/${count}枚目）`,
            candidates: [],
            cardZone: action.from === "revealed" ? "reveal" : action.from,
            cardOwner: zonePid,
            cardIndices: candidates,
            optional,
            ...(optional ? { resolveOnSkip: true } : {}),
            action: { ...action, picked: soFar },
            selfInstanceId: self ? self.instanceId : null,
            ...(chooser !== owner ? { actorPid: owner } : {}),
        })
    }
    // upTo：候補があるかぎり1枚ずつ聞き直し、スキップ（resolveOnSkip）でその時点の枚数を確定する
    const askUpTo = (soFar: number[]): void => {
        const candidates = choosable(soFar)
        if (candidates.length === 0 || soFar.length >= count) finish(soFar)
        else ask(soFar, candidates, true)
    }

    if (chosenCardIndex !== undefined) {
        const next = [...picked, chosenCardIndex]
        if (action.upTo && state.interactiveTargets) {
            if (next.length >= count) finish(next)
            else askUpTo(next)
            return
        }
        if (next.length < count && choosable(next).length > 0) ctx.resolve({ ...action, picked: next }, { ...carry(ctx), chosenCardIndex: undefined })
        else finish(next)
        return
    }

    if (action.upTo && state.interactiveTargets) {
        if (action.exact && action.picked === undefined && choosable([]).length < count) {
            finish([])
            return
        }
        // action.picked が定義済み＝askUpTo のスキップから戻ってきた（どちらも picked=[] であり得るので中身では区別できない）
        if (action.picked !== undefined) finish(picked)
        else askUpTo(picked)
        return
    }

    const candidates = choosable(picked)
    // デッキへは戻す順番に、手札の破棄は1枚ずつの確認に意味があるので候補2枚以上なら聞く（旧 toDeck／discardSelfChoose のまま）。
    // それ以外は全部取れるなら聞かない
    const discard = action.from === "hand" && action.dest === "trash"
    if (state.interactiveTargets && candidates.length >= 2 && (toDeck || discard || candidates.length > count - picked.length)) {
        ask(picked, candidates, false)
        return
    }
    // 非対話（テスト・AI）と選ぶ余地が無いとき：末尾（新しい方）から。既に選んだぶんが先
    finish([...picked, ...candidates.reverse().slice(0, count - picked.length)])
}

const skipDrawStepHandler: ActionHandler<"skipDrawStep"> = (ctx) => {
    ctx.state.drawStepSkipped = true
}

const handlers = {
    moveCards: moveCardsHandler,
    skipDrawStep: skipDrawStepHandler,
} satisfies Partial<ActionRegistry>

export default handlers
