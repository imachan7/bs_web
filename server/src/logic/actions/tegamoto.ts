import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance } from "../../type"
import { draw, getCard, log } from "../GameState"
import { requestCardChoice, requestChoice, resolveMagic, removeCoresToVoid } from "../EffectModules"

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

const handMagicToTegamotoDrawHandler: ActionHandler<"handMagicToTegamotoDraw"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // マジックブック：自分の手札にあるマジックカードを好きなだけ（max指定時はmax枚まで）手元(tegamoto)に置き、
        // 置いた枚数ぶんデッキから引く。**置き終わってからまとめて引く**のが要点で、
        // 1枚ごとに引くと引いたマジックカードをそのまま次に置けてしまう
        // （drawPerHandDiscard と同じ不具合。2026-08-10 修正）
        const player = state.players[owner]
        const placed = action.placedSoFar ?? 0
        const max = action.max
        const finish = (count: number): void => {
            if (count === 0) {
                log(state, `${sourceName}：手元に置かなかった。`)
                return
            }
            log(state, `${sourceName}：手元に置いた${count}枚ぶんデッキから引く。`)
            draw(state, owner, count)
        }
        if (chosenCardIndex !== undefined) {
            const cardId = player.hand[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}：対象がいなかった。`)
                finish(placed)
                return
            }
            player.hand.splice(chosenCardIndex, 1)
            player.tegamoto.push(cardId)
            log(state, `${player.name}は${getCard(cardId).name}を手元に置いた。`)
            // ここでは引かない。続けて置くか再度尋ねる（awaitingSkip は落とす）
            const { awaitingSkip: _dropped, ...rest } = action
            const nextPlaced = placed + 1
            if (max !== undefined && nextPlaced >= max) {
                // 上限に達したらここで打ち切ってまとめて引く
                finish(nextPlaced)
                return
            }
            ctx.resolve({ ...rest, placedSoFar: nextPlaced })
            return
        }
        // スキップされて戻ってきた＝これ以上置かない。ここで初めて引く
        if (action.awaitingSkip) {
            finish(placed)
            return
        }
        const indices: number[] = []
        for (let i = 0; i < player.hand.length; i++) {
            if (getCard(player.hand[i]!).type === "magic") indices.push(i)
        }
        if (indices.length === 0) {
            // 手札のマジックを出し切った場合もここへ来る（置いたぶんは引く）
            if (placed === 0) log(state, `${sourceName}：手札にマジックカードがなかった。`)
            else finish(placed)
            return
        }
        if (state.interactiveTargets) {
            requestCardChoice(
                state,
                owner,
                `${sourceName}：手元に置くマジックカードを選んでください（選ばなければ終了してドローに移ります）`,
                "hand",
                indices,
                true,
                { ...action, placedSoFar: placed, awaitingSkip: true },
                self,
                // 候補が1枚でも「置かない」を選べるようにする（「好きなだけ」なので0枚も選択肢）
                true,
                // スキップ＝終了。まとめて引くためにハンドラへ戻す
                true,
            )
            return
        }
        // 非interactive時：手札のマジックカードを（max指定時はmax枚まで、未指定なら全部）一括で手元へ移動し、同数ドロー（決定的簡略化）
        const movedNames: string[] = []
        for (let i = player.hand.length - 1; i >= 0; i--) {
            if (max !== undefined && movedNames.length >= max) break
            const cardId = player.hand[i]!
            if (getCard(cardId).type !== "magic") continue
            player.hand.splice(i, 1)
            player.tegamoto.push(cardId)
            movedNames.unshift(getCard(cardId).name)
        }
        if (movedNames.length > 0) draw(state, owner, movedNames.length)
        log(
            state,
            `${player.name}は手元にマジックカード「${movedNames.join("、")}」を置き、デッキから${movedNames.length}枚引いた。`,
        )
        return
}

const revealHandMagicToTegamotoDrawHandler: ActionHandler<"revealHandMagicToTegamotoDraw"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
        // 占いペンタン：handMagicToTegamotoDrawの単発版。自分の手札にあるマジックカード1枚を
        // オープンして手元に置き、1枚ドローする（「〜することで」の任意コストはtriggered.optionalで表現）
        const player = state.players[owner]
        if (chosenCardIndex !== undefined) {
            const cardId = player.hand[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            player.hand.splice(chosenCardIndex, 1)
            player.tegamoto.push(cardId)
            draw(state, owner, 1)
            log(
                state,
                `${player.name}は${getCard(cardId).name}をオープンして手元に置き、デッキから1枚引いた。`,
            )
            return
        }
        const indices: number[] = []
        for (let i = 0; i < player.hand.length; i++) {
            if (getCard(player.hand[i]!).type === "magic") indices.push(i)
        }
        if (indices.length === 0) {
            log(state, `${sourceName}：手札にマジックカードがなかった。`)
            return
        }
        if (state.interactiveTargets) {
            requestCardChoice(
                state,
                owner,
                `${sourceName}：オープンして手元に置くマジックカードを選んでください`,
                "hand",
                indices,
                false,
                action,
                self,
            )
            return
        }
        // 非interactive時：手札末尾（新しい方）の該当カード1枚を機械的に選ぶ（決定的簡略化）
        const idx = indices[indices.length - 1]!
        const cardId = player.hand[idx]!
        player.hand.splice(idx, 1)
        player.tegamoto.push(cardId)
        draw(state, owner, 1)
        log(
            state,
            `${player.name}は${getCard(cardId).name}をオープンして手元に置き、デッキから1枚引いた。`,
        )
        return
}

const discardOpponentTegamotoDestroyPerHandler: ActionHandler<"discardOpponentTegamotoDestroyPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 透明人間エクリア：相手の手元(tegamoto)にあるカードすべてを相手のトラッシュへ破棄し、
        // その枚数ぶん相手のスピリットを破壊する（既存destroyアクションへcount委譲。BP不問=maxBpなし）
        const target = state.players[opp]
        const count = target.tegamoto.length
        if (count === 0) {
            log(state, `${sourceName}：${target.name}の手元にカードがなかった。`)
            return
        }
        const discardedNames = target.tegamoto.map((cardId) => getCard(cardId).name)
        target.trashCards.push(...target.tegamoto)
        target.tegamoto = []
        target.tegamotoPlayable = [] // 手元が空になるので使用権も残さない
        log(
            state,
            `${sourceName}：${target.name}の手元「${discardedNames.join("、")}」を破棄した。`,
        )
        ctx.resolve({ type: "destroy", count })
        return
}

// discardOpponentTegamotoDestroyPerの兄弟。相手の手元(tegamoto)にあるカードすべてを相手のトラッシュへ
// 破棄し、破棄した枚数ぶん、相手のフィールド（スピリット/ネクサス上）またはリザーブから
// ソウルコア以外のコアをボイドへ置く（ソウルコア未実装のいまはリザーブ・フィールドとも通常コアのみなので
// 絞り込み不要）。リザーブ優先で取る（autoTakeCoresToVoidと同じ順）。相手の手元が0枚ならno-op。
// BS12-011ミイラバード：召喚時
const discardOpponentTegamotoVoidCoresPerHandler: ActionHandler<"discardOpponentTegamotoVoidCoresPer"> = (ctx) => {
    const { state, owner, opp, sourceName } = ctx
    const target = state.players[opp]
    const count = target.tegamoto.length
    if (count === 0) {
        log(state, `${sourceName}：${target.name}の手元にカードがなかった。`)
        return
    }
    const discardedNames = target.tegamoto.map((cardId) => getCard(cardId).name)
    target.trashCards.push(...target.tegamoto)
    target.tegamoto = []
    target.tegamotoPlayable = []
    log(state, `${sourceName}：${target.name}の手元「${discardedNames.join("、")}」を破棄した。`)

    let remaining = count
    const fromReserve = Math.min(remaining, target.reserve)
    target.reserve -= fromReserve
    remaining -= fromReserve
    let fromField = 0
    while (remaining > 0) {
        let richest: CardInstance | undefined
        let richestKind: "spirit" | "nexus" | undefined
        for (const s of target.field.spirits) {
            if (s.cores > 0 && (!richest || s.cores > richest.cores)) {
                richest = s
                richestKind = "spirit"
            }
        }
        for (const n of target.field.nexuses) {
            if (n.cores > 0 && (!richest || n.cores > richest.cores)) {
                richest = n
                richestKind = "nexus"
            }
        }
        if (!richest || !richestKind) break
        if (richestKind === "spirit") {
            const removed = removeCoresToVoid(state, opp, richest, Math.min(remaining, richest.cores), owner)
            if (removed === 0) break
            remaining -= removed
            fromField += removed
        } else {
            const take = Math.min(remaining, richest.cores)
            richest.cores -= take
            remaining -= take
            fromField += take
        }
    }
    const voided = fromReserve + fromField
    if (voided > 0) log(state, `${sourceName}：${target.name}のコア${voided}個をボイドに置いた。`)
    return
}

const handlers = {
    magicFreeUseFromHandOrTegamoto: magicFreeUseFromHandOrTegamotoHandler,
    handMagicToTegamotoDraw: handMagicToTegamotoDrawHandler,
    revealHandMagicToTegamotoDraw: revealHandMagicToTegamotoDrawHandler,
    discardOpponentTegamotoDestroyPer: discardOpponentTegamotoDestroyPerHandler,
    discardOpponentTegamotoVoidCoresPer: discardOpponentTegamotoVoidCoresPerHandler,
} satisfies Partial<ActionRegistry>

export default handlers
