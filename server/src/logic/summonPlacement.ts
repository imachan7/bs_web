// 召喚したカードを場に置く入口。置き場はカードの種別で決まる（アルティメットは field.ultimates。ULTIMATE.md §3）。
// ブレイヴの合体・ネクサス・トークンなどアルティメットになりえない置き方はここを通さない
import type { CardInstance, GameState, PlayerId } from "../type"
import { getCard } from "./GameState"

export function placeSummonedOnField(state: GameState, pid: PlayerId, inst: CardInstance): void {
    const field = state.players[pid].field
    if (getCard(inst.cardId).type === "ultimate") field.ultimates.push(inst)
    else field.spirits.push(inst)
}
