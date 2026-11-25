// 解決中の効果の表示（誰のどのカードのどの効果か）。盤面中央の帯に1件ずつ出し、解決が終わったら消す
import type { GameEvent, GameView } from "../../../server/src/type"
import { master } from "../renderer"
import { cardImageUrl } from "../cardArt"

type EffectEvent = Extract<GameEvent, { type: "effect" }>
const MAX_WAITING = 3 // 溜まりすぎたら古いものから飛ばす（2026-11-24 ユーザー指示）
// 自分の効果は短め、相手の効果は読めるよう長め（2026-11-24 ユーザー指示で延長）
const MINE_MS = 2500
const OPP_MS = 4000

// endAt：中身に出すログの終わり（state.log の行数）。効果の解決が終わった（選択の待ちが無いか、別の効果の待ちになった）状態が届いた時点の行数で固める。
// 固めないと、次の効果の通知が来ない限り、出している間に増えたログ（相手の次の行動・ターンの終わりなど）まで中身に積み重なった（2026-11-25 ユーザー指摘）
interface Item { ev: EffectEvent; endAt?: number }
let queue: Item[] = []
// マジック・バーストの発動の位置。前の効果の通知の中身はここで切る（相手のアタックで減ったライフの効果の通知に、続くバーストの発動と効果まで入っていた。2026-11-25 ユーザー指摘）。
// 選ぶ場面が続くと endAt が固まらないので、こちらで切る
let cuts: number[] = []
let current: (Item & { choiceSeen: boolean; timer: number | undefined }) | null = null
let lastView: GameView | null = null

// 見出し行から次の見出し行の手前までの本文。見出し行は Lv1･Lv2『…』／【合体時】Lv2『…』のように行頭が見出しの形
export function effectBodyText(cardId: string, heading: string | undefined): string {
    if (heading === undefined) return ""
    const lines = master(cardId).effect.split("\n")
    const start = lines.findIndex((l) => l.startsWith(heading))
    if (start === -1) return ""
    const rest = lines[start]!.slice(heading.length).trim()
    let end = start + 1
    while (end < lines.length && !/^(Lv\d(･Lv\d)*($|『|：|【)|(【[^】]*】)+($|Lv|『)|『|メイン：|フラッシュ：|【バースト)/.test(lines[end] ?? "")) end++
    return [rest, ...lines.slice(start + 1, end)].filter((l) => l !== "").join("\n")
}

// 中身は、この効果を出してから増えたログの行（発揮した内容）。効果文そのものは長くて何が起きたか分からなかった（2026-11-24 ユーザー）。
// 次の効果の通知が出た位置で切る（そこから先は次の効果の内容）。まだ何も起きていない（対象を選んでいる途中など）ときは、選ぶ判断に要る効果文を出す。
// ログは末尾60行しか届かないので、それより前に流れた行は出ない
function renderBody(): void {
    const box = document.getElementById("effect-notice")
    const b = box?.querySelector<HTMLElement>(".effect-notice-body")
    if (!box || !b || !current || !lastView) return
    const first = lastView.logTotal - lastView.log.length
    const cut = cuts.find((n) => n > current!.ev.logAt) ?? Infinity
    const end = Math.min(queue[0]?.ev.logAt ?? Infinity, cut, current.endAt ?? lastView.logTotal)
    const lines = lastView.log.slice(Math.max(0, current.ev.logAt - first), Math.max(0, end - first))
    box.classList.toggle("effect-result", lines.length > 0)
    b.textContent = lines.length > 0 ? lines.join("\n") : effectBodyText(current.ev.cardId, current.ev.heading)
    box.classList.toggle("truncated", b.scrollHeight > b.clientHeight + 1)
}

function dismiss(): void {
    if (current?.timer !== undefined) clearTimeout(current.timer)
    current = null
    document.getElementById("effect-notice")?.remove()
    document.querySelectorAll(".effect-source").forEach((e) => e.classList.remove("effect-source"))
    showNext()
}

