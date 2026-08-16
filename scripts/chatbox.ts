// エージェント間連絡（chatbox）の運用CLI。
//
// **なぜ必要か**: 以前は chatbox.md 1ファイルへの追記式で、86件・260KB まで肥大化していた。
// エージェントは起動のたびに全履歴を読むため、それだけで7〜8万トークンを消費していた。
// 1メッセージ1ファイルに分け、常時読むのは INDEX.md だけにする。
//
// INDEX.md は active/ から**生成される**。手で編集せず、壊れたら `index` で作り直す。
//
// **保管場所はリポジトリの外**（2026-08-16 に移した）。既定は `../bs_web-chatbox`＝
// bs_web と bs_web-ui の**兄弟ディレクトリ**なので、どちらのクローンから叩いても同じ受信箱になる。
// git 管理をやめた理由は、受信箱をブランチに載せると壊れるため:
//   - ブランチが違うとメッセージのファイルがそもそも存在しない（実装担当とUI担当が
//     2日間連絡できなかった原因。2026-08-13〜16）
//   - マージでメッセージが復活・消失する
//   - 連絡のたびにコミットが増える（54件たまっていた）
// 別の場所に置きたいときは環境変数 BS_CHATBOX_DIR で上書きする。
//
// 使い方:
//   npx tsx scripts/chatbox.ts inbox 実装担当
//   npx tsx scripts/chatbox.ts new --from 実装担当 --to UI担当 --title "件名"
//   npx tsx scripts/chatbox.ts done 2026-07-31-1500
//   npx tsx scripts/chatbox.ts index
import * as fs from "node:fs"
import * as path from "node:path"

const ROOT = path.resolve(__dirname, "..")
// リポジトリの外に置く（上のコメント参照）。bs_web / bs_web-ui のどちらから見ても同じ場所を指す
const CHATBOX_DIR = process.env.BS_CHATBOX_DIR ?? path.resolve(ROOT, "..", "bs_web-chatbox")
const ACTIVE_DIR = path.join(CHATBOX_DIR, "active")
const ARCHIVE_DIR = path.join(CHATBOX_DIR, "archive")
const INDEX_PATH = path.join(CHATBOX_DIR, "INDEX.md")

// 役割の正規名 → ファイル名用スラッグ／INDEX 用の短縮名
const ROLES: { name: string; slug: string; short: string; aliases: string[] }[] = [
    { name: "実装担当", slug: "impl", short: "実装", aliases: ["impl", "実装", "claude"] },
    { name: "設計担当", slug: "design", short: "設計", aliases: ["design", "設計"] },
    { name: "UI担当", slug: "ui", short: "UI", aliases: ["ui", "gemini", "ui担当(gemini)"] },
]

const STATUSES = ["依頼中", "作業中", "完了"]

type Msg = {
    id: string
    from: string
    to: string
    title: string
    status: string
    body: string
    file: string
}

// 「UI担当(Gemini)」のような表記ゆれを正規名に寄せる。未知の役割はそのまま通す
function normalizeRole(input: string): string {
    const lower = input.trim().toLowerCase()
    for (const role of ROLES) {
        if (role.name === input.trim()) return role.name
        if (role.aliases.includes(lower)) return role.name
        if (lower.includes(role.slug) || input.includes(role.short)) return role.name
    }
    return input.trim()
}

function roleOf(name: string) {
    return ROLES.find((r) => r.name === name)
}

function slugOf(name: string): string {
    return roleOf(name)?.slug ?? "other"
}

function shortOf(name: string): string {
    return roleOf(name)?.short ?? name
}

// フロントマターの簡易パーサ（key: value のみ。値に : が含まれても最初の : で切る）
function parseMessage(file: string): Msg | null {
    const text = fs.readFileSync(path.join(ACTIVE_DIR, file), "utf8")
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (!m) {
        console.error(`⚠️  フロントマターがありません: ${path.join(ACTIVE_DIR, file)}`)
        return null
    }
    const [, frontText = "", body = ""] = m
    const front: Record<string, string> = {}
    for (const line of frontText.split(/\r?\n/)) {
        const sep = line.indexOf(":")
        if (sep < 0) continue
        front[line.slice(0, sep).trim()] = line.slice(sep + 1).trim()
    }
    return {
        id: front.id ?? file.replace(/\.md$/, ""),
        from: front.from ?? "?",
        to: front.to ?? "?",
        title: front.title ?? "(件名なし)",
        status: front.status ?? "依頼中",
        body,
        file,
    }
}

function readActive(): Msg[] {
    if (!fs.existsSync(ACTIVE_DIR)) return []
    return fs
        .readdirSync(ACTIVE_DIR)
        .filter((f) => f.endsWith(".md"))
        .map(parseMessage)
        .filter((m): m is Msg => m !== null)
        .sort((a, b) => a.id.localeCompare(b.id))
}

function writeIndex(): number {
    const msgs = readActive()
    const lines = [
        "# chatbox INDEX",
        "",
        "やりとり中のメッセージ一覧。**このファイルは同じ階層の `active/` から自動生成される**ので、",
        "手で編集しない（壊れたら `npx tsx scripts/chatbox.ts index` で作り直す）。",
        "",
        "運用ルールは [README.md](./README.md)、確定した判断はリポジトリの `DECISIONS.md`。",
        "",
        "この受信箱は**リポジトリの外**（既定 `develop/bs_web-chatbox`）にある。ブランチやクローンが違っても",
        "同じ場所を見るため。git 管理していた頃は、ブランチが違うとメッセージが届かなかった。",
        "",
    ]
    if (msgs.length === 0) {
        lines.push("やりとり中のメッセージはありません。")
    } else {
        lines.push("| id | from→to | 件名 | 状態 |")
        lines.push("| :-- | :-- | :-- | :-- |")
        for (const m of msgs) {
            lines.push(`| ${m.id} | ${shortOf(m.from)}→${shortOf(m.to)} | ${m.title} | ${m.status} |`)
        }
    }
    lines.push("")
    fs.writeFileSync(INDEX_PATH, lines.join("\n"), "utf8")
    return msgs.length
}

