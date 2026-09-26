// コア操作系のアクションハンドラ（相手のコアを取り除く・自分のコアを払う／動かす）。コアを置く系は coreGain.ts、ライフは life.ts、【転召】は tensho.ts
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardType, CardInstance, Color, EffectAction, GameState, PlayerId, ResolvedTargetFilter } from "../../type"
import { coresForLevel, draw, getCard, instMinLevelCores, log, opponentOf } from "../GameState"
import {
    bothSidesPids,
    isResisted,
    askPayToNegateIfNeeded,
    resistanceAgainst,
    checkExhaustOnCoreChange,
    destroySpirit,
    findSpiritAny,
    millDeck,
    notifySpiritCoresRemovedByOpponent,
    pickAnySideByBp,
    pickAnySideCandidates,
    pickEnemyByBp,
    pickEnemyCandidates,
    canTakeCoresFrom,
    coreFloorFor,
    removeCores,
    removeCoresToTrash,
    removeCoresToVoid,
    requestCardChoice,
    requestChoice,
    tryInteractiveTargetChoice,
    voidCorePlacementBlocked,
    recordTimed,
} from "../EffectModules"
import {
    OPPONENT_RESERVE_TARGET,
    canDiscardHand,
    currentLevel,
    effectiveBp,
    instMatchesCostFilter,
    matchesFamilyFilter,
    matchesTarget,
    spiritHasKeyword,
} from "../../../../shared/rules"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"
import { countedAmount } from "../counted"

// pay の判定表（coreRemove）が使う候補。spread＝候補の合計コア数、all＝候補数（0/1）、
// それ以外＝count個以上持つ候補の有無を、呼び出し側が比較できるよう「達成できる最大量」を返す。
// ponytail: self相対フィルタ（maxBp:"selfBp"等）は解決せずに比べる。pay で使うカードが出たら normalizeFilter を通す
export function coreRemoveAchievableCountForPay(
    state: GameState,
    owner: PlayerId,
    selfInstanceId: string | undefined,
    action: Extract<EffectAction, { type: "coreRemove" }>,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
): number {
    const opp = opponentOf(owner)
    const filter = (action.filter ?? {}) as unknown as ResolvedTargetFilter
    const ownList = (): CardInstance[] =>
        state.players[owner].field.spirits.filter((s) => matchesTarget(state, owner, s, filter, selfInstanceId))
    const oppMatches = (s: CardInstance) => matchesTarget(state, opp, s, filter, selfInstanceId)
    const candidates: CardInstance[] =
        action.side === "own"
            ? ownList()
            : action.anySide
              ? pickAnySideCandidates(state, owner, oppMatches, srcColors, srcType)
              : pickEnemyCandidates(state, opp, Infinity, oppMatches, srcColors, srcType)
    if (action.spread) return candidates.reduce((sum, s) => sum + s.cores, 0)
    if (action.all) return candidates.length > 0 ? 1 : 0
    return candidates.some((s) => s.cores >= action.count) ? action.count : 0
}

