// トラッシュからカードを取り出す唯一の口（#437 R4-4。2026-11-12）。
// トラッシュで「一切の効果を受けない」カード（kind:"trashImmunity"）と、トラッシュが効果を受けない間（trashFrozen）は、
// 効果では取り出さない。以前は候補を作る場所ごとに isTrashCardProtected を呼ぶ形で、呼び忘れた経路
// （ネクサスの配置・破棄されたマジックを手元へ・takeLast・【光芒】など）が保護を素通りした。
// trashCards を直接 splice しない（smoke part906 が server/src/logic 全体を grep して落とす）
import { isTrashCardProtected } from "../../../../shared/rules"
import type { GameState, PlayerId } from "../../type"
import { getCard, log } from "../GameState"

// effect＝効果で動かす（保護を見る）。rule＝効果の対象にしない動き（《継召》のコストとして除外する・使ったマジックを場に残す）
export type TrashTakeBy = "effect" | "rule"

// 効果がトラッシュから動かせるカードか（候補を作るときに使う。選ばせてから取り出せない、を避けるため）
export function trashTakeableByEffect(state: GameState, cardId: string): boolean {
    return !isTrashCardProtected(cardId, state)
}

// index のカードを取り出して返す。無い・保護されていて取り出せないときは null（トラッシュはそのまま。保護のときはログを出す）
export function takeFromTrash(state: GameState, pid: PlayerId, index: number, by: TrashTakeBy): string | null {
    const trash = state.players[pid].trashCards
    const cardId = trash[index]
    if (cardId === undefined) return null
    if (by === "effect" && !trashTakeableByEffect(state, cardId)) {
        log(state, `${getCard(cardId).name}はトラッシュで効果を受けないため、動かなかった。`)
        return null
    }
    trash.splice(index, 1)
    return cardId
}
