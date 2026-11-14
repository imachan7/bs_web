// 配信物の版（中身のハッシュ）。HTML の中の URL に ?v=<版> を付け、版つきで来た要求にだけ長期キャッシュを許す。
// 中身が変われば版が変わって別の URL になるので、デプロイのあとに古い JS やカードデータを掴まない。
// ファイル名は変えない（esbuild の出力名・開発時の参照・E2E をそのまま使うため、ハッシュ入りのファイル名にはしなかった）
import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"

export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable"

export function contentVersion(content: string | Buffer): string {
    return crypto.createHash("sha1").update(content).digest("hex").slice(0, 12)
}

// public/dist の JS と public/css の CSS を、URL → 版 の表にする
export function scanAssetVersions(publicDir: string): Map<string, string> {
    const versions = new Map<string, string>()
    for (const [dir, ext] of [["dist", ".js"], ["css", ".css"]] as const) {
        const abs = path.join(publicDir, dir)
        if (!fs.existsSync(abs)) continue
        for (const file of fs.readdirSync(abs)) {
            if (file.endsWith(ext)) versions.set(`/${dir}/${file}`, contentVersion(fs.readFileSync(path.join(abs, file))))
        }
    }
    return versions
}

// 属性値がちょうどその URL のもの（src="/dist/main.js"・content="/api/cards" など）に版を付ける
export function versionHtml(html: string, versions: ReadonlyMap<string, string>): string {
    for (const [url, version] of versions) html = html.replaceAll(`"${url}"`, `"${url}?v=${version}"`)
    return html
}

// 古い版を付けた要求（デプロイ前の HTML から来たもの）には長期キャッシュを許さない。許すと、古い URL に新しい中身が残り続ける
export function isCurrentVersion(versions: ReadonlyMap<string, string>, urlPath: string, v: unknown): boolean {
    return typeof v === "string" && versions.get(urlPath) === v
}
