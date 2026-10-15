// 手札のスピリットを好きなだけ、コストを支払って召喚する（summonRepeatFromHand の mode:"paid"。BS02-030 兵隊アントマン）
// 2026-10-15 ユーザー確認：まとめて選ぶ → 合計のコスト＋祭壇の余分1回を1回で払う → 一括で召喚。
// 各カードのコストは召喚する前の盤面の軽減で数える（この効果で召喚したスピリットのシンボルは、同じ効果の別のカードの軽減に使えない）
import type { ActionCtx } from "./types"
import type { CardData, EffectAction, PlayerId } from "../../type"
import { createInstance, getCard, log, minLevelCores, suspend } from "../GameState"
import { autoPayPlan, payCost } from "../EffectModules"
import { askCostPay } from "../summonSurcharge"
import { resolveTensho } from "../keywords/tensho"
import { moveSoulCore, soulCoreOnInstance } from "../soulCore"
import { effectiveCost, summonSurcharge } from "../../../../shared/cost"

type Repeat = Extract<EffectAction, { type: "summonRepeatFromHand" }>

export function resolveSummonRepeatPaid(ctx: ActionCtx, action: Repeat, matches: (cardId: string) => boolean): void {
    const { state, owner, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    const chosen = action.chosenIdx ?? []
    // 発動元が破壊待機のまま場に残っていても、破壊されたスピリットのコアはもうリザーブにある扱い（支払いに使える。2026-10-15 ユーザー確認）
    const self = ctx.self
    if (self?.pendingDestruction && self.cores > 0) {
        if (soulCoreOnInstance(player, self.instanceId)) moveSoulCore(player, { zone: "reserve" }, self)
        player.reserve += self.cores
        self.cores = 0
    }

    // 余分を除いたコスト（余分は全体で1回だけ払うので、カードごとには数えない）。
    // 破壊待機の発動元のシンボルは、破壊時効果の軽減に使える（RULES_BATSPI_WIKI §破壊待機）
    const baseCost = (c: CardData): number => Math.max(0, effectiveCost(state, owner, c) - summonSurcharge(state, owner, c))
    const totals = (idx: number[]): { cost: number; keep: number } => {
        const cards = idx.map((i) => getCard(player.hand[i]!))
        const surcharge = Math.max(0, ...cards.map((c) => summonSurcharge(state, owner, c)))
        return { cost: cards.reduce((sum, c) => sum + baseCost(c), 0) + surcharge, keep: cards.reduce((sum, c) => sum + minLevelCores(c), 0) }
    }
    const affordable = (idx: number[]): boolean => {
        const t = totals(idx)
        return autoPayPlan(state, owner, t.cost + t.keep, true) !== null
    }
    const matching = (): number[] => player.hand.map((_, i) => i).filter((i) => matches(player.hand[i]!))

    // 払い済みの続き、または払い待ちを立てずに払えるときの召喚
    const summonAll = (idx: number[], payNow: boolean): void => {
        const t = totals(idx)
        const cards = idx.map((i) => player.hand[i]!)
        let placed = 0
        if (payNow) {
            const plan = autoPayPlan(state, owner, t.cost + t.keep, true)
            if (plan === null) {
                log(state, `${sourceName}：コアが足りず召喚できなかった。`)
                return
            }
            placed = payCost(state, owner, t.cost, plan.paySources, t.keep, plan.soulFromReserve)
        }
        for (const i of [...idx].sort((a, b) => b - a)) player.hand.splice(i, 1)
        player.reserve -= t.keep - placed
        const insts = cards.map((id) => createInstance(id, state.turn, minLevelCores(getCard(id))))
        player.field.spirits.push(...insts)
        log(state, `${player.name}は${sourceName}の効果で「${cards.map((id) => getCard(id).name).join("、")}」をコスト${t.cost}を支払い召喚した。（このスピリットの召喚時効果は発揮されない）`)
        // 【転召】は無償召喚でも必ず行う（公式Q&A 2024-10-31）。対象選択で中断したらそこで打ち切る
        for (const inst of insts) {
            if (state.winner || state.pendingChoice) break
            resolveTensho(state, owner, inst)
        }
    }

    const finish = (idx: number[]): void => {
        if (idx.length === 0) {
            log(state, `${sourceName}：召喚できる対象がいなかった。`)
            return
        }
        const t = totals(idx)
        const sourceCardId = ctx.sourceCardId ?? ctx.self?.cardId
        const resume: EffectAction = { ...action, choosing: true, chosenIdx: idx, prepaid: true }
        if (sourceCardId !== undefined && askCostPay(state, owner, t.cost, t.keep, `${sourceName}：${t.cost}コストを支払ってください`, sourceCardId, resume)) return
        summonAll(idx, true)
    }

    // 払い待ちから戻ってきた（払い済み。手札はその間動かない）
    if (action.prepaid) {
        summonAll(chosen, false)
        return
    }

    if (!state.interactiveTargets) {
        // 非対話（AI・テスト）：1体あたりの必要コアが小さいものから貪欲に、払える限り選ぶ（召喚数を最大化する簡略化）
        const picked: number[] = []
        const order = matching().sort((a, b) => baseCost(getCard(player.hand[a]!)) + minLevelCores(getCard(player.hand[a]!)) - (baseCost(getCard(player.hand[b]!)) + minLevelCores(getCard(player.hand[b]!))))
        for (const i of order) if (affordable([...picked, i])) picked.push(i)
        finish(picked)
        return
    }

    // 対話：手札を1枚ずつトグルで選び、skip（決定）で確定する。選択中の手札は pendingChoice.selectedCardIndices に載せる
    const ask = (idx: number[]): void => {
        const cands = matching().filter((i) => idx.includes(i) || affordable([i]))
        if (cands.length === 0) {
            log(state, `${sourceName}：召喚できる対象がいなかった。`)
            return
        }
        const t = idx.length > 0 ? totals(idx) : { cost: 0, keep: 0 }
        suspend(state, {
            pid: owner,
            kind: "card",
            prompt: `${sourceName}：召喚する手札を選んでください（合計 ${t.cost}コスト。選んだものをもう一度押すと外れます）`,
            candidates: [],
            cardZone: "hand",
            cardOwner: owner,
            cardIndices: cands,
            selectedCardIndices: idx,
            skipLabel: idx.length > 0 ? `決定（${idx.length}体）` : "召喚しない",
            optional: true,
            resolveOnSkip: true,
            action: { ...action, choosing: true, chosenIdx: idx },
            selfInstanceId: ctx.self ? ctx.self.instanceId : null,
        })
    }
    if (!action.choosing) {
        ask([])
        return
    }
    if (chosenCardIndex !== undefined) {
        ask(chosen.includes(chosenCardIndex) ? chosen.filter((i) => i !== chosenCardIndex) : [...chosen, chosenCardIndex])
        return
    }
    // 決定
    if (chosen.length === 0) {
        log(state, `${sourceName}：召喚しなかった。`)
        return
    }
    if (!affordable(chosen)) {
        log(state, `${sourceName}：合計コストを払えないため、選び直してください。`)
        ask(chosen)
        return
    }
    finish(chosen)
}
