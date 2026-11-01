// カード画像の URL と、カード要素へ画像を重ねる処理（対戦画面とデッキビルダーで共用）
// 画像があるのは刷新後のカード（cardId が公式表記の 26RDB01-001 など）だけ。
// 旧カードの BS01-001 は別のカードなので、画像に対応させない（名前・効果と食い違うため）。
// 画像が無いカードは <img> の onerror で外し、従来のテキスト表示にフォールバックする
export function cardImageUrl(cardId: string, size: "md" | "sm" | "xs" = "md"): string | null {
    if (!cardId.startsWith("26R") && !secretArtOn()) return null
    return `/imgs/cards/${size}/${cardSetDir(cardId)}/${cardId}.webp`
}

// 画像の置き場の弾フォルダ。プロモ（P001・PX01・X014）は番号に「-」が無いので英字の部分で分ける。
// scripts/download-card-images.ts と同じ決め方
export function cardSetDir(cardId: string): string {
    const dash = cardId.indexOf("-")
    return dash >= 0 ? cardId.slice(0, dash) : cardId.replace(/\d+$/, "")
}

// 旧カードの画像は隠し要素（2026-11-02 ユーザー要望）。どこかの入力欄に合言葉を打つと、その端末でだけ出す／もう一度で消す。
// 鍵ではない（画像の URL を知っていれば誰でも開ける）。検索結果やふだんの画面に出さないためだけ
// 読点・感嘆符・空白は無視し、原作の表記「界放」でも通す
const isSecretPhrase = (text: string): boolean => text.replace(/[、。,.!！\s]/g, "").replace("界放", "開放") === "ゲートオープン開放"
const SECRET_KEY = "bs.secretCardArt"

function secretArtOn(): boolean {
    try {
        return localStorage.getItem(SECRET_KEY) === "1"
    } catch {
        return false
    }
}

export function installSecretCardArt(notify: (message: string) => void): void {
    document.addEventListener("input", (e) => {
        const el = e.target
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
        if (!isSecretPhrase(el.value)) return
        const on = !secretArtOn()
        try {
            if (on) localStorage.setItem(SECRET_KEY, "1")
            else localStorage.removeItem(SECRET_KEY)
        } catch {
            return
        }
        el.value = ""
        artMissing.clear()
        notify(on ? "ゲートオープン開放！カードの画像を表示します" : "カードの画像を表示しないようにしました")
    })
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
    // デッキ構築の一覧は全カードを一度に描くので、画面に近づいたものだけ読む（ブラウザ標準の遅延読み込み）
    art.loading = "lazy"
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