const coreRemoveHandler: ActionHandler<"coreRemove"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // costDiscardOwnBurst（BS15-016闇騎士ガウェイン）：自分のバースト1つを破棄することがコスト。
        // 「〜することで〜する」は両方が完全に解決できるときだけ発揮する（COST_MODEL.md §1）ので、
        // 対象条件を満たす相手のスピリットが1体もいなければバーストも破棄しない
        if (action.costDiscardOwnBurst) {
            const ownerPlayer = state.players[owner]
            const filterForCheck = normalizeFilter(ctx, action)
            const hasEligibleTarget =
                filterForCheck !== SELF_REQUIRED &&
                state.players[opp].field.spirits.some((s) => matchesTarget(state, opp, s, filterForCheck, self?.instanceId))
            if (ownerPlayer.burst === null || !hasEligibleTarget) {
                log(state, `${sourceName}：対象がいないため発動しなかった。`)
                return
            }
            ownerPlayer.trashCards.push(ownerPlayer.burst)
            ownerPlayer.burst = null
            ownerPlayer.burstSet = false
            log(state, `${ownerPlayer.name}は${sourceName}のコストとして自分のバーストを破棄した。`)
            const { costDiscardOwnBurst: _cdob, ...rest } = action
            ctx.resolve(rest)
            return
        }
        // countCounter指定時はcount×EffectCounterの値を除去枚数として使う
        // （BS03巨人王ランドルフ：直前の【粉砕】で破棄した枚数ぶん。0ならログのみ）
        const count = action.countCounter !== undefined ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType) : action.count
        if (count === 0 && !action.all) {
            log(state, `${sourceName}のコア除去：カウントが0のため発動しなかった。`)
            return
        }
        // filter指定時はTargetFilterで絞り込む（対象自動選択・明示ターゲットの両方。BS08倒逆ピラミッド群：BP5000以下）
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}のコア除去：BP参照元がいなかった。`)
            return
        }
        const matchesFilter = (s: CardInstance) => matchesTarget(state, opp, s, filter, self?.instanceId)
        // spread：countぶんを複数のスピリットから1個ずつ選んで取り除く
        // （2026-09-24ユーザー確認：「スピリットのコアN個を置く」は複数のスピリットから合計N個を1個ずつ選ぶ）。
        // chooserIsTarget指定時は対象側（相手）の持ち主が選ぶ（解決は発生源owner の効果のまま）
        if (action.spread) {
            const chooser = action.chooserIsTarget ? opp : owner
            const spreadCandidates = (): { pid: PlayerId; inst: CardInstance }[] => {
                if (action.side === "own") {
                    return state.players[owner].field.spirits
                        .filter((s) => s.cores > 0 && matchesTarget(state, owner, s, filter, self?.instanceId))
                        .map((inst) => ({ pid: owner, inst }))
                }
                const oppList = pickEnemyCandidates(state, opp, Infinity, (s) => s.cores > 0 && matchesFilter(s), srcColors, srcType)
                    .map((inst) => ({ pid: opp, inst }))
                if (!action.anySide) return oppList
                const ownList = state.players[owner].field.spirits
                    .filter((s) => s.cores > 0 && matchesFilter(s))
                    .map((inst) => ({ pid: owner, inst }))
                return [...oppList, ...ownList]
            }
            const removeOne = (pid: PlayerId, inst: CardInstance): number => {
                if (action.dest === "void") return removeCoresToVoid(state, pid, inst, 1, owner)
                if (action.dest === "trash") return removeCoresToTrash(state, pid, inst, 1, owner)
                return removeCores(state, pid, inst, 1, owner, srcType)
            }
            const resolveSpread = (remaining: number): void => {
                if (state.winner || remaining <= 0) return
                const candidates = spreadCandidates()
                if (candidates.length === 0) return
                if (state.interactiveTargets) {
                    requestChoice(
                        state,
                        owner,
                        `${sourceName}のコア除去：コアを取り除くスピリットを選んでください（あと${remaining}個）`,
                        candidates.map((c) => c.inst.instanceId),
                        false,
                        { ...action, spreadRemaining: remaining },
                        self,
                        "target",
                        undefined,
                        chooser !== owner ? chooser : undefined,
                    )
                    return
                }
                const richest = candidates.reduce((best, c) => (c.inst.cores > best.inst.cores ? c : best))
                removeOne(richest.pid, richest.inst)
                resolveSpread(remaining - 1)
            }
            // 対話時の再入：選ばれた1体から1個取り除いて続きを解決する
            if (action.spreadRemaining !== undefined && targetInstanceId !== undefined) {
                const chosen = spreadCandidates().find((c) => c.inst.instanceId === targetInstanceId)
                if (chosen) removeOne(chosen.pid, chosen.inst)
                resolveSpread(action.spreadRemaining - 1)
                return
            }
            // 数が足りないときに発揮しないのは pay の事前判定の役目。単独の効果としてはあるだけ取り除く
            resolveSpread(count)
            return
        }
        // side:"own"：自分側のスピリットだけが対象（pay { cost: coreRemove{side:"own"} } の器。
        // 自分の効果は自分のスピリットに免疫が働かないためisResistedは挟まない＝anySideの自分側と同じ扱い）
        if (action.side === "own") {
            const ownCandidates = () => state.players[owner].field.spirits.filter((s) => matchesTarget(state, owner, s, filter, self?.instanceId))
            if (targetInstanceId === undefined && state.interactiveTargets) {
                const candidates = ownCandidates()
                if (candidates.length >= 2) {
                    requestChoice(state, owner, `${sourceName}のコア除去：対象を選んでください`, candidates.map((s) => s.instanceId), false, action, self)
                    return
                }
            }
            const foundOwn = targetInstanceId
                ? (() => {
                      const inst = ownCandidates().find((s) => s.instanceId === targetInstanceId)
                      return inst ? { pid: owner, inst } : null
                  })()
                : (() => {
                      const pool = ownCandidates()
                      if (pool.length === 0) return null
                      const t = pool.reduce((best, s) => (effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best))
                      return { pid: owner, inst: t }
                  })()
            if (!foundOwn) {
                log(state, `${sourceName}のコア除去：対象がいなかった。`)
                return
            }
            // 簡略化：side:"own"はleaveAtLeast/drawIfEmptiedと組み合わない前提（現状そのようなカードは無い）
            const removeCount = action.all ? foundOwn.inst.cores : count
            if (action.dest === "void") removeCoresToVoid(state, owner, foundOwn.inst, removeCount, owner)
            else if (action.dest === "trash") removeCoresToTrash(state, owner, foundOwn.inst, removeCount, owner)
            else removeCores(state, owner, foundOwn.inst, removeCount, owner, srcType)
            return
        }
        // anySide：自分/相手どちらのスピリットも対象にできる（destroy等のanySideと同じ非対称ルール。
        // 相手側候補には装甲・マジック効果耐性を尊重し、自分側には適用しない）
        if (targetInstanceId === undefined && state.interactiveTargets) {
            const candidates = action.anySide
                ? pickAnySideCandidates(state, owner, matchesFilter, srcColors, srcType)
                : pickEnemyCandidates(state, opp, Infinity, matchesFilter, srcColors, srcType)
            if (candidates.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}のコア除去：対象を選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
        }
        // 対象指定があれば両プレイヤーから検索、なければ相手（anySide指定時は自分/相手どちらか）の
        // BP最大スピリットを自動選択
        const found = targetInstanceId
            ? findSpiritAny(state, targetInstanceId)
            : action.anySide
              ? pickAnySideByBp(state, owner, Infinity, matchesFilter, srcColors, srcType)
              : (() => {
                    const t = pickEnemyByBp(state, opp, Infinity, matchesFilter, srcColors, srcType)
                    return t ? { pid: opp, inst: t } : null
                })()
        if (!found) {
            log(state, `${sourceName}のコア除去：対象がいなかった。`)
            return
        }
        // 明示ターゲットが相手側かつ装甲該当・マジック効果耐性該当なら効果を受けない
        const coreAttempt = attemptOf(ctx, "coreRemove", "targeted")
        // 「手札を破棄することで効果を受けない」は払うかを守る側に聞いてから判定する（BS08竜騎集う円卓Lv2）
        if (askPayToNegateIfNeeded(state, found.pid, found.inst, coreAttempt, action, self, sourceName)) return
        const resisted = resistanceAgainst(state, found.pid, found.inst, coreAttempt)
        if (resisted) {
            log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
            return
        }
        // all指定時はcountを無視し、対象上のコアすべてを取り除く（BS13-X02蛇皇神帝アスクレピオーズLv3）
        // leaveAtLeast指定時は、対象のコアがこの数を下回らないところまでに抑える
        // （BS04王蛇の住処Lv2：この効果では相手のスピリット上のコアを0個にできない）
        let removeCount = action.all ? found.inst.cores : count
        if (action.leaveAtLeast !== undefined) {
            removeCount = Math.min(removeCount, Math.max(0, found.inst.cores - action.leaveAtLeast))
            if (removeCount === 0) {
                log(
                    state,
                    `${sourceName}のコア除去：${getCard(found.inst.cardId).name}のコアはこれ以上取り除けなかった。`,
                )
                return
            }
        }
        // 維持コア割れの消滅処理はremoveCores/removeCoresToVoidが担う。
        // dest:"void"指定時はリザーブでなくボイドへ（BS04ヴェノムショット）。dest:"trash"指定時はトラッシュへ（BS12-012戦車皇ディルガン）
        if (action.dest === "void") {
            removeCoresToVoid(state, found.pid, found.inst, removeCount, owner)
        } else if (action.dest === "trash") {
            removeCoresToTrash(state, found.pid, found.inst, removeCount, owner)
        } else {
            removeCores(state, found.pid, found.inst, removeCount, owner, srcType)
        }
        // 「この効果でそのスピリットのコアが0個になったとき、自分はデッキから1枚ドローする」
        // （BS10-066 騎士王蛇ペンドラゴン）。**この効果で0にしたときだけ**なので、
        // 元から0だった場合は上の removeCount 計算で 0 になり、ここへ来る前に何も起きていない
        if (action.drawIfEmptied === true && removeCount > 0 && found.inst.cores === 0) {
            draw(state, owner, 1)
            log(state, `${sourceName}：コアが0個になったので${state.players[owner].name}は1枚引いた。`)
        }
        return
}

// BS12-012戦車皇ディルガン『相手のアタックステップ』ステップ開始時：
// 「このスピリットのコアを好きなだけ自分のトラッシュに置くことで、置いたコア1個につき、
// filter一致の相手スピリットのコア1個を相手のトラッシュに置く」。
// selfのコア数（0〜self.cores）をbpBuff.extraPerCoreToTrashと同じ増減式stepperで選ばせ、
// 支払った数nをcoreRemove（count:n, dest:"trash", filter）へ委譲する（装甲・効果耐性・維持コア割れの判定を1箇所に保つ）
const coreRemoveByPayingSelfCoresHandler: ActionHandler<"coreRemoveByPayingSelfCores"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenOption } = ctx
    if (!self) {
        log(state, `${sourceName}：発生源がいなかった。`)
        return
    }
    // stepperの回答（0〜selfのコア数）が戻ってきた経路
    if (chosenOption !== undefined) {
        const n = Number(chosenOption)
        if (!Number.isFinite(n) || n <= 0) {
            log(state, `${sourceName}：コアを置かなかった。`)
            return
        }
        self.cores -= n
        state.players[owner].trashCores += n
        log(state, `${sourceName}：自分のコア${n}個をトラッシュに置いた。`)
        if (self.cores < instMinLevelCores(self)) {
            destroySpirit(state, owner, self.instanceId, "deplete")
        }
        ctx.resolve({ type: "coreRemove", count: n, dest: action.dest, ...(action.filter ? { filter: action.filter } : {}) })
        return
    }
    if (self.cores <= 0) {
        log(state, `${sourceName}：コアが無いため発動しなかった。`)
        return
    }
    if (state.interactiveTargets) {
        requestChoice(
            state,
            owner,
            `${sourceName}：自分のコアをトラッシュに置く数を選んでください（1個につき対象のコアを1個トラッシュへ）`,
            [],
            true,
            action,
            self,
            "option",
            Array.from({ length: self.cores + 1 }, (_, i) => String(i)),
            undefined,
            true,
        )
        return
    }
    // 非対話時：0個（何もしない）に倒す
    log(state, `${sourceName}：コアを置かなかった。`)
    return
}

// BS12-015冥王神龍クロノ・ハデス：召喚時「自分のフィールドのコアcostOwnFieldCoresToVoid個をボイドに
// 置くことで、sideのフィールドのコアcount個をボイドに置く」。「フィールドのコア」はスピリット/ネクサス
// 上のコアのみ（リザーブは含まない）。「〜することで」はコストなので、自分のフィールド合計が
// costOwnFieldCoresToVoid以上・side側のフィールド合計がcount以上の両方を満たすときだけ発揮する
// （COST_MODEL.md §1）。どちらもコアの多い個体から順に自動で取る（範囲効果のため対象選択は挟まない）
function fieldCoresTotal(state: GameState, pid: PlayerId): number {
    const player = state.players[pid]
    return (
        player.field.spirits.reduce((sum, s) => sum + s.cores, 0) +
        player.field.nexuses.reduce((sum, n) => sum + n.cores, 0)
    )
}

function takeFieldCoresToVoid(state: GameState, pid: PlayerId, count: number, actorPid: PlayerId): number {
    const player = state.players[pid]
    let remaining = count
    let taken = 0
    while (remaining > 0) {
        let richest: CardInstance | undefined
        let richestKind: "spirit" | "nexus" | undefined
        for (const s of player.field.spirits) {
            if (s.cores > 0 && (!richest || s.cores > richest.cores)) {
                richest = s
                richestKind = "spirit"
            }
        }
        for (const n of player.field.nexuses) {
            if (n.cores > 0 && (!richest || n.cores > richest.cores)) {
                richest = n
                richestKind = "nexus"
            }
        }
        if (!richest || !richestKind) break
        if (richestKind === "spirit") {
            const removed = removeCoresToVoid(state, pid, richest, Math.min(remaining, richest.cores), actorPid)
            if (removed === 0) break
            remaining -= removed
            taken += removed
        } else {
            const take = Math.min(remaining, richest.cores)
            richest.cores -= take
            remaining -= take
            taken += take
        }
    }
    return taken
}

const voidCoresFromFieldHandler: ActionHandler<"voidCoresFromField"> = (ctx, action) => {
    const { state, owner, opp, sourceName } = ctx
    const targetPid = action.side === "own" ? owner : opp
    const costRequired = action.costOwnFieldCoresToVoid ?? 0
    if (fieldCoresTotal(state, owner) < costRequired || fieldCoresTotal(state, targetPid) < action.count) {
        log(state, `${sourceName}：コアが足りず発動しなかった。`)
        return
    }
    if (costRequired > 0) {
        takeFieldCoresToVoid(state, owner, costRequired, owner)
        log(state, `${sourceName}：自分のフィールドのコア${costRequired}個をボイドに置いた。`)
    }
    const taken = takeFieldCoresToVoid(state, targetPid, action.count, owner)
    log(state, `${sourceName}：${state.players[targetPid].name}のフィールドのコア${taken}個をボイドに置いた。`)
    return
}

// BS06-096レベルドレイン：相手のスピリット1体の上のコアを、1つ下のLvに必要なコア数と同じになるまで
// 相手のトラッシュへ置く（coreRemoveHandlerと同じ対象選択・装甲/マジック効果耐性の判定を踏襲）。
// Lv1のスピリット（1つ下のLvが無い）は対象にしても何も起きない
const coreDrainToLowerLevelHandler: ActionHandler<"coreDrainToLowerLevel"> = (ctx) => {
    const { state, owner, opp, sourceName, srcColors, srcType, targetInstanceId } = ctx
    if (targetInstanceId === undefined && state.interactiveTargets) {
        const candidates = pickEnemyCandidates(state, opp, Infinity, undefined, srcColors, srcType)
        if (candidates.length >= 2) {
            requestChoice(
                state,
                owner,
                `${sourceName}：対象を選んでください`,
                candidates.map((s) => s.instanceId),
                false,
                { type: "coreDrainToLowerLevel" },
                ctx.self,
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
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    const coreAttempt2 = attemptOf(ctx, "coreRemove", "targeted")
    // 「手札を破棄することで効果を受けない」は払うかを守る側に聞いてから判定する（BS08竜騎集う円卓Lv2）
    if (askPayToNegateIfNeeded(state, found.pid, found.inst, coreAttempt2, { type: "coreDrainToLowerLevel" }, ctx.self, sourceName)) return
    const resisted = resistanceAgainst(state, found.pid, found.inst, coreAttempt2)
    if (resisted) {
        log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
        return
    }
    const card = getCard(found.inst.cardId)
    const level = currentLevel(found.inst).level
    if (level <= 1) {
        log(state, `${sourceName}：${card.name}はLv1のため効果がなかった。`)
        return
    }
    const lowerCores = coresForLevel(card, level - 1)
    if (lowerCores === null || found.inst.cores <= lowerCores) {
        log(state, `${sourceName}：${card.name}のコアはこれ以上取り除けなかった。`)
        return
    }
    removeCoresToTrash(state, found.pid, found.inst, found.inst.cores - lowerCores, owner)
}

// coreRemoveMulti の対象1体への適用（装甲・マジック効果耐性の判定を含む）。
// pickEnemyCandidates/pickEnemyByBp経由の自動選択はこれらを既に除外済みだが、
// pendingChoice解決経由（targetInstanceId指定）はここで改めて判定する（coreRemoveHandlerと同じ考え方）
function applyCoreRemoveMultiTarget(
    state: GameState,
    opp: PlayerId,
    found: CardInstance,
    action: Extract<EffectAction, { type: "coreRemoveMulti" }>,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
    owner: PlayerId,
    sourceName: string,
): void {
    // ctx を受け取らないヘルパーなので、耐性判定の引数はここで組み立てる（attemptOf と同じ形）
    const resisted = resistanceAgainst(state, opp, found, {
        op: "coreRemove",
        scope: "targeted",
        actorPid: owner,
        ...(srcType !== undefined ? { sourceType: srcType } : {}),
        ...(srcColors !== undefined ? { sourceColors: srcColors } : {}),
    })
    if (resisted) {
        log(state, `${getCard(found.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
        return
    }
    if (action.dest === "void") removeCoresToVoid(state, opp, found, action.count, owner)
    else if (action.dest === "trash") removeCoresToTrash(state, opp, found, action.count, owner)
    else removeCores(state, opp, found, action.count, owner, srcType)
}

