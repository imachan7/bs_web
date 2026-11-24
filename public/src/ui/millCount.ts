// デッキ破棄（GameEvent mill）の枚数を、1枚ずつ数えて見せる。盤面は破棄の後の枚数で届くので、
// まだ数えていない枚数を持っておき、デッキには足し・トラッシュからは引いて出す。
// 数える間は、印（data-mill-deck／data-mill-trash／data-mill-box）の付いた要素の文字とクラスだけを書き換え、盤面は描き直さない
import type { PlayerId } from "../../../server/src/type"

const pending: Record<PlayerId, number> = { p1: 0, p2: 0 }
let timer: ReturnType<typeof setTimeout> | null = null
let stepMs = 100

// まだ数えていない枚数（描画はデッキに足し、トラッシュから引く）
export function millPending(pid: PlayerId): number {
    return pending[pid]
}

// 何枚でも合わせて1秒ほどで数え終わるようにする（1枚ずつの間は 60〜150ms）
export function startMillCount(pid: PlayerId, count: number): void {
    pending[pid] += count
    stepMs = Math.max(60, Math.min(150, 1000 / (pending.p1 + pending.p2)))
    if (timer === null) timer = setTimeout(tick, stepMs)
}

function tick(): void {
    timer = null
    for (const pid of ["p1", "p2"] as PlayerId[]) if (pending[pid] > 0) pending[pid]--
    refreshMillTexts()
    if (pending.p1 + pending.p2 > 0) timer = setTimeout(tick, stepMs)
}

// 描画した直後にも呼ぶ（数えている途中で描き直されたとき、光らせるクラスを付け直すため）
export function refreshMillTexts(): void {
    for (const el of document.querySelectorAll<HTMLElement>("[data-mill-deck], [data-mill-trash]")) {
        const pid = (el.dataset.millDeck ?? el.dataset.millTrash) as PlayerId
        const base = Number(el.dataset.base)
        const n = el.dataset.millDeck !== undefined ? base + pending[pid] : base - pending[pid]
        el.textContent = `${el.dataset.prefix ?? ""}${n}${el.dataset.suffix ?? ""}`
    }
    for (const el of document.querySelectorAll<HTMLElement>("[data-mill-box]")) {
        el.classList.toggle("milling", pending[el.dataset.millBox as PlayerId] > 0)
    }
}

// 数える対象の文字の要素に印を付ける。base は破棄の後の（本当の）枚数
export function markMillCount(el: HTMLElement, kind: "deck" | "trash", pid: PlayerId, base: number, prefix: string, suffix: string): void {
    el.dataset[kind === "deck" ? "millDeck" : "millTrash"] = pid
    el.dataset.base = String(base)
    el.dataset.prefix = prefix
    el.dataset.suffix = suffix
    const n = kind === "deck" ? base + pending[pid] : base - pending[pid]
    el.textContent = `${prefix}${n}${suffix}`
}
