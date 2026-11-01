// public/imgs/cards/original/<弾>/*.webp から表示用の md/sm/xs を作る（手元の cwebp を使う。brew install webp）。
// 作成済みで元画像より新しいものは飛ばす
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const INPUT = "public/imgs/cards/original"
const OUTPUT = "public/imgs/cards"
const SIZES = [
    { dir: "md", width: 144 },
    { dir: "sm", width: 116 },
    { dir: "xs", width: 96 },
]

const files = (fs.readdirSync(INPUT, { recursive: true }) as string[]).filter((f) => f.endsWith(".webp"))
let made = 0
for (const file of files) {
    const src = path.join(INPUT, file)
    for (const { dir, width } of SIZES) {
        const out = path.join(OUTPUT, dir, file)
        if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) continue
        fs.mkdirSync(path.dirname(out), { recursive: true })
        execFileSync("cwebp", ["-quiet", "-resize", String(width), "0", "-q", "80", src, "-o", out])
        made++
    }
}
console.log(`${files.length}枚の元画像から ${made}個を作りました`)
