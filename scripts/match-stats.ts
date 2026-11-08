// ランダムマッチ計測の集計。server/src/matchLog.ts が stdout に出した `#MATCH` 行だけを
// 拾って、日別の成立率・待機時間・離脱理由を出す（統合ロビー設計メモ Phase 0）。
//
// 使い方:
//   npx tsx scripts/match-stats.ts <ログファイル...>   … ログファイル（複数可）を集計
//   cat server.log | npx tsx scripts/match-stats.ts    … 標準入力からも読める
//
// ログの入手先はホスティングに依存する（本番 Cloud Run なら `gcloud logging read` の
// エクスポート、Azure 時代の docker ログでも行形式は同じ）。このスクリプト自体は
// ファイル／標準入力しか見ない。
// 個人の追跡はしない: visitor は日替わりハッシュで、日をまたいだ名寄せはできない（意図的）。
import * as fs from "node:fs"

const TAG = "#MATCH"

interface Row {
    time: string
    event: string // queued | matched | left
    visitor: string
    detail: Map<string, string>
}

function parse(text: string): Row[] {
    const rows: Row[] = []
    for (const line of text.split("\n")) {
        const at = line.indexOf(TAG)
        if (at < 0) continue
        // ホスティング側のログは各行の先頭に自前のタイムスタンプ等を足すので、タグ以降だけを見る
        const [, time, event, visitor, detailRaw] = line.slice(at).split("\t")
        if (!time || !event || !visitor) continue
        const detail = new Map<string, string>()
        for (const token of (detailRaw ?? "").trim().split(/\s+/)) {
            const eq = token.indexOf("=")
            if (eq > 0) detail.set(token.slice(0, eq), token.slice(eq + 1))
        }
        rows.push({ time, event, visitor, detail })
    }
    return rows
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!
}

function fmtSec(ms: number): string {
    return `${(ms / 1000).toFixed(1)}秒`
}

interface DayStats {
    queued: number
    matched: number
    left: number
    leftReasons: Map<string, number>
    matchedWaits: number[]
    leftWaits: number[]
    queuedVisitors: Set<string>
    matchedVisitors: Set<string>
    byHourJst: Map<number, { queued: number; matched: number }>
}

function emptyDay(): DayStats {
    return {
        queued: 0,
        matched: 0,
        left: 0,
        leftReasons: new Map(),
        matchedWaits: [],
        leftWaits: [],
        queuedVisitors: new Set(),
        matchedVisitors: new Set(),
        byHourJst: new Map(),
    }
}

function main(): void {
    const files = process.argv.slice(2)
    const text =
        files.length > 0
            ? files.map((f) => fs.readFileSync(f, "utf8")).join("\n")
            : fs.readFileSync(0, "utf8")
    const rows = parse(text)
    if (rows.length === 0) {
        console.log("#MATCH 行が見つかりませんでした。")
        console.log("計測を入れたバージョンがまだデプロイされていないか、ログの範囲外の可能性があります。")
        return
    }

    const byDay = new Map<string, DayStats>()
    for (const row of rows) {
        const day = row.time.slice(0, 10)
        const cur = byDay.get(day) ?? emptyDay()
        // 時間帯は JST で見る（ログの時刻は UTC）
        const hourJst = (Number(row.time.slice(11, 13)) + 9) % 24
        const hour = cur.byHourJst.get(hourJst) ?? { queued: 0, matched: 0 }
        if (row.event === "queued") {
            cur.queued += 1
            cur.queuedVisitors.add(row.visitor)
            hour.queued += 1
        } else if (row.event === "matched") {
            cur.matched += 1
            cur.matchedVisitors.add(row.visitor)
            hour.matched += 1
            const wait = Number(row.detail.get("wait_ms"))
            if (Number.isFinite(wait)) cur.matchedWaits.push(wait)
        } else if (row.event === "left") {
            cur.left += 1
            const reason = row.detail.get("reason") ?? "unknown"
            cur.leftReasons.set(reason, (cur.leftReasons.get(reason) ?? 0) + 1)
            const wait = Number(row.detail.get("wait_ms"))
            if (Number.isFinite(wait)) cur.leftWaits.push(wait)
        }
        cur.byHourJst.set(hourJst, hour)
        byDay.set(day, cur)
    }

    for (const day of [...byDay.keys()].sort()) {
        const s = byDay.get(day)!
        const resolved = s.matched + s.left
        const rate = resolved > 0 ? ((s.matched / resolved) * 100).toFixed(1) : "-"
        const waits = [...s.matchedWaits].sort((a, b) => a - b)
        const avg = waits.length > 0 ? waits.reduce((a, b) => a + b, 0) / waits.length : 0
        console.log("")
        console.log(`■ ${day}`)
        console.log(
            `  待機開始 ${s.queued}件（${s.queuedVisitors.size}人） / 成立 ${s.matched}人（${s.matchedVisitors.size}人） / 離脱 ${s.left}件`,
        )
        console.log(`  成立率（解決した待機のうち成立）: ${rate}%`)
        if (waits.length > 0) {
            console.log(
                `  成立までの待機時間: 中央値 ${fmtSec(percentile(waits, 50))} / 平均 ${fmtSec(avg)} / 90%点 ${fmtSec(percentile(waits, 90))}`,
            )
        }
        if (s.leftReasons.size > 0) {
            const parts = [...s.leftReasons.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([reason, n]) => `${reason} ${n}`)
            console.log(`  離脱理由: ${parts.join(" / ")}`)
            const leftWaits = [...s.leftWaits].sort((a, b) => a - b)
            if (leftWaits.length > 0) {
                console.log(`  離脱までの待機時間: 中央値 ${fmtSec(percentile(leftWaits, 50))}`)
            }
        }
        const busyHours = [...s.byHourJst.entries()]
            .filter(([, v]) => v.queued > 0 || v.matched > 0)
            .sort((a, b) => a[0] - b[0])
        if (busyHours.length > 0) {
            console.log("  時間帯（JST）: " + busyHours.map(([h, v]) => `${h}時 待${v.queued}/成${v.matched}`).join("  "))
        }
    }
    console.log("")
    console.log(`集計対象: ${rows.length}行`)
}

main()
