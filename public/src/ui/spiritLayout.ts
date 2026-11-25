// スマホで場のスピリットの並べ方を決める。カードの大きさは固定で、1段→2段→…（欄の高さに入る段数まで）→各段の中で重ねる→1段で横スクロール、の順に試す（2026-11-24 ユーザー決定）。
// 判定はここの1か所に集めた。CSS の個数指定（nth-child）だと、疲労して横向きのカードやブレイヴの絵の幅が入らず、9体目が切れていた
// 読み込み時に window を触ると、ブラウザの無い smoke（renderer を読み込む part）が落ちるので、使う時点で判定する
const mobile = { get matches(): boolean { return typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches } }
const ZONES = ["my-spirits", "opp-spirits"]
// 重ねても Lv・BP・コアを読ませる左側の幅。これより詰めないと決めて、それでも入らなければ横スクロール
const SLICE = 24

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

// 重ねるのは末尾以外の、90度回らない重疲労（180度）でないカード。重ねたあとも左 SLICE px は見せるので、重ねられる量はカードの見た目の幅 - SLICE。
// 疲労（90度）のカードの見た目の幅は、横に回った高さ（CSS が左右の余白に取った分を足した値）
function caps(row: HTMLElement[]): number[] {
    return row.map((el, i) => {
        if (i === row.length - 1 || !el.classList.contains("card") || el.classList.contains("heavy-rested")) return 0
        const rested = el.classList.contains("rested")
        return Math.max(0, widthOf(el) - SLICE + (rested ? 2 * px(getComputedStyle(el).marginLeft) : 0))
    })
}

// 各カードの重なり幅（px）を返す。全部0なら重ね不要。ok=false は、重ねられる限り重ねても入らない（そのときの値は最大の重なり）
function fit(row: HTMLElement[], inner: number, gap: number): { ovs: number[]; ok: boolean } {
    const cap = caps(row)
    // ちょうど幅いっぱいに詰めると、重ねの幅の端数で折り返すことがあるので 2px 余らせる
    const need = rowWidth(row, gap) - (inner - 2)
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
        // カードの大きさは段数で変わらない（CSS の --card-w）ので、欄の高さに入る段数を先に出す。段の間は .sp-break の2px
        const cardH = Math.max(...items.map((el) => (el.classList.contains("card") ? el.offsetHeight : 0)), 1)
        const maxRows = Math.max(1, Math.floor((zone.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom) + 2) / (cardH + 2)))

        // 重ねずに入る最小の段数を探す。どの段数でも入らなければ、入る段数いっぱいで重ねる。配分は個数で均等（先頭の段が多い側）
        const split = (k: number): HTMLElement[][] => {
            const per = Math.ceil(items.length / k)
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
        for (let k = 1; k <= Math.min(maxRows, items.length) && !done; k++) {
            const rows = split(k)
            apply(rows)
            if (rows.every((r) => fit(r, inner, gap).ovs.every((v) => v === 0)) && settled(rows.length)) done = true
            else clear(zone)
        }
        if (done) continue
        const rows = split(Math.min(maxRows, items.length))
        apply(rows)
        const fits = rows.map((r) => fit(r, inner, gap))
        if (fits.every((f) => f.ok)) {
            rows.forEach((r, i) => applyOverlap(r, fits[i]?.ovs ?? []))
            if (settled(rows.length)) continue
        }
        clear(zone)

        // 入る段数まで重ねても入らないときは1段で、重ねきって横にスクロールする
        zone.dataset.rows = "scroll"
        applyOverlap(items, fit(items, inner, gap).ovs)
    }
}

export function installSpiritLayout(): void {
    window.addEventListener("resize", layoutSpirits)
}
