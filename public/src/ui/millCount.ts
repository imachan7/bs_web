// デッキ破棄（GameEvent mill）を1枚ずつ見せる：デッキとトラッシュの枚数を数え、破棄されたカードを並べる。
// 盤面は破棄の後の枚数で届くので、まだ数えていないカードを持っておき、デッキには足し・トラッシュからは引いて出す。
// 数える間は、印（data-mill-deck／data-mill-trash／data-mill-box）の付いた要素の文字とクラスだけを書き換え、盤面は描き直さない
import type { PlayerId } from "../../../server/src/type"
import { revealCardEl } from "../renderer"

const queue: { pid: PlayerId; cardId: string }[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let stepMs = 100
const SHOW_AFTER_MS = 2500

// まだ数えていない枚数（描画はデッキに足し、トラッシュから引く）
export function millPending(pid: PlayerId): number {
    return queue.filter((q) => q.pid === pid).length
}

// 何枚でも合わせて1秒ほどで数え終わるようにする（1枚ずつの間は 60〜150ms）
export function startMillCount(pid: PlayerId, cardIds: string[], mine: boolean): void {
    if (cardIds.length === 0) return
    for (const cardId of cardIds) queue.push({ pid, cardId })
    stepMs = Math.max(60, Math.min(150, 1000 / queue.length))
    openPanel(`🗑 ${mine ? "あなた" : "相手"}のデッキから破棄`)
    if (timer === null) timer = setTimeout(tick, stepMs)
}

function tick(): void {
    timer = null
    const next = queue.shift()
    if (next) document.querySelector("#mill-panel .reveal-row")?.appendChild(revealCardEl(next.cardId))
    refreshMillTexts()
    if (queue.length > 0) {
        timer = setTimeout(tick, stepMs)
        return
    }
    hideTimer = setTimeout(() => document.getElementById("mill-panel")?.remove(), SHOW_AFTER_MS)
}

function openPanel(title: string): void {
    if (hideTimer !== null) clearTimeout(hideTimer)
    hideTimer = null
    let panel = document.getElementById("mill-panel")
    if (panel && timer === null) panel.remove() // 前の破棄を見せ終わって残っている分は片付けて、新しく並べ直す
    panel = document.getElementById("mill-panel")
    if (!panel) {
        panel = document.createElement("div")
        panel.id = "mill-panel"
        const head = document.createElement("div")
        head.className = "reveal-head"
        const row = document.createElement("div")
        row.className = "reveal-row"
        panel.append(head, row)
        document.getElementById("game")?.appendChild(panel)
    }
    panel.querySelector(".reveal-head")!.textContent = title
}

// 描画した直後にも呼ぶ（数えている途中で描き直されたとき、光らせるクラスを付け直すため）
export function refreshMillTexts(): void {
    for (const el of document.querySelectorAll<HTMLElement>("[data-mill-deck], [data-mill-trash]")) {
        const pid = (el.dataset.millDeck ?? el.dataset.millTrash) as PlayerId
        const base = Number(el.dataset.base)
        const n = el.dataset.millDeck !== undefined ? base + millPending(pid) : base - millPending(pid)
        el.textContent = `${el.dataset.prefix ?? ""}${n}${el.dataset.suffix ?? ""}`
    }
    for (const el of document.querySelectorAll<HTMLElement>("[data-mill-box]")) {
        el.classList.toggle("milling", millPending(el.dataset.millBox as PlayerId) > 0)
    }
}

// 数える対象の文字の要素に印を付ける。base は破棄の後の（本当の）枚数
export function markMillCount(el: HTMLElement, kind: "deck" | "trash", pid: PlayerId, base: number, prefix: string, suffix: string): void {
    el.dataset[kind === "deck" ? "millDeck" : "millTrash"] = pid
    el.dataset.base = String(base)
    el.dataset.prefix = prefix
    el.dataset.suffix = suffix
    const n = kind === "deck" ? base + millPending(pid) : base - millPending(pid)
    el.textContent = `${prefix}${n}${suffix}`
}
