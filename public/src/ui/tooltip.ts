// カードにホバーしたときの効果ツールチップ
import { effectLineSegments } from "../effectText"
import { master, COLOR_SYMBOLS, escapeHtml } from "../renderer"
import { hoverArt } from "../cardArt"

// battle-mobile.css の #effect-tooltip の max-height で引いている値と同じ
const DOCK_RESERVE = 160

export let currentHoverCard: HTMLElement | null = null

// カードの絵を大きく出す（スマホの長押しと同じ表示）。下の欄の絵を押したとき（ui/cardDock.ts）にも使う
let showLarge: (card: HTMLElement) => void = () => {}
export function showCardLarge(card: HTMLElement): void {
    showLarge(card)
}
export function cardLargeShown(): boolean {
    const tip = document.getElementById("effect-tooltip")
    return tip !== null && !tip.classList.contains("hidden") && tip.classList.contains("with-art")
}

// 効果を出す対象。.tip-card は選択待ちのカードの選択肢・発生源の表示（2026-11-12 ユーザー要望）
const TIP_SELECTOR = ".card, .brave-combined, .log-card-name, .tip-card"

// 支払いモード中はホバーの効果ツールチップを出さない（2026-10-06 ユーザー要望。
// コスト支払いでフィールドをクリックするときにチラつくため）
let effectTooltipSuppressed = false
export function suppressEffectTooltip(on: boolean): void {
    effectTooltipSuppressed = on
}

/** ツールチップを非表示にし、ホバー追跡をリセットする */
export function hideEffectTooltip(): void {
    const tip = document.getElementById("effect-tooltip")
    if (tip) tip.classList.add("hidden")
    currentHoverCard = null
}

