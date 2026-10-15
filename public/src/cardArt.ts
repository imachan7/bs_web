// カード画像の URL と、カード要素へ画像を重ねる処理（対戦画面とデッキビルダーで共用）
// 画像があるのは刷新後のカード（cardId が公式表記の 26RDB01-001 など）だけ。
// 旧カードの BS01-001 は別のカードなので、画像に対応させない（名前・効果と食い違うため）。
// 画像が無いカードは <img> の onerror で外し、従来のテキスト表示にフォールバックする
export function cardImageUrl(cardId: string, size: "md" | "sm" | "xs" = "md"): string | null {
    if (!cardId.startsWith("26R")) return null
    const set = cardId.slice(0, cardId.indexOf("-"))
    return `/imgs/cards/${size}/${set}/${cardId}.webp`
}

// 画像が読み込めたときだけ .has-art（縦長レイアウト）を付ける。
// 盤面は更新のたびに DOM を作り直すので、毎回「onload まで四角いテキスト表示 → 縦長に切り替わる」
// とカードが一瞬大きくなる。一度読めた画像は ID を覚えておき、作成時点で .has-art を付ける
const artLoaded = new Set<string>()
const artMissing = new Set<string>()

export function attachCardArt(el: HTMLElement, cardId: string, name: string): void {
    el.title = name
    const url = cardImageUrl(cardId)
    if (url === null || artMissing.has(cardId)) return
    const art = document.createElement("img")
    art.className = "card-art"
    art.alt = ""
    art.src = url
    if (artLoaded.has(cardId)) el.classList.add("has-art")
    art.onload = () => {
        artLoaded.add(cardId)
        el.classList.add("has-art")
    }
    art.onerror = () => {
        artMissing.add(cardId)
        artLoaded.delete(cardId)
        el.classList.remove("has-art")
        art.remove()
    }
    el.appendChild(art)
}
