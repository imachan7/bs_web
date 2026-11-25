// スマホで場のスピリットの並べ方を決める。カードの大きさは固定で、1段→2段→…（欄の高さに入る段数まで）の順に試し、
// それでも入らなければ段を増やして欄の中を縦にスクロールする（2026-11-25 ユーザー決定。以前は各段の中で重ね、最後は1段の横スクロールにしていた）。
// 判定はここの1か所に集めた。CSS の個数指定（nth-child）だと、疲労して横向きのカードやブレイヴの絵の幅が入らず、9体目が切れていた
// 読み込み時に window を触ると、ブラウザの無い smoke（renderer を読み込む part）が落ちるので、使う時点で判定する
const mobile = { get matches(): boolean { return typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches } }
const ZONES = ["my-spirits", "opp-spirits"]
// 1段に並べる最大の数。詰めて5体並べると隙間がなく見づらかった（2026-11-25 ユーザー判断）
const PER_ROW = 4

const px = (v: string): number => Number.parseFloat(v) || 0
// 幅は小数のまま測る（offsetWidth は整数に丸め、66.28px のカードを3枚並べると1px近く足りずに折り返した）。回転（疲労）の影響を受けない CSS の幅を使う
const widthOf = (el: HTMLElement): number => px(getComputedStyle(el).width) || el.offsetWidth

// 行に要る幅を、各要素の幅・余白・間隔の合計で出す。並べて測ると入りきらずに折り返した行の幅が分からないため。
// 合体のブレイヴの絵は、相手側（180度回転）は先頭の左、自分側は末尾の右へ余白より大きくはみ出すので、その分を余白の代わりに取る。
// 疲労したスピリットにブレイヴが合体しているときの、回転後のはみ出しは測れていない（余白は回転後の幅に合わせてある）
function rowWidth(row: HTMLElement[], gap: number): number {
    let total = gap * (row.length - 1)
    row.forEach((el, i) => {
        const cs = getComputedStyle(el)
        let left = px(cs.marginLeft)
        let right = px(cs.marginRight)
        const box = el.querySelector<HTMLElement>(":scope > .brave-combined-box")
        if (box && (i === 0 || i === row.length - 1)) {
            const a = el.getBoundingClientRect()
            const b = box.getBoundingClientRect()
            if (i === 0) left = Math.max(left, a.left - b.left)
            if (i === row.length - 1) right = Math.max(right, b.right - a.right)
        }
        total += widthOf(el) + left + right
    })
    return total
}

function clear(zone: HTMLElement): void {
    zone.querySelectorAll(":scope > .sp-break").forEach((el) => el.remove())
    delete zone.dataset.rows
    delete zone.dataset.more
}

// 縦スクロールのとき、見えていないカードの数を data-more に入れる（CSS が「▼ あとN体」を出す）。相手側は上に隠れる
function markHidden(zone: HTMLElement): void {
    // 段に収まったあとに、前の縦スクロールの scroll が遅れて届くことがある
    if (zone.dataset.rows !== "vscroll") {
        delete zone.dataset.more
        return
    }
    const top = zone.scrollTop
    const bottom = top + zone.clientHeight
    const hidden = [...zone.children].filter((el) => {
        const e = el as HTMLElement
        return e.offsetTop + e.offsetHeight / 2 < top || e.offsetTop + e.offsetHeight / 2 > bottom
    }).length
    if (hidden > 0) zone.dataset.more = String(hidden)
    else delete zone.dataset.more
}

// 描画の直後はカードの絵がまだ読み込まれておらず、読み込まれて .has-art が付くとカードの大きさが変わる。
// その時点で並べ直さないと、小さいときの幅で決めた段の中で折り返して3段目が欄の外に消える（2026-11-24 に実画面で確認）。
// カードの大きさが変わったら次のフレームで1回だけ並べ直す（重ねは余白を変えるだけで大きさは変えないので、ここから並べ直しが繰り返されることはない）
// observe() した直後にも1回呼ばれるので、前に測った大きさと違うときだけ並べ直す（そうしないと毎フレーム並べ直し続ける）
let pending = false
const lastSize = new WeakMap<Element, string>()
const sizeWatch = typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => {
        let changed = false
        for (const e of entries) {
            const size = `${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`
            if (lastSize.get(e.target) !== size) changed = true
            lastSize.set(e.target, size)
        }
        if (!changed || pending) return
        pending = true
        requestAnimationFrame(() => {
            pending = false
            layoutSpirits()
        })
    })
    : null

// 描き直してもスクロールの位置は保つ（毎回相手側を一番下へ戻すと、手で見ていた位置やアタックしているスピリットの位置から戻された。2026-11-25）。
// 場を描き直す（中身を空にする）とブラウザが位置を 0 に戻すので、描き直す前に saveSpiritScroll で覚えておく
const savedScroll = new Map<string, { scroll: boolean; top: number }>()
export function saveSpiritScroll(): void {
    for (const id of ZONES) {
        const zone = document.getElementById(id)
        if (zone) savedScroll.set(id, { scroll: zone.dataset.rows === "vscroll", top: zone.scrollTop })
    }
}

