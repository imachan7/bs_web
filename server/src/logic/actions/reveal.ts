import type { ActionHandler, ActionRegistry } from "./types"
import type { GameState, PlayerId } from "../../type"
import { getCard, log } from "../GameState"
import { notifyHandGained, requestCardChoice } from "../EffectModules"

// 公開ゾーンの残りをデッキの下へ戻す。実対戦では戻す順番を1枚ずつ選ばせる
// （スキップすると残りを現在の順のまま戻す）。カードは「デッキの下」へ行くため、
// 順番が結果に効く場面はごく限られるが、カードテキストどおり選べるようにしてある。
// toTop 指定時は「デッキの**上**に戻す」（BS06-107 セカンドサイト）。こちらは次に引く順そのものなので
// 順番の選択が結果に直結する。**先に選んだカードが上**になるよう、すでに戻した枚数（placed）の
// 位置へ順に差し込む（placed は選択の再入をまたいで action に持ち回る内部専用フィールド）
const revealReturnToDeckHandler: ActionHandler<"revealReturnToDeck"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const zone = state.revealedCards
    if (!zone || zone.pid !== owner) return
    const player = state.players[owner]
    const toTop = action.toTop === true
    const placed = action.placed ?? 0
    const where = toTop ? "上" : "下"
    const pushAllRemaining = (): void => {
        const remaining = zone.cardIds.length
        if (toTop) player.deck.splice(placed, 0, ...zone.cardIds)
        else for (const id of zone.cardIds) player.deck.push(id)
        if (remaining > 0) {
            log(state, `${player.name}は残り${remaining}枚をデッキの${where}に戻した。`)
        }
        delete state.revealedCards
    }
    // 選択された1枚を先に戻し、残りがあれば続けて選ばせる
    let nextPlaced = placed
    if (chosenCardIndex !== undefined) {
        const id = zone.cardIds[chosenCardIndex]
        if (id !== undefined) {
            zone.cardIds.splice(chosenCardIndex, 1)
            if (toTop) {
                player.deck.splice(placed, 0, id)
                nextPlaced = placed + 1
            } else {
                player.deck.push(id)
            }
            log(state, `${player.name}は${getCard(id).name}をデッキの${where}に戻した。`)
        }
    }
    if (zone.cardIds.length === 0) {
        delete state.revealedCards
        return
    }
    if (state.interactiveTargets && zone.cardIds.length >= 2) {
        requestCardChoice(
            state,
            owner,
            toTop
                ? `${sourceName}：デッキの上に戻す順番（残り${zone.cardIds.length}枚。先に選んだカードが上）`
                : `${sourceName}：デッキの下に戻す順番（残り${zone.cardIds.length}枚。スキップで現在の順のまま戻す）`,
            "reveal",
            zone.cardIds.map((_, i) => i),
            // 上に戻す側はスキップを許さない：スキップの後始末（flushRevealedCardsIfIdle）は
            // デッキの**下**へ戻すため、途中で抜けると残りが下に沈んでしまう。
            // 「好きな順番で戻す」は任意効果ではないので、最後まで選ばせるのが効果文どおりでもある
            !toTop,
            toTop ? { type: "revealReturnToDeck", toTop: true, placed: nextPlaced } : { type: "revealReturnToDeck" },
            self,
        )
        return
    }
    // 残り1枚（またはsmoke等の非対話）はそのまま戻す。nextPlaced を使うため pushAllRemaining の外で位置を合わせる
    if (toTop && nextPlaced !== placed) {
        const remaining = zone.cardIds.length
        player.deck.splice(nextPlaced, 0, ...zone.cardIds)
        log(state, `${player.name}は残り${remaining}枚をデッキの上に戻した。`)
        delete state.revealedCards
        return
    }
    pushAllRemaining()
}

const revealDiscardRestHandler: ActionHandler<"revealDiscardRest"> = (ctx) => {
    // 公開ゾーンの残りをすべてトラッシュへ（revealAndSummonKeyword の後始末専用）
    discardRevealedZone(ctx.state, ctx.owner, ctx.sourceName)
}

// BS14-086運命のルーレット：自分のデッキを上から1枚オープンし、無条件に手札へ加える。
// それが指定色（省略時は色不問）のマジックカードだったときだけ、自分のスピリット1体を回復させる
const revealTopToHandThenRefreshOwnHandler: ActionHandler<"revealTopToHandThenRefreshOwn"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const cardId = player.deck.shift()
    if (cardId === undefined) {
        log(state, `${sourceName}：デッキが尽きているため公開できなかった。`)
        return
    }
    const card = getCard(cardId)
    player.hand.push(cardId)
    log(state, `${player.name}はデッキを上から1枚（${card.name}）オープンし、手札に加えた。`)
    notifyHandGained(state, owner, 1)
    const matches = card.type === "magic" && (action.colorFilter === undefined || card.colors.includes(action.colorFilter))
    if (matches) {
        ctx.resolve({ type: "refreshOne" })
    }
}

// 公開ゾーンに残っているカードをすべて持ち主のトラッシュへ置き、公開ゾーンを閉じる
function discardRevealedZone(state: GameState, owner: PlayerId, sourceName: string): void {
    const zone = state.revealedCards
    if (!zone) return
    const player = state.players[owner]
    for (const id of zone.cardIds) player.trashCards.push(id)
    if (zone.cardIds.length > 0) {
        log(state, `${player.name}は${sourceName}で残った${zone.cardIds.length}枚をトラッシュに置いた。`)
    }
    delete state.revealedCards
}

const handlers = {
    revealTopToHandThenRefreshOwn: revealTopToHandThenRefreshOwnHandler,
    revealReturnToDeck: revealReturnToDeckHandler,
    revealDiscardRest: revealDiscardRestHandler,
} satisfies Partial<ActionRegistry>

export default handlers
