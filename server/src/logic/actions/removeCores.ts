// コアを「取り除く」器（R5。旧 coreRemove 系28種の統合先。旧ハンドラは data 移行が済むまで cores.ts に残す）。
// スキーマは docs/design/CORE_UNIFY_REMOVE.md §3。
import type { ActionHandler, ActionRegistry } from "./types"
import type { ActionCtx } from "./types"
import type { CardInstance, CardType, Color, EffectAction, GameState, PlayerId, ResolvedTargetFilter } from "../../type"
import { coresForLevel, getCard, log, opponentOf, pushResumeFrames } from "../GameState"
import {
    askPayToNegateIfNeeded,
    bothSidesPids,
    canTakeCoresFrom,
    findSpiritAny,
    lifeCostBlockedByFloor,
    removeCores,
    removeCoresToTrash,
    removeCoresToVoid,
    requestChoice,
    resistanceAgainst,
} from "../EffectModules"
import { coreFloorFor, isBattlingCoreProtected } from "../removal"
import { coreZoneChoiceId, currentLevel, effectiveBp, matchesTarget } from "../../../../shared/rules"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"
import { countedAmount } from "../counted"

type RemoveCoresAction = Extract<EffectAction, { type: "removeCores" }>
type Zone = "spirit" | "nexus" | "reserve" | "trash" | "life"
type Dest = "reserve" | "trash" | "void"
type CountSpec = number | "all" | "toLowerLevel"

// countCounter を解決した後の count（typeof action.count === "number" のときだけ EffectCounter を適用）
function resolvedCount(ctx: ActionCtx, action: RemoveCoresAction): CountSpec {
    if (typeof action.count !== "number") return action.count
    if (action.countCounter === undefined) return action.count
    return countedAmount(ctx.state, ctx.owner, ctx.self, action.count, action.countCounter, ctx.srcType)
}

// 個体（スピリット／ネクサス）1体から取れる量。leaveAtLeast は個体上限、toLowerLevel は1つ下のLvのコア数まで
function amountFor(inst: CardInstance, count: CountSpec, leaveAtLeast: number | undefined): number {
    if (count === "all") return leaveAtLeast !== undefined ? Math.max(0, inst.cores - leaveAtLeast) : inst.cores
    if (count === "toLowerLevel") {
        const level = currentLevel(inst).level
        if (level <= 1) return 0
        const lowerCores = coresForLevel(getCard(inst.cardId), level - 1)
        if (lowerCores === null || inst.cores <= lowerCores) return 0
        return inst.cores - lowerCores
    }
    return leaveAtLeast !== undefined ? Math.min(count, Math.max(0, inst.cores - leaveAtLeast)) : count
}

// 行き先へ加算する（スピリット以外＝ネクサス／リザーブ／トラッシュ由来の1個分。スピリットは removeCores* が自前でログを出す）
function depositTo(state: GameState, pid: PlayerId, to: Dest, amount: number, label: string): void {
    if (amount <= 0) return
    const player = state.players[pid]
    if (to === "void") {
        log(state, `${player.name}の${label}のコア${amount}個をボイドに置いた。`)
        return
    }
    if (to === "trash") {
        player.trashCores += amount
        log(state, `${player.name}の${label}のコア${amount}個をトラッシュに置いた。`)
        return
    }
    player.reserve += amount
    log(state, `${player.name}の${label}のコア${amount}個をリザーブに置いた。`)
}

// スピリット／ネクサス1体から amount 個取る（スピリットは保護・下限・維持コア割れを見る removeCores* を通す。
// ネクサスは装甲・維持コアの概念が無いので直接動かす＝bothSidesCoreToVoid等と同じ扱い）
function applyToIndividual(ctx: ActionCtx, pid: PlayerId, inst: CardInstance, amount: number, to: Dest): void {
    const { state, owner, srcType } = ctx
    if (state.players[pid].field.spirits.includes(inst)) {
        if (to === "void") removeCoresToVoid(state, pid, inst, amount, owner)
        else if (to === "trash") removeCoresToTrash(state, pid, inst, amount, owner)
        else removeCores(state, pid, inst, amount, owner, srcType)
        return
    }
    const taken = Math.min(amount, inst.cores)
    inst.cores -= taken
    depositTo(state, pid, to, taken, `${getCard(inst.cardId).name}（ネクサス）`)
}