export function setupEffectTooltip(): void {
    const tip = document.createElement("div")
    tip.id = "effect-tooltip"
    tip.classList.add("hidden")
    document.body.appendChild(tip)

    // longPress：スマホの長押し。カードの絵を大きく出し、吹き出しを画面の真ん中に置く（2026-11-25 ユーザー要望）
    const showFor = (card: HTMLElement, longPress = false): void => {
        const cardId = card.dataset.cardId
        if (!cardId) return
        const m = master(cardId)
        
        tip.innerHTML = ""
        const art = hoverArt(cardId, longPress)
        tip.classList.toggle("with-art", art !== null)
        if (art) tip.appendChild(art)
        const titleArea = document.createElement("div")
        titleArea.style.display = "flex"
        titleArea.style.alignItems = "center"
        titleArea.style.gap = "8px"
        titleArea.style.marginBottom = "6px"
        titleArea.style.borderBottom = "1px solid #333"
        titleArea.style.paddingBottom = "4px"

        const title = document.createElement("div")
        title.className = "tooltip-name"
        title.textContent = m.name
        title.style.margin = "0"
        title.style.borderBottom = "none"
        title.style.paddingBottom = "0"
        titleArea.appendChild(title)
        tip.appendChild(titleArea)
        
        if (m.family && m.family.length > 0) {
            const fam = document.createElement("div")
            fam.className = "tooltip-family"
            fam.textContent = "系統: " + m.family.join(" / ")
            fam.style.fontSize = "11px"
            fam.style.color = "var(--text-muted)"
            fam.style.marginBottom = "6px"
            tip.appendChild(fam)
        }
        
        const costArea = document.createElement("div")
        costArea.style.display = "flex"
        costArea.style.gap = "8px"
        costArea.style.alignItems = "center"
        costArea.style.marginBottom = "8px"
        costArea.style.fontSize = "12px"
        
        const costEl = document.createElement("div")
        costEl.textContent = `コスト: ${m.cost}`
        costArea.appendChild(costEl)

        const redEl = document.createElement("div")
        redEl.style.display = "flex"
        redEl.style.alignItems = "center"
        redEl.style.gap = "2px"
        redEl.textContent = `軽減: `
        if (m.reduction.length === 0) {
            redEl.textContent += "なし"
        } else {
            m.reduction.forEach(r => {
                const icon = document.createElement("span")
                icon.className = `sym-icon bg-${r}`
                icon.dataset.colorLabel = r === "ultimate" ? "極" : COLOR_SYMBOLS[r] || ""
                redEl.appendChild(icon)
            })
        }
        costArea.appendChild(redEl)

        const symbolEl = document.createElement("div")
        symbolEl.style.display = "flex"
        symbolEl.style.alignItems = "center"
        symbolEl.style.gap = "2px"
        symbolEl.textContent = `シンボル: `
        if (m.symbol && m.symbol.length > 0) {
            m.symbol.forEach(symColor => {
                const icon = document.createElement("span")
                icon.className = `sym-icon bg-${symColor}`
                if (symColor === "ultimate") icon.dataset.colorLabel = "極"
                symbolEl.appendChild(icon)
            })
        } else {
            symbolEl.textContent += "なし"
        }
        costArea.appendChild(symbolEl)
        // EXシンボル（26系。《継召》でトラッシュから除外して召喚コストの軽減に使える）
        if (m.symbolEx === true) {
            const exEl = document.createElement("div")
            exEl.textContent = "EXシンボル"
            exEl.style.background = "#eab308"
            exEl.style.color = "#000"
            exEl.style.fontWeight = "700"
            exEl.style.fontSize = "10px"
            exEl.style.padding = "1px 6px"
            exEl.style.borderRadius = "8px"
            costArea.appendChild(exEl)
        }
        tip.appendChild(costArea)
        
        if (m.levels && m.levels.length > 0) {
            const lvArea = document.createElement("div")
            lvArea.style.marginBottom = "8px"
            lvArea.style.fontSize = "11px"
            lvArea.style.color = "#94a3b8"
            
            m.levels.forEach(lv => {
                const lvLine = document.createElement("div")
                let text = `Lv${lv.level} (維持コア${lv.cores})`
                if (m.type === "spirit" && lv.bp !== undefined) {
                    text += ` BP ${lv.bp}`
                }
                lvLine.textContent = text
                lvArea.appendChild(lvLine)
            })
            tip.appendChild(lvArea)
        }
        
        if (m.effect) {
            // 行頭が「Lv1」「Lv2」「Lv3」「フラッシュ」の行は強調表示する（innerHTMLのためエスケープ必須）
            const eff = document.createElement("div")
            eff.innerHTML = effectLineSegments(m.effect)
                .map((segments) => {
                    const line = segments.map((s) => s.text).join("")
                    const escaped = segments
                        .map((s) => (s.note ? `<span class="effect-note" title="補足：バースト効果の召喚・配置はコストを支払わない（カードには書かれていない）">${escapeHtml(s.text)}</span>` : escapeHtml(s.text)))
                        .join("")
                    const isHighlight = /^(Lv[123]|フラッシュ)/.test(line)
                    return `<div class="tooltip-effect-line${isHighlight ? " tooltip-effect-highlight" : ""}">${escaped}</div>`
                })
                .join("")
            tip.appendChild(eff)
        } else {
            const vanilla = document.createElement("div")
            vanilla.textContent = "（効果なし）"
            vanilla.style.fontStyle = "italic"
            vanilla.style.color = "var(--text-muted)"
            tip.appendChild(vanilla)
        }
        
        tip.style.maxHeight = ""
        tip.classList.remove("hidden")
        // 位置決め: カードの上に出し、画面上端にかかるならカードの下へ。左右は画面内へクランプ
        const rect = card.getBoundingClientRect()
        const tipRect = tip.getBoundingClientRect()
        let top = rect.top - tipRect.height - 8
        if (top < 4) top = rect.bottom + 8
        // スマホは画面の下端に押したカードの欄（#card-dock。高さ最大約140px）と操作ボタンが出る。タップでも mouseover が来て欄と同時に開くので、
        // 欄が開く前のこの時点で、欄の上端より上（下から DOCK_RESERVE px）に収まるようずらす。視線の移動が少ないようカードの近くに置く（2026-11-24 ユーザー）
        const mobile = window.matchMedia("(max-width: 768px)").matches
        tip.classList.toggle("touch-art", mobile && art !== null)
        if (mobile && art !== null) {
            // 絵を出すと高くなりカードの近くに置けないので、画面の真ん中に置く。入らなければ中を指でスクロールする
            const h = Math.min(tipRect.height, window.innerHeight - 16)
            tip.style.maxHeight = `${h}px`
            top = Math.max(8, (window.innerHeight - h) / 2)
        } else if (mobile) {
            // カードを隠さないよう、上と下の空いている広い側に置き、入りきらなければその側の高さに縮めて中をスクロールさせる
            const limit = window.innerHeight - DOCK_RESERVE
            const roomAbove = Math.min(rect.top, limit) - 8 - 4
            const roomBelow = limit - rect.bottom - 8
            const h = Math.min(tipRect.height, Math.max(roomAbove, roomBelow))
            tip.style.maxHeight = `${Math.max(80, h)}px`
            top = roomAbove >= tipRect.height || roomAbove >= roomBelow ? Math.min(rect.top, limit) - 8 - h : rect.bottom + 8
            top = Math.max(4, top)
        }
        let left = tip.classList.contains("touch-art") ? (window.innerWidth - tipRect.width) / 2 : rect.left + rect.width / 2 - tipRect.width / 2
        left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4))
        tip.style.top = `${top}px`
        tip.style.left = `${left}px`
    }

    showLarge = (card) => showFor(card, true)

    // PC: ホバーで表示・カードから離れたら消す
    document.addEventListener("mouseover", (e) => {
        if (effectTooltipSuppressed) return // 支払いモード中は出さない
        const card = (e.target as HTMLElement).closest<HTMLElement>(TIP_SELECTOR)
        if (card && card !== currentHoverCard) {
            currentHoverCard = card
            showFor(card)
        }
    })
    document.addEventListener("mouseout", (e) => {
        // セレクタは合体ブレイヴを足した側（このブランチ）、関数名は hideEffectTooltip へ
        // 改名された側（origin/main の再描画時クリア）を採る。**どちらも必要**
        const from = (e.target as HTMLElement).closest(TIP_SELECTOR)
        const to = (e.relatedTarget as HTMLElement | null)?.closest?.(TIP_SELECTOR)
        if (from && from !== to) hideEffectTooltip()
    })

    // スマホ: 長押し（500ms）で表示。指を離しても表示は残し、次のタップで消す。
    // 長押し後のタップがカードの操作（アタック等）として誤発火しないよう、直後のクリックを1回握りつぶす
    let pressTimer = 0
    let longPressed = false
    document.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "touch") return
        // 吹き出しは中をスクロールできるので、触れただけでは閉じない（押すと閉じる）
        if (tip.contains(e.target as Node)) return
        const card = (e.target as HTMLElement).closest<HTMLElement>(TIP_SELECTOR)
        window.clearTimeout(pressTimer)
        if (!card) {
            hideEffectTooltip()
            return
        }
        pressTimer = window.setTimeout(() => {
            longPressed = true
            showFor(card, true)
        }, 500)
    })
    const cancelPress = (): void => window.clearTimeout(pressTimer)
    document.addEventListener("pointermove", cancelPress)
    document.addEventListener("pointercancel", cancelPress)
    document.addEventListener("pointerup", cancelPress)
    document.addEventListener(
        "click",
        (e) => {
            if (!longPressed) return
            longPressed = false
            e.preventDefault()
            e.stopPropagation()
        },
        true,
    )
    tip.addEventListener("click", () => hideEffectTooltip())
    // 長押しでOSのコンテキストメニュー（テキスト選択等）が出るのを抑止
    document.addEventListener("contextmenu", (e) => {
        if (longPressed) e.preventDefault()
    })
}
