// スマホの対戦画面で、自分の場のカードの操作ボタン（コア移動・起動・覚醒・合体・分離など）を出す画面下の固定欄
import { $ } from "../renderer"

// 場のカードの下に出すと、押しにくい（32×24px）うえ、場の行の高さが変わって画面が上下にずれる。
// 欄に出すのは、カードに付いているボタンの複製。押したら元のボタンを押し直すので、押したときの動きは main.ts の既存の処理のまま増えない
const mobile = window.matchMedia("(max-width: 768px)")
const SOURCES = ":scope > .core-buttons > button, :scope > .soul-swap-badge, :scope > .card-actions > button, :scope .brave-combined > .detach-badge"

let selected: string | null = null

// ネクサスのボタンは六角形の切り抜きを避けるため、カードの兄弟（.nexus-slot の中）にある
function sourcesOf(card: HTMLElement): HTMLButtonElement[] {
    return [...(card.closest<HTMLElement>(".nexus-slot") ?? card).querySelectorAll<HTMLButtonElement>(SOURCES)]
}

function findCard(id: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`#my-spirits .card[data-instance-id="${id}"], #my-nexuses .card[data-instance-id="${id}"]`)
}

// 盤面を描き直すたびに呼ぶ。描き直しでカードもボタンも作り直されるので、欄の中身も作り直す。
// 選んだカードが場を離れた・押せるボタンが無くなった（支払い中など別の操作に入った）ときは閉じる
export function renderCardDock(): void {
    const dock = $("card-dock")
    const card = selected !== null && mobile.matches ? findCard(selected) : null
    const sources = card ? sourcesOf(card) : []
    if (!card || sources.length === 0) {
        selected = null
        dock.classList.add("hidden")
        return
    }
    card.classList.add("dock-selected")
    $("card-dock-name").textContent = card.querySelector(".name")?.textContent ?? ""
    const box = $("card-dock-buttons")
    box.replaceChildren(
        ...sources.map((src, i) => {
            const btn = document.createElement("button")
            btn.dataset.dockIndex = String(i)
            // 分離・交換は、どのブレイヴか分かるよう名前を添える（合体は複数のこともある）
            const brave = src.closest<HTMLElement>(".brave-combined")
            btn.textContent = (src.textContent ?? "") + (brave ? `：${brave.title.replace("合体中: ", "")}` : "")
            btn.title = src.title
            return btn
        }),
    )
    dock.classList.remove("hidden")
}

export function installCardDock(): void {
    // 押せる状態のカード（アタック・ブロック・対象選択など。.clickable）は今までの動きを優先する。
    // その状態では欄は開かない（ボタンが要る起動・覚醒はアタックと同時に出ない）
    for (const id of ["my-spirits", "my-nexuses"]) {
        $(id).addEventListener("click", (e) => {
            if (!mobile.matches) return
            const card = (e.target as HTMLElement).closest<HTMLElement>(".card[data-instance-id]")
            if (!card || card.classList.contains("clickable") || sourcesOf(card).length === 0) return
            e.stopPropagation()
            const instanceId = card.dataset.instanceId ?? ""
            selected = selected === instanceId ? null : instanceId
            document.querySelectorAll(".dock-selected").forEach((el) => el.classList.remove("dock-selected"))
            renderCardDock()
        }, true)
    }
    $("card-dock-close").addEventListener("click", () => {
        selected = null
        document.querySelectorAll(".dock-selected").forEach((el) => el.classList.remove("dock-selected"))
        renderCardDock()
    })
    $("card-dock-buttons").addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-dock-index]")
        const card = selected !== null ? findCard(selected) : null
        if (btn && card) sourcesOf(card)[Number(btn.dataset.dockIndex)]?.click()
    })
}
