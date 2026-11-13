// Worker 用の data/loadCards の差し替え（scripts/build-ai-worker.mjs が束ねるときに入れ替える）。
// エンジンは読み込まれた時点でカードを同期で要求するので、同期の XHR で取る（Worker の中なので画面は止まらない）
import type { CardData } from "../../../server/src/type"

export function loadAllCards(): CardData[] {
    const xhr = new XMLHttpRequest()
    xhr.open("GET", "/api/cards", false)
    xhr.send()
    if (xhr.status !== 200) throw new Error(`カードデータを取得できませんでした（${xhr.status}）`)
    return JSON.parse(xhr.responseText) as CardData[]
}
