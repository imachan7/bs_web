// スマホの対戦画面で、押した自分のカード（場・手札）の絵と操作ボタンを出す画面下の固定欄
import { $, master } from "../renderer"
import { cardImageUrl } from "../cardArt"
import type { GameView } from "../../../server/src/type"
import type { UiState } from "../renderer"

// 場のカードの下に出すと、押しにくい（32×24px）うえ、場の行の高さが変わって画面が上下にずれる。
// 欄に出すのは、カードに付いているボタンの複製。押したら元のボタンを押し直すので、押したときの動きは main.ts の既存の処理のまま増えない。
// 手札も同じで、カード本体を押し直す（召喚・配置・使用）ボタンと、カードに付いたバッジのボタンを並べる
// 読み込み時に window を触ると、ブラウザの無い smoke（renderer を読み込む part）が落ちるので、使う時点で判定する
const mobile = { get matches(): boolean { return typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches } }
const SOURCES = ":scope > .core-buttons > button, :scope > .soul-swap-badge, :scope > .card-actions > button"
// 分離・交換は合体中のブレイヴごとに付いている。欄では「分離」「交換」を1つずつにまとめ、ブレイヴが2つ以上のときだけ押したあとにどれかを選ばせる
// （1行ずつ「分離：カード名」と並べると長い名前で欄が横にはみ出した。2026-11-24 ユーザー指摘）
const BRAVE_SOURCES = ":scope .brave-combined > .detach-badge"
const HAND_SOURCES = ":scope > .burst-set-badge, :scope > .hand-ability-badge"
const PLAY_LABEL = { spirit: "召喚", brave: "召喚", nexus: "配置", magic: "使用" } as const

interface Selection { zone: "field" | "hand"; id: string }
// els が2つ以上なら、押したときにどのブレイヴかを選ぶ（names は els と同じ順のブレイヴ名）
interface Entry { label: string; title: string; disabled: boolean; els: HTMLElement[]; names?: string[] }

let selected: Selection | null = null
// 最後に描いた盤面と操作の状態。main.ts を読み込むと renderer 経由で smoke（ブラウザ無し）に通信の初期化まで入るので、描画のたびに受け取って持つ
let view: GameView | null = null
let ui: UiState | null = null
// 欄のボタンが元の要素を押し直すとき、手札の押下を拾う下の処理に二重に拾われないための印
let passing = false
// 分離・交換でどのブレイヴかを選んでいる途中なら、その項目の番号
let picking: number | null = null

// ネクサスのボタンは六角形の切り抜きを避けるため、カードの兄弟（.nexus-slot の中）にある
function sourcesOf(card: HTMLElement): HTMLButtonElement[] {
    const root = card.closest<HTMLElement>(".nexus-slot") ?? card
    return [...root.querySelectorAll<HTMLButtonElement>(SOURCES), ...root.querySelectorAll<HTMLButtonElement>(BRAVE_SOURCES)]
}

function findCard(sel: Selection): HTMLElement | null {
    return sel.zone === "hand"
        ? document.querySelector<HTMLElement>(`#hand .card[data-card-id="${sel.id}"]`)
        : document.querySelector<HTMLElement>(`#my-spirits .card[data-instance-id="${sel.id}"], #my-nexuses .card[data-instance-id="${sel.id}"]`)
}

function entriesOf(sel: Selection, card: HTMLElement): Entry[] {
    if (sel.zone === "field") {
        const root = card.closest<HTMLElement>(".nexus-slot") ?? card
        const plain: Entry[] = [...root.querySelectorAll<HTMLButtonElement>(SOURCES)].map((src) => ({ els: [src], title: src.title, disabled: src.disabled, label: src.textContent ?? "" }))
        const groups = new Map<string, HTMLButtonElement[]>()
        for (const src of root.querySelectorAll<HTMLButtonElement>(BRAVE_SOURCES)) {
            const label = src.textContent ?? ""
            groups.set(label, [...(groups.get(label) ?? []), src])
        }
        const brave: Entry[] = [...groups].map(([label, srcs]) => ({
            label,
            els: srcs,
            title: srcs.length === 1 ? (srcs[0]?.title ?? "") : "",
            disabled: false,
            names: srcs.map((src) => src.closest<HTMLElement>(".brave-combined")?.title.replace("合体中: ", "") ?? ""),
        }))
        return [...plain, ...brave]
    }
    // .clickable は召喚・使用できるカード。できないカードも絵と名前だけは見せる
    const verb = PLAY_LABEL[master(sel.id).type]
    const short = card.dataset.short
    const play: Entry[] = card.classList.contains("clickable")
        ? [{ els: [card], title: "", disabled: false, label: verb }]
        : short !== undefined
          ? [{ els: [card], title: "", disabled: true, label: `${verb}できない（コアがあと${short}個）` }]
          : []
    return [...play, ...[...card.querySelectorAll<HTMLButtonElement>(HAND_SOURCES)].map((src) => ({ els: [src], title: src.title, disabled: src.disabled, label: src.textContent ?? "" }))]
}

