// スマホで場のスピリットの並べ方を決める。1段（64px）→2段（48px）→各段の中で重ねる→1段で横スクロール、の順に試す（2026-11-24 ユーザー決定）。
// 判定はここの1か所に集めた。CSS の個数指定（nth-child）だと、疲労して横向きのカードやブレイヴの絵の幅が入らず、9体目が切れていた
// 読み込み時に window を触ると、ブラウザの無い smoke（renderer を読み込む part）が落ちるので、使う時点で判定する
const mobile = { get matches(): boolean { return typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches } }
const ZONES = ["my-spirits", "opp-spirits"]
// 重ねても Lv・BP・コアを読ませる左側の幅。これより詰めないと決めて、それでも入らなければ横スクロール
const SLICE = 24

const px = (v: string): number => Number.parseFloat(v) || 0

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
        total += el.offsetWidth + left + right
    })
    return total
}

// 重ねるのは末尾以外の、90度回らない重疲労（180度）でないカード。重ねたあとも左 SLICE px は見せるので、重ねられる量はカードの見た目の幅 - SLICE。
// 疲労（90度）のカードの見た目の幅は、横に回った高さ（CSS が左右の余白に取った分を足した値）
function caps(row: HTMLElement[]): number[] {
    return row.map((el, i) => {
        if (i === row.length - 1 || !el.classList.contains("card") || el.classList.contains("heavy-rested")) return 0
        const rested = el.classList.contains("rested")
        return Math.max(0, el.offsetWidth - SLICE + (rested ? 2 * px(getComputedStyle(el).marginLeft) : 0))
    })
}

// 各カードの重なり幅（px）を返す。全部0なら重ね不要。ok=false は、重ねられる限り重ねても入らない（そのときの値は最大の重なり）
function fit(row: HTMLElement[], inner: number, gap: number): { ovs: number[]; ok: boolean } {
    const cap = caps(row)
    const need = rowWidth(row, gap) - inner
    if (need <= 0) return { ovs: cap.map(() => 0), ok: true }
    // 全カードに同じ幅で重ね、上限のあるカード（左右に余白のない正位置のカード）はそこで止める。合計が足りる最小の幅を探す
    for (let u = 1; u <= Math.max(0, ...cap); u++) {
        if (cap.reduce((sum, c) => sum + Math.min(u, c), 0) >= need) return { ovs: cap.map((c) => Math.min(u, c)), ok: true }
    }
    return { ovs: cap, ok: false }
}

function applyOverlap(row: HTMLElement[], ovs: number[]): void {
    row.forEach((el, i) => {
        const ov = ovs[i] ?? 0
        if (ov <= 0) return
        el.style.setProperty("--ov", `${ov}px`)
        el.classList.add("fanned")
    })
}

function clear(zone: HTMLElement): void {
    zone.querySelectorAll(":scope > .sp-break").forEach((el) => el.remove())
    zone.querySelectorAll<HTMLElement>(":scope > .fanned").forEach((el) => {
        el.classList.remove("fanned")
        el.style.removeProperty("--ov")
    })
    delete zone.dataset.rows
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

export function layoutSpirits(): void {
    sizeWatch?.disconnect()
    for (const id of ZONES) {
        const zone = document.getElementById(id)
        if (!zone) continue
        clear(zone)
        const items = [...zone.children] as HTMLElement[]
        if (mobile.matches) items.forEach((el) => sizeWatch?.observe(el))
        if (!mobile.matches || items.length === 0) continue

        const cs = getComputedStyle(zone)
        const inner = zone.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight)
        const gap = px(cs.columnGap)

        zone.dataset.rows = "1"
        if (fit(items, inner, gap).ovs.every((v) => v === 0)) continue

        // 2段の配分は個数で均等にする（上の段が多い側）。幅での均等化はしない。相手側は CSS で段の順を逆にしてあり、先頭の段が下になる
        if (items.length >= 2) {
            zone.dataset.rows = "2"
            const br = document.createElement("div")
            br.className = "sp-break"
            const half = Math.ceil(items.length / 2)
            zone.insertBefore(br, items[half] ?? null)
            const rows = [items.slice(0, half), items.slice(half)]
            const fits = rows.map((r) => fit(r, inner, gap))
            if (fits.every((f) => f.ok)) {
                rows.forEach((r, i) => applyOverlap(r, fits[i]?.ovs ?? []))
                // 測った幅と実際がずれても3段目に折り返さないための確認（段は flex の折り返しで分けているので、ずれると消える）。ずれたら横スクロールにする
                const tops = new Set(items.map((el) => el.offsetTop))
                if (tops.size <= 2 && zone.scrollWidth <= zone.clientWidth + 1) continue
            }
            clear(zone)
        }

        // 2段でも入らないときは1段で、重ねきって横にスクロールする
        zone.dataset.rows = "scroll"
        applyOverlap(items, fit(items, inner, gap).ovs)
    }
}

export function installSpiritLayout(): void {
    window.addEventListener("resize", layoutSpirits)
}