const coreRemoveMultiHandler: ActionHandler<"coreRemoveMulti"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
        // pendingChoice解決：選ばれた1体のみ処理する（tryInteractiveTargetChoiceのfirstAction経由）
        if (targetInstanceId !== undefined) {
            const found = state.players[opp].field.spirits.find((s) => s.instanceId === targetInstanceId)
            if (!found) {
                log(state, `${sourceName}のコア除去：対象がいなかった。`)
                return
            }
            applyCoreRemoveMultiTarget(state, opp, found, action, srcColors, srcType, owner, sourceName)
            return
        }
        // 場のスピリットのコストを条件にする判定なので、道化師クランの付与コストも見る。
        // keywordExclude（BS08闇帝竜騎サブナ・ルーク＝【転召】を持たない相手）は静的・一時付与・継続付与すべて考慮
        const matchesFilter = (s: CardInstance) =>
            instMatchesCostFilter(s, action.costFilter) &&
            (action.keywordExclude === undefined || !spiritHasKeyword(state, opp, s, action.keywordExclude))
        // allTargets（BS07腐りゆく湖沼）：条件を満たす相手すべてが対象。範囲効果なので選択を挟まない
        if (action.allTargets) {
            const all = pickEnemyCandidates(state, opp, Infinity, matchesFilter, srcColors, srcType)
            if (all.length === 0) {
                log(state, `${sourceName}のコア除去：対象がいなかった。`)
                return
            }
            for (const target of [...all]) {
                applyCoreRemoveMultiTarget(state, opp, target, action, srcColors, srcType, owner, sourceName)
            }
            return
        }
        if (action.targets <= 0) return
        if (state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, Infinity, matchesFilter, srcColors, srcType)
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}のコア除去：対象を選んでください`,
                    candidates,
                    { ...action, targets: 1 },
                    action.targets > 1 ? { ...action, targets: action.targets - 1 } : null,
                )
            ) {
                return
            }
        }
        // 決定的自動選択：実効BP上位からtargets体を重複なく選ぶ（プレイヤー選択の簡略化）
        const chosen = new Set<string>()
        for (let i = 0; i < action.targets; i++) {
            const target = pickEnemyByBp(
                state,
                opp,
                Infinity,
                (s) => matchesFilter(s) && !chosen.has(s.instanceId),
                srcColors,
                srcType,
            )
            if (!target) {
                log(state, `${sourceName}のコア除去：対象がいなかった。`)
                break
            }
            chosen.add(target.instanceId)
            applyCoreRemoveMultiTarget(state, opp, target, action, srcColors, srcType, owner, sourceName)
        }
        return
}

const protectBlockerCoresThisBattleHandler: ActionHandler<"protectBlockerCoresThisBattle"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    if (!state.battle) {
        log(state, `${sourceName}：バトル中ではないため何も起きなかった。`)
        return
    }
    recordTimed(state, { content: [{ type: "blockerCoresProtected" }], target: { kind: "battle" }, until: "battle", ownerPid: owner })
    log(state, `${sourceName}：このバトルの間、ブロックしたスピリット上のコアは取り除けない。`)
}

const coreRemoveSelfHandler: ActionHandler<"coreRemoveSelf"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // このスピリット（self）自身のコアを持ち主のリザーブへ（維持コア割れの消滅処理は removeCores が担う）
        if (!self) {
            log(state, `${sourceName}のコア除去：対象がいなかった。`)
            return
        }
        removeCores(state, owner, self, action.count, undefined, srcType)
        return
}

const coreToTrashSelfHandler: ActionHandler<"coreToTrashSelf"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // このスピリット（self）自身のコアを持ち主のトラッシュへ（維持コア割れの消滅処理は removeCoresToTrash が担う。
        // 魔帝の墓標Lv2：anySpiritAttacked 経由では self にアタックしたスピリットが渡る）
        if (!self) {
            log(state, `${sourceName}のコア除去：対象がいなかった。`)
            return
        }
        removeCoresToTrash(state, owner, self, action.count)
        return
}

const capOpponentTrashCoreReturnNextRefreshHandler: ActionHandler<"capOpponentTrashCoreReturnNextRefresh"> = (ctx, action) => {
    const { state, owner, opp, sourceName } = ctx
    recordTimed(state, { content: [{ type: "trashCoreReturnCap", max: action.max }], target: { kind: "player", pid: opp }, until: "nextRefresh", ownerPid: owner })
    log(state, `${sourceName}：次の${state.players[opp].name}のリフレッシュステップでは、トラッシュのコアは${action.max}個までしかリザーブに戻せない。`)
    return
}

const coreSqueezeAllHandler: ActionHandler<"coreSqueezeAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 両プレイヤーの全スピリットについて、コアを1個だけ残し超過分をその持ち主のリザーブへ
        let squeezed = 0
        const affectedByPid: Record<PlayerId, number> = { p1: 0, p2: 0 }
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            for (const inst of [...state.players[pid].field.spirits]) {
                if (inst.cores <= 1) continue
                // 範囲でまとめて奪う効果は候補選びの経路（pickEnemy*）を通らないので、ここで耐性を見る
                if (!canTakeCoresFrom(state, pid, inst, owner, srcColors, srcType)) {
                    log(state, `${getCard(inst.cardId).name}は${sourceName}の効果を受けなかった。`)
                    continue
                }
                // removeCores を通すことで、バトル中のコア保護（BS05茨の決戦地Lv1）・コア下限
                // （BS08聖なる柱状彫刻）・チャウーLv2の加算・維持コア割れの消滅がまとめて効く
                const removed = removeCores(state, pid, inst, inst.cores - 1, owner, srcType)
                if (removed === 0) continue
                squeezed++
                affectedByPid[pid]++
            }
        }
        if (squeezed === 0) {
            log(state, `${sourceName}：コアが2個以上のスピリットがいなかった。`)
            return
        }
        log(
            state,
            `${sourceName}：すべてのスピリット上のコアを1個だけ残し、それ以外を持ち主のリザーブに置いた。（${squeezed}体が対象）`,
        )
        // 相手（owner以外）の陣営が影響を受けたぶんは「相手の効果でコアが取り除かれた」として通知（極光の大地）
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            if (pid !== owner && affectedByPid[pid] > 0) {
                notifySpiritCoresRemovedByOpponent(state, pid, affectedByPid[pid])
            }
        }
        return
}

const coreSqueezeOneHandler: ActionHandler<"coreSqueezeOne"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
        // コアを1個だけ残し超過分を持ち主のリザーブ（dest:"trash"ならトラッシュ）へ置く（両陣営共通の適用処理）
        const toTrash = action.dest === "trash"
        const applySqueeze = (pid: PlayerId, target: CardInstance): void => {
            const excess = target.cores - 1
            if (excess <= 0) {
                log(state, `${getCard(target.cardId).name}はコアが1個以下のため変化しなかった。`)
                return
            }
            // removeCores(ToTrash) を通すことで、コア下限（BS08聖なる柱状彫刻）・バトル中のコア保護
            // （BS05茨の決戦地Lv1）・維持コア割れの消滅・極光の大地への通知がまとめて効く
            const removed = toTrash
                ? removeCoresToTrash(state, pid, target, excess, owner)
                : removeCores(state, pid, target, excess, owner, srcType)
            if (removed === 0) {
                log(state, `${getCard(target.cardId).name}のコアは取り除けなかった。`)
            }
        }
        // anySide（BS03ウィークネス）：自分/相手どちらのスピリットも対象にできる。
        // targetInstanceId優先→interactiveTargets時はrequestChoiceで両陣営から選択→
        // それも無ければ既存どおり相手BP最大の自動選択（下のループへフォールスルー）
        if (action.anySide) {
            if (targetInstanceId !== undefined) {
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) {
                    log(state, `${sourceName}のコア圧縮：対象がいなかった。`)
                    return
                }
                const squeezeResisted = resistanceAgainst(state, found.pid, found.inst, attemptOf(ctx, "coreRemove", "targeted"))
                if (squeezeResisted) {
                    log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${squeezeResisted.label}）。`)
                    return
                }
                applySqueeze(found.pid, found.inst)
                return
            }
            if (state.interactiveTargets) {
                const candidates = pickAnySideCandidates(state, owner, () => true, srcColors, srcType)
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コアを圧縮するスピリットを選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
        }
        // all指定時はcountを無視し、相手フィールドのスピリットすべてを対象にする（BS14-022幻双龍シェイロンLv1）
        if (action.all) {
            for (const target of [...state.players[opp].field.spirits]) {
                applySqueeze(opp, target)
            }
            return
        }
        // 相手フィールドの実効BP最大のスピリットをcount体選び、コアを1個だけ残す（coreSqueezeAllの単体版）
        const processed = new Set<string>()
        for (let i = 0; i < action.count; i++) {
            const target = pickEnemyByBp(
                state,
                opp,
                Infinity,
                (s) => !processed.has(s.instanceId),
                srcColors,
            )
            if (!target) {
                log(state, `${sourceName}のコア圧縮：対象がいなかった。`)
                break
            }
            processed.add(target.instanceId)
            applySqueeze(opp, target)
        }
        return
}

const coreToVoidOwnHandler: ActionHandler<"coreToVoidOwn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 自分のコアをボイドへ置く（消す）。trashCoresから優先的に減らし、足りなければ
        // 自分フィールドのスピリット（実効BP最小）から取る
        const player = state.players[owner]
        let remaining = action.count
        const fromTrash = Math.min(remaining, player.trashCores)
        if (fromTrash > 0) {
            player.trashCores -= fromTrash
            remaining -= fromTrash
            log(state, `${sourceName}：トラッシュのコア${fromTrash}個をボイドに置いた。`)
        }
        while (remaining > 0) {
            const spirits = player.field.spirits
            if (spirits.length === 0) {
                log(state, `${sourceName}：ボイドに置くコアが足りなかった。`)
                break
            }
            const target = spirits.reduce((worst, s) =>
                effectiveBp(state, owner, s) < effectiveBp(state, owner, worst)
                    ? s
                    : worst,
            )
            const taken = Math.min(remaining, target.cores)
            if (taken === 0) break // 安全策：無限ループ防止（通常は発生しない）
            target.cores -= taken
            remaining -= taken
            log(state, `${getCard(target.cardId).name}のコア${taken}個をボイドに置いた。`)
            if (target.cores < instMinLevelCores(target)) {
                destroySpirit(state, owner, target.instanceId, "deplete")
            }
        }
        return
}

