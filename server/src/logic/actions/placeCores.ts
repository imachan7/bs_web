// コアを「置く」器（R5。旧 coreGain/voidCoreToSelf/voidCoreToOther/voidCoreToOwnNexuses/
// voidCoresToNexusLevel/trashCoresToSpirit/trashCoresToReserve/selfCoreToOwnLife/fieldCoreToLife/
// lifeCharge等の統合先）。旧ハンドラは data 移行が済むまで残す（cores.ts）。
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, EffectAction, GameState, PlayerId } from "../../type"
import { coresForLevel, getCard, log } from "../GameState"
import {
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

type PlaceCoresAction = Extract<EffectAction, { type: "placeCores" }>

// from の残量（count:"all" の解決に使う。void は上限なしなので呼び出し側で扱う）
function availableFromSource(state: GameState, owner: PlayerId, from: PlaceCoresAction["from"], self: CardInstance | null): number {
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
        case "reserve": {
            const taken = Math.min(amount, player.reserve)
            player.reserve -= taken
            return taken
        }
        case "trash": {
            const taken = Math.min(amount, player.trashCores)
            player.trashCores -= taken
            return taken
        }
        case "self": {
            if (!self) return 0
            if (player.field.spirits.includes(self)) return takeCoresFromSpirit(state, owner, self, amount)
            const taken = Math.min(amount, self.cores)
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

const placeCoresHandler: ActionHandler<"placeCores"> = (ctx, action) => {
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

    // 取り元が空でupTo/upToLevelでもないなら、対象選択より前に打ち切る（無駄な選択を出さない）
    if (
        action.from !== "void" &&
        action.upTo === undefined &&
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

    if (wantsSpiritOrNexus) {
        const pool = action.to === "spirit" ? player.field.spirits : player.field.nexuses
        const resolvedFilter = normalizeFilter(ctx, action)
        if (resolvedFilter === SELF_REQUIRED) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        const candidates = pool.filter((inst) => matchesTarget(state, owner, inst, resolvedFilter, self?.instanceId))

        if (action.target === "self") {
            // 「自分自身」は発生源そのもの。ネクサスの誘発で召喚されたスピリットを指すこともあるので、to に関係なく両方から探す
            const onField = [...player.field.spirits, ...player.field.nexuses].includes(self as CardInstance)
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
            const open = action.excludeIds ? candidates.filter((c) => !action.excludeIds!.includes(c.instanceId)) : candidates
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
    } else if (action.upTo !== undefined) {
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
        const need = action.upTo - current
        if (need <= 0) {
            log(state, `${sourceName}：すでに${String(action.upTo)}以上のため、コアは置かれなかった。`)
            return
        }
        perTarget = need
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

    // orReserve：to以外にリザーブへ置く選択肢を、効果の使用者に毎回選ばせる（voidCoreToSelf/lifeChargeの鏡）。
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

    // BS09-064天駆ける方舟：「【聖命】の効果で自分のライフにコアが置かれたとき」（from:void限定。既存lifeChargeと同じ絞り）
    if (action.to === "life" && action.from === "void" && self && spiritHasKeyword(state, owner, self, "seimei")) {
        fireFieldEventTriggers(state, owner, "ownSeimeiLifeCharged", { pid: owner, inst: self })
    }
    if (nextPick && !state.pendingChoice) placeCoresHandler({ ...ctx, targetInstanceId: undefined }, nextPick)
}

const handlers = { placeCores: placeCoresHandler } satisfies Partial<ActionRegistry>
export default handlers
