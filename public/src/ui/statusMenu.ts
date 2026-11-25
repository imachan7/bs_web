// スマホの上の行の「≡ メニュー」。欄の中身は #status-menu に入った既存のボタンで、開け閉めするだけ（押したときの処理は main.ts のまま）
import { $ } from "../renderer"

export function installStatusMenu(): void {
    const bar = $("status-bar")
    // スマホは ≡ を自分と相手の場の間（中央の帯）の右端に移す。上の右端は片手で届かないため（2026-11-25 ユーザー案・試作）
    if (window.matchMedia("(max-width: 768px)").matches) $("center-info-area").appendChild($("btn-status-menu"))
    const toggle = (open: boolean) => {
        bar.classList.toggle("menu-open", open)
        $("btn-status-menu").setAttribute("aria-expanded", String(open))
    }
    $("btn-status-menu").addEventListener("click", () => toggle(!bar.classList.contains("menu-open")))
    $("btn-status-menu-close").addEventListener("click", () => toggle(false))
    // 別の欄や画面を開くボタンは、押したらメニューを閉じる（ログがメニューの後ろに開いて読めなかった。2026-11-25 ユーザー指摘）。
    // 支払いの自動／手動の切り替えと ⚙ 表示は、メニューの中で続けて操作するので閉じない
    for (const id of ["btn-toggle-log", "btn-toggle-trash", "btn-bug-report", "btn-surrender"]) $(id).addEventListener("click", () => toggle(false))
    // 外側を押したら閉じる。時間では閉じない。⚙ 表示の中のラジオなど、欄の中の操作では閉じない
    document.addEventListener("click", (e) => {
        if (!(e.target as HTMLElement).closest("#status-menu, #btn-status-menu")) toggle(false)
    })
}
