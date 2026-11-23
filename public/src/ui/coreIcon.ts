/** コアの画像。文字の高さに合わせるため大きさは CSS（.core-icon）で em 指定 */
export function coreIcon(): HTMLImageElement {
    const img = document.createElement("img")
    img.className = "core-icon"
    img.src = "/imgs/ui/core.png"
    img.alt = ""
    return img
}
