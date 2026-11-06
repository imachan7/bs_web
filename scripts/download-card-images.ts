// 旧カード（data/cards の BS01〜・SD・プロモ）の画像を公式のカードリストから取ってくる。
//   npx tsx scripts/download-card-images.ts            （全カード。取得済みは飛ばす）
//   npx tsx scripts/download-card-images.ts BS19 P0    （cardId がこの文字で始まるものだけ）
// 保存先は public/imgs/cards/original/<弾>/<cardId>.webp（git 管理外）。続けて optimize-card-images.ts で md/sm/xs を作る。
// 公式のファイル名は data/cards の cardId と同じ（BS19-X01・P001・PX01・X014 も 2026-11-02 に確認）
import fs from "node:fs"
import path from "node:path"
import { setTimeout } from "node:timers/promises"
import { loadAllCards } from "../data/loadCards"
import { cardSetDir } from "../public/src/cardArt"

const BASE_URL = "https://www.battlespirits.com/images/cardlist/"
const OUTPUT_ROOT = "public/imgs/cards/original"
const prefixes = process.argv.slice(2)
// 公式に EX 番号の画像が無く、同じカードのプロモ番号にだけあるもの（2026-11-06 ユーザー指摘）
const OFFICIAL_ALIAS: Record<string, string> = { EX023: "P027", EX032: "P042" }

const ids = loadAllCards()
    .map((c) => c.cardId)
    .filter((id) => !id.startsWith("26R") && !id.startsWith("TOKEN") && (prefixes.length === 0 || prefixes.some((p) => id.startsWith(p))))

async function main(): Promise<void> {
    let fetched = 0
    const missing: string[] = []
    for (const [i, id] of ids.entries()) {
        const file = path.join(OUTPUT_ROOT, cardSetDir(id), `${id}.webp`)
        if (fs.existsSync(file)) continue
        let res = await fetch(`${BASE_URL}${OFFICIAL_ALIAS[id] ?? id}.webp`)
        // 公式は無い画像を 404 でなくトップページへの 302 で返す。
        // 絵違いの配布版があるカードは末尾に A（通常版）・B（配布版）が付く（BS01-014・X004）
        if (res.redirected) {
            await setTimeout(1500 + Math.random() * 1000)
            res = await fetch(`${BASE_URL}${id}A.webp`)
        }
        if (res.status === 404 || res.redirected || !res.headers.get("content-type")?.startsWith("image/")) {
            missing.push(id)
        } else if (!res.ok) {
            console.error(`[${i + 1}/${ids.length}] ${id}: HTTP ${res.status}。少し休んで続ける`)
            await setTimeout(5000)
            continue
        } else {
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
            fetched++
            if (fetched % 50 === 0) console.log(`[${i + 1}/${ids.length}] ${fetched}枚 取得`)
        }
        // 取得先への配慮：1.5〜2.5秒あける（縮めないこと）
        await setTimeout(1500 + Math.random() * 1000)
    }
    console.log(`完了：${fetched}枚を取得、公式に無かったもの ${missing.length}枚${missing.length > 0 ? `（${missing.join("・")}）` : ""}`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