// side:"both" は removeCoresHandler が dispatchByTarget へ渡す前に own/opponent へ分解済みなので、
// ここに来ることはない（型上だけ受け取れるようにしてある）
function pidsFor(side: RemoveCoresAction["side"], owner: PlayerId, opp: PlayerId): PlayerId[] {
    if (side === "own") return [owner]
    if (side === "any") return [owner, opp]
    return [opp]
}

// 取り先がリザーブ・トラッシュだけなら「1体から」は意味が無いので、既定は複数から合計
function defaultTarget(action: RemoveCoresAction): NonNullable<RemoveCoresAction["target"]> {
    if (action.target !== undefined) return action.target
    const from = action.from ?? ["spirit"]
    return from.includes("spirit") || from.includes("nexus") ? "one" : "spread"
}

// pay の判定表（removeCores）が使う、取れる最大数。filter は self相対軸を解決せずに比べる
// （destroyCandidateCountForPay と同じ簡略化）。止める判定（保護・下限・耐性）は実際に取る処理と揃える
export function removeCoresAchievableCountForPay(
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    action: RemoveCoresAction,
    srcColors: Color[] | undefined,
    srcType: CardType | undefined,
): number {
    const opp = opponentOf(owner)
    const countSpec: CountSpec =
        typeof action.count === "number" && action.countCounter !== undefined
            ? countedAmount(state, owner, self, action.count, action.countCounter, srcType)
            : action.count

    if (action.from?.includes("life")) {
        if (action.side !== "own" || typeof countSpec !== "number") return 0
        return lifeCostBlockedByFloor(state, owner, countSpec) ? 0 : state.players[owner].life
    }

    if (defaultTarget(action) === "self") {
        if (!self) return 0
        const own = state.players[owner]
        if (!own.field.spirits.includes(self) && !own.field.nexuses.includes(self)) return 0
        return amountFor(self, countSpec, action.leaveAtLeast)
    }

    const from = action.from ?? ["spirit"]
    const filter = (action.filter ?? {}) as unknown as ResolvedTargetFilter
    const pids = pidsFor(action.side ?? "opponent", owner, opp)
    // 実際に取る処理（removal.ts の removeCores*・takeCoresFromSpirit）と同じ止める判定で、1体ずつ取れる数を出す
    const perInst: number[] = []
    let zones = 0
    for (const pid of pids) {
        const player = state.players[pid]
        if (from.includes("reserve")) zones += player.reserve
        if (from.includes("trash")) zones += player.trashCores
        if (from.includes("spirit")) {
            for (const s of player.field.spirits) {
                if (!matchesTarget(state, pid, s, filter, self?.instanceId)) continue
                if (pid !== owner && !canTakeCoresFrom(state, pid, s, owner, srcColors, srcType)) continue
                if (isBattlingCoreProtected(state, s)) continue
                const keep = Math.max(action.leaveAtLeast ?? 0, coreFloorFor(state, s, pid))
                perInst.push(Math.max(0, s.cores - keep))
            }
        }
        if (from.includes("nexus")) {
            for (const n of player.field.nexuses) {
                if (!matchesTarget(state, pid, n, filter, self?.instanceId)) continue
                perInst.push(n.cores)
            }
        }
    }
    // 1体から取る形はその最大、それ以外（複数から合計・すべて）は合計
    if (defaultTarget(action) === "one") return perInst.length > 0 ? Math.max(...perInst) : 0
    return zones + perInst.reduce((a, b) => a + b, 0)
}

// ============ target: "self" / "event" ============

