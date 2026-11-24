// スマホの上の行の「≡ メニュー」。欄の中身は #status-menu に入った既存のボタンで、開け閉めするだけ（押したときの処理は main.ts のまま）
import { $ } from "../renderer"

export function installStatusMenu(): void {
    const bar = $("status-bar")
    const toggle = (open: boolean) => {
        bar.classList.toggle("menu-open", open)
        $("btn-status-menu").setAttribute("aria-expanded", String(open))
    }
    $("btn-status-menu").addEventListener("click", () => toggle(!bar.classList.contains("menu-open")))
    $("btn-status-menu-close").addEventListener("click", () => toggle(false))
    // 外側を押したら閉じる。時間では閉じない。⚙ 表示の中のラジオなど、欄の中の操作では閉じない
    document.addEventListener("click", (e) => {
        if (!(e.target as HTMLElement).closest("#status-menu, #btn-status-menu")) toggle(false)
    })
}