// 対象選択・支払いなどの途中は、手札・場のカードを押すとその場で何かが決まるので欄を挟まない（今までの動きのまま）。
// 場のカードにもこの判定が無く、効果で召喚するときのコアの支払いで自分のスピリットを押すと欄が開いて、コアを取れなかった（2026-11-24 ユーザー指摘）
function uiIsFree(): boolean {
    if (!view || !ui || view.pendingChoice) return false
    const u = ui
    // renderer.ts の anyMode（「対象選択をやめる」を出す条件）と同じ並び
    return [u.targeting, u.awakenTarget, u.paying, u.directedAttack, u.battleSwapSummon, u.braveSummonSelect, u.altSummonSelect, u.exReductionSelect, u.soulCoreOnlySelect, u.magicTimingSelect, u.soulSwapSelect, u.burstResetConfirm, u.combineBrave].every((m) => m === null)
}

function select(sel: Selection): void {
    selected = selected?.zone === sel.zone && selected.id === sel.id ? null : sel
    picking = null
    document.querySelectorAll(".dock-selected").forEach((el) => el.classList.remove("dock-selected"))
    renderCardDock()
}

// 盤面を描き直すたびに呼ぶ。描き直しでカードもボタンも作り直されるので、欄の中身も作り直す。
// 選んだカードが場・手札を離れた・押せるボタンが無くなった（支払い中など別の操作に入った）ときは閉じる
export function renderCardDock(v?: GameView, u?: UiState): void {
    if (v) view = v
    if (u) ui = u
    const dock = $("card-dock")
    const card = selected !== null && mobile.matches ? findCard(selected) : null
    const entries = selected && card ? entriesOf(selected, card) : []
    if (!selected || !card || (selected.zone === "field" ? entries.length === 0 : !uiIsFree())) {
        selected = null
        picking = null
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
    const pick = picking !== null ? entries[picking] : undefined
    if (pick?.names === undefined || pick.els.length < 2) picking = null
    const button = (label: string, data: Record<string, string>, title = "", disabled = false): HTMLButtonElement => {
        const btn = document.createElement("button")
        Object.assign(btn.dataset, data)
        btn.textContent = label
        btn.title = title
        btn.disabled = disabled
        return btn
    }
    $("card-dock-buttons").replaceChildren(
        ...(picking !== null && pick?.names
            ? [...pick.names.map((name, j) => button(`${pick.label}：${name}`, { dockIndex: String(picking), dockPick: String(j) })), button("戻る", { dockBack: "" })]
            : entries.map((entry, i) => button(entry.label, { dockIndex: String(i) }, entry.title, entry.disabled))),
    )
    dock.classList.remove("hidden")
}

export function installCardDock(): void {
    // 押せる状態のカード（アタック・ブロック・対象選択など。.clickable）は今までの動きを優先する。
    // その状態では欄は開かない（ボタンが要る起動・覚醒はアタックと同時に出ない）
    for (const id of ["my-spirits", "my-nexuses"]) {
        $(id).addEventListener("click", (e) => {
            // 欄から元のボタンを押し直したときは、カードを選び直さずに main.ts の処理へ通す（手札と同じ印）
            if (!mobile.matches || passing || !uiIsFree()) return
            const card = (e.target as HTMLElement).closest<HTMLElement>(".card[data-instance-id]")
            if (!card || card.classList.contains("clickable") || sourcesOf(card).length === 0) return
            e.stopPropagation()
            select({ zone: "field", id: card.dataset.instanceId ?? "" })
        }, true)
    }
    $("hand").addEventListener("click", (e) => {
        if (!mobile.matches || passing || !uiIsFree()) return
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
        if ((e.target as HTMLElement).closest("[data-dock-back]")) {
            picking = null
            renderCardDock()
            return
        }
        const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-dock-index]")
        const sel = selected
        const card = sel ? findCard(sel) : null
        if (!btn || !sel || !card) return
        const index = Number(btn.dataset.dockIndex)
        const entry = entriesOf(sel, card)[index]
        if (!entry) return
        // ブレイヴが2つ以上の分離・交換は、まずどれかを選ばせる
        if (entry.els.length > 1 && btn.dataset.dockPick === undefined) {
            picking = index
            renderCardDock()
            return
        }
        const el = entry.els[Number(btn.dataset.dockPick ?? 0)]
        picking = null
        // 手札は押した時点で召喚・使用の流れに入る（途中の画面は元の画面に出る）ので欄を閉じる
        if (sel.zone === "hand") selected = null
        passing = true
        el?.click()
        passing = false
        renderCardDock()
    })
}
