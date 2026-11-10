// 「BP／コスト合計○○まで相手のスピリットを好きなだけ疲労させる」（exhaust の budget 軸）。
// 選び方は destroy の budget と同じ（cost は印刷のコスト）：1体ずつ選び、残り予算を超える候補は外す。非対話は重いものから貪欲
import type { ActionCtx } from "./types"
import type { CardInstance } from "../../type"
import { getCard, log, suspend } from "../GameState"
import { exhaustSpirit, pickEnemyCandidates } from "../EffectModules"
import { effectiveBp } from "../../../../shared/rules"
import { recordTargets } from "../record"
import type { EffectAction } from "../../type"

type ExhaustAction = Extract<EffectAction, { type: "exhaust" }>

export function exhaustWithinBudget(ctx: ActionCtx, action: ExhaustAction): void {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const budget = action.budget!.amount
    const byCost = action.budget!.by === "cost"
    const weightOf = (s: CardInstance): number => (byCost ? getCard(s.cardId).cost : effectiveBp(state, opp, s))
    const onField = (id: string): CardInstance | undefined => state.players[opp].field.spirits.find((s) => s.instanceId === id)
    const pick = (ok: (s: CardInstance) => boolean): CardInstance[] =>
        pickEnemyCandidates(state, opp, Infinity, (s) => !s.isRested && ok(s), srcColors, srcType, "exhaust")

    let chosen = [...(action.chosenIds ?? [])]
    if (state.interactiveTargets || action.choosing) {
        if (action.choosing && targetInstanceId !== undefined) {
            chosen = chosen.includes(targetInstanceId) ? chosen.filter((id) => id !== targetInstanceId) : [...chosen, targetInstanceId]
        }
        chosen = chosen.filter((id) => onField(id) !== undefined)
        const used = chosen.reduce((sum, id) => sum + weightOf(onField(id)!), 0)
        if (!(action.choosing && targetInstanceId === undefined)) {
            const candidates = pick((s) => chosen.includes(s.instanceId) || weightOf(s) <= budget - used)
            if (candidates.length > 0) {
                suspend(state, {
                    pid: owner,
                    kind: "target",
                    prompt: `${sourceName}：疲労させるスピリットを選んでください（選んだものをもう一度押すと外れます）`,
                    candidates: candidates.map((s) => s.instanceId),
                    selectedIds: chosen,
                    counter: { label: `${byCost ? "コスト" : "BP"}合計`, current: used, max: budget },
                    skipLabel: chosen.length > 0 ? `これで疲労させる（${chosen.length}体）` : "疲労させない",
                    optional: true,
                    resolveOnSkip: true,
                    action: { ...action, choosing: true as const, chosenIds: chosen },
                    selfInstanceId: self ? self.instanceId : null,
                })
                return
            }
        }
    } else {
        let remaining = budget
        for (;;) {
            const cands = pick((s) => weightOf(s) <= remaining && !chosen.includes(s.instanceId))
            if (cands.length === 0) break
            const target = cands.reduce((a, b) => (weightOf(b) > weightOf(a) ? b : a))
            remaining -= weightOf(target)
            chosen.push(target.instanceId)
        }
    }
    if (chosen.length === 0) {
        log(state, `${sourceName}：疲労させられる対象がいなかった。`)
        return
    }
    for (const id of chosen) {
        const s = onField(id)!
        exhaustSpirit(state, opp, s, undefined, owner, srcType)
        log(state, `${sourceName}：${getCard(s.cardId).name}は疲労した。`)
    }
    recordTargets(state, chosen)
}
