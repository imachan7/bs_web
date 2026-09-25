// ヘルパーの索引 docs/CODEMAP.md を作る（npm run codemap）。--check は作り直した内容と差があれば落とす（CI 用）。
// 実装役が「そのヘルパーはどのファイルにあるか」を grep で探し回る手間を減らすため（REFACTOR_PLAN §0 の A・R2）。
// 行番号は入れない：1行足すたびに索引が変わり、並行する PR が毎回ここでぶつかるため（ファイルが分かれば grep で届く）
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOTS = ["shared", "server/src", "public/src"]
const OUT = "docs/CODEMAP.md"

function walk(dir: string): string[] {
    return readdirSync(dir)
        .sort()
        .flatMap((name) => {
            const p = join(dir, name)
            return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []
        })
}

// export の直前に続く // コメントの1行目（無ければ空）
function leadingComment(lines: string[], i: number): string {
    let j = i - 1
    while (j >= 0 && lines[j]!.trim().startsWith("//")) j--
    const first = lines[j + 1]
    if (j + 1 >= i || first === undefined) return ""
    const text = first.trim().replace(/^\/\/\s?/, "")
    return text.length > 90 ? text.slice(0, 90) + "…" : text
}

const out: string[] = [
    "# ヘルパーの索引（自動生成：`npm run codemap`。手で編集しない）",
    "",
    "export されている関数・定数・型の置き場。名前で引いて、ファイルが分かったら `grep -n` で行に届く。",
    "",
]
for (const file of ROOTS.flatMap(walk)) {
    const lines = readFileSync(file, "utf8").split("\n")
    const rows: string[] = []
    lines.forEach((line, i) => {
        const m = /^export (?:async )?(function|const|let|type|interface|class|enum) (\w+)/.exec(line)
        if (!m) return
        const kind = m[1] === "function" ? "fn" : m[1] === "type" || m[1] === "interface" ? "型" : m[1]
        const comment = leadingComment(lines, i)
        rows.push(`- \`${m[2]}\`（${kind}）${comment ? "：" + comment : ""}`)
    })
    if (rows.length === 0) continue
    out.push(`## ${file}`, "", ...rows, "")
}
const text = out.join("\n")

if (process.argv.includes("--check")) {
    let current = ""
    try {
        current = readFileSync(OUT, "utf8")
    } catch {
        // 無ければ差がある扱い
    }
    if (current !== text) {
        console.error(`${OUT} が古い。npm run codemap で作り直してコミットすること`)
        process.exit(1)
    }
    console.log(`${OUT} は最新です ✅`)
} else {
    writeFileSync(OUT, text)
    console.log(`${OUT} を書き出しました（${out.filter((l) => l.startsWith("- ")).length} 件）`)
}
