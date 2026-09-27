import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, log } from "../GameState"
import { requestCardChoice, requestChoice, resolveMagic } from "../EffectModules"
import { recordMoved } from "../record"
import { matchesPick } from "./revealAction"

// BS11-X05 魔導双神ジェミナイズLv2-3：自分の手札/手元(tegamoto)にあるマジックカード1枚を選び、
// コストを支払わずに使用する（任意。候補0なら不発）。「ターンに2回」の判定は
// fireFieldEventTriggers側（fieldEvent.magicFreeUseMaxPerTurn）が発火自体を止めるので、
// ここでは実際に使用したときだけ CardInstance.magicFreeUseCount を増やす
const magicFreeUseFromHandOrTegamotoHandler: ActionHandler<"magicFreeUseFromHandOrTegamoto"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenOption } = ctx
    if (!self) return
    const player = state.players[owner]
    const matchesFilter = (id: string): boolean =>
        getCard(id).type === "magic" && (action.colorFilter === undefined || getCard(id).colors.includes(action.colorFilter))
    const handCandidates = player.hand
        .map((id, i) => ({ id, i, zone: "hand" as const }))
        .filter(({ id }) => matchesFilter(id))
    // 手元(tegamoto)は tegamotoPlayable にある（＝手札同様に使用できる権利がある）カードだけが対象。
    // handOnly指定時は候補から外す（BS14-055ミスティック・ヒミコLv3：「自分の黄のマジックカード」＝手札限定）
    const tegamotoCandidates = action.handOnly
        ? []
        : player.tegamoto
              .map((id, i) => ({ id, i, zone: "tegamoto" as const }))
              .filter(({ id }) => matchesFilter(id) && player.tegamotoPlayable.includes(id))
    const all = [...handCandidates, ...tegamotoCandidates]
    if (all.length === 0) {
        log(state, `${sourceName}：コストを支払わずに使用できるマジックカードがなかった。`)
        return
    }

    const doUse = (zone: "hand" | "tegamoto", idx: number, cardId: string): void => {
        if (zone === "hand") {
            player.hand.splice(idx, 1)
        } else {
            player.tegamoto.splice(idx, 1)
            const playableIdx = player.tegamotoPlayable.indexOf(cardId)
            if (playableIdx !== -1) player.tegamotoPlayable.splice(playableIdx, 1)
        }
        player.trashCards.push(cardId)
        const usedSoFar = self.magicFreeUseTurn === state.turn ? (self.magicFreeUseCount ?? 0) : 0
        self.magicFreeUseTurn = state.turn
        self.magicFreeUseCount = usedSoFar + 1
        const cardData = getCard(cardId)
        log(
            state,
            `${player.name}は${sourceName}の効果で、${zone === "hand" ? "手札" : "手元"}の${cardData.name}をコストを支払わずに使用した。`,
        )
        state.magicUsedThisTurn[owner] = (state.magicUsedThisTurn[owner] ?? 0) + 1
        const hasMain = cardData.effects.some((e) => e.kind === "magic" && e.timing === "main")
        const timing: "main" | "flash" = state.battle ? "flash" : hasMain ? "main" : "flash"
        const beforeLastMagicCast = state.lastMagicCast
        // paidCost=false：BS11-X05自身のpaidCostOnlyから連鎖しない
        resolveMagic(state, owner, cardId, timing, undefined, false)
        if (state.lastMagicCast === beforeLastMagicCast) {
            state.lastMagicCast = { pid: owner, cardId, timing }
        }
    }

    if (chosenOption !== undefined) {
        const zone: "hand" | "tegamoto" = chosenOption.startsWith("手札：") ? "hand" : "tegamoto"
        const cardName = chosenOption.slice(3)
        const pool = zone === "hand" ? handCandidates : tegamotoCandidates
        const found = pool.find(({ id }) => getCard(id).name === cardName)
        if (!found) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        doUse(zone, found.i, found.id)
        return
    }

    if (state.interactiveTargets) {
        const options = all.map(({ id, zone }) => `${zone === "hand" ? "手札" : "手元"}：${getCard(id).name}`)
        requestChoice(
            state,
            owner,
            `${sourceName}：コストを支払わずに使用するマジックカードを選んでください`,
            [],
            false,
            action,
            self,
            "option",
            options,
        )
        return
    }

    // 非対話：コストが最も高いものを自動選択（決定的簡略化。手札を優先）
    let best = all[0]!
    for (const c of all) {
        if (getCard(c.id).cost > getCard(best.id).cost) best = c
    }
    doUse(best.zone, best.i, best.id)
}

