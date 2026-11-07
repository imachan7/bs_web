// 手元のスピリット/ブレイヴを手札と同様に召喚する（BS22-003）。使用権は PlayerState.tegamotoPlayable。
// 手元のカードを手札の末尾へ一時的に移して通常の doSummon に通す。拒否されれば元へ戻す。
// 【神速】無償の確認で止まったときは召喚がまだ始まっていないので手元へ戻し、答えが来たらここへ入り直す（手札に残さない）
import type { GameAction, GameState, PlayerId } from "../type"
import { doSummon } from "./GameEngine"

export function doSummonFromTegamoto(state: GameState, pid: PlayerId, action: Extract<GameAction, { type: "summon" }>): string | null {
    const player = state.players[pid]
    const cardId = player.tegamoto[action.handIndex]
    if (cardId === undefined) return "手元にカードがありません"
    const playableIdx = player.tegamotoPlayable.indexOf(cardId)
    if (playableIdx === -1) return "手元のカードを使用できる効果がありません"
    player.tegamoto.splice(action.handIndex, 1)
    player.tegamotoPlayable.splice(playableIdx, 1)
    player.hand.push(cardId)
    const error = doSummon(state, pid, player.hand.length - 1, action.paySources, action.level, action.substituteInstanceId, action.discardHandIndices, action.braveTargetInstanceId, action.altSummonNexusInstanceIds, action.shinsokuAssistInstanceIds, action.exReductionTrashIndices, action.paySoulCoreFromReserve, action.placeSoulCoreFromReserve, action.sokuFreeChoice)
    const asking = error === null ? state.pendingChoice?.sokuFreeChoice : undefined
    if (error !== null || asking !== undefined) {
        player.hand.pop()
        player.tegamoto.splice(action.handIndex, 0, cardId)
        player.tegamotoPlayable.push(cardId)
        if (asking) {
            asking.handIndex = action.handIndex
            asking.fromTegamoto = true
        }
    }
    return error
}