const bothSidesCoreToTrashHandler: ActionHandler<"bothSidesCoreToTrash"> = (ctx, action) => {
    const { state, owner, sourceName, srcColors, srcType } = ctx
        // 両プレイヤーが各自のフィールドのスピリットから、コアの多い個体から順に
        // 合計count個を各持ち主のトラッシュへ（1体で足りなければ次にコアが多い個体へ繰り越す。
        // 維持コア割れの消滅処理はopponentCoresToTrashHandlerと同じ判定を用いる。
        // 片側のみ対象がいてもその側は処理する。BS01メタルディー・バグ＝count1、BS02マインドコントロール＝count4）
        for (const pid of bothSidesPids(state, srcType)) {
            const player = state.players[pid]
            if (player.field.spirits.length === 0) {
                log(state, `${sourceName}：${player.name}のフィールドにスピリットがいなかった。`)
                continue
            }
            let remaining = action.count
            let moved = 0
            // 耐性・保護で取れなかった個体。同じ相手を選び続けて無限ループにならないよう覚えておく
            const skip = new Set<string>()
            while (remaining > 0) {
                const richest = player.field.spirits
                    .filter((s) => s.cores > 0 && !skip.has(s.instanceId))
                    .reduce<CardInstance | undefined>(
                        (best, s) => (best === undefined || s.cores > best.cores ? s : best),
                        undefined,
                    )
                if (!richest) break
                // 耐性で弾かれる個体は候補から外す（範囲でまとめて奪う効果は pickEnemy* を通らない）
                if (!canTakeCoresFrom(state, pid, richest, owner, srcColors, srcType)) {
                    log(state, `${getCard(richest.cardId).name}は${sourceName}の効果を受けなかった。`)
                    skip.add(richest.instanceId)
                    continue
                }
                // removeCoresToTrash 経由でバトル中のコア保護・コア下限・維持コア割れの消滅を効かせる
                const removed = removeCoresToTrash(state, pid, richest, Math.min(remaining, richest.cores), owner)
                if (removed === 0) {
                    skip.add(richest.instanceId) // 保護されていて取れない：無限ループを避ける
                    continue
                }
                remaining -= removed
                moved += removed
            }
            if (moved > 0) {
                log(state, `${sourceName}：${player.name}のスピリットからコア${moved}個をトラッシュに置いた。`)
            } else {
                log(state, `${sourceName}：${player.name}のスピリットにコアがなかった。`)
            }
        }
        return
}

// bothSidesCoreToTrashHandlerと同じ「コアの多い個体から順に合計count個をトラッシュへ」の
// 単一プレイヤー版（維持コア割れの消滅処理を含む）。実際に移した枚数を返す
function moveRichestSpiritCoresToTrash(state: GameState, pid: PlayerId, count: number): number {
    const player = state.players[pid]
    let remaining = count
    let moved = 0
    while (remaining > 0) {
        const richest = player.field.spirits
            .filter((s) => s.cores > 0)
            .reduce<CardInstance | undefined>(
                (best, s) => (best === undefined || s.cores > best.cores ? s : best),
                undefined,
            )
        if (!richest) break
        const take = Math.min(remaining, richest.cores)
        richest.cores -= take
        player.trashCores += take
        remaining -= take
        moved += take
        if (richest.cores < instMinLevelCores(richest)) {
            destroySpirit(state, pid, richest.instanceId, "deplete")
        }
    }
    return moved
}

// 「自分のフィールド/リザーブのコアを自分のトラッシュに置く」の共通処理。
// **リザーブを優先**して場のスピリットを崩さない（SD02-014 魔法監視塔Lv1 と同じ方針）。
// 実際に置けた数を返す。維持コア割れになったスピリットは消滅する（moveRichestSpiritCoresToTrash）
export function payCoresFromFieldOrReserveToTrash(state: GameState, pid: PlayerId, count: number): number {
    const player = state.players[pid]
    const fromReserve = Math.min(count, player.reserve)
    player.reserve -= fromReserve
    player.trashCores += fromReserve
    return fromReserve + moveRichestSpiritCoresToTrash(state, pid, count - fromReserve)
}

// 「自分のフィールド/リザーブ」から払えるコアの総量
export function fieldOrReserveCores(state: GameState, pid: PlayerId): number {
    const player = state.players[pid]
    return player.reserve + player.field.spirits.reduce((n, sp) => n + sp.cores, 0)
}

const coreDrainAllOthersHandler: ActionHandler<"coreDrainAllOthers"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // このスピリット（self）以外のすべてのスピリット上からコアを1個ずつ持ち主のリザーブへ。
        // ループ中に消滅でspirits配列が変化するため、対象instanceIdを先に集めてから処理する。
        if (!self) {
            log(state, `${sourceName}：コア吸収の発生源がいなかった。`)
            return
        }
        const targets: { pid: PlayerId; instanceId: string }[] = []
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            for (const inst of state.players[pid].field.spirits) {
                if (inst.instanceId === self.instanceId) continue
                targets.push({ pid, instanceId: inst.instanceId })
            }
        }
        if (targets.length === 0) {
            log(state, `${sourceName}：このスピリット以外に対象がいなかった。`)
            return
        }
        let destroyed = 0
        for (const { pid, instanceId } of targets) {
            const inst = state.players[pid].field.spirits.find(
                (s) => s.instanceId === instanceId,
            )
            if (!inst) continue // 途中の誘発等ですでにフィールドから消えている場合はスキップ
            const before = state.players[pid].field.spirits.length
            removeCores(state, pid, inst, 1, owner, srcType)
            if (state.players[pid].field.spirits.length < before) destroyed++
        }
        log(
            state,
            `${sourceName}：このスピリット以外のすべてのスピリット上からコアを1個ずつ持ち主のリザーブに置いた。`,
        )
        if (destroyed > 0) {
            if (action.rewardDraw) {
                draw(state, owner, destroyed)
                log(
                    state,
                    `${sourceName}：この効果で${destroyed}体が消滅したため、自分はデッキから${destroyed}枚ドローした。`,
                )
            } else if (voidCorePlacementBlocked(state)) {
                log(state, `${sourceName}：コアステップ以外はボイドからコアを置けないため置かなかった。`)
            } else {
                self.cores += destroyed
                log(
                    state,
                    `${sourceName}：この効果で${destroyed}体が消滅したため、ボイドからコア${destroyed}個を自身の上に置いた。`,
                )
            }
        }
        return
}

const voidCoresAndMillByCostHandler: ActionHandler<"voidCoresAndMillByCost"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcType, targetInstanceId } = ctx
        // BS05マジックスパナ：familyFilter一致の自分のスピリット1体のコアすべてをボイドに置き、
        // そのスピリットのコストと同じ枚数だけ相手のデッキをトラッシュへ送る
        const player = state.players[owner]
        const candidates = player.field.spirits.filter((s) =>
            matchesFamilyFilter(state, owner, s, action.familyFilter),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        let target = targetInstanceId
            ? candidates.find((s) => s.instanceId === targetInstanceId)
            : undefined
        if (!target) {
            if (candidates.length >= 2 && state.interactiveTargets) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コアをボイドに置くスピリットを選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
            // 決定的自動選択：コスト最大（破棄枚数を最大化する）。
            // 複数コストを持つ状態（道化師クラン）では「最大」を定義できないため、
            // ここと下のミル枚数計算はカード本来のコストのまま比較・参照する（順序付け・値の参照）
            target = candidates.reduce((best, s) =>
                getCard(s.cardId).cost > getCard(best.cardId).cost ? s : best,
            )
        }
        const voided = target.cores
        const cost = getCard(target.cardId).cost
        const name = getCard(target.cardId).name
        target.cores = 0
        log(state, `${player.name}は${name}のコア${voided}個をボイドに置いた。`)
        if (voided < instMinLevelCores(target)) {
            destroySpirit(state, owner, target.instanceId, "deplete")
        }
        millDeck(state, opp, cost, owner, srcType ? { sourceType: srcType } : undefined)
        return
}