// id は YYYY-MM-DD-HHMM。同じ分に2件作った場合は空いている分まで進める
function nextId(): string {
    const now = new Date()
    const used = new Set(readActive().map((m) => m.id))
    for (let i = 0; i < 60; i++) {
        const d = new Date(now.getTime() + i * 60_000)
        const id =
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` +
            `-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`
        if (!used.has(id)) return id
    }
    throw new Error("id を採番できませんでした")
}

function parseFlags(argv: string[]): Record<string, string> {
    const flags: Record<string, string> = {}
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (!arg || !arg.startsWith("--")) continue
        const key = arg.slice(2)
        const value = argv[i + 1]
        if (value === undefined || value.startsWith("--")) {
            console.error(`❌ --${key} に値がありません`)
            process.exit(1)
        }
        flags[key] = value
        i++
    }
    return flags
}

function cmdIndex() {
    const n = writeIndex()
    console.log(`✅ chatbox/INDEX.md を再生成しました（${n}件）`)
}

function cmdInbox(roleArg: string | undefined) {
    if (!roleArg) {
        console.error("❌ 役割を指定してください: chatbox.ts inbox 実装担当")
        process.exit(1)
    }
    const role = normalizeRole(roleArg)
    const msgs = readActive().filter((m) => normalizeRole(m.to) === role && m.status !== "完了")
    if (msgs.length === 0) {
        console.log(`📭 ${role} 宛の未処理メッセージはありません`)
        return
    }
    console.log(`📬 ${role} 宛の未処理メッセージ ${msgs.length}件:`)
    for (const m of msgs) {
        console.log(`  [${m.status}] ${m.id} ${normalizeRole(m.from)}→${role} : ${m.title}`)
        console.log(`           ${path.join(ACTIVE_DIR, m.file)}`)
    }
}

function requireFlag(flags: Record<string, string>, key: string): string {
    const value = flags[key]
    if (!value) {
        console.error(`❌ --${key} が必要です: chatbox.ts new --from 実装担当 --to UI担当 --title "件名"`)
        process.exit(1)
    }
    return value
}

function cmdNew(flags: Record<string, string>) {
    const from = normalizeRole(requireFlag(flags, "from"))
    const to = normalizeRole(requireFlag(flags, "to"))
    const title = requireFlag(flags, "title")
    const status = flags.status && STATUSES.includes(flags.status) ? flags.status : "依頼中"
    const id = nextId()
    const file = `${id}-${slugOf(from)}-to-${slugOf(to)}.md`
    const content = [
        "---",
        `id: ${id}`,
        `from: ${from}`,
        `to: ${to}`,
        `title: ${title}`,
        `status: ${status}`,
        "---",
        "",
        "（本文。4KB / 60行以内に収める。長い設計・調査結果は別ドキュメントにして参照リンクを張る）",
        "",
        "## 返信",
        "",
    ].join("\n")
    fs.writeFileSync(path.join(ACTIVE_DIR, file), content, "utf8")
    writeIndex()
    console.log(`✅ 作成しました: ${path.join(ACTIVE_DIR, file)}`)
}

function cmdDone(id: string | undefined) {
    if (!id) {
        console.error("❌ id を指定してください: chatbox.ts done 2026-07-31-1500")
        process.exit(1)
    }
    const msg = readActive().find((m) => m.id === id)
    if (!msg) {
        console.error(`❌ ${ACTIVE_DIR} に id=${id} のメッセージがありません`)
        process.exit(1)
    }
    // アーカイブは月次1ファイル。既存 archive の書式（## [送り手→受け手] 日付 — 見出し）に揃える
    const month = msg.id.slice(0, 7)
    const date = msg.id.slice(0, 10)
    const archivePath = path.join(ARCHIVE_DIR, `${month}.md`)
    const entry = `\n## [${msg.from}→${msg.to}] ${date} — ${msg.title}\n\n状態: 完了\n${msg.body.trimEnd()}\n`
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true })
    if (fs.existsSync(archivePath)) fs.appendFileSync(archivePath, entry, "utf8")
    else fs.writeFileSync(archivePath, `# chatbox アーカイブ ${month}\n${entry}`, "utf8")
    fs.unlinkSync(path.join(ACTIVE_DIR, msg.file))
    writeIndex()
    console.log(`✅ 完了にしました: ${msg.id} → chatbox/archive/${month}.md`)
    console.log("   残すべき結論があれば DECISIONS.md へ1〜3行で転記してください")
}

function main() {
    const [cmd, ...rest] = process.argv.slice(2)
    fs.mkdirSync(ACTIVE_DIR, { recursive: true })
    switch (cmd) {
        case "inbox":
            cmdInbox(rest[0])
            break
        case "new":
            cmdNew(parseFlags(rest))
            break
        case "done":
            cmdDone(rest[0])
            break
        case "index":
            cmdIndex()
            break
        default:
            console.log("使い方:")
            console.log("  npx tsx scripts/chatbox.ts inbox <役割>                      自分宛の未処理を一覧")
            console.log("  npx tsx scripts/chatbox.ts new --from <役割> --to <役割> --title <件名>")
            console.log("  npx tsx scripts/chatbox.ts done <id>                        完了にしてアーカイブへ")
            console.log("  npx tsx scripts/chatbox.ts index                            INDEX.md を再生成")
            process.exit(cmd ? 1 : 0)
    }
}

main()