// 手札→手元。count:"any" は対話なら1枚ずつ任意で選び、スキップで終える（0枚も可）。非対話は条件に合う手札を上限まで末尾から置く。
// 置き終えてから lastMoved に書く（マジックブックの「置いた枚数ドロー」は pay の then が置き終えた後に読む。
// 1枚ごとに引くと引いたマジックをそのまま置けてしまう。2026-08-10 の不具合）
const toTegamotoHandler: ActionHandler<"toTegamoto"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    const placed = action.placed ?? []
    const optional = action.count === "any"
    const limit = Math.min(
        action.count === "any" ? Infinity : action.count,
        action.upTo ?? Infinity,
        action.anyMax ?? Infinity,
    )
    const finish = (ids: string[]): void => {
        recordMoved(state, ids)
        if (ids.length === 0) log(state, `${sourceName}：手元に置かなかった。`)
    }
    if (chosenCardIndex !== undefined) {
        const cardId = player.hand[chosenCardIndex]
        if (cardId === undefined || !matchesPick(cardId, action.pick)) {
            finish(placed)
            return
        }
        player.hand.splice(chosenCardIndex, 1)
        player.tegamoto.push(cardId)
        log(state, `${player.name}は${getCard(cardId).name}を手元に置いた。`)
        const next = [...placed, cardId]
        if (next.length >= limit) {
            finish(next)
            return
        }
        const { awaitingSkip: _dropped, ...rest } = action
        ctx.resolve({ ...rest, placed: next })
        return
    }
    if (action.awaitingSkip || placed.length >= limit) {
        finish(placed)
        return
    }
    const indices = player.hand.map((_, i) => i).filter((i) => matchesPick(player.hand[i]!, action.pick))
    if (indices.length === 0) {
        finish(placed)
        return
    }
    if (state.interactiveTargets && (optional || indices.length >= 2)) {
        requestCardChoice(
            state,
            owner,
            optional
                ? `${sourceName}：手元に置くカードを選んでください（選ばなければ終了します）`
                : `${sourceName}：手元に置くカードを選んでください`,
            "hand",
            indices,
            optional,
            optional ? { ...action, placed, awaitingSkip: true } : { ...action, placed },
            self,
            optional,
            optional,
        )
        return
    }
    // 非対話：条件に合う手札を末尾から上限まで（決定的簡略化）
    const take = indices.slice(-Math.min(indices.length, limit - placed.length))
    const ids = take.map((i) => player.hand[i]!)
    player.hand = player.hand.filter((_, i) => !take.includes(i))
    player.tegamoto.push(...ids)
    log(state, `${player.name}は手元に「${ids.map((id) => getCard(id).name).join("、")}」を置いた。`)
    finish([...placed, ...ids])
}

const discardOpponentTegamotoHandler: ActionHandler<"discardOpponentTegamoto"> = (ctx) => {
    const { state, opp, sourceName } = ctx
    const target = state.players[opp]
    const ids = [...target.tegamoto]
    recordMoved(state, ids)
    if (ids.length === 0) {
        log(state, `${sourceName}：${target.name}の手元にカードがなかった。`)
        return
    }
    target.trashCards.push(...ids)
    target.tegamoto = []
    target.tegamotoPlayable = [] // 手元が空になるので使用権も残さない
    log(state, `${sourceName}：${target.name}の手元「${ids.map((id) => getCard(id).name).join("、")}」を破棄した。`)
}

const handlers = {
    discardOpponentTegamoto: discardOpponentTegamotoHandler,
    magicFreeUseFromHandOrTegamoto: magicFreeUseFromHandOrTegamotoHandler,
    toTegamoto: toTegamotoHandler,
} satisfies Partial<ActionRegistry>

export default handlers
