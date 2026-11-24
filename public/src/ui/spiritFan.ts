// スマホで場のスピリットが行に入りきらないとき、左から少しずつ重ねる（手札を扇に広げる形）。重なり幅は CSS だけでは数と行の幅から決められないので、描いたあとに測る
const mobile = window.matchMedia("(max-width: 768px)")
const ZONES = ["my-spirits", "opp-spirits"]
// Lv・BP・コアを読ませる左側の幅。これより詰めないと決めて、それでも入らなければ今までの横スクロールに戻る
const SLICE = 24

export function fanSpirits(): void {
    for (const id of ZONES) {
        const zone = document.getElementById(id)
        if (!zone) continue
        zone.classList.remove("fan")
        zone.style.removeProperty("--ov")
        const cards = [...zone.querySelectorAll<HTMLElement>(":scope > .card")]
        const need = zone.scrollWidth - zone.clientWidth
        if (!mobile.matches || cards.length < 2 || need <= 0) continue
        // 疲労したカードは余白で場所を取るので重ねず、数えない
        const gaps = cards.filter((c) => !c.classList.contains("rested")).length
        const max = Math.max(0, (cards[0]?.offsetWidth ?? 0) - SLICE)
        zone.style.setProperty("--ov", `${Math.min(max, Math.ceil(need / gaps))}px`)
        zone.classList.add("fan")
    }
}

export function installSpiritFan(): void {
    window.addEventListener("resize", fanSpirits)
}
