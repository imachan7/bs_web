// マウスを載せたカードの横に浮かべる文字だけの欄。詳細カラムの hoverCard（遅れて切り替える）とは独立
export const tip = $state({ cardId: "", left: 0, top: 0, right: 0, bottom: 0, listLeft: 8, listRight: 0 })

export function showTip(e: PointerEvent, cardId: string): void {
    if (e.pointerType !== "mouse") return
    const el = e.currentTarget as HTMLElement
    const r = el.getBoundingClientRect()
    const list = el.parentElement?.getBoundingClientRect()
    Object.assign(tip, { cardId, left: r.left, top: r.top, right: r.right, bottom: r.bottom, listLeft: list?.left ?? 8, listRight: list?.right ?? window.innerWidth })
}

export function hideTip(): void {
    tip.cardId = ""
}
