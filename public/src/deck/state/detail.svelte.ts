// 詳細に出しているカード。マウスが離れても次のカードに載るまで残す。mobile は画面いっぱいの欄を開いているか（スマホ用）
export const detail = $state({ cardId: "", mobile: false })

// タッチのタップでも pointerenter は飛ぶので、マウスのときだけ拾う（スマホのタップは詳細ボタンで開く）
export function hoverCard(e: PointerEvent, cardId: string): void {
    if (e.pointerType === "mouse") detail.cardId = cardId
}

// タップ・クリックでも詳細カラムを切り替える（幅900以上のタッチ端末＝タブレットはマウスが無く、hoverCard だけでは何も出ない）。
// 幅900未満では詳細カラム自体を出さないので、スマホでは見た目が変わらない
export function selectDetail(cardId: string): void {
    detail.cardId = cardId
}
