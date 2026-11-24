// attachCardArt（画像の遅延読み込みと、読めなかったときのテキスト表示への切替）を use: で使えるようにする。
// 一覧は cardId をキーに each するので、タイルが別のカードに使い回されることはなく update は要らない
import { attachCardArt } from "../../cardArt"

export function cardArt(el: HTMLElement, p: { cardId: string; name: string; size: "lg" | "md" }) {
    attachCardArt(el, p.cardId, p.name, p.size)
}
