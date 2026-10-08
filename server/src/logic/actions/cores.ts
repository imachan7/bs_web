// コア操作系のアクションハンドラ（相手のコアを取り除く・自分のコアを払う／動かす）。コアを置く系は coreGain.ts、ライフは life.ts、【転召】は tensho.ts
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardType, CardInstance, Color, EffectAction, GameState, PlayerId, ResolvedTargetFilter } from "../../type"
import { draw, getCard, instMinLevelCores, log, opponentOf } from "../GameState"
import {
    isResisted,
    askPayToNegateIfNeeded,
    gateTargetedApply,
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
import { canDiscardHand, effectiveBp, matchesFamilyFilter, matchesTarget } from "../../../../shared/rules"
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
            // 相手側の対象には適用の直前に耐性（手札を破棄して受けない、を含む）を通す。
            // 1個ごとに「対象になる」ので、同じスピリットを選び直せば改めて聞く。"asked" は聞いて中断した印
            const removeOne = (pid: PlayerId, inst: CardInstance): number | "asked" => {
                if (pid !== owner) {
                    const resisted = gateTargetedApply(state, pid, inst, attemptOf(ctx, "coreRemove", "targeted"), action, self, sourceName)
                    if (resisted === "asked") return "asked"
                    if (resisted) {
                        log(state, `${getCard(inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                        return 0
                    }
                }
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
                if (chosen && removeOne(chosen.pid, chosen.inst) === "asked") return
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

const protectBlockerCoresThisBattleHandler: ActionHandler<"protectBlockerCoresThisBattle"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    if (!state.battle) {
        log(state, `${sourceName}：バトル中ではないため何も起きなかった。`)
        return
    }
    recordTimed(state, { content: [{ type: "blockerCoresProtected" }], target: { kind: "battle" }, until: "battle", ownerPid: owner })
    log(state, `${sourceName}：このバトルの間、ブロックしたスピリット上のコアは取り除けない。`)
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

const linkNexusCoresChoiceHandler: ActionHandler<"linkNexusCoresChoice"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // クロスシザース：自分のネクサス1つを指定し、コア数をこのスピリットのコア数と同じものとして扱う
        // （selfがnullなら不発。requestChoiceが候補0件/1件/複数件を判定する）
        if (!self) return
        if (targetInstanceId === undefined) {
            const candidates = state.players[owner].field.nexuses.map((n) => n.instanceId)
            // 指定は必須（2026-10-08 ユーザー確認）
            requestChoice(state, owner, "コア数をリンクするネクサスを選んでください", candidates, false, action, self)
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
    if (pid !== owner) {
        const resisted = gateTargetedApply(state, pid, inst, attemptOf(ctx, "coreRemove", "targeted"), action, self, sourceName)
        if (resisted === "asked") return
        if (resisted) {
            log(state, `${getCard(inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
            return
        }
    }
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
    const keep = Math.max(1, coreFloorFor(state, inst, pid, owner))
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
        if (beforeB < coreFloorFor(state, a, opp, owner) || beforeA < coreFloorFor(state, b, opp, owner)) {
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
    moveCoresLeavingOne: moveCoresLeavingOneHandler,
    swapOpponentCores: swapOpponentCoresHandler,
    coreRemove: coreRemoveHandler,
    protectBlockerCoresThisBattle: protectBlockerCoresThisBattleHandler,
    coreDrainAllOthers: coreDrainAllOthersHandler,
    linkNexusCoresChoice: linkNexusCoresChoiceHandler,
} satisfies Partial<ActionRegistry>

export default handlers
