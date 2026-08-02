// カードマスターデータの読み込み口（サーバー・スクリプト専用）。
//
// **なぜ分かれているか**: 1ファイルの cards.json が 566KB / 3.2万行まで肥大化し、
// diff が読めない・部分編集のたびに全文を触る状態になっていたため、弾ごとに分割した
// （data/cards/BS01.json 〜）。読み手はここを通すこと。ファイルを直接 readFileSync しない。
//
// ⚠️ node:fs を使うので **クライアント（public/src）から import しないこと**。
//    ブラウザ側は server の `GET /api/cards` から結合済みの配列を受け取る。
//    （shared/ に置けないのも同じ理由。shared は esbuild でクライアントへバンドルされる）
import * as fs from "node:fs"
import * as path from "node:path"
import type { CardData } from "../server/src/type"

const CARDS_DIR = path.resolve(__dirname, "cards")

// 弾ごとのファイルをファイル名昇順（BS01→BS05）で結合して返す。
// **結合順は分割前の cards.json の並びと一致する**（デッキビルダーのプール表示順が
// この並びに依存しているため、順序を変えないこと）
export function loadAllCards(): CardData[] {
    const files = fs
        .readdirSync(CARDS_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
    const cards: CardData[] = []
    for (const file of files) {
        const arr = JSON.parse(
            fs.readFileSync(path.join(CARDS_DIR, file), "utf-8"),
        ) as CardData[]
        cards.push(...arr)
    }
    return cards
}

// 弾ごとに分けたまま返す（ファイル名 → カード配列）。
// データを書き戻すスクリプト（弾ファイルを個別に更新したい場合）が使う
export function loadCardsBySet(): Map<string, CardData[]> {
    const bySet = new Map<string, CardData[]>()
    const files = fs
        .readdirSync(CARDS_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
    for (const file of files) {
        const arr = JSON.parse(
            fs.readFileSync(path.join(CARDS_DIR, file), "utf-8"),
        ) as CardData[]
        bySet.set(file.replace(/\.json$/, ""), arr)
    }
    return bySet
}
