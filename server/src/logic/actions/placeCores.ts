// コアを「置く」器（R5。旧 coreGain/voidCoreToSelf/voidCoreToOther/voidCoreToOwnNexuses/
// voidCoresToNexusLevel/trashCoresToSpirit/trashCoresToReserve/selfCoreToOwnLife/fieldCoreToLife/
// 旧 lifeCharge 等の統合先）。旧ハンドラは data 移行が済むまで残す（cores.ts）。
import { noteKeyword } from "../../../../shared/coverage"
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import { normalCoresOn, normalReserveOf, normalTrashOf } from "../soulCore"
import type { CardInstance, EffectAction, GameState, PlayerId, ResolvedTargetFilter } from "../../type"
import { coresForLevel, getCard, log, opponentOf } from "../GameState"
import {
    countEffectCounter,
    fireFieldEventTriggers,
    placeCoresOnSpirit,
    requestChoice,
    voidCoreToOwnTrash,
    voidCorePlacementBlocked,
} from "../EffectModules"
import { effectiveBp, hasGlobalConstraint, isEndStepLocked, spiritHasKeyword } from "../../../../shared/rules"
import { takeCoresFromSpirit } from "../removal"
import { matchesTarget } from "../../../../shared/rules"
import { normalizeFilter, SELF_REQUIRED } from "./filter"
import { countedAmount } from "../counted"
import { recordTargets } from "../record"

type PlaceCoresAction = Extract<EffectAction, { type: "placeCores" }>

// from の残量（count:"all" の解決に使う。void は上限なしなので呼び出し側で扱う）。
// pay の checker（pay.ts）とこのファイルのハンドラで共有する
export function availableFromSource(state: GameState, owner: PlayerId, from: PlaceCoresAction["from"], self: CardInstance | null): number {
    const player = state.players[owner]
    switch (from) {
        case "void":
            return Number.POSITIVE_INFINITY
        case "reserve":
            return player.reserve
        case "trash":
            return player.trashCores
        case "self":
            return self ? self.cores : 0
        case "field":
            return (
                player.field.nexuses.reduce((sum, n) => sum + n.cores, 0) +
                player.field.spirits.reduce((sum, s) => sum + s.cores, 0)
            )
    }
}

// 取り元から amount 個取り除き、実際に取れた個数を返す（不足時はあるだけ）。
// field はネクサス（コア最多）→スピリット（実効BP最小）の順（fieldCoreToLifeと同じ優先順）。
// self・field でスピリットから取るときは takeCoresFromSpirit（保護・下限・消滅）を通す
function takeFromSource(
    state: GameState,
    owner: PlayerId,
    from: PlaceCoresAction["from"],
    self: CardInstance | null,
    amount: number,
): number {
    if (amount <= 0) return 0
    const player = state.players[owner]
    switch (from) {
        case "void":
            return amount
        // 案B-inside: [ソウルコア]は明示的な指定でだけ動く。取り出し上限は通常コア数
        case "reserve": {
            const taken = Math.min(amount, normalReserveOf(player))
            player.reserve -= taken
            return taken
        }
        case "trash": {
            const taken = Math.min(amount, normalTrashOf(player))
            player.trashCores -= taken
            return taken
        }
        case "self": {
            if (!self) return 0
            if (player.field.spirits.includes(self)) return takeCoresFromSpirit(state, owner, self, amount)
            const taken = Math.min(amount, normalCoresOn(player, self))
            self.cores -= taken
            return taken
        }
        case "field": {
            let remaining = amount
            let taken = 0
            // 保護・下限で1個も取れなかったスピリットは候補から外す（外さないと同じ個体を選び続ける）
            const exhausted = new Set<string>()
            while (remaining > 0) {
                const nexusCandidates = player.field.nexuses.filter((n) => n.cores > 0)
                if (nexusCandidates.length > 0) {
                    const t = nexusCandidates.reduce((most, n) => (n.cores > most.cores ? n : most))
                    const got = Math.min(remaining, t.cores)
                    t.cores -= got
                    remaining -= got
                    taken += got
                    continue
                }
                const spirits = player.field.spirits.filter((s) => s.cores > 0 && !exhausted.has(s.instanceId))
                if (spirits.length === 0) break
                const t = spirits.reduce((worst, s) => (effectiveBp(state, owner, s) < effectiveBp(state, owner, worst) ? s : worst))
                const got = takeCoresFromSpirit(state, owner, t, remaining)
                if (got === 0) exhausted.add(t.instanceId)
                remaining -= got
                taken += got
            }
            return taken
        }
    }
}

