// 詳細に出しているカード。mobile は画面いっぱいの欄を開いているか（スマホ用）。pinned はクリック・タップで固定しているか
export const detail = $state({ cardId: "", mobile: false, pinned: false })

// カードの上を通り過ぎただけでは切り替えない（真ん中の欄へマウスを移す途中で別のカードに変わるため。2026-11-24 ユーザー指摘）
const HOVER_DELAY_MS = 250
let hoverTimer: ReturnType<typeof setTimeout> | undefined

// タッチのタップでも pointerenter は飛ぶので、マウスのときだけ拾う。固定中は切り替えない
export function hoverCard(e: PointerEvent, cardId: string): void {
    if (e.pointerType !== "mouse" || detail.pinned) return
    clearTimeout(hoverTimer)
    hoverTimer = setTimeout(() => {
        detail.cardId = cardId
    }, HOVER_DELAY_MS)
}

export function leaveCard(): void {
    clearTimeout(hoverTimer)
}

// クリック・タップしたカードを固定する（幅900以上のタッチ端末はマウスが無いので、これで詳細を出す）。同じカードをもう一度押すと固定を外す
export function selectDetail(cardId: string): void {
    clearTimeout(hoverTimer)
    if (detail.pinned && detail.cardId === cardId) {
        detail.pinned = false
        return
    }
    detail.cardId = cardId
    detail.pinned = true
}

export function unpinDetail(): void {
    detail.pinned = false
}