const resolveSelfTarget = (ctx: ActionCtx, action: RemoveCoresAction): void => {
    const { state, owner, self, sourceName } = ctx
    const to = action.to ?? "reserve"
    if (!self || !state.players[owner].field.spirits.includes(self) && !state.players[owner].field.nexuses.includes(self)) {
        log(state, `${sourceName}のコア除去：対象がいなかった。`)
        return
    }
    const count = resolvedCount(ctx, action)
    if (count === 0) {
        log(state, `${sourceName}のコア除去：カウントが0のため発動しなかった。`)
        return
    }
    const amount = amountFor(self, count, action.leaveAtLeast)
    if (amount <= 0) {
        log(state, `${sourceName}のコア除去：${getCard(self.cardId).name}のコアは取り除けなかった。`)
        return
    }
    applyToIndividual(ctx, owner, self, amount, to)
}

const resolveEventTarget = (ctx: ActionCtx, action: RemoveCoresAction): void => {
    const { state, sourceName, targetInstanceId } = ctx
    const to = action.to ?? "reserve"
    if (targetInstanceId === undefined) {
        log(state, `${sourceName}のコア除去：対象が見つからなかった。`)
        return
    }
    const found = findSpiritAny(state, targetInstanceId)
    if (!found || found.inst.cores === 0) {
        log(state, `${sourceName}のコア除去：対象が見つからなかった。`)
        return
    }
    const count = resolvedCount(ctx, action)
    if (count === 0) return
    const amount = amountFor(found.inst, count, action.leaveAtLeast)
    if (amount <= 0) return
    applyToIndividual(ctx, found.pid, found.inst, amount, to)
}

// ============ target: "all" ============

const resolveAllTarget = (ctx: ActionCtx, action: RemoveCoresAction): void => {
    const { state, owner, self, sourceName, srcColors, srcType } = ctx
    const to = action.to ?? "reserve"
    const from = action.from ?? ["spirit"]
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) {
        log(state, `${sourceName}のコア除去：対象がいなかった。`)
        return
    }
    const count = resolvedCount(ctx, action)
    if (count === 0) {
        log(state, `${sourceName}のコア除去：カウントが0のため発動しなかった。`)
        return
    }
    const pids = pidsFor(action.side ?? "opponent", owner, ctx.opp)
    const list: { pid: PlayerId; inst: CardInstance }[] = []
    for (const pid of pids) {
        if (from.includes("spirit")) {
            for (const s of state.players[pid].field.spirits) {
                if (s.cores <= 0) continue
                if (action.leaveAtLeast !== undefined && s.cores <= action.leaveAtLeast) continue
                if (!matchesTarget(state, pid, s, filter, self?.instanceId)) continue
                if (pid !== owner && !canTakeCoresFrom(state, pid, s, owner, srcColors, srcType)) continue
                list.push({ pid, inst: s })
            }
        }
        if (from.includes("nexus")) {
            for (const n of state.players[pid].field.nexuses) {
                if (n.cores <= 0) continue
                if (!matchesTarget(state, pid, n, filter, self?.instanceId)) continue
                list.push({ pid, inst: n })
            }
        }
    }
    if (list.length === 0) {
        log(state, `${sourceName}のコア除去：対象がいなかった。`)
        return
    }
    for (const { pid, inst } of list) {
        const amount = amountFor(inst, count, action.leaveAtLeast)
        if (amount <= 0) continue
        applyToIndividual(ctx, pid, inst, amount, to)
    }
}

// ============ target: "one" ============

