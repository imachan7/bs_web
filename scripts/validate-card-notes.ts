// data/card-notes.json（カードごとの実装状況の注意書き）の検査。
// cards.json は fs 読み込みで型検査の外にあるため、こちらの検査が唯一の守りになる。
//   npx tsx scripts/validate-card-notes.ts
import * as fs from "node:fs"
import * as path from "node:path"
import { loadAllCards } from "../data/loadCards"

const NOTES_PATH = path.resolve(__dirname, "../data/card-notes.json")

const STATUSES = ["unimplemented", "partial", "simplified"] as const
type Status = (typeof STATUSES)[number]

interface Note {
    status: Status
    note: string
}
interface NotesFile {
    version: number
    notes: Record<string, Note>
}

interface CardLike {
    cardId: string
    name: string
    effect?: string
    effects?: unknown[]
}

const problems: string[] = []
const add = (cardId: string, message: string): void => {
    problems.push(`${cardId}: ${message}`)
}

const cards = loadAllCards() as unknown as CardLike[]
const byId = new Map(cards.map((c) => [c.cardId, c]))
const notesFile = JSON.parse(fs.readFileSync(NOTES_PATH, "utf-8")) as NotesFile

if (notesFile.version !== 1) problems.push(`version が 1 ではありません（${notesFile.version}）`)

for (const [cardId, note] of Object.entries(notesFile.notes)) {
    const card = byId.get(cardId)
    // cardId のハードコードは過去に全面的にズレた事故があるので、実在を必ず機械検証する
    if (!card) {
        add(cardId, "data/cards/*.json に存在しない cardId です")
        continue
    }
    if (!STATUSES.includes(note.status)) {
        add(cardId, `status が不正です（${note.status}）。${STATUSES.join(" / ")} のいずれか`)
    }
    if (typeof note.note !== "string" || note.note.trim().length < 10) {
        add(cardId, "note は10文字以上の説明文にしてください（対戦者が読む文面です）")
    } else if (note.note.length > 140) {
        add(cardId, `note が長すぎます（${note.note.length}文字。140文字まで）`)
    } else if (!note.note.endsWith("。")) {
        add(cardId, "note は句点「。」で終えてください")
    }
    const structured = (card.effects ?? []).length > 0
    if (note.status === "unimplemented" && structured) {
        add(cardId, "status:unimplemented ですが effects が構造化済みです（partial / simplified では？）")
    }
    if (note.status !== "unimplemented" && !structured) {
        add(cardId, `status:${note.status} ですが effects が空です（unimplemented では？）`)
    }
}

// 効果文があるのに構造化が1件も無いカードは、必ず unimplemented として載っていなければならない。
// これを検査しておくと、新しい弾を入れたときの載せ忘れが止まる
for (const card of cards) {
    const hasText = (card.effect ?? "").trim() !== ""
    const structured = (card.effects ?? []).length > 0
    if (!hasText || structured) continue
    const note = notesFile.notes[card.cardId]
    if (!note) {
        add(card.cardId, `${card.name}: 効果文があるのに構造化0件です。card-notes.json に unimplemented として載せてください`)
    } else if (note.status !== "unimplemented") {
        add(card.cardId, `${card.name}: 構造化0件なので status は unimplemented であるべきです（現在 ${note.status}）`)
    }
}

const counts = STATUSES.map((s) => `${s}=${Object.values(notesFile.notes).filter((n) => n.status === s).length}`)
console.log(`  注意書き: ${Object.keys(notesFile.notes).length}件（${counts.join(" / ")}）`)

if (problems.length > 0) {
    console.error(`\n${problems.length}件の問題があります:`)
    for (const p of problems) console.error(`  ❌ ${p}`)
    process.exit(1)
}
console.log("問題は見つかりませんでした ✅")
