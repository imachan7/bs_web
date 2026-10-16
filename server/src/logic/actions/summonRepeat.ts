// 手札のスピリットを好きなだけ、コストを支払って召喚する（summonRepeatFromHand の mode:"paid"。BS02-030 兵隊アントマン）
// 2026-10-15 ユーザー確認：まとめて選ぶ → 【転召】の対象を選ぶ → 合計のコスト＋祭壇の余分1回を1回で払う → 一括で召喚 → 【転召】を順に解決。
// 各カードのコストは召喚する前の盤面の軽減で数える（この効果で召喚したスピリットのシンボルは、同じ効果の別のカードの軽減に使えない）。
// 破壊待機の発動元のコアはリザーブへ移さず、フィールドのコアとして全部払える（autoPayPlan／fieldCoresSpendable）
import type { ActionCtx } from "./types"
import type { CardData, EffectAction, PlayerId } from "../../type"
import { createInstance, findSpirit, getCard, log, minLevelCores, pushResumeFrames, suspend } from "../GameState"
import { autoPayPlan, payCost, requestChoice } from "../EffectModules"
import { askCostPay } from "../summonSurcharge"
import { dumpAllCoresTensho, tenshoCandidates, tenshoSelfCostBonus, tenshoSpecOf } from "../keywords/tensho"
import { effectiveCost, summonSurcharge } from "../../../../shared/cost"

type Repeat = Extract<EffectAction, { type: "summonRepeatFromHand" }>

export function resolveSummonRepeatPaid(ctx: ActionCtx, action: Repeat, matches: (cardId: string) => boolean): void {
    const { state, owner, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    const chosen = action.chosenIdx ?? []
    const picks = action.tenshoPicks ?? []

    // 召喚したあとの【転召】を順に解決する。途中で選択待ち（置換の確認など）が立ったら残りを積んで止める
    const runTensho = (rest: NonNullable<Repeat["tenshoRest"]>): void => {
        for (let k = 0; k < rest.length; k++) {
            if (state.winner) return
            const r = rest[k]!
            const target = findSpirit(player, r.targetId)
            if (!target) log(state, `【転召】${r.name}：対象がいなかった。`)
            else dumpAllCoresTensho(state, owner, target, r.dest)
            if (state.pendingChoice && k + 1 < rest.length) {
                pushResumeFrames(state, [{ kind: "action", selfInstanceId: null, actorPid: owner, action: { ...action, tenshoRest: rest.slice(k + 1) } }])
                return
            }
        }
    }
    if (action.tenshoRest) {
        runTensho(action.tenshoRest)
        return
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
    const summonAll = (idx: number[], payNow: boolean, pk: (string | null)[]): void => {
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
        const insts = cards.map((id) => ({ ...createInstance(id, state.turn, minLevelCores(getCard(id))), noOnSummon: true as const }))
        player.field.spirits.push(...insts)
        log(state, `${player.name}は${sourceName}の効果で「${cards.map((id) => getCard(id).name).join("、")}」をコスト${t.cost}を支払い召喚した。（このスピリットの召喚時効果は発揮されない）`)
        // 【転召】は無償召喚でも必ず行う（公式Q&A 2024-10-31）。対象は支払いの前に選んである
        const rest: NonNullable<Repeat["tenshoRest"]> = []
        idx.forEach((_, k) => {
            const spec = tenshoSpecOf(getCard(cards[k]!), 1)
            const targetId = pk[k]
            if (!spec) return
            if (targetId == null) log(state, `【転召】${getCard(cards[k]!).name}：対象がいなかった。`)
            else rest.push({ name: getCard(cards[k]!).name, targetId, dest: spec.dest })
        })
        runTensho(rest)
    }

    // 【転召】の候補（召喚前の場から。同じ効果で先に選んだ対象は除く。破壊待機の個体も対象にできる＝TIMING_CHART「【転召】との相互作用」）
    const tenshoCands = (cardId: string, taken: (string | null)[]): string[] | null => {
        const spec = tenshoSpecOf(getCard(cardId), 1)
        if (!spec) return null
        return tenshoCandidates(state, owner, spec.minCost, undefined, spec.familyFilter)
            .filter((s) => !taken.includes(s.instanceId))
            .map((s) => s.instanceId)
    }
    // 次に対象を選ぶカードまで自動で埋める（転召なし・候補0〜1・非対話）。全部埋まったら true
    const fillPicks = (idx: number[], acc: (string | null)[]): boolean => {
        while (acc.length < idx.length) {
            const cands = tenshoCands(player.hand[idx[acc.length]!]!, acc)
            if (cands === null || cands.length === 0) acc.push(null)
            else if (cands.length === 1) acc.push(cands[0]!)
            else if (!state.interactiveTargets) {
                // 自動選択はコスト最大の1体（resolveTensho と同じ決定的簡略化）
                const insts = cands.map((id) => findSpirit(player, id)!)
                const costOf = (x: (typeof insts)[number]): number => getCard(x.cardId).cost + tenshoSelfCostBonus(state, owner, x)
                acc.push(insts.reduce((best, x) => (costOf(x) > costOf(best) ? x : best)).instanceId)
            } else return false
        }
        return true
    }
    const askTensho = (idx: number[], acc: (string | null)[]): void => {
        const cardId = player.hand[idx[acc.length]!]!
        const spec = tenshoSpecOf(getCard(cardId), 1)!
        requestChoice(
            state,
            owner,
            `【転召】${getCard(cardId).name}：コアを${spec.dest === "void" ? "ボイドに置く" : "トラッシュに置く"}自分のスピリットを選択`,
            tenshoCands(cardId, acc)!,
            false,
            { ...action, choosing: true, chosenIdx: idx, confirmed: true, tenshoPicks: acc },
            ctx.self ?? null,
        )
    }

    const finish = (idx: number[], pk: (string | null)[]): void => {
        if (idx.length === 0) {
            log(state, `${sourceName}：召喚できる対象がいなかった。`)
            return
        }
        const t = totals(idx)
        const sourceCardId = ctx.sourceCardId ?? ctx.self?.cardId
        const resume: EffectAction = { ...action, choosing: true, chosenIdx: idx, prepaid: true, tenshoPicks: pk }
        if (sourceCardId !== undefined && askCostPay(state, owner, t.cost, t.keep, `${sourceName}：${t.cost}コストを支払ってください`, sourceCardId, resume)) return
        summonAll(idx, true, pk)
    }

    // 払い待ちから戻ってきた（払い済み。手札はその間動かない）
    if (action.prepaid) {
        summonAll(chosen, false, picks)
        return
    }

    if (!state.interactiveTargets) {
        // 非対話（AI・テスト）：1体あたりの必要コアが小さいものから貪欲に、払える限り選ぶ（召喚数を最大化する簡略化）
        const picked: number[] = []
        const order = matching().sort((a, b) => baseCost(getCard(player.hand[a]!)) + minLevelCores(getCard(player.hand[a]!)) - (baseCost(getCard(player.hand[b]!)) + minLevelCores(getCard(player.hand[b]!))))
        for (const i of order) if (affordable([...picked, i])) picked.push(i)
        const acc: (string | null)[] = []
        fillPicks(picked, acc)
        finish(picked, acc)
        return
    }

    // 【転召】の対象を選んで戻ってきた
    if (action.confirmed) {
        const acc = [...picks, ctx.targetInstanceId ?? null]
        if (!fillPicks(chosen, acc)) return askTensho(chosen, acc)
        finish(chosen, acc)
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
    const acc: (string | null)[] = []
    if (!fillPicks(chosen, acc)) return askTensho(chosen, acc)
    finish(chosen, acc)
}
