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

// 段の端に置いたときに、カードの左右に要る幅（余白と、枠の外へのはみ出しの大きいほう）。
// 合体のブレイヴの絵とコストの丸は、相手側（180度回転）や疲労（横向き）で枠の外へはみ出す（SE で相手の疲労のカードの丸が欄の左端で切れた。2026-11-25）。
// はみ出しは回転前の枠の端から測る。疲労は中心で90度回すので、画面上の外枠は余白の外端と同じになり、そこから比べると余白の分だけ足りなかった
function edgeOf(el: HTMLElement): { left: number; right: number } {
    const cs = getComputedStyle(el)
    let left = px(cs.marginLeft)
    let right = px(cs.marginRight)
    const a = el.getBoundingClientRect()
    const boxLeft = a.left + a.width / 2 - widthOf(el) / 2
    const boxRight = boxLeft + widthOf(el)
    for (const part of el.querySelectorAll<HTMLElement>(":scope > .brave-combined-box, :scope > .cost-badge")) {
        const b = part.getBoundingClientRect()
        left = Math.max(left, boxLeft - b.left)
        right = Math.max(right, b.right - boxRight)
    }
    return { left, right }
}

// 行に要る幅を、各要素の幅・余白・間隔の合計で出す。並べて測ると入りきらずに折り返した行の幅が分からないため。
// 段の端のカードは、余白の代わりに edgeOf の幅を取る（段の中のはみ出しは隣との間隔に重なるだけ）
function rowWidth(row: HTMLElement[], gap: number): number {
    let total = gap * (row.length - 1)
    row.forEach((el, i) => {
        const cs = getComputedStyle(el)
        const edge = i === 0 || i === row.length - 1 ? edgeOf(el) : null
        const left = i === 0 ? edge!.left : px(cs.marginLeft)
        const right = i === row.length - 1 ? edge!.right : px(cs.marginRight)
        total += widthOf(el) + left + right
    })
    return total
}

function clear(zone: HTMLElement): void {
    zone.querySelectorAll(":scope > .sp-break").forEach((el) => el.remove())
    for (const el of zone.children) {
        const e = el as HTMLElement
        e.style.order = ""
        e.style.marginLeft = ""
        e.style.marginRight = ""
    }
    delete zone.dataset.rows
    delete zone.dataset.above
    delete zone.dataset.below
}

// 縦スクロールのとき、上と下に隠れているカードの数を data-above・data-below に入れる（CSS が上端に「▲ あとN体」、下端に「▼ あとN体」を出す）。
// 以前は合わせた1つの数を、自分側は▼・相手側は▲で出していて、下へスクロールすると上に流れたカードまで▼の数に入った（2026-11-25 ユーザー指摘）。
// 完全に見えないカードだけ数える（真ん中で判定すると、ほぼ見えているカードまで入った）
function markHidden(zone: HTMLElement): void {
    // 段に収まったあとに、前の縦スクロールの scroll が遅れて届くことがある
    if (zone.dataset.rows !== "vscroll") {
        delete zone.dataset.above
        delete zone.dataset.below
        return
    }
    const z = zone.getBoundingClientRect()
    const cards = [...zone.querySelectorAll<HTMLElement>(":scope > .card")].map((e) => e.getBoundingClientRect())
    const set = (key: "above" | "below", n: number): void => {
        if (n > 0) zone.dataset[key] = String(n)
        else delete zone.dataset[key]
    }
    set("above", cards.filter((r) => r.bottom <= z.top + 1).length)
    set("below", cards.filter((r) => r.top >= z.bottom - 1).length)
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

        // 段への分け方：前から順に、幅（合体のブレイヴ・疲労の横向きも含む）が入る一番上の段へ入れる。1段は per 体まで。
        // 個数で前から切ると、幅の広い合体スピリットの並び方しだいで段の中で折り返し、「合体＋スピリット／スピリット／合体＋スピリット」のような段ができた（2026-11-25 ユーザー指摘）。
        // 段の中は元の順。段は CSS の order で並べ替える（DOM の順は描画のまま）。幅は端数で数px ずれることがあるので 2px 余らせる
        const pack = (per: number): HTMLElement[][] => {
            const rows: HTMLElement[][] = []
            for (const el of items) {
                const row = rows.find((r) => r.length < per && rowWidth([...r, el], gap) <= inner - 2)
                if (row) row.push(el)
                else rows.push([el])
            }
            return rows
        }
        const apply = (rows: HTMLElement[][]): void => {
            zone.dataset.rows = String(rows.length)
            rows.forEach((r, i) => {
                r.forEach((el) => { el.style.order = String(i * 2) })
                // 段は左詰めなので、余った幅は右に回る。端のカードのはみ出しが余白より大きければ、その分の余白を足して欄の中に収める
                const first = r[0]!
                const last = r[r.length - 1]!
                const fe = edgeOf(first)
                const le = edgeOf(last)
                if (fe.left > px(getComputedStyle(first).marginLeft)) first.style.marginLeft = `${fe.left}px`
                if (le.right > px(getComputedStyle(last).marginRight)) last.style.marginRight = `${le.right}px`
                if (i === 0) return
                const br = document.createElement("div")
                br.className = "sp-break"
                br.style.order = String(i * 2 - 1)
                zone.appendChild(br)
            })
        }
        // 測った幅と実際がずれて段の中で折り返すと、欄に入らない段ができて消える。ずれたらやめる
        const settled = (k: number): boolean => new Set(items.map((el) => el.offsetTop)).size <= k && zone.scrollWidth <= zone.clientWidth + 1
        let done = false
        // 入る最小の段数を探す。段数 k に対して1段を ceil(n/k) 体までにして、段ごとの数をそろえる（先頭の段が多い側）
        for (let k = Math.ceil(items.length / PER_ROW); k <= Math.min(maxRows, items.length) && !done; k++) {
            const rows = pack(Math.min(PER_ROW, Math.ceil(items.length / k)))
            if (rows.length > k) continue
            apply(rows)
            if (settled(rows.length)) done = true
            else clear(zone)
        }
        if (done) continue
        // 入る段数で入らなければ、1段 PER_ROW 体までで幅に合わせて段を分け、欄の中を縦にスクロールする。相手側は中央の帯に近い（下の）段から見せる
        apply(pack(PER_ROW))
        zone.dataset.rows = "vscroll"
        if (id === "opp-spirits") zone.scrollTop = zone.scrollHeight
        markHidden(zone)
    }
}

export function installSpiritLayout(): void {
    window.addEventListener("resize", layoutSpirits)
    for (const id of ZONES) document.getElementById(id)?.addEventListener("scroll", (e) => markHidden(e.currentTarget as HTMLElement), { passive: true })
}
