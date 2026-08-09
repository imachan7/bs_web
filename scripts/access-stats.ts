// アクセス集計。本番（Azure）の docker ログを回収し、server/src/accessLog.ts が出した
// #ACCESS 行だけを拾って日別に数える。
//
// 使い方:
//   npx tsx scripts/access-stats.ts            … az でログを落としてから集計
//   npx tsx scripts/access-stats.ts <zipパス>  … 落とし済みの zip を集計（az を叩かない）
//
// **Azure の「Web サーバーのログ記録」は Linux プランでは機能しない**ため、
// アクセスログはアプリが stdout に出し、それが docker ログに残る設計になっている（accessLog.ts の冒頭参照）。
import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

const TAG = "#ACCESS"

function downloadLogs(): string {
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bs_web-logs-")), "logs.zip")
    console.log("Azure からログを取得しています…")
    execFileSync(
        "az",
        ["webapp", "log", "download", "-n", "bs-web", "-g", "bs-web-rg", "--log-file", dest],
        { stdio: ["ignore", "ignore", "inherit"] },
    )
    return dest
}

// zip の展開に unzip を使う（Node 標準に zip 展開が無く、この用途で依存を増やしたくない）
function extract(zipPath: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bs_web-logsx-"))
    execFileSync("unzip", ["-qo", zipPath, "-d", dir])
    return dir
}

interface Row {
    time: string
    kind: string
    visitor: string
    detail: string
}

function collectRows(dir: string): Row[] {
    const logDir = path.join(dir, "LogFiles")
    if (!fs.existsSync(logDir)) return []
    const rows: Row[] = []
    for (const name of fs.readdirSync(logDir)) {
        if (!name.endsWith("_docker.log")) continue
        for (const line of fs.readFileSync(path.join(logDir, name), "utf8").split("\n")) {
            const at = line.indexOf(TAG)
            if (at < 0) continue
            // docker ログは各行の先頭に自前のタイムスタンプを足すので、タグ以降だけを見る
            const [, time, kind, visitor, detail] = line.slice(at).split("\t")
            if (!time || !kind || !visitor) continue
            rows.push({ time, kind, visitor, detail: detail ?? "" })
        }
    }
    return rows
}

function main(): void {
    const arg = process.argv[2]
    const zipPath = arg ?? downloadLogs()
    const rows = collectRows(extract(zipPath))
    if (rows.length === 0) {
        console.log("#ACCESS 行が見つかりませんでした。")
        console.log("アクセスログを入れたバージョンがまだデプロイされていないか、ログが期限切れの可能性があります。")
        return
    }

    // 日別集計。visitor は日替わりソルト付きハッシュなので、日をまたいだ名寄せはできない（意図的）
    const byDay = new Map<string, { visitors: Set<string>; pages: number; api: number; joins: number }>()
    for (const row of rows) {
        const day = row.time.slice(0, 10)
        const cur = byDay.get(day) ?? { visitors: new Set<string>(), pages: 0, api: 0, joins: 0 }
        cur.visitors.add(row.visitor)
        if (row.kind === "page") cur.pages += 1
        else if (row.kind === "api") cur.api += 1
        else if (row.kind === "join") cur.joins += 1
        byDay.set(day, cur)
    }

    console.log("")
    console.log("日付        訪問者  ページ  API   対戦参加")
    console.log("----------  ------  ------  ----  --------")
    for (const day of [...byDay.keys()].sort()) {
        const s = byDay.get(day)!
        console.log(
            `${day}  ${String(s.visitors.size).padStart(6)}  ${String(s.pages).padStart(6)}  ` +
                `${String(s.api).padStart(4)}  ${String(s.joins).padStart(8)}`,
        )
    }

    // 人気ページ（どの画面が見られているか）
    const pageCount = new Map<string, number>()
    for (const row of rows) {
        if (row.kind !== "page") continue
        pageCount.set(row.detail, (pageCount.get(row.detail) ?? 0) + 1)
    }
    const top = [...pageCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    if (top.length > 0) {
        console.log("")
        console.log("よく見られたページ")
        for (const [pagePath, count] of top) console.log(`  ${String(count).padStart(5)}  ${pagePath}`)
    }
    console.log("")
    console.log(`集計対象: ${rows.length}行`)
}

main()