// 相手のスピリットから合計count個のコアを、1個ずつ対象を選びながら取り除く（SD01-013 冥剣士ベリト）。
// coreRemove が「1体からN個」なのに対し、こちらは「N個を何体かに配分」。
// 1個ぶんの実処理は coreRemove count:1 に委譲しているので、装甲・効果耐性・維持コア割れの消滅・
// leaveAtLeast の判定はすべて coreRemove 側の1箇所に残る。
// 残数の持ち回りは Pattern C「体数で再入」（docs/design/RESUME_STACK.md §7）：
// tryInteractiveTargetChoice が 1個ぶんを選択待ちにし、残り (count-1) を再開フレームへ積む
const coreRemoveDistributedHandler: ActionHandler<"coreRemoveDistributed"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
        if (action.count <= 0) return
        const floor = action.leaveAtLeast ?? 0
        const one: EffectAction = {
            type: "coreRemove",
            count: 1,
            ...(action.dest !== undefined ? { dest: action.dest } : {}),
            ...(action.leaveAtLeast !== undefined ? { leaveAtLeast: action.leaveAtLeast } : {}),
        }
        // 選択の再入：選ばれた1体から1個だけ取り、残りは同じ形で続ける
        if (targetInstanceId !== undefined) {
            ctx.resolve(one, { targetInstanceId, sourceColors: srcColors, sourceType: srcType })
            if (action.count > 1) {
                ctx.resolve({ ...action, count: action.count - 1 }, { sourceColors: srcColors, sourceType: srcType })
            }
            return
        }
        // 候補：コアが floor を上回っている相手のスピリット（装甲・効果耐性で守られているものは除く）
        const candidates = state.players[opp].field.spirits.filter(
            (s) => s.cores > floor && !isResisted(state, opp, s, attemptOf(ctx, "coreRemove", "targeted")),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：コアを取り除ける相手のスピリットがいなかった。`)
            return
        }
        const prompt = action.chooserIsTarget
            ? `${sourceName}：コアを取り除く自分のスピリットを選んでください（残り${action.count}個）`
            : `${sourceName}：コアを取り除く相手のスピリットを選んでください（残り${action.count}個）`
        if (
            tryInteractiveTargetChoice(
                state,
                owner,
                self,
                prompt,
                candidates,
                { ...action, count: 1 },
                action.count > 1 ? { ...action, count: action.count - 1 } : null,
                action.chooserIsTarget ? opp : undefined,
            )
        ) {
            return
        }
        // 非対話（テスト）と候補1件のときの自動選択。docs/design/CHOOSER_RULES.md の規約に従い、
        // chooserIsTarget なら「相手が選ぶであろうもの＝損の小さいコア最多の1体」、
        // そうでなければ「発生源の持ち主が選ぶ＝痛いコア最少の1体」を取る
        const pick = candidates.reduce((best, s) =>
            action.chooserIsTarget
                ? (s.cores > best.cores ? s : best)
                : (s.cores < best.cores ? s : best),
        )
        ctx.resolve(one, { targetInstanceId: pick.instanceId, sourceColors: srcColors, sourceType: srcType })
        if (action.count > 1) {
            ctx.resolve({ ...action, count: action.count - 1 }, { sourceColors: srcColors, sourceType: srcType })
        }
        return
}

const coreToOpponentTrashChoiceHandler: ActionHandler<"coreToOpponentTrashChoice"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 相手フィールドのスピリット/ネクサス1つを選び、コアcount個を相手のトラッシュへ置く。
        // targetInstanceId 指定時はその対象へ実行、未指定時は候補を集めて選択を要求する（魔界侯爵コキュートス）
        if (targetInstanceId !== undefined) {
            const oppPlayer = state.players[opp]
            // 「相手のフィールド/**リザーブ**から」（BS03-075 犬人マードック）。
            // リザーブはインスタンスを持たないため、候補に番兵を混ぜて表現する
            if (targetInstanceId === OPPONENT_RESERVE_TARGET) {
                const removed = Math.min(action.count, oppPlayer.reserve)
                oppPlayer.reserve -= removed
                oppPlayer.trashCores += removed
                log(state, `${sourceName}：${oppPlayer.name}のリザーブのコア${removed}個をトラッシュに置いた。`)
                return
            }
            const spirit = oppPlayer.field.spirits.find((s) => s.instanceId === targetInstanceId)
            if (spirit) {
                removeCoresToTrash(state, opp, spirit, action.count, owner)
                return
            }
            const nexus = oppPlayer.field.nexuses.find((n) => n.instanceId === targetInstanceId)
            if (nexus) {
                const removed = Math.min(action.count, nexus.cores)
                nexus.cores -= removed
                state.players[opp].trashCores += removed
                log(
                    state,
                    `${sourceName}：${getCard(nexus.cardId).name}（ネクサス）のコア${removed}個をトラッシュに置いた。`,
                )
                return
            }
            log(state, `${sourceName}：対象が見つからなかった。`)
            return
        }
        // 初回：相手フィールドのコア1個以上のスピリット/ネクサスを候補にして選択を要求する
        const oppPlayer = state.players[opp]
        const spiritCandidates = oppPlayer.field.spirits.filter(
            (s) =>
                s.cores >= 1 && !isResisted(state, opp, s, attemptOf(ctx, "coreRemove", "targeted")),
        )
        // spiritsOnly：「相手のスピリット**上の**コア1個」＝ネクサスは含まない（BS08ダークスカルデーモンLv2）
        const nexusCandidates = action.spiritsOnly
            ? []
            : oppPlayer.field.nexuses.filter((n) => n.cores >= 1)
        const candidates = [...spiritCandidates, ...nexusCandidates].map((i) => i.instanceId)
        // includeReserve 指定時のみ、相手のリザーブも取得元として選べる
        // （BS03-075 犬人マードック＝「相手のフィールド/リザーブから」。
        //  BS02-022 コキュートスは「スピリット1体かネクサス1つ」なのでリザーブを含めない）
        const withReserve = action.includeReserve && oppPlayer.reserve >= 1
        if (withReserve) candidates.push(OPPONENT_RESERVE_TARGET)
        // chooserIsTarget（BS08ダークスカルデーモンLv2）：「**相手は**、相手のスピリット上のコア1個を〜置く」。
        // 選ぶのはコアを取られる側だが、解決は発生源の持ち主の効果として行う（actorPid）
        requestChoice(
            state,
            owner,
            action.chooserIsTarget
                ? `${sourceName}：コアをトラッシュに置く自分のスピリットを選んでください`
                : withReserve
                  ? "コアを取り除く相手のスピリット/ネクサス、または相手のリザーブを選択"
                  : action.spiritsOnly
                    ? "コアを取り除く相手のスピリットを選択"
                    : "コアを取り除く相手のスピリット/ネクサスを選択",
            candidates,
            false,
            action,
            self,
            "target",
            undefined,
            action.chooserIsTarget ? opp : undefined,
        )
        return
}

const linkNexusCoresChoiceHandler: ActionHandler<"linkNexusCoresChoice"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // クロスシザース：自分のネクサス1つを指定し、コア数をこのスピリットのコア数と同じものとして扱う
        // （selfがnullなら不発。requestChoiceが候補0件/1件/複数件を判定する）
        if (!self) return
        if (targetInstanceId === undefined) {
            const candidates = state.players[owner].field.nexuses.map((n) => n.instanceId)
            requestChoice(state, owner, "コア数をリンクするネクサスを選んでください", candidates, true, action, self)
            return
        }
        const nexus = state.players[owner].field.nexuses.find((n) => n.instanceId === targetInstanceId)
        if (!nexus) return
        nexus.coresLinkedTo = self.instanceId
        log(
            state,
            `${sourceName}：${getCard(nexus.cardId).name}のコア数は、このスピリットのコア数と同じものとして扱われる。`,
        )
        return
}

const coreTradeToOpponentTrashHandler: ActionHandler<"coreTradeToOpponentTrash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 自分のリザーブのコアをX個自分のトラッシュへ、同数だけ相手のリザーブから相手のトラッシュへ
        const player = state.players[owner]
        const opponent = state.players[opp]
        if (chosenOption !== undefined) {
            const n = parseInt(chosenOption, 10)
            if (!Number.isFinite(n) || n <= 0) return
            const capped = Math.min(n, player.reserve, opponent.reserve)
            if (capped <= 0) return
            player.reserve -= capped
            player.trashCores += capped
            opponent.reserve -= capped
            opponent.trashCores += capped
            log(
                state,
                `${player.name}はリザーブのコア${capped}個をトラッシュへ置き、${opponent.name}のリザーブのコア${capped}個も相手のトラッシュへ置かれた。`,
            )
            return
        }
        const maxAmount = Math.min(player.reserve, opponent.reserve)
        if (maxAmount <= 0) {
            log(state, `${sourceName}：お互いのリザーブが不足しており実行できなかった。`)
            return
        }
        if (state.interactiveTargets) {
            const options = Array.from({ length: maxAmount }, (_, i) => `${i + 1}個`)
            requestChoice(
                state,
                owner,
                `${sourceName}：自分のリザーブのコアを何個トラッシュへ置きますか？（同数だけ相手のリザーブもトラッシュへ。任意）`,
                [],
                true,
                action,
                self,
                "option",
                options,
            )
            return
        }
        // 自動時：上限個（min(自分,相手)）を実行
        player.reserve -= maxAmount
        player.trashCores += maxAmount
        opponent.reserve -= maxAmount
        opponent.trashCores += maxAmount
        log(
            state,
            `${player.name}はリザーブのコア${maxAmount}個をトラッシュへ置き、${opponent.name}のリザーブのコア${maxAmount}個も相手のトラッシュへ置かれた。`,
        )
        return
}

// 器BS16（BS16-056シフゲイターLv1）：相手のスピリットすべての上から、コアをcount個ずつ相手の
// リザーブ（既定）／dest指定時はボイド・トラッシュへ（範囲効果。coreToTrashAllByCostのコスト限定を外した全体版）
const coreRemoveAllOpponentHandler: ActionHandler<"coreRemoveAllOpponent"> = (ctx, action) => {
    const { state, owner, opp, sourceName } = ctx
    const targets = state.players[opp].field.spirits.filter(
        (s) => !isResisted(state, opp, s, attemptOf(ctx, "coreRemove", "area")),
    )
    if (targets.length === 0) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    for (const t of targets) {
        const n = Math.min(action.count, t.cores)
        if (n <= 0) continue
        if (action.dest === "void") removeCoresToVoid(state, opp, t, n, owner)
        else if (action.dest === "trash") removeCoresToTrash(state, opp, t, n, owner)
        else removeCores(state, opp, t, n, owner)
    }
}

const coreToTrashAllByCostHandler: ActionHandler<"coreToTrashAllByCost"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 相手のコストmaxCost以下のスピリットすべての上から、コア1個ずつを相手のトラッシュへ
        // （範囲効果。destroy{all}と同様に装甲・マジック効果耐性・immuneToOpponentThisTurnを除外。BS04風龍王フージャオス）
        const targets = state.players[opp].field.spirits.filter(
            (s) =>
                instMatchesCostFilter(s, { max: action.maxCost }) &&
                !isResisted(state, opp, s, attemptOf(ctx, "coreRemove", "area")),
        )
        if (targets.length === 0) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        for (const t of targets) removeCoresToTrash(state, opp, t, 1, owner)
        return
}

const coreRemovePerHandDiscardHandler: ActionHandler<"coreRemovePerHandDiscard"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
    // BS11-065 満天の牧草地：『お互いのメインステップ』手札を破棄できない
    if (!canDiscardHand(state, owner)) {
        log(state, `${state.players[owner].name}は、効果によりメインステップに手札を破棄できない。`)
        return
    }
        // 自分の手札を好きなだけ破棄し、破棄したカード1枚につき相手のスピリット1体
        // （実効BP最大を自動選択。同一解決内で既に選んだ個体は除外して異なる個体へ広げる）の
        // コアを1個、相手のトラッシュへ置く（王蛇ケツァルカトル／ダンスマカブル）
        const player = state.players[owner]
        const removeOneCoreFromEnemy = (excluded: Set<string>): void => {
            const target = pickEnemyByBp(
                state,
                opp,
                Infinity,
                (s) => !excluded.has(s.instanceId),
                srcColors,
                srcType,
            )
            if (!target) {
                log(state, `${sourceName}：コアを除去する対象がいなかった。`)
                return
            }
            excluded.add(target.instanceId)
            removeCoresToTrash(state, opp, target, 1, owner)
        }
        if (chosenCardIndex !== undefined) {
            const cardId = player.hand[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}：破棄する手札がなかった。`)
                return
            }
            player.hand.splice(chosenCardIndex, 1)
            player.trashCards.push(cardId)
            log(state, `${player.name}は手札の「${getCard(cardId).name}」を破棄した。`)
            removeOneCoreFromEnemy(new Set())
            // 続けて破棄できるか再度尋ねる（optional=trueのためスキップで終了する）
            ctx.resolve(action)
            return
        }
        if (state.interactiveTargets) {
            if (player.hand.length === 0) {
                log(state, `${sourceName}：手札がなかった。`)
                return
            }
            requestCardChoice(
                state,
                owner,
                `${sourceName}：破棄する手札を選んでください（選ばなければ終了）`,
                "hand",
                player.hand.map((_, i) => i),
                true,
                action,
                self,
            )
            return
        }
        // 非interactive時：手札をすべて破棄し、破棄枚数ぶん一括でコア除去する（決定的簡略化）
        const count = player.hand.length
        if (count === 0) {
            log(state, `${sourceName}：手札がなかった。`)
            return
        }
        const discardedNames = player.hand.map((cardId) => getCard(cardId).name)
        player.trashCards.push(...player.hand)
        player.hand = []
        log(state, `${player.name}は手札「${discardedNames.join("、")}」を破棄した。`)
        const excluded = new Set<string>()
        for (let i = 0; i < count; i++) removeOneCoreFromEnemy(excluded)
        return
}