const resolveOneTarget = (ctx: ActionCtx, action: RemoveCoresAction): void => {
    const { state, owner, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const to = action.to ?? "reserve"
    const from = action.from ?? ["spirit"]
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) {
        log(state, `${sourceName}のコア除去：対象がいなかった。`)
        return
    }
    const count = resolvedCount(ctx, action)
    if (count === 0) {
        log(state, `${sourceName}のコア除去：カウントが0のため発動しなかった。`)
        return
    }
    const pids = pidsFor(action.side ?? "opponent", owner, ctx.opp)
    const wantsNexus = from.includes("nexus")
    const excludeIds = action.excludeIds ?? []

    const candidatesFor = (): { pid: PlayerId; inst: CardInstance }[] => {
        const list: { pid: PlayerId; inst: CardInstance }[] = []
        for (const pid of pids) {
            for (const s of state.players[pid].field.spirits) {
                if (excludeIds.includes(s.instanceId)) continue
                if (action.leaveAtLeast !== undefined && s.cores <= action.leaveAtLeast) continue
                if (!matchesTarget(state, pid, s, filter, self?.instanceId)) continue
                if (pid !== owner && !canTakeCoresFrom(state, pid, s, owner, srcColors, srcType)) continue
                list.push({ pid, inst: s })
            }
            if (wantsNexus) {
                for (const n of state.players[pid].field.nexuses) {
                    if (excludeIds.includes(n.instanceId)) continue
                    if (!matchesTarget(state, pid, n, filter, self?.instanceId)) continue
                    list.push({ pid, inst: n })
                }
            }
        }
        return list
    }

    const applyOne = (pid: PlayerId, inst: CardInstance): void => {
        if (pid !== owner) {
            const attempt = attemptOf(ctx, "coreRemove", "targeted")
            if (askPayToNegateIfNeeded(state, pid, inst, attempt, action, self, sourceName)) return
            const resisted = resistanceAgainst(state, pid, inst, attempt)
            if (resisted) {
                log(state, `${getCard(inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                return
            }
        }
        const amount = amountFor(inst, count, action.leaveAtLeast)
        if (amount <= 0) {
            log(state, `${sourceName}のコア除去：${getCard(inst.cardId).name}のコアは取り除けなかった。`)
            return
        }
        applyToIndividual(ctx, pid, inst, amount, to)
    }

    const picks = action.targets ?? 1

    if (targetInstanceId !== undefined) {
        const found = candidatesFor().find((c) => c.inst.instanceId === targetInstanceId)
        if (!found) {
            log(state, `${sourceName}のコア除去：指定された対象は条件を満たさなかった。`)
            return
        }
        applyOne(found.pid, found.inst)
        if (picks > 1) {
            ctx.resolve({ ...action, targets: picks - 1, excludeIds: [...excludeIds, found.inst.instanceId] })
        }
        return
    }

    const open = candidatesFor()
    if (open.length === 0) {
        log(state, `${sourceName}のコア除去：対象がいなかった。`)
        return
    }
    // 「相手は」（chooser owner）はコアを失う側が選ぶ
    const chooserPid = pids.length === 1 && action.chooser === "owner" ? pids[0]! : owner
    if (state.interactiveTargets && open.length > picks) {
        requestChoice(
            state,
            owner,
            `${sourceName}のコア除去：対象を選んでください${picks > 1 ? `（あと${String(picks)}体）` : ""}`,
            open.map((c) => c.inst.instanceId),
            false,
            action,
            self,
            "target",
            undefined,
            chooserPid !== owner ? chooserPid : undefined,
        )
        return
    }
    // 自動選択：使用者が選ぶなら実効BP上位から（既存coreRemove/coreRemoveMultiと同じ）、失う側が選ぶなら損の小さいBP下位から
    const favorHigh = chooserPid === owner
    // どちらの陣営からでも選べる（side any）ときの自動選択は、使用者の得になる相手側を優先する
    const oppOnly = open.filter((c) => c.pid !== owner)
    const remainingPool = favorHigh && action.side === "any" && oppOnly.length > 0 ? oppOnly : [...open]
    const n = Math.min(picks, remainingPool.length)
    for (let i = 0; i < n; i++) {
        const best = remainingPool.reduce((b, c) => {
            const d = effectiveBp(state, c.pid, c.inst) - effectiveBp(state, b.pid, b.inst)
            return (favorHigh ? d > 0 : d < 0) ? c : b
        })
        remainingPool.splice(remainingPool.indexOf(best), 1)
        applyOne(best.pid, best.inst)
    }
}

// ============ target: "spread"（and downTo の委譲先） ============

interface RemoveSource {
    pid: PlayerId
    kind: Zone
    inst?: CardInstance
}

function sourceIdOf(s: RemoveSource): string {
    return s.inst ? s.inst.instanceId : coreZoneChoiceId(s.kind as "reserve" | "trash", s.pid)
}

function sourceCoresOf(state: GameState, s: RemoveSource): number {
    if (s.kind === "reserve") return state.players[s.pid].reserve
    if (s.kind === "trash") return state.players[s.pid].trashCores
    return s.inst!.cores
}

const ZONE_ORDER: Zone[] = ["spirit", "nexus", "reserve", "trash"]

// 非対話の自動選択：選ぶ人の得になる方（2026-09-26ユーザー確認。CORE_UNIFY_REMOVE.md §2-1/§3）。
// hurting=true は選ぶ人が相手のコアを奪う＝スピリットのコア最少優先→ネクサス→リザーブ→トラッシュ、
// false は選ぶ人が自分のコアを失う＝損の小さい逆順でスピリットはコア最多（お互いの自分の分・「相手は」）
function pickAutoSource(state: GameState, candidates: RemoveSource[], hurting: boolean): RemoveSource {
    const order = hurting ? ZONE_ORDER : [...ZONE_ORDER].reverse()
    for (const kind of order) {
        const inKind = candidates.filter((c) => c.kind === kind)
        if (inKind.length === 0) continue
        if (kind !== "spirit") return inKind[0]!
        return inKind.reduce((best, c) =>
            hurting
                ? (sourceCoresOf(state, c) < sourceCoresOf(state, best) ? c : best)
                : (sourceCoresOf(state, c) > sourceCoresOf(state, best) ? c : best),
        )
    }
    return candidates[0]!
}

function spreadCandidatesFor(
    ctx: ActionCtx,
    pids: PlayerId[],
    from: Zone[],
    filter: ResolvedTargetFilter,
    leaveAtLeast: number | undefined,
): RemoveSource[] {
    const { state, owner, self, srcColors, srcType } = ctx
    const out: RemoveSource[] = []
    for (const pid of pids) {
        const player = state.players[pid]
        if (from.includes("spirit")) {
            const floor = leaveAtLeast ?? 0
            for (const s of player.field.spirits) {
                if (s.cores <= floor) continue
                if (!matchesTarget(state, pid, s, filter, self?.instanceId)) continue
                if (pid !== owner && !canTakeCoresFrom(state, pid, s, owner, srcColors, srcType)) continue
                out.push({ pid, kind: "spirit", inst: s })
            }
        }
        if (from.includes("nexus")) {
            for (const n of player.field.nexuses) {
                if (n.cores <= 0) continue
                if (!matchesTarget(state, pid, n, filter, self?.instanceId)) continue
                out.push({ pid, kind: "nexus", inst: n })
            }
        }
        if (from.includes("reserve") && player.reserve > 0) out.push({ pid, kind: "reserve" })
        if (from.includes("trash") && player.trashCores > 0) out.push({ pid, kind: "trash" })
    }
    return out
}

// 選ばれた1つから1個だけ移す。実際に取れた数（0/1）を返す
function takeOneFromSource(ctx: ActionCtx, s: RemoveSource, to: Dest): number {
    const { state, owner, srcType } = ctx
    const player = state.players[s.pid]
    if (s.kind === "reserve") {
        if (player.reserve <= 0) return 0
        player.reserve -= 1
        depositTo(state, s.pid, to, 1, "リザーブ")
        return 1
    }
    if (s.kind === "trash") {
        if (player.trashCores <= 0) return 0
        player.trashCores -= 1
        depositTo(state, s.pid, to, 1, "トラッシュ")
        return 1
    }
    if (s.kind === "nexus") {
        const nx = player.field.nexuses.find((n) => n.instanceId === s.inst!.instanceId)
        if (!nx || nx.cores <= 0) return 0
        nx.cores -= 1
        depositTo(state, s.pid, to, 1, `${getCard(nx.cardId).name}（ネクサス）`)
        return 1
    }
    const sp = player.field.spirits.find((x) => x.instanceId === s.inst!.instanceId)
    if (!sp) return 0
    if (to === "void") return removeCoresToVoid(state, s.pid, sp, 1, owner)
    if (to === "trash") return removeCoresToTrash(state, s.pid, sp, 1, owner)
    return removeCores(state, s.pid, sp, 1, owner, srcType)
}

// target:"spread" と downTo（1個ずつ委譲された結果）の共通解決。pids/from/to/filter/leaveAtLeast/chooserは
// すべて action から都度導出するので、requestChoiceの再入（spreadRemaining/excludeIds）はaction一つで完結する。
const resolveSpread = (ctx: ActionCtx, action: RemoveCoresAction): void => {
    const { state, owner, opp, self, sourceName, targetInstanceId } = ctx
    const to = action.to ?? "reserve"
    const from = action.from ?? ["spirit"]
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) {
        log(state, `${sourceName}のコア除去：対象がいなかった。`)
        return
    }
    const pids = pidsFor(action.side ?? "opponent", owner, opp)
    const drainPid = pids.length === 1 ? pids[0]! : undefined
    const chooserPid = drainPid !== undefined && action.chooser === "owner" ? drainPid : owner
    // 自分のコアを失う側が選ぶか（損を小さく）、相手のコアを奪う側が選ぶか（痛手を大きく）
    const hurting = drainPid === undefined ? chooserPid === owner : chooserPid !== drainPid

    const count = resolvedCount(ctx, action)
    if (count === 0) {
        log(state, `${sourceName}のコア除去：カウントが0のため発動しなかった。`)
        return
    }
    const totalWanted = count === "all" ? Number.POSITIVE_INFINITY : (count as number)

    const step = (left: number, excludeIds: string[]): void => {
        if (state.winner || left <= 0) return
        const candidates = spreadCandidatesFor(ctx, pids, from, filter, action.leaveAtLeast).filter(
            (c) => !excludeIds.includes(sourceIdOf(c)),
        )
        if (candidates.length === 0) return
        // 候補が1つなら選ぶ余地が無いので聞かない（「リザーブのコアすべて」で個数ぶん確認が出ないように）
        if (state.interactiveTargets && candidates.length > 1) {
            requestChoice(
                state,
                owner,
                `${sourceName}のコア除去：コアを取り除く場所を選んでください${Number.isFinite(left) ? `（あと${String(left)}個）` : ""}`,
                candidates.map(sourceIdOf),
                false,
                { ...action, spreadRemaining: left, excludeIds },
                self,
                "target",
                undefined,
                chooserPid !== owner ? chooserPid : undefined,
            )
            return
        }
        // どちらの陣営からでも選べるときは、奪う側の得になる相手側を優先する
        const oppSide = candidates.filter((c) => c.pid !== chooserPid)
        const picked = pickAutoSource(state, drainPid === undefined && oppSide.length > 0 ? oppSide : candidates, hurting)
        const taken = takeOneFromSource(ctx, picked, to)
        step(left - (taken > 0 ? 1 : 0), taken > 0 ? excludeIds : [...excludeIds, sourceIdOf(picked)])
    }

    // 対話の再入：選ばれた1つから1個取り、続きを解決する
    if (action.spreadRemaining !== undefined && targetInstanceId !== undefined) {
        const candidates = spreadCandidatesFor(ctx, pids, from, filter, action.leaveAtLeast)
        const chosen = candidates.find((c) => sourceIdOf(c) === targetInstanceId)
        if (chosen) takeOneFromSource(ctx, chosen, to)
        step(action.spreadRemaining - 1, action.excludeIds ?? [])
        return
    }
    step(totalWanted, action.excludeIds ?? [])
}

// ============ downTo（number／equalize） ============
// 合計（from の全ゾーン）が limit 以下になるまで、chooser owner（コアを失う側）が1個ずつ選ぶ。
// 具体的な excess 個数を求めたら target:"spread" の一発呼び出しに委譲する（対話の再入はそちら任せ）

function totalCoresAcross(state: GameState, pid: PlayerId, from: Zone[]): number {
    const player = state.players[pid]
    let total = 0
    if (from.includes("spirit")) total += player.field.spirits.reduce((sum, s) => sum + s.cores, 0)
    if (from.includes("nexus")) total += player.field.nexuses.reduce((sum, n) => sum + n.cores, 0)
    if (from.includes("reserve")) total += player.reserve
    if (from.includes("trash")) total += player.trashCores
    return total
}

const resolveDownTo = (ctx: ActionCtx, action: RemoveCoresAction): void => {
    const { state, owner, opp, sourceName } = ctx
    const from = action.from ?? ["spirit", "nexus", "reserve", "trash"]
    let pid: PlayerId
    let limit: number
    if (action.downTo === "equalize") {
        const totalOwner = totalCoresAcross(state, owner, from)
        const totalOpp = totalCoresAcross(state, opp, from)
        if (totalOwner === totalOpp) {
            log(state, `${sourceName}：お互いのコア合計は同数だった。`)
            return
        }
        pid = totalOwner > totalOpp ? owner : opp
        limit = Math.min(totalOwner, totalOpp)
    } else {
        pid = (action.side ?? "opponent") === "own" ? owner : opp
        limit = action.downTo as number
    }
    const excess = totalCoresAcross(state, pid, from) - limit
    if (excess <= 0) {
        log(state, `${sourceName}：${state.players[pid].name}のコアはすでに${String(limit)}個以下だった。`)
        return
    }
    const { downTo: _downTo, ...rest } = action
    const spreadAction: RemoveCoresAction = {
        ...rest,
        side: pid === owner ? "own" : "opponent",
        target: "spread",
        count: excess,
        chooser: action.chooser ?? "owner",
    }
    resolveSpread(ctx, spreadAction)
}

// ============ トップレベル ============

const removeCoresHandler: ActionHandler<"removeCores"> = (ctx, action) => {
    const { state, owner, opp, srcType } = ctx
    if (action.side === "both") {
        // 陣営ごとに順に解決する。選ぶ人はカードの chooser に従う（「お互い、それぞれの」は owner＝各持ち主。
        // 2026-09-26 ユーザー確認）。途中で選択待ちが立ったら、残りの陣営は選び終わってから解決する
        const perSide = (pid: PlayerId): RemoveCoresAction => ({ ...action, side: pid === owner ? "own" : "opponent" })
        const pids = bothSidesPids(state, srcType)
        for (let i = 0; i < pids.length; i++) {
            dispatchByTarget(ctx, perSide(pids[i]!))
            if (state.pendingChoice) {
                const rest = pids.slice(i + 1)
                if (rest.length > 0) {
                    pushResumeFrames(
                        state,
                        rest.map((p) => ({ kind: "action" as const, selfInstanceId: ctx.self ? ctx.self.instanceId : null, action: perSide(p) })),
                    )
                }
                return
            }
        }
        return
    }
    dispatchByTarget(ctx, action)
}

// 自分のライフのコアを置く（「〜することで」のコスト用。from: ["life"] は単独・side "own" だけ）。
// 「ライフは0にならない」が働いている間は払って0にできない（COST_MODEL §9。2026-09-16 ユーザー確定）
function resolveLife(ctx: ActionCtx, action: RemoveCoresAction): void {
    const { state, owner, opp, sourceName } = ctx
    const count = resolvedCount(ctx, action)
    const player = state.players[owner]
    if (action.side !== "own" || typeof count !== "number" || player.life < count || lifeCostBlockedByFloor(state, owner, count)) {
        log(state, `${sourceName}：ライフのコアを置けないため発動しなかった。`)
        state.effectFizzled = true
        return
    }
    player.life -= count
    depositTo(state, owner, action.to ?? "trash", count, "ライフ")
    if (player.life <= 0 && !state.winner) {
        state.winner = opp
        log(state, `${state.players[opp].name}の勝利！`)
    }
}

function dispatchByTarget(ctx: ActionCtx, action: RemoveCoresAction): void {
    if (action.from?.includes("life")) {
        resolveLife(ctx, action)
        return
    }
    if (action.downTo !== undefined) {
        resolveDownTo(ctx, action)
        return
    }
    switch (defaultTarget(action)) {
        case "self":
            resolveSelfTarget(ctx, action)
            return
        case "event":
            resolveEventTarget(ctx, action)
            return
        case "all":
            resolveAllTarget(ctx, action)
            return
        case "spread":
            resolveSpread(ctx, action)
            return
        default:
            resolveOneTarget(ctx, action)
            return
    }
}

const handlers = { removeCores: removeCoresHandler } satisfies Partial<ActionRegistry>
export default handlers
