// placeCores のうち、取り元が複数（配列）・自分のスピリット／ライフ・行き先が発生源自身・個数が「好きなだけ」のもの。
// どこから何個取るかは持ち主が選ぶ（取り元1つ＋個数ごとに中断して再入する。gathered／gatherNeed／gatherPick が持ち回る内部状態）
import type { ActionCtx } from "./types"
import type { CardInstance, EffectAction } from "../../type"
import { getCard, log } from "../GameState"
import { fireFieldEventTriggers, placeCoresOnSpirit, requestChoice } from "../EffectModules"
import { normalCoresOn, normalReserveOf, normalTrashOf } from "../soulCore"
import { takeCoresFromSpirit } from "../removal"
import { canPayLife, lifeCostQuery, recordLifeLoss } from "../lifeGate"
import { minLevelCores } from "../../../../shared/rules"

type WidePlaceCores = Extract<EffectAction, { type: "placeCores" }>
type Single = Exclude<WidePlaceCores["from"], unknown[]>

interface Src {
    key: string
    label: string
    cap: number
    inst?: CardInstance
    // 取っても消滅しない余裕（自動選択の優先順位用）
    spare: number
}

const fromsOf = (a: WidePlaceCores): Single[] => (Array.isArray(a.from) ? a.from : [a.from])

// destSelf：行き先が発生源自身のとき、自分から自分へは動かさない
function sourcesOf(ctx: ActionCtx, action: WidePlaceCores): Src[] {
    const { state, owner, self } = ctx
    const player = state.players[owner]
    const destSelf = action.to === "self" ? self : null
    const out: Src[] = []
    const addInst = (inst: CardInstance, label: string): void => {
        if (inst === destSelf || out.some((s) => s.key === inst.instanceId)) return
        const cap = normalCoresOn(player, inst)
        if (cap > 0) out.push({ key: inst.instanceId, label, cap, inst, spare: player.field.spirits.includes(inst) ? Math.max(0, inst.cores - minLevelCores(getCard(inst.cardId))) : cap })
    }
    for (const f of fromsOf(action)) {
        if (f === "reserve" && normalReserveOf(player) > 0) out.push({ key: "reserve", label: "リザーブ", cap: normalReserveOf(player), spare: Infinity })
        else if (f === "trash" && normalTrashOf(player) > 0) out.push({ key: "trash", label: "トラッシュ", cap: normalTrashOf(player), spare: Infinity })
        else if (f === "life" && player.life > 0 && canPayLife(state, lifeCostQuery(owner, 1, self))) out.push({ key: "life", label: "ライフ", cap: player.life, spare: 0 })
        else if (f === "self" && self) addInst(self, `${getCard(self.cardId).name}`)
        else if (f === "ownSpirits") for (const s of player.field.spirits) addInst(s, getCard(s.cardId).name)
        else if (f === "field") for (const i of [...player.field.nexuses, ...player.field.spirits]) addInst(i, getCard(i.cardId).name)
    }
    // 同名が並ぶと選べないので番号を振る（並びは毎回同じ順なので、答えの文字列から引き直せる）
    const seen = new Map<string, number>()
    for (const s of out) {
        const n = (seen.get(s.label) ?? 0) + 1
        seen.set(s.label, n)
        if (out.filter((o) => o.label === s.label).length > 1) s.label = `${s.label}（${n}）`
    }
    for (const s of out) s.label = `${s.label}：コア${s.cap}個`
    return out
}

function take(ctx: ActionCtx, src: Src, n: number): number {
    const { state, owner } = ctx
    const player = state.players[owner]
    if (n <= 0) return 0
    if (src.key === "reserve") {
        const t = Math.min(n, normalReserveOf(player))
        player.reserve -= t
        return t
    }
    if (src.key === "trash") {
        const t = Math.min(n, normalTrashOf(player))
        player.trashCores -= t
        return t
    }
    if (src.key === "life") {
        const t = Math.min(n, player.life)
        // 払えばライフが0になる分は、床の効果があれば払えない（COST_MODEL §9）
        if (t <= 0 || !canPayLife(state, lifeCostQuery(owner, t, ctx.self))) return 0
        player.life -= t
        recordLifeLoss(state, owner, t, ctx.self)
        if (player.life <= 0 && !state.winner) {
            const opp = owner === "p1" ? "p2" : "p1"
            state.winner = opp
            log(state, `${state.players[opp].name}の勝利！`)
        } else {
            fireFieldEventTriggers(state, owner, "ownLifeLost")
        }
        return t
    }
    const inst = src.inst
    if (!inst) return 0
    if (player.field.spirits.includes(inst)) return takeCoresFromSpirit(state, owner, inst, n)
    const t = Math.min(n, normalCoresOn(player, inst))
    inst.cores -= t
    return t
}

// 非対話の自動選択：消滅しない取り方（スピリットの余裕）→リザーブ→その他→ライフ→消滅する取り方
function autoPick(srcs: Src[], left: number): { src: Src; n: number } {
    const rank = (s: Src): number => (s.key === "life" ? 3 : s.key === "reserve" ? 1 : s.inst && s.spare > 0 ? 0 : s.inst ? 4 : 2)
    const best = [...srcs].sort((a, b) => rank(a) - rank(b) || b.spare - a.spare)[0]!
    const n = best.inst && best.spare > 0 ? Math.min(left, best.spare) : Math.min(left, best.cap)
    return { src: best, n }
}

function destCurrent(ctx: ActionCtx, action: WidePlaceCores): number {
    const player = ctx.state.players[ctx.owner]
    if (action.to === "life") return player.life
    if (action.to === "reserve") return player.reserve
    if (action.to === "trash") return player.trashCores
    return ctx.self?.cores ?? 0
}

