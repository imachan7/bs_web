// スマホの対戦画面で、押した自分のカード（場・手札）の絵と操作ボタンを出す画面下の固定欄
import { $, master } from "../renderer"
import { cardImageUrl } from "../cardArt"
import { ui, view } from "../main"

// 場のカードの下に出すと、押しにくい（32×24px）うえ、場の行の高さが変わって画面が上下にずれる。
// 欄に出すのは、カードに付いているボタンの複製。押したら元のボタンを押し直すので、押したときの動きは main.ts の既存の処理のまま増えない。
// 手札も同じで、カード本体を押し直す（召喚・配置・使用）ボタンと、カードに付いたバッジのボタンを並べる
const mobile = window.matchMedia("(max-width: 768px)")
const SOURCES = ":scope > .core-buttons > button, :scope > .soul-swap-badge, :scope > .card-actions > button, :scope .brave-combined > .detach-badge"
const HAND_SOURCES = ":scope > .burst-set-badge, :scope > .hand-ability-badge"
const PLAY_LABEL = { spirit: "召喚", brave: "召喚", nexus: "配置", magic: "使用" } as const

interface Selection { zone: "field" | "hand"; id: string }
interface Entry { label: string; title: string; disabled: boolean; el: HTMLElement }

let selected: Selection | null = null
// 欄のボタンが元の要素を押し直すとき、手札の押下を拾う下の処理に二重に拾われないための印
let passing = false

// ネクサスのボタンは六角形の切り抜きを避けるため、カードの兄弟（.nexus-slot の中）にある
function sourcesOf(card: HTMLElement): HTMLButtonElement[] {
    return [...(card.closest<HTMLElement>(".nexus-slot") ?? card).querySelectorAll<HTMLButtonElement>(SOURCES)]
}

function findCard(sel: Selection): HTMLElement | null {
    return sel.zone === "hand"
        ? document.querySelector<HTMLElement>(`#hand .card[data-card-id="${sel.id}"]`)
        : document.querySelector<HTMLElement>(`#my-spirits .card[data-instance-id="${sel.id}"], #my-nexuses .card[data-instance-id="${sel.id}"]`)
}

function entriesOf(sel: Selection, card: HTMLElement): Entry[] {
    if (sel.zone === "field") {
        return sourcesOf(card).map((src) => {
            // 分離・交換は、どのブレイヴか分かるよう名前を添える（合体は複数のこともある）
            const brave = src.closest<HTMLElement>(".brave-combined")
            return { el: src, title: src.title, disabled: src.disabled, label: (src.textContent ?? "") + (brave ? `：${brave.title.replace("合体中: ", "")}` : "") }
        })
    }
    // .clickable は召喚・使用できるカード。できないカードも絵と名前だけは見せる
    const play: Entry[] = card.classList.contains("clickable") ? [{ el: card, title: "", disabled: false, label: PLAY_LABEL[master(sel.id).type] }] : []
    return [...play, ...[...card.querySelectorAll<HTMLButtonElement>(HAND_SOURCES)].map((src) => ({ el: src, title: src.title, disabled: src.disabled, label: src.textContent ?? "" }))]
}

// 対象選択・支払いなどの途中は、手札を押すとその場で何かが決まるので欄を挟まない（今までの動きのまま）
function handIsFree(): boolean {
    return !!view && !view.pendingChoice && ui.paying === null && ui.targeting === null && ui.awakenTarget === null && ui.soulSwapSelect === null && ui.directedAttack === null
}

function select(sel: Selection): void {
    selected = selected?.zone === sel.zone && selected.id === sel.id ? null : sel
    document.querySelectorAll(".dock-selected").forEach((el) => el.classList.remove("dock-selected"))
    renderCardDock()
}

// 盤面を描き直すたびに呼ぶ。描き直しでカードもボタンも作り直されるので、欄の中身も作り直す。
// 選んだカードが場・手札を離れた・押せるボタンが無くなった（支払い中など別の操作に入った）ときは閉じる
export function renderCardDock(): void {
    const dock = $("card-dock")
    const card = selected !== null && mobile.matches ? findCard(selected) : null
    const entries = selected && card ? entriesOf(selected, card) : []
    if (!selected || !card || (selected.zone === "field" ? entries.length === 0 : !handIsFree())) {
        selected = null
        dock.classList.add("hidden")
        return
    }
    card.classList.add("dock-selected")
    $("card-dock-name").textContent = card.querySelector(".name")?.textContent ?? ""
    const art = $("card-dock-art") as HTMLImageElement
    const url = selected.zone === "hand" ? cardImageUrl(selected.id, "lg") : null
    art.hidden = url === null
    art.onerror = () => { art.hidden = true }
    if (url !== null) art.src = url
    $("card-dock-buttons").replaceChildren(
        ...entries.map((entry, i) => {
            const btn = document.createElement("button")
            btn.dataset.dockIndex = String(i)
            btn.textContent = entry.label
            btn.title = entry.title
            btn.disabled = entry.disabled
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
            // 欄から元のボタンを押し直したときは、カードを選び直さずに main.ts の処理へ通す（手札と同じ印）
            if (!mobile.matches || passing) return
            const card = (e.target as HTMLElement).closest<HTMLElement>(".card[data-instance-id]")
            if (!card || card.classList.contains("clickable") || sourcesOf(card).length === 0) return
            e.stopPropagation()
            select({ zone: "field", id: card.dataset.instanceId ?? "" })
        }, true)
    }
    $("hand").addEventListener("click", (e) => {
        if (!mobile.matches || passing || !handIsFree()) return
        const card = (e.target as HTMLElement).closest<HTMLElement>(".card[data-card-id]")
        if (!card) return
        e.stopPropagation()
        select({ zone: "hand", id: card.dataset.cardId ?? "" })
    }, true)
    $("card-dock-close").addEventListener("click", () => {
        selected = null
        document.querySelectorAll(".dock-selected").forEach((el) => el.classList.remove("dock-selected"))
        renderCardDock()
    })
    $("card-dock-buttons").addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-dock-index]")
        const sel = selected
        const card = sel ? findCard(sel) : null
        if (!btn || !sel || !card) return
        const entry = entriesOf(sel, card)[Number(btn.dataset.dockIndex)]
        // 手札は押した時点で召喚・使用の流れに入る（途中の画面は元の画面に出る）ので欄を閉じる
        if (sel.zone === "hand") selected = null
        passing = true
        entry?.el.click()
        passing = false
        renderCardDock()
    })
}