const opponentCoresToTrashHandler: ActionHandler<"opponentCoresToTrash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 氷の女神フリッグ：相手のリザーブ→相手スピリット上（コアの多い順）の順にコアを相手のトラッシュへ
        const target = state.players[opp]
        // reserveAll（BS09-017蛇凰神バァラルLv3）：リザーブにあるコアすべてをトラッシュへ。
        // スピリット上のコアには触れないので、ここで完結する
        if (action.reserveAll) {
            const moved = target.reserve
            if (moved === 0) {
                log(state, `${sourceName}：${target.name}のリザーブにコアがなかった。`)
                return
            }
            target.reserve = 0
            target.trashCores += moved
            log(state, `${sourceName}：${target.name}のリザーブのコア${String(moved)}個をトラッシュに置いた。`)
            return
        }
        let remaining = action.count
        const fromReserve = Math.min(remaining, target.reserve)
        target.reserve -= fromReserve
        target.trashCores += fromReserve
        remaining -= fromReserve
        const skip = new Set<string>() // 耐性・保護で取れなかった個体（無限ループ防止）
        while (remaining > 0) {
            const richest = target.field.spirits
                .filter((s) => s.cores > 0 && !skip.has(s.instanceId))
                .reduce<CardInstance | undefined>(
                    (best, s) => (best === undefined || s.cores > best.cores ? s : best),
                    undefined,
                )
            if (!richest) break
            if (!canTakeCoresFrom(state, opp, richest, owner, srcColors, srcType)) {
                log(state, `${getCard(richest.cardId).name}は${sourceName}の効果を受けなかった。`)
                skip.add(richest.instanceId)
                continue
            }
            const removed = removeCoresToTrash(state, opp, richest, Math.min(remaining, richest.cores), owner)
            if (removed === 0) {
                skip.add(richest.instanceId)
                continue
            }
            remaining -= removed
        }
        const moved = action.count - remaining
        log(state, `${sourceName}：${target.name}のコア${moved}個をトラッシュに置いた。`)
        return
}

// 「このスピリットが相手のスピリットの効果で破壊されたとき、その効果を発揮したスピリット上のコアすべてを
// 相手のトラッシュに置く」（BS10-012アントイーター/BS10-014闇騎士マリス）。
// targetInstanceIdは fieldEvent.byOpponentSpiritEffectOnly が渡す「自分を破壊した相手のスピリット」
const destroyerCoresToTrashHandler: ActionHandler<"destroyerCoresToTrash"> = (ctx) => {
    const { state, owner, sourceName, targetInstanceId } = ctx
        if (targetInstanceId === undefined) {
            log(state, `${sourceName}：破壊した相手のスピリットが見つからなかった。`)
            return
        }
        const found = findSpiritAny(state, targetInstanceId)
        if (!found || found.inst.cores === 0) {
            log(state, `${sourceName}：破壊した相手のスピリットが見つからなかった。`)
            return
        }
        removeCoresToTrash(state, found.pid, found.inst, found.inst.cores, owner)
}

const opponentNexusOrReserveCoreToTrashHandler: ActionHandler<"opponentNexusOrReserveCoreToTrash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, chosenOption } = ctx
        // エナジードレイン：相手のネクサス上のコアか、相手のリザーブのコアかを**効果の使用者が選ぶ**
        // （2026-09-02。PROCEDURES_AUDIT §5 の一般則。ネクサスから取るとレベルが下がるので選択に意味がある）。
        // 非対話（テスト・AI）は従来どおり「コア数最多のネクサス → 無ければリザーブ」
        const oppPlayer = state.players[opp]
        // 選択肢のラベル（表示文言がそのまま値として返る）。同名ネクサスが並ぶので先頭に番号を振る
        const coreSourceLabels = (): { label: string; instanceId?: string }[] => [
            ...oppPlayer.field.nexuses
                .filter((n) => n.cores > 0)
                .map((n, i) => ({ label: `${i + 1}. ${getCard(n.cardId).name}（コア${n.cores}個）`, instanceId: n.instanceId })),
            ...(oppPlayer.reserve > 0 ? [{ label: `リザーブ（コア${oppPlayer.reserve}個）` }] : []),
        ]
        if (chosenOption !== undefined) {
            const picked = coreSourceLabels().find((o) => o.label === chosenOption)
            const nexus = picked?.instanceId
                ? oppPlayer.field.nexuses.find((n) => n.instanceId === picked.instanceId)
                : undefined
            if (nexus) {
                const take = Math.min(action.count, nexus.cores)
                nexus.cores -= take
                oppPlayer.trashCores += take
                log(state, `${sourceName}：${getCard(nexus.cardId).name}（ネクサス）のコア${take}個をトラッシュに置いた。`)
                return
            }
            const take = Math.min(action.count, oppPlayer.reserve)
            oppPlayer.reserve -= take
            oppPlayer.trashCores += take
            log(state, `${sourceName}：${oppPlayer.name}のリザーブのコア${take}個をトラッシュに置いた。`)
            return
        }
        // 取り先が2つ以上あるときだけ聞く
        const sources = coreSourceLabels()
        if (state.interactiveTargets && sources.length >= 2) {
            requestChoice(
                state,
                owner,
                `${sourceName}：${oppPlayer.name}のどこからコアを取りますか？`,
                [],
                false,
                action,
                self,
                "option",
                sources.map((o) => o.label),
            )
            return
        }
        const richestNexus = oppPlayer.field.nexuses
            .filter((n) => n.cores > 0)
            .reduce<CardInstance | undefined>(
                (best, n) => (best === undefined || n.cores > best.cores ? n : best),
                undefined,
            )
        if (richestNexus) {
            const take = Math.min(action.count, richestNexus.cores)
            richestNexus.cores -= take
            oppPlayer.trashCores += take
            log(
                state,
                `${sourceName}：${getCard(richestNexus.cardId).name}（ネクサス）のコア${take}個をトラッシュに置いた。`,
            )
            return
        }
        if (oppPlayer.reserve > 0) {
            const take = Math.min(action.count, oppPlayer.reserve)
            oppPlayer.reserve -= take
            oppPlayer.trashCores += take
            log(state, `${sourceName}：${oppPlayer.name}のリザーブのコア${take}個をトラッシュに置いた。`)
            return
        }
        log(state, `${sourceName}：相手のネクサス・リザーブにコアがなかった。`)
        return
}

const bothSidesCoreToVoidHandler: ActionHandler<"bothSidesCoreToVoid"> = (ctx, action) => {
    const { state, owner, sourceName, srcColors, srcType } = ctx
        // インフェルノアイズ：両プレイヤーが各自のスピリット+ネクサスから、コアの多い個体から順に
        // 合計count個をボイドへ（維持コア割れの消滅処理はスピリットのみ。ネクサスは消滅しない）
        for (const pid of bothSidesPids(state, srcType)) {
            const player = state.players[pid]
            let remaining = action.count
            let moved = 0
            const skip = new Set<string>() // 耐性・保護で取れなかった個体（無限ループ防止）
            while (remaining > 0) {
                let richest: CardInstance | undefined
                let richestKind: "spirit" | "nexus" | undefined
                for (const s of player.field.spirits) {
                    if (s.cores > 0 && !skip.has(s.instanceId) && (!richest || s.cores > richest.cores)) {
                        richest = s
                        richestKind = "spirit"
                    }
                }
                for (const n of player.field.nexuses) {
                    if (n.cores > 0 && (!richest || n.cores > richest.cores)) {
                        richest = n
                        richestKind = "nexus"
                    }
                }
                if (!richest || !richestKind) break
                if (richestKind === "spirit") {
                    if (!canTakeCoresFrom(state, pid, richest, owner, srcColors, srcType)) {
                        log(state, `${getCard(richest.cardId).name}は${sourceName}の効果を受けなかった。`)
                        skip.add(richest.instanceId)
                        continue
                    }
                    const removed = removeCoresToVoid(state, pid, richest, Math.min(remaining, richest.cores), owner)
                    if (removed === 0) {
                        skip.add(richest.instanceId)
                        continue
                    }
                    remaining -= removed
                    moved += removed
                    continue
                }
                // ネクサスは装甲・維持コアの概念が無いので従来どおり直接動かす
                const take = Math.min(remaining, richest.cores)
                richest.cores -= take
                remaining -= take
                moved += take
            }
            if (moved > 0) {
                log(state, `${sourceName}：${player.name}のスピリット/ネクサスからコア${moved}個をボイドに置いた。`)
            } else {
                log(state, `${sourceName}：${player.name}のフィールドにコアがなかった。`)
            }
        }
        return
}

// ブラッディレイン：相手のコア総量（フィールド＋トラッシュ＋リザーブ）に応じた個数をボイドへ置く。
// 「相手がその中から選ぶ」を、リザーブ→トラッシュ→フィールド（コアの多い個体から）の順で
// 機械的に取り除く決定的簡略化にしてある（相手の不利が最小になる順序）
// 取り先1つぶんの選択肢。ラベルは相手に見せる文字列で、**同名個体があっても一意になるよう連番を付ける**
// （resolveChoice はラベル文字列で返るため、重複すると取り先を特定できない）
interface CoreSource {
    label: string
    kind: "reserve" | "trash" | "spirit" | "nexus"
    instanceId?: string
}

