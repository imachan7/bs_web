// 場に残るマジック（BS19-099 等）の配置と破棄。置き場所は PlayerState.field.magics、
// 中身の継続効果・fieldEvent は effectSources() がこの配列を返すことで効く（shared/rules/level.ts）
import type { ActionRegistry } from "../actions/types"
import type { CardInstance, GameState, PlayerId } from "../../type"
import { createInstance, getCard, log } from "../GameState"

// フィールドに置いてあるマジック1枚を持ち主のトラッシュへ破棄する（破棄条件の fieldEvent から呼ぶ）
export function trashFieldMagic(state: GameState, ownerPid: PlayerId, inst: CardInstance): void {
    const player = state.players[ownerPid]
    const index = player.field.magics.findIndex((m) => m.instanceId === inst.instanceId)
    if (index === -1) return
    player.field.magics.splice(index, 1)
    player.trashCards.push(inst.cardId)
    log(state, `${getCard(inst.cardId).name}は破棄され、${player.name}のトラッシュへ置かれた。`)
}

const handlers = {
    // 使用直後のこのマジック（使用時にトラッシュへ置かれている）を取り上げてフィールドへ置く
    placeSelfOnField: (ctx, _action) => {
        const { state, owner, sourceCardId, sourceName } = ctx
        if (sourceCardId === undefined) {
            log(state, `${sourceName}：フィールドに置くカードが特定できなかった。`)
            return
        }
        const player = state.players[owner]
        const index = player.trashCards.lastIndexOf(sourceCardId)
        if (index === -1) {
            log(state, `${sourceName}：トラッシュにこのカードが見つからなかった。`)
            return
        }
        player.trashCards.splice(index, 1)
        player.field.magics.push(createInstance(sourceCardId, state.turn, 0))
        log(state, `${sourceName}は${player.name}のフィールドに置かれた。`)
    },
    trashSelfFromField: (ctx, _action) => {
        const { state, owner, self } = ctx
        if (!self) return
        trashFieldMagic(state, owner, self)
    },
} satisfies Partial<ActionRegistry>

export default handlers