// to:"spirit"/"nexus" の置き先候補（filter一致分のみ。target:"self"/"all"/"one" の絞り込みは
// 呼び出し側が行う）。pay の checker（pay.ts）とこのファイルのハンドラで共有する
export function placeCoresPoolCandidates(
    ctx: ActionCtx,
    action: PlaceCoresAction,
): CardInstance[] | typeof SELF_REQUIRED {
    const { state, owner, self } = ctx
    const player = state.players[owner]
    const pool = action.anyField ? [...player.field.spirits, ...player.field.nexuses] : action.to === "spirit" ? player.field.spirits : player.field.nexuses
    const resolvedFilter = normalizeFilter(ctx, action)
    if (resolvedFilter === SELF_REQUIRED) return SELF_REQUIRED
    return pool.filter((inst) => matchesTarget(state, owner, inst, resolvedFilter, self?.instanceId))
}

// spread：トラッシュなどから count 個まで（取り元にあるだけ）を、targets 体までの別々の置き先へ1個ずつ振り分ける。
// 「N体までを指定する。コア合計N個までをそれらに置く」は指定を先に取らず、1個ずつ置き先を選ぶ形に畳む
// （選んだ体数が targets を超えない範囲なら、先に指定した場合と同じ結果）。非対話は先に選んだ個体から順
function placeCoresSpread(ctx: ActionCtx, action: PlaceCoresAction): void {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    if (typeof action.count !== "number") return
    let left = action.spreadRemaining ?? Math.min(action.count, availableFromSource(state, owner, action.from, self))
    let chosen = action.spreadChosen ?? []
    let pick = targetInstanceId
    while (left > 0 && availableFromSource(state, owner, action.from, self) > 0) {
        const pool = placeCoresPoolCandidates(ctx, action)
        if (pool === SELF_REQUIRED) break
        const full = action.targets !== undefined && chosen.length >= action.targets
        const candidates = full ? pool.filter((c) => chosen.includes(c.instanceId)) : pool
        if (candidates.length === 0) break
        let t: CardInstance | undefined
        if (pick !== undefined) {
            t = candidates.find((c) => c.instanceId === pick)
            pick = undefined
            if (!t) return
        } else if (state.interactiveTargets && candidates.length > 1) {
            requestChoice(
                state,
                owner,
                `${sourceName}：コアを置くスピリットを選んでください（あと${left}個まで）`,
                candidates.map((c) => c.instanceId),
                true,
                { ...action, spreadRemaining: left, spreadChosen: chosen },
                self,
            )
            return
        } else {
            t = candidates.find((c) => chosen.includes(c.instanceId)) ?? candidates[0]!
        }
        const taken = takeFromSource(state, owner, action.from, self, 1)
        if (taken <= 0) break
        placeCoresOnSpirit(state, t, taken, owner)
        recordTargets(state, [t.instanceId])
        log(state, `${sourceName}：${action.from === "trash" ? "トラッシュから" : ""}コア${taken}個を${getCard(t.cardId).name}に置いた。`)
        if (!chosen.includes(t.instanceId)) chosen = [...chosen, t.instanceId]
        left--
    }
}

