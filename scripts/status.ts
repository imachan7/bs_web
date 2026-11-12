// 本番サーバーの状態を見る・更新のお知らせを出す（server/src/admin.ts の口を叩く）。
//
//   npm run status                    … 対戦中のルームなどを表示
//   npm run status -- notice "文面"   … 接続中の全員にお知らせを出す
//   npm run status -- notice --clear  … お知らせを消す
//   npm run status -- wait 20         … 対戦中のルームが無くなるまで最大20分待つ（無くなれば 0、時間切れなら 1 で終わる。デプロイ前の待機用）
//
// 鍵は環境変数 BS_ADMIN_KEY か ~/.config/bs_web_admin_key（中身を表示しない）。宛先は BS_URL（既定は本番）
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

const BASE = process.env.BS_URL ?? "https://bs-web-battle.app"

function adminKey(): string {
    const fromEnv = process.env.BS_ADMIN_KEY?.trim()
    if (fromEnv) return fromEnv
    const file = path.join(os.homedir(), ".config", "bs_web_admin_key")
    try {
        return fs.readFileSync(file, "utf-8").trim()
    } catch {
        console.error(`鍵がありません。環境変数 BS_ADMIN_KEY か ${file} に置いてください`)
        process.exit(2)
    }
}

interface Status {
    revision: string
    uptimeMin: number
    sockets: number
    queue: number
    notice: string | null
    blocking: number
    rooms: { room: string; kind: string; state: string; turn: number | null; humans: number; idleMin: number; blocking: boolean }[]
}

async function call(method: "GET" | "POST", p: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${BASE}${p}`, {
        method,
        headers: { "x-admin-key": adminKey(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    if (res.status === 404) throw new Error("404：鍵が違うか、サーバーに ADMIN_KEY が設定されていません")
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    return res.json()
}

function print(s: Status): void {
    console.log(`リビジョン ${s.revision}／起動から${s.uptimeMin}分／接続 ${s.sockets}／ランダムマッチ待ち ${s.queue}`)
    console.log(`お知らせ：${s.notice ?? "（なし）"}`)
    console.log(`デプロイを待つべき対局：${s.blocking}件`)
    for (const r of s.rooms) {
        console.log(`  ${r.blocking ? "●" : "○"} ${r.kind.padEnd(5)} ${r.state.padEnd(8)} ターン${r.turn ?? "-"} 人間${r.humans} 最終操作${r.idleMin}分前  ${r.room}`)
    }
    if (s.rooms.length === 0) console.log("  （ルームなし）")
}

async function main(): Promise<void> {
    const [cmd, arg] = process.argv.slice(2)
    if (cmd === undefined) {
        print((await call("GET", "/api/admin/status")) as Status)
        return
    }
    if (cmd === "notice") {
        const message = arg === "--clear" ? null : arg
        if (message === undefined) throw new Error("文面か --clear を渡してください")
        console.log(JSON.stringify(await call("POST", "/api/admin/notice", { message })))
        return
    }
    if (cmd === "wait") {
        const maxMin = Number(arg ?? 20)
        const until = Date.now() + maxMin * 60_000
        for (;;) {
            const s = (await call("GET", "/api/admin/status")) as Status
            if (s.blocking === 0) {
                console.log("対戦中のルームはありません")
                return
            }
            if (Date.now() >= until) {
                console.error(`${maxMin}分待っても対戦中のルームが残っています（${s.blocking}件）`)
                process.exit(1)
            }
            console.log(`対戦中 ${s.blocking}件。30秒後にもう一度見ます`)
            await new Promise((r) => setTimeout(r, 30_000))
        }
    }
    throw new Error(`不明なコマンド：${cmd}`)
}

main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
})
