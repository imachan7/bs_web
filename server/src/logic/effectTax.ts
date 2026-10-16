// 概念: 効果税（「〜しなければ、その効果を発揮できない」）。マジックの使用・バーストの発動は成立し、
// 効果の解決の直前だけに関門を置く。払う・払わないを選ぶのは課された側（使用者・発動者）
import { noteCoverage } from "../../../shared/coverage"
import { effectActiveAtLevel, effectSources, timedPlayerRules } from "../../../shared/rules"
import type { EffectAction, GameState, PlayerId } from "../type"
import { currentLevel, getCard, opponentOf } from "./GameState"

type Tax = { cost: EffectAction; source: string }

function taxCosts(state: GameState, payer: PlayerId, on: "magic" | "burst"): Tax[] {
    const costs: Tax[] = []
    for (const r of timedPlayerRules(state, payer)) if (r.type === "effectTaxForPid" && r.on === on) costs.push({ cost: r.cost, source: r.source ?? "効果" })
    const opp = opponentOf(payer)
    for (const source of effectSources(state, opp)) {
        const level = currentLevel(source).level
        for (const e of getCard(source.cardId).effects) {
            if (e.kind !== "effectTax" || e.on !== on || !effectActiveAtLevel(e.levels, level)) continue
            if (e.phaseTurn) {
                if (state.phase !== e.phaseTurn.phase) continue
                if (e.phaseTurn.turn === "own" && opp !== state.turnPlayer) continue
                if (e.phaseTurn.turn === "opponent" && opp === state.turnPlayer) continue
            }
            noteCoverage(e, "effectTax")
            costs.push({ cost: e.cost, source: getCard(source.cardId).name })
        }
    }
    return costs
}

export const hasEffectTax = (state: GameState, payer: PlayerId, on: "magic" | "burst"): boolean => taxCosts(state, payer, on).length > 0

// atLeastTaxedCost は払う時点まで税の対象カードを覚えておく場所が要らないよう、ここで印刷コストの下限に置き換える
function bindTaxedCost(cost: EffectAction, printedCost: number): EffectAction {
    const walk = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(walk)
        if (v === null || typeof v !== "object") return v
        const out: Record<string, unknown> = {}
        for (const [k, x] of Object.entries(v)) out[k] = walk(x)
        if (out["atLeastTaxedCost"] === true) {
            delete out["atLeastTaxedCost"]
            out["cost"] = { min: printedCost }
        }
        return out
    }
    return walk(cost) as EffectAction
}

// 確認文の「〜しなければ」「〜しますか」にあたる語句。cost の書き方ごとに足す（知らない形は汎用の言い方）
function describeTaxCost(cost: EffectAction, printed: number): { phrase: string; verb: string } {
    if (cost.type === "moveCards" && cost.from === "hand" && cost.dest === "trash" && typeof cost.count === "number") {
        const min = cost.pick?.atLeastTaxedCost ? `コスト${printed}以上の` : ""
        return { phrase: `手札の${min}カード${cost.count}枚を破棄し`, verb: "破棄し" }
    }
    if (cost.type === "removeCores" && cost.from?.length === 1 && cost.from[0] === "reserve" && cost.to === "trash" && typeof cost.count === "number") {
        return { phrase: `リザーブのコア${cost.count}個をトラッシュに置か`, verb: "置き" }
    }
    return { phrase: "コストを支払わ", verb: "支払い" }
}

// 払わせる必要がある税の分だけ pay で包んだ action を返す（無ければ元のまま）。
// pay は costOnly：包まれる効果の種類は問わず、払えない・断られたら then ごと飛ぶ。
// tax：外側の発動確認（markPays）では確認済みにならない。確認済みのバースト発動でも払うかは別に聞くため
export function withEffectTax(state: GameState, payer: PlayerId, on: "magic" | "burst", cardId: string, action: EffectAction): EffectAction {
    const taxes = taxCosts(state, payer, on)
    if (on === "burst") state.burstTaxUnpaid = action.type === "noop" ? 0 : taxes.length
    if (action.type === "noop") return action
    const card = getCard(cardId)
    let wrapped = action
    for (const { cost, source } of taxes.reverse()) {
        const { phrase, verb } = describeTaxCost(cost, card.cost)
        wrapped = { type: "pay", cost: bindTaxedCost(cost, card.cost), then: wrapped, costOnly: true, tax: { source, target: card.name, phrase, verb } }
    }
    return wrapped
}