const placeCoresHandler: ActionHandler<"placeCores"> = (ctx, inAction) => {
    // targetsCounter：置き先の数を効果の解決時に数える（0なら何もしない）。以降は targets と同じ
    let action = inAction
    if (action.targetsCounter !== undefined) {
        const n = countEffectCounter(ctx.state, ctx.owner, ctx.self, action.targetsCounter, ctx.srcType)
        if (n <= 0) {
            log(ctx.state, `${ctx.sourceName}：対象がいなかった。`)
            return
        }
        const { targetsCounter: _t, ...rest } = action
        action = { ...rest, targets: n }
    }
    if (action.spread) return placeCoresSpread(ctx, action)
    const { state, owner, self, sourceName, srcType, targetInstanceId, chosenOption } = ctx
    const player = state.players[owner]

    // from:void で to が field/リザーブのときだけ、コアステップ限定ガードを通す（BS10-056）
    const guardedTo = action.to === "spirit" || action.to === "nexus" || action.to === "reserve"
    if (action.from === "void" && guardedTo && voidCorePlacementBlocked(state)) {
        log(state, `${sourceName}：コアステップ以外はボイドからコアを置けないため発動しなかった。`)
        return
    }
    if (action.to === "life") {
        if (isEndStepLocked(state, "lifeChargeFromVoidOrReserve")) {
            log(state, `${sourceName}：効果により、ボイド/リザーブからライフにコアを置けなかった。`)
            return
        }
        if (action.from === "void" && hasGlobalConstraint(state, "noVoidToLife")) {
            log(state, `${sourceName}：効果により、ボイドからライフにコアを置けなかった。`)
            return
        }
    }

    const wantsSpiritOrNexus = action.to === "spirit" || action.to === "nexus"

    // 取り元が空でfillTo/upToLevelでもないなら、対象選択より前に打ち切る（無駄な選択を出さない）
    if (
        action.from !== "void" &&
        action.fillTo === undefined &&
        action.upToLevel === undefined &&
        availableFromSource(state, owner, action.from, self) <= 0
    ) {
        log(state, `${sourceName}：コアが無かった。`)
        return
    }

    // --- 対象の決定（spirit/nexus のときだけ） ---
    let targetInst: CardInstance | null = null
    let allTargets: CardInstance[] | null = null
    let nextPick: PlaceCoresAction | null = null

    if (wantsSpiritOrNexus && action.upToTargetId !== undefined) {
        // upTo（true）の個数選択（stepper）から戻ってきた再入：対象は既に決めてあるので選び直さない
        const pool = action.to === "spirit" ? player.field.spirits : player.field.nexuses
        const found = pool.find((c) => c.instanceId === action.upToTargetId)
        if (!found) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        targetInst = found
    } else if (wantsSpiritOrNexus) {
        const candidates = placeCoresPoolCandidates(ctx, action)
        if (candidates === SELF_REQUIRED) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }

        if (action.target === "self") {
            // 「自分自身」は発生源そのもの。ネクサスの誘発で召喚されたスピリットを指すこともあるので、to に関係なく両方から探す
            const onField = [...player.field.spirits, ...player.field.nexuses].includes(self as CardInstance)
            // candidates が SELF_REQUIRED でない時点で normalizeFilter は解決済み（同じ ctx/action への再呼び出しは同じ結果になる）
            const resolvedFilter = normalizeFilter(ctx, action) as ResolvedTargetFilter
            if (!self || !onField || !matchesTarget(state, owner, self, resolvedFilter, self.instanceId)) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            targetInst = self
        } else if (action.target === "all") {
            if (candidates.length === 0) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            allTargets = candidates
        } else {
            // "one"（既定）。targets 体は別々の個体（「白のスピリット2体に」）。対話では1体ずつ選ばせ、
            // 選んだ個体を excludeIds に積んで残りを選び直す
            const picks = action.targets ?? 1
            // 自身のコアを動かす（from:"self"）ときは、自身への移動は何も起こらないので候補から外す
            const open = candidates.filter((c) => !action.excludeIds?.includes(c.instanceId) && !(action.from === "self" && c === self))
            if (targetInstanceId) {
                const found = open.find((c) => c.instanceId === targetInstanceId)
                if (!found) {
                    log(state, `${sourceName}：指定された対象は条件を満たさなかった。`)
                    return
                }
                targetInst = found
                if (picks > 1) {
                    nextPick = { ...action, targets: picks - 1, excludeIds: [...(action.excludeIds ?? []), found.instanceId] }
                }
            } else if (open.length === 0) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            } else if (picks >= open.length) {
                if (open.length === 1) targetInst = open[0]!
                else allTargets = open
            } else if (state.interactiveTargets) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コアを置く対象を選んでください${picks > 1 ? `（あと${picks}体）` : ""}`,
                    open.map((c) => c.instanceId),
                    false,
                    action,
                    self,
                )
                return
            } else if (picks <= 1) {
                targetInst =
                    action.to === "spirit"
                        ? open.reduce((best, c) => (effectiveBp(state, owner, c) > effectiveBp(state, owner, best) ? c : best))
                        : open.reduce((best, c) => (c.cores < best.cores ? c : best))
            } else {
                const ordered =
                    action.to === "spirit"
                        ? [...open].sort((a, b) => effectiveBp(state, owner, b) - effectiveBp(state, owner, a))
                        : [...open].sort((a, b) => a.cores - b.cores)
                allTargets = ordered.slice(0, picks)
            }
        }
    }

    // --- 個数の決定 ---
    let perTarget: number
    if (action.upToLevel !== undefined) {
        if (action.to !== "nexus" || !targetInst) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        const required = coresForLevel(getCard(targetInst.cardId), action.upToLevel)
        if (required === null || targetInst.cores >= required) {
            log(state, `${sourceName}：${getCard(targetInst.cardId).name}は対象条件を満たさなかった。`)
            return
        }
        perTarget = required - targetInst.cores
    } else if (action.fillTo !== undefined) {
        const current =
            action.to === "life"
                ? player.life
                : action.to === "reserve"
                  ? player.reserve
                  : action.to === "trash"
                    ? player.trashCores
                    : action.to === "deckSide"
                      ? player.deckSideCores
                      : (targetInst?.cores ?? 0)
        const need = action.fillTo - current
        if (need <= 0) {
            log(state, `${sourceName}：すでに${String(action.fillTo)}以上のため、コアは置かれなかった。`)
            return
        }
        perTarget = need
    } else if (action.upTo === true) {
        // 「count個まで」＝0〜count個の好きな数（2026-09-28ユーザー決定）。対象は上の「対象の決定」で確定済み
        // （複数対象・all指定は今回の対象カードには無いため未対応。来たら相談する）
        // count:"all"＋upTo＝「好きなだけ」（取り元にあるだけが上限）
        if (typeof action.count !== "number" && action.count !== "all") {
            log(state, `${sourceName}：置ける個数を決められなかった。`)
            return
        }
        const capacity = availableFromSource(state, owner, action.from, self)
        const n = action.count === "all" ? capacity : Math.min(action.count, capacity)
        if (n <= 0) {
            log(state, `${sourceName}：置けるコアがなかった。`)
            return
        }
        if (chosenOption !== undefined) {
            const chosenN = Math.max(0, Math.min(n, Number(chosenOption) || 0))
            if (chosenN <= 0) {
                log(state, `${sourceName}：コアを置かなかった。`)
                return
            }
            perTarget = chosenN
        } else if (state.interactiveTargets) {
            if (!targetInst) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            requestChoice(
                state,
                owner,
                `${sourceName}：置くコアの数を選んでください（最大${n}個）`,
                [],
                false,
                { ...action, upToTargetId: targetInst.instanceId },
                self,
                "option",
                Array.from({ length: n + 1 }, (_, i) => String(i)),
                undefined,
                true,
            )
            return
        } else {
            perTarget = n
        }
    } else if (action.count === "all") {
        perTarget = availableFromSource(state, owner, action.from, self)
    } else {
        perTarget =
            action.countCounter !== undefined
                ? countedAmount(state, owner, self, action.count, action.countCounter, srcType)
                : action.count
        if (action.countCounter !== undefined && perTarget === 0) {
            log(state, `${sourceName}：カウントが0のため発動しなかった。`)
            return
        }
    }
    if (!Number.isFinite(perTarget) || perTarget <= 0) {
        log(state, `${sourceName}：置けるコアがなかった。`)
        return
    }

    // orReserve：to以外にリザーブへ置く選択肢を、効果の使用者に毎回選ばせる（旧 voidCoreToSelf・lifeCharge の鏡）。
    // 非対話の既定は to==="life" ならライフ、それ以外はリザーブ（既存2種の非対話挙動をそのまま踏襲）
    if (action.orReserve && action.to !== "reserve") {
        const destLabel = action.to === "life" ? "自分のライフに置く" : "対象の上に置く"
        if (chosenOption === "リザーブに置く") {
            const taken = takeFromSource(state, owner, action.from, self, perTarget)
            player.reserve += taken
            log(state, `${player.name}は${sourceName}のコア${taken}個をリザーブに置いた。（リザーブ${player.reserve}）`)
            return
        }
        if (chosenOption !== destLabel) {
            if (state.interactiveTargets) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コア${String(perTarget)}個を、${destLabel === "自分のライフに置く" ? "自分のライフ" : "対象"}か自分のリザーブのどちらに置きますか？`,
                    [],
                    false,
                    action,
                    self,
                    "option",
                    [destLabel, "リザーブに置く"],
                )
                return
            }
            if (action.to !== "life") {
                const taken = takeFromSource(state, owner, action.from, self, perTarget)
                player.reserve += taken
                log(state, `${player.name}は${sourceName}のコア${taken}個をリザーブに置いた。（リザーブ${player.reserve}）`)
                return
            }
            // 非対話 + to==="life" はここを素通りして下の通常配置（ライフ）へ進む
        }
    }

    // --- 実際の移動 ---
    const targetsFinal: (CardInstance | null)[] = allTargets ?? [targetInst]
    const FROM_LABEL = { void: "ボイドから", reserve: "リザーブから", trash: "トラッシュから", self: "", field: "フィールドから" }
    const TO_LABEL = { reserve: "自分のリザーブに", trash: "自分のトラッシュに", life: "自分のライフに", deckSide: "デッキの横に", spirit: "", nexus: "" }
    let totalMoved = 0
    for (const t of targetsFinal) {
        const taken = takeFromSource(state, owner, action.from, self, perTarget)
        if (taken <= 0) continue
        totalMoved += taken
        const fromLabel = action.from === "self" && self ? `${getCard(self.cardId).name}の` : FROM_LABEL[action.from]
        log(state, `${sourceName}：${fromLabel}コア${taken}個を${t ? `${getCard(t.cardId).name}に` : TO_LABEL[action.to]}置いた。`)
        if (t) {
            placeCoresOnSpirit(state, t, taken, owner)
            recordTargets(state, [t.instanceId])
        } else {
            switch (action.to) {
                case "reserve":
                    player.reserve += taken
                    break
                case "trash":
                    voidCoreToOwnTrash(state, owner, taken)
                    break
                case "life":
                    player.life += taken
                    break
                case "deckSide":
                    player.deckSideCores += taken
                    break
            }
        }
    }
    if (totalMoved <= 0) {
        log(state, `${sourceName}：置けるコアがなかった。`)
        return
    }

    // BS09-064天駆ける方舟：「【聖命】の効果で自分のライフにコアが置かれたとき」（from:void限定。旧 lifeCharge と同じ絞り）
    if (action.to === "life" && action.from === "void" && self && spiritHasKeyword(state, owner, self, "seimei")) {
        noteKeyword(getCard(self.cardId).effects, "seimei")
        fireFieldEventTriggers(state, owner, "ownSeimeiLifeCharged", { pid: owner, inst: self })
    }
    if (action.to === "life" && action.from === "void") fireFieldEventTriggers(state, opponentOf(owner), "opponentLifeCoreFromVoid", undefined, undefined, undefined, totalMoved)
    if (nextPick && !state.pendingChoice) placeCoresHandler({ ...ctx, targetInstanceId: undefined }, nextPick)
}

const handlers = { placeCores: placeCoresHandler } satisfies Partial<ActionRegistry>
export default handlers
