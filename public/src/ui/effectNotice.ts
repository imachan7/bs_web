// 解決中の効果の表示（誰のどのカードのどの効果か）。盤面中央の帯に1件ずつ出し、解決が終わったら消す
import type { GameEvent, GameView } from "../../../server/src/type"
import { master } from "../renderer"

type EffectEvent = Extract<GameEvent, { type: "effect" }>
const MAX_WAITING = 3 // 溜まりすぎたら古いものから飛ばす（2026-11-24 ユーザー指示）
const MINE_MS = 1500
const OPP_MS = 2500

let queue: EffectEvent[] = []
let current: { ev: EffectEvent; choiceSeen: boolean; timer: number | undefined } | null = null
let lastView: GameView | null = null

// 見出し行から次の見出し行の手前までの本文。見出し行は Lv1･Lv2『…』／【合体時】Lv2『…』のように行頭が見出しの形
export function effectBodyText(cardId: string, heading: string | undefined): string {
    if (heading === undefined) return ""
    const lines = master(cardId).effect.split("\n")
    const start = lines.findIndex((l) => l.startsWith(heading))
    if (start === -1) return ""
    const rest = lines[start]!.slice(heading.length).trim()
    let end = start + 1
    while (end < lines.length && !/^(Lv\d(･Lv\d)*($|『|：|【)|【[^】]*】($|Lv|『)|『|メイン：|フラッシュ：|【バースト)/.test(lines[end] ?? "")) end++
    return [rest, ...lines.slice(start + 1, end)].filter((l) => l !== "").join("\n")
}

function dismiss(): void {
    if (current?.timer !== undefined) clearTimeout(current.timer)
    current = null
    document.getElementById("effect-notice")?.remove()
    document.querySelectorAll(".effect-source").forEach((e) => e.classList.remove("effect-source"))
    showNext()
}

function showNext(): void {
    const ev = queue.shift()
    const host = document.getElementById("center-info-area")
    if (!ev || !host || !lastView) return
    const mine = ev.pid === lastView.you
    const box = document.createElement("div")
    box.id = "effect-notice"
    box.className = mine ? "effect-mine" : "effect-opp"
    const title = document.createElement("div")
    title.className = "effect-notice-title"
    title.textContent = `${mine ? "あなた" : "相手"}の ${ev.cardName}${ev.heading !== undefined ? ` ${ev.heading.slice(ev.heading.indexOf("『"))}` : "の効果"}`
    box.appendChild(title)
    const body = effectBodyText(ev.cardId, ev.heading)
    if (body !== "") {
        const b = document.createElement("div")
        b.className = "effect-notice-body"
        b.textContent = body
        box.appendChild(b)
    }
    box.addEventListener("click", dismiss)
    host.prepend(box)
    current = { ev, choiceSeen: lastView.pendingChoice != null, timer: undefined }
    const me = current
    // 選ぶ場面が続いている間は出したまま。無いままなら一定時間で消す
    me.timer = window.setTimeout(() => {
        if (current === me && !(lastView?.pendingChoice != null)) dismiss()
    }, mine ? MINE_MS : OPP_MS)
}

// 描画のたびに呼ぶ。新しい出来事を並べ、選び終わっていれば消し、発生源のカードを光らせ直す（描き直しで class が落ちるため）
export function syncEffectNotice(view: GameView, newEvents: GameEvent[]): void {
    lastView = view
    for (const ev of newEvents) if (ev.type === "effect") queue.push(ev)
    if (queue.length > MAX_WAITING) queue = queue.slice(-MAX_WAITING)
    if (current) {
        if (view.pendingChoice != null) current.choiceSeen = true
        else if (current.choiceSeen) dismiss()
    }
    if (!current) showNext()
    const id = current?.ev.instanceId
    if (id !== undefined) document.querySelector(`.card[data-instance-id="${CSS.escape(id)}"]`)?.classList.add("effect-source")
}
