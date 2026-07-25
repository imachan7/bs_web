// カードマスタ参照の注入。
// サーバーは fs でファイルから、クライアントは fetch した JSON から読み込むため、
// 共有ルール層（shared/）は「カードIDからカードデータを引く関数」だけを外から受け取る。
// これにより shared/ が node:fs に依存せず、esbuild でクライアントへバンドルできる。
import type { CardData } from "../server/src/type"

let lookup: ((cardId: string) => CardData) | null = null

// サーバーは GameState.getCard、クライアントは renderer.setCardDb 内の master を注入する
export function setCardLookup(fn: (cardId: string) => CardData): void {
    lookup = fn
}

export function card(cardId: string): CardData {
    if (!lookup) throw new Error("カードマスタが未設定です（setCardLookup を先に呼ぶこと）")
    return lookup(cardId)
}