export function layoutSpirits(): void {
    sizeWatch?.disconnect()
    for (const id of ZONES) {
        const zone = document.getElementById(id)
        if (!zone) continue
        // 描画のあと以外（画面の回転・絵の読み込み後の並べ直し）は、今の位置を使う
        const kept = savedScroll.get(id) ?? { scroll: zone.dataset.rows === "vscroll", top: zone.scrollTop }
        savedScroll.delete(id)
        clear(zone)
        const items = [...zone.children] as HTMLElement[]
        if (mobile.matches) items.forEach((el) => sizeWatch?.observe(el))
        if (!mobile.matches || items.length === 0) continue

        const cs = getComputedStyle(zone)
        const inner = zone.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight)
        const gap = px(cs.columnGap)
        // カードの大きさは段数で変わらない（CSS の --card-w）ので、欄の高さに入る段数を先に出す。段の間は .sp-break の2px
        const cardH = Math.max(...items.map((el) => (el.classList.contains("card") ? el.offsetHeight : 0)), 1)
        const maxRows = Math.max(1, Math.floor((zone.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom) + 2) / (cardH + 2)))

        // 入る最小の段数を探す。配分は個数で均等（先頭の段が多い側）。1段は PER_ROW 体まで
        const split = (k: number): HTMLElement[][] => {
            const per = Math.min(PER_ROW, Math.ceil(items.length / k))
            return Array.from({ length: k }, (_, r) => items.slice(r * per, (r + 1) * per)).filter((r) => r.length > 0)
        }
        const apply = (rows: HTMLElement[][]): void => {
            zone.dataset.rows = String(rows.length)
            rows.slice(1).forEach((r) => {
                const br = document.createElement("div")
                br.className = "sp-break"
                zone.insertBefore(br, r[0] ?? null)
            })
        }
        // 測った幅と実際がずれて段の中で折り返すと、欄に入らない段ができて消える。ずれたらやめる
        const settled = (k: number): boolean => new Set(items.map((el) => el.offsetTop)).size <= k && zone.scrollWidth <= zone.clientWidth + 1
        let done = false
        for (let k = Math.ceil(items.length / PER_ROW); k <= Math.min(maxRows, items.length) && !done; k++) {
            const rows = split(k)
            apply(rows)
            // 幅は端数で数px ずれることがあるので 2px 余らせる
            if (rows.every((r) => rowWidth(r, gap) <= inner - 2) && settled(rows.length)) done = true
            else clear(zone)
        }
        if (done) continue
        // 入る段数で入らなければ、PER_ROW 体ごとに段を分け（幅が足りなければその中で折り返す）、欄の中を縦にスクロールする。相手側は中央の帯に近い（下の）段から見せる
        apply(split(Math.ceil(items.length / PER_ROW)))
        zone.dataset.rows = "vscroll"
        if (kept.scroll) zone.scrollTop = kept.top
        else if (id === "opp-spirits") zone.scrollTop = zone.scrollHeight
        markHidden(zone)
    }
}

// アタック・ブロックしているスピリットが縦スクロールの欄の見えない位置にいたら、見える位置までスクロールする
// （スピリットが多いとき、アタックしているのにスクロールしないと見えなかった。2026-11-25 ユーザー指摘）。
// 動かすのは、アタック・ブロックするスピリットが替わったときの1回だけ。そのあとは手でスクロールして別のカードを見られる
const shownBattler = new Map<string, string>()
export function revealBattlingSpirits(ids: (string | null | undefined)[]): void {
    for (const zoneId of ZONES) {
        const zone = document.getElementById(zoneId)
        if (!zone) continue
        const card = ids.map((id) => (id == null ? null : zone.querySelector<HTMLElement>(`:scope > .card[data-instance-id="${CSS.escape(id)}"]`))).find((c) => c != null)
        const id = card?.dataset.instanceId
        if (id === undefined || zone.dataset.rows !== "vscroll") {
            if (id === undefined) shownBattler.delete(zoneId)
            continue
        }
        if (shownBattler.get(zoneId) === id) continue
        shownBattler.set(zoneId, id)
        const z = zone.getBoundingClientRect()
        const r = card!.getBoundingClientRect()
        if (r.top >= z.top && r.bottom <= z.bottom) continue
        // 欄の真ん中に来るようにする
        zone.scrollTop += r.top + r.height / 2 - (z.top + z.height / 2)
        markHidden(zone)
    }
}

export function installSpiritLayout(): void {
    window.addEventListener("resize", layoutSpirits)
    for (const id of ZONES) document.getElementById(id)?.addEventListener("scroll", (e) => markHidden(e.currentTarget as HTMLElement), { passive: true })
}
