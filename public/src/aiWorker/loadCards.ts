// Worker 用の data/loadCards の差し替え（scripts/build-ai-worker.mjs が束ねるときに入れ替える）。
// エンジンは読み込まれた時点でカードを同期で要求するので、同期の XHR で取る（Worker の中なので画面は止まらない）
import type { CardData } from "../../../server/src/type"

export function loadAllCards(): CardData[] {
    const xhr = new XMLHttpRequest()
    // main.ts が Worker の URL に付けて渡した、版つきのカードデータの URL（無ければ版なし）。ビルド時の確認には location が無い
    const url = new URLSearchParams(self.location?.search ?? "").get("cards") ?? "/api/cards"
    xhr.open("GET", url, false)
    xhr.send()
    if (xhr.status !== 200) throw new Error(`カードデータを取得できませんでした（${xhr.status}）`)
    return JSON.parse(xhr.responseText) as CardData[]
}
