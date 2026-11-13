// 効果文の見出し（『このスピリットのアタック時』『ブロック時』）と、結果連動型の誘発エントリの heading タグを突き合わせる。
// onBattleWin などは『アタック時』の効果か『バトル時』の効果かがデータの形から分からないため、タグで持つ（HANDOFF §1。#505）。
// ずれは常に0件を保つ（ベースラインを持たない）。新しい弾のデータでタグを書き忘れるとここで落ちる。
import { loadAllCards } from "../data/loadCards"

type Heading = "attack" | "block" | "attackOrBlock"
const RESULT_TRIGGERS = new Set(["onBattleWin", "onBattleLose", "onBlocked", "onUnblocked", "onLifeDealt", "onBattleEnd", "onBattleStart"])

// 効果文から機械的に見出しが決まらないエントリを、読んで決めたもの。値は正しいタグ（null＝タグを付けない）
const VERIFIED: Record<string, Heading | null> = {
    "BS14-033-e1": null, // 『バトル時』の「バトルしている相手のスピリットを破壊したとき」（同じ本文が『アタック時』にもある）
    "BS14-033-e2": "attack",
    "BS23-043-e4": "attack", // 与える効果の“”の中に見出しがある（自身への付与のエントリ）
}

function headingKind(text: string): Heading | "other" {
    const a = text.includes("アタック")
    const b = text.includes("ブロック")
    return a && b ? "attackOrBlock" : a ? "attack" : b ? "block" : "other"
}

// 見出しの行（『』を含み句点で終わらない短い行）で効果文を区切る
function blocks(effect: string): { heading: Heading | "other"; body: string }[] {
    const out: { heading: Heading | "other"; body: string }[] = []
    for (const line of effect.split("\n")) {
        const heads = [...line.matchAll(/『([^』]*)』/g)].map((m) => m[1]!)
        if (heads.length > 0 && line.length < 60 && !line.endsWith("。")) out.push({ heading: headingKind(heads.join(" ")), body: "" })
        else if (out.length > 0) out[out.length - 1]!.body += line
    }
    return out
}

// 本文の条件から、どの誘発として書かれるかを推す
function triggersOf(body: string): Set<string> {
    const s = new Set<string>()
    if (body.includes("ブロックされなかったとき")) s.add("onUnblocked")
    if (/ブロックされたとき|ブロック(を)?宣言したとき/.test(body)) s.add("onBlocked")
    if (body.includes("ライフを減らしたとき")) s.add("onLifeDealt")
    if (/BPを比べ.*?破壊(した|された)?とき|バトルしている相手のスピリットを破壊したとき/.test(body)) s.add("onBattleWin")
    if (body.includes("バトル終了時")) s.add("onBattleEnd")
    return s
}

const problems: string[] = []
for (const card of loadAllCards()) {
    const bl = blocks(card.effect ?? "")
    for (const e of card.effects) {
        if (e.kind !== "triggered" || !RESULT_TRIGGERS.has(e.trigger)) continue
        const actual = e.heading ?? null
        let expected: Heading | null
        if (e.id in VERIFIED) expected = VERIFIED[e.id]!
        else {
            const kinds = new Set(bl.filter((b) => triggersOf(b.body).has(e.trigger)).map((b) => b.heading))
            if (kinds.size === 0) {
                // 本文から当たりが付かない：タグを付けていなければ『バトル時』等として扱う。付けていれば VERIFIED へ
                if (actual !== null) problems.push(`${e.id}：heading "${actual}" が付いているが効果文から確かめられない（読んで VERIFIED に登録する）`)
                continue
            }
            if (kinds.size > 1) {
                problems.push(`${e.id}：効果文の見出しが1つに決まらない（${[...kinds].join("／")}）。読んで VERIFIED に登録する`)
                continue
            }
            const k = [...kinds][0]!
            expected = k === "other" ? null : k
        }
        if (actual !== expected) problems.push(`${e.id}（${card.name}）：効果文の見出しは ${expected ?? "タグなし"}、データは ${actual ?? "タグなし"}`)
    }
}

if (problems.length > 0) {
    for (const p of problems) console.log(`  ❌ ${p}`)
    console.log(`見出しのタグのずれ ${problems.length}件`)
    process.exit(1)
}
console.log("見出しのタグは効果文と一致しています ✅")