// 取り先の候補を作る（リザーブ／トラッシュ／フィールドの各個体）。装甲・効果耐性で取れない個体は外す。
// **opponentCoresToVoidByTotal と coresDownToLimit が共有する**（コピーすると片方だけ直す事故になる）
function coreSourcesOf(
    state: GameState,
    targetPid: PlayerId,
    actorPid: PlayerId,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
): CoreSource[] {
    const player = state.players[targetPid]
    const sources: CoreSource[] = []
    if (player.reserve > 0) sources.push({ label: "リザーブ", kind: "reserve" })
    if (player.trashCores > 0) sources.push({ label: "トラッシュ", kind: "trash" })
    const seen = new Map<string, number>()
    const labelFor = (name: string): string => {
        const n = (seen.get(name) ?? 0) + 1
        seen.set(name, n)
        return n === 1 ? name : `${name}（${n}体目）`
    }
    for (const sp of player.field.spirits) {
        if (sp.cores <= 0) continue
        if (!canTakeCoresFrom(state, targetPid, sp, actorPid, srcColors, srcType)) continue
        sources.push({ label: labelFor(getCard(sp.cardId).name), kind: "spirit", instanceId: sp.instanceId })
    }
    for (const nx of player.field.nexuses) {
        if (nx.cores <= 0) continue
        sources.push({ label: labelFor(getCard(nx.cardId).name), kind: "nexus", instanceId: nx.instanceId })
    }
    return sources
}

// 選ばれた取り先から1個だけボイドへ置く。維持コア割れの消滅処理は removeCoresToVoid が担う
function takeOneCoreToVoid(state: GameState, targetPid: PlayerId, picked: CoreSource, actorPid: PlayerId): void {
    const player = state.players[targetPid]
    if (picked.kind === "reserve") {
        player.reserve -= 1
        log(state, `${player.name}はリザーブのコア1個をボイドに置いた。`)
        return
    }
    if (picked.kind === "trash") {
        player.trashCores -= 1
        log(state, `${player.name}はトラッシュのコア1個をボイドに置いた。`)
        return
    }
    if (picked.kind === "spirit") {
        const sp = player.field.spirits.find((x) => x.instanceId === picked.instanceId)
        if (!sp) return
        removeCoresToVoid(state, targetPid, sp, 1, actorPid)
        return
    }
    const nx = player.field.nexuses.find((x) => x.instanceId === picked.instanceId)
    if (!nx) return
    nx.cores -= 1
    log(state, `${getCard(nx.cardId).name}の上のコア1個をボイドに置いた。`)
}

// 非対話（テスト・AI）の決定的簡略化：リザーブ→トラッシュ→フィールド（コアの多い個体から）の順に
// count 個をボイドへ置く。**この順は2つのアクションで共有する**（規則を2つ持たないため）
function autoTakeCoresToVoid(
    state: GameState,
    targetPid: PlayerId,
    count: number,
    actorPid: PlayerId,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
    sourceName: string,
): { fromReserve: number; fromTrash: number; fromField: number; remaining: number } {
    const player = state.players[targetPid]
    let remaining = count
    const fromReserve = Math.min(remaining, player.reserve)
    player.reserve -= fromReserve
    remaining -= fromReserve
    const fromTrash = Math.min(remaining, player.trashCores)
    player.trashCores -= fromTrash
    remaining -= fromTrash
    let fromField = 0
    const skip = new Set<string>() // 耐性・保護で取れなかった個体（無限ループ防止）
    while (remaining > 0) {
        let richest: CardInstance | undefined
        let richestKind: "spirit" | "nexus" | undefined
        for (const s of player.field.spirits) {
            if (s.cores > 0 && !skip.has(s.instanceId) && (!richest || s.cores > richest.cores)) {
                richest = s
                richestKind = "spirit"
            }
        }
        for (const n of player.field.nexuses) {
            if (n.cores > 0 && (!richest || n.cores > richest.cores)) {
                richest = n
                richestKind = "nexus"
            }
        }
        if (!richest || !richestKind) break
        if (richestKind === "spirit") {
            if (!canTakeCoresFrom(state, targetPid, richest, actorPid, srcColors, srcType)) {
                log(state, `${getCard(richest.cardId).name}は${sourceName}の効果を受けなかった。`)
                skip.add(richest.instanceId)
                continue
            }
            const removed = removeCoresToVoid(state, targetPid, richest, Math.min(remaining, richest.cores), actorPid)
            if (removed === 0) {
                skip.add(richest.instanceId)
                continue
            }
            remaining -= removed
            fromField += removed
            continue
        }
        // ネクサスは装甲・維持コアの概念が無いので従来どおり直接動かす
        const take = Math.min(remaining, richest.cores)
        richest.cores -= take
        remaining -= take
        fromField += take
    }
    return { fromReserve, fromTrash, fromField, remaining }
}

// フィールド（スピリット＋ネクサス）＋トラッシュ＋リザーブのコア合計
function totalCoresOf(state: GameState, pid: PlayerId): number {
    const player = state.players[pid]
    return (
        player.field.spirits.reduce((sum, s) => sum + s.cores, 0) +
        player.field.nexuses.reduce((sum, n) => sum + n.cores, 0) +
        player.trashCores +
        player.reserve
    )
}

// BS15-075ブラッディロンドメイン：お互いのコア合計（フィールド+リザーブ+トラッシュ）を比べ、多かった方の
// 持ち主が、少ない方と同じ合計になるまでボイドへ置く（同数なら不発）。取り先はその持ち主が選ぶ。
// coresDownToLimitへ、多かった方をsides・少なかった方の合計をlimitとして委譲する
const coreToVoidEqualizeByTotalHandler: ActionHandler<"coreToVoidEqualizeByTotal"> = (ctx) => {
    const { state, owner, opp, sourceName } = ctx
    const totalOwner = totalCoresOf(state, owner)
    const totalOpp = totalCoresOf(state, opp)
    if (totalOwner === totalOpp) {
        log(state, `${sourceName}：お互いのコア合計は同数だった。`)
        return
    }
    const side: "opponent" | "own" = totalOwner > totalOpp ? "own" : "opponent"
    const limit = Math.min(totalOwner, totalOpp)
    ctx.resolve({ type: "coresDownToLimit", limit, sides: [side] })
}

const opponentCoresToVoidByTotalHandler: ActionHandler<"opponentCoresToVoidByTotal"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, chosenOption } = ctx
    const player = state.players[opp]
    const total = totalCoresOf(state, opp)
    // 条件を満たす段のうち最大の minTotal を採用する
    let count = 0
    let matchedMin = -1
    for (const tier of action.tiers) {
        if (total >= tier.minTotal && tier.minTotal > matchedMin) {
            matchedMin = tier.minTotal
            count = tier.count
        }
    }
    if (count === 0) {
        log(state, `${sourceName}：${player.name}のコアは合計${total}個で条件を満たさなかった。`)
        return
    }

    // ---- 実対戦：効果文の主語は「**相手は**その中から◯個をボイドに置く」なので、
    //      取り先は1個ずつ**コアを失う側**が選ぶ（2026-08-17 ユーザー確認）。
    //      それまでは対話モードでも下の決定的簡略化を通していた。
    //      選択者だけ相手に差し替え、解決は発生源の持ち主の効果のまま（requestChoice の chooserPid）
    if (state.interactiveTargets) {
        // 再入時は action.remaining が残り個数。初回は count から始める
        const left = action.remaining ?? count
        if (left <= 0) return

        // 取り先の候補を作る。装甲・効果耐性で取れない個体は候補から外す（共通ヘルパー）
        const sources = coreSourcesOf(state, opp, owner, srcColors, srcType)
        if (sources.length === 0) {
            log(state, `${sourceName}：${player.name}に取り除けるコアがなかった。`)
            return
        }

        // 選択の応答が来ていれば1個取り、残りがあれば再入して次を聞く
        if (chosenOption !== undefined) {
            const picked = sources.find((c) => c.label === chosenOption)
            if (!picked) {
                log(state, `${sourceName}：選ばれた取り先が見つからなかった。`)
                return
            }
            takeOneCoreToVoid(state, opp, picked, owner)
            const rest = left - 1
            if (rest > 0) ctx.resolve({ ...action, remaining: rest })
            return
        }

        requestChoice(
            state,
            owner,
            `${sourceName}：ボイドに置くコアの取り先を選んでください（残り${left}個）`,
            [],
            false,
            { ...action, remaining: left },
            self,
            "option",
            sources.map((c) => c.label),
            opp, // 選ぶのはコアを失う側
        )
        return
    }

    const { fromReserve, fromTrash, fromField, remaining } = autoTakeCoresToVoid(
        state,
        opp,
        count,
        owner,
        srcColors,
        srcType,
        sourceName,
    )
    log(
        state,
        `${sourceName}：${player.name}のコア合計${total}個につき${count - remaining}個をボイドに置いた。（リザーブ${fromReserve}／トラッシュ${fromTrash}／フィールド${fromField}。取り除く順は簡略化）`,
    )
}

