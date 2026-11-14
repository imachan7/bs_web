// サーバーが HTML に埋めた版つきの URL を引く（<meta name="asset" content="/api/cards?v=…">。server/src/assetVersions.ts）。
// 版つきの URL はブラウザが長期キャッシュする。開発時は版が付かないので、渡したパスがそのまま返る
export function assetUrl(path: string): string {
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="asset"]')) {
        if (meta.content.split("?")[0] === path) return meta.content
    }
    return path
}
