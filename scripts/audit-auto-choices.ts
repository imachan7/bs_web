// 「対戦者が選ぶべき場面を、実装が勝手に決めていないか」の棚卸し。
//
// docs/design/PROCEDURES_AUDIT.md §5 の一般則（2026-09-02 ユーザー確定）:
//   効果文が「選ぶ」と書いているなら、候補が2つ以上あるとき実装も選ばせる。
//
// §4 にはかつて手書きの一覧（44件）があったが、直すたびに古くなった。
// ここで機械的に数え直す。**この出力が一次資料**で、文書は方針だけを持つ。
//
// 判定：ハンドラの本体（と、そこから呼ぶ関数を推移的にたどった先）に
// 「聞く経路」（interactiveTargets / requestChoice / requestCardChoice / suspend）が
// 1つも無ければ「自動」とみなし、**効果文に選択の語があるカード**で使われていれば挙げる。
//
// ⚠️ 完全ではない：
//   - ctx.resolve で別アクションへ委譲している場合は追えない（destroy へ委譲する類は誤検出）
//   - マジックの対象はクライアントが先取りする種別がある（renderer.ts の magicTargetSide）
//   - 効果文の選択の語が、別の節（フラッシュ効果など）のものかは区別できない
// 挙がったものは1件ずつ読んで判断すること。潰したものは減っていく。
import { readFileSync, readdirSync } from "node:fs"
import { loadAllCards } from "../data/loadCards"

const files = [
    ...readdirSync("server/src/logic/actions").map((f) => `server/src/logic/actions/${f}`),
    ...readdirSync("server/src/logic").filter((f) => f.endsWith(".ts")).map((f) => `server/src/logic/${f}`),
].filter((f) => f.endsWith(".ts"))

type Fn = { name: string; file: string; line: number; body: string; type?: string }
const fns: Fn[] = []
for (const f of files) {
    const src = readFileSync(f, "utf8")
    // **行頭（インデント無し）の宣言だけ**を関数の境界にする。
    // 途中の const をすべて境界にすると本体が数行に切れ、聞く経路を見落とす
    const re = /^(?:export )?(?:const (\w+)(?:: ActionHandler<"(\w+)">)?\s*[:=]|(?:async )?function (\w+)\s*[(<])/gm
    const hits: { name: string; type?: string; at: number }[] = []
    let m
    while ((m = re.exec(src)) !== null) {
        const name = m[1] ?? m[3]
        if (!name) continue
        hits.push({ name, ...(m[2] ? { type: m[2] } : {}), at: m.index })
    }
    for (let i = 0; i < hits.length; i++) {
        const h = hits[i]!
        fns.push({
            name: h.name, file: f, line: src.slice(0, h.at).split("\n").length,
            body: src.slice(h.at, hits[i + 1]?.at ?? src.length), ...(h.type ? { type: h.type } : {}),
        })
    }
}
const ASK = /interactiveTargets|requestChoice|requestCardChoice|requestActivationConfirm|suspend\(/
const interactive = new Set<string>()
for (const fn of fns) if (ASK.test(fn.body)) interactive.add(fn.name)
// ヘルパー越しの選択も追う（tryInteractiveTargetChoice / budgetToggleDestroy 等）
for (let pass = 0; pass < 5; pass++) {
    let grew = false
    for (const fn of fns) {
        if (interactive.has(fn.name)) continue
        for (const name of interactive) {
            if (new RegExp(`\\b${name}\\s*\\(`).test(fn.body)) { interactive.add(fn.name); grew = true; break }
        }
    }
    if (!grew) break
}
const autoTypes = new Map(
    fns.filter((f) => f.type !== undefined && !interactive.has(f.name))
        .map((f) => [f.type!, `${f.file.split("/").pop()}:${f.line}`]),
)

const CHOICE = /(選び|選ぶ|選んで|好きな|指定する|1体を|1つを|1枚を|好きな順番)/
const perType = new Map<string, string[]>()
for (const c of loadAllCards()) {
    if (!CHOICE.test(c.effect ?? "")) continue
    const seen = new Set<string>()
    const walk = (v: unknown): void => {
        if (Array.isArray(v)) { v.forEach(walk); return }
        if (v && typeof v === "object") {
            const o = v as Record<string, unknown>
            if (typeof o.type === "string" && autoTypes.has(o.type)) seen.add(o.type)
            Object.values(o).forEach(walk)
        }
    }
    walk(c.effects)
    for (const t of seen) perType.set(t, [...(perType.get(t) ?? []), c.cardId])
}
const rows = [...perType.entries()]
    .map(([t, ids]) => ({ t, ids, at: autoTypes.get(t)! }))
    .sort((a, b) => b.ids.length - a.ids.length)
console.log(`聞く経路が1つも無いハンドラ：${rows.length}種（選択の語を含む効果文のカードで使われているもの）`)
for (const r of rows) {
    console.log(`${String(r.ids.length).padStart(3)}枚  ${r.t.padEnd(36)} ${r.at.padEnd(26)} ${r.ids.slice(0, 6).join(" ")}`)
}
console.log("\n※ 誤検出を含む（先頭のコメント参照）。1件ずつ読んで判断すること。")