// クロノ・ボロス：対象の「フィールド＋リザーブ＋トラッシュに残るコア」を limit 個以下になるまでボイドへ。
// sides の順に1陣営ずつ処理する（「相手は〜。その後、自分は〜」）。取り先の選択・自動順は
// opponentCoresToVoidByTotal と共通のヘルパーを使う
const coresDownToLimitHandler: ActionHandler<"coresDownToLimit"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, chosenOption } = ctx
    const idx = action.sideIndex ?? 0
    const side = action.sides[idx]
    if (side === undefined) return
    const pid = side === "opponent" ? opp : owner
    const player = state.players[pid]
    // 次の陣営へ。無ければ終わり
    const next = (): void => {
        if (idx + 1 < action.sides.length) ctx.resolve({ ...action, sideIndex: idx + 1 })
    }
    const excess = totalCoresOf(state, pid) - action.limit
    if (excess <= 0) {
        log(state, `${sourceName}：${player.name}のコアは合計${totalCoresOf(state, pid)}個で、ボイドに置く必要がなかった。`)
        next()
        return
    }

    // 実対戦：効果文の主語はそれぞれの持ち主なので、取り先は1個ずつ**コアを失う側**が選ぶ
    if (state.interactiveTargets) {
        const sources = coreSourcesOf(state, pid, owner, srcColors, srcType)
        if (sources.length === 0) {
            log(state, `${sourceName}：${player.name}に取り除けるコアがなかった。`)
            next()
            return
        }
        if (chosenOption !== undefined) {
            const picked = sources.find((c) => c.label === chosenOption)
            if (!picked) {
                log(state, `${sourceName}：選ばれた取り先が見つからなかった。`)
                next()
                return
            }
            takeOneCoreToVoid(state, pid, picked, owner)
            // 残りは**毎回数え直す**（維持コア割れで消滅したスピリットのコアはリザーブへ戻るので、引き算では合わない）
            if (totalCoresOf(state, pid) > action.limit) ctx.resolve({ ...action, sideIndex: idx })
            else next()
            return
        }
        requestChoice(
            state,
            owner,
            `${sourceName}：${player.name}はボイドに置くコアの取り先を選んでください（合計${action.limit}個以下になるまで。残り${excess}個）`,
            [],
            false,
            { ...action, sideIndex: idx },
            self,
            "option",
            sources.map((c) => c.label),
            pid, // 選ぶのはコアを失う側
        )
        return
    }

    // 非対話（テスト・AI）：消滅したスピリットのコアがリザーブへ戻る分があるので、上限を切るまで繰り返す
    let guard = 0
    while (totalCoresOf(state, pid) > action.limit && guard++ < 50) {
        const taken = autoTakeCoresToVoid(
            state,
            pid,
            totalCoresOf(state, pid) - action.limit,
            owner,
            srcColors,
            srcType,
            sourceName,
        )
        if (taken.fromReserve + taken.fromTrash + taken.fromField === 0) break // これ以上取れない（装甲・耐性）
    }
    log(state, `${sourceName}：${player.name}のコアを合計${totalCoresOf(state, pid)}個にした。（取り除く順は簡略化）`)
    next()
}

// チェンジングコア：対象スピリットのコアを1個だけ残し、残りを同じフィールドの別のスピリットへ移す。
// 「別のスピリット」の指定はフィールドの先頭側（対象自身を除く）に固定した決定的簡略化
const moveCoresLeavingOneHandler: ActionHandler<"moveCoresLeavingOne"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    // selfTarget：対象を発生源自身に固定する（『このスピリット上のコアを』。BS01要塞龍ギガLv2）
    const found = action.selfTarget
        ? self
            ? { pid: owner, inst: self }
            : null
        : targetInstanceId
        ? findSpiritAny(state, targetInstanceId)
        : action.anySide
          ? pickAnySideByBp(state, owner, Infinity, () => true, srcColors, srcType)
          : (() => {
                const t = pickEnemyByBp(state, opp, Infinity, undefined, srcColors, srcType)
                return t ? { pid: opp, inst: t } : null
            })()
    if (!found) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    const { pid, inst } = found
    if (inst.cores <= 1) {
        log(state, `${sourceName}：${getCard(inst.cardId).name}のコアは1個以下で移せなかった。`)
        return
    }
    // 移し先は同じフィールドの別のスピリット（先頭側）。allowNexusDest 指定時は、
    // スピリットがいなければ自分のネクサス（先頭側）にも置ける（要塞龍ギガ＝「他のスピリットかネクサスに」）
    const dest =
        state.players[pid].field.spirits.find((s) => s.instanceId !== inst.instanceId) ??
        (action.allowNexusDest ? state.players[pid].field.nexuses[0] : undefined)
    if (!dest) {
        log(state, `${sourceName}：同じフィールドに移し先がいなかった。`)
        return
    }
    // コア下限（BS08聖なる柱状彫刻）は移動にも効くので、残す数は「1個」と下限の大きい方
    const keep = Math.max(1, coreFloorFor(state, inst, pid))
    const moved = inst.cores - keep
    if (moved <= 0) {
        log(state, `${sourceName}：${getCard(inst.cardId).name}のコアは下限より少なくできない。`)
        return
    }
    inst.cores = keep
    dest.cores += moved
    log(
        state,
        `${sourceName}：${getCard(inst.cardId).name}のコア${moved}個を${getCard(dest.cardId).name}へ移した。（移し先は簡略化）`,
    )
}

// 天使スローン：相手のスピリット2体（実効BP上位2体＝プレイヤー指定の決定的簡略化）の上のコアをすべて入れ替える。
// 入れ替えで維持コア（Lv1）を下回った側は消滅する（コアが0個だった個体と入れ替えたとき）
const swapOpponentCoresHandler: ActionHandler<"swapOpponentCores"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    // 装甲・マジック効果耐性で効果を受けない個体は対象から外す（他のコア操作アクションと同じ扱い）
    const candidates = state.players[opp].field.spirits.filter(
        (s) =>
            !isResisted(state, opp, s, attemptOf(ctx, "coreRemove", "area")),
    )
    if (candidates.length < 2) {
        log(state, `${sourceName}：相手のスピリットが2体未満で入れ替えられなかった。`)
        return
    }
    const swap = (a: CardInstance, b: CardInstance): void => {
        const beforeA = a.cores
        const beforeB = b.cores
        if (beforeA === beforeB) {
            log(state, `${sourceName}：${getCard(a.cardId).name}と${getCard(b.cardId).name}のコアは同数だった。`)
            return
        }
        // コア下限（BS08聖なる柱状彫刻）は入れ替えにも効く。入れ替えは同時に起きる1つの動きなので、
        // どちらかが下限を割るなら**入れ替え自体を行わない**（片側だけ動かすとコアが増減してしまう）
        if (beforeB < coreFloorFor(state, a, opp) || beforeA < coreFloorFor(state, b, opp)) {
            log(state, `${sourceName}：コアの下限を下回るため入れ替えられなかった。`)
            return
        }
        a.cores = beforeB
        b.cores = beforeA
        log(
            state,
            `${sourceName}：${getCard(a.cardId).name}（${beforeA}個→${beforeB}個）と${getCard(b.cardId).name}（${beforeB}個→${beforeA}個）のコアを入れ替えた。`,
        )
        // コアが減った側は「効果でコアを取り除かれた」扱いの誘発と、維持コア割れの消滅を処理する
        for (const [inst, before] of [
            [a, beforeA],
            [b, beforeB],
        ] as const) {
            if (inst.cores >= before) continue
            checkExhaustOnCoreChange(state, opp, inst, { viaEffect: true, isRemoval: true })
            if (inst.cores < instMinLevelCores(inst)) {
                destroySpirit(state, opp, inst.instanceId, "deplete")
            }
            notifySpiritCoresRemovedByOpponent(state, opp, 1)
        }
    }
    // 効果文は「相手のスピリット2体を**指定する**」なので、2体とも持ち主が選ぶ（2026-08-24）。
    // choosing が付いているときだけ targetInstanceId を選択結果として読む
    // （素の targetInstanceId は誘発が渡すイベント対象。part230 の refreshOne で踏んだのと同じ罠）
    if (action.choosing && targetInstanceId !== undefined) {
        const picked = candidates.find((s) => s.instanceId === targetInstanceId)
        if (!picked) {
            log(state, `${sourceName}：指定されたスピリットがいなかった。`)
            return
        }
        if (action.firstChosen === undefined) {
            // 1体目が決まった。残りから2体目を選ばせる
            const rest = candidates.filter((s) => s.instanceId !== picked.instanceId)
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}：コアを入れ替える2体目を選んでください`,
                    rest,
                    { ...action, firstChosen: picked.instanceId },
                    null,
                )
            ) {
                return
            }
            // 残りが1体だけなら聞かずに確定する
            const only = rest[0]
            if (only) swap(picked, only)
            return
        }
        const first = candidates.find((s) => s.instanceId === action.firstChosen)
        if (!first) {
            log(state, `${sourceName}：指定されたスピリットがいなかった。`)
            return
        }
        swap(first, picked)
        return
    }
    if (
        tryInteractiveTargetChoice(
            state,
            owner,
            self,
            `${sourceName}：コアを入れ替える1体目を選んでください`,
            candidates,
            { ...action, choosing: true },
            null,
        )
    ) {
        return
    }
    // 非対話（テスト・自動解決）は従来どおり実効BP上位2体
    const sorted = [...candidates].sort((x, y) => effectiveBp(state, opp, y) - effectiveBp(state, opp, x))
    const a = sorted[0]
    const b = sorted[1]
    if (!a || !b) return
    swap(a, b)
}

const handlers = {
    opponentCoresToVoidByTotal: opponentCoresToVoidByTotalHandler,
    coresDownToLimit: coresDownToLimitHandler,
    coreToVoidEqualizeByTotal: coreToVoidEqualizeByTotalHandler,
    moveCoresLeavingOne: moveCoresLeavingOneHandler,
    swapOpponentCores: swapOpponentCoresHandler,
    coreRemove: coreRemoveHandler,
    coreRemoveByPayingSelfCores: coreRemoveByPayingSelfCoresHandler,
    voidCoresFromField: voidCoresFromFieldHandler,
    coreDrainToLowerLevel: coreDrainToLowerLevelHandler,
    coreRemoveMulti: coreRemoveMultiHandler,
    protectBlockerCoresThisBattle: protectBlockerCoresThisBattleHandler,
    coreRemoveSelf: coreRemoveSelfHandler,
    coreToTrashSelf: coreToTrashSelfHandler,
    capOpponentTrashCoreReturnNextRefresh: capOpponentTrashCoreReturnNextRefreshHandler,
    coreSqueezeAll: coreSqueezeAllHandler,
    coreSqueezeOne: coreSqueezeOneHandler,
    coreToVoidOwn: coreToVoidOwnHandler,
    bothSidesCoreToTrash: bothSidesCoreToTrashHandler,
    coreDrainAllOthers: coreDrainAllOthersHandler,
    coreRemoveDistributed: coreRemoveDistributedHandler,
    coreToOpponentTrashChoice: coreToOpponentTrashChoiceHandler,
    linkNexusCoresChoice: linkNexusCoresChoiceHandler,
    coreTradeToOpponentTrash: coreTradeToOpponentTrashHandler,
    coreToTrashAllByCost: coreToTrashAllByCostHandler,
    coreRemoveAllOpponent: coreRemoveAllOpponentHandler,
    coreRemovePerHandDiscard: coreRemovePerHandDiscardHandler,
    opponentCoresToTrash: opponentCoresToTrashHandler,
    destroyerCoresToTrash: destroyerCoresToTrashHandler,
    voidCoresAndMillByCost: voidCoresAndMillByCostHandler,
    opponentNexusOrReserveCoreToTrash: opponentNexusOrReserveCoreToTrashHandler,
    bothSidesCoreToVoid: bothSidesCoreToVoidHandler,
} satisfies Partial<ActionRegistry>

export default handlers
