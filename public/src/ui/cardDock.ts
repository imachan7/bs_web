// スマホの対戦画面で、押した自分のカード（場・手札）の絵と操作ボタンを出す画面下の固定欄
import { $, master } from "../renderer"
import { cardImageUrl } from "../cardArt"
import type { GameView } from "../../../server/src/type"
import type { UiState } from "../renderer"
import { cardLargeShown, hideEffectTooltip, showCardLarge } from "./tooltip"
import { dockActionsOf } from "./fieldCard"

// 場のカードの下に出すと、押しにくい（32×24px）うえ、場の行の高さが変わって画面が上下にずれる。
// 場のカードの操作は、スマホではカードに付けず fieldCard が渡す（dockActionsOf）。押したら main.ts の cardButtonAction に渡すので、押したときの動きは PC と同じ。
// 手札は、カード本体を押し直す（召喚・配置・使用）ボタンと、カードに付いたバッジのボタンを並べる
// 読み込み時に window を触ると、ブラウザの無い smoke（renderer を読み込む part）が落ちるので、使う時点で判定する
const mobile = { get matches(): boolean { return typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches } }
// 分離・交換は合体中のブレイヴごとにある。欄では「分離」「交換」を1つずつにまとめ、ブレイヴが2つ以上のときだけ押したあとにどれかを選ばせる
// （1行ずつ「分離：カード名」と並べると長い名前で欄が横にはみ出した。2026-11-24 ユーザー指摘）
const HAND_SOURCES = ":scope > .burst-set-badge, :scope > .hand-ability-badge"
const PLAY_LABEL = { spirit: "召喚", brave: "召喚", nexus: "配置", magic: "使用" } as const

interface Selection { zone: "field" | "hand"; id: string }
// els が2つ以上なら、押したときにどのブレイヴかを選ぶ（names は els と同じ順のブレイヴ名）
interface Entry { label: string; title: string; disabled: boolean; els: HTMLElement[]; names?: string[] }

let selected: Selection | null = null
// 最後に描いた盤面と操作の状態。main.ts を読み込むと renderer 経由で smoke（ブラウザ無し）に通信の初期化まで入るので、描画のたびに受け取って持つ
let view: GameView | null = null
let ui: UiState | null = null
// 欄のボタンが手札のカードを押し直すとき、手札の押下を拾う下の処理に二重に拾われないための印
let passing = false
// 場のカードの操作を押したときの処理（main.ts の cardButtonAction）
let onFieldAction: (btn: HTMLElement) => void = () => {}
// 分離・交換でどのブレイヴかを選んでいる途中なら、その項目の番号
let picking: number | null = null

function findCard(sel: Selection): HTMLElement | null {
    return sel.zone === "hand"
        ? document.querySelector<HTMLElement>(`#hand .card[data-card-id="${sel.id}"]`)
        : document.querySelector<HTMLElement>(`#my-spirits .card[data-instance-id="${sel.id}"], #my-nexuses .card[data-instance-id="${sel.id}"]`)
}

function entriesOf(sel: Selection, card: HTMLElement): Entry[] {
    if (sel.zone === "field") {
        const actions = dockActionsOf(card)
        const plain: Entry[] = actions.filter((a) => a.brave === undefined).map(({ btn }) => ({ els: [btn], title: btn.title, disabled: btn.disabled, label: btn.textContent ?? "" }))
        const groups = new Map<string, { btn: HTMLButtonElement; brave: string }[]>()
        for (const a of actions) {
            if (a.brave === undefined) continue
            const label = a.btn.textContent ?? ""
            groups.set(label, [...(groups.get(label) ?? []), { btn: a.btn, brave: a.brave }])
        }
        const brave: Entry[] = [...groups].map(([label, list]) => ({
            label,
            els: list.map((a) => a.btn),
            title: list.length === 1 ? (list[0]?.btn.title ?? "") : "",
            disabled: false,
            names: list.map((a) => a.brave),
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
    // 場のカードも、支払いなど別の操作に入ったら閉じる（分離の支払いのシートの上に欄が残っていた。2026-11-25）
    if (!selected || !card || entries.length === 0 && selected.zone === "field" || !uiIsFree()) {
        selected = null
        picking = null
        dock.classList.add("hidden")
        return
    }
    card.classList.add("dock-selected")
    const nameEl = $("card-dock-name")
    nameEl.textContent = card.querySelector(".name")?.textContent ?? ""
    const info = selected.zone === "hand" ? card.dataset.payInfo : undefined
    if (info !== undefined) {
        const line = document.createElement("span")
        line.className = "dock-pay-info"
        line.textContent = info
        nameEl.append(line)
    }
    // 絵は押すと大きく出す（長押しと同じ表示。2026-11-25 ユーザー案）。押せることは右下の「拡大」の札で示す
    const zoom = $("card-dock-zoom")
    const art = $("card-dock-art") as HTMLImageElement
    const url = selected.zone === "hand" ? cardImageUrl(selected.id, "lg") : null
    zoom.hidden = url === null
    art.onerror = () => { zoom.hidden = true }
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

export function installCardDock(fieldAction: (btn: HTMLElement) => void): void {
    onFieldAction = fieldAction
    // 押せる状態のカード（アタック・ブロック・対象選択など。.clickable）は今までの動きを優先する。
    // その状態では欄は開かない（ボタンが要る起動・覚醒はアタックと同時に出ない）
    for (const id of ["my-spirits", "my-nexuses"]) {
        $(id).addEventListener("click", (e) => {
            if (!mobile.matches || !uiIsFree()) return
            const card = (e.target as HTMLElement).closest<HTMLElement>(".card[data-instance-id]")
            if (!card || card.classList.contains("clickable") || dockActionsOf(card).length === 0) return
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
    const close = (): void => {
        selected = null
        picking = null
        document.querySelectorAll(".dock-selected").forEach((el) => el.classList.remove("dock-selected"))
        renderCardDock()
    }
    $("card-dock-close").addEventListener("click", close)
    // もう一度押すと閉じる（2026-11-25 ユーザー案）。指で触れた時点で吹き出しは閉じる（ui/tooltip.ts）ので、開いていたかは触れたときに見ておく
    let wasLarge = false
    $("card-dock-zoom").addEventListener("pointerdown", () => { wasLarge = cardLargeShown() })
    $("card-dock-zoom").addEventListener("click", () => {
        const card = selected ? findCard(selected) : null
        if (wasLarge || cardLargeShown()) hideEffectTooltip()
        else if (card) showCardLarge(card)
        wasLarge = false
    })
    // 欄の外を押したら閉じる（効果の吹き出しと同じ。2026-11-25 ユーザー案）。カードを押したときは上の取り込みで止めて選び直すので、ここへは来ない
    // 押した時点の経路で見る。欄のボタンは押すと欄ごと描き直され、ここに届くときには外れているので closest では欄の外に見えた
    const dock = $("card-dock")
    document.addEventListener("click", (e) => {
        if (selected !== null && !e.composedPath().includes(dock)) close()
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
        if (!el) return
        if (sel.zone === "field") onFieldAction(el)
        else {
            passing = true
            el.click()
            passing = false
        }
        renderCardDock()
    })
}
