// 手札をまとめて選ぶトグル選択（PendingChoice.selectedCardIndices）の描画補助
import type { GameView } from "../../server/src/type"

// 同じカードの束（indices）のうち、クリックで送るインデックスと選択済みの枚数。
// 未選択の候補があればそれを足し、束がすべて選択済みなら1枚外す
export function handToggleTarget(indices: number[], candidates: Set<number>, view: GameView): { target: number | undefined; selected: number } {
    const selected = view.pendingChoice?.selectedCardIndices ?? []
    return {
        target: indices.find((i) => candidates.has(i) && !selected.includes(i)) ?? [...indices].reverse().find((i) => candidates.has(i)),
        selected: indices.filter((i) => selected.includes(i)).length,
    }
}

// 選択中の束に付ける印（「選択中 ×2」）
export function markSelected(el: HTMLElement, count: number): void {
    if (count <= 0) return
    el.classList.add("choice-selected")
    const badge = document.createElement("div")
    badge.className = "field-req-badge"
    badge.textContent = `選択中${count > 1 ? ` ×${count}` : ""}`
    el.appendChild(badge)
}
