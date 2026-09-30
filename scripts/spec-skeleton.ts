// 効果文→期待値レコードの「下ごしらえ」と「合成」（docs/design/EFFECT_SPEC_RULES.md §3）。
// 文字列だけで決まる欄はここで埋め、AI（Haiku）には残りを一覧からの選択式で埋めさせる。
//   skeleton: npx tsx scripts/spec-skeleton.ts skeleton <入力.json> <骨組み.json>
//   merge:    npx tsx scripts/spec-skeleton.ts merge <骨組み.json> <AIの選択.json> <最終.json>
import { readFileSync, writeFileSync } from "node:fs"

type Skeleton = {
    text: string
    levels: number[] | null
    whileCombined: boolean
    header: string | null
    actor: "owner" | "opponent" | "turnPlayer"
    optional: boolean
    keywordOnly: boolean
    trigger: { kind: string; event: string | null; subject: string | null }
}

const EVENT_PATTERNS: [RegExp, string][] = [
    [/疲労した/, "疲労した"], [/召喚された/, "召喚された"], [/配置された/, "配置された"],
    [/ブロックされた/, "ブロックされた"], [/ブロックした/, "ブロックした"], [/アタックした/, "アタックした"],
    [/破壊された/, "破壊された"], [/回復した/, "回復した"], [/手札に戻った/, "手札に戻った"],
    [/ドロー(した|する)/, "ドローした"], [/ライフが減った/, "ライフが減った"], [/合体した/, "合体した"],
    [/マジックを使用した/, "マジックを使用した"], [/バーストをセットした/, "バーストをセットした"],
    [/バトルに勝った/, "バトルに勝った"], [/バトルに負けた/, "バトルに負けた"],
    [/コアが置かれた/, "コアが置かれた"], [/コアが取り除かれた/, "コアが取り除かれた"],
]

function parseHeader(line: string): { levels: number[] | null; whileCombined: boolean } {
    const lv = [...line.matchAll(/Lv(\d)/g)].map((m) => Number(m[1]))
    return { levels: lv.length ? lv : null, whileCombined: /【合体(時|中)】/.test(line) }
}

const isHeaderLine = (l: string): boolean => /^(【合体(時|中)】)?(Lv\d[･・]?)*(Lv\d)?(『[^』]*』)?$/.test(l.trim()) && /Lv\d|【合体/.test(l)
const isKeywordLine = (l: string): boolean => /^(Lv[\d･・Lv]*)?(フラッシュ)?[：:]?(【[^】]+】)+$/.test(l.trim().replace(/\s/g, ""))

function skeletonOf(text: string): Skeleton[] {
    const out: Skeleton[] = []
    let ctx = { levels: null as number[] | null, whileCombined: false, header: null as string | null }
    for (const raw of text.split("\n")) {
        const line = raw.trim()
        if (!line) continue
        if (isKeywordLine(line)) {
            const h = parseHeader(line)
            out.push({ text: line, levels: h.levels, whileCombined: h.whileCombined, header: null, actor: "owner", optional: false, keywordOnly: true, trigger: { kind: "keyword", event: null, subject: null } })
            continue
        }
        const hdr = line.match(/^((?:【合体(?:時|中)】)?(?:Lv\d[･・]?)*)(『[^』]*』)?(.*)$/)
        let body = line
        if (isHeaderLine(line)) {
            ctx = { ...parseHeader(line), header: line.match(/『[^』]*』/)?.[0] ?? null }
            continue
        }
        if (hdr && (hdr[1] || hdr[2]) && hdr[3]) {
            ctx = { ...parseHeader(hdr[1] ?? ""), header: hdr[2] ?? null }
            body = hdr[3].replace(/^[：:\s]+/, "")
        }
        for (const s of body.split(/(?<=。)/)) {
            const sent = s.trim()
            if (!sent) continue
            out.push(sentenceSkeleton(sent, ctx))
        }
    }
    return out
}

function sentenceSkeleton(sent: string, ctx: { levels: number[] | null; whileCombined: boolean; header: string | null }): Skeleton {
    const cond = sent.match(/^(.*?(?:たとき|するとき|されたとき|した後|したとき))、/)?.[1] ?? null
    const rest = cond ? sent.slice(cond.length + 1) : sent
    let event: string | null = null
    let subject: string | null = null
    let kind = "continuous"
    if (cond) {
        kind = "field"
        for (const [re, ev] of EVENT_PATTERNS) if (re.test(cond)) { event = ev; break }
        if (/お互い/.test(cond)) subject = "any"
        else if (/相手の/.test(cond)) subject = "opponent"
        else if (/自分の|このスピリット/.test(cond)) subject = "own"
    }
    if (ctx.header && /召喚時/.test(ctx.header)) kind = "onSummon"
    else if (ctx.header && /アタック時/.test(ctx.header)) kind = "onAttack"
    else if (!cond && /できる。?$/.test(sent) && /ターンに1回|フラッシュ|アタックステップ/.test(sent + (ctx.header ?? ""))) kind = "activated"
    const actor = /^お互い/.test(rest) ? "turnPlayer" : /^相手は/.test(rest) ? "opponent" : "owner"
    return { text: sent, levels: ctx.levels, whileCombined: ctx.whileCombined, header: ctx.header, actor, optional: /できる。?$/.test(sent), keywordOnly: false, trigger: { kind, event, subject } }
}

const [cmd, a, b, c] = process.argv.slice(2)
if (cmd === "skeleton") {
    const cards = JSON.parse(readFileSync(a!, "utf8")) as { id: string; text: string }[]
    writeFileSync(b!, JSON.stringify(cards.map((x) => ({ id: x.id, clauses: skeletonOf(x.text).map((s, i) => ({ i, ...s })) })), null, 1))
    console.log(`骨組み: ${cards.length}枚 / ${cards.reduce((n, x) => n + skeletonOf(x.text).length, 0)}節`)
} else if (cmd === "merge") {
    const sk = JSON.parse(readFileSync(a!, "utf8")) as { id: string; clauses: (Skeleton & { i: number })[] }[]
    const ai = JSON.parse(readFileSync(b!, "utf8")) as { id: string; clauses: Record<string, any>[] }[]
    const result = sk.map((card) => {
        const chosen = ai.find((x) => x.id === card.id)?.clauses ?? []
        return {
            id: card.id,
            clauses: card.clauses.map((s) => {
                const p = chosen.find((x) => x.i === s.i) ?? {}
                const unc = p.unclassified ?? null
                return {
                    text: s.text, levels: s.levels, whileCombined: s.whileCombined,
                    trigger: { kind: s.trigger.kind, event: p.event ?? s.trigger.event, subject: p.subject ?? s.trigger.subject, subjectFilter: p.subjectFilter ?? null },
                    window: s.header, actor: p.actor ?? s.actor,
                    op: s.keywordOnly ? "なし" : (p.op ?? null),
                    exception: p.exception ?? null, restriction: p.restriction ?? null,
                    target: { ref: s.keywordOnly ? "none" : (p.ref ?? null), filter: p.filter ?? null },
                    amount: p.amount ?? null, cond: p.cond ?? null, link: p.link ?? "none", optional: s.optional,
                    unclassified: unc,
                }
            }),
        }
    })
    writeFileSync(c!, JSON.stringify(result, null, 1))
    console.log(`合成: ${result.length}枚`)
} else {
    console.log("使い方: skeleton <入力> <骨組み> / merge <骨組み> <選択> <最終>")
    process.exit(1)
}
