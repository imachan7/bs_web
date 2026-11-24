// スマホで場のスピリットの並べ方を決める。1段（64px）→2段（48px）→各段の中で重ねる→1段で横スクロール、の順に試す（2026-11-24 ユーザー決定）。
// 判定はここの1か所に集めた。CSS の個数指定（nth-child）だと、疲労して横向きのカードやブレイヴの絵の幅が入らず、9体目が切れていた
const mobile = window.matchMedia("(max-width: 768px)")
const ZONES = ["my-spirits", "opp-spirits"]
// 重ねても Lv・BP・コアを読ませる左側の幅。これより詰めないと決めて、それでも入らなければ横スクロール
const SLICE = 24

const px = (v: string): number => Number.parseFloat(v) || 0
const movable = (el: HTMLElement): boolean => el.classList.contains("card") && !el.classList.contains("rested")

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

// 0 は重ね不要、null は重ねても入らない。重ねるのは疲労していないカード（末尾は重ねても後ろが無いので数えない）
function overlapFor(row: HTMLElement[], inner: number, gap: number, max: number): number | null {
    const need = rowWidth(row, gap) - inner
    if (need <= 0) return 0
    const gaps = row.slice(0, -1).filter(movable).length
    if (gaps === 0) return null
    const ov = Math.ceil(need / gaps)
    return ov <= max ? ov : null
}

function applyOverlap(row: HTMLElement[], ov: number): void {
    if (ov <= 0) return
    for (const el of row.filter(movable)) {
        el.style.setProperty("--ov", `${ov}px`)
        el.classList.add("fanned")
    }
}

export function layoutSpirits(): void {
    for (const id of ZONES) {
        const zone = document.getElementById(id)
        if (!zone) continue
        zone.querySelectorAll(":scope > .sp-break").forEach((el) => el.remove())
        zone.querySelectorAll<HTMLElement>(":scope > .fanned").forEach((el) => {
            el.classList.remove("fanned")
            el.style.removeProperty("--ov")
        })
        delete zone.dataset.rows
        const items = [...zone.children] as HTMLElement[]
        if (!mobile.matches || items.length === 0) continue

        const cs = getComputedStyle(zone)
        const inner = zone.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight)
        const gap = px(cs.columnGap)
        const cardW = (): number => zone.querySelector<HTMLElement>(":scope > .card")?.offsetWidth ?? 0

        zone.dataset.rows = "1"
        if (overlapFor(items, inner, gap, 0) === 0) continue

        // 2段の配分は個数で均等にする（上の段が多い側）。幅での均等化はしない。相手側は CSS で段の順を逆にしてあり、先頭の段が下になる
        const half = Math.ceil(items.length / 2)
        if (items.length >= 2) {
            zone.dataset.rows = "2"
            const br = document.createElement("div")
            br.className = "sp-break"
            zone.insertBefore(br, items[half] ?? null)
            const rows = [items.slice(0, half), items.slice(half)]
            const max = cardW() - SLICE
            const ovs = rows.map((r) => overlapFor(r, inner, gap, max))
            if (ovs.every((v) => v !== null)) {
                rows.forEach((r, i) => applyOverlap(r, ovs[i] ?? 0))
                continue
            }
            br.remove()
        }

        // 2段でも入らない（目安25体以上）ときは1段に戻し、重ねきって横にスクロールする
        zone.dataset.rows = "scroll"
        const max = cardW() - SLICE
        const need = rowWidth(items, gap) - inner
        const gaps = items.slice(0, -1).filter(movable).length
        applyOverlap(items, gaps > 0 ? Math.min(max, Math.ceil(need / gaps)) : 0)
    }
}

export function installSpiritLayout(): void {
    window.addEventListener("resize", layoutSpirits)
}
