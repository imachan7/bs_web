// 「コストを支払わずに」マジックを使っても、螺旋の塔・ギョクリューン・ルビーの太陽の余分は払う（Q20060。#543）。
// 払い方は無償召喚の余分（summonSurcharge.ts）と同じ：対話中は支払い元を選ばせ、非対話は自動で払う。払えなければ使用しない
import type { CardData, EffectAction, GameState, PlayerId } from "../../type"
import { hasMagicRestriction, magicFreeUseSurcharge } from "../../../../shared/cost"
import { payCost } from "../EffectModules"
import { log } from "../GameState"
import { summonPayPlan } from "../summonCores"
import { askCostPay } from "../summonSurcharge"
import { beginMagicUse } from "./inUse"

function plan(state: GameState, pid: PlayerId, card: CardData): { n: number; reserveOnly: boolean; plan: ReturnType<typeof summonPayPlan> } {
    const n = magicFreeUseSurcharge(state, pid, card)
    // 螺旋の塔 Lv2「コストはすべてリザーブから」は余分にも掛かる
    const reserveOnly = hasMagicRestriction(state, pid, "reserveOnlyOpponent")
    return { n, reserveOnly, plan: n === 0 ? { paySources: [], soulFromReserve: false } : summonPayPlan(state, pid, n, reserveOnly) }
}

export function canPayMagicFreeUseSurcharge(state: GameState, pid: PlayerId, card: CardData): boolean {
    return plan(state, pid, card).plan !== null
}

// "asked"：支払い元を選ぶ待ちを立てた。払ったあと resume（使用の続き）を解決する
// 支払いを待つ間、カードは使用中に置く（手札にもトラッシュにも無い。magic/inUse.ts）
export function payMagicFreeUseSurcharge(state: GameState, pid: PlayerId, card: CardData, resume: Extract<EffectAction, { type: "useMagicCard" }>): "paid" | "asked" | "cannot" {
    const { n, reserveOnly, plan: p } = plan(state, pid, card)
    if (n === 0) return "paid"
    if (p === null) return "cannot"
    if (!reserveOnly && askCostPay(state, pid, n, 0, `${card.name}の使用に${n}コスト余分に支払ってください`, card.cardId, { ...resume, inUse: true }, true)) {
        beginMagicUse(state, pid, card.cardId)
        return "asked"
    }
    payCost(state, pid, n, p.paySources, 0, p.soulFromReserve)
    log(state, `${state.players[pid].name}：${card.name}の使用に${n}コスト余分に支払った。`)
    return "paid"
}
