// placeUnderSelf / discardUnder のハンドラ（BS19-X02 の下のカード。概念の実体は zones/underCards.ts）
import type { ActionRegistry } from "./types"
import { trashUnderCards } from "../zones/underCards"
import { log } from "../GameState"

const handlers = {
    placeUnderSelf: (ctx, action) => {
        const { state, owner, self, sourceName } = ctx
        if (!self) return
        const player = state.players[owner]
        if (action.from === "deck") {
            const ids = player.deck.splice(0, Math.min(action.upTo, player.deck.length))
            if (ids.length === 0) return
            ;(self.underCards ??= []).push(...ids)
            log(state, `${sourceName}：デッキの上から${ids.length}枚をこのスピリットの下に裏向きで置いた。`)
            return
        }
        const n = Math.min(action.upTo, player.hand.length)
        if (n <= 0) return
        const ids = player.hand.splice(player.hand.length - n, n)
        ;(self.underCards ??= []).push(...ids)
        log(state, `${sourceName}：手札${n}枚をこのスピリットの下に裏向きで置いた。`)
    },
    discardUnder: (ctx, action) => {
        const { state, owner, self, sourceName } = ctx
        if (!self) return
        if ((self.underCards?.length ?? 0) < action.count) {
            log(state, `${sourceName}：下のカードが足りなかった。`)
            state.effectFizzled = true
            return
        }
        trashUnderCards(state, owner, self, action.count)
    },
} satisfies Partial<ActionRegistry>

export default handlers
