// マジック使用時の誘発（ownMagicUsed／opponentMagicUsed）。コストを払った時点で決め、効果の解決後に処理する
// （2026-11-25 ユーザー決定・#709。解決中に場へ出たものは反応せず、処理時に場を離れた・Lv を満たさないものは発揮しない）
import type { CardData, GameState, PlayerId } from "../../type"
import type { MagicUsedDecision } from "../../types/choice"
import type { CollectedTrigger } from "../blockDeclared"
import { findInstanceAnywhere, opponentOf, resolveInOrder, setWaitingEvent } from "../GameState"
import { runActionFrame } from "../choice"
import { fireFieldEventTriggers } from "../fieldEventTriggers"

type Held = MagicUsedDecision["own"][number]

// 集めるだけで解決しない。「ターンに1回」はここで消費される
export function decideMagicUsedTriggers(state: GameState, owner: PlayerId, card: CardData, timing: "main" | "flash", paidCost: boolean): MagicUsedDecision {
    const collect = (pid: PlayerId, event: "ownMagicUsed" | "opponentMagicUsed", info: { paidCost?: boolean; magicCardId?: string; magicCost?: number; magicTiming?: "main" | "flash" }): Held[] => {
        const sink: CollectedTrigger[] = []
        fireFieldEventTriggers(state, pid, event, undefined, undefined, undefined, undefined, info, undefined, undefined, undefined, undefined, sink)
        return sink.flatMap((i) => (i.frame.kind === "action" ? [{ key: i.key, label: i.label, frame: i.frame }] : []))
    }
    return {
        own: collect(owner, "ownMagicUsed", { paidCost, magicCardId: card.cardId }),
        // コストは軽減前の素のコスト
        opponent: collect(opponentOf(owner), "opponentMagicUsed", { magicCost: card.cost, magicTiming: timing }),
    }
}

// 効果が無効にされたマジックも通す（使用宣言とコストの支払いは済んでいるため）
export function runMagicUsedTriggers(state: GameState, owner: PlayerId, card: CardData, decision: MagicUsedDecision): void {
    state.lastMagicUsed = { pid: owner, cardId: card.cardId }
    for (const items of [decision.own, decision.opponent]) {
        if (state.winner) return
        resolveInOrder(state, items, {
            skip: (i) => {
                const ref = i.frame.levelRecheck
                // 場を離れていたら発揮しない（findInstanceAnywhere は場にあるものだけを探す）。
                // Lv は frame の消化時に runActionFrame が見直す（Q2717）
                return ref !== undefined && findInstanceAnywhere(state, ref.instanceId) === undefined
            },
            resolve: (i) => {
                runActionFrame(state, i.frame.actorPid ?? owner, i.frame)
                setWaitingEvent(state, undefined)
            },
            frame: (i) => i.frame,
            askOrder: { pid: state.turnPlayer, label: (i) => i.label, key: (i) => i.key },
        })
    }
}