function showNext(): void {
    const item = queue.shift()
    const host = document.getElementById("center-info-area")
    if (!item || !host || !lastView) return
    const ev = item.ev
    const mine = ev.pid === lastView.you
    const box = document.createElement("div")
    box.id = "effect-notice"
    box.className = mine ? "effect-mine" : "effect-opp"
    // 何のカードかを絵で見せる。PC は高画質（lg）、スマホは場と同じ md（読み込み済みのことが多く通信が増えない）。絵が無いカードは出さない
    const art = cardImageUrl(ev.cardId, matchMedia("(min-width: 900px)").matches ? "lg" : "md")
    if (art !== null) {
        const img = document.createElement("img")
        img.className = "effect-notice-art"
        img.alt = ""
        img.src = art
        img.onerror = () => img.remove()
        box.appendChild(img)
    }
    const text = document.createElement("div")
    text.className = "effect-notice-text"
    box.appendChild(text)
    const title = document.createElement("div")
    title.className = "effect-notice-title"
    title.textContent = `${mine ? "あなた" : "相手"}の ${ev.cardName}${ev.heading !== undefined ? ` ${ev.heading.slice(ev.heading.indexOf("『"))}` : "の効果"}${ev.trigger !== undefined ? ` ${ev.trigger}` : ""}`
    text.appendChild(title)
    const b = document.createElement("div")
    b.className = "effect-notice-body"
    text.appendChild(b)
    // 中身が途中で切れているときは、1回目のタップで全部を開き（開いている間は時間で消さない）、2回目で閉じる
    box.addEventListener("click", () => {
        if (box.classList.contains("truncated") && !box.classList.contains("expanded")) {
            box.classList.add("expanded")
            return
        }
        dismiss()
    })
    host.prepend(box)
    current = { ...item, choiceSeen: lastView.pendingChoice != null, timer: undefined }
    renderBody()
    const me = current
    // 選ぶ場面が続いている間は出したまま。無いままなら一定時間で消す
    me.timer = window.setTimeout(() => {
        if (current === me && !(lastView?.pendingChoice != null) && !box.classList.contains("expanded")) dismiss()
    }, mine ? MINE_MS : OPP_MS)
}

// 描画のたびに呼ぶ。新しい出来事を並べ、選び終わっていれば消し、発生源のカードを光らせ直す（描き直しで class が落ちるため）
export function syncEffectNotice(view: GameView, newEvents: GameEvent[]): void {
    lastView = view
    for (const ev of newEvents) {
        if (ev.type === "effect") queue.push({ ev })
        if (ev.type === "magic" || ev.type === "burst") cuts.push(ev.logAt)
    }
    // 出している通知より前の位置は要らない
    const from = current?.ev.logAt ?? queue[0]?.ev.logAt
    cuts = from === undefined ? [] : cuts.filter((n) => n > from)
    if (queue.length > MAX_WAITING) queue = queue.slice(-MAX_WAITING)
    // 選択の待ちが無い、または待ちがこの効果の発生源のものでない（バーストの発動確認など別の効果）なら、この効果の解決は終わっている
    const pc = view.pendingChoice
    const done = (item: Item): boolean => pc == null || (item.ev.instanceId !== undefined && pc.selfInstanceId !== item.ev.instanceId && pc.effectSource?.instanceId !== item.ev.instanceId)
    for (const item of queue) if (done(item)) item.endAt ??= view.logTotal
    if (current && done(current)) current.endAt ??= view.logTotal
    if (current) {
        if (view.pendingChoice != null) current.choiceSeen = true
        else if (current.choiceSeen) dismiss()
    }
    if (!current) showNext()
    else renderBody()
    const id = current?.ev.instanceId
    if (id !== undefined) document.querySelector(`.card[data-instance-id="${CSS.escape(id)}"]`)?.classList.add("effect-source")
}
