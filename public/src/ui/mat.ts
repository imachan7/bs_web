// PC の対戦画面のプレイマット（ライフ・リザーブ・デッキ・トラッシュの枠）。狭い画面では CSS で隠し、情報の行が同じ数を出す
import type { GameView, PlayerId } from "../../../server/src/type"
import { coreIcon } from "./coreIcon"
import { markMillCount } from "./millCount"
import { coreZoneChoiceId, canAwakenFromReserve } from "../../../shared/rules"
import type { UiState } from "../renderer"

const MAX_ICONS = 10

function slotOf(key: string, side: string, label: string, count: string): HTMLElement | null {
    const box = document.getElementById(`mat-${key}-${side}`)
    if (!box) return null
    box.className = "mat-box"
    for (const k of Object.keys(box.dataset)) delete box.dataset[k]
    const head = document.createElement("div")
    head.className = "mat-head"
    head.append(Object.assign(document.createElement("span"), { textContent: label }), Object.assign(document.createElement("span"), { className: "mat-n", textContent: count }))
    box.replaceChildren(head)
    return box
}

function cores(n: number): HTMLDivElement {
    const row = document.createElement("div")
    row.className = "mat-cores"
    for (let i = 0; i < Math.min(n, MAX_ICONS); i++) row.appendChild(coreIcon())
    return row
}

export function renderMat(view: GameView, ui: UiState, pid: PlayerId, isSelf: boolean): void {
    const side = isSelf ? "self" : "opp"
    const p = view.players[pid]
    const choices = view.pendingChoice?.pid === view.you ? (view.pendingChoice.candidates ?? []) : []
    const mark = (el: HTMLElement, id: string) => {
        if (!choices.includes(id)) return
        el.dataset.corezone = id
        el.classList.add("targetable", "clickable")
    }

    const life = slotOf("life", side, "ライフ", String(p.life))
    life?.classList.add("mat-life")
    life?.appendChild(cores(p.life))

    const reserve = slotOf("reserve", side, "リザーブ", String(p.reserve))
    if (reserve) {
        reserve.appendChild(cores(p.reserve))
        if (p.soulCore?.zone === "reserve") reserve.firstElementChild!.append(Object.assign(document.createElement("img"), { src: "/imgs/soulcore.png", className: "soul-core-inline", alt: "[ソウルコア]" }))
        // renderInfo のリザーブ欄と同じ判定（コアの移動元・取り先として押せる）
        if (isSelf) {
            reserve.dataset.reserve = "self"
            const awakenInst = ui.awakenTarget !== null ? view.players[view.you].field.spirits.find((s) => s.instanceId === ui.awakenTarget) : undefined
            if (ui.awakenTarget !== null && canAwakenFromReserve(view, view.you, awakenInst) && p.reserve >= 1) reserve.classList.add("targetable", "clickable")
        }
        mark(reserve, coreZoneChoiceId("reserve", pid))
    }

    const deck = slotOf("deck", side, "デッキ", "")
    if (deck) {
        deck.dataset.millBox = pid
        markMillCount(deck.querySelector<HTMLElement>(".mat-n")!, "deck", pid, p.deckCount, "", "枚")
    }

    const trash = slotOf("trash", side, "トラッシュ", "")
    if (trash) {
        trash.classList.add("mat-trash")
        const cards = document.createElement("div")
        cards.className = "mat-half"
        markMillCount(cards, "trash", pid, p.trashCards.length, "カード ", "枚")
        trash.dataset.millBox = pid
        const co = document.createElement("div")
        co.className = "mat-half"
        co.append(coreIcon(), `コア ${p.trashCores}`)
        mark(co, coreZoneChoiceId("trash", pid))
        trash.append(cards, co)
    }
}