// pay の成立判定からも使う。行き先が成立し、取り元に count 個以上あるか（好きなだけ／fillTo は成立）
export function gatherPayable(ctx: ActionCtx, action: WidePlaceCores): boolean {
    const { state, owner, self } = ctx
    if (action.to === "self") {
        const p = state.players[owner]
        if (!self || ![...p.field.spirits, ...p.field.nexuses].includes(self)) return false
    } else if (action.to !== "life" && action.to !== "reserve" && action.to !== "trash") return false
    if (typeof action.count !== "number") return true
    return sourcesOf(ctx, action).reduce((sum, s) => sum + s.cap, 0) >= action.count
}

export function placeCoresGather(ctx: ActionCtx, action: WidePlaceCores): void {
    const { state, owner, self, sourceName, chosenOption } = ctx
    const player = state.players[owner]
    if (!gatherPayable(ctx, { ...action, count: action.count === "all" || action.count === "any" ? action.count : 0 })) {
        log(state, `${sourceName}：コアを置けなかった。`)
        state.effectFizzled = true
        return
    }
    const total = (): number => sourcesOf(ctx, action).reduce((sum, s) => sum + s.cap, 0)
    // upTo:true＝「置くことができる」（0個でもよい）。count:"any" は「好きなだけ」
    const optional = action.count === "any" || action.upTo === true
    let gathered = action.gathered ?? 0
    let need = action.gatherNeed
    if (need === undefined) {
        const cap = total()
        const fill = action.fillTo !== undefined ? action.fillTo - destCurrent(ctx, action) : Infinity
        const base = typeof action.count === "number" ? action.count : Infinity
        need = Math.min(base, fill, cap)
        if (!Number.isFinite(need) || need <= 0) {
            log(state, `${sourceName}：${action.fillTo !== undefined && fill <= 0 ? `すでに${action.fillTo}以上のため、` : ""}コアは置かれなかった。`)
            return
        }
    }
    const { gatherPick: _drop, ...base } = action
    const next = (patch: Partial<WidePlaceCores> = {}): WidePlaceCores => ({ ...base, gathered, gatherNeed: need, ...patch })
    const pick = action.gatherPick

    // 直前の問いへの答え
    if (chosenOption !== undefined) {
        if (chosenOption === "やめる") return finish(ctx, action, gathered)
        if (pick !== undefined) {
            const src = sourcesOf(ctx, action).find((s) => s.key === pick)
            if (src) gathered += take(ctx, src, Math.min(Math.max(0, Number(chosenOption) || 0), src.cap, need - gathered))
        } else {
            const src = sourcesOf(ctx, action).find((s) => s.label === chosenOption)
            if (src) {
                const max = Math.min(src.cap, need - gathered)
                if (max > 1) {
                    requestChoice(state, owner, `${sourceName}：${src.label.split("：")[0]}から置くコアの数を選んでください（最大${max}個）`, [], false, next({ gatherPick: src.key }), self, "option", Array.from({ length: max }, (_, i) => String(i + 1)), undefined, true)
                    return
                }
                gathered += take(ctx, src, max)
            }
        }
    }

    while (gathered < need && !state.winner) {
        const srcs = sourcesOf(ctx, action)
        if (srcs.length === 0) break
        if (!state.interactiveTargets || (srcs.length === 1 && !optional && Math.min(srcs[0]!.cap, need - gathered) <= 1)) {
            // 「好きなだけ」の自動選択は、消滅する取り方・ライフには手を付けない（置きすぎて自壊させない）
            const usable = optional ? srcs.filter((x) => x.key !== "life" && (!x.inst || x.spare > 0)) : srcs
            if (usable.length === 0) break
            const { src, n } = autoPick(usable, need - gathered)
            const t = take(ctx, src, n)
            if (t <= 0) break
            gathered += t
            continue
        }
        // 取り元が1つだけで必須なら、聞くのは個数だけ
        if (srcs.length === 1 && !optional) {
            const src = srcs[0]!
            requestChoice(state, owner, `${sourceName}：${src.label.split("：")[0]}から置くコアの数を選んでください（最大${Math.min(src.cap, need - gathered)}個）`, [], false, next({ gatherPick: src.key }), self, "option", Array.from({ length: Math.min(src.cap, need - gathered) }, (_, i) => String(i + 1)), undefined, true)
            return
        }
        requestChoice(state, owner, `${sourceName}：コアを取る場所を選んでください（あと${need - gathered}個${optional ? "まで" : ""}）`, [], false, next(), self, "option", [...srcs.map((s) => s.label), ...(optional ? ["やめる"] : [])])
        return
    }
    finish(ctx, action, gathered)
}

function finish(ctx: ActionCtx, action: WidePlaceCores, gathered: number): void {
    const { state, owner, self, sourceName } = ctx
    const player = state.players[owner]
    if (gathered <= 0) {
        log(state, `${sourceName}：コアを置かなかった。`)
        return
    }
    if (action.to === "life") player.life += gathered
    else if (action.to === "reserve") player.reserve += gathered
    else if (action.to === "trash") player.trashCores += gathered
    else if (self && [...player.field.spirits, ...player.field.nexuses].includes(self)) placeCoresOnSpirit(state, self, gathered, owner)
    else {
        // 取っている間に行き先が場を離れていた。コアは失わずリザーブへ
        player.reserve += gathered
        log(state, `${sourceName}：置き先が場にいないため、コア${gathered}個はリザーブに置いた。`)
        return
    }
    const where = action.to === "self" && self ? `${getCard(self.cardId).name}に` : { life: "自分のライフに", reserve: "自分のリザーブに", trash: "自分のトラッシュに" }[action.to as "life" | "reserve" | "trash"]
    log(state, `${sourceName}：コア${gathered}個を${where}置いた。`)
}

